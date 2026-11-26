import {
  createButtonObject,
  createEmptyProject,
  createId,
  createLayer,
  createScene,
  createShapeObject,
  createSlide,
  normalState,
} from '@vedraopus/model';
import type { Layer, Project, SceneObject, Slide } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { createEngine } from './index';
import type { EngineEvent } from './index';

/** A shape on the timeline from `start` for `duration` seconds. */
function shape(start: number, duration: number | 'untilEnd', name = 'S'): SceneObject {
  const object = createShapeObject({ kind: 'rect' }, {}, name);
  object.timing = { start, duration };
  return object;
}

function slideWith(objects: SceneObject[], duration = 10, title = 'Slide'): Slide {
  const slide = createSlide(title);
  slide.baseLayer.timeline.duration = duration;
  slide.baseLayer.objects.push(...objects);
  return slide;
}

function projectOf(...slides: Slide[]): Project {
  const project = createEmptyProject();
  project.scenes = [{ ...createScene(), slides }];
  return project;
}

function overlay(objects: SceneObject[] = [], duration = 4): Layer {
  const layer = createLayer('Overlay');
  layer.timeline.duration = duration;
  layer.objects.push(...objects);
  return layer;
}

const types = (events: EngineEvent[]) => events.map((e) => e.type);
/**
 * The events an engine sends, apart from the built-in ElapsedSeconds ticking
 * over each second, which every test with a clock would otherwise have to list.
 * It has its own tests below.
 */
function record(engine: ReturnType<typeof createEngine>): EngineEvent[] {
  const events: EngineEvent[] = [];
  engine.on((e) => {
    if (e.type === 'variableChange' && e.variableId.startsWith('builtin:')) return;
    events.push(e);
  });
  return events;
}

describe('the clock and timelines', () => {
  it('advances the playhead by the time between ticks and clamps at the end', () => {
    const engine = createEngine(projectOf(slideWith([], 3)));
    engine.tick(1000); // the first tick only sets the reference
    expect(engine.getView().layers[0]!.playhead).toBe(0);
    engine.tick(1500);
    expect(engine.getView().layers[0]!.playhead).toBe(0.5);
    engine.tick(9000);
    const base = engine.getView().layers[0]!;
    expect(base.playhead).toBe(3);
    expect(base.ended).toBe(true);
  });

  it('ignores a clock that goes backwards and a paused layer', () => {
    const engine = createEngine(projectOf(slideWith([], 10)));
    engine.tick(5000);
    engine.tick(6000);
    engine.tick(4000);
    expect(engine.getView().layers[0]!.playhead).toBe(1);
    engine.tick(5000); // time resumes from the latest reference, 6000
    expect(engine.getView().layers[0]!.playhead).toBe(1);
    const base = engine.getView().layers[0]!.id;
    engine.setPaused(base, true);
    engine.tick(8000);
    expect(engine.getView().layers[0]!.playhead).toBe(1);
    expect(engine.getView().layers[0]!.paused).toBe(true);
    engine.setPaused(base, false);
    engine.tick(9000);
    expect(engine.getView().layers[0]!.playhead).toBe(2);
  });

  it('fires timeline start on entry and timeline end once', () => {
    const slide = slideWith([], 2);
    const engine = createEngine(projectOf(slide));
    const events = record(engine);
    engine.tick(0);
    engine.tick(5000);
    engine.tick(9000);
    expect(types(events)).toEqual(['timelineEnd']);
  });

  it('fires cue points as the playhead crosses them', () => {
    const slide = slideWith([], 10);
    const cue = { id: createId('cue'), name: 'Beat', time: 2 };
    slide.baseLayer.timeline.cuePoints.push(cue);
    const engine = createEngine(projectOf(slide));
    const events = record(engine);
    engine.tick(0);
    engine.tick(1900);
    expect(events).toEqual([]);
    engine.tick(2100);
    expect(events).toEqual([
      { type: 'cuePoint', slideId: slide.id, layerId: slide.baseLayer.id, cuePointId: cue.id },
    ]);
    engine.tick(4000);
    expect(events).toHaveLength(1);
  });
});

describe('object lifecycle', () => {
  it('is on stage in [start, start + duration), firing enter then leave', () => {
    const early = shape(0, 1, 'early');
    const late = shape(2, 2, 'late');
    const slide = slideWith([early, late]);
    const engine = createEngine(projectOf(slide));
    const events = record(engine);
    const onStage = () =>
      engine
        .getView()
        .layers[0]!.objects.filter((o) => o.onStage)
        .map((o) => o.id);
    expect(onStage()).toEqual([early.id]);

    engine.tick(0);
    engine.tick(999);
    expect(onStage()).toEqual([early.id]);
    engine.tick(1000); // exactly at the end of `early`: gone
    expect(onStage()).toEqual([]);
    engine.tick(2000); // exactly at `late`'s start: in
    expect(onStage()).toEqual([late.id]);
    engine.tick(4000);
    expect(onStage()).toEqual([]);
    expect(events.map((e) => [e.type, 'objectId' in e ? e.objectId : null])).toEqual([
      ['objectLeave', early.id],
      ['objectEnter', late.id],
      ['objectLeave', late.id],
    ]);
  });

  it('keeps an until-end object on stage through the final instant', () => {
    const slide = slideWith([shape(1, 'untilEnd')], 5);
    const engine = createEngine(projectOf(slide));
    engine.tick(0);
    engine.tick(5000);
    const base = engine.getView().layers[0]!;
    expect(base.ended).toBe(true);
    expect(base.objects[0]!.onStage).toBe(true);
  });

  it('does not show an object that starts after the timeline ends', () => {
    const engine = createEngine(projectOf(slideWith([shape(20, 1)], 5)));
    engine.tick(0);
    engine.tick(5000);
    expect(engine.getView().layers[0]!.objects[0]!.onStage).toBe(false);
  });

  it('announces what is on stage at the start of a fresh entry', () => {
    const first = shape(0, 'untilEnd');
    const slide = slideWith([first]);
    const engine = createEngine(projectOf(slide));
    const events = record(engine);
    engine.jumpToSlide(slide.id); // re-enter
    expect(types(events)).toEqual(['slideExit', 'slideEnter', 'timelineStart', 'objectEnter']);
  });

  it('seeking fires what it crosses and clamps to the timeline', () => {
    const a = shape(0, 2);
    const b = shape(3, 2);
    const slide = slideWith([a, b], 6);
    const engine = createEngine(projectOf(slide));
    const events = record(engine);
    engine.seek(slide.baseLayer.id, 3.5);
    expect(events.map((e) => e.type)).toEqual(['objectLeave', 'objectEnter']);
    engine.seek(slide.baseLayer.id, 99);
    expect(engine.getView().layers[0]!.playhead).toBe(6);
    expect(engine.getView().layers[0]!.ended).toBe(true);
    engine.seek(slide.baseLayer.id, -5);
    expect(engine.getView().layers[0]!.playhead).toBe(0);
    expect(engine.getView().layers[0]!.ended).toBe(false);
  });
});

describe('navigation', () => {
  const three = () =>
    projectOf(slideWith([], 5, 'A'), slideWith([], 5, 'B'), slideWith([], 5, 'C'));

  it('moves in course order, across scenes, and stops at the ends', () => {
    const project = three();
    const [a, b] = project.scenes[0]!.slides;
    const second = { ...createScene(), slides: [slideWith([], 5, 'D')] };
    project.scenes.push(second);
    const engine = createEngine(project);
    expect(engine.getView()).toMatchObject({ slideId: a!.id, canPrevious: false, canNext: true });
    expect(engine.previous()).toBe(false);
    expect(engine.next()).toBe(true);
    expect(engine.getView().slideId).toBe(b!.id);
    engine.next();
    engine.next();
    expect(engine.getView()).toMatchObject({
      slideId: second.slides[0]!.id,
      slideIndex: 3,
      slideCount: 4,
      canNext: false,
    });
    expect(engine.next()).toBe(false);
    expect(engine.previous()).toBe(true);
  });

  it('jumps to any slide and rejects an unknown one', () => {
    const project = three();
    const c = project.scenes[0]!.slides[2]!;
    const engine = createEngine(project);
    const events = record(engine);
    engine.jumpToSlide(c.id);
    expect(engine.getView().slideId).toBe(c.id);
    expect(types(events).slice(0, 3)).toEqual(['slideExit', 'slideEnter', 'timelineStart']);
    expect(() => engine.jumpToSlide('slide_nope')).toThrow();
  });

  it('moves on by itself when an auto-advance slide ends, but not a user-advance one', () => {
    const auto = slideWith([], 2, 'Auto');
    auto.properties.advance = 'auto';
    const next = slideWith([], 2, 'Next');
    const engine = createEngine(projectOf(auto, next));
    engine.tick(0);
    engine.tick(1500);
    expect(engine.getView().slideId).toBe(auto.id);
    engine.tick(2500);
    expect(engine.getView().slideId).toBe(next.id);
    engine.tick(9000); // the second slide is user-advance and the last
    expect(engine.getView().slideId).toBe(next.id);
  });

  it('copes with a project with no slides', () => {
    const project = createEmptyProject();
    project.scenes = [{ ...createScene(), slides: [] }];
    const engine = createEngine(project);
    expect(engine.getView()).toMatchObject({ slideId: null, slideCount: 0, layers: [] });
    expect(engine.next()).toBe(false);
    expect(() => engine.tick(100)).not.toThrow();
  });

  it('delivers events in order after the operation, even to a listener that navigates', () => {
    const project = three();
    const engine = createEngine(project);
    const seen: string[] = [];
    engine.on((e) => {
      seen.push(e.type);
      if (e.type === 'slideEnter' && engine.getView().slideIndex === 1) engine.next();
    });
    engine.next();
    expect(engine.getView().slideIndex).toBe(2);
    expect(seen.filter((t) => t === 'slideEnter')).toHaveLength(2);
  });
});

describe('revisiting a slide', () => {
  function withButton(onRevisit: 'auto' | 'resume' | 'reset') {
    const button = createButtonObject('Go');
    button.states.push({ id: 'selected', name: 'Selected', overrides: {} });
    const shapeObject = createShapeObject({ kind: 'rect' });
    shapeObject.timing = { start: 0, duration: 'untilEnd' };
    shapeObject.states.push({ id: 'selected', name: 'Selected', overrides: {} });
    const slide = slideWith([button, shapeObject], 10, 'Interactive');
    slide.properties.onRevisit = onRevisit;
    const other = slideWith([], 5, 'Other');
    return { project: projectOf(slide, other), slide, button, shapeObject, other };
  }

  const leaveAndReturn = (
    project: Project,
    slide: Slide,
    other: Slide,
    setup: (e: ReturnType<typeof createEngine>) => void,
  ) => {
    const engine = createEngine(project);
    engine.tick(0);
    engine.tick(3000);
    setup(engine);
    engine.jumpToSlide(other.id);
    const events = record(engine);
    engine.jumpToSlide(slide.id);
    return { engine, events };
  };

  it('reset rebuilds from the document', () => {
    const { project, slide, button, other } = withButton('reset');
    const { engine, events } = leaveAndReturn(project, slide, other, (e) =>
      e.setObjectState(button.id, 'selected'),
    );
    const base = engine.getView().layers[0]!;
    expect(base.playhead).toBe(0);
    expect(base.objects[0]!.state).toBe(normalState().id);
    expect(events.find((e) => e.type === 'slideEnter')).toMatchObject({ resumed: false });
  });

  it('resume restores states and the playhead without a new timeline start', () => {
    const { project, slide, button, other } = withButton('resume');
    const { engine, events } = leaveAndReturn(project, slide, other, (e) =>
      e.setObjectState(button.id, 'selected'),
    );
    const base = engine.getView().layers[0]!;
    expect(base.playhead).toBe(3);
    expect(base.objects.find((o) => o.id === button.id)!.state).toBe('selected');
    expect(events.map((e) => e.type)).toEqual(['slideExit', 'slideEnter']);
    expect(events.find((e) => e.type === 'slideEnter')).toMatchObject({ resumed: true });
  });

  it('auto resumes only when a button is in a non-initial state', () => {
    const a = withButton('auto');
    const { engine } = leaveAndReturn(a.project, a.slide, a.other, (e) =>
      e.setObjectState(a.button.id, 'selected'),
    );
    expect(engine.getView().layers[0]!.playhead).toBe(3);

    const b = withButton('auto');
    const second = leaveAndReturn(
      b.project,
      b.slide,
      b.other,
      (e) => e.setObjectState(b.shapeObject.id, 'selected'), // not interactive
    );
    expect(second.engine.getView().layers[0]!.playhead).toBe(0);

    const c = withButton('auto');
    const third = leaveAndReturn(c.project, c.slide, c.other, () => undefined);
    expect(third.engine.getView().layers[0]!.playhead).toBe(0);
  });
});

describe('overlay layers', () => {
  function withOverlay(props: Partial<Layer['properties']> = {}) {
    const inside = shape(0, 'untilEnd', 'inside');
    const layer = overlay([inside], 4);
    Object.assign(layer.properties, props);
    const slide = slideWith([shape(0, 'untilEnd')], 10);
    slide.layers.push(layer);
    return { slide, layer, inside, engine: createEngine(projectOf(slide)) };
  }

  it('shows an overlay from zero and hides it again', () => {
    const { layer, inside, engine, slide } = withOverlay();
    const events = record(engine);
    expect(engine.getView().layers).toHaveLength(1);
    engine.tick(0);
    engine.tick(2000);
    engine.showLayer(layer.id);
    expect(types(events)).toEqual(['layerShow', 'timelineStart', 'objectEnter']);
    const shown = engine.getView().layers[1]!;
    expect(shown).toMatchObject({ id: layer.id, shown: true, playhead: 0 });
    engine.tick(3000);
    expect(engine.getView().layers[1]!.playhead).toBe(1);
    engine.hideLayer(layer.id);
    expect(engine.getView().layers).toHaveLength(1);
    expect(events.slice(-2).map((e) => e.type)).toEqual(['objectLeave', 'layerHide']);
    expect(events.at(-2)).toMatchObject({ objectId: inside.id, slideId: slide.id });
    expect(() => engine.showLayer('layer_nope')).toThrow();
  });

  it('hides other overlays when asked, and restarts a hidden layer from zero', () => {
    const one = overlay([], 4);
    const two = overlay([], 4);
    two.properties.hideOtherLayers = true;
    const slide = slideWith([], 10);
    slide.layers.push(one, two);
    const engine = createEngine(projectOf(slide));
    engine.tick(0);
    engine.showLayer(one.id);
    engine.tick(1000);
    engine.showLayer(two.id);
    expect(engine.getView().layers.map((l) => l.id)).toEqual([slide.baseLayer.id, two.id]);
    engine.hideLayer(two.id);
    engine.showLayer(one.id);
    expect(engine.getView().layers.find((l) => l.id === one.id)!.playhead).toBe(0);
  });

  it('can pause the base timeline, hide its objects and block its clicks', () => {
    const { layer, engine } = withOverlay({
      pauseBaseTimeline: true,
      hideBaseObjects: true,
      blockBaseClicks: true,
    });
    engine.tick(0);
    engine.showLayer(layer.id);
    engine.tick(1000);
    let [base, over] = engine.getView().layers;
    expect(base!.playhead).toBe(0);
    expect(base!.paused).toBe(true);
    expect(base!.objects[0]!.onStage).toBe(true);
    expect(base!.objects[0]!.visible).toBe(false);
    expect(over!.blocksBase).toBe(true);
    engine.hideLayer(layer.id);
    engine.tick(2000);
    [base, over] = engine.getView().layers;
    expect(base!.playhead).toBe(1);
    expect(base!.objects[0]!.visible).toBe(true);
    expect(over).toBeUndefined();
  });

  it('resumes a layer whose revisit setting is resume', () => {
    const { layer, engine } = withOverlay({ onRevisit: 'resume' });
    engine.tick(0);
    engine.showLayer(layer.id);
    engine.tick(2000);
    engine.hideLayer(layer.id);
    engine.showLayer(layer.id);
    expect(engine.getView().layers[1]!.playhead).toBe(2);
  });
});

describe('object states', () => {
  it('changes state when the object has it and ignores one it lacks', () => {
    const button = createButtonObject('Go');
    button.states.push({ id: 'hover', name: 'Hover', overrides: {} });
    const slide = slideWith([button]);
    const engine = createEngine(projectOf(slide));
    const events = record(engine);
    expect(engine.setObjectState(button.id, 'disabled')).toBe(false);
    expect(engine.setObjectState('obj_nope', 'hover')).toBe(false);
    expect(events).toEqual([]);
    expect(engine.setObjectState(button.id, 'hover')).toBe(true);
    expect(engine.setObjectState(button.id, 'hover')).toBe(false);
    expect(events).toEqual([
      { type: 'objectStateChange', slideId: slide.id, objectId: button.id, state: 'hover' },
    ]);
    expect(engine.getView().layers[0]!.objects[0]!.state).toBe('hover');
  });

  it('does not show an object in the hidden state even while it is on stage', () => {
    const object = shape(0, 'untilEnd');
    object.states.push({ id: 'hidden', name: 'Hidden', overrides: {} });
    const engine = createEngine(projectOf(slideWith([object])));
    expect(engine.getView().layers[0]!.objects[0]).toMatchObject({ onStage: true, visible: true });
    engine.setObjectState(object.id, 'hidden');
    expect(engine.getView().layers[0]!.objects[0]).toMatchObject({ onStage: true, visible: false });
  });
});

describe('variables', () => {
  function withVariables() {
    const project = projectOf(slideWith([]));
    project.variables.push(
      { id: createId('var'), name: 'Score', type: 'number', default: 0 },
      { id: createId('var'), name: 'Done', type: 'boolean', default: false },
    );
    return project;
  }

  it('starts at the defaults, looks names up ignoring case and checks types', () => {
    const engine = createEngine(withVariables());
    expect(engine.getView().variables).toMatchObject({ Score: 0, Done: false });
    expect(engine.getVariable('score')).toBe(0);
    expect(engine.getVariable('nope')).toBeUndefined();
    engine.setVariable('SCORE', 5);
    expect(engine.getVariable('Score')).toBe(5);
    expect(() => engine.setVariable('Score', 'x')).toThrow();
    expect(() => engine.setVariable('Nope', 1)).toThrow();
  });

  it('announces real changes only', () => {
    const engine = createEngine(withVariables());
    const events = record(engine);
    engine.setVariable('Score', 0);
    expect(events).toEqual([]);
    engine.setVariable('Score', 3);
    expect(events).toEqual([
      expect.objectContaining({ type: 'variableChange', name: 'Score', value: 3 }),
    ]);
  });
});

describe('built-in variables', () => {
  it('count slides, visits and progress, and cannot be set or reused', () => {
    const project = projectOf(slideWith([], 5, 'A'), slideWith([], 5, 'B'), slideWith([], 5, 'C'));
    const engine = createEngine(project);
    expect(engine.getView().variables).toMatchObject({
      SlideNumber: 1,
      SlideCount: 3,
      SlidesViewed: 1,
      PercentComplete: 33,
    });
    engine.next();
    engine.next();
    engine.previous();
    expect(engine.getVariable('slidenumber')).toBe(2);
    expect(engine.getVariable('SlidesViewed')).toBe(3);
    expect(engine.getVariable('PercentComplete')).toBe(100);
    expect(() => engine.setVariable('SlideNumber', 4)).toThrow(/built in/);
  });

  it('count whole seconds of the session, announce each one and survive a restore', () => {
    const engine = createEngine(projectOf(slideWith([], 100)));
    const ticks: unknown[] = [];
    engine.on((e) => {
      if (e.type === 'variableChange' && e.name === 'ElapsedSeconds') ticks.push(e.value);
    });
    engine.tick(0);
    engine.tick(900);
    expect(engine.getVariable('ElapsedSeconds')).toBe(0);
    engine.tick(2500);
    expect(engine.getVariable('ElapsedSeconds')).toBe(2);
    expect(ticks).toEqual([2]);
    engine.tick(3100);
    expect(ticks).toEqual([2, 3]);
    const state = engine.getState();
    expect(state.e).toBe(3.1);
    const restored = createEngine(projectOf(slideWith([], 100)), { restore: state });
    expect(restored.getVariable('ElapsedSeconds')).toBe(3);
  });
});

describe('session state', () => {
  function course() {
    const button = createButtonObject('Go');
    button.states.push({ id: 'selected', name: 'Selected', overrides: {} });
    const first = slideWith([button, shape(0, 'untilEnd')], 10, 'First');
    first.properties.onRevisit = 'resume';
    first.layers.push(overlay([shape(0, 'untilEnd')], 4));
    const second = slideWith([shape(1, 2)], 8, 'Second');
    const project = projectOf(first, second);
    project.variables.push({ id: createId('var'), name: 'Score', type: 'number', default: 0 });
    return { project, first, second, button };
  }

  it('is small for a fresh session and holds only what differs', () => {
    const { project, first } = course();
    const engine = createEngine(project);
    expect(engine.getState()).toEqual({ v: 1, s: first.id, vis: [first.id] });
  });

  it('round-trips through JSON to an identical view', () => {
    const { project, first, second, button } = course();
    const engine = createEngine(project);
    engine.tick(0);
    engine.tick(2500);
    engine.setObjectState(button.id, 'selected');
    engine.showLayer(first.layers[0]!.id);
    engine.setVariable('Score', 7);
    engine.jumpToSlide(second.id);
    engine.tick(3500);
    engine.jumpToSlide(first.id);
    engine.tick(4000);

    const state = JSON.parse(JSON.stringify(engine.getState()));
    expect(state.s).toBe(first.id);
    expect(state.x).toEqual({ [project.variables[0]!.id]: 7 });
    expect(new Set(state.vis)).toEqual(new Set([first.id, second.id]));

    const restored = createEngine(project, { restore: state });
    expect(restored.getView()).toEqual(engine.getView());
    expect(restored.getState()).toEqual(engine.getState());
    // And it carries on from there. (A new engine's first tick only sets its time reference.)
    restored.tick(4000);
    restored.tick(10_000);
    engine.tick(10_000);
    restored.tick(11_000);
    engine.tick(11_000);
    expect(restored.getView()).toEqual(engine.getView());
  });

  it('ignores ids it does not know, and a restored session resumes its slide', () => {
    const { project, first } = course();
    const engine = createEngine(project, {
      restore: {
        v: 1,
        s: first.id,
        x: { var_unknown: 1 },
        vis: ['slide_gone'],
        sv: { slide_gone: { o: { a: 'b' } }, [first.id]: { t: { [first.baseLayer.id]: 4 } } },
      },
    });
    expect(engine.getView().layers[0]!.playhead).toBe(4);
    expect(engine.getState().vis).toEqual([first.id]);
    expect(engine.getState().x).toBeUndefined();
    const stale = createEngine(project, { restore: { v: 1, s: 'slide_gone' } });
    expect(stale.getView().slideIndex).toBe(0);
  });
});

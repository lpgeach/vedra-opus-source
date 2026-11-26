import {
  createAudioObject,
  createButtonObject,
  createDrawSlide,
  createEmptyProject,
  createId,
  createLayer,
  createScene,
  createSlide,
} from '@vedraopus/model';
import type { Project, Trigger, TriggerAction, TriggerEvent } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { createEngine } from './index';
import type { EngineEvent } from './index';

/** Lightbox slides (docs/briefs/P8.4-lightbox.md; plan section 5). */

const HASH = 'a'.repeat(64);

function trigger(owner: Trigger['owner'], event: TriggerEvent, action: TriggerAction): Trigger {
  return {
    id: createId('trigger'),
    owner,
    event,
    action,
    conditions: null,
    otherwise: null,
    enabled: true,
  };
}

/**
 * Four slides. One has narration, a button that opens Two as a lightbox, an
 * overlay layer and a counter. Two (the lightbox) has its own layer and a
 * button that adds to the counter; Three jumps; Four is plain.
 */
function setup(controls = true) {
  const project: Project = createEmptyProject('Lightbox');
  project.assets[HASH] = {
    kind: 'audio',
    fileName: 'a.wav',
    ext: 'wav',
    mimeType: 'audio/wav',
    byteLength: 1,
  };
  const count = { id: createId('var'), name: 'Count', type: 'number' as const, default: 0 };
  project.variables.push(count);
  const add = (n: number): TriggerAction => ({
    type: 'setVariable',
    variable: count.id,
    operator: 'add',
    operand: { kind: 'literal', value: n },
  });

  const one = createSlide('One');
  one.baseLayer.timeline.duration = 10;
  const narration = createAudioObject(HASH, 8, {}, 'Narration');
  const open = createButtonObject('Open');
  open.timing = { start: 0, duration: 'untilEnd' };
  const shown = createLayer('Shown');
  one.layers.push(shown);
  one.baseLayer.objects.push(narration, open);
  one.triggers.push(
    trigger(
      { kind: 'object', id: open.id },
      { type: 'click', object: open.id },
      {
        type: 'openLightbox',
        slide: '',
        controls,
      },
    ),
    trigger(
      { kind: 'slide', id: one.id },
      { type: 'timelineStart', layer: one.baseLayer.id },
      add(100),
    ),
  );

  const two = createSlide('Two');
  two.baseLayer.timeline.duration = 4;
  const plus = createButtonObject('Plus');
  plus.timing = { start: 0, duration: 'untilEnd' };
  const close = createButtonObject('Close');
  close.timing = { start: 0, duration: 'untilEnd' };
  const jump = createButtonObject('Jump');
  jump.timing = { start: 0, duration: 'untilEnd' };
  const twoLayer = createLayer('Inside');
  two.layers.push(twoLayer);
  two.baseLayer.objects.push(plus, close, jump);
  two.triggers.push(
    trigger({ kind: 'object', id: plus.id }, { type: 'click', object: plus.id }, add(1)),
    trigger(
      { kind: 'object', id: close.id },
      { type: 'click', object: close.id },
      { type: 'closeLightbox' },
    ),
    trigger(
      { kind: 'object', id: jump.id },
      { type: 'click', object: jump.id },
      {
        type: 'jumpToSlide',
        target: { kind: 'next' },
      },
    ),
  );
  const three = createSlide('Three');
  const four = createSlide('Four');
  (one.triggers[0]!.action as { slide: string }).slide = two.id;
  project.scenes = [{ ...createScene(), slides: [one, two, three, four] }];

  const engine = createEngine(project);
  const events: EngineEvent[] = [];
  engine.on((event) => events.push(event));
  let now = 0;
  engine.tick(now);
  const at = (seconds: number) => {
    now += seconds * 1000;
    engine.tick(now);
  };
  const base = () => engine.getView().layers[0]!;
  return {
    project,
    engine,
    events,
    at,
    base,
    one,
    two,
    three,
    four,
    narration,
    open,
    shown,
    plus,
    close,
    jump,
    twoLayer,
  };
}

describe('lightboxes', () => {
  it('freeze the slide under them and play their own slide from 0, with its own layers', () => {
    const { engine, at, base, one, two, narration, open, shown, twoLayer, events } = setup();
    at(3);
    engine.showLayer(shown.id);
    expect(base().playhead).toBeCloseTo(3);
    expect(base().media.find((m) => m.id === narration.id)?.playing).toBe(true);
    const starts = () =>
      events.filter((e) => e.type === 'timelineStart' && e.slideId === one.id).length;
    expect(starts()).toBe(1);

    engine.pointer('click', open.id);
    let view = engine.getView();
    expect(view.slideId).toBe(two.id);
    expect(view.lightbox).toEqual({ underSlideId: one.id, controls: true });
    // The lightbox's own timeline, from 0, with only its own layers.
    expect(base().id).toBe(two.baseLayer.id);
    expect(base().playhead).toBe(0);
    expect(view.layers.map((l) => l.id)).toEqual([two.baseLayer.id]);
    engine.showLayer(twoLayer.id);
    at(2);
    expect(base().playhead).toBeCloseTo(2);
    // The slide count is still the slide under it.
    expect(view.slideIndex).toBe(0);

    // Closing: the slide as it was. The time did not move on, the layer is still shown,
    // the narration is where it was, and its timeline did not start again.
    expect(engine.closeLightbox()).toBe(true);
    view = engine.getView();
    expect(view.slideId).toBe(one.id);
    expect(view.lightbox).toBeUndefined();
    expect(base().playhead).toBeCloseTo(3);
    expect(view.layers.map((l) => l.id)).toEqual([one.baseLayer.id, shown.id]);
    expect(base().media.find((m) => m.id === narration.id)?.time).toBeCloseTo(3);
    expect(starts()).toBe(1);
    at(1);
    expect(base().playhead).toBeCloseTo(4);
  });

  it('share variables, and a trigger in the lightbox closes it', () => {
    const { engine, one, open, plus, close } = setup();
    expect(engine.getVariable('Count')).toBe(100);
    engine.pointer('click', open.id);
    engine.pointer('click', plus.id);
    engine.pointer('click', plus.id);
    expect(engine.getVariable('Count')).toBe(102);
    engine.pointer('click', close.id);
    expect(engine.getView().slideId).toBe(one.id);
    // The slide under it was not entered again: its timeline-start trigger did not run.
    expect(engine.getVariable('Count')).toBe(102);
  });

  it('with controls, Previous and Next move the lightbox along the course, never onto the slide under it', () => {
    const { engine, open, one, two, three } = setup(true);
    engine.pointer('click', open.id);
    expect(engine.getView().canPrevious).toBe(false); // before Two is One, the slide under it
    expect(engine.getView().canNext).toBe(true);
    expect(engine.next()).toBe(true);
    expect(engine.getView().slideId).toBe(three.id);
    expect(engine.getView().lightbox?.underSlideId).toBe(one.id);
    expect(engine.previous()).toBe(true);
    expect(engine.getView().slideId).toBe(two.id);
    expect(engine.previous()).toBe(false);
  });

  it('without controls, Previous and Next do nothing', () => {
    const { engine, open, two } = setup(false);
    engine.pointer('click', open.id);
    expect(engine.getView().canNext).toBe(false);
    expect(engine.getView().canPrevious).toBe(false);
    expect(engine.next()).toBe(false);
    expect(engine.getView().slideId).toBe(two.id);
  });

  it('a jump from inside closes it first, and jumps from the slide under it', () => {
    const { engine, open, jump, two } = setup();
    engine.pointer('click', open.id);
    engine.pointer('click', jump.id);
    const view = engine.getView();
    expect(view.lightbox).toBeUndefined();
    // "Next" from One, the slide under it: Two, as a slide this time.
    expect(view.slideId).toBe(two.id);
    expect(view.slideIndex).toBe(1);
  });

  it('opens one at a time, never the slide under it or a draw slide', () => {
    const { engine, one, three, open } = setup();
    engine.pointer('click', open.id);
    expect(engine.openLightbox(three.id)).toBe(true);
    expect(engine.getView().slideId).toBe(three.id);
    expect(engine.getView().lightbox?.underSlideId).toBe(one.id);
    expect(engine.openLightbox(one.id)).toBe(false);
    engine.closeLightbox();
    expect(engine.getView().slideId).toBe(one.id);
    expect(engine.closeLightbox()).toBe(false);
    expect(engine.openLightbox(one.id)).toBe(false);
  });

  it('refuses a draw slide', () => {
    const project = createEmptyProject();
    const draw = createDrawSlide(null);
    project.scenes[0]!.slides.push(draw);
    const engine = createEngine(project);
    expect(engine.openLightbox(draw.id)).toBe(false);
  });

  it('saves the session at the slide under it', () => {
    const { engine, open, one, two } = setup();
    engine.pointer('click', open.id);
    const state = engine.getState();
    expect(state.s).toBe(one.id);
    expect(state.vis).toEqual(expect.arrayContaining([one.id, two.id]));
  });
});

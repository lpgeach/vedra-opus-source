import {
  createButtonObject,
  createEmptyProject,
  createLayer,
  createScene,
  createSlide,
} from '@vedraopus/model';
import type { ButtonObject, Project, Slide } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { createEngine } from './index';
import type { EngineEvent } from './index';

/** A button on stage for the whole slide, with the named states (besides normal). */
function button(states: string[], name = 'B'): ButtonObject {
  const object = createButtonObject(name);
  object.name = name;
  object.timing = { start: 0, duration: 'untilEnd' };
  for (const id of states) object.states.push({ id, name: id, overrides: {} });
  return object;
}

function course(objects: ButtonObject[], extra: (slide: Slide) => void = () => undefined) {
  const slide = createSlide('S');
  slide.baseLayer.objects.push(...objects);
  extra(slide);
  const other = createSlide('Other');
  const project: Project = createEmptyProject();
  project.scenes = [{ ...createScene(), slides: [slide, other] }];
  const engine = createEngine(project);
  const events: EngineEvent[] = [];
  engine.on((event) => events.push(event));
  const stateOf = (object: ButtonObject) =>
    engine
      .getView()
      .layers.flatMap((layer) => layer.objects)
      .find((each) => each.id === object.id)!.state;
  const changes = () =>
    events.flatMap((e) => (e.type === 'objectStateChange' ? [[e.objectId, e.state]] : []));
  return { engine, project, slide, other, stateOf, events, changes };
}

describe('hover and down', () => {
  it('shows hover while the pointer is over and down while pressed, then reverts', () => {
    const b = button(['hover', 'down']);
    const { engine, stateOf, changes } = course([b]);
    expect(stateOf(b)).toBe('normal');
    engine.pointer('enter', b.id);
    expect(stateOf(b)).toBe('hover');
    engine.pointer('down', b.id);
    expect(stateOf(b)).toBe('down');
    engine.pointer('up', b.id);
    expect(stateOf(b)).toBe('hover');
    engine.pointer('leave', b.id);
    expect(stateOf(b)).toBe('normal');
    expect(changes().map(([, state]) => state)).toEqual(['hover', 'down', 'hover', 'normal']);
  });

  it('does nothing visible for states the object does not have', () => {
    const b = button([]);
    const { engine, stateOf, changes } = course([b]);
    expect(engine.pointer('enter', b.id)).toBe(true);
    engine.pointer('down', b.id);
    engine.pointer('click', b.id);
    expect(stateOf(b)).toBe('normal');
    expect(changes()).toEqual([]);
  });

  it('leaving while pressed ends the press too', () => {
    const b = button(['down']);
    const { engine, stateOf } = course([b]);
    engine.pointer('enter', b.id);
    engine.pointer('down', b.id);
    engine.pointer('leave', b.id);
    engine.pointer('enter', b.id);
    expect(stateOf(b)).toBe('normal');
  });
});

describe('selected', () => {
  it('toggles on click when the state exists', () => {
    const b = button(['selected']);
    const { engine, stateOf } = course([b]);
    engine.pointer('click', b.id);
    expect(stateOf(b)).toBe('selected');
    engine.pointer('click', b.id);
    expect(stateOf(b)).toBe('normal');
  });

  it('is under hover and down while those apply', () => {
    const b = button(['selected', 'hover', 'down']);
    const { engine, stateOf } = course([b]);
    engine.pointer('enter', b.id);
    engine.pointer('down', b.id);
    engine.pointer('up', b.id);
    engine.pointer('click', b.id);
    expect(stateOf(b)).toBe('hover');
    engine.pointer('leave', b.id);
    expect(stateOf(b)).toBe('selected');
  });

  it('in a button set, selecting one deselects the others and a second click keeps it', () => {
    const [a, b, c] = [
      button(['selected'], 'A'),
      button(['selected'], 'B'),
      button(['selected'], 'C'),
    ];
    a!.buttonSet = b!.buttonSet = 'tabs';
    const { engine, stateOf, changes } = course([a!, b!, c!]);
    engine.pointer('click', a!.id);
    engine.pointer('click', c!.id); // not in the set
    engine.pointer('click', b!.id);
    expect([stateOf(a!), stateOf(b!), stateOf(c!)]).toEqual(['normal', 'selected', 'selected']);
    engine.pointer('click', b!.id);
    expect(stateOf(b!)).toBe('selected');
    // Changing the state by action follows the same rule.
    engine.setObjectState(a!.id, 'selected');
    expect([stateOf(a!), stateOf(b!)]).toEqual(['selected', 'normal']);
    expect(changes().slice(-2)).toEqual(
      expect.arrayContaining([
        [a!.id, 'selected'],
        [b!.id, 'normal'],
      ]),
    );
  });

  it('an object that starts selected can be deselected', () => {
    const b = button(['selected']);
    b.initialState = 'selected';
    const { engine, stateOf } = course([b]);
    expect(stateOf(b)).toBe('selected');
    engine.pointer('click', b.id);
    expect(stateOf(b)).toBe('normal');
  });
});

describe('visited', () => {
  it('is applied by the first click and persists', () => {
    const b = button(['visited', 'hover']);
    const { engine, stateOf } = course([b]);
    engine.pointer('enter', b.id);
    expect(stateOf(b)).toBe('hover');
    engine.pointer('click', b.id);
    engine.pointer('leave', b.id);
    expect(stateOf(b)).toBe('visited');
    engine.pointer('click', b.id);
    expect(stateOf(b)).toBe('visited');
  });

  it('with selected, the look is whichever of the two was applied last', () => {
    const b = button(['selected', 'visited']);
    const { engine, stateOf } = course([b]);
    engine.pointer('click', b.id); // selected, then visited for the first time
    expect(stateOf(b)).toBe('visited');
    engine.pointer('click', b.id); // deselected; visited stays
    expect(stateOf(b)).toBe('visited');
    engine.pointer('click', b.id); // selected again, applied after visited
    expect(stateOf(b)).toBe('selected');
    engine.setObjectState(b.id, 'visited'); // applied again, now the later one
    expect(stateOf(b)).toBe('visited');
  });

  it('changing to normal clears selected and visited', () => {
    const b = button(['selected', 'visited']);
    const { engine, stateOf } = course([b]);
    engine.pointer('click', b.id);
    engine.setObjectState(b.id, 'normal');
    expect(stateOf(b)).toBe('normal');
  });
});

describe('disabled and hidden', () => {
  it('disabled blocks all input and the automatic states', () => {
    const b = button(['disabled', 'hover', 'down', 'selected', 'visited']);
    const { engine, stateOf, changes } = course([b]);
    engine.pointer('enter', b.id);
    engine.setObjectState(b.id, 'disabled');
    expect(stateOf(b)).toBe('disabled');
    const before = changes().length;
    for (const kind of ['enter', 'down', 'up', 'click', 'leave'] as const) {
      expect(engine.pointer(kind, b.id)).toBe(false);
    }
    expect(stateOf(b)).toBe('disabled');
    expect(changes()).toHaveLength(before);
    // Enabled again, it was not left hovered or selected by what happened meanwhile.
    engine.setObjectState(b.id, 'normal');
    expect(stateOf(b)).toBe('normal');
    expect(engine.pointer('click', b.id)).toBe(true);
  });

  it('hidden removes the object: not visible and no input', () => {
    const b = button(['hidden', 'selected']);
    const { engine } = course([b]);
    engine.setObjectState(b.id, 'hidden');
    const view = engine.getView().layers[0]!.objects[0]!;
    expect(view).toMatchObject({ state: 'hidden', visible: false, onStage: true });
    expect(engine.pointer('click', b.id)).toBe(false);
  });

  it('keeps selected underneath disabled', () => {
    const b = button(['disabled', 'selected']);
    const { engine, stateOf } = course([b]);
    engine.pointer('click', b.id);
    engine.setObjectState(b.id, 'disabled');
    expect(stateOf(b)).toBe('disabled');
  });
});

describe('input the engine refuses', () => {
  it('ignores objects that are off stage, unknown, or under a blocking layer', () => {
    const late = button(['selected'], 'Late');
    late.timing = { start: 3, duration: 1 };
    const b = button(['selected']);
    const blocker = createLayer('Blocker');
    blocker.properties.blockBaseClicks = true;
    const { engine, stateOf } = course([late, b], (slide) => slide.layers.push(blocker));
    expect(engine.pointer('click', late.id)).toBe(false);
    expect(engine.pointer('click', 'obj_nope')).toBe(false);
    engine.showLayer(blocker.id);
    expect(engine.pointer('click', b.id)).toBe(false);
    engine.hideLayer(blocker.id);
    expect(engine.pointer('click', b.id)).toBe(true);
    expect(stateOf(b)).toBe('selected');
  });
});

describe('custom states and saving', () => {
  it('shows a custom state it is changed to, under hover', () => {
    const b = button(['state_glow', 'hover']);
    const { engine, stateOf } = course([b]);
    engine.setObjectState(b.id, 'state_glow');
    expect(stateOf(b)).toBe('state_glow');
    engine.pointer('enter', b.id);
    expect(stateOf(b)).toBe('hover');
    engine.pointer('leave', b.id);
    expect(stateOf(b)).toBe('state_glow');
  });

  it('saves selected and visited with the session, but not hover', () => {
    const b = button(['selected', 'visited', 'hover']);
    const { engine, project, slide } = course([b]);
    slide.properties.onRevisit = 'resume';
    engine.pointer('enter', b.id);
    engine.pointer('click', b.id);
    engine.pointer('click', b.id);
    engine.pointer('click', b.id);
    const state = JSON.parse(JSON.stringify(engine.getState()));
    expect(state.sv[slide.id].f).toEqual({ [b.id]: 'vs' });
    const restored = createEngine(project, { restore: state });
    expect(restored.getView().layers[0]!.objects[0]!.state).toBe('selected');
  });

  it('resets marks when the slide resets, and resumes them on an auto slide with a used button', () => {
    const b = button(['selected']);
    const { engine, slide, other, stateOf } = course([b]);
    engine.pointer('click', b.id);
    engine.jumpToSlide(other.id);
    engine.jumpToSlide(slide.id); // auto: a button was used, so it resumes
    expect(stateOf(b)).toBe('selected');
    slide.properties.onRevisit = 'reset';
    engine.jumpToSlide(other.id);
    engine.jumpToSlide(slide.id);
    expect(stateOf(b)).toBe('normal');
  });
});

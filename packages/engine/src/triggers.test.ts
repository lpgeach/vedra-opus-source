import {
  createButtonObject,
  createEmptyProject,
  createId,
  createLayer,
  createScene,
  createShapeObject,
  createSlide,
} from '@vedraopus/model';
import type {
  Condition,
  Project,
  SceneObject,
  Slide,
  Trigger,
  TriggerAction,
  TriggerEvent,
  Variable,
} from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { compare, nextValue, sameKey } from './triggers';
import { createEngine, MAX_CASCADE_DEPTH } from './index';
import type { EngineEvent } from './index';

function trigger(
  owner: Trigger['owner'],
  event: TriggerEvent,
  action: TriggerAction,
  extra: Partial<Trigger> = {},
): Trigger {
  return {
    id: createId('trigger'),
    owner,
    event,
    action,
    conditions: null,
    otherwise: null,
    enabled: true,
    ...extra,
  };
}

function always(object: SceneObject): SceneObject {
  object.timing = { start: 0, duration: 'untilEnd' };
  return object;
}

/** A slide with a button and a box (with hidden, normal and two custom states), plus variables. */
function setup(
  build: (s: {
    slide: Slide;
    button: SceneObject;
    box: SceneObject;
    vars: Record<string, Variable>;
  }) => void,
) {
  const button = always(createButtonObject('Go'));
  const box = always(createShapeObject({ kind: 'rect' }));
  box.states.push(
    { id: 'hidden', name: 'Hidden', overrides: {} },
    { id: 'state_a', name: 'A', overrides: {} },
    { id: 'state_b', name: 'B', overrides: {} },
  );
  const slide = createSlide('First');
  slide.baseLayer.timeline.duration = 10;
  slide.baseLayer.objects.push(button, box);
  const second = createSlide('Second');
  const third = createSlide('Third');
  const vars: Record<string, Variable> = {
    count: { id: createId('var'), name: 'Count', type: 'number', default: 0 },
    name: { id: createId('var'), name: 'Name', type: 'text', default: '' },
    done: { id: createId('var'), name: 'Done', type: 'boolean', default: false },
  };
  build({ slide, button, box, vars });
  const project: Project = createEmptyProject();
  project.scenes = [{ ...createScene(), slides: [slide, second, third] }];
  project.variables.push(...Object.values(vars));
  const engine = createEngine(project);
  const events: EngineEvent[] = [];
  engine.on((event) => events.push(event));
  const stateOf = (object: SceneObject) =>
    engine
      .getView()
      .layers.flatMap((layer) => layer.objects)
      .find((each) => each.id === object.id)?.state;
  return { engine, slide, second, third, button, box, vars, events, stateOf };
}

const objectOwner = (object: SceneObject) => ({ kind: 'object' as const, id: object.id });
const slideOwner = (slide: Slide) => ({ kind: 'slide' as const, id: slide.id });
const literal = (value: string | number | boolean) => ({ kind: 'literal' as const, value });
const set = (
  variable: Variable,
  operator: 'assign' | 'add' | 'subtract' | 'multiply' | 'divide' | 'append',
  value: string | number | boolean,
): TriggerAction => ({
  type: 'setVariable',
  variable: variable.id,
  operator,
  operand: literal(value),
});
const when = (
  variable: Variable,
  operator: Extract<Condition, { subject: 'variable' }>['operator'],
  value: string | number | boolean,
): Trigger['conditions'] => ({
  combine: 'and',
  items: [{ subject: 'variable', variable: variable.id, operator, value: literal(value) }],
});

describe('which triggers run', () => {
  it('a click on an object runs its trigger; other objects and disabled triggers do not', () => {
    const { engine, button, box, stateOf } = setup(({ slide, button, box }) => {
      slide.triggers.push(
        trigger(
          objectOwner(button),
          { type: 'click', object: button.id },
          { type: 'changeState', object: box.id, state: 'state_a' },
        ),
        trigger(
          objectOwner(box),
          { type: 'click', object: box.id },
          { type: 'changeState', object: box.id, state: 'hidden' },
        ),
        trigger(
          objectOwner(button),
          { type: 'click', object: button.id },
          { type: 'changeState', object: box.id, state: 'state_b' },
          { enabled: false },
        ),
      );
    });
    engine.pointer('click', button.id);
    expect(stateOf(box)).toBe('state_a');
  });

  it('runs object, then layer, then slide triggers, each in listed order', () => {
    const { engine, button, vars } = setup(({ slide, button, vars }) => {
      const event: TriggerEvent = { type: 'click', object: button.id };
      slide.triggers.push(
        trigger(slideOwner(slide), event, set(vars.name!, 'append', 'S')),
        trigger(objectOwner(button), event, set(vars.name!, 'append', 'O1')),
        trigger(objectOwner(button), event, set(vars.name!, 'append', 'O2')),
      );
    });
    engine.pointer('click', button.id);
    expect(engine.getVariable('Name')).toBe('O1O2S');
    expect(vars.name).toBeDefined();
  });

  it('hover in and out, double and right clicks, and key presses', () => {
    const { engine, button } = setup(({ slide, button, vars }) => {
      const owner = objectOwner(button);
      slide.triggers.push(
        trigger(owner, { type: 'mouseEnter', object: button.id }, set(vars.name!, 'append', 'in ')),
        trigger(
          owner,
          { type: 'mouseLeave', object: button.id },
          set(vars.name!, 'append', 'out '),
        ),
        trigger(
          owner,
          { type: 'doubleClick', object: button.id },
          set(vars.name!, 'append', 'double '),
        ),
        trigger(
          owner,
          { type: 'rightClick', object: button.id },
          set(vars.name!, 'append', 'right '),
        ),
        trigger(slideOwner(slide), { type: 'keyPress', key: 'a' }, set(vars.name!, 'append', 'A ')),
        trigger(
          slideOwner(slide),
          { type: 'keyPress', key: 'Enter' },
          set(vars.name!, 'append', 'Enter'),
        ),
      );
    });
    engine.pointer('enter', button.id);
    engine.pointer('doubleClick', button.id);
    engine.pointer('rightClick', button.id);
    engine.pointer('leave', button.id);
    engine.key('A');
    engine.key('enter'); // named keys must match exactly
    engine.key('Enter');
    expect(engine.getVariable('Name')).toBe('in double right out A Enter');
    expect(sameKey('Enter', 'enter')).toBe(false);
  });

  it('a player tab runs its own triggers on the current slide only (P8.2)', () => {
    const { engine, second } = setup(({ slide, vars }) => {
      slide.triggers.push(
        trigger(
          slideOwner(slide),
          { type: 'playerTab', tab: 'tab_help' },
          set(vars.name!, 'append', 'help '),
        ),
        trigger(
          slideOwner(slide),
          { type: 'playerTab', tab: 'tab_jump' },
          {
            type: 'jumpToSlide',
            target: { kind: 'next' },
          },
        ),
      );
    });
    engine.playerTab('tab_help');
    engine.playerTab('tab_other');
    expect(engine.getVariable('Name')).toBe('help ');
    engine.playerTab('tab_jump');
    expect(engine.getView().slideId).toBe(second.id);
    // The second slide has no tab triggers: nothing happens.
    engine.playerTab('tab_help');
    expect(engine.getVariable('Name')).toBe('help ');
  });

  it('an object that refuses input wakes no triggers', () => {
    const { engine, button, box, stateOf } = setup(({ slide, button, box }) => {
      button.states.push({ id: 'disabled', name: 'Disabled', overrides: {} });
      button.initialState = 'disabled';
      slide.triggers.push(
        trigger(
          objectOwner(button),
          { type: 'click', object: button.id },
          { type: 'changeState', object: box.id, state: 'state_a' },
        ),
      );
    });
    expect(engine.pointer('click', button.id)).toBe(false);
    expect(stateOf(box)).toBe('normal');
  });

  it('an object on a hidden layer has no active triggers', () => {
    const layer = createLayer('Popup');
    const inner = always(createButtonObject('Close'));
    layer.objects.push(inner);
    const { engine } = setup(({ slide, vars }) => {
      slide.layers.push(layer);
      slide.triggers.push(
        trigger(
          objectOwner(inner),
          { type: 'click', object: inner.id },
          set(vars.count!, 'add', 1),
        ),
        trigger(
          { kind: 'layer', id: layer.id },
          { type: 'timelineStart', layer: layer.id },
          set(vars.count!, 'add', 10),
        ),
      );
    });
    expect(engine.pointer('click', inner.id)).toBe(false);
    engine.showLayer(layer.id);
    expect(engine.getVariable('Count')).toBe(10);
    engine.pointer('click', inner.id);
    expect(engine.getVariable('Count')).toBe(11);
  });
});

describe('conditions and else', () => {
  it('checks conditions when each trigger runs, so an earlier trigger’s change counts', () => {
    const { engine, button } = setup(({ slide, button, vars }) => {
      const event: TriggerEvent = { type: 'click', object: button.id };
      slide.triggers.push(
        trigger(objectOwner(button), event, set(vars.count!, 'assign', 5)),
        trigger(objectOwner(button), event, set(vars.name!, 'assign', 'five'), {
          conditions: when(vars.count!, '==', 5),
        }),
      );
    });
    engine.pointer('click', button.id);
    expect(engine.getVariable('Name')).toBe('five');
  });

  it('runs the else action when conditions fail, and nothing when there is none', () => {
    const { engine, button, box, stateOf } = setup(({ slide, button, box, vars }) => {
      const event: TriggerEvent = { type: 'click', object: button.id };
      slide.triggers.push(
        trigger(
          objectOwner(button),
          event,
          { type: 'changeState', object: box.id, state: 'state_a' },
          {
            conditions: when(vars.count!, '>=', 3),
            otherwise: { type: 'changeState', object: box.id, state: 'state_b' },
          },
        ),
        trigger(objectOwner(button), event, set(vars.name!, 'assign', 'never'), {
          conditions: when(vars.count!, '>', 100),
        }),
      );
    });
    engine.pointer('click', button.id);
    expect(stateOf(box)).toBe('state_b');
    expect(engine.getVariable('Name')).toBe('');
    engine.setVariable('Count', 3);
    engine.pointer('click', button.id);
    expect(stateOf(box)).toBe('state_a');
  });

  it('combines with and or or, and can test an object’s state', () => {
    const { engine, button, box } = setup(({ slide, button, box, vars }) => {
      slide.triggers.push(
        trigger(
          objectOwner(button),
          { type: 'click', object: button.id },
          set(vars.name!, 'append', 'or '),
          {
            conditions: {
              combine: 'or',
              items: [
                {
                  subject: 'variable',
                  variable: vars.count!.id,
                  operator: '>',
                  value: literal(10),
                },
                { subject: 'objectState', object: box.id, operator: '==', state: 'state_a' },
              ],
            },
          },
        ),
        trigger(
          objectOwner(button),
          { type: 'click', object: button.id },
          set(vars.name!, 'append', 'and'),
          {
            conditions: {
              combine: 'and',
              items: [
                { subject: 'objectState', object: box.id, operator: '!=', state: 'normal' },
                {
                  subject: 'variable',
                  variable: vars.done!.id,
                  operator: '==',
                  value: literal(false),
                },
              ],
            },
          },
        ),
      );
    });
    engine.pointer('click', button.id);
    expect(engine.getVariable('Name')).toBe('');
    engine.setObjectState(box.id, 'state_a');
    engine.pointer('click', button.id);
    expect(engine.getVariable('Name')).toBe('or and');
  });

  it('compares numbers as numbers and text without regard to case for contains', () => {
    expect(compare(9, '<', 10)).toBe(true);
    expect(compare('9', '<', 10)).toBe(true);
    expect(compare('apple', '<', 'banana')).toBe(true);
    expect(compare('Hello World', 'contains', 'world')).toBe(true);
    expect(compare(true, '==', 'true')).toBe(true);
    expect(compare(5, '!=', 5)).toBe(false);
  });

  it('compares text ignoring case with ==i and !=i (B12)', () => {
    expect(compare('Correct', '==i', 'correct')).toBe(true);
    expect(compare('Correct', '==', 'correct')).toBe(false);
    expect(compare('Correct', '!=i', 'CORRECT')).toBe(false);
    expect(compare('Correct', '!=i', 'incorrect')).toBe(true);
    expect(compare(5, '==i', '5')).toBe(true);
  });
});

describe('cascades', () => {
  it('runs triggers woken by an action after the current event’s triggers, breadth-first', () => {
    const { engine, button } = setup(({ slide, button, box, vars }) => {
      const event: TriggerEvent = { type: 'click', object: button.id };
      slide.triggers.push(
        // Both click triggers run before anything they caused.
        trigger(objectOwner(button), event, set(vars.count!, 'add', 1)),
        trigger(objectOwner(button), event, {
          type: 'changeState',
          object: box.id,
          state: 'state_a',
        }),
        trigger(
          slideOwner(slide),
          { type: 'variableChange', variable: vars.count!.id },
          set(vars.name!, 'append', 'count '),
        ),
        trigger(
          slideOwner(slide),
          { type: 'stateChange', object: box.id, state: 'state_a' },
          set(vars.name!, 'append', 'state '),
        ),
        trigger(
          slideOwner(slide),
          { type: 'variableChange', variable: vars.name!.id },
          set(vars.done!, 'assign', true),
        ),
      );
    });
    engine.pointer('click', button.id);
    // Level 1: the count change, then the state change, in the order they happened.
    expect(engine.getVariable('Name')).toBe('count state ');
    // Level 2: the name changes wake the last trigger.
    expect(engine.getVariable('Done')).toBe(true);
  });

  it('stops a loop at the depth cap and says so once', () => {
    const { engine, button, events } = setup(({ slide, button, vars }) => {
      slide.triggers.push(
        trigger(
          objectOwner(button),
          { type: 'click', object: button.id },
          set(vars.count!, 'add', 1),
        ),
        // Each change wakes itself again.
        trigger(
          slideOwner(slide),
          { type: 'variableChange', variable: vars.count!.id },
          set(vars.count!, 'add', 1),
        ),
      );
    });
    engine.pointer('click', button.id);
    expect(engine.getVariable('Count')).toBe(MAX_CASCADE_DEPTH + 1);
    expect(events.filter((e) => e.type === 'warning')).toHaveLength(1);
    // The engine is still usable afterwards.
    // Setting it by hand starts a fresh cascade: that change, then MAX_CASCADE_DEPTH more.
    engine.setVariable('Count', 0);
    expect(engine.getVariable('Count')).toBe(MAX_CASCADE_DEPTH + 1);
  });

  it('a jump ends the remaining triggers for that event', () => {
    const { engine, button, second } = setup(({ slide, button, vars }) => {
      const event: TriggerEvent = { type: 'click', object: button.id };
      slide.triggers.push(
        trigger(objectOwner(button), event, { type: 'jumpToSlide', target: { kind: 'next' } }),
        trigger(objectOwner(button), event, set(vars.count!, 'add', 1)),
      );
    });
    engine.pointer('click', button.id);
    expect(engine.getView().slideId).toBe(second.id);
    expect(engine.getVariable('Count')).toBe(0);
  });
});

describe('events from the timeline', () => {
  it('timeline starts, reaches a time, reaches a cue point and ends', () => {
    const cue = { id: createId('cue'), name: 'Beat', time: 4 };
    const { engine } = setup(({ slide, vars }) => {
      slide.baseLayer.timeline.cuePoints.push(cue);
      const layer = slide.baseLayer.id;
      const owner = slideOwner(slide);
      slide.triggers.push(
        trigger(owner, { type: 'timelineStart', layer }, set(vars.name!, 'append', 'start ')),
        trigger(
          owner,
          { type: 'timelineReaches', layer, time: 2 },
          set(vars.name!, 'append', '2s '),
        ),
        trigger(
          owner,
          { type: 'cuePoint', layer, cuePoint: cue.id },
          set(vars.name!, 'append', 'cue '),
        ),
        trigger(owner, { type: 'timelineEnd', layer }, set(vars.name!, 'append', 'end')),
      );
      expect(vars).toBeDefined();
    });
    // The course starts on the slide: its timeline-start trigger has run.
    expect(engine.getVariable('Name')).toBe('start ');
    engine.tick(0);
    engine.tick(1900);
    expect(engine.getVariable('Name')).toBe('start ');
    engine.tick(2000);
    expect(engine.getVariable('Name')).toBe('start 2s ');
    engine.tick(11_000);
    expect(engine.getVariable('Name')).toBe('start 2s cue end');
  });
});

describe('a timeline reaching 0 s', () => {
  it('counts as reached when the timeline starts, on the slide and on a layer', () => {
    const layer = createLayer('Popup');
    const { engine } = setup(({ slide, vars }) => {
      slide.layers.push(layer);
      slide.triggers.push(
        trigger(
          slideOwner(slide),
          { type: 'timelineReaches', layer: slide.baseLayer.id, time: 0 },
          set(vars.name!, 'append', 'base '),
        ),
        trigger(
          { kind: 'layer', id: layer.id },
          { type: 'timelineReaches', layer: layer.id, time: 0 },
          set(vars.name!, 'append', 'layer'),
        ),
      );
    });
    expect(engine.getVariable('Name')).toBe('base ');
    engine.showLayer(layer.id);
    expect(engine.getVariable('Name')).toBe('base layer');
  });
});

describe('the very start of a timeline', () => {
  it('a trigger for 0 s and a cue point at 0 s are reached when the timeline starts', () => {
    const cue = { id: createId('cue'), name: 'Start', time: 0 };
    const layer = createLayer('Popup');
    layer.timeline.cuePoints.push({ id: createId('cue'), name: 'Layer start', time: 0 });
    const { engine } = setup(({ slide, vars }) => {
      slide.baseLayer.timeline.cuePoints.push(cue);
      slide.layers.push(layer);
      const owner = slideOwner(slide);
      slide.triggers.push(
        trigger(
          owner,
          { type: 'timelineReaches', layer: slide.baseLayer.id, time: 0 },
          set(vars.name!, 'append', '0s '),
        ),
        trigger(
          owner,
          { type: 'cuePoint', layer: slide.baseLayer.id, cuePoint: cue.id },
          set(vars.name!, 'append', 'cue '),
        ),
        trigger(
          owner,
          { type: 'timelineReaches', layer: layer.id, time: 0 },
          set(vars.name!, 'append', 'layer'),
        ),
      );
    });
    // At the same moment, cue points are announced before "reaches" times.
    expect(engine.getVariable('Name')).toBe('cue 0s ');
    engine.showLayer(layer.id);
    expect(engine.getVariable('Name')).toBe('cue 0s layer');
    // Ticking on does not reach 0 s again.
    engine.tick(0);
    engine.tick(1000);
    expect(engine.getVariable('Name')).toBe('cue 0s layer');
  });
});

describe('actions', () => {
  it('jumps to a named slide, next and previous', () => {
    // The third slide's id is only known once the project exists, so its jump is added then.
    const {
      engine,
      button,
      box,
      slide: first,
      second,
      third,
    } = setup(({ slide, button, box }) => {
      slide.triggers.push(
        trigger(
          objectOwner(button),
          { type: 'click', object: button.id },
          { type: 'jumpToSlide', target: { kind: 'previous' } },
        ),
        trigger(
          objectOwner(box),
          { type: 'click', object: box.id },
          { type: 'jumpToSlide', target: { kind: 'next' } },
        ),
      );
    });
    // Previous from the first slide does nothing.
    engine.pointer('click', button.id);
    expect(engine.getView().slideId).toBe(first.id);
    engine.pointer('click', box.id);
    expect(engine.getView().slideId).toBe(second.id);
    const link = always(createButtonObject('Last'));
    second.baseLayer.objects.push(link);
    second.triggers.push(
      trigger(
        objectOwner(link),
        { type: 'click', object: link.id },
        { type: 'jumpToSlide', target: { kind: 'slide', slide: third.id } },
      ),
    );
    engine.jumpToSlide(second.id);
    engine.pointer('click', link.id);
    expect(engine.getView().slideId).toBe(third.id);
  });

  it('sets variables with each operator, and leaves impossible ones alone', () => {
    expect(nextValue({ type: 'number' }, 6, 'add', 4)).toBe(10);
    expect(nextValue({ type: 'number' }, 6, 'subtract', 4)).toBe(2);
    expect(nextValue({ type: 'number' }, 6, 'multiply', '2')).toBe(12);
    expect(nextValue({ type: 'number' }, 6, 'divide', 4)).toBe(1.5);
    expect(nextValue({ type: 'number' }, 6, 'divide', 0)).toBeUndefined();
    expect(nextValue({ type: 'number' }, 6, 'assign', 'x')).toBeUndefined();
    expect(nextValue({ type: 'text' }, 'Hi ', 'append', 3)).toBe('Hi 3');
    expect(nextValue({ type: 'text' }, 'Hi', 'add', 3)).toBeUndefined();
    expect(nextValue({ type: 'boolean' }, false, 'assign', 'true')).toBe(true);
    expect(nextValue({ type: 'text' }, '', 'assign', 2.5)).toBe('2.5');
  });

  it('copies another variable, toggles, pauses and resumes the timeline, and asks for a URL', () => {
    const { engine, button, box, slide, events } = setup(({ slide, button, box, vars }) => {
      slide.triggers.push(
        trigger(
          objectOwner(button),
          { type: 'click', object: button.id },
          {
            type: 'setVariable',
            variable: vars.name!.id,
            operator: 'assign',
            operand: { kind: 'variable', variable: vars.count!.id },
          },
        ),
        trigger(
          objectOwner(button),
          { type: 'click', object: button.id },
          { type: 'toggleVariable', variable: vars.done!.id },
        ),
        trigger(
          objectOwner(button),
          { type: 'click', object: button.id },
          { type: 'pauseTimeline', layer: slide.baseLayer.id },
        ),
        trigger(
          objectOwner(box),
          { type: 'click', object: box.id },
          { type: 'resumeTimeline', layer: slide.baseLayer.id },
        ),
        trigger(
          objectOwner(box),
          { type: 'click', object: box.id },
          { type: 'openUrl', url: 'https://example.com' },
        ),
      );
    });
    engine.setVariable('Count', 7);
    engine.pointer('click', button.id);
    expect(engine.getVariable('Name')).toBe('7');
    expect(engine.getVariable('Done')).toBe(true);
    expect(engine.getView().layers[0]!.paused).toBe(true);
    engine.pointer('click', box.id);
    expect(engine.getView().layers[0]!.paused).toBe(false);
    expect(events.filter((e) => e.type === 'openUrl')).toEqual([
      { type: 'openUrl', url: 'https://example.com' },
    ]);
    expect(slide).toBeDefined();
  });

  it('shows and hides layers', () => {
    const layer = createLayer('Popup');
    const { engine, button, box } = setup(({ slide, button, box }) => {
      slide.layers.push(layer);
      slide.triggers.push(
        trigger(
          objectOwner(button),
          { type: 'click', object: button.id },
          { type: 'showLayer', layer: layer.id },
        ),
        trigger(
          objectOwner(box),
          { type: 'click', object: box.id },
          { type: 'hideLayer', layer: layer.id },
        ),
      );
    });
    engine.pointer('click', button.id);
    expect(engine.getView().layers.map((l) => l.id)).toContain(layer.id);
    engine.pointer('click', box.id);
    expect(engine.getView().layers.map((l) => l.id)).not.toContain(layer.id);
  });

  it('a click trigger sees the automatic state already applied', () => {
    const { engine, button } = setup(({ slide, button, vars }) => {
      button.states.push({ id: 'selected', name: 'Selected', overrides: {} });
      slide.triggers.push(
        trigger(
          objectOwner(button),
          { type: 'click', object: button.id },
          set(vars.name!, 'assign', 'yes'),
          {
            conditions: {
              combine: 'and',
              items: [
                { subject: 'objectState', object: button.id, operator: '==', state: 'selected' },
              ],
            },
          },
        ),
      );
    });
    engine.pointer('click', button.id);
    expect(engine.getVariable('Name')).toBe('yes');
  });
});

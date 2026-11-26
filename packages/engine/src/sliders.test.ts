import {
  createButtonObject,
  createDialObject,
  createEmptyProject,
  createId,
  createScene,
  createSlide,
  createSliderObject,
} from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { createEngine } from './index';
import type { EngineEvent } from './index';

/** Sliders and dials (docs/briefs/P9.4-sliders-dials.md). */

/**
 * A slider bound to Level (0 to 100 in fives), an unbound dial (0 to 1 in
 * tenths, starting at 0.5), and a button whose trigger sets Level to 42.
 */
function setup() {
  const project = createEmptyProject();
  const level = { id: createId('var'), name: 'Level', type: 'number' as const, default: 20 };
  project.variables.push(level);
  const slide = createSlide('One');
  const slider = createSliderObject({ x: 10, y: 10 });
  Object.assign(slider.props, { variable: level.id, min: 0, max: 100, step: 5, initial: 0 });
  const dial = createDialObject({ x: 10, y: 100 });
  Object.assign(dial.props, { min: 0, max: 1, step: 0.1, initial: 0.5 });
  const set = createButtonObject('Set');
  set.timing = { start: 0, duration: 'untilEnd' };
  slide.baseLayer.objects.push(slider, dial, set);
  slide.triggers.push({
    id: createId('trigger'),
    owner: { kind: 'object', id: set.id },
    event: { type: 'click', object: set.id },
    action: {
      type: 'setVariable',
      variable: level.id,
      operator: 'assign',
      operand: { kind: 'literal', value: 42 },
    },
    conditions: null,
    otherwise: null,
    enabled: true,
  });
  project.scenes = [{ ...createScene(), slides: [slide] }];
  const engine = createEngine(project);
  const events: EngineEvent[] = [];
  engine.on((event) => events.push(event));
  const value = (id: string) =>
    engine
      .getView()
      .layers.flatMap((layer) => layer.objects)
      .find((object) => object.id === id)?.controlValue;
  const moves = () => events.filter((event) => event.type === 'controlMoves').length;
  return { engine, slider, dial, set, value, moves, events };
}

describe('sliders and dials', () => {
  it('show a bound variable, and moving writes it at a step within the range, then raises the event', () => {
    const { engine, slider, value, moves, events } = setup();
    expect(value(slider.id)).toBe(20);
    // 37 is nearest 35; past the ends, the ends.
    expect(engine.moveControl(slider.id, 37)).toBe(true);
    expect(engine.getVariable('Level')).toBe(35);
    expect(value(slider.id)).toBe(35);
    engine.moveControl(slider.id, 900);
    expect(engine.getVariable('Level')).toBe(100);
    engine.moveControl(slider.id, -4);
    expect(engine.getVariable('Level')).toBe(0);
    expect(moves()).toBe(3);
    // The variable was written before the event.
    const kinds = events.map((event) => event.type);
    expect(kinds.indexOf('variableChange')).toBeLessThan(kinds.indexOf('controlMoves'));
    // No change, no event: 1 is nearest 0, where it already is.
    expect(engine.moveControl(slider.id, 1)).toBe(false);
    expect(moves()).toBe(3);
  });

  it('follow a trigger that sets the variable, at the nearest step, without a move event', () => {
    const { engine, slider, set, value, moves } = setup();
    engine.pointer('click', set.id);
    expect(engine.getVariable('Level')).toBe(42);
    // Shown at the nearest step; the variable is left as the trigger set it.
    expect(value(slider.id)).toBe(40);
    expect(moves()).toBe(0);
  });

  it('an unbound control keeps its own value from its initial one, in steps without dust', () => {
    const { engine, dial, value } = setup();
    expect(value(dial.id)).toBe(0.5);
    engine.moveControl(dial.id, 0.7300001);
    // 0.7 exactly, not 0.7000000000000001.
    expect(value(dial.id)).toBe(0.7);
    expect(engine.moveControl('obj_none', 3)).toBe(false);
  });
});

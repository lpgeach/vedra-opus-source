import {
  createButtonObject,
  createEmptyProject,
  createId,
  createLayer,
  createQuestionSlide,
  createScene,
  createSlide,
  createTextEntryObject,
} from '@vedraopus/model';
import type { Project, TextEntryObject, Trigger, TriggerAction } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { createEngine } from './index';
import type { EngineEvent } from './index';

/** Data-entry fields bound to variables (docs/briefs/P9.2-data-entry.md). */

/**
 * One slide: a text field bound to Name, a numeric field bound to Age (0 to
 * 120), a button that sets Name, and a "loses focus" trigger on the text
 * field that copies Name into Copy, so it shows what the trigger saw.
 */
function setup(
  change: (s: { project: Project; text: TextEntryObject; age: TextEntryObject }) => void = () => {},
) {
  const project = createEmptyProject('Fields');
  const name = { id: createId('var'), name: 'Name', type: 'text' as const, default: 'Sam' };
  const copy = { id: createId('var'), name: 'Copy', type: 'text' as const, default: '' };
  const age = { id: createId('var'), name: 'Age', type: 'number' as const, default: 30 };
  project.variables.push(name, copy, age);
  const slide = createSlide('One');
  const text = createTextEntryObject({ x: 40, y: 40 });
  text.props.variable = name.id;
  const ageField = createTextEntryObject({ x: 40, y: 120 }, true);
  ageField.props.variable = age.id;
  ageField.props.min = 0;
  ageField.props.max = 120;
  const set = createButtonObject('Set');
  set.timing = { start: 0, duration: 'untilEnd' };
  slide.baseLayer.objects.push(text, ageField, set);
  const trigger = (
    owner: Trigger['owner'],
    event: Trigger['event'],
    action: TriggerAction,
  ): Trigger => ({
    id: createId('trigger'),
    owner,
    event,
    action,
    conditions: null,
    otherwise: null,
    enabled: true,
  });
  slide.triggers.push(
    trigger(
      { kind: 'object', id: text.id },
      { type: 'controlLosesFocus', object: text.id },
      {
        type: 'setVariable',
        variable: copy.id,
        operator: 'assign',
        operand: { kind: 'variable', variable: name.id },
      },
    ),
    trigger(
      { kind: 'object', id: set.id },
      { type: 'click', object: set.id },
      {
        type: 'setVariable',
        variable: name.id,
        operator: 'assign',
        operand: { kind: 'literal', value: 'Robin' },
      },
    ),
  );
  project.scenes = [{ ...createScene(), slides: [slide] }];
  change({ project, text, age: ageField });
  const engine = createEngine(project);
  const events: EngineEvent[] = [];
  engine.on((event) => events.push(event));
  const value = (id: string) =>
    engine
      .getView()
      .layers.flatMap((layer) => layer.objects)
      .find((object) => object.id === id)?.value;
  return { engine, events, text, age: ageField, set, slide, value };
}

describe('data-entry fields', () => {
  it('show their variable, and write it when focus leaves, before the loses-focus trigger runs', () => {
    const { engine, events, text, value } = setup();
    expect(value(text.id)).toBe('Sam');
    engine.input(text.id, 'Ali');
    // While typing: what was typed; the variable is not written yet.
    expect(value(text.id)).toBe('Ali');
    expect(engine.getVariable('Name')).toBe('Sam');
    expect(engine.blur(text.id)).toBe(true);
    expect(engine.getVariable('Name')).toBe('Ali');
    // The trigger saw the new value.
    expect(engine.getVariable('Copy')).toBe('Ali');
    expect(value(text.id)).toBe('Ali');
    const order = events
      .filter((e) => e.type === 'variableChange' || e.type === 'controlLosesFocus')
      .map((e) => (e.type === 'variableChange' ? `set ${e.name}` : 'blur'));
    expect(order.slice(0, 2)).toEqual(['set Name', 'blur']);
  });

  it('follow a trigger’s change while the learner is not typing', () => {
    const { engine, text, set, value } = setup();
    engine.pointer('click', set.id);
    expect(value(text.id)).toBe('Robin');
    // Typing keeps what was typed, whatever the variable does meanwhile.
    engine.input(text.id, 'Jo');
    engine.pointer('click', set.id);
    expect(value(text.id)).toBe('Jo');
  });

  it('read numbers locale-neutrally, keep them within the limits, write blank as 0, and refuse what is not a number', () => {
    const { engine, age, value } = setup();
    expect(value(age.id)).toBe('30');
    for (const [typed, written] of [
      ['42.5', 42.5],
      ['  7 ', 7],
      ['500', 120], // past the greatest: the greatest
      ['-3', 0], // below the least: the least
      ['', 0],
      ['1e2', 100],
    ] as const) {
      engine.input(age.id, typed);
      engine.blur(age.id);
      expect(engine.getVariable('Age'), typed).toBe(written);
    }
    engine.input(age.id, '3x');
    engine.blur(age.id);
    // Not a number: not written, and the field shows the variable again.
    expect(engine.getVariable('Age')).toBe(100);
    expect(value(age.id)).toBe('100');
  });

  it('work on an overlay layer too, and raise the event for an unbound field and a dropdown', () => {
    const { engine, events, slide } = setup((s) => {
      const layer = createLayer('Form');
      const field = createTextEntryObject({ x: 10, y: 10 });
      field.id = 'obj_overlayfield';
      field.props.variable = s.project.variables[0]!.id;
      layer.objects.push(field);
      const unbound = createTextEntryObject({ x: 10, y: 80 });
      unbound.id = 'obj_unbound';
      layer.objects.push(unbound);
      s.project.scenes[0]!.slides[0]!.layers.push(layer);
    });
    engine.showLayer(slide.layers[0]!.id);
    expect(engine.input('obj_overlayfield', 'Layered')).toBe(true);
    engine.blur('obj_overlayfield');
    expect(engine.getVariable('Name')).toBe('Layered');
    engine.input('obj_unbound', 'kept');
    engine.blur('obj_unbound');
    expect(
      events
        .filter((e) => e.type === 'controlLosesFocus')
        .map((e) => (e as { objectId: string }).objectId),
    ).toEqual(['obj_overlayfield', 'obj_unbound']);
    expect(engine.blur('obj_none')).toBe(false);
  });

  it('a bound question field still gives the question what was typed', () => {
    const project = createEmptyProject();
    const variable = { id: createId('var'), name: 'Answer', type: 'text' as const, default: '' };
    project.variables.push(variable);
    const quiz = createQuestionSlide('fillInBlank', project.stage);
    const field = quiz.baseLayer.objects.find(
      (object) => object.type === 'textEntry',
    ) as TextEntryObject;
    field.props.variable = variable.id;
    project.scenes = [{ ...createScene(), slides: [quiz] }];
    const engine = createEngine(project);
    engine.input(field.id, 'Paris');
    engine.blur(field.id);
    expect(engine.getVariable('Answer')).toBe('Paris');
    expect(engine.getState().q?.[quiz.id]?.v).toEqual(['Paris']);
  });
});

import {
  createButtonObject,
  createEmptyProject,
  createGroupObject,
  createId,
  createPanoramaObject,
  createPanoramaSpot,
  createSliderObject,
  createTextEntryObject,
  createScene,
  createSlide,
} from '@vedraopus/model';
import type { Project, SceneObject, Trigger, TriggerAction, TriggerEvent } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { createEngine } from './index';

const LOG = 'var_grouplog00000000';

const trigger = (owner: SceneObject, event: TriggerEvent, action: TriggerAction): Trigger => ({
  id: createId('trigger'),
  owner: { kind: 'object', id: owner.id },
  event,
  action,
  conditions: null,
  otherwise: null,
  enabled: true,
});
const append = (text: string): TriggerAction => ({
  type: 'setVariable',
  variable: LOG,
  operator: 'append',
  operand: { kind: 'literal', value: text },
});

/** A group of two buttons, as authors make when they group a button with its label. */
function course(
  build: (parts: { a: SceneObject; b: SceneObject; group: SceneObject }) => Trigger[] = () => [],
) {
  const a = createButtonObject('A', { x: 0, y: 0 }, 'A');
  const b = createButtonObject('B', { x: 200, y: 0 }, 'B');
  for (const id of ['hover', 'selected', 'disabled']) {
    a.states.push({ id, name: id, overrides: {} });
  }
  const group = createGroupObject([a, b], 'Pair');
  group.timing = { start: 0, duration: 'untilEnd' };
  group.states.push({ id: 'hover', name: 'Hover', overrides: {} });
  const slide = createSlide('Groups');
  slide.baseLayer.objects.push(group);
  slide.triggers.push(...build({ a, b, group }));
  const project: Project = createEmptyProject();
  project.scenes = [{ ...createScene(), slides: [slide] }];
  project.variables.push({ id: LOG, name: 'Log', type: 'text', default: '' });
  const engine = createEngine(project);
  const stateOf = (id: string) => {
    const view = engine.getView().layers[0]!.objects[0]!;
    return id === view.id ? view.state : view.parts?.[id]?.state;
  };
  return { engine, a, b, group, stateOf, project };
}

describe('objects inside groups', () => {
  it('a click on a grouped object runs its own triggers, then the group’s', () => {
    const { engine, a } = course(({ a, group }) => [
      trigger(group, { type: 'click', object: group.id }, append('group')),
      trigger(a, { type: 'click', object: a.id }, append('a ')),
    ]);
    expect(engine.pointer('click', a.id)).toBe(true);
    expect(engine.getVariable('Log')).toBe('a group');
  });

  it('a grouped object has its own automatic states, and the group has its own', () => {
    const { engine, a, b, group, stateOf } = course();
    // The view reports exactly what the pointer entered: the group, then the button inside it.
    engine.pointer('enter', group.id);
    engine.pointer('enter', a.id);
    expect(stateOf(a.id)).toBe('hover');
    expect(stateOf(group.id)).toBe('hover');
    engine.pointer('click', a.id);
    engine.pointer('leave', a.id);
    expect(stateOf(a.id)).toBe('selected');
    // Still over the group, now over B: the group keeps its hover, B has none to show.
    engine.pointer('enter', b.id);
    expect(stateOf(group.id)).toBe('hover');
    expect(stateOf(b.id)).toBe('normal');
  });

  it('change state and disabled reach grouped objects', () => {
    const { engine, a, b } = course(({ a, b }) => [
      trigger(
        b,
        { type: 'click', object: b.id },
        { type: 'changeState', object: a.id, state: 'disabled' },
      ),
      trigger(a, { type: 'click', object: a.id }, append('a')),
    ]);
    engine.pointer('click', b.id);
    expect(engine.pointer('click', a.id)).toBe(false);
    expect(engine.getVariable('Log')).toBe('');
    expect(engine.setObjectState(a.id, 'normal')).toBe(true);
    engine.pointer('click', a.id);
    expect(engine.getVariable('Log')).toBe('a');
  });

  it('a script finds grouped objects by name', () => {
    const { project, a } = course();
    let seen = '';
    const scripted = createEngine(project, {
      runScript: (code, api) => {
        seen = `${api.object('A')?.state}/${api.object('Pair')?.state}`;
        api.object('A')?.hide();
        void code;
      },
    });
    project.scenes[0]!.slides[0]!.triggers.push(
      trigger(a, { type: 'click', object: a.id }, { type: 'executeJavaScript', code: 'x' }),
    );
    scripted.jumpToSlide(project.scenes[0]!.slides[0]!.id);
    scripted.pointer('click', a.id);
    expect(seen).toBe('selected/normal');
    expect(scripted.getView().layers[0]!.objects[0]!.parts?.[a.id]?.visible).toBe(false);
  });

  it('a disabled group refuses input for everything inside it', () => {
    const { engine, a, group } = course(({ a }) => [
      trigger(a, { type: 'click', object: a.id }, append('a')),
    ]);
    group.states.push({ id: 'disabled', name: 'Disabled', overrides: {} });
    engine.setObjectState(group.id, 'disabled');
    expect(engine.pointer('click', a.id)).toBe(false);
    expect(engine.getVariable('Log')).toBe('');
  });
});

describe('fields, controls and 360° images inside a group (the Phase 9 review)', () => {
  it('carry their value, control value and visited spots in the group’s view, and take input', () => {
    const project = createEmptyProject();
    const PICTURE = 'a'.repeat(64);
    project.assets[PICTURE] = {
      kind: 'image',
      fileName: 'room.jpg',
      ext: 'jpg',
      mimeType: 'image/jpeg',
      byteLength: 1,
    };
    const level = { id: createId('var'), name: 'Level', type: 'number' as const, default: 3 };
    const name = { id: createId('var'), name: 'Who', type: 'text' as const, default: 'Ada' };
    project.variables.push(level, name);
    const slider = createSliderObject({ x: 0, y: 0 });
    slider.props.variable = level.id;
    const field = createTextEntryObject({ x: 0, y: 100 });
    field.props.variable = name.id;
    const image = createPanoramaObject(PICTURE, { x: 0, y: 200 });
    const spot = createPanoramaSpot('Door');
    image.props.spots = [spot];
    const group = createGroupObject([slider, field, image], 'Controls');
    const slide = createSlide('One');
    slide.baseLayer.objects.push(group);
    project.scenes = [{ ...createScene(), slides: [slide] }];
    const engine = createEngine(project);
    engine.tick(0);
    const parts = () =>
      engine
        .getView()
        .layers.flatMap((layer) => layer.objects)
        .find((each) => each.id === group.id)!.parts!;
    expect(parts()[slider.id]).toMatchObject({ controlValue: 3 });
    expect(parts()[field.id]).toMatchObject({ value: 'Ada' });
    expect(parts()[image.id]).toMatchObject({ visitedSpots: [] });
    // The learner's input reaches them as it would outside the group.
    expect(engine.moveControl(slider.id, 7)).toBe(true);
    expect(engine.getVariable('Level')).toBe(7);
    expect(parts()[slider.id]!.controlValue).toBe(7);
    expect(engine.openSpot(image.id, spot.id)).toBe(true);
    expect(parts()[image.id]!.visitedSpots).toEqual([spot.id]);
    engine.setVariable('Who', 'Grace');
    expect(parts()[field.id]!.value).toBe('Grace');
  });
});

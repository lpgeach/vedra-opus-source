import { describe, expect, it } from 'vitest';
import {
  createDialObject,
  createEmptyProject,
  createHistory,
  createId,
  createShapeObject,
  createSliderObject,
  migrateToCurrent,
  parseProject,
  ProjectValidationError,
  snapToStep,
} from './index';
import type { DialObject, Project, SliderObject } from './index';

/** Sliders and dials (docs/briefs/P9.4-sliders-dials.md). */

const issues = (project: Project): string[] => {
  try {
    parseProject(JSON.parse(JSON.stringify(project)));
    return [];
  } catch (error) {
    if (error instanceof ProjectValidationError) return error.issues.map((issue) => issue.path);
    throw error;
  }
};

function course() {
  const project = createEmptyProject();
  const level = { id: createId('var'), name: 'Level', type: 'number' as const, default: 0 };
  const label = { id: createId('var'), name: 'Label', type: 'text' as const, default: '' };
  project.variables.push(level, label);
  const slide = project.scenes[0]!.slides[0]!;
  const slider = createSliderObject();
  const dial = createDialObject();
  slide.baseLayer.objects.push(slider, dial);
  return { project, slide, slider, dial, level, label };
}
const at = (index: number) => `scenes[0].slides[0].baseLayer.objects[${index}].props`;

describe('a dial drawn its own way (B16)', () => {
  const PICTURE = 'd'.repeat(64);
  const looked = () => {
    const made = course();
    made.project.assets[PICTURE] = {
      kind: 'image',
      fileName: 'knob.png',
      ext: 'png',
      mimeType: 'image/png',
      byteLength: 10,
    };
    made.dial.props.look = {
      pointer: 'M0.5 0L0.08 0.74L0.5 1L0.92 0.74Z',
      pivot: { x: 0.5, y: 0.74 },
      from: -50.4,
      to: 46.8,
      face: { asset: PICTURE, size: 26 },
    };
    return made;
  };

  it('validates with its pointer, pivot, angles and face picture', () => {
    expect(issues(looked().project)).toEqual([]);
  });

  it('refuses a pointer that is not path data, equal angles, and a face that is not a picture', () => {
    const bad = looked();
    bad.dial.props.look!.pointer = 'M0 0A1 1 0 0 1 1 1';
    expect(issues(bad.project)).toEqual([`${at(1)}.look.pointer`]);
    const still = looked();
    still.dial.props.look!.to = -50.4;
    expect(issues(still.project)).toEqual([`${at(1)}.look`]);
    const sound = looked();
    sound.project.assets[PICTURE]!.kind = 'audio';
    expect(issues(sound.project)).toEqual([`${at(1)}.look.face.asset`]);
  });

  it('migrates a v39 dial to ours: no look of its own', () => {
    const { project } = course();
    const raw = JSON.parse(JSON.stringify(project));
    raw.formatVersion = 39;
    delete raw.scenes[0].slides[0].baseLayer.objects[1].props.look;
    const dial = parseProject(raw).scenes[0]!.slides[0]!.baseLayer.objects[1] as DialObject;
    expect(dial.props.look).toBeNull();
  });
});

describe('sliders and dials in the model', () => {
  it('snap a value to a step within the range, without floating-point dust', () => {
    const props = { min: 0, max: 1, step: 0.1 };
    expect(snapToStep(props, 0.33)).toBe(0.3);
    expect(snapToStep(props, 0.35)).toBe(0.4);
    expect(snapToStep(props, 0.7)).toBe(0.7);
    expect(snapToStep(props, 5)).toBe(1);
    expect(snapToStep(props, -5)).toBe(0);
    expect(snapToStep(props, Number.NaN)).toBe(0);
    // Steps count from the least value: 3, 8, 13 … with a step of 5 from 3.
    expect(snapToStep({ min: 3, max: 20, step: 5 }, 10)).toBe(8);
    // The last step cannot pass the greatest: 18 is the nearest step to 19.9 within 3 to 20.
    expect(snapToStep({ min: 3, max: 20, step: 5 }, 19.9)).toBe(18);
  });

  it('validate the range, the step, the start and a number variable', () => {
    const { project, slider, dial, level, label } = course();
    expect(issues(project)).toEqual([]);
    slider.props.variable = level.id;
    dial.props.variable = label.id;
    expect(issues(project)).toEqual([`${at(1)}.variable`]);
    dial.props.variable = null;
    Object.assign(slider.props, { min: 5, max: 5 });
    expect(issues(project)).toContain(`${at(0)}.max`);
    Object.assign(slider.props, { min: 0, max: 10, step: 20 });
    expect(issues(project)).toContain(`${at(0)}.step`);
    Object.assign(slider.props, { step: 1, initial: 11 });
    expect(issues(project)).toContain(`${at(0)}.initial`);
  });

  it('take a moves event only of a slider or dial', () => {
    const { project, slide, slider } = course();
    const shape = createShapeObject({ kind: 'rect' });
    slide.baseLayer.objects.push(shape);
    const on = (object: string) => ({
      id: createId('trigger'),
      owner: { kind: 'slide' as const, id: slide.id },
      event: { type: 'controlMoves' as const, object },
      action: { type: 'completeCourse' as const },
      conditions: null,
      otherwise: null,
      enabled: true,
    });
    slide.triggers.push(on(slider.id));
    expect(issues(project)).toEqual([]);
    slide.triggers.push(on(shape.id));
    expect(issues(project)).toContain('scenes[0].slides[0].triggers[1].event.object');
  });

  it('are unbound when their variable is removed or no longer a number', () => {
    const { project, slider, dial, level } = course();
    slider.props.variable = level.id;
    dial.props.variable = level.id;
    const history = createHistory(parseProject(JSON.parse(JSON.stringify(project))));
    const bound = () =>
      history.project.scenes[0]!.slides[0]!.baseLayer.objects.map(
        (object) => (object as SliderObject | DialObject).props.variable,
      );
    history.execute('variable.update', {
      variableId: level.id,
      changes: { type: 'text', default: '' },
    });
    expect(bound()).toEqual([null, null]);
    history.undo();
    expect(bound()).toEqual([level.id, level.id]);
    history.execute('variable.remove', { variableId: level.id });
    expect(bound()).toEqual([null, null]);
  });

  it('migrate from format 27 unchanged', () => {
    const old = JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown>;
    old['formatVersion'] = 27;
    expect(() => parseProject(migrateToCurrent(old))).not.toThrow();
  });
});

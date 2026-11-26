import { describe, expect, it } from 'vitest';
import {
  createDropdownObject,
  createEmptyProject,
  createHistory,
  createId,
  createShapeObject,
  createTextEntryObject,
  migrateToCurrent,
  parseProject,
  ProjectValidationError,
} from './index';
import type { Project, TextEntryObject } from './index';

/** Data-entry fields bound to variables (docs/briefs/P9.2-data-entry.md). */

const issues = (project: Project): string[] => {
  try {
    parseProject(JSON.parse(JSON.stringify(project)));
    return [];
  } catch (error) {
    if (error instanceof ProjectValidationError) return error.issues.map((issue) => issue.path);
    throw error;
  }
};

/** A course with a text variable and a number variable, and a text and a numeric field on slide 1. */
function course() {
  const project = createEmptyProject();
  const name = { id: createId('var'), name: 'Name', type: 'text' as const, default: '' };
  const age = { id: createId('var'), name: 'Age', type: 'number' as const, default: 0 };
  project.variables.push(name, age);
  const slide = project.scenes[0]!.slides[0]!;
  const text = createTextEntryObject({ x: 0, y: 0 });
  const numeric = createTextEntryObject({ x: 0, y: 60 }, true);
  slide.baseLayer.objects.push(text, numeric);
  const at = (field: TextEntryObject) =>
    `scenes[0].slides[0].baseLayer.objects[${slide.baseLayer.objects.indexOf(field)}].props`;
  return { project, slide, name, age, text, numeric, at };
}

describe('data-entry fields in the model', () => {
  it('bind a text field to a text variable and a numeric one to a number variable, and nothing else', () => {
    const { project, name, age, text, numeric, at } = course();
    text.props.variable = name.id;
    numeric.props.variable = age.id;
    expect(issues(project)).toEqual([]);
    text.props.variable = age.id;
    numeric.props.variable = name.id;
    expect(issues(project)).toEqual(
      expect.arrayContaining([`${at(text)}.variable`, `${at(numeric)}.variable`]),
    );
    text.props.variable = 'var_gone';
    expect(issues(project)).toContain(`${at(text)}.variable`);
  });

  it('give least and greatest values to numeric fields only, least first', () => {
    const { project, text, numeric, at } = course();
    numeric.props.min = 0;
    numeric.props.max = 10;
    expect(issues(project)).toEqual([]);
    numeric.props.min = 11;
    expect(issues(project)).toContain(`${at(numeric)}.max`);
    numeric.props.min = null;
    text.props.max = 5;
    expect(issues(project)).toContain(`${at(text)}.min`);
  });

  it('take a loses-focus event only of a text entry or dropdown', () => {
    const { project, slide, text } = course();
    const shape = createShapeObject({ kind: 'rect' });
    const list = createDropdownObject(['A', 'B']);
    slide.baseLayer.objects.push(shape, list);
    const on = (object: string) => ({
      id: createId('trigger'),
      owner: { kind: 'slide' as const, id: slide.id },
      event: { type: 'controlLosesFocus' as const, object },
      action: { type: 'completeCourse' as const },
      conditions: null,
      otherwise: null,
      enabled: true,
    });
    slide.triggers.push(on(text.id), on(list.id));
    expect(issues(project)).toEqual([]);
    slide.triggers.push(on(shape.id));
    expect(issues(project)).toContain('scenes[0].slides[0].triggers[2].event.object');
  });

  it('unbind a field whose variable is removed or changes type, with undo', () => {
    const { project, name, age, text, numeric } = course();
    text.props.variable = name.id;
    numeric.props.variable = age.id;
    const history = createHistory(parseProject(JSON.parse(JSON.stringify(project))));
    const fields = () =>
      history.project.scenes[0]!.slides[0]!.baseLayer.objects.filter(
        (object): object is TextEntryObject => object.type === 'textEntry',
      );
    history.execute('variable.update', {
      variableId: name.id,
      changes: { type: 'number', default: 0 },
    });
    expect(fields().map((field) => field.props.variable)).toEqual([null, age.id]);
    history.execute('variable.remove', { variableId: age.id });
    expect(fields().map((field) => field.props.variable)).toEqual([null, null]);
    expect(issues(history.project)).toEqual([]);
    history.undo();
    history.undo();
    expect(fields().map((field) => field.props.variable)).toEqual([name.id, age.id]);
  });

  it('migrate from format 26: text entries, in banks too, are unbound', () => {
    const project = createEmptyProject();
    const field = createTextEntryObject();
    project.scenes[0]!.slides[0]!.baseLayer.objects.push(field);
    const old = JSON.parse(JSON.stringify(project)) as Record<string, unknown>;
    old['formatVersion'] = 26;
    const props = (
      old['scenes'] as {
        slides: { baseLayer: { objects: { props: Record<string, unknown> }[] } }[];
      }[]
    )[0]!.slides[0]!.baseLayer.objects[0]!.props;
    delete props['variable'];
    delete props['min'];
    delete props['max'];
    const migrated = parseProject(migrateToCurrent(old));
    const entry = migrated.scenes[0]!.slides[0]!.baseLayer.objects[0] as TextEntryObject;
    expect(entry.props).toMatchObject({ variable: null, min: null, max: null });
  });
});

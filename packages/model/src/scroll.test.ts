import { describe, expect, it } from 'vitest';
import {
  createBank,
  createEmptyProject,
  createGroupObject,
  createHistory,
  createQuestionSlide,
  createShapeObject,
  migrateToCurrent,
  parseProject,
  ProjectValidationError,
} from './index';
import type { GroupObject } from './index';

/** Scrolling panels (docs/briefs/P9.5-scrolling-panels.md). */

const shape = (y: number) =>
  createShapeObject({ kind: 'rect' }, { x: 0, y, width: 100, height: 100 });

describe('scrolling panels in the model', () => {
  it('are groups with a window height above 0, or ordinary groups with none', () => {
    const project = createEmptyProject();
    const group = createGroupObject([shape(0), shape(300)]);
    expect(group.scroll).toBeNull();
    group.scroll = { height: 150 };
    project.scenes[0]!.slides[0]!.baseLayer.objects.push(group);
    expect(() => parseProject(JSON.parse(JSON.stringify(project)))).not.toThrow();
    group.scroll = { height: 0 };
    expect(() => parseProject(JSON.parse(JSON.stringify(project)))).toThrow(ProjectValidationError);
  });

  it('turn scrolling on and off as one undo step each', () => {
    const project = createEmptyProject();
    const group = createGroupObject([shape(0), shape(300)]);
    project.scenes[0]!.slides[0]!.baseLayer.objects.push(group);
    const history = createHistory(parseProject(JSON.parse(JSON.stringify(project))));
    const scroll = () =>
      (history.project.scenes[0]!.slides[0]!.baseLayer.objects[0] as GroupObject).scroll;
    history.execute('object.update', { objectId: group.id, changes: { scroll: { height: 120 } } });
    expect(scroll()).toEqual({ height: 120 });
    history.undo();
    expect(scroll()).toBeNull();
  });

  it('migrate from format 28: every group, nested and in banks, does not scroll', () => {
    const project = createEmptyProject();
    const inner = createGroupObject([shape(0), shape(120)]);
    const outer = createGroupObject([inner, shape(400)]);
    project.scenes[0]!.slides[0]!.baseLayer.objects.push(outer);
    const bank = createBank('Bank', project.stage);
    const banked = createQuestionSlide('trueFalse', project.stage);
    banked.baseLayer.objects.push(createGroupObject([shape(0), shape(200)]));
    bank.slides.push(banked);
    project.banks.push(bank);
    const old = JSON.parse(JSON.stringify(project)) as Record<string, unknown>;
    old['formatVersion'] = 28;
    const strip = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(strip);
      else if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        if (record['type'] === 'group') delete record['scroll'];
        Object.values(record).forEach(strip);
      }
    };
    strip(old);
    expect(JSON.stringify(old)).not.toContain('"scroll"');
    const migrated = parseProject(migrateToCurrent(old));
    const outerGroup = migrated.scenes[0]!.slides[0]!.baseLayer.objects[0] as GroupObject;
    expect(outerGroup.scroll).toBeNull();
    expect((outerGroup.children[0] as GroupObject).scroll).toBeNull();
  });
});

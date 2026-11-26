import { describe, expect, it } from 'vitest';
import {
  createBank,
  createEmptyProject,
  createGroupObject,
  createHistory,
  createId,
  createQuestionSlide,
  createShapeObject,
  migrateToCurrent,
  parseProject,
  ProjectValidationError,
} from './index';
import type { GroupObject, Project, TriggerEvent } from './index';

/** Dragging and intersections (docs/briefs/P9.7-drag-intersections.md). */

const shape = (x: number) =>
  createShapeObject({ kind: 'rect' }, { x, y: 0, width: 100, height: 100 });

const issues = (project: Project): string[] => {
  try {
    parseProject(JSON.parse(JSON.stringify(project)));
    return [];
  } catch (error) {
    if (error instanceof ProjectValidationError) return error.issues.map((issue) => issue.path);
    throw error;
  }
};

const withTrigger = (project: Project, event: TriggerEvent) => {
  const slide = project.scenes[0]!.slides[0]!;
  slide.triggers.push({
    id: createId('trigger'),
    owner: { kind: 'slide', id: slide.id },
    event,
    action: { type: 'jumpToSlide', target: { kind: 'next' } },
    conditions: null,
    otherwise: null,
    enabled: true,
  });
};

describe('dragging in the model', () => {
  it('lets an object at the top of a layer be dragged, not one inside a group', () => {
    const project = createEmptyProject();
    const top = shape(0);
    expect(top.drag).toBeNull();
    top.drag = { returnToStart: true };
    const inner = shape(200);
    const group = createGroupObject([inner, shape(400)]);
    project.scenes[0]!.slides[0]!.baseLayer.objects.push(top, group);
    expect(issues(project)).toEqual([]);
    inner.drag = { returnToStart: false };
    expect(issues(project)).toContain('scenes[0].slides[0].baseLayer.objects[1].children[0].drag');
  });

  it('checks that the new events name objects on the slide', () => {
    const project = createEmptyProject();
    const [a, b] = [shape(0), shape(200)];
    project.scenes[0]!.slides[0]!.baseLayer.objects.push(a, b);
    withTrigger(project, { type: 'droppedOn', object: a.id, target: b.id });
    withTrigger(project, { type: 'draggedOver', object: a.id, target: b.id });
    withTrigger(project, { type: 'intersects', object: a.id, other: b.id });
    withTrigger(project, { type: 'stopsIntersecting', object: b.id, other: a.id });
    expect(issues(project)).toEqual([]);
    withTrigger(project, { type: 'droppedOn', object: a.id, target: 'missing' });
    withTrigger(project, { type: 'intersects', object: 'gone', other: a.id });
    expect(issues(project)).toEqual([
      'scenes[0].slides[0].triggers[4].event.target',
      'scenes[0].slides[0].triggers[5].event.object',
    ]);
  });

  it('sets dragging as one undo step, refuses it inside a group, and grouping clears it', () => {
    const project = createEmptyProject();
    const [a, b] = [shape(0), shape(200)];
    const inner = shape(400);
    project.scenes[0]!.slides[0]!.baseLayer.objects.push(
      a,
      b,
      createGroupObject([inner, shape(600)]),
    );
    const history = createHistory(parseProject(JSON.parse(JSON.stringify(project))));
    const objects = () => history.project.scenes[0]!.slides[0]!.baseLayer.objects;
    history.execute('object.update', {
      objectId: a.id,
      changes: { drag: { returnToStart: false } },
    });
    expect(objects()[0]!.drag).toEqual({ returnToStart: false });
    history.undo();
    expect(objects()[0]!.drag).toBeNull();
    history.redo();
    expect(() =>
      history.execute('object.update', {
        objectId: inner.id,
        changes: { drag: { returnToStart: true } },
      }),
    ).toThrow(/cannot be dragged/);
    history.execute('object.group', {
      objectIds: [a.id, b.id],
      group: { ...createGroupObject([]), children: [] },
    });
    const group = objects().find((each) => each.type === 'group' && each.children.length === 2);
    expect((group as GroupObject).children.map((child) => child.drag)).toEqual([null, null]);
  });

  it('removing an object removes the triggers that wait for it as a target or other', () => {
    const project = createEmptyProject();
    const [a, b] = [shape(0), shape(200)];
    project.scenes[0]!.slides[0]!.baseLayer.objects.push(a, b);
    withTrigger(project, { type: 'droppedOn', object: a.id, target: b.id });
    withTrigger(project, { type: 'intersects', object: a.id, other: b.id });
    const history = createHistory(parseProject(JSON.parse(JSON.stringify(project))));
    history.execute('object.remove', { objectIds: [b.id] });
    expect(history.project.scenes[0]!.slides[0]!.triggers).toEqual([]);
  });

  it('migrate from format 30: every object, nested, in banks and on masters, is not draggable', () => {
    const project = createEmptyProject();
    project.scenes[0]!.slides[0]!.baseLayer.objects.push(createGroupObject([shape(0), shape(200)]));
    const bank = createBank('Bank', project.stage);
    const banked = createQuestionSlide('trueFalse', project.stage);
    banked.baseLayer.objects.push(shape(0));
    bank.slides.push(banked);
    project.banks.push(bank);
    project.masters[0]!.layer.objects.push(shape(0));
    const old = JSON.parse(JSON.stringify(project)) as Record<string, unknown>;
    old['formatVersion'] = 30;
    const strip = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(strip);
      else if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        delete record['drag'];
        Object.values(record).forEach(strip);
      }
    };
    strip(old);
    expect(JSON.stringify(old)).not.toContain('"drag"');
    const migrated = parseProject(migrateToCurrent(old));
    const text = JSON.stringify(migrated);
    expect(text).not.toContain('"drag":{');
    const group = migrated.scenes[0]!.slides[0]!.baseLayer.objects[0] as GroupObject;
    expect(group.drag).toBeNull();
    expect(group.children[0]!.drag).toBeNull();
    expect(migrated.banks[0]!.slides[0]!.baseLayer.objects.at(-1)!.drag).toBeNull();
    expect(migrated.masters[0]!.layer.objects.at(-1)!.drag).toBeNull();
  });
});

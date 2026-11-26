import { describe, expect, it } from 'vitest';
import {
  createButtonObject,
  createEmptyProject,
  createGroupObject,
  createHistory,
  createLayer,
  createShapeObject,
  migrateToCurrent,
  parseProject,
  ProjectValidationError,
  tabbableObjects,
  tabOrder,
} from './index';
import type { Project } from './index';

/** A slide's Tab order (docs/briefs/P10.1-accessibility.md, part B). */

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
  const slide = project.scenes[0]!.slides[0]!;
  const [a, b] = [createButtonObject('A'), createButtonObject('B')];
  const inner = createButtonObject('Inner');
  const group = createGroupObject([inner, createShapeObject({ kind: 'rect' })]);
  const overlay = createLayer('More');
  const c = createButtonObject('C');
  overlay.objects.push(c);
  slide.baseLayer.objects.push(a, b, group);
  slide.layers.push(overlay);
  return { project, slide, a, b, c, inner, group, overlay };
}

describe('a slide’s Tab order', () => {
  it('starts as the layout’s, and may list the slide’s objects, each once, on any layer', () => {
    const { project, slide, a, b, c, inner } = course();
    expect(slide.properties.focusOrder).toBeNull();
    slide.properties.focusOrder = [b.id, inner.id, c.id, a.id];
    expect(issues(project)).toEqual([]);
    slide.properties.focusOrder = [b.id, 'obj_missing', b.id];
    expect(issues(project)).toEqual([
      'scenes[0].slides[0].properties.focusOrder[1]',
      'scenes[0].slides[0].properties.focusOrder[2]',
    ]);
  });

  it('is set as one undo step, and loses objects that are removed, ungrouped or go with their layer', () => {
    const { project, slide, a, b, c, inner, group, overlay } = course();
    const history = createHistory(parseProject(JSON.parse(JSON.stringify(project))));
    const order = () => history.project.scenes[0]!.slides[0]!.properties.focusOrder;
    history.execute('slide.setProperties', {
      slideId: slide.id,
      properties: { focusOrder: [b.id, group.id, inner.id, c.id, a.id] },
    });
    expect(order()).toEqual([b.id, group.id, inner.id, c.id, a.id]);
    history.undo();
    expect(order()).toBeNull();
    history.redo();
    history.execute('object.remove', { objectIds: [a.id] });
    expect(order()).toEqual([b.id, group.id, inner.id, c.id]);
    history.execute('object.ungroup', { groupId: group.id });
    expect(order()).toEqual([b.id, inner.id, c.id]);
    history.execute('layer.remove', { layerId: overlay.id });
    expect(order()).toEqual([b.id, inner.id]);
  });

  it('migrates from format 34 as the layout’s order, on scene and bank slides', () => {
    const project = createEmptyProject();
    const old = JSON.parse(JSON.stringify(project)) as {
      formatVersion: number;
      scenes: { slides: { properties: Record<string, unknown> }[] }[];
    };
    old.formatVersion = 34;
    delete old.scenes[0]!.slides[0]!.properties['focusOrder'];
    const migrated = parseProject(migrateToCurrent(old));
    expect(migrated.scenes[0]!.slides[0]!.properties.focusOrder).toBeNull();
  });
});

describe('which objects Tab reaches, and in what order', () => {
  it('reaches controls, clickable and draggable objects, and orders them by layout or the author', () => {
    const project = createEmptyProject();
    const slide = project.scenes[0]!.slides[0]!;
    const low = createButtonObject('Low', { x: 0, y: 300 });
    const right = createButtonObject('Right', { x: 400, y: 100 });
    const left = createButtonObject('Left', { x: 10, y: 102 });
    const plain = createShapeObject({ kind: 'rect' }, { x: 0, y: 0 });
    const clicked = createShapeObject({ kind: 'rect' }, { x: 600, y: 500 });
    const dragged = createShapeObject({ kind: 'ellipse' }, { x: 700, y: 0 });
    dragged.drag = { returnToStart: false };
    slide.baseLayer.objects.push(low, right, left, plain, clicked, dragged);
    slide.triggers.push({
      id: 'trigger_clicked0000000',
      owner: { kind: 'object', id: clicked.id },
      event: { type: 'click', object: clicked.id },
      action: { type: 'jumpToSlide', target: { kind: 'next' } },
      conditions: null,
      otherwise: null,
      enabled: true,
    });
    const names = () => tabOrder(slide).map((object) => object.id);
    // The plain shape is not reached. Left and Right are one row (2 pixels apart).
    expect(
      tabbableObjects(slide)
        .map((object) => object.id)
        .sort(),
    ).toEqual([low.id, right.id, left.id, clicked.id, dragged.id].sort());
    expect(names()).toEqual([dragged.id, left.id, right.id, low.id, clicked.id]);
    // The author's list first; anything not in it follows by layout.
    slide.properties.focusOrder = [low.id, left.id];
    expect(names()).toEqual([low.id, left.id, dragged.id, right.id, clicked.id]);
  });
});

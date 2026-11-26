import { describe, expect, it } from 'vitest';
import {
  createEffect,
  createEmptyProject,
  createGroupObject,
  createHistory,
  createShapeObject,
  createZoomRegion,
  createLayer,
  createTransition,
  migrateToCurrent,
  parseProject,
  ProjectValidationError,
  transitionDirections,
  transitionKinds,
  transitionSchema,
} from './index';
import type { Project } from './index';

const issues = (project: Project): string[] => {
  try {
    parseProject(JSON.parse(JSON.stringify(project)));
    return [];
  } catch (error) {
    if (error instanceof ProjectValidationError) return error.issues.map((issue) => issue.message);
    throw error;
  }
};

describe('transitions in the saved format', () => {
  it('takes each kind with its own directions, the first by default', () => {
    for (const kind of transitionKinds) {
      const transition = createTransition(kind);
      expect(transitionSchema.safeParse(transition).success, kind).toBe(true);
      expect(transition.direction).toBe(transitionDirections[kind][0] ?? null);
    }
    for (const bad of [
      { ...createTransition('push'), direction: 'horizontal' },
      { ...createTransition('fade'), direction: 'left' },
      { ...createTransition('wipe'), direction: null },
      { ...createTransition('fade'), duration: 0.05 },
      { ...createTransition('fade'), duration: 6 },
    ]) {
      expect(transitionSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('lets slides and overlay layers have one, but not a base layer', () => {
    const project = createEmptyProject();
    const slide = project.scenes[0]!.slides[0]!;
    slide.properties.transition = createTransition('push');
    const overlay = createLayer('Pop-up');
    overlay.properties.transition = createTransition('fade');
    slide.layers.push(overlay);
    expect(issues(project)).toEqual([]);
    slide.baseLayer.properties.transition = createTransition('fade');
    expect(issues(project)).toEqual(['only an overlay layer can have a transition']);
  });

  it('gives every slide and layer of an older project no transition', () => {
    const layer = () => ({ properties: { onRevisit: 'auto' } });
    const v9 = {
      formatVersion: 9,
      scenes: [{ slides: [{ properties: {}, baseLayer: layer(), layers: [layer()] }] }],
      masters: [{ layer: layer(), layouts: [{ layer: layer() }] }],
    };
    const migrated = migrateToCurrent(v9) as typeof v9 & { formatVersion: number };
    expect(migrated.formatVersion).toBeGreaterThanOrEqual(10);
    // The slide, its base layer and overlay, the master's layer and the layout's (not
    // those of the feedback master a later format adds, P7.5).
    const before = { ...migrated, masters: migrated.masters.slice(0, 1) };
    expect(JSON.stringify(before).match(/"transition":null/g)).toHaveLength(5);
    expect(JSON.stringify(v9)).not.toContain('transition');
  });
});

describe('zoom regions in the saved format', () => {
  it('may be on a layer, but not in a group, and have no animations', () => {
    const project = createEmptyProject();
    const slide = project.scenes[0]!.slides[0]!;
    const region = createZoomRegion(project.stage);
    slide.baseLayer.objects.push(region);
    expect(issues(project)).toEqual([]);
    region.animations.entrance = createEffect('fade');
    expect(issues(project)).toEqual(['a zoom region cannot have animations']);
    region.animations.entrance = null;
    slide.baseLayer.objects = [
      createGroupObject([createZoomRegion(project.stage), createShapeObject({ kind: 'rect' })]),
    ];
    expect(issues(project)).toEqual(['a zoom region cannot be in a group']);
  });
});

it('refuses animations on a zoom region when asked through a command', () => {
  const project = createEmptyProject();
  const region = createZoomRegion(project.stage);
  project.scenes[0]!.slides[0]!.baseLayer.objects.push(region);
  const history = createHistory(parseProject(project), { validate: true });
  expect(() =>
    history.execute('object.update', {
      objectId: region.id,
      changes: { animations: { entrance: createEffect('fade'), exit: null, motionPaths: [] } },
    }),
  ).toThrow('A zoom region cannot have animations');
});

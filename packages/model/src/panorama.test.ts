import { describe, expect, it } from 'vitest';
import {
  cloneSlide,
  createEmptyProject,
  createHistory,
  createId,
  createPanoramaObject,
  createPanoramaSpot,
  migrateToCurrent,
  parseProject,
  ProjectValidationError,
} from './index';
import type { PanoramaObject, Project, TriggerEvent } from './index';

/** 360° images (docs/briefs/P9.10-panoramas.md). */

const PICTURE = 'a'.repeat(64);
const SOUND = 'b'.repeat(64);

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
  project.assets[PICTURE] = {
    kind: 'image',
    fileName: 'room.jpg',
    ext: 'jpg',
    mimeType: 'image/jpeg',
    byteLength: 1,
  };
  project.assets[SOUND] = {
    kind: 'audio',
    fileName: 'a.mp3',
    ext: 'mp3',
    mimeType: 'audio/mpeg',
    byteLength: 1,
  };
  const panorama = createPanoramaObject(PICTURE);
  panorama.props.spots = [
    createPanoramaSpot('Door', 90, 0),
    createPanoramaSpot('Window', -45, 10, 'hotspot'),
  ];
  const slide = project.scenes[0]!.slides[0]!;
  slide.baseLayer.objects.push(panorama);
  const trigger = (event: TriggerEvent) =>
    slide.triggers.push({
      id: createId('trigger'),
      owner: { kind: 'slide', id: slide.id },
      event,
      action: { type: 'jumpToSlide', target: { kind: 'next' } },
      conditions: null,
      otherwise: null,
      enabled: true,
    });
  return { project, panorama, slide, trigger };
}

describe('360° images in the model', () => {
  it('look at the middle of a picture, free, and take spots with ids of their own', () => {
    const { project, panorama } = course();
    expect(panorama.props).toMatchObject({ mode: 'free', start: { yaw: 0, pitch: 0, fov: 75 } });
    expect(panorama.props.spots[0]).toMatchObject({ name: 'Door', kind: 'marker', title: 'Door' });
    expect(issues(project)).toEqual([]);
    panorama.props.asset = SOUND;
    expect(issues(project)).toContain('scenes[0].slides[0].baseLayer.objects[0].props.asset');
    panorama.props.asset = PICTURE;
    panorama.props.spots[1]!.id = panorama.props.spots[0]!.id;
    expect(issues(project)).toContain('scenes[0].slides[0].baseLayer.objects[0].props.spots[1].id');
  });

  it('keep directions and zoom in range', () => {
    const { project, panorama } = course();
    for (const [change, ok] of [
      [() => (panorama.props.spots[0]!.yaw = 180), true],
      [() => (panorama.props.spots[0]!.yaw = 181), false],
      [() => (panorama.props.spots[0]!.pitch = -91), false],
      [() => (panorama.props.start.fov = 29), false],
      [() => (panorama.props.start.fov = 100), true],
    ] as const) {
      const before = JSON.parse(JSON.stringify(panorama.props)) as PanoramaObject['props'];
      change();
      expect(issues(project).length === 0, change.toString()).toBe(ok);
      panorama.props = before;
    }
  });

  it('check that spot events name a 360° image and one of its own spots', () => {
    const { project, panorama, trigger } = course();
    trigger({ type: 'spotClicked', object: panorama.id, spot: panorama.props.spots[0]!.id });
    trigger({ type: 'panoramaVisited', object: panorama.id });
    expect(issues(project)).toEqual([]);
    trigger({ type: 'spotClicked', object: panorama.id, spot: 'spot_missing' });
    expect(issues(project)).toEqual(['scenes[0].slides[0].triggers[2].event.spot']);
  });

  it('removing a spot removes the triggers that wait for it; new spots need new ids', () => {
    const { project, panorama, trigger } = course();
    const [door, window] = panorama.props.spots;
    trigger({ type: 'spotClicked', object: panorama.id, spot: door!.id });
    trigger({ type: 'spotClicked', object: panorama.id, spot: window!.id });
    const history = createHistory(parseProject(JSON.parse(JSON.stringify(project))));
    history.execute('object.update', {
      objectId: panorama.id,
      changes: { props: { spots: [window!] } },
    });
    const slide = history.project.scenes[0]!.slides[0]!;
    expect(slide.triggers.map((each) => each.event)).toEqual([
      { type: 'spotClicked', object: panorama.id, spot: window!.id },
    ]);
    history.undo();
    expect(history.project.scenes[0]!.slides[0]!.triggers).toHaveLength(2);
    // A spot whose id another object already has is refused.
    expect(() =>
      history.execute('object.update', {
        objectId: panorama.id,
        changes: { props: { spots: [door!, window!, { ...door!, id: slide.id }] } },
      }),
    ).toThrow();
  });

  it('copied with a slide, the copy’s spots and their triggers get new ids', () => {
    const { project, panorama, slide, trigger } = course();
    trigger({ type: 'spotClicked', object: panorama.id, spot: panorama.props.spots[0]!.id });
    const copy = cloneSlide(slide);
    const copied = copy.baseLayer.objects[0] as PanoramaObject;
    expect(copied.props.spots[0]!.id).not.toBe(panorama.props.spots[0]!.id);
    expect(copy.triggers[0]!.event).toEqual({
      type: 'spotClicked',
      object: copied.id,
      spot: copied.props.spots[0]!.id,
    });
    project.scenes[0]!.slides.push(copy);
    expect(issues(project)).toEqual([]);
  });

  it('migrate from format 33 unchanged', () => {
    const old = JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown>;
    old['formatVersion'] = 33;
    const migrated = migrateToCurrent(old) as Record<string, unknown>;
    expect({ ...migrated, formatVersion: 33 }).toEqual(old);
  });
});

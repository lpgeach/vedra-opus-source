import {
  createAudioObject,
  createGroupObject,
  createImageObject,
  createMotionPath,
  createShapeObject,
  createZoomRegion,
  createPanoramaObject,
  createVideoObject,
  createWebObject,
} from '@vedraopus/model';
import type { AssetHash, AssetMeta } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { forMasters, parseObjects, preparePaste, serializeObjects } from './clipboard';
import { leavesOf } from './transform';

const rect = (x = 10, y = 20, width = 100, height = 50) =>
  createShapeObject({ kind: 'rect' }, { x, y, width, height });

const HASH = 'a'.repeat(64) as AssetHash;
const imageMeta: AssetMeta = {
  kind: 'image',
  fileName: 'photo.png',
  ext: 'png',
  mimeType: 'image/png',
  byteLength: 1024,
  width: 640,
  height: 480,
};
const assets = { [HASH]: imageMeta };

describe('clipboard payload', () => {
  it('round-trips objects under its own marker', () => {
    const objects = [rect(), createImageObject(HASH, { x: 0, y: 0 }, 'Picture')];
    expect(parseObjects(serializeObjects(objects))).toEqual(objects);
  });

  it('ignores text that is not an Vedra Opus payload', () => {
    expect(parseObjects('')).toBeNull();
    expect(parseObjects('hello')).toBeNull();
    expect(parseObjects('{"objects": []}')).toBeNull();
    expect(parseObjects('{"vedraopus": 2, "objects": []}')).toBeNull();
    expect(parseObjects('{"vedraopus": 1, "objects": [{"type": "nope"}]}')).toBeNull();
  });
});

describe('preparePaste', () => {
  it('gives every object and group child a new id, without changing the input', () => {
    const outer = createGroupObject([rect(), createGroupObject([rect(200, 200)])]);
    const before = leavesOf(outer).map((leaf) => leaf.id);
    const { objects, missingMedia } = preparePaste([outer], { assets });

    expect(missingMedia).toBe(0);
    const after = leavesOf(objects[0]!).map((leaf) => leaf.id);
    expect(objects[0]!.id).not.toBe(outer.id);
    expect(after).toHaveLength(before.length);
    expect(after.some((id) => before.includes(id))).toBe(false);

    // The copied object is what left the project, not what is pasted.
    expect(leavesOf(outer).map((leaf) => leaf.id)).toEqual(before);
  });

  it('gives captions and motion paths new ids too, so a paste on the same slide is valid', () => {
    const sound = createAudioObject('c'.repeat(64), 2);
    sound.props.captions = [{ id: 'caption_old', start: 0, end: 1, text: 'Hi' }];
    sound.animations.motionPaths = [{ ...createMotionPath('line', 'Across'), id: 'path_old' }];
    const sounds = { ...assets, ['c'.repeat(64)]: { ...assets[HASH]!, kind: 'audio' as const } };
    const { objects } = preparePaste([sound], { assets: sounds });
    const pasted = objects[0]!;
    expect(pasted.type === 'audio' && pasted.props.captions[0]!.id).toMatch(/^caption_/);
    expect(pasted.type === 'audio' && pasted.props.captions[0]!.id).not.toBe('caption_old');
    expect(pasted.animations.motionPaths[0]!.id).toMatch(/^path_/);
    expect(pasted.animations.motionPaths[0]!.id).not.toBe('path_old');
    expect(sound.props.captions[0]!.id).toBe('caption_old');
  });

  it('shifts every frame, including the insides of groups, by the offset', () => {
    const child = rect(100, 100);
    const group = createGroupObject([child, rect(300, 200)]);
    const { objects } = preparePaste([group], { assets, offset: 16 });

    const pasted = objects[0]!;
    expect(pasted.frame.x).toBe(116);
    expect(pasted.frame.y).toBe(116);
    if (pasted.type !== 'group') throw new Error('expected a group');
    expect(pasted.children[0]!.frame).toMatchObject({ x: 116, y: 116 });
    expect(child.frame).toMatchObject({ x: 100, y: 100 });
  });

  it('leaves pasted pictures out when the receiving project lacks their file', () => {
    const { objects, missingMedia } = preparePaste(
      [rect(), createImageObject(HASH, { x: 0, y: 0 })],
      { assets: {} },
    );

    expect(objects).toHaveLength(1);
    expect(objects[0]!.type).toBe('shape');
    expect(missingMedia).toBe(1);
  });

  it('keeps the rest of a group when one of its pictures is missing', () => {
    const kept = rect(0, 0);
    const group = createGroupObject([kept, createImageObject(HASH, { x: 0, y: 100 })]);
    const { objects, missingMedia } = preparePaste([group], { assets: {} });

    expect(missingMedia).toBe(1);
    expect(objects).toHaveLength(1);
    const pasted = objects[0]!;
    expect(pasted.type).toBe('group');
    if (pasted.type !== 'group') throw new Error('expected a group');
    expect(pasted.children).toHaveLength(1);
    // The group is re-boxed around what is left.
    expect(pasted.frame).toEqual({ x: 0, y: 0, width: 100, height: 50, rotation: 0 });
  });

  it('drops a group with nothing left in it', () => {
    const group = createGroupObject([
      createImageObject(HASH, { x: 0, y: 0 }),
      createImageObject(HASH, { x: 200, y: 0 }),
    ]);
    const { objects, missingMedia } = preparePaste([group], { assets: {} });

    expect(missingMedia).toBe(2);
    expect(objects).toEqual([]);
  });
});

describe('pasting into a master', () => {
  it('leaves zoom regions out and takes animations off, saying so', () => {
    const plain = createShapeObject({ kind: 'rect' });
    const moving = createShapeObject({ kind: 'ellipse' });
    moving.animations.motionPaths = [createMotionPath('line', 'Across')];
    const zoom = createZoomRegion({ width: 960, height: 540 });
    const { objects, changed } = forMasters([plain, moving, zoom]);
    expect(changed).toBe(true);
    expect(objects.map((object) => object.id)).toEqual([plain.id, moving.id]);
    expect(objects[1]!.animations.motionPaths).toEqual([]);
    expect(forMasters([plain]).changed).toBe(false);
  });
});

describe('pasting media into a project without their files (the Phase 9 review)', () => {
  it('leaves out sounds, videos, 360° images and web folders as well as pictures', () => {
    const missing = 'f'.repeat(64);
    const web = createWebObject({
      kind: 'folder',
      files: { 'index.html': missing },
      entry: 'index.html',
    });
    const page = createWebObject({ kind: 'url', url: 'https://example.com' });
    const { objects, missingMedia } = preparePaste(
      [
        rect(),
        createAudioObject(missing, 2),
        createVideoObject(missing, 2),
        createPanoramaObject(missing),
        web,
        page,
      ],
      { assets: {} },
    );
    expect(missingMedia).toBe(4);
    expect(objects.map((object) => object.type)).toEqual(['shape', 'web']);
    // With the files there, everything is pasted.
    const meta = {
      kind: 'image' as const,
      fileName: 'f',
      ext: 'png',
      mimeType: 'image/png',
      byteLength: 1,
    };
    const all = preparePaste([createPanoramaObject(missing), web], { assets: { [missing]: meta } });
    expect(all.missingMedia).toBe(0);
    expect(all.objects).toHaveLength(2);
  });
});

import type { AssetMeta } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { videoPosters } from './media-posters';

/** A video's poster in the Media list (found by Luke testing alpha 1). */

const meta = (kind: AssetMeta['kind'], fileName: string): AssetMeta =>
  ({
    kind,
    fileName,
    ext: fileName.split('.').pop()!,
    mimeType: 'x/y',
    byteLength: 1,
  }) as AssetMeta;

describe('a video’s poster', () => {
  it('is the picture named after the video, and only that', () => {
    const assets = {
      ['a'.repeat(64)]: meta('video', 'camera.webm'),
      ['b'.repeat(64)]: meta('image', 'camera poster.png'),
      ['c'.repeat(64)]: meta('image', 'logo.png'),
      ['d'.repeat(64)]: meta('video', 'interview.webm'),
      ['e'.repeat(64)]: meta('image', 'other poster.png'),
    };
    expect([...videoPosters(assets)]).toEqual([['a'.repeat(64), 'b'.repeat(64)]]);
  });
});

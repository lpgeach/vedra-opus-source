/**
 * A video's poster frame in the Media list (found by Luke testing alpha 1,
 * 2026-11-23). The media pipeline stores a poster beside each video it imports,
 * named after it: `camera.webm` and `camera poster.png` (main/project/assets.ts).
 * The list shows the video with its poster as its picture, not the poster as a
 * picture of its own, and inserting the video from the list gives it its poster.
 */
import type { AssetMeta } from '@vedraopus/model';

/** Each video's poster, by the video's hash: the picture named after it. */
export function videoPosters(assets: Readonly<Record<string, AssetMeta>>): Map<string, string> {
  const pictures = new Map<string, string>();
  for (const [hash, meta] of Object.entries(assets)) {
    if (meta.kind === 'image') pictures.set(meta.fileName, hash);
  }
  const posters = new Map<string, string>();
  for (const [hash, meta] of Object.entries(assets)) {
    if (meta.kind !== 'video') continue;
    const base = meta.fileName.replace(/\.[^.]+$/, '') || 'media';
    const poster = pictures.get(`${base} poster.png`);
    if (poster) posters.set(hash, poster);
  }
  return posters;
}

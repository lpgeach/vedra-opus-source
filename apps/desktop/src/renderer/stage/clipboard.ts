/**
 * What Cut, Copy, Paste and Duplicate carry between slides and app instances.
 *
 * The system clipboard holds JSON text under an Vedra Opus marker, so pasting
 * into another project or another running copy of the app works without any
 * shared file. Anything else on the clipboard is ignored. Pure apart from
 * new ids, so it can be unit tested without the DOM.
 */
import {
  assetsOfObject,
  forEachObject,
  noAnimations,
  renewObjectIds,
  sceneObjectSchema,
} from '@vedraopus/model';
import type { AssetHash, AssetMeta, SceneObject } from '@vedraopus/model';
import { z } from 'zod';
import { selectionFrame } from './transform';

/** How far a copy lands from its original when it is pasted on the same slide. */
export const PASTE_OFFSET = 16;

/** The marker and version that say a clipboard payload is ours. */
const payloadSchema = z.object({
  vedraopus: z.literal(1),
  objects: z.array(sceneObjectSchema),
});

/** The JSON text to put on the clipboard for these objects. */
export function serializeObjects(objects: readonly SceneObject[]): string {
  return JSON.stringify({ vedraopus: 1, objects });
}

/** The objects in a clipboard payload, or null when the text is not one. */
export function parseObjects(text: string): SceneObject[] | null {
  if (text.length === 0) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = payloadSchema.safeParse(raw);
  return parsed.success ? parsed.data.objects : null;
}

export interface PasteOptions {
  /** The media the receiving project has, by hash. */
  assets: Readonly<Partial<Record<AssetHash, AssetMeta>>>;
  /** Stage units to shift everything by; 0 keeps the copied position. */
  offset?: number;
}

export interface PasteResult {
  objects: SceneObject[];
  /**
   * Objects left out because the receiving project does not have their media:
   * pictures, sounds, videos, 360° images, web folders (the Phase 9 review).
   */
  missingMedia: number;
}

/**
 * Turn copied objects into objects that can be added to a slide: fresh ids,
 * shifted if asked, and without media (pictures, sounds, videos, 360° images,
 * web folders) whose files the project does not have.
 *
 * A group whose media is missing keeps its other children; a group with none
 * left is dropped too. The input is not changed.
 */
export function preparePaste(
  copied: readonly SceneObject[],
  { assets, offset = 0 }: PasteOptions,
): PasteResult {
  let missingMedia = 0;

  const keep = (object: SceneObject): SceneObject | null => {
    if (assetsOfObject(object).some((hash) => !Object.hasOwn(assets, hash))) {
      missingMedia += 1;
      return null;
    }
    if (object.type === 'group') {
      const children = object.children
        .map(keep)
        .filter((child): child is SceneObject => child !== null);
      if (children.length === 0) return null;
      const box = selectionFrame({ ...object, children });
      return { ...object, frame: box, children };
    }
    return object;
  };

  const objects = structuredClone(copied)
    .map(keep)
    .filter((object): object is SceneObject => object !== null);

  // New ids for the objects and everything they own (captions, motion paths).
  renewObjectIds(objects);
  for (const object of objects) {
    forEachObject([object], (each) => {
      each.frame.x += offset;
      each.frame.y += offset;
    });
  }

  return { objects, missingMedia };
}

/**
 * Objects as they can be on a master or layout, which the engine draws but
 * does not play: without objects the learner presses, zoom regions or
 * animations. `changed` says
 * whether anything was taken away, so the author can be told.
 */
export function forMasters(objects: readonly SceneObject[]): {
  objects: SceneObject[];
  changed: boolean;
} {
  let changed = false;
  const kept = objects
    .filter((object) => {
      if (object.type !== 'zoomRegion' && object.type !== 'hotspot' && object.type !== 'marker') {
        return true;
      }
      changed = true;
      return false;
    })
    .map((object) => {
      const { entrance, exit, motionPaths } = object.animations;
      if (!entrance && !exit && motionPaths.length === 0) return object;
      changed = true;
      return { ...object, animations: noAnimations() };
    });
  return { objects: kept, changed };
}

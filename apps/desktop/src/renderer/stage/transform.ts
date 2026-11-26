/**
 * Applying a geometric change to objects of the model. Pure: given the
 * objects as they were when a drag began and what to do to a frame, it works
 * out the frame every affected object should have. The caller turns that into
 * `object.update` commands.
 *
 * Groups are why this exists. A group's children hold stage-unit frames, so
 * transforming a group means transforming every object inside it and then
 * re-boxing the group around the result.
 */
import type { Frame, SceneObject } from '@vedraopus/model';
import { unionBounds } from './geometry';

export interface FrameUpdate {
  objectId: string;
  frame: Frame;
}

/** The objects that are actually drawn: the object itself, or everything inside a group. */
export function leavesOf(object: SceneObject): SceneObject[] {
  return object.type === 'group' ? object.children.flatMap(leavesOf) : [object];
}

/** The frame to select and measure an object by. A group's is the box around its contents. */
export function selectionFrame(object: SceneObject): Frame {
  if (object.type !== 'group') return object.frame;
  const box = unionBounds(leavesOf(object).map((leaf) => leaf.frame));
  return box ? { ...box, rotation: 0 } : object.frame;
}

/**
 * New frames for the given objects after `change` is applied to every drawn
 * object among them. Each group's frame follows as the box around its
 * transformed contents, innermost groups first.
 */
export function transformObjects(
  objects: readonly SceneObject[],
  change: (frame: Frame, object: SceneObject) => Frame,
): FrameUpdate[] {
  const updates: FrameUpdate[] = [];

  /** Returns the new frames of the leaves under `object`. */
  const visit = (object: SceneObject): Frame[] => {
    if (object.type !== 'group') {
      const frame = change(object.frame, object);
      updates.push({ objectId: object.id, frame });
      return [frame];
    }
    const leafFrames = object.children.flatMap(visit);
    const box = unionBounds(leafFrames);
    if (box) updates.push({ objectId: object.id, frame: { ...box, rotation: 0 } });
    return leafFrames;
  };

  for (const object of objects) visit(object);
  return updates;
}

/** Drop updates that would not change anything, so they do not become commands. */
export function changedOnly(
  updates: readonly FrameUpdate[],
  current: ReadonlyMap<string, Frame>,
): FrameUpdate[] {
  return updates.filter(({ objectId, frame }) => {
    const now = current.get(objectId);
    return (
      !now ||
      now.x !== frame.x ||
      now.y !== frame.y ||
      now.width !== frame.width ||
      now.height !== frame.height ||
      now.rotation !== frame.rotation
    );
  });
}

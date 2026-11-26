import { createId, createMotionPath } from '@vedraopus/model';
import type { Animations, MotionPath, SceneObject, Slide } from '@vedraopus/model';
import { editor } from './project-store';
import type { OpenProject } from './project-store';
export { defaultPathPoints, MAX_DRAWN_POINTS, strokeToPath } from './path-drawing';

/**
 * Changes the Animations tab and the stage make to an object's animations
 * (docs/briefs/P6.5-animations.md). Each is one undo step.
 */

/** Replace an object's animations. */
export function setAnimations(
  open: OpenProject,
  objectId: string,
  animations: Animations,
  label = 'Change animation',
): void {
  editor.beginGesture(label);
  try {
    open.history.execute('object.update', { objectId, changes: { animations } });
  } finally {
    editor.commitGesture();
  }
}

/** A name not yet used among the object's paths: "Line", "Line 2", … */
function freshName(object: SceneObject, base: string): string {
  const names = new Set(object.animations.motionPaths.map((path) => path.name));
  if (!names.has(base)) return base;
  for (let n = 2; ; n++) if (!names.has(`${base} ${n}`)) return `${base} ${n}`;
}

/**
 * Add a motion path to an object, with the trigger that runs it when its
 * layer's timeline starts, as one undo step, and choose it for editing.
 */
export function addMotionPath(
  open: OpenProject,
  slide: Slide,
  object: SceneObject,
  shape: MotionPath['shape'],
  points: MotionPath['points'],
): MotionPath {
  const label = { line: 'Line', arc: 'Arc', freeform: 'Freeform' }[shape];
  const path = createMotionPath(shape, freshName(object, label), points);
  editor.beginGesture('Add motion path');
  try {
    open.history.execute('object.update', {
      objectId: object.id,
      changes: {
        animations: { ...object.animations, motionPaths: [...object.animations.motionPaths, path] },
      },
    });
    open.history.execute('trigger.add', {
      slideId: slide.id,
      trigger: {
        id: createId('trigger'),
        owner: { kind: 'object', id: object.id },
        // The slide's own layer (or the overlay being edited) is `baseLayer` here.
        event: { type: 'timelineStart', layer: slide.baseLayer.id },
        action: { type: 'moveAlongPath', object: object.id, path: path.id },
        conditions: null,
        otherwise: null,
        enabled: true,
      },
    });
  } finally {
    editor.commitGesture();
  }
  editor.chooseMotionPath(path.id);
  return path;
}

import { useSyncExternalStore } from 'react';
import type { Animations, Appearance, SceneObject } from '@vedraopus/model';

interface CopiedFormat {
  appearance?: Appearance;
  cornerRadius?: number;
  opacity?: number;
  autofit?: 'none' | 'shrinkText' | 'growShape';
  padding?: number;
  /** The Animation Painter's copy (B17): an object's entrance and exit. */
  animations?: Pick<Animations, 'entrance' | 'exit'>;
}

let copied: CopiedFormat | null = null;
let armed = false;
let locked = false;
let snapshot = { copied: false, armed: false, locked: false, animations: false };
const listeners = new Set<() => void>();

function emit(): void {
  snapshot = { copied: copied !== null, armed, locked, animations: armed && !!copied?.animations };
  for (const l of listeners) l();
}

export function subscribeFormatPainter(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getFormatPainterState(): {
  copied: boolean;
  armed: boolean;
  locked: boolean;
  /** Armed with animations (the Animation Painter), not formatting. */
  animations: boolean;
} {
  return snapshot;
}

/**
 * The Animation Painter (B17): copy an object's entrance and exit, to put on the next object
 * clicked; `lock` (a double-click) keeps it on until Escape, as the Format Painter does.
 */
export function pickAnimations(object: SceneObject, lock = false): void {
  const { entrance, exit } = object.animations;
  copied = { animations: structuredClone({ entrance, exit }) };
  armed = true;
  locked = lock;
  emit();
}

export function useFormatPainter() {
  return useSyncExternalStore(subscribeFormatPainter, getFormatPainterState, getFormatPainterState);
}

/** Whether the painter can copy formatting from this kind of object. */
export function canPickFormat(object: SceneObject | undefined): boolean {
  return (
    object?.type === 'shape' ||
    object?.type === 'button' ||
    object?.type === 'image' ||
    object?.type === 'text'
  );
}

export function pickFormat(object: SceneObject, lock = false): void {
  if (object.type === 'shape') {
    copied = { appearance: structuredClone(object.props.appearance) };
  } else if (object.type === 'button') {
    copied = {
      appearance: structuredClone(object.props.appearance),
      cornerRadius: object.props.cornerRadius,
    };
  } else if (object.type === 'image') {
    copied = { opacity: object.props.opacity };
  } else if (object.type === 'text') {
    copied = { autofit: object.props.autofit, padding: object.props.padding };
  } else {
    return;
  }
  armed = true;
  locked = lock;
  emit();
}

export function cancelFormatPainter(): void {
  armed = false;
  locked = false;
  emit();
}

export function clearFormatPainter(): void {
  copied = null;
  armed = false;
  locked = false;
  emit();
}

/**
 * Returns the changes to apply to `object`, or null if nothing copied applies
 * to its kind. A single-use painter stays armed until it lands on something it
 * can format, so a click on an unsuitable object does not waste it.
 */
export function consumeFormatFor(object: SceneObject): Record<string, unknown> | null {
  if (!armed || !copied) return null;
  let changes: Record<string, unknown> | null = null;
  if (copied.animations) {
    changes = { animations: { ...object.animations, ...structuredClone(copied.animations) } };
  } else if ((object.type === 'shape' || object.type === 'button') && copied.appearance) {
    const props: Record<string, unknown> = { appearance: structuredClone(copied.appearance) };
    if (object.type === 'button' && copied.cornerRadius !== undefined) {
      props.cornerRadius = copied.cornerRadius;
    }
    changes = { props };
  } else if (object.type === 'image' && copied.opacity !== undefined) {
    changes = { props: { opacity: copied.opacity } };
  } else if (object.type === 'text' && copied.autofit !== undefined) {
    changes = { props: { autofit: copied.autofit, padding: copied.padding } };
  }
  if (changes && !locked) armed = false;
  emit();
  return changes;
}

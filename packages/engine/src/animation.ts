import type { Effect, MotionPath, RichText, SceneObject } from '@vedraopus/model';

/**
 * The timing of entrance and exit effects, and the geometry of motion paths
 * (docs/briefs/P6.5-animations.md). Pure: the engine uses these to say what
 * each object is doing; drawing it is the player's job.
 */

export interface Point {
  x: number;
  y: number;
}

/** The text an object shows, if any. */
function textOf(object: SceneObject): RichText | null {
  if (object.type === 'text' || object.type === 'button') return object.props.text;
  if (object.type === 'shape') return object.props.text;
  return null;
}

/**
 * How many paragraphs animate one after another, by paragraph: each top-level
 * paragraph, and each item of a top-level list. At least 1.
 */
export function paragraphCount(object: SceneObject): number {
  const text = textOf(object);
  if (!text) return 1;
  let count = 0;
  for (const block of text.content) {
    if (block.type === 'bulletList' || block.type === 'orderedList') {
      count += (block.content ?? []).length;
    } else {
      count += 1;
    }
  }
  return Math.max(1, count);
}

/** How long an effect takes on this object: by paragraph, its duration for each paragraph. */
export function effectLength(object: SceneObject, effect: Effect): number {
  return effect.byParagraph ? effect.duration * paragraphCount(object) : effect.duration;
}

/** Where the object's time on its layer ends: its own end, or the timeline's for `untilEnd`. */
export function objectEnd(object: SceneObject, timelineDuration: number): number {
  const { start, duration } = object.timing;
  return duration === 'untilEnd' ? timelineDuration : start + duration;
}

export interface EffectTime {
  phase: 'entrance' | 'exit';
  /** Seconds into the effect (by paragraph, into the whole sequence). */
  time: number;
}

/**
 * Which effect is under way with the playhead at `t`, and how far into it, for
 * an object on stage. The entrance plays from the object's start; the exit
 * finishes at its end, and wins where the two overlap.
 */
export function effectAt(
  object: SceneObject,
  t: number,
  timelineDuration: number,
): EffectTime | null {
  const { entrance, exit } = object.animations;
  const end = objectEnd(object, timelineDuration);
  if (exit) {
    const length = effectLength(object, exit);
    const from = Math.max(object.timing.start, end - length);
    if (t >= from) return { phase: 'exit', time: Math.min(length, t - (end - length)) };
  }
  if (entrance) {
    const length = effectLength(object, entrance);
    if (t < object.timing.start + length) {
      return { phase: 'entrance', time: Math.max(0, t - object.timing.start) };
    }
  }
  return null;
}

// ------------------------------------------------------------------ paths

/** Easing applied to how far along its path a running object is (0–1). */
export function ease(easing: MotionPath['easing'], x: number): number {
  const v = Math.min(1, Math.max(0, x));
  switch (easing) {
    case 'linear':
      return v;
    case 'easeIn':
      return v * v;
    case 'easeOut':
      return 1 - (1 - v) * (1 - v);
    case 'easeInOut':
      return v < 0.5 ? 2 * v * v : 1 - 2 * (1 - v) * (1 - v);
  }
}

/** Points along an arc drawn through start, middle and end. */
const ARC_STEPS = 64;

/**
 * The path as a polyline: a line's two points, a freeform path's own points,
 * or the quadratic curve that starts and ends at an arc's ends and passes
 * through its middle point halfway.
 */
export function pathPolyline(path: Pick<MotionPath, 'shape' | 'points'>): Point[] {
  if (path.shape !== 'arc') return path.points.map(({ x, y }) => ({ x, y }));
  const [a, m, b] = path.points as [Point, Point, Point];
  // A quadratic curve is at its middle at t = 0.5, where it is (a + 2c + b) / 4.
  const c = { x: 2 * m.x - (a.x + b.x) / 2, y: 2 * m.y - (a.y + b.y) / 2 };
  const points: Point[] = [];
  for (let i = 0; i <= ARC_STEPS; i++) {
    const t = i / ARC_STEPS;
    const u = 1 - t;
    points.push({
      x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
    });
  }
  return points;
}

/** The point `fraction` (0–1) of the way along a polyline, by length. */
export function pointAlong(points: readonly Point[], fraction: number): Point {
  const first = points[0]!;
  if (points.length < 2) return { ...first };
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const length = Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
    lengths.push(length);
    total += length;
  }
  if (total === 0) return { ...first };
  let left = Math.min(1, Math.max(0, fraction)) * total;
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i]!;
    if (left <= length || i === lengths.length - 1) {
      const t = length === 0 ? 0 : Math.min(1, left / length);
      const a = points[i]!;
      const b = points[i + 1]!;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= length;
  }
  return { ...points.at(-1)! };
}

/** Where on the path the object is, `seconds` into a run, eased. */
export function pathPositionAt(path: MotionPath, seconds: number): Point {
  return pointAlong(pathPolyline(path), ease(path.easing, seconds / path.duration));
}

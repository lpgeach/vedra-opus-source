import type { MotionPath, SceneObject } from '@vedraopus/model';

/** Where new motion paths go, and freehand drawings as paths. Pure, for unit tests. */

type Point = MotionPath['points'][number];

/** How far a new line or arc goes, in stage units. */
const NEW_PATH_LENGTH = 200;

/**
 * The points of a new line or arc for an object: to the right, or to the
 * left when there is not room on the stage.
 */
export function defaultPathPoints(
  shape: 'line' | 'arc',
  object: SceneObject,
  stageWidth: number,
): MotionPath['points'] {
  const centre = object.frame.x + object.frame.width / 2;
  const sign = centre + NEW_PATH_LENGTH > stageWidth ? -1 : 1;
  const end = { x: sign * NEW_PATH_LENGTH, y: 0 };
  return shape === 'line'
    ? [{ x: 0, y: 0 }, end]
    : [{ x: 0, y: 0 }, { x: (sign * NEW_PATH_LENGTH) / 2, y: -NEW_PATH_LENGTH * 0.4 }, end];
}

/** The most points a drawn path keeps. */
export const MAX_DRAWN_POINTS = 50;
/** Points of a drawing closer together than this (stage units) are one. */
const DRAWN_STEP = 4;

/**
 * A freehand stroke (stage points, as drawn) as a freeform path's points:
 * starting at the object's place (0, 0), points closer than a few units
 * dropped, and at most `MAX_DRAWN_POINTS`, evenly picked, the last kept.
 * Null when it is too short to be a path.
 */
export function strokeToPath(stroke: readonly Point[]): MotionPath['points'] | null {
  const first = stroke[0];
  if (!first) return null;
  const kept: Point[] = [{ x: 0, y: 0 }];
  for (const point of stroke.slice(1)) {
    const at = { x: point.x - first.x, y: point.y - first.y };
    const last = kept[kept.length - 1]!;
    if (Math.hypot(at.x - last.x, at.y - last.y) >= DRAWN_STEP) kept.push(at);
  }
  const end = stroke[stroke.length - 1]!;
  const endAt = { x: end.x - first.x, y: end.y - first.y };
  const last = kept[kept.length - 1]!;
  if (last.x !== endAt.x || last.y !== endAt.y) {
    if (kept.length > 1 && Math.hypot(endAt.x - last.x, endAt.y - last.y) < DRAWN_STEP) {
      kept[kept.length - 1] = endAt;
    } else if (Math.hypot(endAt.x, endAt.y) > 0) {
      kept.push(endAt);
    }
  }
  if (kept.length < 2) return null;
  let length = 0;
  for (let i = 1; i < kept.length; i++) {
    length += Math.hypot(kept[i]!.x - kept[i - 1]!.x, kept[i]!.y - kept[i - 1]!.y);
  }
  if (length < 2 * DRAWN_STEP) return null;
  if (kept.length <= MAX_DRAWN_POINTS) return kept.map(round);
  const picked: Point[] = [];
  for (let i = 0; i < MAX_DRAWN_POINTS; i++) {
    picked.push(kept[Math.round((i * (kept.length - 1)) / (MAX_DRAWN_POINTS - 1))]!);
  }
  return picked.map(round);
}

const round = (point: Point): Point => ({ x: Math.round(point.x), y: Math.round(point.y) });

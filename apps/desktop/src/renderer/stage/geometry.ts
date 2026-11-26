/**
 * The maths of working with objects on the stage. Pure functions on plain
 * numbers: no React, no DOM, no store. Everything is in stage units, with y
 * pointing down and rotation in degrees clockwise about a frame's centre, as
 * in the project model.
 */
import type { Frame } from '@vedraopus/model';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The eight resize handles, named by compass direction on the unrotated frame. */
export const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
export type Handle = (typeof HANDLES)[number];

/** Where each handle sits on the frame, as fractions of its width and height. */
const HANDLE_AT: Record<Handle, Point> = {
  nw: { x: 0, y: 0 },
  n: { x: 0.5, y: 0 },
  ne: { x: 1, y: 0 },
  e: { x: 1, y: 0.5 },
  se: { x: 1, y: 1 },
  s: { x: 0.5, y: 1 },
  sw: { x: 0, y: 1 },
  w: { x: 0, y: 0.5 },
};

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** Tidy the float noise that trigonometry leaves (199.99999999997 → 200). */
const tidy = (value: number) => Math.round(value * 1e6) / 1e6 + 0;

// ------------------------------------------------------------------- basics

export function centreOf(frame: Rect): Point {
  return { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
}

/** Turn a point about a centre, clockwise on screen. */
export function rotatePoint(point: Point, centre: Point, degrees: number): Point {
  if (degrees === 0) return { ...point };
  const [cos, sin] = [Math.cos(radians(degrees)), Math.sin(radians(degrees))];
  const [dx, dy] = [point.x - centre.x, point.y - centre.y];
  return { x: centre.x + dx * cos - dy * sin, y: centre.y + dx * sin + dy * cos };
}

/** An angle in the range 0 ≤ a < 360. */
export function normaliseAngle(degrees: number): number {
  const wrapped = ((degrees % 360) + 360) % 360;
  return tidy(wrapped) === 360 ? 0 : tidy(wrapped);
}

/** A point on the frame given as fractions of its size, where it really is on stage. */
function pointOnFrame(frame: Frame, at: Point): Point {
  return rotatePoint(
    { x: frame.x + frame.width * at.x, y: frame.y + frame.height * at.y },
    centreOf(frame),
    frame.rotation,
  );
}

/** Where a resize handle is on stage. */
export function handlePoint(frame: Frame, handle: Handle): Point {
  return pointOnFrame(frame, HANDLE_AT[handle]);
}

/** The frame's corners on stage: top-left, top-right, bottom-right, bottom-left. */
export function cornersOf(frame: Frame): Point[] {
  return (['nw', 'ne', 'se', 'sw'] as const).map((handle) => handlePoint(frame, handle));
}

/** The upright box that contains a frame, however it is rotated. */
export function boundsOf(frame: Frame): Rect {
  if (frame.rotation === 0) {
    return { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
  }
  const corners = cornersOf(frame);
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const [left, top] = [Math.min(...xs), Math.min(...ys)];
  return {
    x: tidy(left),
    y: tidy(top),
    width: tidy(Math.max(...xs) - left),
    height: tidy(Math.max(...ys) - top),
  };
}

/** The box around several rectangles, or null for none. */
export function unionRects(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The upright box around several frames, or null for none. */
export function unionBounds(frames: readonly Frame[]): Rect | null {
  return unionRects(frames.map(boundsOf));
}

/** A rectangle from two opposite corners given in any order. */
export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

export function rectsTouch(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height
  );
}

// -------------------------------------------------------------- hit testing

/**
 * Is the point on the frame? `slop` widens the frame on every side, so thin
 * things — a line has no height at all — can still be clicked.
 */
export function pointInFrame(point: Point, frame: Frame, slop = 0): boolean {
  // Turn the point the other way instead of turning the frame.
  const local = rotatePoint(point, centreOf(frame), -frame.rotation);
  return (
    local.x >= frame.x - slop &&
    local.x <= frame.x + frame.width + slop &&
    local.y >= frame.y - slop &&
    local.y <= frame.y + frame.height + slop
  );
}

// --------------------------------------------------------------------- move

export function moveFrame(frame: Frame, dx: number, dy: number): Frame {
  return { ...frame, x: frame.x + dx, y: frame.y + dy };
}

// ------------------------------------------------------------------- resize

export interface ResizeOptions {
  /** Keep width ÷ height as it was. */
  keepRatio?: boolean;
  /** Resize about the centre instead of the opposite handle. */
  fromCentre?: boolean;
  /** Smallest width and height allowed. */
  minSize?: number;
}

const OPPOSITE: Record<Handle, Handle> = {
  nw: 'se',
  n: 's',
  ne: 'sw',
  e: 'w',
  se: 'nw',
  s: 'n',
  sw: 'ne',
  w: 'e',
};

/**
 * Resize a frame by dragging one of its handles to `pointer`. The opposite
 * handle (or, with `fromCentre`, the centre) stays exactly where it is on
 * stage, also when the frame is rotated. A handle cannot be dragged through
 * the other side: the frame stops at `minSize`.
 */
export function resizeFrame(
  frame: Frame,
  handle: Handle,
  pointer: Point,
  options: ResizeOptions = {},
): Frame {
  const { keepRatio = false, fromCentre = false, minSize = 1 } = options;
  const at = HANDLE_AT[handle];
  // Which sides this handle moves: -1 the left/top side, +1 the right/bottom, 0 neither.
  const sideX = at.x === 0 ? -1 : at.x === 1 ? 1 : 0;
  const sideY = at.y === 0 ? -1 : at.y === 1 ? 1 : 0;

  // The fixed point, on stage and as a fraction of the frame.
  const anchorAt = fromCentre ? { x: 0.5, y: 0.5 } : HANDLE_AT[OPPOSITE[handle]];
  const anchor = pointOnFrame(frame, anchorAt);

  // The pointer as the unrotated frame would see it, measured from the anchor.
  const local = rotatePoint(pointer, anchor, -frame.rotation);
  const reach = fromCentre ? 2 : 1;
  let width = sideX === 0 ? frame.width : (local.x - anchor.x) * sideX * reach;
  let height = sideY === 0 ? frame.height : (local.y - anchor.y) * sideY * reach;

  if (keepRatio && frame.width > 0 && frame.height > 0) {
    // One scale for both sides. A corner follows whichever direction the
    // pointer has gone further in; an edge handle follows its own direction.
    const scaleX = width / frame.width;
    const scaleY = height / frame.height;
    const wanted =
      sideX !== 0 && sideY !== 0 ? Math.max(scaleX, scaleY) : sideX !== 0 ? scaleX : scaleY;
    const smallest = Math.max(minSize / frame.width, minSize / frame.height);
    const scale = Math.max(wanted, smallest);
    width = frame.width * scale;
    height = frame.height * scale;
  } else {
    // A side this handle does not move keeps its size, even if that is zero (a line).
    if (sideX !== 0) width = Math.max(minSize, width);
    if (sideY !== 0) height = Math.max(minSize, height);
  }

  // Put the frame back so the anchor has not moved. In the unrotated frame the
  // centre is a known offset from the anchor; turn that offset to get it on stage.
  const offset = { x: (0.5 - anchorAt.x) * width, y: (0.5 - anchorAt.y) * height };
  const centre = rotatePoint(
    { x: anchor.x + offset.x, y: anchor.y + offset.y },
    anchor,
    frame.rotation,
  );
  return {
    x: tidy(centre.x - width / 2),
    y: tidy(centre.y - height / 2),
    width: tidy(width),
    height: tidy(height),
    rotation: frame.rotation,
  };
}

/**
 * Scale a frame as part of a selection being resized from `from` to `to` (the
 * selection's box before and after). Position and size scale with the box. A
 * rotated frame can only be scaled evenly, so callers must keep the box's
 * proportions when `needsEvenScale` is true for any frame in the selection.
 */
export function scaleFrame(frame: Frame, from: Rect, to: Rect): Frame {
  const sx = from.width === 0 ? 1 : to.width / from.width;
  const sy = from.height === 0 ? 1 : to.height / from.height;
  const centre = centreOf(frame);
  const scaledCentre = {
    x: to.x + (centre.x - from.x) * sx,
    y: to.y + (centre.y - from.y) * sy,
  };
  // A frame turned a quarter has its width along the stage's y axis.
  const sideways = isQuarterTurn(frame.rotation) && normaliseAngle(frame.rotation) % 180 !== 0;
  const width = frame.width * (sideways ? sy : sx);
  const height = frame.height * (sideways ? sx : sy);
  return {
    x: tidy(scaledCentre.x - width / 2),
    y: tidy(scaledCentre.y - height / 2),
    width: tidy(width),
    height: tidy(height),
    rotation: frame.rotation,
  };
}

function isQuarterTurn(rotation: number): boolean {
  return normaliseAngle(rotation) % 90 === 0;
}

/** True when a frame can only be scaled by the same amount in both directions. */
export function needsEvenScale(frame: Frame): boolean {
  return !isQuarterTurn(frame.rotation);
}

// ------------------------------------------------------------------- rotate

/** The angle of `point` as seen from `centre`: 0 is straight up, clockwise positive. */
export function angleFrom(centre: Point, point: Point): number {
  return normaliseAngle((Math.atan2(point.y - centre.y, point.x - centre.x) * 180) / Math.PI + 90);
}

/**
 * How far a rotate handle has been turned about `centre`, from where the drag
 * began to where the pointer is now. With `step`, the result snaps to
 * multiples of it once added to `startRotation`.
 */
export function rotationDelta(
  centre: Point,
  start: Point,
  pointer: Point,
  startRotation = 0,
  step = 0,
): number {
  let delta = angleFrom(centre, pointer) - angleFrom(centre, start);
  if (step > 0) delta = Math.round((startRotation + delta) / step) * step - startRotation;
  return delta;
}

/** Turn a frame about any point: its centre moves around the pivot and it turns by the same angle. */
export function rotateFrame(frame: Frame, pivot: Point, degrees: number): Frame {
  const centre = rotatePoint(centreOf(frame), pivot, degrees);
  return {
    x: tidy(centre.x - frame.width / 2),
    y: tidy(centre.y - frame.height / 2),
    width: frame.width,
    height: frame.height,
    rotation: normaliseAngle(frame.rotation + degrees),
  };
}

// ---------------------------------------------------------- align and distribute

export type Align = 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom';
export type DistributeAxis = 'horizontal' | 'vertical';

/**
 * How far each box moves to line up inside `container`. The boxes are upright
 * bounds, in the order the caller wants the moves back; rotated objects are
 * lined up by the box they are seen in, which the caller gets from `boundsOf`.
 */
export function alignMoves(boxes: readonly Rect[], align: Align, container: Rect): Point[] {
  return boxes.map((box) => {
    switch (align) {
      case 'left':
        return { x: container.x - box.x, y: 0 };
      case 'centre':
        return { x: container.x + container.width / 2 - (box.x + box.width / 2), y: 0 };
      case 'right':
        return { x: container.x + container.width - (box.x + box.width), y: 0 };
      case 'top':
        return { x: 0, y: container.y - box.y };
      case 'middle':
        return { x: 0, y: container.y + container.height / 2 - (box.y + box.height / 2) };
      case 'bottom':
        return { x: 0, y: container.y + container.height - (box.y + box.height) };
    }
  });
}

/**
 * How far each box moves so the gaps between them are equal, leaving the
 * outermost two where they are. Fewer than three boxes have nothing to even
 * out, so nothing moves. Moves come back in the boxes' order, not in the
 * order they are laid out.
 */
export function distributeMoves(boxes: readonly Rect[], axis: DistributeAxis): Point[] {
  const moves = boxes.map(() => ({ x: 0, y: 0 }));
  if (boxes.length < 3) return moves;

  const start = (box: Rect) => (axis === 'horizontal' ? box.x : box.y);
  const size = (box: Rect) => (axis === 'horizontal' ? box.width : box.height);
  const laidOut = boxes
    .map((box, index) => ({ box, index }))
    .sort((a, b) => start(a.box) - start(b.box));
  const first = laidOut[0]!;
  const last = laidOut[laidOut.length - 1]!;
  const span = start(last.box) + size(last.box) - start(first.box);
  const used = laidOut.reduce((total, each) => total + size(each.box), 0);
  const gap = (span - used) / (laidOut.length - 1);

  let at = start(first.box) + size(first.box) + gap;
  for (const each of laidOut.slice(1, -1)) {
    const delta = at - start(each.box);
    moves[each.index] = axis === 'horizontal' ? { x: delta, y: 0 } : { x: 0, y: delta };
    at += size(each.box) + gap;
  }
  return moves;
}

// ---------------------------------------------------------- snapping

/** A line to line up with, or one a moving box landed on. */
export interface SnapLine {
  axis: 'x' | 'y';
  /** Where the line sits, in stage units. */
  at: number;
}

/** Lines a moving box may snap to, by axis. */
export interface SnapCandidates {
  x: readonly number[];
  y: readonly number[];
}

/** How far a box moves to snap, and the lines it landed on. */
export interface Snap {
  dx: number;
  dy: number;
  lines: SnapLine[];
}

/** Two coordinates closer than this are the same line. */
const ALIGNED = 1e-6;

/** The smallest shift that brings one of `edges` onto one of `lines`. */
function nearestShift(
  edges: readonly number[],
  lines: readonly number[],
  threshold: number,
): { shift: number; at: number[] } {
  let shift = 0;
  let found = false;
  for (const edge of edges) {
    for (const line of lines) {
      const delta = line - edge;
      if (Math.abs(delta) <= threshold && (!found || Math.abs(delta) < Math.abs(shift))) {
        shift = delta;
        found = true;
      }
    }
  }
  if (!found) return { shift: 0, at: [] };
  return {
    shift,
    at: lines.filter((line) => edges.some((edge) => Math.abs(edge + shift - line) < ALIGNED)),
  };
}

/** Move one coordinate onto the nearest line, if one is close enough. */
export function snapValue(
  value: number,
  lines: readonly number[],
  threshold: number,
): { value: number; lines: number[] } {
  const { shift, at } = nearestShift([value], lines, threshold);
  return { value: value + shift, lines: at };
}

/**
 * Shift a box so its left, centre or right edge lands on a vertical line,
 * and its top, middle or bottom edge on a horizontal one. `threshold` is in
 * stage units. Nothing moves if no line is close enough.
 */
export function snapBox(box: Rect, candidates: SnapCandidates, threshold: number): Snap {
  const x = nearestShift(
    [box.x, box.x + box.width / 2, box.x + box.width],
    candidates.x,
    threshold,
  );
  const y = nearestShift(
    [box.y, box.y + box.height / 2, box.y + box.height],
    candidates.y,
    threshold,
  );
  return {
    dx: x.shift,
    dy: y.shift,
    lines: [
      ...x.at.map((at): SnapLine => ({ axis: 'x', at })),
      ...y.at.map((at): SnapLine => ({ axis: 'y', at })),
    ],
  };
}

/**
 * Outlines of shapes as SVG path data, in the object's own box: (0, 0) at its
 * top-left corner, `width` × `height` pixels.
 */
import { parsePathData } from '@vedraopus/model';
import type { ShapeGeometry } from '@vedraopus/model';
import { num } from './node';

export type OpenGeometry = Extract<ShapeGeometry, { kind: 'line' | 'arrow' }>;
export type ClosedGeometry = Exclude<ShapeGeometry, OpenGeometry>;

export function isOpen(geometry: ShapeGeometry): geometry is OpenGeometry {
  return geometry.kind === 'line' || geometry.kind === 'arrow';
}

/** A rectangle with rounded corners; the radius is limited to half the shorter side. */
export function roundRectPath(width: number, height: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  if (r === 0) return `M0 0H${num(width)}V${num(height)}H0Z`;
  const [w, h, rr] = [num(width), num(height), num(r)];
  const [wr, hr] = [num(width - r), num(height - r)];
  const arc = `A${rr} ${rr} 0 0 1`;
  return `M${rr} 0H${wr}${arc} ${w} ${rr}V${hr}${arc} ${wr} ${h}H${rr}${arc} 0 ${hr}V${rr}${arc} ${rr} 0Z`;
}

/** The outline of a closed shape. */
export function closedPath(geometry: ClosedGeometry, width: number, height: number): string {
  const [w, h] = [num(width), num(height)];
  switch (geometry.kind) {
    case 'rect':
      return roundRectPath(width, height, 0);
    case 'roundRect':
      return roundRectPath(width, height, geometry.radius);
    case 'ellipse': {
      const [rx, ry] = [num(width / 2), num(height / 2)];
      return `M0 ${ry}A${rx} ${ry} 0 1 1 ${w} ${ry}A${rx} ${ry} 0 1 1 0 ${ry}Z`;
    }
    case 'triangle':
      return `M${num(width / 2)} 0L${w} ${h}L0 ${h}Z`;
    case 'polygon':
      return (
        geometry.points
          .map(
            (point, index) =>
              `${index === 0 ? 'M' : 'L'}${num(point.x * width)} ${num(point.y * height)}`,
          )
          .join('') + 'Z'
      );
    case 'path':
      return geometry.paths.map((path) => scaledPath(path.d, width, height)).join('');
  }
}

/**
 * A path shape's outline (B13), from its 0–1 box to the object's: every value is
 * an x, y pair, so each is stretched by the width or the height in turn.
 */
export function scaledPath(d: string, width: number, height: number): string {
  return (parsePathData(d) ?? [])
    .map(
      ({ op, values }) =>
        op +
        values.map((value, index) => num(value * (index % 2 === 0 ? width : height))).join(' '),
    )
    .join('');
}

export interface LineParts {
  /** The stroked line. */
  line: string;
  /** The arrow head, filled with the outline colour; absent for a plain line. */
  head?: string;
}

/**
 * A line along the horizontal centre of the box, left to right. An arrow's
 * head grows with the outline so thick arrows keep their proportions, and the
 * line stops inside the head so its square end never pokes through the point.
 */
export function linePath(
  geometry: OpenGeometry,
  width: number,
  height: number,
  strokeWidth: number,
): LineParts {
  const y = height / 2;
  if (geometry.kind === 'line') return { line: `M0 ${num(y)}H${num(width)}` };

  const headLength = Math.min(width, Math.max(10, strokeWidth * 4));
  const halfHead = Math.max(8, strokeWidth * 3) / 2;
  const neck = width - headLength;
  return {
    line: `M0 ${num(y)}H${num(Math.max(0, neck + headLength * 0.1))}`,
    head: `M${num(width)} ${num(y)}L${num(neck)} ${num(y - halfHead)}L${num(neck)} ${num(y + halfHead)}Z`,
  };
}

/**
 * Start and end of a linear gradient across a box, in pixels. The angle is in
 * degrees clockwise: 0 runs left to right, 90 top to bottom. The line passes
 * through the centre and is just long enough for its ends to reach the
 * corners, as CSS gradients do, so the first and last colours touch the edges.
 */
export function gradientLine(
  angle: number,
  width: number,
  height: number,
): { x1: number; y1: number; x2: number; y2: number } {
  const radians = (angle * Math.PI) / 180;
  const [dx, dy] = [Math.cos(radians), Math.sin(radians)];
  const half = (Math.abs(width * dx) + Math.abs(height * dy)) / 2;
  const [cx, cy] = [width / 2, height / 2];
  return { x1: cx - dx * half, y1: cy - dy * half, x2: cx + dx * half, y2: cy + dy * half };
}

/**
 * Where to put an image inside a frame so that only the cropped region shows,
 * stretched to fill the frame. `crop` is in fractions of the source image.
 */
export function cropPlacement(
  crop: { x: number; y: number; width: number; height: number } | null,
  frameWidth: number,
  frameHeight: number,
): { left: number; top: number; width: number; height: number } {
  if (!crop || crop.width <= 0 || crop.height <= 0) {
    return { left: 0, top: 0, width: frameWidth, height: frameHeight };
  }
  const width = frameWidth / crop.width;
  const height = frameHeight / crop.height;
  // Subtracting from zero, not negating, so an uncropped edge is 0 and never -0.
  return { left: 0 - crop.x * width, top: 0 - crop.y * height, width, height };
}

/**
 * Where to put a picture so it covers a box completely, centred, keeping its
 * proportions; whatever overflows is cut off by the box.
 */
export function coverPlacement(
  sourceWidth: number,
  sourceHeight: number,
  boxWidth: number,
  boxHeight: number,
): { x: number; y: number; width: number; height: number } {
  const scale = Math.max(boxWidth / sourceWidth, boxHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return { x: (boxWidth - width) / 2, y: (boxHeight - height) / 2, width, height };
}

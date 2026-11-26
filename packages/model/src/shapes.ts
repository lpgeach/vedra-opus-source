/**
 * Ready-made shapes beyond the basic geometry kinds. Each is an ordinary
 * `polygon` geometry — points in a 0–1 box stretched to the object's frame —
 * so adding one here never changes the saved format.
 */
import type { ShapeGeometry } from './schema';

type Point = { x: number; y: number };
type Polygon = Extract<ShapeGeometry, { kind: 'polygon' }>;

const round = (value: number) => Math.round(value * 1e4) / 1e4;

/** Stretch points so their bounding box is exactly the 0–1 box. */
function fitToUnitBox(points: Point[]): Point[] {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const width = Math.max(...xs) - left;
  const height = Math.max(...ys) - top;
  return points.map((point) => ({
    x: round((point.x - left) / width),
    y: round((point.y - top) / height),
  }));
}

/** A regular polygon with one corner pointing up, or one flat side on top. */
function regular(sides: number, flatTop = false): Point[] {
  const turn = flatTop ? Math.PI / sides : 0;
  return fitToUnitBox(
    Array.from({ length: sides }, (_, index) => {
      const angle = (index / sides) * 2 * Math.PI - Math.PI / 2 + turn;
      return { x: Math.cos(angle), y: Math.sin(angle) };
    }),
  );
}

/** A star with one point up; `inner` is the inner radius as a fraction of the outer. */
function star(points: number, inner: number): Point[] {
  return fitToUnitBox(
    Array.from({ length: points * 2 }, (_, index) => {
      const angle = (index / (points * 2)) * 2 * Math.PI - Math.PI / 2;
      const radius = index % 2 === 0 ? 1 : inner;
      return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
    }),
  );
}

const p = (...flat: number[]): Point[] => {
  const points: Point[] = [];
  for (let index = 0; index < flat.length; index += 2) {
    points.push({ x: flat[index]!, y: flat[index + 1]! });
  }
  return points;
};

const presets = {
  diamond: { label: 'Diamond', points: p(0.5, 0, 1, 0.5, 0.5, 1, 0, 0.5) },
  pentagon: { label: 'Pentagon', points: regular(5) },
  hexagon: { label: 'Hexagon', points: p(0.25, 0, 0.75, 0, 1, 0.5, 0.75, 1, 0.25, 1, 0, 0.5) },
  octagon: { label: 'Octagon', points: regular(8, true) },
  star: { label: 'Star', points: star(5, 0.382) },
  rightTriangle: { label: 'Right Triangle', points: p(0, 0, 1, 1, 0, 1) },
  parallelogram: { label: 'Parallelogram', points: p(0.25, 0, 1, 0, 0.75, 1, 0, 1) },
  trapezoid: { label: 'Trapezoid', points: p(0.2, 0, 0.8, 0, 1, 1, 0, 1) },
  chevron: { label: 'Chevron', points: p(0, 0, 0.7, 0, 1, 0.5, 0.7, 1, 0, 1, 0.3, 0.5) },
  blockArrow: {
    label: 'Block Arrow',
    points: p(0, 0.25, 0.6, 0.25, 0.6, 0, 1, 0.5, 0.6, 1, 0.6, 0.75, 0, 0.75),
  },
  plus: {
    label: 'Plus',
    points: p(
      ...[1 / 3, 0, 2 / 3, 0, 2 / 3, 1 / 3, 1, 1 / 3, 1, 2 / 3, 2 / 3, 2 / 3],
      ...[2 / 3, 1, 1 / 3, 1, 1 / 3, 2 / 3, 0, 2 / 3, 0, 1 / 3, 1 / 3, 1 / 3],
    ).map((point) => ({ x: round(point.x), y: round(point.y) })),
  },
  /** A box with a tail at the lower left, for speech. */
  callout: {
    label: 'Callout',
    points: p(0, 0, 1, 0, 1, 0.75, 0.45, 0.75, 0.2, 1, 0.25, 0.75, 0, 0.75),
  },
} satisfies Record<string, { label: string; points: Point[] }>;

export type ShapePresetName = keyof typeof presets;

export const shapePresetNames = Object.keys(presets) as ShapePresetName[];

/** The name to show an author for a preset. */
export function shapePresetLabel(name: ShapePresetName): string {
  return presets[name].label;
}

/** A fresh geometry for a preset; the caller owns the result. */
export function shapePreset(name: ShapePresetName): Polygon {
  return { kind: 'polygon', points: presets[name].points.map((point) => ({ ...point })) };
}

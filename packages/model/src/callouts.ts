/**
 * Callouts drawn as path shapes (docs/briefs/B13-path-shapes.md and B17): the rounded, square
 * and oval callouts with a wedge tail, and the cloud with its trail of bubbles. Shared by the
 * Storyline importer and Insert → Caption. The outlines are our own, after the preset shapes of
 * Office Open XML (ECMA-376). Each is worked out in pixels at the object's size, so corners and
 * ellipses keep their proportions, then written in the 0–1 box path shapes use.
 */
import { writePathData } from './path-data';
import type { PathCommand } from './path-data';
import type { ShapeGeometry } from './schema';

export type Pt = { x: number; y: number };
/** One outline of a path shape, in pixels: filled, outlined, or both. */
export type PathOutline = { commands: PathCommand[]; fill: boolean; stroke: boolean };
type Outline = PathOutline;

/** Builds one outline, in pixels. */
export class Pen {
  readonly commands: PathCommand[] = [];
  move(p: Pt) {
    this.commands.push({ op: 'M', values: [p.x, p.y] });
    return this;
  }
  line(p: Pt) {
    this.commands.push({ op: 'L', values: [p.x, p.y] });
    return this;
  }
  /**
   * Along an ellipse centred on `c`, from angle `from` to `to` (radians, clockwise on screen),
   * as curves of at most a quarter turn each. The pen is at its start already.
   */
  ellipse(c: Pt, rx: number, ry: number, from: number, to: number) {
    const turns = Math.max(1, Math.ceil(Math.abs(to - from) / (Math.PI / 2)));
    const step = (to - from) / turns;
    const k = (4 / 3) * Math.tan(step / 4);
    for (let i = 0; i < turns; i++) {
      const a = from + step * i;
      const b = a + step;
      this.commands.push({
        op: 'C',
        values: [
          c.x + rx * (Math.cos(a) - k * Math.sin(a)),
          c.y + ry * (Math.sin(a) + k * Math.cos(a)),
          c.x + rx * (Math.cos(b) + k * Math.sin(b)),
          c.y + ry * (Math.sin(b) - k * Math.cos(b)),
          c.x + rx * Math.cos(b),
          c.y + ry * Math.sin(b),
        ],
      });
    }
    return this;
  }
  close() {
    this.commands.push({ op: 'Z', values: [] });
    return this;
  }
}

const onEllipse = (c: Pt, rx: number, ry: number, angle: number): Pt => ({
  x: c.x + rx * Math.cos(angle),
  y: c.y + ry * Math.sin(angle),
});

/**
 * A rectangle, rounded by `r`, with a wedge out to `tip` from the side facing it (as Office's
 * wedge callouts: the side by the tip's direction, the wedge's base 7/12–10/12 or 2/12–5/12
 * along it, by which half the tip is in).
 */
export function wedgeRect(w: number, h: number, r: number, tip: Pt): Outline {
  const [dx, dy] = [tip.x - w / 2, tip.y - h / 2];
  const vertical = Math.abs(dy) - Math.abs((dx * h) / w) > 0;
  const side = vertical ? (dy < 0 ? 'top' : 'bottom') : dx < 0 ? 'left' : 'right';
  const [x1, x2] = dx > 0 ? [(w * 7) / 12, (w * 10) / 12] : [(w * 2) / 12, (w * 5) / 12];
  const [y1, y2] = dy > 0 ? [(h * 7) / 12, (h * 10) / 12] : [(h * 2) / 12, (h * 5) / 12];
  const pen = new Pen().move({ x: r, y: 0 });
  if (side === 'top') pen.line({ x: x1, y: 0 }).line(tip).line({ x: x2, y: 0 });
  pen.line({ x: w - r, y: 0 });
  if (r > 0) pen.ellipse({ x: w - r, y: r }, r, r, -Math.PI / 2, 0);
  if (side === 'right') pen.line({ x: w, y: y1 }).line(tip).line({ x: w, y: y2 });
  pen.line({ x: w, y: h - r });
  if (r > 0) pen.ellipse({ x: w - r, y: h - r }, r, r, 0, Math.PI / 2);
  if (side === 'bottom') pen.line({ x: x2, y: h }).line(tip).line({ x: x1, y: h });
  pen.line({ x: r, y: h });
  if (r > 0) pen.ellipse({ x: r, y: h - r }, r, r, Math.PI / 2, Math.PI);
  if (side === 'left') pen.line({ x: 0, y: y2 }).line(tip).line({ x: 0, y: y1 });
  pen.line({ x: 0, y: r });
  if (r > 0) pen.ellipse({ x: r, y: r }, r, r, Math.PI, (Math.PI * 3) / 2);
  return { commands: pen.close().commands, fill: true, stroke: true };
}

/** An ellipse filling the box, with a wedge out to `tip`, its base a little either side. */
export function wedgeEllipse(w: number, h: number, tip: Pt): Outline {
  const c = { x: w / 2, y: h / 2 };
  const [rx, ry] = [w / 2, h / 2];
  const toward = Math.atan2((tip.y - c.y) / ry, (tip.x - c.x) / rx);
  const half = 0.2;
  const pen = new Pen()
    .move(onEllipse(c, rx, ry, toward + half))
    .ellipse(c, rx, ry, toward + half, toward + Math.PI * 2 - half)
    .line(tip);
  return { commands: pen.close().commands, fill: true, stroke: true };
}

/** A point on a cubic curve. */
const onCurve = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt => {
  const u = 1 - t;
  const [a, b, c, d] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
};

/**
 * A cloud: scallops around an ellipse, fitted to the box; with its tail, three small
 * ellipses shrinking toward `tip`.
 */
export function cloud(w: number, h: number, tip: Pt | null): Outline[] {
  const bumps = 10;
  const c = { x: 0.5, y: 0.5 };
  const corners = Array.from({ length: bumps }, (_, i) =>
    onEllipse(c, 0.38, 0.36, -Math.PI / 2 + (i * Math.PI * 2) / bumps + (i % 2) * 0.08),
  );
  // Each scallop bulges outward from its chord.
  const curves = corners.map((from, i) => {
    const to = corners[(i + 1) % bumps]!;
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const out = Math.atan2(mid.y - c.y, mid.x - c.x);
    const push = Math.hypot(to.x - from.x, to.y - from.y) * 0.62;
    const [ox, oy] = [Math.cos(out) * push, Math.sin(out) * push];
    return [
      from,
      { x: from.x + (to.x - from.x) * 0.1 + ox, y: from.y + (to.y - from.y) * 0.1 + oy },
      { x: to.x - (to.x - from.x) * 0.1 + ox, y: to.y - (to.y - from.y) * 0.1 + oy },
      to,
    ] as const;
  });
  // Fit what is drawn to the box.
  const drawn = curves.flatMap(([a, b, d, e]) =>
    Array.from({ length: 13 }, (_, i) => onCurve(a, b, d, e, i / 12)),
  );
  const [left, right] = [Math.min(...drawn.map((p) => p.x)), Math.max(...drawn.map((p) => p.x))];
  const [top, bottom] = [Math.min(...drawn.map((p) => p.y)), Math.max(...drawn.map((p) => p.y))];
  const fit = (p: Pt): Pt => ({
    x: ((p.x - left) / (right - left)) * w,
    y: ((p.y - top) / (bottom - top)) * h,
  });
  const pen = new Pen().move(fit(corners[0]!));
  for (const [, b, d, e] of curves) {
    const [p, q, r] = [fit(b), fit(d), fit(e)];
    pen.commands.push({ op: 'C', values: [p.x, p.y, q.x, q.y, r.x, r.y] });
  }
  const outlines: Outline[] = [{ commands: pen.close().commands, fill: true, stroke: true }];
  // The tail, if the tip is outside the cloud's own ellipse.
  const middle = { x: w / 2, y: h / 2 };
  const reach = Math.hypot((tip?.x ?? 0) - middle.x, ((tip?.y ?? 0) - middle.y) * (w / h));
  if (tip && reach > w / 2) {
    const angle = Math.atan2(((tip.y - middle.y) * w) / h, tip.x - middle.x);
    const edge = {
      x: middle.x + (Math.cos(angle) * w) / 2,
      y: middle.y + (Math.sin(angle) * h) / 2,
    };
    const size = Math.min(w, h);
    [0.09, 0.065, 0.04].forEach((radius, i) => {
      const at = {
        x: edge.x + ((tip.x - edge.x) * (i + 0.6)) / 3,
        y: edge.y + ((tip.y - edge.y) * (i + 0.6)) / 3,
      };
      const r = radius * size;
      const bubble = new Pen()
        .move({ x: at.x + r, y: at.y })
        .ellipse(at, r, r * 0.8, 0, Math.PI * 2)
        .close();
      outlines.push({ commands: bubble.commands, fill: true, stroke: true });
    });
  }
  return outlines;
}

/** Outlines in pixels, at a frame `width` × `height`, as a path shape's geometry. */
export function outlinesToGeometry(
  outlines: readonly PathOutline[],
  width: number,
  height: number,
): ShapeGeometry {
  return {
    kind: 'path',
    paths: outlines.map(({ commands, fill, stroke }) => ({
      d: writePathData(
        commands.map(
          (command) =>
            ({
              op: command.op,
              values: command.values.map((value, i) => value / (i % 2 === 0 ? width : height)),
            }) as PathCommand,
        ),
      ),
      fill,
      stroke,
    })),
  };
}

/** The callouts Insert → Caption makes (B17). */
export const CALLOUT_KINDS = ['rounded', 'square', 'oval', 'cloud'] as const;
export type CalloutKind = (typeof CALLOUT_KINDS)[number];

/**
 * A callout at a frame `width` × `height`, its tail pointing below to `tip` (pixels from the
 * frame's top left; by default below its left third, as a new caption's is).
 */
export function calloutGeometry(
  kind: CalloutKind,
  width: number,
  height: number,
  tip: Pt = { x: width * 0.29, y: height * 1.125 },
): ShapeGeometry {
  const size = Math.min(width, height);
  const outlines =
    kind === 'rounded'
      ? [wedgeRect(width, height, size / 6, tip)]
      : kind === 'square'
        ? [wedgeRect(width, height, 0, tip)]
        : kind === 'oval'
          ? [wedgeEllipse(width, height, tip)]
          : cloud(width, height, tip);
  return outlinesToGeometry(outlines, width, height);
}

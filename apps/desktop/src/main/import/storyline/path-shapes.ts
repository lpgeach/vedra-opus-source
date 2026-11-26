/**
 * Storyline shapes drawn as path shapes (docs/briefs/B13-path-shapes.md): callouts with their
 * tails, the cloud, the can, the frame and line callouts. The outlines are our own, after the
 * preset shapes of Office Open XML (ECMA-376), which Storyline's names and settings follow.
 * Each is worked out in pixels at the object's size, so its corners and ellipses keep their
 * proportions, then written in the 0–1 box path shapes use.
 */
import { cloud, outlinesToGeometry, Pen, wedgeEllipse, wedgeRect } from '@vedraopus/model';
import type { PathOutline as Outline, Pt, ShapeGeometry, XmlElement } from '@vedraopus/model';

/** An element's child elements, without its text. */
const elementsOf = (element: XmlElement | undefined): XmlElement[] =>
  (element?.children ?? []).filter((each): each is XmlElement => typeof each !== 'string');
const child = (element: XmlElement | undefined, name: string) =>
  elementsOf(element).find((each) => each.name === name);
const number = (value: string | undefined, fallback: number) => {
  const read = Number(value);
  return value !== undefined && value !== '' && Number.isFinite(read) ? read : fallback;
};

/** A callout's tip, from its `v` (a fraction of the box, often outside it). */
function tipOf(geometry: XmlElement | undefined, w: number, h: number): Pt {
  const v = child(geometry, 'v');
  return { x: number(v?.attrs['x'], 0.29) * w, y: number(v?.attrs['y'], 1.125) * h };
}

/** A can: its body, and its top's ellipse over it (wound the same way, so it is no hole). */
function can(w: number, h: number, offset: number): Outline[] {
  const ry = Math.min((Math.min(w, h) * offset) / 2, h / 2);
  const rx = w / 2;
  const body = new Pen()
    .move({ x: 0, y: ry })
    .line({ x: 0, y: h - ry })
    .ellipse({ x: rx, y: h - ry }, rx, ry, Math.PI, 0)
    .line({ x: w, y: ry })
    .ellipse({ x: rx, y: ry }, rx, ry, 0, -Math.PI)
    .close();
  const top = new Pen()
    .move({ x: 0, y: ry })
    .ellipse({ x: rx, y: ry }, rx, ry, Math.PI, 0)
    .ellipse({ x: rx, y: ry }, rx, ry, 0, -Math.PI)
    .close();
  // The body runs down, right, up, then left over the top; so does the top's ellipse.
  return [
    { commands: body.commands, fill: true, stroke: true },
    { commands: top.commands, fill: true, stroke: true },
  ];
}

/** A frame: the box with a hole, the hole wound the other way. */
function frame(w: number, h: number, thickness: number): Outline {
  const t = Math.min(thickness, w / 2, h / 2);
  const pen = new Pen()
    .move({ x: 0, y: 0 })
    .line({ x: w, y: 0 })
    .line({ x: w, y: h })
    .line({ x: 0, y: h })
    .close()
    .move({ x: t, y: t })
    .line({ x: t, y: h - t })
    .line({ x: w - t, y: h - t })
    .line({ x: w - t, y: t })
    .close();
  return { commands: pen.commands, fill: true, stroke: true };
}

/**
 * A line callout: the box (outlined unless it has no border), an accent bar down its side if
 * it has one, and the line from its start through its bends to the tip.
 */
function lineCallout(w: number, h: number, geometry: XmlElement, name: string): Outline[] {
  const tip = tipOf(geometry, w, h);
  const points = elementsOf(child(geometry, 'pts'))
    .filter((each) => each.name === 'pt')
    .map((pt) => ({ x: number(pt.attrs['x'], 0) * w, y: number(pt.attrs['y'], 0) * h }));
  const start = points[0] ?? { x: 0, y: h / 2 };
  const bar = /AccentBar/.test(name);
  const border = /Border/.test(name) || !/AccentBar|NoBorder/.test(name);
  const box = new Pen()
    .move({ x: 0, y: 0 })
    .line({ x: w, y: 0 })
    .line({ x: w, y: h })
    .line({ x: 0, y: h })
    .close();
  const line = new Pen().move(start);
  for (const point of points.slice(1)) line.line(point);
  line.line(tip);
  const outlines: Outline[] = [
    { commands: box.commands, fill: true, stroke: border },
    { commands: line.commands, fill: false, stroke: true },
  ];
  if (bar) {
    const accent = new Pen().move({ x: start.x, y: 0 }).line({ x: start.x, y: h });
    outlines.splice(1, 0, { commands: accent.commands, fill: false, stroke: true });
  }
  return outlines;
}

/** The kinds drawn here, by the element's name. */
const KINDS = new Set([
  'roundRectCallout',
  'rectCallout',
  'wedgeRectCallout',
  'ovalCallout',
  'cloudCallout',
  'can',
  'frame',
]);

/**
 * The shape as a path shape, or null when it is not one of the kinds drawn here.
 * `width` and `height` are the object's frame.
 */
export function pathShape(
  type: string,
  element: XmlElement,
  width: number,
  height: number,
): ShapeGeometry | null {
  if (width <= 0 || height <= 0) return null;
  const preset = child(element, 'prstGeom');
  const geometry = elementsOf(preset)[0];
  const name = geometry?.name ?? type;
  const [w, h] = [width, height];
  const size = Math.min(w, h);
  let outlines: Outline[] | null = null;
  if (/^lnCall1/.test(type) || /^lnCall1/.test(name)) {
    outlines = geometry ? lineCallout(w, h, geometry, name) : null;
  } else if (KINDS.has(type)) {
    switch (type) {
      case 'roundRectCallout':
        outlines = [wedgeRect(w, h, size / 6, tipOf(geometry, w, h))];
        break;
      case 'rectCallout':
      case 'wedgeRectCallout':
        outlines = [wedgeRect(w, h, 0, tipOf(geometry, w, h))];
        break;
      case 'ovalCallout':
        outlines = [wedgeEllipse(w, h, tipOf(geometry, w, h))];
        break;
      case 'cloudCallout':
        outlines = cloud(w, h, tipOf(geometry, w, h));
        break;
      case 'can':
        outlines = can(w, h, number(geometry?.attrs['offset'], 0.25));
        break;
      case 'frame':
        outlines = [frame(w, h, number(geometry?.attrs['cx'], 0.125) * size)];
        break;
    }
  }
  if (!outlines) return null;
  // From pixels to the 0–1 box.
  return outlinesToGeometry(outlines, w, h);
}

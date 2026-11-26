/**
 * A slide's shape tree as our objects (docs/briefs/P11.1-pptx-import.md):
 * text boxes, shapes, lines, pictures, tables and groups. What cannot be read
 * is left as a labelled placeholder and reported.
 */
import {
  createGroupObject,
  createImageObject,
  createShapeObject,
  createTableObject,
  createTextObject,
  plainRichText,
} from '@vedraopus/model';
import type {
  Appearance,
  Color,
  Fill,
  Frame,
  SceneObject,
  ShapeGeometry,
  Stroke,
} from '@vedraopus/model';
import { readColour } from './style';
import type { Palette } from './style';
import { plainWords, readTextBody } from './text';
import type { TextDefaults } from './text';
import { all, attr, elements, localName, numberAttr, one, path, px } from './xml';
import type { XmlElement } from './xml';

export interface ReportItem {
  /** From 1; null for the deck as a whole. */
  slide: number | null;
  outcome: 'approximated' | 'placeholder' | 'skipped';
  /** What it was, in the author's words, naming the shape. */
  what: string;
}

/** A placeholder's kind and index (`p:ph`), as layouts and masters are matched by them. */
export interface PlaceholderKey {
  type: string;
  idx: string | null;
}

/** What reading a slide's shapes needs from the rest of the deck. */
export interface ShapeContext {
  palette: Palette;
  slide: number | null;
  /** A placeholder's position from its layout, else its master; undefined when neither has one. */
  inheritedFrame(key: PlaceholderKey): Frame | undefined;
  /** How a placeholder's text looks where the slide does not say; plain text for other shapes. */
  textDefaults(key: PlaceholderKey | null): TextDefaults;
  /** Store the picture a relationship names, returning its asset hash, or null when it is not one we can use. */
  picture(relId: string): { hash: string } | { unsupported: string } | null;
  report(item: Omit<ReportItem, 'slide'>): void;
  /**
   * Sound or video (part C): the relationship its file is under, and whether it
   * is a video. Returns the object to stand in until the importer has run the
   * file through the media pipeline; undefined leaves it a reported placeholder.
   */
  media?(request: {
    relId: string;
    video: boolean;
    frame: Frame;
    name: string;
  }): SceneObject | undefined;
  /**
   * Content only a picture can show (part D): its element, where it goes and
   * what it is, for the report. Returns the object to stand in until the
   * importer has had it drawn; undefined leaves it a reported placeholder.
   */
  drawing?(request: {
    node: XmlElement;
    frame: Frame;
    label: string;
    name: string;
    what: string;
  }): SceneObject | undefined;
  /** Each top-level object with the deck's shape id, so animations can find it (part C). */
  register?(shapeId: string, object: SceneObject): void;
}

/** Child space to stage space: a group's transform, or none at the top. */
type Transform = (frame: { x: number; y: number; width: number; height: number }) => {
  x: number;
  y: number;
  width: number;
  height: number;
};
const IDENTITY: Transform = (frame) => frame;

/** A shape's `a:xfrm` in its parent's space, and its rotation and flips. */
function readXfrm(xfrm: XmlElement | undefined) {
  if (!xfrm) return null;
  const off = one(xfrm, 'off');
  const ext = one(xfrm, 'ext');
  return {
    x: numberAttr(off, 'x'),
    y: numberAttr(off, 'y'),
    width: numberAttr(ext, 'cx'),
    height: numberAttr(ext, 'cy'),
    rotation: numberAttr(xfrm, 'rot') / 60000,
    flipH: attr(xfrm, 'flipH') === '1',
    flipV: attr(xfrm, 'flipV') === '1',
  };
}

function toFrame(
  box: { x: number; y: number; width: number; height: number },
  rotation: number,
  transform: Transform,
): Frame {
  const placed = transform(box);
  return {
    x: px(placed.x),
    y: px(placed.y),
    width: Math.max(0, px(placed.width)),
    height: Math.max(0, px(placed.height)),
    rotation: ((rotation % 360) + 360) % 360,
  };
}

/** Points of a regular polygon (or star) in the 0–1 box, the first at the top. */
function regular(sides: number, inner?: number): { x: number; y: number }[] {
  const count = inner ? sides * 2 : sides;
  return Array.from({ length: count }, (_, i) => {
    const r = inner && i % 2 === 1 ? inner : 0.5;
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    return {
      x: Math.round((0.5 + r * Math.cos(angle)) * 1000) / 1000,
      y: Math.round((0.5 + r * Math.sin(angle)) * 1000) / 1000,
    };
  });
}

const POLYGONS: Record<string, { x: number; y: number }[]> = {
  rtTriangle: [
    { x: 0, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ],
  diamond: [
    { x: 0.5, y: 0 },
    { x: 1, y: 0.5 },
    { x: 0.5, y: 1 },
    { x: 0, y: 0.5 },
  ],
  parallelogram: [
    { x: 0.25, y: 0 },
    { x: 1, y: 0 },
    { x: 0.75, y: 1 },
    { x: 0, y: 1 },
  ],
  trapezoid: [
    { x: 0.25, y: 0 },
    { x: 0.75, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ],
  pentagon: regular(5),
  hexagon: [
    { x: 0.25, y: 0 },
    { x: 0.75, y: 0 },
    { x: 1, y: 0.5 },
    { x: 0.75, y: 1 },
    { x: 0.25, y: 1 },
    { x: 0, y: 0.5 },
  ],
  octagon: [
    { x: 0.29, y: 0 },
    { x: 0.71, y: 0 },
    { x: 1, y: 0.29 },
    { x: 1, y: 0.71 },
    { x: 0.71, y: 1 },
    { x: 0.29, y: 1 },
    { x: 0, y: 0.71 },
    { x: 0, y: 0.29 },
  ],
  star5: regular(5, 0.19),
  rightArrow: [
    { x: 0, y: 0.25 },
    { x: 0.6, y: 0.25 },
    { x: 0.6, y: 0 },
    { x: 1, y: 0.5 },
    { x: 0.6, y: 1 },
    { x: 0.6, y: 0.75 },
    { x: 0, y: 0.75 },
  ],
  leftArrow: [
    { x: 1, y: 0.25 },
    { x: 0.4, y: 0.25 },
    { x: 0.4, y: 0 },
    { x: 0, y: 0.5 },
    { x: 0.4, y: 1 },
    { x: 0.4, y: 0.75 },
    { x: 1, y: 0.75 },
  ],
  upArrow: [
    { x: 0.25, y: 1 },
    { x: 0.25, y: 0.4 },
    { x: 0, y: 0.4 },
    { x: 0.5, y: 0 },
    { x: 1, y: 0.4 },
    { x: 0.75, y: 0.4 },
    { x: 0.75, y: 1 },
  ],
  downArrow: [
    { x: 0.25, y: 0 },
    { x: 0.25, y: 0.6 },
    { x: 0, y: 0.6 },
    { x: 0.5, y: 1 },
    { x: 1, y: 0.6 },
    { x: 0.75, y: 0.6 },
    { x: 0.75, y: 0 },
  ],
};

/** Our geometry for a preset, flips applied; null when we have no match. */
function geometryOf(
  prst: string,
  geom: XmlElement | undefined,
  frame: Frame,
  flipH: boolean,
  flipV: boolean,
): ShapeGeometry | null {
  const flip = (points: { x: number; y: number }[]) =>
    points.map((p) => ({ x: flipH ? 1 - p.x : p.x, y: flipV ? 1 - p.y : p.y }));
  switch (prst) {
    case 'rect':
      return { kind: 'rect' };
    case 'roundRect': {
      // The corner is the adjustment (default 16 667, of 100 000) of the shorter side.
      const adj = all(one(geom, 'avLst'), 'gd').find((gd) => attr(gd, 'name') === 'adj');
      const share = adj
        ? Number((attr(adj, 'fmla') ?? '').replace(/^val\s+/, '')) / 100_000
        : 0.16667;
      return {
        kind: 'roundRect',
        radius: Math.round(
          Math.min(frame.width, frame.height) * (Number.isFinite(share) ? share : 0.16667),
        ),
      };
    }
    case 'ellipse':
      return { kind: 'ellipse' };
    case 'triangle':
      return flipV
        ? {
            kind: 'polygon',
            points: flip([
              { x: 0.5, y: 0 },
              { x: 1, y: 1 },
              { x: 0, y: 1 },
            ]),
          }
        : { kind: 'triangle' };
    default: {
      const points = POLYGONS[prst];
      return points ? { kind: 'polygon', points: flip(points) } : null;
    }
  }
}

/** A fill (`a:solidFill`, `a:gradFill`, `a:noFill`) inside `spPr`; undefined when it says none of them. */
function readFill(spPr: XmlElement | undefined, palette: Palette): Fill | undefined {
  if (one(spPr, 'noFill')) return { kind: 'none' };
  const solid = one(spPr, 'solidFill');
  if (solid) {
    const color = readColour(solid, palette);
    return color ? { kind: 'solid', color } : { kind: 'none' };
  }
  const gradient = one(spPr, 'gradFill');
  if (gradient) {
    const stops = all(one(gradient, 'gsLst'), 'gs')
      .map((gs) => ({ offset: numberAttr(gs, 'pos') / 100_000, color: readColour(gs, palette) }))
      .filter((stop): stop is { offset: number; color: Color } => stop.color !== null)
      .sort((a, b) => a.offset - b.offset);
    if (stops.length >= 2) {
      return { kind: 'gradient', angle: numberAttr(one(gradient, 'lin'), 'ang') / 60000, stops };
    }
    if (stops.length === 1) return { kind: 'solid', color: stops[0]!.color };
  }
  return undefined;
}

/** A line (`a:ln`); undefined when the shape does not say. */
function readStroke(ln: XmlElement | undefined, palette: Palette): Stroke | null | undefined {
  if (!ln) return undefined;
  if (one(ln, 'noFill')) return null;
  const color = readColour(one(ln, 'solidFill'), palette);
  const dash = attr(one(ln, 'prstDash'), 'val') ?? 'solid';
  const width = numberAttr(ln, 'w', 9525) / 9525;
  if (!color) return undefined;
  return {
    color,
    width: Math.max(0.25, Math.round(width * 100) / 100),
    dash: dash.toLowerCase().includes('dot') ? 'dot' : dash === 'solid' ? 'solid' : 'dash',
  };
}

/** The shape's own name and description (`p:cNvPr`). */
function propsOf(nv: XmlElement | undefined) {
  const cNvPr = one(nv, 'cNvPr');
  const decorative = all(path(cNvPr, 'extLst'), 'ext').some((ext) =>
    elements(ext).some(
      (child) => localName(child.name) === 'decorative' && attr(child, 'val') === '1',
    ),
  );
  return {
    name: attr(cNvPr, 'name') || '',
    alt: attr(cNvPr, 'descr') ?? '',
    decorative,
  };
}

/** Which of our placeholders a PowerPoint one is: a title, content, or neither (dates, footers, numbers). */
export function placeholderKind(key: PlaceholderKey): 'title' | 'content' | null {
  if (key.type === 'title' || key.type === 'ctrTitle') return 'title';
  if (['body', 'obj', 'subTitle'].includes(key.type)) return 'content';
  return null;
}

function placeholderOf(nv: XmlElement | undefined): PlaceholderKey | null {
  const ph = path(nv, 'nvPr', 'ph');
  if (!ph) return null;
  return { type: attr(ph, 'type') ?? 'body', idx: attr(ph, 'idx') ?? null };
}

/** Name, alt text and decoration onto an object. */
function described<T extends SceneObject>(
  object: T,
  own: { name: string; alt: string; decorative: boolean },
): T {
  if (own.name) object.name = own.name;
  if (own.alt.trim()) object.a11y = { ...object.a11y, altText: own.alt.trim() };
  if (own.decorative) object.a11y = { ...object.a11y, visibleToAssistiveTech: false };
  return object;
}

/** A grey box with a label where something could not be read; part D draws a picture there. */
export function placeholderBox(frame: Frame, label: string, name: string): SceneObject {
  const box = createShapeObject({ kind: 'rect' }, frame, name || label);
  box.props.appearance = {
    fill: { kind: 'solid', color: '#e4e8ec' },
    stroke: { color: '#808a93', width: 1, dash: 'dash' },
    shadow: null,
    opacity: 1,
  };
  box.props.text = plainRichText(`[${label}]`);
  return box;
}

function readSp(sp: XmlElement, ctx: ShapeContext, transform: Transform): SceneObject | null {
  const nv = one(sp, 'nvSpPr');
  const own = propsOf(nv);
  const key = placeholderOf(nv);
  const spPr = one(sp, 'spPr');
  const xfrm = readXfrm(one(spPr, 'xfrm'));
  const frame = xfrm
    ? toFrame(xfrm, xfrm.rotation, transform)
    : key
      ? ctx.inheritedFrame(key)
      : undefined;
  if (!frame) {
    ctx.report({ outcome: 'skipped', what: `“${own.name || 'A shape'}” has no position` });
    return null;
  }
  const txBody = one(sp, 'txBody');
  const hasWords = plainWords(txBody) !== '';
  const text = hasWords ? readTextBody(txBody, ctx.palette, ctx.textDefaults(key)) : null;
  const style = one(sp, 'style');
  const fill =
    readFill(spPr, ctx.palette) ?? (style ? readStyleFill(style, ctx.palette) : undefined);
  const stroke =
    readStroke(one(spPr, 'ln'), ctx.palette) ??
    (style ? readStyleStroke(style, ctx.palette) : undefined);
  const geom = one(spPr, 'prstGeom');
  const prst = attr(geom, 'prst') ?? (one(spPr, 'custGeom') ? 'custom' : 'rect');
  const isTextBox = attr(one(nv, 'cNvSpPr'), 'txBox') === '1';
  const bare =
    (fill === undefined || fill.kind === 'none') && (stroke === undefined || stroke === null);

  // A text box, or a placeholder or rectangle with no fill or line: text.
  if (text && (isTextBox || (bare && prst === 'rect'))) {
    const box = createTextObject('', frame, own.name || 'Text Box');
    box.props.text = text;
    box.props.padding = Math.round(px(numberAttr(one(txBody, 'bodyPr'), 'lIns', 91440)));
    // The slide's copy of its layout's title or content placeholder (part B).
    const kind = key ? placeholderKind(key) : null;
    if (kind) box.props.placeholder = kind;
    return described(box, own);
  }

  if (prst === 'line' || prst === 'straightConnector1') {
    return lineFrom(sp, frame, xfrm, stroke ?? null, own, ctx);
  }

  let geometry = geometryOf(prst, geom, frame, xfrm?.flipH ?? false, xfrm?.flipV ?? false);
  if (!geometry) {
    ctx.report({
      outcome: 'approximated',
      what: `“${own.name || 'A shape'}” is a ${prst === 'custom' ? 'freeform' : prst} shape, drawn as a rectangle`,
    });
    geometry = { kind: 'rect' };
  }
  const shape = createShapeObject(geometry, frame, own.name || 'Shape');
  const appearance: Appearance = {
    fill: fill ?? { kind: 'none' },
    stroke: stroke ?? null,
    shadow: null,
    opacity: 1,
  };
  shape.props.appearance = appearance;
  shape.props.text = text;
  return described(shape, own);
}

/** The fill a shape's style refers to (`p:style/a:fillRef`), as its own colour. */
function readStyleFill(style: XmlElement, palette: Palette): Fill | undefined {
  const ref = one(style, 'fillRef');
  if (!ref || attr(ref, 'idx') === '0') return undefined;
  const color = readColour(ref, palette);
  return color ? { kind: 'solid', color } : undefined;
}

function readStyleStroke(style: XmlElement, palette: Palette): Stroke | undefined {
  const ref = one(style, 'lnRef');
  if (!ref || attr(ref, 'idx') === '0') return undefined;
  const color = readColour(ref, palette);
  return color ? { color, width: 1, dash: 'solid' } : undefined;
}

/** A line or connector: as long as its diagonal, turned to its angle, about its middle. */
function lineFrom(
  node: XmlElement,
  frame: Frame,
  xfrm: ReturnType<typeof readXfrm>,
  stroke: Stroke | null,
  own: ReturnType<typeof propsOf>,
  ctx: ShapeContext,
): SceneObject {
  const ln = one(one(node, 'spPr'), 'ln');
  const head = attr(one(ln, 'headEnd'), 'type');
  const tail = attr(one(ln, 'tailEnd'), 'type');
  const arrowAtEnd = !!tail && tail !== 'none';
  const arrowAtStart = !!head && head !== 'none';
  const length = Math.hypot(frame.width, frame.height);
  let angle = (Math.atan2(frame.height, frame.width) * 180) / Math.PI;
  if (xfrm?.flipH) angle = 180 - angle;
  if (xfrm?.flipV) angle = -angle;
  // An arrow at the start only: turn it round, so its head is at our end.
  if (arrowAtStart && !arrowAtEnd) angle += 180;
  if (arrowAtStart && arrowAtEnd) {
    ctx.report({
      outcome: 'approximated',
      what: `“${own.name || 'A line'}” has arrows at both ends; one is kept`,
    });
  }
  const centre = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
  const line = createShapeObject(
    { kind: arrowAtEnd || arrowAtStart ? 'arrow' : 'line' },
    {
      x: Math.round((centre.x - length / 2) * 100) / 100,
      y: centre.y,
      width: Math.round(length * 100) / 100,
      height: 0,
      rotation: (((angle + frame.rotation) % 360) + 360) % 360,
    },
    own.name || 'Line',
  );
  if (stroke) line.props.appearance = { ...line.props.appearance, stroke };
  return described(line, own);
}

function readPic(pic: XmlElement, ctx: ShapeContext, transform: Transform): SceneObject | null {
  const nv = one(pic, 'nvPicPr');
  const own = propsOf(nv);
  const xfrm = readXfrm(path(pic, 'spPr', 'xfrm'));
  const key = placeholderOf(nv);
  const frame = xfrm
    ? toFrame(xfrm, xfrm.rotation, transform)
    : key
      ? ctx.inheritedFrame(key)
      : undefined;
  if (!frame) return null;
  const nvPr = path(nv, 'nvPr');
  const videoFile = one(nvPr, 'videoFile');
  const audioFile = one(nvPr, 'audioFile');
  if (videoFile || audioFile) {
    // The file itself: PowerPoint 2010's `p14:media` embed, else the older link if it is in the deck.
    const embedded = all(path(nvPr, 'extLst'), 'ext')
      .flatMap((ext) => all(ext, 'media'))
      .map((media) => attr(media, 'embed'))
      .find((id) => id);
    const relId = embedded ?? attr(videoFile ?? audioFile, 'link');
    const made = relId
      ? ctx.media?.({
          relId,
          video: !!videoFile,
          frame,
          name: own.name || (videoFile ? 'Video' : 'Audio'),
        })
      : undefined;
    if (made) return described(made, own);
    ctx.report({
      outcome: 'placeholder',
      what: `“${own.name || 'A video or sound'}” is ${videoFile ? 'a video' : 'a sound'} that could not be imported`,
    });
    return placeholderBox(frame, 'Media', own.name);
  }
  const blip = path(pic, 'blipFill', 'blip');
  const relId = attr(blip, 'embed');
  const stored = relId ? ctx.picture(relId) : null;
  if (!stored || 'unsupported' in stored) {
    const kind = stored && 'unsupported' in stored ? stored.unsupported : 'linked';
    const what = `“${own.name || 'A picture'}” is a ${kind} picture`;
    // A picture in the deck, in a format courses do not show, can be drawn (part D).
    const standIn = stored
      ? ctx.drawing?.({ node: pic, frame, label: 'Picture', name: own.name || 'Picture', what })
      : undefined;
    if (standIn) return described(standIn, own);
    ctx.report({ outcome: 'placeholder', what });
    return placeholderBox(frame, 'Picture', own.name);
  }
  const image = createImageObject(stored.hash, frame, own.name || 'Picture');
  const crop = path(pic, 'blipFill', 'srcRect');
  if (crop) {
    const [l, t, r, b] = ['l', 't', 'r', 'b'].map((side) => numberAttr(crop, side) / 100_000) as [
      number,
      number,
      number,
      number,
    ];
    if (l || t || r || b) {
      image.props.crop = {
        x: Math.max(0, l),
        y: Math.max(0, t),
        width: Math.min(1, Math.max(0.01, 1 - l - r)),
        height: Math.min(1, Math.max(0.01, 1 - t - b)),
      };
    }
  }
  return described(image, own);
}

function readTable(
  tbl: XmlElement,
  frame: Frame,
  ctx: ShapeContext,
  own: ReturnType<typeof propsOf>,
): SceneObject {
  const widths = all(one(tbl, 'tblGrid'), 'gridCol').map((col) =>
    Math.max(1, numberAttr(col, 'w', 1)),
  );
  const rows = all(tbl, 'tr');
  const table = createTableObject(Math.max(1, widths.length), Math.max(1, rows.length), frame);
  const total = widths.reduce((a, b) => a + b, 0) || 1;
  table.props.columns = widths.map((w) => Math.round((w / total) * 1000) / 1000);
  const tblPr = one(tbl, 'tblPr');
  table.props.headerRow = attr(tblPr, 'firstRow') === '1';
  table.props.headerColumn = attr(tblPr, 'firstCol') === '1';
  const heights = rows.map((tr) => Math.max(1, numberAttr(tr, 'h', 1)));
  const tall = heights.reduce((a, b) => a + b, 0) || 1;
  table.props.rows = rows.map((tr, r) => {
    const cells = all(tr, 'tc');
    return {
      height: Math.round((heights[r]! / tall) * 1000) / 1000,
      cells: widths.map((_, c) => {
        const tc = cells[c];
        const words = tc
          ? readTextBody(one(tc, 'txBody'), ctx.palette, ctx.textDefaults(null))
          : plainRichText('');
        const fill = tc ? readFill(one(tc, 'tcPr'), ctx.palette) : undefined;
        return {
          text: plainWords(one(tc, 'txBody')) ? words : plainRichText(''),
          fill: fill?.kind === 'solid' ? fill.color : null,
        };
      }),
    };
  });
  if (all(rows[0], 'tc').some((tc) => attr(tc, 'gridSpan') || attr(tc, 'rowSpan'))) {
    ctx.report({
      outcome: 'approximated',
      what: `“${own.name || 'A table'}” has merged cells, shown unmerged`,
    });
  }
  return described(table, own);
}

/** What a graphic frame holds: a table, or something only a picture can show (part D). */
function readGraphicFrame(
  node: XmlElement,
  ctx: ShapeContext,
  transform: Transform,
): SceneObject | null {
  const nv = one(node, 'nvGraphicFramePr');
  const own = propsOf(nv);
  const xfrm = readXfrm(one(node, 'xfrm'));
  const key = placeholderOf(nv);
  const frame = xfrm
    ? toFrame(xfrm, xfrm.rotation, transform)
    : key
      ? ctx.inheritedFrame(key)
      : undefined;
  if (!frame) return null;
  const data = path(node, 'graphic', 'graphicData');
  const tbl = one(data, 'tbl');
  if (tbl) return readTable(tbl, frame, ctx, own);
  const uri = attr(data, 'uri') ?? '';
  const label = uri.includes('chart')
    ? 'Chart'
    : uri.includes('diagram')
      ? 'SmartArt'
      : uri.includes('ole')
        ? 'Embedded object'
        : 'Object';
  const what = `“${own.name || label}” is ${label === 'SmartArt' ? 'SmartArt' : `a ${label.toLowerCase()}`}`;
  const standIn = ctx.drawing?.({ node, frame, label, name: own.name || label, what });
  if (standIn) return described(standIn, own);
  ctx.report({ outcome: 'placeholder', what });
  return placeholderBox(frame, label, own.name);
}

function readGroup(group: XmlElement, ctx: ShapeContext, transform: Transform): SceneObject | null {
  const own = propsOf(one(group, 'nvGrpSpPr'));
  const xfrm = one(one(group, 'grpSpPr'), 'xfrm');
  const off = one(xfrm, 'off');
  const ext = one(xfrm, 'ext');
  const chOff = one(xfrm, 'chOff');
  const chExt = one(xfrm, 'chExt');
  const sx = numberAttr(chExt, 'cx', 1) ? numberAttr(ext, 'cx', 1) / numberAttr(chExt, 'cx', 1) : 1;
  const sy = numberAttr(chExt, 'cy', 1) ? numberAttr(ext, 'cy', 1) / numberAttr(chExt, 'cy', 1) : 1;
  const inner: Transform = (box) =>
    transform({
      x: numberAttr(off, 'x') + (box.x - numberAttr(chOff, 'x')) * sx,
      y: numberAttr(off, 'y') + (box.y - numberAttr(chOff, 'y')) * sy,
      width: box.width * sx,
      height: box.height * sy,
    });
  if (numberAttr(xfrm, 'rot') !== 0) {
    ctx.report({
      outcome: 'approximated',
      what: `“${own.name || 'A group'}” is turned; its parts are placed unturned`,
    });
  }
  const children = readTree(group, ctx, inner);
  if (children.length === 0) return null;
  return described(createGroupObject(children, own.name || 'Group'), own);
}

/**
 * A slide's, layout's or master's own background (`p:cSld/p:bg`) as a locked
 * shape or picture the size of the stage, for the bottom of its layer (part B);
 * null when it has none of its own.
 */
export function readBackground(
  cSld: XmlElement | undefined,
  ctx: ShapeContext,
  stage: { width: number; height: number },
): SceneObject | null {
  const bg = one(cSld, 'bg');
  if (!bg) return null;
  const frame: Frame = { x: 0, y: 0, width: stage.width, height: stage.height, rotation: 0 };
  const bgPr = one(bg, 'bgPr');
  const blip = path(bgPr, 'blipFill', 'blip');
  let made: SceneObject | null = null;
  if (blip) {
    const stored = ctx.picture(attr(blip, 'embed') ?? '');
    if (stored && 'hash' in stored) made = createImageObject(stored.hash, frame, 'Background');
    else
      ctx.report({
        outcome: 'skipped',
        what: 'A background picture of a type a course cannot show',
      });
  } else {
    // Its own fill, or the colour its theme reference names (`p:bgRef`).
    const fill = bgPr ? readFill(bgPr, ctx.palette) : undefined;
    const refColour = readColour(one(bg, 'bgRef'), ctx.palette);
    const chosen: Fill | undefined =
      fill ?? (refColour ? { kind: 'solid', color: refColour } : undefined);
    if (chosen && chosen.kind !== 'none') {
      const shape = createShapeObject({ kind: 'rect' }, frame, 'Background');
      shape.props.appearance = { fill: chosen, stroke: null, shadow: null, opacity: 1 };
      made = shape;
    }
  }
  if (!made) return null;
  made.locked = true;
  made.a11y = { ...made.a11y, visibleToAssistiveTech: false };
  return made;
}

/** A shape tree without its placeholders: what a layout or master draws of its own. */
export function withoutPlaceholders(tree: XmlElement | undefined): XmlElement | undefined {
  if (!tree) return undefined;
  return {
    ...tree,
    children: tree.children.filter(
      (child) =>
        typeof child === 'string' ||
        !path(child, localName(child.name) === 'sp' ? 'nvSpPr' : 'nvPicPr', 'nvPr', 'ph'),
    ),
  };
}

/** Every object of a shape tree (`p:spTree`, or a group), in drawing order. */
export function readTree(
  tree: XmlElement | undefined,
  ctx: ShapeContext,
  transform: Transform = IDENTITY,
): SceneObject[] {
  const objects: SceneObject[] = [];
  for (const node of elements(tree)) {
    const made = readNode(node, ctx, transform);
    if (!made) continue;
    objects.push(made);
    // Only the top of the tree: animations name top-level shapes, and only those may have them.
    if (transform === IDENTITY) {
      const id = attr(path(elements(node)[0], 'cNvPr'), 'id');
      if (id) ctx.register?.(id, made);
    }
  }
  return objects;
}

function readNode(node: XmlElement, ctx: ShapeContext, transform: Transform): SceneObject | null {
  switch (localName(node.name)) {
    case 'sp':
      return readSp(node, ctx, transform);
    case 'cxnSp': {
      const own = propsOf(one(node, 'nvCxnSpPr'));
      const xfrm = readXfrm(path(node, 'spPr', 'xfrm'));
      if (!xfrm) return null;
      const frame = toFrame(xfrm, xfrm.rotation, transform);
      const style = one(node, 'style');
      const stroke =
        readStroke(path(node, 'spPr', 'ln'), ctx.palette) ??
        (style ? readStyleStroke(style, ctx.palette) : undefined);
      return lineFrom(node, frame, xfrm, stroke ?? null, own, ctx);
    }
    case 'pic':
      return readPic(node, ctx, transform);
    case 'graphicFrame':
      return readGraphicFrame(node, ctx, transform);
    case 'grpSp':
      return readGroup(node, ctx, transform);
    case 'AlternateContent': {
      // Newer content with an older fallback: the fallback is what we can read.
      const choice = one(node, 'Fallback') ?? one(node, 'Choice');
      const inner = readTree(choice, ctx, transform);
      return inner.length === 1 ? inner[0]! : inner.length > 1 ? createGroupObject(inner) : null;
    }
    case 'contentPart':
      ctx.report({ outcome: 'skipped', what: 'Ink drawing' });
      return null;
    default:
      return null;
  }
}

/**
 * A `.story` course as a project (docs/briefs/B5-storyline-import.md, part A): its
 * scenes and slides, their objects, states, layers, timing and animations, the
 * course's variables, and the triggers between them. What has no counterpart yet
 * is left out, or drawn as near as it can be, and said so in the report.
 */
import {
  createAudioObject,
  createDialObject,
  createEffect,
  createEmptyProject,
  createGroupObject,
  createHotspotObject,
  createId,
  createImageObject,
  createLayer,
  createScene,
  createShapeObject,
  createSlide,
  createSliderObject,
  createTableObject,
  createTextObject,
  createVideoObject,
  emptyRichText,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_ROWS,
  effectDirections,
  notesFromText,
  plainRichText,
  shapePreset,
} from '@vedraopus/model';
import type {
  Appearance,
  ParsedCaptions,
  Color,
  Condition,
  DialObject,
  Effect,
  EffectKind,
  Layer,
  MotionPath,
  ObjectState,
  Project,
  Question,
  SceneObject,
  ShapeGeometry,
  Slide,
  Trigger,
  TriggerAction,
  TriggerEvent,
  Variable,
  XmlElement,
} from '@vedraopus/model';
import type { PowerPointReport, PowerPointReportItem } from '../../../shared/ipc';
import { readColour, readPalette, themeColours } from './colour';
import type { Palette } from './colour';
import { readXml, relationshipsOf } from './package';
import { pathShape } from './path-shapes';
import type { StorylinePackage } from './package';
import { hasWords, storylineText } from './text';

/** A media item stored in the workspace, ready to be placed. */
export interface PlacedMedia {
  hash: string;
  kind: 'image' | 'audio' | 'video';
  /** Seconds, for sound and video. */
  duration?: number;
}

export interface ConvertOptions {
  /** The course's title when it has none of its own: the file's name. */
  fileName: string;
  /** A media item by GUID, once stored; null when it could not be. */
  media: (g: string) => PlacedMedia | null;
  /** A caption file by GUID, read (B5 part C); a video or sound names its own with `ccG`. */
  captions?: (g: string) => ParsedCaptions | null;
  /**
   * A file a trigger opens by a path relative to the course (B15), brought in from beside the
   * `.story` file: its asset's hash, or null when it was not there.
   */
  externalFile?: (path: string) => string | null;
}

/**
 * A path a trigger may open beside the published course (B15): relative, its parts joined by
 * `/`, with no `..`, no drive or scheme, and nothing a browser would take for an address of its own.
 */
export const RELATIVE_FILE = /^(?![/\\])(?!.*(?:^|[/\\])\.\.(?:[/\\]|$))[^:?#*"<>|]+$/;

export interface ConvertResult {
  project: Project;
  report: PowerPointReport;
}

// ------------------------------------------------------------------- reading

const kids = (element: XmlElement | undefined, name?: string): XmlElement[] =>
  (element?.children ?? []).filter(
    (child): child is XmlElement => typeof child !== 'string' && (!name || child.name === name),
  );
const kid = (element: XmlElement | undefined, name: string) => kids(element, name)[0];
const textOf = (element: XmlElement | undefined): string =>
  (element?.children ?? []).filter((child): child is string => typeof child === 'string').join('');
const num = (value: string | undefined, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const NO_ID = '00000000-0000-0000-0000-000000000000';
const isId = (value: string | undefined): value is string => !!value && value !== NO_ID;

/** `PT0.75S`, `PT1M1S` and the like, in seconds. */
export function isoSeconds(value: string | undefined): number {
  const match = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(
    value ?? '',
  );
  if (!match) return 0;
  return num(match[1]) * 3600 + num(match[2]) * 60 + num(match[3]);
}

const round = (value: number) => Math.round(value * 100) / 100;

// ------------------------------------------------------------- motion paths

/**
 * A motion path is an element of its own in a shape list (`linePath`, `customPath`, `turnPath`,
 * `arcPath`…), naming the object it moves in `shapeG`. Its points are offsets of that object's
 * position, in stage pixels.
 */
export const isMotionPath = (element: XmlElement) =>
  /Path$/.test(element.name) && element.attrs['shapeG'] !== undefined;

const EASING: Record<string, MotionPath['easing']> = {
  none: 'linear',
  in: 'easeIn',
  out: 'easeOut',
  inOut: 'easeInOut',
};
const MAX_PATH_POINTS = 500;
/** A quarter circle's curve controls are this far along its tangents, in radii. */
const KAPPA = 0.5522847498;
/**
 * An arc path's points, as fractions across its chord and of its depth (B16): those Storyline's
 * published courses move through, from one end to the other.
 */
const ARC_POINTS: [number, number][] = [
  [0, 0],
  [0.2681, 0.7424],
  [0.3243, 0.9097],
  [0.4042, 1],
  [0.5, 1],
  [0.5958, 1],
  [0.6757, 0.9097],
  [0.7319, 0.7424],
  [1, 0],
];

/** A motion path element as ours, with what could not be kept exactly, or null if its shape is unknown. */
export function readMotionPath(
  element: XmlElement,
): { path: MotionPath; approximated: string[] } | null {
  const box = kid(element, 'loc')?.attrs ?? {};
  const l = num(box['l']);
  const t = num(box['t']);
  const r = num(box['r']);
  const b = num(box['b']);
  const name = cleanName(element.attrs['name'], 'Motion path');
  const dir = element.attrs['dir'] ?? '';
  const approximated: string[] = [];
  let shape: MotionPath['shape'];
  let points: MotionPath['points'];
  switch (element.name) {
    case 'linePath':
      // `loc` holds the start (l, t) and the end (r, b).
      shape = 'line';
      points = [
        { x: l, y: t },
        { x: r, y: b },
      ];
      break;
    case 'customPath': {
      // `loc` is the bounding box; `pts` are fractions of it.
      shape = 'freeform';
      points = kids(kid(element, 'pts'), 'pt').map((pt) => ({
        x: l + num(pt.attrs['x']) * (r - l),
        y: t + num(pt.attrs['y']) * (b - t),
      }));
      if (points.length > MAX_PATH_POINTS) {
        const step = (points.length - 1) / (MAX_PATH_POINTS - 1);
        points = Array.from({ length: MAX_PATH_POINTS }, (_, i) => points[Math.round(i * step)]!);
      }
      if (points.length < 2) return null;
      break;
    }
    case 'turnPath': {
      // A turn from (l, t) to (r, b), setting off along `dir`'s first letter: straight for half
      // the way, round a corner, then straight on. These are the points Storyline's published
      // courses move through (B16): the corner's two are a curve's controls (KAPPA), and the
      // object moves straight from point to point, as ours does along a freeform path.
      shape = 'freeform';
      const dx = r - l;
      const dy = b - t;
      const corner = (1 + KAPPA) / 2;
      const across = /^[ud]/.test(dir)
        ? [
            [0, 0],
            [0, 0.5],
            [0, corner],
            [1 - corner, 1],
            [0.5, 1],
            [1, 1],
          ]
        : [
            [0, 0],
            [0.5, 0],
            [corner, 0],
            [1, 1 - corner],
            [1, 0.5],
            [1, 1],
          ];
      points = across.map(([u, v]) => ({ x: l + u! * dx, y: t + v! * dy }));
      break;
    }
    case 'arcPath': {
      // From (l, t) across to (r, t), rising or falling to b in the middle, then turned by `rot`
      // about the middle of that box (B16): the points Storyline's published courses move through.
      shape = 'freeform';
      const turn = num(element.attrs['rot'], -1);
      const angle = turn === -1 ? 0 : (turn * Math.PI) / 180;
      const [cx, cy] = [(l + r) / 2, (t + b) / 2];
      const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
      points = ARC_POINTS.map(([u, v]) => {
        const [x, y] = [l + u * (r - l) - cx, t + v * (b - t) - cy];
        return { x: cx + x * cos - y * sin, y: cy + x * sin + y * cos };
      });
      break;
    }
    default:
      return null;
  }
  if (element.attrs['reverse'] === 'true') points = [...points].reverse();
  if (element.attrs['orientShape'] === 'true')
    approximated.push(`The object on “${name}” no longer turns to follow the path`);
  if (element.attrs['autoReverse'] === 'true')
    approximated.push(`The object on “${name}” no longer comes back along the path`);
  const seconds = isoSeconds(element.attrs['aniDur']) || 2;
  const duration = Math.min(60, Math.max(0.05, round(seconds)));
  if (duration !== round(seconds))
    approximated.push(`“${name}” takes ${duration} s instead of ${round(seconds)} s`);
  return {
    path: {
      id: createId('path'),
      name,
      shape,
      points: points.map((point) => ({ x: round(point.x), y: round(point.y) })),
      duration,
      easing: EASING[element.attrs['easingDir'] ?? 'none'] ?? 'easeInOut',
      relativeStart: element.attrs['relativeStart'] === 'true',
    },
    approximated,
  };
}

/** Object element names, and what they become. */
const SHAPES: Record<string, ShapeGeometry> = {
  rect: { kind: 'rect' },
  roundRect: { kind: 'roundRect', radius: 12 },
  oval: { kind: 'ellipse' },
  triangle: { kind: 'triangle' },
  line: { kind: 'line' },
  arrow: { kind: 'arrow' },
};
type Pt = { x: number; y: number };
const polygonOf = (...flat: number[]): ShapeGeometry => {
  const points: Pt[] = [];
  for (let at = 0; at < flat.length; at += 2) {
    points.push({ x: round4(flat[at]!), y: round4(flat[at + 1]!) });
  }
  return { kind: 'polygon', points };
};
const round4 = (value: number) => Math.round(value * 1e4) / 1e4;
const clampShare = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/**
 * Shapes with a polygon of their own (B5 part C), in a 0–1 box, by the proportions the course
 * stores in `prstGeom` where it does (a polygon's sides and how far in its corners sit; a
 * trapezoid's, a chevron's and arrows' insets), and our presets' otherwise.
 */
function polygonShape(type: string, element: XmlElement): ShapeGeometry | null {
  const geometry = kids(kid(element, 'prstGeom'))[0]?.attrs ?? {};
  const share = (key: string, fallback: number) => clampShare(num(geometry[key], fallback), 0, 1);
  switch (type) {
    case 'diamond':
    case 'pentagon':
    case 'hexagon':
    case 'octagon':
    case 'parallelogram':
    case 'plus':
      return shapePreset(type);
    case 'star5':
      return shapePreset('star');
    case 'rtTriangle':
      return shapePreset('rightTriangle');
    case 'rightArrow':
      return shapePreset('blockArrow');
    case 'polygon': {
      const sides = Math.round(num(geometry['sides'], 6));
      if (sides === 6) {
        const o = clampShare(num(geometry['offset'], 0.25), 0, 0.5);
        return polygonOf(o, 0, 1 - o, 0, 1, 0.5, 1 - o, 1, o, 1, 0, 0.5);
      }
      if (sides < 3 || sides > 64) return null;
      const corners = Array.from({ length: sides }, (_, at) => {
        const angle = (at / sides) * 2 * Math.PI - Math.PI / 2;
        return { x: Math.cos(angle), y: Math.sin(angle) };
      });
      const xs = corners.map((c) => c.x);
      const ys = corners.map((c) => c.y);
      const [left, top] = [Math.min(...xs), Math.min(...ys)];
      const [width, height] = [Math.max(...xs) - left, Math.max(...ys) - top];
      return polygonOf(...corners.flatMap((c) => [(c.x - left) / width, (c.y - top) / height]));
    }
    case 'trapezoid': {
      const o = clampShare(num(geometry['offset'], 0.2), 0, 0.5);
      return polygonOf(o, 0, 1 - o, 0, 1, 1, 0, 1);
    }
    case 'chevron': {
      const c = share('cx', 0.7);
      return polygonOf(0, 0, c, 0, 1, 0.5, c, 1, 0, 1, 1 - c, 0.5);
    }
    case 'pentagonArrow':
    case 'homePlate': {
      const c = 1 - share('cx', 0.25);
      return polygonOf(0, 0, c, 0, 1, 0.5, c, 1, 0, 1);
    }
    case 'upArrow':
    case 'downArrow':
    case 'leftArrow': {
      // An arrow pointing up: the shaft `cx` of the width, the head `cy` of the height; turned.
      const shaft = share('cx', 0.5) / 2;
      const head = share('cy', 0.5);
      const up: Pt[] = [
        { x: 0.5, y: 0 },
        { x: 1, y: head },
        { x: 0.5 + shaft, y: head },
        { x: 0.5 + shaft, y: 1 },
        { x: 0.5 - shaft, y: 1 },
        { x: 0.5 - shaft, y: head },
        { x: 0, y: head },
      ];
      const turned = up.map((point) =>
        type === 'upArrow'
          ? point
          : type === 'downArrow'
            ? { x: point.x, y: 1 - point.y }
            : { x: point.y, y: point.x },
      );
      return polygonOf(...turned.flatMap((point) => [point.x, point.y]));
    }
    case 'multiply': {
      // An X, its arms a quarter of the box across.
      const a = 0.18;
      return polygonOf(
        ...[a, 0, 0.5, 0.5 - a, 1 - a, 0, 1, a, 0.5 + a, 0.5, 1, 1 - a],
        ...[1 - a, 1, 0.5, 0.5 + a, a, 1, 0, 1 - a, 0.5 - a, 0.5, 0, a],
      );
    }
    case 'corner':
      // An L, its arms half the box thick.
      return polygonOf(0, 0, 0.5, 0, 0.5, 0.5, 1, 0.5, 1, 1, 0, 1);
    default:
      return null;
  }
}

/** Shapes of other kinds, drawn as rectangles (rounded for callouts), and reported. */
const OTHER_SHAPE =
  /^(rightArrow|leftArrow|upArrow|downArrow|pentagonArrow|chevron|trapezoid|parallelogram|diamond|hexagon|octagon|pentagon|plus|multiply|star\d*|cloudCallout|roundRectCallout|rectCallout|ovalCallout|wedgeRectCallout|lnCall\w*|polygon|freeform|donut|cube|can|heart|frame|halfFrame|corner|plaque|bevel|foldedCorner|smileyFace|sun|moon|lightningBolt|teardrop|pie|chord|arc|blockArc|snip\w*|round\w*Rect)$/;
const HOTSPOTS: Record<string, 'rect' | 'ellipse'> = {
  clkAreaRect: 'rect',
  clkAreaOval: 'ellipse',
  clkAreaFree: 'rect',
};
/** What other objects are, for the report. */
const LEFT_OUT: Record<string, string> = {
  webObj: 'a web object',
  scrollPanel: 'a scrolling panel',
  marker: 'a marker',
  character: 'a character',
  button: 'a button',
  chkBox: 'a checkbox',
  radioBtn: 'a radio button',
  textEntry: 'a text entry field',
  zoomRegion: 'a zoom region',
  mouse: 'a mouse cursor',
};

/** Built-in state names, and ours. */
const STATES: Record<string, string> = {
  normal: 'normal',
  hover: 'hover',
  down: 'down',
  selected: 'selected',
  visited: 'visited',
  disabled: 'disabled',
  hidden: 'hidden',
  'drag over': 'dragOver',
  'drop correct': 'dropCorrect',
  'drop incorrect': 'dropIncorrect',
};

/** Effect names, and ours. */
const EFFECTS: Record<string, EffectKind> = {
  fade: 'fade',
  fly: 'fly',
  float: 'float',
  wipe: 'wipe',
  split: 'split',
  circle: 'iris',
  iris: 'iris',
  grow: 'grow',
  zoom: 'zoom',
  spin: 'spin',
  spinGrow: 'spinGrow',
  growSpin: 'spinGrow',
  bounce: 'bounce',
  swivel: 'swivel',
};
const DIRECTIONS: Record<string, string> = {
  l: 'left',
  r: 'right',
  t: 'top',
  b: 'bottom',
  tl: 'topLeft',
  tr: 'topRight',
  bl: 'bottomLeft',
  br: 'bottomRight',
};

// --------------------------------------------------------------- conversion

interface Context {
  pkg: Pick<StorylinePackage, 'xml'>;
  options: ConvertOptions;
  palette: Palette;
  report: PowerPointReport;
  /** The slide's number in the course, for the report. */
  slide: number | null;
  /** Variables by Storyline GUID. */
  variables: Map<string, Variable>;
  /** Slides by Storyline GUID, once made. */
  slides: Map<string, string>;
  /** Each scene's first slide, by the scene's Storyline GUID (B5 part C). */
  sceneFirst: Map<string, string>;
  /** The colour of text that sets none, and whose object sets none: the master's. */
  textColour: Color | null;
  /** The course's quizzes, by result slide GUID (B5 part D). */
  quizzes: Map<string, XmlElement>;
  /** What the course's result slides add up: graded questions, or survey ones. */
  quizKind: 'graded' | 'survey';
}

/** The colour a master's objects most often give their text by default. */
function masterTextColour(master: XmlElement | undefined, palette: Palette): Color | null {
  const counts = new Map<string, { colour: Color; n: number }>();
  const walk = (element: XmlElement) => {
    if (element.name === 'defaultFont') {
      const colour = readColour(kid(element, 'clr'), palette);
      if (colour) {
        const key = JSON.stringify(colour);
        const entry = counts.get(key) ?? { colour, n: 0 };
        entry.n++;
        counts.set(key, entry);
      }
    }
    for (const child of kids(element)) walk(child);
  };
  if (master) walk(master);
  return [...counts.values()].sort((a, b) => b.n - a.n)[0]?.colour ?? null;
}

/** What one slide's conversion keeps, so its triggers can name its parts. */
interface SlideParts {
  /** Our objects by Storyline GUID, with the layer each sits on. */
  objects: Map<string, { object: SceneObject; layer: string }>;
  /** Our layers by Storyline GUID. */
  layers: Map<string, string>;
  /** A Storyline object's state names, and our state ids. */
  states: Map<string, Map<string, string>>;
  /** The slide's motion path elements, by the GUID of the object each moves. */
  motion: Map<string, XmlElement[]>;
  /** Our motion paths by Storyline GUID, with the object each is on. */
  paths: Map<string, { object: string; path: string }>;
  /** Triggers to leave out, by GUID: a result slide's own, which ours does itself (B5 part D). */
  quiet: Set<string>;
}

const newParts = (): SlideParts => ({
  objects: new Map(),
  layers: new Map(),
  states: new Map(),
  motion: new Map(),
  paths: new Map(),
  quiet: new Set(),
});

function note(context: Context, outcome: PowerPointReportItem['outcome'], what: string) {
  context.report.push({ slide: context.slide, outcome, what });
}

function readEffect(element: XmlElement | undefined): Effect | null {
  const effect = kids(element)[0];
  if (!effect) return null;
  const kind = EFFECTS[effect.name] ?? 'fade';
  const made = createEffect(
    kind,
    Math.min(30, Math.max(0.05, isoSeconds(effect.attrs['dur']) || 0.5)),
  );
  const allowed: readonly string[] = effectDirections[kind];
  const wanted = DIRECTIONS[effect.attrs['dir'] ?? effect.attrs['wd'] ?? ''];
  if (wanted && allowed.includes(wanted)) made.direction = wanted as Effect['direction'];
  return made;
}

function frameOf(element: XmlElement) {
  const loc = kid(element, 'loc');
  const left = num(loc?.attrs['l']);
  const top = num(loc?.attrs['t']);
  const rot = element.attrs['rot'] ?? '';
  const rotation = /^\d+(\.\d+)?$/.test(rot) ? round(num(rot)) % 360 : 0;
  return {
    x: round(left),
    y: round(top),
    width: round(Math.max(0, num(loc?.attrs['r']) - left)),
    height: round(Math.max(0, num(loc?.attrs['b']) - top)),
    rotation,
  };
}

function timingOf(element: XmlElement): SceneObject['timing'] {
  const span = kids(kid(element, 'tmCtxLst'))[0];
  if (!span) return { start: 0, duration: 'untilEnd' };
  const start = round(Math.max(0, num(span.attrs['start']) / 1000));
  if (span.attrs['untilEnd'] === 'true') return { start, duration: 'untilEnd' };
  return { start, duration: Math.max(0.1, round(num(span.attrs['dur']) / 1000)) };
}

/** A fill or outline's colour holder: the element itself, or its `clr`. */
const colourIn = (element: XmlElement | undefined, palette: Palette) =>
  readColour(kid(element, 'clr') ?? element, palette);

function appearanceOf(element: XmlElement, context: Context): Appearance {
  const look = kid(element, 'bG');
  const appearance: Appearance = { fill: { kind: 'none' }, stroke: null, shadow: null, opacity: 1 };
  const solid = kid(look, 'solidFill');
  const gradient = kid(look, 'gradFill');
  const picture = kid(look, 'picFill');
  if (solid) {
    const color = colourIn(solid, context.palette);
    if (color) appearance.fill = { kind: 'solid', color };
  } else if (gradient) {
    const stops = kids(kid(gradient, 'stops') ?? gradient, 'stop')
      .map((stop) => ({
        offset: Math.min(1, Math.max(0, num(stop.attrs['pos']) / 100000)),
        color: colourIn(stop, context.palette),
      }))
      .filter((stop): stop is { offset: number; color: Color } => stop.color !== null);
    if (stops.length >= 2) {
      appearance.fill = { kind: 'gradient', angle: num(gradient.attrs['angle'], 90), stops };
    } else if (stops[0]) appearance.fill = { kind: 'solid', color: stops[0].color };
  } else if (picture && isId(picture.attrs['assetG'])) {
    const placed = context.options.media(picture.attrs['assetG']);
    if (placed?.kind === 'image') appearance.fill = { kind: 'image', asset: placed.hash };
  }
  const line = kid(look, 'solidLine');
  if (line) {
    const color = colourIn(line, context.palette);
    const style = kid(look, 'lineStyle');
    const width = Math.max(0, num(style?.attrs['w'], 1));
    if (color && width > 0) {
      appearance.stroke = {
        color,
        width,
        dash: /dash/i.test(style?.attrs['dash'] ?? '')
          ? 'dash'
          : /dot/i.test(style?.attrs['dash'] ?? '')
            ? 'dot'
            : 'solid',
      };
    }
  }
  return appearance;
}

/** The object's text, as rich text, or null when it has no words. */
function textIn(element: XmlElement, context: Context) {
  const document = textOf(kid(element, 'text'));
  const plain = textOf(kid(element, 'plain'));
  if (!document && !plain) return null;
  const colour =
    readColour(kid(kid(kid(element, 'bG'), 'defaultFont'), 'clr'), context.palette) ??
    context.textColour;
  const text = document
    ? storylineText(document, plain, { palette: context.palette, colour })
    : plainRichText(plain);
  return hasWords(text) ? text : null;
}

const cleanName = (name: string | undefined, fallback: string) =>
  (name ?? '').replace(/^&/, '').trim() || fallback;

/**
 * One object, or null when it has no counterpart yet (reported). `parts` collects
 * it, and any children, by GUID.
 */
/**
 * A Storyline dial with its built-in pointer, drawn its own way (B16), as its published courses
 * draw it: a diamond-shaped pointer, widest at the pivot, turning about the pivot (`rotationPoint`,
 * an offset from the middle) through `rotation` hundredths of a degree. It is drawn at its starting
 * value, so the turn runs from before that to after it. The face is the round picture of its
 * `face`, or of its Normal state's, the dial's width across. Null for other dials.
 */
function dialLook(
  element: XmlElement,
  data: XmlElement | undefined,
  frame: ReturnType<typeof frameOf>,
  props: { min: number; max: number; initial: number },
  context: Context,
): { look: NonNullable<DialObject['props']['look']>; color: Color | null } | null {
  if (kids(kid(element, 'prstGeom'))[0]?.name !== 'dial') return null;
  const sweep = num(data?.attrs['rotation'], 0) / 100;
  if (!(sweep > 0) || !(frame.width > 0) || !(frame.height > 0)) return null;
  const offset = kid(data, 'rotationPoint')?.attrs ?? {};
  const pivot = {
    x: round4(0.5 + num(offset['xOffset']) / frame.width),
    y: round4(0.5 + num(offset['yOffset']) / frame.height),
  };
  const from = round(-sweep * ((props.initial - props.min) / (props.max - props.min)));
  // The Normal state's copy carries the dial's look where the dial itself does not.
  const normal = kids(kid(element, 'stateLst'), 'state').find(
    (state) => state.attrs['name']?.toLowerCase() === 'normal',
  );
  const copy = kids(kid(normal, 'shapeLst'))[0];
  const faceFill = [element, copy]
    .map((each) => kid(kid(kid(each, 'face'), 'bg'), 'picFill'))
    .find((fill) => isId(fill?.attrs['assetG']));
  const placed = faceFill ? context.options.media(faceFill.attrs['assetG']!) : null;
  const color =
    colourIn(kid(kid(element, 'bG'), 'solidFill'), context.palette) ??
    colourIn(kid(kid(copy, 'bG'), 'solidFill'), context.palette);
  // The pointer's edges meet at the pivot's height, 2/26 of the width in from its sides.
  const side = 2 / 26;
  return {
    look: {
      pointer: `M0.5 0L${round4(side)} ${pivot.y}L0.5 1L${round4(1 - side)} ${pivot.y}Z`,
      pivot,
      from,
      to: round(from + sweep),
      face: placed?.kind === 'image' ? { asset: placed.hash, size: round(frame.width) } : null,
    },
    color,
  };
}

/**
 * A slider or a dial, as ours: its range and step, the number variable it is bound to, and
 * which way it lies. A slider's range is `track start/end` and its step `ticks step`; a dial's
 * are in `dialData` (`values start/end`, `increment`), and its picture face is not kept.
 */
function controlOf(
  element: XmlElement,
  type: 'slider' | 'dial',
  frame: ReturnType<typeof frameOf>,
  name: string,
  context: Context,
): SceneObject {
  const data = kid(element, 'dialData');
  const range = type === 'slider' ? kid(element, 'track') : kid(data, 'values');
  const min = num(range?.attrs['start'], 0);
  let max = num(range?.attrs['end'], 10);
  if (!(max > min)) {
    note(context, 'approximated', `“${name}” had no range, so it runs from ${min} to ${min + 10}`);
    max = min + 10;
  }
  const rawStep = num(
    type === 'slider' ? kid(element, 'ticks')?.attrs['step'] : data?.attrs['increment'],
    1,
  );
  const step = rawStep > 0 ? rawStep : 1;
  const bound = context.variables.get(
    (type === 'slider' ? element.attrs['varG'] : data?.attrs['varG']) ?? '',
  );
  const variable = bound?.type === 'number' ? bound : undefined;
  if (bound && !variable)
    note(
      context,
      'approximated',
      `“${name}” was bound to “${bound.name}”, which is not a number, so it is not bound`,
    );
  const start = typeof variable?.default === 'number' ? variable.default : min;
  const props = {
    variable: variable?.id ?? null,
    min,
    max,
    step,
    initial: Math.min(max, Math.max(min, start)),
  };
  if (type === 'dial') {
    const dial = createDialObject(frame, name);
    dial.props = { ...dial.props, ...props };
    const look = dialLook(element, data, frame, props, context);
    if (look) {
      dial.props.look = look.look;
      if (look.color) dial.props.color = look.color;
    } else {
      note(
        context,
        'approximated',
        `The dial “${name}” is drawn as our dial, without its own face`,
      );
    }
    return dial;
  }
  const slider = createSliderObject(frame, name);
  const track = colourIn(kid(kid(kid(element, 'track'), 'bg'), 'solidFill'), context.palette);
  slider.props = {
    ...slider.props,
    ...props,
    orientation: frame.width >= frame.height ? 'horizontal' : 'vertical',
    ...(track ? { trackColor: track } : {}),
  };
  return slider;
}

/**
 * A table, as ours: column widths and row heights as shares, each cell's rich text (the same
 * document a text box holds, in its `text` attribute) and fill, the header row, the padding and
 * the border. Merged cells, which ours do not have, are reported.
 */
function tableOf(
  element: XmlElement,
  frame: ReturnType<typeof frameOf>,
  name: string,
  context: Context,
): SceneObject {
  const inner = kid(element, 'table');
  let columns = kids(kid(inner, 'columns'), 'tableColumn').map((column) =>
    Math.max(1, num(column.attrs['width'], 1)),
  );
  let rows = kids(kid(inner, 'rows'), 'tableRow');
  if (columns.length > MAX_TABLE_COLUMNS || rows.length > MAX_TABLE_ROWS) {
    note(
      context,
      'approximated',
      `The table “${name}” is cut to ${MAX_TABLE_COLUMNS} columns and ${MAX_TABLE_ROWS} rows`,
    );
    columns = columns.slice(0, MAX_TABLE_COLUMNS);
    rows = rows.slice(0, MAX_TABLE_ROWS);
  }
  if (columns.length === 0) columns = [1];
  const table = createTableObject(columns.length, Math.max(1, rows.length), frame);
  table.name = name;
  const styleOf = (cell: XmlElement | undefined) => kid(cell, 'style');
  let merged = false;
  const madeRows = rows.map((row) => {
    const cells = kids(kid(row, 'cells'), 'tableCell');
    if (
      cells.some(
        (cell) =>
          num(cell.attrs['rowSpan'], 1) > 1 ||
          num(cell.attrs['columnSpan'], 1) > 1 ||
          cell.attrs['verticalMerge'] === 'true' ||
          cell.attrs['horizontalMerge'] === 'true',
      )
    )
      merged = true;
    return {
      height: Math.max(1, num(row.attrs['height'], 1)),
      cells: columns.map((_, at) => {
        const cell = cells[at];
        const document = cell?.attrs['text'] ?? '';
        const text = document
          ? storylineText(document, '', { palette: context.palette, colour: context.textColour })
          : emptyRichText();
        const fill = readColour(
          kid(kid(styleOf(cell), 'background'), 'fillColor'),
          context.palette,
        );
        return { text, fill };
      }),
    };
  });
  if (merged)
    note(context, 'approximated', `The table “${name}” has merged cells, which are shown unmerged`);
  const first = styleOf(
    kids(kid(kids(kid(inner, 'rows'), 'tableRow')[0], 'cells'), 'tableCell')[0],
  );
  const border = kid(first, 'bottomBorder');
  const borderColour = readColour(
    kid(border, 'themeColor') ?? kid(border, 'color'),
    context.palette,
  );
  table.props = {
    ...table.props,
    columns,
    rows: madeRows.length > 0 ? madeRows : table.props.rows,
    headerRow: kid(element, 'table')?.attrs['headerRow'] === 'true',
    headerColumn: kid(element, 'table')?.attrs['firstColumn'] === 'true',
    // Each cell keeps its own fill, so no banding over them.
    bandFill: null,
    ...(borderColour ? { borderColor: borderColour } : {}),
    borderWidth: Math.min(8, Math.max(0, num(border?.attrs['weight'], 1))),
    padding: Math.min(40, Math.max(0, num(kid(first, 'margins')?.attrs['l'], 8))),
  };
  return table;
}

function convertObject(
  element: XmlElement,
  context: Context,
  parts: SlideParts,
  layerId: string,
  /** The objects of the list it is in, by GUID: where a group finds its members. */
  pool?: ReadonlyMap<string, XmlElement>,
): SceneObject | SceneObject[] | null {
  const g = element.attrs['g'] ?? '';
  const name = cleanName(element.attrs['name'], element.name);
  const frame = frameOf(element);
  let made: SceneObject;
  const type = element.name;
  if (type === 'pic') {
    const placed = isId(element.attrs['assetG'])
      ? context.options.media(element.attrs['assetG'])
      : null;
    if (placed?.kind === 'image') {
      made = createImageObject(placed.hash, frame, name);
      made.a11y = { altText: name === 'Picture' ? '' : name, visibleToAssistiveTech: true };
    } else {
      note(context, 'placeholder', `The picture “${name}”: its file was not found in the course`);
      made = createShapeObject({ kind: 'rect' }, frame, name);
      made.props.appearance = {
        fill: { kind: 'solid', color: '#d6dbe1' },
        stroke: { color: '#9aa0a6', width: 1, dash: 'dash' },
        shadow: null,
        opacity: 1,
      };
    }
  } else if (type === 'textBox' || type === 'ph') {
    const text = textIn(element, context);
    if (!text) return null;
    made = createTextObject('', frame, name);
    made.props.text = text;
    made.props.padding = 4;
  } else if (
    SHAPES[type] ||
    OTHER_SHAPE.test(type) ||
    type === 'rsltBtn' ||
    polygonShape(type, element)
  ) {
    // A result slide's button (B5 part D) is drawn as a rounded rectangle with its words; its
    // click trigger is added with the slide's result.
    const own =
      type === 'rsltBtn'
        ? ({ kind: 'roundRect', radius: 6 } as const)
        : (SHAPES[type] ??
          polygonShape(type, element) ??
          // Callouts, the cloud, the can, the frame (B13).
          pathShape(type, element, frame.width, frame.height));
    const geometry: ShapeGeometry =
      own ??
      (/callout|roundRect/i.test(type) ? { kind: 'roundRect', radius: 12 } : { kind: 'rect' });
    if (!own)
      note(
        context,
        'approximated',
        `“${name}” (a ${type} shape) is drawn as a ${geometry.kind === 'roundRect' ? 'rounded rectangle' : 'rectangle'}`,
      );
    made = createShapeObject(geometry, frame, name);
    made.props.appearance = appearanceOf(element, context);
    if (geometry.kind === 'line' || geometry.kind === 'arrow') {
      const stroke = made.props.appearance.stroke;
      made.props.appearance = {
        ...made.props.appearance,
        fill: { kind: 'none' },
        stroke: stroke ?? { color: { theme: 'text' }, width: 2, dash: 'solid' },
      };
    }
    made.props.text = textIn(element, context);
    // A result button keeps its words on its states only: its Normal state's are its own.
    if (type === 'rsltBtn' && !made.props.text) {
      const normal = kids(kid(element, 'stateLst'), 'state').find(
        (state) => state.attrs['name']?.toLowerCase() === 'normal',
      );
      const copy = kids(kid(normal, 'shapeLst'))[0];
      if (copy) made.props.text = textIn(copy, context);
    }
  } else if (type === 'sound' || type === 'video') {
    const placed = isId(element.attrs['assetG'])
      ? context.options.media(element.attrs['assetG'])
      : null;
    if (!placed || placed.kind === 'image') {
      note(
        context,
        'skipped',
        `The ${type === 'sound' ? 'sound' : 'video'} “${name}” could not be imported`,
      );
      return null;
    }
    const length = Math.max(0.1, placed.duration ?? 1);
    if (placed.kind === 'video') {
      made = createVideoObject(placed.hash, length, frame, name);
    } else {
      made = createAudioObject(placed.hash, length, frame, name);
      const props = kid(element, 'sndProps');
      made.props.volume = Math.min(1, Math.max(0, num(props?.attrs['volume'], 100) / 100));
    }
    made.timing = { start: timingOf(element).start, duration: length };
    // Its closed captions, from the caption file it names (B5 part C).
    const read = isId(element.attrs['ccG'])
      ? context.options.captions?.(element.attrs['ccG'])
      : null;
    if (read) {
      made.props.captions = read.cues.filter((cue) => cue.end > cue.start);
      if (read.problems.length > 0)
        note(
          context,
          'approximated',
          `Some of the captions of “${name}” could not be read and were left off`,
        );
    }
  } else if (type === 'group') {
    const members = kids(kid(element, 'childLst'), 'g').flatMap(
      (ref) => pool?.get(textOf(ref).trim()) ?? [],
    );
    const children = ordered(members).flatMap(
      (member) => convertObject(member, context, parts, layerId, pool) ?? [],
    );
    if (children.length === 0) return null;
    // A group's members keep their own timing and animations (B8): the group stays whole.
    made = createGroupObject(children, name);
  } else if (type === 'table' && kid(element, 'table')) {
    made = tableOf(element, frame, name, context);
  } else if (type === 'slider' || type === 'dial') {
    made = controlOf(element, type, frame, name, context);
  } else if (HOTSPOTS[type]) {
    made = createHotspotObject(frame, HOTSPOTS[type], name);
  } else if (QUESTION_PARTS.has(type)) {
    // A question's or result's own object is not drawn; the slide reads it (B5 part D).
    return null;
  } else {
    note(context, 'skipped', `“${name}” (${LEFT_OUT[type] ?? `a ${type}`}) is not imported yet`);
    return null;
  }
  if (made.type !== 'audio' && made.type !== 'video') made.timing = timingOf(element);
  const effects = kid(element, 'animEffect');
  if (made.type !== 'audio') {
    const entrance = readEffect(kid(effects, 'entr'));
    const exit = readEffect(kid(effects, 'exit'));
    if (entrance || exit) made.animations = { ...made.animations, entrance, exit };
  }
  readStates(element, made, context, parts, g);
  if (g) {
    parts.objects.set(g, { object: made, layer: layerId });
    for (const pathElement of parts.motion.get(g) ?? []) {
      const read = readMotionPath(pathElement);
      if (!read) {
        note(
          context,
          'skipped',
          `“${cleanName(pathElement.attrs['name'], 'Motion path')}” (a ${pathElement.name}) is not imported yet`,
        );
        continue;
      }
      for (const what of read.approximated) note(context, 'approximated', what);
      made.animations = {
        ...made.animations,
        motionPaths: [...made.animations.motionPaths, read.path],
      };
      parts.paths.set(pathElement.attrs['g'] ?? '', { object: made.id, path: read.path.id });
    }
  }
  return made;
}

/** An object's states: each a copy of it in that state; what differs becomes overrides. */
function readStates(
  element: XmlElement,
  made: SceneObject,
  context: Context,
  parts: SlideParts,
  g: string,
) {
  const names = new Map<string, string>();
  const used = new Set(made.states.map((state) => state.id));
  for (const state of kids(kid(element, 'stateLst'), 'state')) {
    const title = state.attrs['name'] ?? '';
    const builtIn = STATES[title.toLowerCase()];
    if (builtIn === 'normal') {
      names.set(title, 'normal');
      continue;
    }
    let id = builtIn ?? (title.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'state');
    if (!builtIn) for (let n = 2; used.has(id); n++) id = `${id.replace(/-\d+$/, '')}-${n}`;
    if (used.has(id)) continue;
    used.add(id);
    names.set(title, id);
    const copy = kids(kid(state, 'shapeLst'))[0];
    const overrides: ObjectState['overrides'] = {};
    if (copy) {
      if (made.type === 'image' && copy.attrs['assetG'] !== element.attrs['assetG']) {
        const placed = isId(copy.attrs['assetG'])
          ? context.options.media(copy.attrs['assetG'])
          : null;
        if (placed?.kind === 'image') overrides.asset = placed.hash;
      }
      if (made.type === 'shape' && kid(copy, 'bG')) {
        const look = appearanceOf(copy, context);
        if (JSON.stringify(look.fill) !== JSON.stringify(made.props.appearance.fill)) {
          overrides.appearance = { fill: look.fill };
        }
      }
      if (made.type === 'shape' || made.type === 'text') {
        const text = textIn(copy, context);
        const own = made.type === 'shape' ? made.props.text : made.props.text;
        if (text && JSON.stringify(text) !== JSON.stringify(own)) overrides.text = text;
      }
    }
    made.states.push({ id, name: title || id, overrides });
  }
  const initial = element.attrs['initState'];
  if (initial && names.has(initial)) made.initialState = names.get(initial)!;
  if (g) parts.states.set(g, names);
}

/** A shape list's objects, back to front. */
function shapeList(
  list: XmlElement | undefined,
  context: Context,
  parts: SlideParts,
  layerId: string,
): SceneObject[] {
  // A group's members are in the same list, each naming its group (`parentG`); the
  // group lists them in `childLst` by GUID. Only top-level objects are listed here.
  const pool = new Map(
    kids(list).flatMap((element) =>
      element.attrs['g'] ? [[element.attrs['g'], element] as const] : [],
    ),
  );
  const top = kids(list).filter(
    (element) => !isMotionPath(element) && !pool.has(element.attrs['parentG'] ?? ''),
  );
  return ordered(top).flatMap(
    (element) => convertObject(element, context, parts, layerId, pool) ?? [],
  );
}

/** Elements back to front, by `zOrder`, keeping their order where it is the same. */
function ordered(elements: XmlElement[]): XmlElement[] {
  return elements
    .map((element, index) => ({ element, index }))
    .sort(
      (a, b) =>
        num(a.element.attrs['zOrder'], a.index) - num(b.element.attrs['zOrder'], b.index) ||
        a.index - b.index,
    )
    .map(({ element }) => element);
}

/** A shape list without its placeholders (`ph`, or objects holding a `ph`). */
function withoutPlaceholders(list: XmlElement | undefined): XmlElement | undefined {
  if (!list) return undefined;
  return {
    ...list,
    children: kids(list).filter((element) => element.name !== 'ph' && !kid(element, 'ph')),
  };
}

/** A background: a colour, gradient or picture filling the slide, at the back. */
function background(
  owner: XmlElement | undefined,
  context: Context,
  stage: { width: number; height: number },
): SceneObject | null {
  const bg = kid(owner, 'bg');
  if (!bg || !(kid(bg, 'solidFill') || kid(bg, 'gradFill') || kid(bg, 'picFill'))) return null;
  const shape = createShapeObject({ kind: 'rect' }, { x: 0, y: 0, ...stage }, 'Background');
  shape.props.appearance = appearanceOf(
    { name: 'bg', attrs: {}, children: [{ ...bg, name: 'bG' }] },
    context,
  );
  if (shape.props.appearance.fill.kind === 'none') return null;
  shape.locked = true;
  shape.a11y = { altText: '', visibleToAssistiveTech: false };
  return shape;
}

// ------------------------------------------------------------------ triggers

const OPERATORS: Record<string, '==' | '!=' | '<' | '<=' | '>' | '>=' | '==i'> = {
  eq: '==',
  // "Equal, ignoring case" (B12).
  eqIgnore: '==i',
  noteq: '!=',
  lt: '<',
  lte: '<=',
  gt: '>',
  gte: '>=',
};

function literalFor(variable: Variable, holder: XmlElement, which: 'set' | 'test') {
  if (variable.type === 'boolean') {
    return (holder.attrs['boolVal'] ?? '').toLowerCase() === 'true';
  }
  if (variable.type === 'number') {
    return num(which === 'set' ? holder.attrs['dblVal'] : holder.attrs['floatVal1']);
  }
  return which === 'set' ? (holder.attrs['varVal1'] ?? '') : (holder.attrs['strVal1'] ?? '');
}

/**
 * Our state id for a Storyline object's state, by name. Storyline lets a trigger
 * name a built-in state (Hidden, Visited, Disabled, …) the object never defined; we
 * give the object that state then, with nothing overridden.
 */
function stateFor(parts: SlideParts, g: string, name: string | undefined): string | undefined {
  if (!name) return undefined;
  const placed = parts.objects.get(g);
  if (!placed) return undefined;
  let names = parts.states.get(g);
  if (!names) parts.states.set(g, (names = new Map([['Normal', 'normal']])));
  const known = names.get(name);
  if (known) return known;
  const builtIn = STATES[name.toLowerCase()];
  if (!builtIn) return undefined;
  if (!placed.object.states.some((state) => state.id === builtIn)) {
    placed.object.states.push({ id: builtIn, name, overrides: {} });
  }
  names.set(name, builtIn);
  return builtIn;
}

function conditionsOf(
  trig: XmlElement,
  context: Context,
  parts: SlideParts,
): { conditions: Trigger['conditions']; ok: boolean } {
  const items: Condition[] = [];
  let ok = true;
  let combine: 'and' | 'or' = 'and';
  let between = false;
  kids(kid(trig, 'condLst'), 'trigCond').forEach((cond, index) => {
    if (index > 0 && cond.attrs['andOr'] === 'or') combine = 'or';
    const type = cond.attrs['dataType'];
    if (type === 'state') {
      const state = kid(cond, 'shapeState');
      const target = parts.objects.get(state?.attrs['shapeG'] ?? '');
      const id = stateFor(parts, state?.attrs['shapeG'] ?? '', state?.attrs['name']);
      if (!target || !id) return void (ok = false);
      items.push({
        subject: 'objectState',
        object: target.object.id,
        operator: state?.attrs['op'] === 'noteq' ? '!=' : '==',
        state: id,
      });
      return;
    }
    const variable = context.variables.get(cond.attrs['varG'] ?? '');
    const op = cond.attrs['op'] ?? '';
    // "Between" is two comparisons, joined with "and" (B5 part C).
    if (variable?.type === 'number' && op === 'btw' && type !== 'var') {
      const low = num(cond.attrs['floatVal1']);
      const high = num(cond.attrs['floatVal2']);
      const compare = (operator: '>=' | '<=', value: number): Condition => ({
        subject: 'variable',
        variable: variable.id,
        operator,
        value: { kind: 'literal', value },
      });
      items.push(compare('>=', Math.min(low, high)), compare('<=', Math.max(low, high)));
      between = true;
      return;
    }
    const operator = OPERATORS[op];
    if (!variable || !operator) return void (ok = false);
    const other = type === 'var' ? context.variables.get(cond.attrs['varG2'] ?? '') : undefined;
    items.push({
      subject: 'variable',
      variable: variable.id,
      operator,
      value: other
        ? { kind: 'variable', variable: other.id }
        : { kind: 'literal', value: literalFor(variable, cond, 'test') },
    });
  });
  // A "between" joined with others by "or" would need a nested condition, which ours have not.
  if (between && (combine as 'and' | 'or') === 'or') return { conditions: null, ok: false };
  return { conditions: items.length > 0 ? { combine, items } : null, ok };
}

interface Owner {
  kind: Trigger['owner']['kind'];
  id: string;
  /** The layer it is on, or is. */
  layer: string;
  /** The slide's base layer. */
  base: string;
}

function eventOf(
  data: XmlElement,
  owner: Owner,
  parts: SlideParts,
  context: Context,
  ownerG: string,
): TriggerEvent | null {
  const other = kid(data, 'other');
  const event = data.attrs['event'] ?? '';
  const onObject = owner.kind === 'object' ? owner.id : null;
  switch (event) {
    case 'OnClick':
      return onObject ? { type: 'click', object: onObject } : null;
    case 'OnDoubleClick':
      return onObject ? { type: 'doubleClick', object: onObject } : null;
    case 'OnMouseHover':
      return onObject ? { type: 'mouseEnter', object: onObject } : null;
    case 'OnMouseHoverOut':
      return onObject ? { type: 'mouseLeave', object: onObject } : null;
    case 'OnStart':
      return { type: 'timelineStart', layer: owner.layer };
    case 'OnEnd':
      return { type: 'timelineEnd', layer: owner.layer };
    case 'OnTimelineEvent':
      return {
        type: 'timelineReaches',
        layer: owner.layer,
        time: round(isoSeconds(other?.attrs['time'])),
      };
    case 'OnVariableValueChange': {
      const variable = context.variables.get(other?.attrs['varChangeG'] ?? '');
      return variable ? { type: 'variableChange', variable: variable.id } : null;
    }
    case 'OnStateChange': {
      const state = stateFor(parts, ownerG, kid(data, 'shape')?.attrs['stateName']);
      return onObject && state ? { type: 'stateChange', object: onObject, state } : null;
    }
    case 'OnAnimationComplete': {
      // A motion path's, named by its GUID; otherwise the object's entrance or exit.
      const path = parts.paths.get(other?.attrs['animationG'] ?? '');
      if (path)
        return {
          type: 'animationCompletes',
          object: path.object,
          animation: { kind: 'path', path: path.path },
        };
      const object = onObject ? parts.objects.get(ownerG)?.object : undefined;
      if (!object) return null;
      const kind = object.animations.entrance ? 'entrance' : object.animations.exit ? 'exit' : null;
      return kind ? { type: 'animationCompletes', object: object.id, animation: { kind } } : null;
    }
    case 'OnMediaComplete':
      return onObject ? { type: 'mediaCompletes', object: onObject } : null;
    case 'OnSliderMoves':
    case 'OnDialTurns':
      return onObject ? { type: 'controlMoves', object: onObject } : null;
    default:
      return null;
  }
}

function actionOf(
  data: XmlElement,
  owner: Owner,
  parts: SlideParts,
  context: Context,
  slide: Slide,
): TriggerAction | null {
  const action = data.attrs['action'] ?? '';
  const sub = data.attrs['actSubType'] ?? '';
  const other = kid(data, 'other');
  const layerTarget = kid(data, 'sldLayer');
  const objectFor = (g: string | undefined) => (g ? parts.objects.get(g)?.object : undefined);
  switch (action) {
    case 'jumpToSlide': {
      if (sub === 'next') return { type: 'jumpToSlide', target: { kind: 'next' } };
      if (sub === 'prev') return { type: 'jumpToSlide', target: { kind: 'previous' } };
      const slide = context.slides.get(kid(data, 'slide')?.attrs['jumpG'] ?? '');
      return slide ? { type: 'jumpToSlide', target: { kind: 'slide', slide } } : null;
    }
    case 'showSubSlide': {
      const layer = parts.layers.get(layerTarget?.attrs['showG'] ?? '');
      return layer ? { type: 'showLayer', layer } : null;
    }
    case 'hideSubSlide': {
      // "This layer": the one the trigger's owner is on, never the base layer.
      if (sub === 'me')
        return owner.layer !== owner.base ? { type: 'hideLayer', layer: owner.layer } : null;
      const layer = parts.layers.get(layerTarget?.attrs['hideG'] ?? '');
      return layer ? { type: 'hideLayer', layer } : null;
    }
    case 'changeShapeState': {
      const shape = kid(data, 'shape');
      const g = shape?.attrs['setStateG'] ?? '';
      const state = stateFor(parts, g, shape?.attrs['setStateName']);
      const target = objectFor(g);
      return target && state ? { type: 'changeState', object: target.id, state } : null;
    }
    case 'adjustVar': {
      const variable = context.variables.get(other?.attrs['varG'] ?? '');
      if (!variable || !other) return null;
      const op = other.attrs['op'];
      if (op === 'not') return { type: 'toggleVariable', variable: variable.id };
      const operator =
        op === 'add' ? 'add' : op === 'minus' ? 'subtract' : op === 'ass' ? 'assign' : null;
      if (!operator) return null;
      const source =
        other.attrs['useVar'] === 'true'
          ? context.variables.get(other.attrs['var1G'] ?? '')
          : undefined;
      return {
        type: 'setVariable',
        variable: variable.id,
        operator,
        operand: source
          ? { kind: 'variable', variable: source.id }
          : { kind: 'literal', value: literalFor(variable, other, 'set') },
      };
    }
    case 'PauseTimeline':
    case 'ResumeTimeline': {
      const layer =
        sub === 'me'
          ? owner.layer
          : (parts.layers.get(layerTarget?.attrs['showG'] ?? '') ?? owner.layer);
      return { type: action === 'PauseTimeline' ? 'pauseTimeline' : 'resumeTimeline', layer };
    }
    case 'playMedia':
    case 'pauseMedia':
    case 'stopMedia': {
      const media = [kid(data, 'audio'), kid(data, 'video')]
        .flatMap((each) => Object.values(each?.attrs ?? {}))
        .map((value) => objectFor(value))
        .find((object) => object && (object.type === 'audio' || object.type === 'video'));
      return media ? { type: action, object: media.id } : null;
    }
    case 'jumpToScene': {
      // The slide it lands on is named too, or else the scene's first (B5 part C).
      const slide =
        context.slides.get(kid(data, 'slide')?.attrs['jumpG'] ?? '') ??
        context.sceneFirst.get(kid(data, 'scene')?.attrs['jumpG'] ?? '');
      return slide ? { type: 'jumpToSlide', target: { kind: 'slide', slide } } : null;
    }
    case 'jumpToFileUrl': {
      const url = other?.attrs['open'] ?? '';
      if (/^https?:\/\//i.test(url)) return { type: 'openUrl', url };
      // A file beside the course (B15): brought in if it was beside the `.story`, or else opened
      // where Storyline opened it, beside the published course.
      if (!RELATIVE_FILE.test(url)) return null;
      const hash = context.options.externalFile?.(url);
      if (hash) return { type: 'openFile', asset: hash };
      note(
        context,
        'placeholder',
        `The link to “${url}” opens it beside the published course, as Storyline did: put the file there, or beside the .story file before importing to bring it in`,
      );
      return { type: 'openUrl', url: url.replace(/\\/g, '/') };
    }
    case 'Move': {
      const placed = parts.paths.get(other?.attrs['motionPathG'] ?? '');
      return placed ? { type: 'moveAlongPath', object: placed.object, path: placed.path } : null;
    }
    case 'exitProject':
      return { type: 'exitCourse' };
    case 'submitInteraction':
      // The slide's own question (B5 part D); ours has one question to a slide.
      return slide.question ? { type: 'submitInteraction' } : null;
    case 'executeJavaScript':
      return { type: 'executeJavaScript', code: other?.attrs['js'] ?? '' };
    default:
      return null;
  }
}

const ACTION_WORDS: Record<string, string> = {
  Move: 'moves an object along a motion path',
  submitInteraction: 'submits a question',
  SubmitQuizSL: 'submits a quiz',
  ResetQuizSL: 'resets a quiz',
  jumpToScene: 'jumps to a scene whose slide is not known',
  lightbox: 'opens a lightbox',
  closeLightbox: 'closes a lightbox',
};

function readTriggers(
  list: XmlElement | undefined,
  owner: Owner,
  ownerG: string,
  slide: Slide,
  parts: SlideParts,
  context: Context,
) {
  for (const trig of kids(list, 'trig')) {
    const data = kid(trig, 'data');
    if (!data || parts.quiet.has(trig.attrs['g'] ?? '')) continue;
    // One Storyline makes for itself, not the author's (B12).
    if (trig.attrs['type'] === 'internal' && trig.attrs['name'] === 'fakeTrigger') continue;
    // Waiting for an animation the course no longer has: Storyline never runs it either.
    if (waitsForNothing(data, parts, ownerG)) continue;
    const events =
      data.attrs['event'] === 'OnStateChange'
        ? stateChangeEvents(data, owner, parts, ownerG)
        : data.attrs['event'] === 'OnDrop'
          ? dropEvents(data, owner, parts)
          : [{ event: eventOf(data, owner, parts, context, ownerG), also: [] as Condition[] }];
    const action = actionOf(data, owner, parts, context, slide);
    const url = kid(data, 'other')?.attrs['open'] ?? '';
    if (!action && data.attrs['action'] === 'jumpToFileUrl' && url) {
      note(
        context,
        'skipped',
        `A trigger that opens “${url}”, a file outside the course that cannot be reached from it, is not imported`,
      );
      continue;
    }
    if (events.length === 0 || events.some(({ event }) => !event) || !action) {
      const why = !action
        ? (ACTION_WORDS[data.attrs['action'] ?? ''] ?? `does “${data.attrs['action']}”`)
        : `waits for “${data.attrs['event']}”`;
      note(context, 'skipped', `A trigger that ${why} is not imported yet`);
      continue;
    }
    const { conditions, ok } = conditionsOf(trig, context, parts);
    if (!ok)
      note(context, 'approximated', 'A trigger’s condition could not be read and was left off');
    for (const { event, also } of events) {
      let joined = conditions;
      if (also.length > 0) {
        if (!conditions) joined = { combine: 'and', items: also };
        else if (conditions.combine === 'and')
          joined = { combine: 'and', items: [...conditions.items, ...also] };
        else
          note(
            context,
            'approximated',
            'A trigger waiting for several objects’ states could not keep its own “or” conditions',
          );
      }
      slide.triggers.push({
        id: createId('trigger'),
        owner: { kind: owner.kind, id: owner.id },
        event: event!,
        action,
        conditions: joined,
        otherwise: null,
        enabled: data.attrs['enabled'] !== 'false',
      });
    }
  }
}

/**
 * A trigger waiting for an animation that is not in the course (B5 part C): its `animationG`
 * names no path, and its object has no entrance or exit. A deleted animation leaves these
 * behind; they can never run.
 */
function waitsForNothing(data: XmlElement, parts: SlideParts, ownerG: string): boolean {
  if (data.attrs['event'] !== 'OnAnimationComplete') return false;
  const animation = kid(data, 'other')?.attrs['animationG'];
  if (!isId(animation) || parts.paths.has(animation)) return false;
  const object = parts.objects.get(ownerG)?.object;
  return !!object && !object.animations.entrance && !object.animations.exit;
}

/**
 * "When the state of … changes" (B5 part C): the objects to watch are in `shape/stateLst/g`, or
 * the trigger's own object. Ours watches one object, so it becomes one trigger per object; with
 * `stateInclude="all"`, each also needs the others in that state. An empty list means one that
 * could not be read.
 */
function stateChangeEvents(
  data: XmlElement,
  owner: Owner,
  parts: SlideParts,
  ownerG: string,
): { event: TriggerEvent | null; also: Condition[] }[] {
  const shape = kid(data, 'shape');
  const name = shape?.attrs['stateName'];
  if (shape?.attrs['statesNot'] === 'not') return notStateEvents(data, owner, parts, ownerG);
  if (shape?.attrs['statesNot'] && shape.attrs['statesNot'] !== 'are') return [];
  const listed = kids(kid(shape, 'stateLst'), 'g').map((g) => textOf(g).trim());
  const watched = listed.length > 0 ? listed : owner.kind === 'object' ? [ownerG] : [];
  const targets = watched.map((g) => ({
    g,
    object: parts.objects.get(g)?.object,
    state: stateFor(parts, g, name),
  }));
  if (targets.length === 0 || targets.some((each) => !each.object || !each.state)) return [];
  const all = shape?.attrs['stateInclude'] !== 'any';
  return targets.map((each) => ({
    event: { type: 'stateChange', object: each.object!.id, state: each.state! },
    also: all
      ? targets
          .filter((other) => other !== each)
          .map((other) => ({
            subject: 'objectState' as const,
            object: other.object!.id,
            operator: '==' as const,
            state: other.state!,
          }))
      : [],
  }));
}

/**
 * "When … is dropped on" (B5 part D): owned by the dragged object, with the targets in
 * `shape/dropLst`. Ours names one target, so it becomes one trigger for each.
 */
function dropEvents(
  data: XmlElement,
  owner: Owner,
  parts: SlideParts,
): { event: TriggerEvent | null; also: Condition[] }[] {
  if (owner.kind !== 'object') return [];
  const targets = kids(kid(kid(data, 'shape'), 'dropLst'), 'g').map(
    (g) => parts.objects.get(textOf(g).trim())?.object,
  );
  if (targets.length === 0 || targets.some((target) => !target)) return [];
  return targets.map((target) => ({
    event: { type: 'droppedOn', object: owner.id, target: target!.id },
    also: [],
  }));
}

/**
 * "When the state of … is not …" (B12): ours waits for an object to take a state, so it becomes
 * one trigger for each other state each watched object has; with `stateInclude="all"`, each also
 * needs the other objects out of the named state.
 */
function notStateEvents(
  data: XmlElement,
  owner: Owner,
  parts: SlideParts,
  ownerG: string,
): { event: TriggerEvent | null; also: Condition[] }[] {
  const shape = kid(data, 'shape');
  const listed = kids(kid(shape, 'stateLst'), 'g').map((g) => textOf(g).trim());
  const watched = listed.length > 0 ? listed : owner.kind === 'object' ? [ownerG] : [];
  const targets = watched.map((g) => ({
    object: parts.objects.get(g)?.object,
    state: stateFor(parts, g, shape?.attrs['stateName']),
  }));
  if (targets.length === 0 || targets.some((each) => !each.object || !each.state)) return [];
  const all = shape?.attrs['stateInclude'] !== 'any';
  const events = targets.flatMap((each) =>
    each
      .object!.states.filter((state) => state.id !== each.state)
      .map((state) => ({
        event: { type: 'stateChange' as const, object: each.object!.id, state: state.id },
        also: all
          ? targets
              .filter((other) => other !== each)
              .map((other) => ({
                subject: 'objectState' as const,
                object: other.object!.id,
                operator: '!=' as const,
                state: other.state!,
              }))
          : [],
      })),
  );
  return events;
}

/** Every element named `name` inside `element`, at any depth. */
function descendants(element: XmlElement, name: string): XmlElement[] {
  return kids(element).flatMap((child) => [
    ...(child.name === name ? [child] : []),
    ...descendants(child, name),
  ]);
}

/** Every object element with triggers, with the GUID of each, anywhere in a shape list. */
function objectsWithTriggers(list: XmlElement | undefined): XmlElement[] {
  return kids(list).flatMap((element) => [
    ...(kids(kid(element, 'trigLst'), 'trig').length > 0 ? [element] : []),
    ...objectsWithTriggers(kid(element, 'childLst')),
  ]);
}

// ---------------------------------------------------------------- questions

/** A question's own object, and a result slide's (B5 part D): read by the slide, not drawn. */
const QUESTION_PARTS = new Set(['freePickManyIntr', 'dragDropIntr', 'rsltsIntr']);

/** Storyline gives a question's attempts as a word; any other is unlimited. */
const ATTEMPTS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

/** What a result button does, by its `btnType` (B5 part D). */
const RESULT_BUTTONS: Record<string, TriggerAction> = {
  retryQuiz: { type: 'retryQuiz' },
  rvwQuiz: { type: 'reviewQuiz' },
};

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * The slide's freeform question (B5 part D): pick many, or drag and drop. Its parts are
 * objects on the base layer; its feedback layers are the slide's, already made.
 */
function readQuestion(
  element: XmlElement,
  slide: Slide,
  parts: SlideParts,
  context: Context,
): Question | null {
  const intr = kids(kid(element, 'shapeLst')).find(
    (each) => each.name === 'freePickManyIntr' || each.name === 'dragDropIntr',
  );
  if (!intr) return null;
  const props = kid(intr, 'intrProps');
  const onBase = (g: string | undefined) => {
    const placed = isId(g) ? parts.objects.get(g) : undefined;
    return placed && slide.baseLayer.objects.includes(placed.object) ? placed.object : undefined;
  };
  const by: 'none' | 'question' = props?.attrs['feedbk'] === 'none' ? 'none' : 'question';
  const layer = (key: string, shown: string) => {
    const g = props?.attrs[key];
    const id = by === 'question' && props?.attrs[shown] !== 'false' && isId(g) ? g : '';
    const found = parts.layers.get(id);
    return found ? { layer: found, message: null, button: null } : null;
  };
  if (props?.attrs['branch'] && props.attrs['branch'] !== 'none')
    note(
      context,
      'approximated',
      'A question’s branches were not imported, so it goes on to the next slide',
    );
  const common = {
    prompt: null,
    submit: null,
    attempts: ATTEMPTS[props?.attrs['attempts'] ?? ''] ?? null,
    branch: { correct: null, incorrect: null },
    required: false,
    scoring: {
      by: 'question' as const,
      points:
        props?.attrs['score'] === 'none' ? 0 : clamp(num(props?.attrs['corPts'], 10), 0, 1000),
    },
    feedback: {
      by,
      correct: layer('corFbG', 'showCorFb'),
      incorrect: layer('incFbG', 'showIncFb'),
      tryAgain: layer('tryFbG', 'showTryFb'),
    },
  };
  const choices = kids(kid(intr, 'choices'), 'intrFreeChoice');
  const used = new Set<string>();
  const unused = (object: SceneObject | undefined) => {
    if (!object || used.has(object.id)) return undefined;
    used.add(object.id);
    return object;
  };
  if (intr.name === 'freePickManyIntr') {
    const picked = choices
      .flatMap((choice) => {
        const object = unused(onBase(choice.attrs['shpG']));
        if (!object) return [];
        // Picked by its Selected state, as ours are (P7.4).
        stateFor(parts, choice.attrs['shpG']!, 'Selected');
        const correct = kid(choice, 'scoringData')?.attrs['correct'] === 'true';
        return [{ id: createId('choice'), object: object.id, correct }];
      })
      .slice(0, 20);
    if (picked.length === 0) {
      note(context, 'skipped', 'A pick-many question with none of its choices is not imported');
      return null;
    }
    const question: Extract<Question, { kind: 'freePickMany' }> = {
      kind: 'freePickMany',
      ...common,
      choices: picked,
    };
    return question;
  }
  const items = choices
    .flatMap((choice) => {
      const object = unused(onBase(choice.attrs['shpG']));
      return object ? [{ choice, object }] : [];
    })
    .slice(0, 20);
  const itemIds = new Set(items.map(({ object }) => object.id));
  const targets: string[] = [];
  const placed = items.map(({ choice, object }) => {
    const target = onBase(choice.attrs['matchShpG']);
    const id = target && !itemIds.has(target.id) ? target.id : null;
    if (id && !targets.includes(id)) targets.push(id);
    return { id: createId('choice'), object: object.id, target: id };
  });
  if (placed.length === 0) {
    note(context, 'skipped', 'A drag-and-drop question with none of its items is not imported');
    return null;
  }
  const options = kid(intr, 'dragDrop')?.attrs ?? {};
  const question: Extract<Question, { kind: 'freeDrag' }> = {
    kind: 'freeDrag',
    ...common,
    items: placed,
    targets,
    snap: options['snapTarget'] !== 'false',
    returnToStart: options['returnStart'] !== 'false',
    onePerTarget: options['onlyOne'] === 'true',
    dropStatesAfterSubmit: options['delay'] === 'true',
  };
  return question;
}

/**
 * The slide's result (B5 part D), from its `rsltsIntr` and the course's quiz that names the
 * slide. The triggers that show its layers are left out, as ours shows them. Returns the
 * GUIDs of the slides it counts, which are only known as questions once every slide is made.
 */
function readResult(
  element: XmlElement,
  slide: Slide,
  parts: SlideParts,
  context: Context,
): string[] | null {
  const intr = kids(kid(element, 'shapeLst')).find((each) => each.name === 'rsltsIntr');
  if (!intr) return null;
  const quiz = context.quizzes.get(element.attrs['g'] ?? '');
  const layer = (which: string) => {
    const part = kid(intr, which);
    if (isId(part?.attrs['trigG'])) parts.quiet.add(part.attrs['trigG']);
    return parts.layers.get(part?.attrs['g'] ?? '') ?? null;
  };
  const timed = quiz?.attrs['timed'] === 'true';
  slide.result = {
    kind: context.quizKind,
    include: { kind: 'all' },
    passPercent: clamp(num(quiz?.attrs['passScore'], 80), 0, 100),
    timer: timed
      ? { seconds: clamp(Math.round(isoSeconds(quiz?.attrs['timeLimit'])), 10, 86400) }
      : null,
    layers: { passed: layer('success'), failed: layer('failure') },
    retryIncorrectOnly: quiz?.attrs['resetincorrectquestionsonly'] === 'true',
  };
  return quiz ? kids(kid(quiz, 'questionIdLst'), 'item').map((item) => textOf(item).trim()) : null;
}

/** A result button's click trigger, by what it does (B5 part D). */
function resultButtonTriggers(
  lists: (XmlElement | undefined)[],
  slide: Slide,
  parts: SlideParts,
  context: Context,
) {
  for (const button of lists.flatMap((list) => kids(list, 'rsltBtn'))) {
    const placed = parts.objects.get(button.attrs['g'] ?? '');
    if (!placed) continue;
    const kind = button.attrs['btnType'] ?? '';
    const action = RESULT_BUTTONS[kind];
    if (!action) {
      note(
        context,
        'skipped',
        `What the result button “${placed.object.name}” does (“${kind}”) is not imported yet`,
      );
      continue;
    }
    slide.triggers.push({
      id: createId('trigger'),
      owner: { kind: 'object', id: placed.object.id },
      event: { type: 'click', object: placed.object.id },
      action,
      conditions: null,
      otherwise: null,
      enabled: true,
    });
  }
}

/** The course's quizzes, by the GUID of each one's result slide. */
function readQuizzes(story: XmlElement): Map<string, XmlElement> {
  const quizzes = new Map<string, XmlElement>();
  for (const quiz of kids(kid(kid(story, 'quizMgr'), 'quizLst'), 'quiz')) {
    if (isId(quiz.attrs['resultSldG'])) quizzes.set(quiz.attrs['resultSldG'], quiz);
  }
  return quizzes;
}

// ------------------------------------------------------------------- slides

/** A slide's notes, from `summary.xml`, by slide GUID. */
function readNotes(pkg: Pick<StorylinePackage, 'xml'>): Map<string, string> {
  const notes = new Map<string, string>();
  const summary = readXml(pkg, 'docProps/summary.xml');
  const walk = (element: XmlElement) => {
    if (element.name === 'slide' && element.attrs['g'] && element.attrs['note']) {
      const words = [...element.attrs['note'].matchAll(/<Block>[\s\S]*?<\/Block>|<Block\s*\/>/g)]
        .map((block) => [...block[0].matchAll(/Text="([^"]*)"/g)].map((span) => span[1]).join(''))
        .join('\n')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .trim();
      if (words) notes.set(element.attrs['g'], words);
    }
    for (const child of kids(element)) walk(child);
  };
  if (summary) walk(summary);
  return notes;
}

function variableName(raw: string, taken: Set<string>): string {
  let name = raw.replace(/[^A-Za-z0-9_]/g, '_');
  if (!/^[A-Za-z_]/.test(name)) name = `v_${name}`;
  let candidate = name;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${name}_${n}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

function readVariables(story: XmlElement): Map<string, Variable> {
  const variables = new Map<string, Variable>();
  const taken = new Set<string>();
  for (const v of kids(kid(story, 'varLst'), 'var')) {
    if (v.attrs['type'] !== 'user' || !v.attrs['g']) continue;
    const type =
      v.attrs['dataType'] === 'bool'
        ? 'boolean'
        : v.attrs['dataType'] === 'num'
          ? 'number'
          : 'text';
    const raw = v.attrs['val'] ?? '';
    const value =
      type === 'boolean' ? raw.toLowerCase() === 'true' : type === 'number' ? num(raw) : raw;
    variables.set(v.attrs['g'], {
      id: createId('var'),
      name: variableName(v.attrs['name'] ?? 'Variable', taken),
      type,
      default: value,
    });
  }
  return variables;
}

/** Layouts and masters by GUID, with each layout's master. */
function readLayouts(pkg: Pick<StorylinePackage, 'xml'>) {
  const layouts = new Map<string, { element: XmlElement; master: XmlElement | undefined }>();
  const masters: XmlElement[] = [];
  for (const part of pkg.xml.keys()) {
    if (!/^story\/slideMasters\/[^/]+\.xml$/.test(part)) continue;
    const master = readXml(pkg, part);
    if (!master) continue;
    masters.push(master);
    for (const rel of relationshipsOf(pkg, part)) {
      if (rel.type !== 'slideLayout') continue;
      const layout = readXml(pkg, rel.target);
      if (!layout) continue;
      // Slides name their layout by its `internalG`, not its `g`.
      for (const key of [layout.attrs['internalG'], layout.attrs['g']]) {
        if (key) layouts.set(key, { element: layout, master });
      }
    }
  }
  return { layouts, masters };
}

/** Convert the course in `pkg`. Media must be stored already (`options.media`). */
export function convertStoryline(
  pkg: Pick<StorylinePackage, 'xml'>,
  options: ConvertOptions,
): ConvertResult {
  const story = readXml(pkg, 'story/story.xml');
  if (!story) throw new Error('The course has no story.xml');
  const report: PowerPointReport = [];
  const { layouts, masters } = readLayouts(pkg);
  const palette = readPalette(kid(masters[0], 'clrLst'));
  const project = createEmptyProject(options.fileName);
  project.theme.colors = themeColours(palette, project.theme.colors);
  const context: Context = {
    pkg,
    options,
    palette,
    report,
    slide: null,
    variables: readVariables(story),
    slides: new Map(),
    sceneFirst: new Map(),
    textColour: masterTextColour(masters[0], palette),
    quizzes: readQuizzes(story),
    quizKind: kid(story, 'quizMgr')?.attrs['type'] === 'survey' ? 'survey' : 'graded',
  };
  project.variables = [...context.variables.values()];

  // Scenes and their slides, in order.
  const storyRels = new Map(
    relationshipsOf(pkg, 'story/story.xml').map((rel) => [rel.id, rel.target]),
  );
  const scenes = kids(kid(story, 'sceneLst'), 'scene').map((scene) => ({
    g: scene.attrs['g'] ?? '',
    title: scene.attrs['name'] || 'Scene',
    slides: kids(kid(scene, 'sldIdLst'), 'sldId')
      .map((id) => readXml(pkg, storyRels.get(textOf(id).trim()) ?? ''))
      .filter((slide): slide is XmlElement => slide !== undefined),
  }));
  const all = scenes.flatMap((scene) => scene.slides);
  if (all.length === 0) throw new Error('The course has no slides');
  // The stage: the first slide's size, else the course's, else the usual 720 × 540.
  const sized = kid(kid(all[0], 'szCalc'), 'currSz');
  const width = num(sized?.attrs['w']);
  const height = num(sized?.attrs['h']);
  project.stage = width > 0 && height > 0 ? { width, height } : { width: 720, height: 540 };

  const made: Slide[] = all.map((element) => {
    const slide = createSlide(element.attrs['name'] || 'Slide');
    if (element.attrs['g']) context.slides.set(element.attrs['g'], slide.id);
    return slide;
  });
  // Each scene's first slide, for jumps to a scene (B5 part C).
  let first = 0;
  for (const scene of scenes) {
    if (scene.g && scene.slides.length > 0) context.sceneFirst.set(scene.g, made[first]!.id);
    first += scene.slides.length;
  }
  const notes = readNotes(pkg);

  const pendingResults: { slide: Slide; counted: string[]; number: number }[] = [];
  all.forEach((element, index) => {
    const slide = made[index]!;
    context.slide = index + 1;
    const parts = newParts();
    // Its layers first, so triggers anywhere can name them.
    // A question's feedback layers are layers like the others (B5 part D).
    const layerElements = kids(kid(element, 'sldLayerLst')).filter(
      (layer) => layer.name === 'sldLayer' || layer.name === 'feedBackLayer',
    );
    const layers: Layer[] = layerElements.map((layerElement) => {
      const layer = createLayer(
        layerElement.attrs['name'] || layerElement.attrs['defaultName'] || 'Layer',
      );
      if (layerElement.attrs['g']) parts.layers.set(layerElement.attrs['g'], layer.id);
      return layer;
    });

    // Motion paths, by the object each moves, so each object picks up its own as it is made.
    const ownLists = [
      kid(element, 'shapeLst'),
      ...layerElements.map((layerElement) => kid(layerElement, 'shapeLst')),
    ];
    for (const pathElement of ownLists.flatMap((list) => kids(list).filter(isMotionPath))) {
      const target = pathElement.attrs['shapeG'] ?? '';
      parts.motion.set(target, [...(parts.motion.get(target) ?? []), pathElement]);
    }

    // The base layer: the background, the layout's (and its master's) objects, then the slide's own.
    const layout = layouts.get(element.attrs['layoutG'] ?? '');
    const back =
      background(element, context, project.stage) ??
      background(layout?.element, context, project.stage) ??
      background(layout?.master, context, project.stage);
    const base: SceneObject[] = back ? [back] : [];
    const throwaway = newParts();
    // The master's and the layout's own objects show on the slide (`showMasterSp` is false
    // everywhere in courses that plainly show them, so it is not that switch); their
    // placeholders are only prompts for the slide's own text, and are left out.
    for (const owner of [layout?.master, layout?.element]) {
      const list = withoutPlaceholders(kid(owner, 'shapeLst'));
      base.push(...shapeList(list, context, throwaway, slide.baseLayer.id));
    }
    base.push(...shapeList(kid(element, 'shapeLst'), context, parts, slide.baseLayer.id));
    slide.baseLayer.objects = base;
    slide.baseLayer.timeline.duration = Math.max(
      0.1,
      round(num(kid(element, 'tmProps')?.attrs['min'], 5000) / 1000),
    );
    layerElements.forEach((layerElement, at) => {
      const layer = layers[at]!;
      layer.objects = shapeList(kid(layerElement, 'shapeLst'), context, parts, layer.id);
      layer.timeline.duration = Math.max(
        0.1,
        round(num(kid(layerElement, 'tmProps')?.attrs['min'], 5000) / 1000),
      );
      layer.properties = {
        ...layer.properties,
        hideOtherLayers: true,
        pauseBaseTimeline: layerElement.attrs['pause'] === 'true',
        blockBaseClicks: layerElement.attrs['modal'] === 'true',
      };
    });
    slide.layers = layers;
    for (const pathElements of parts.motion.values())
      for (const pathElement of pathElements)
        if (!parts.paths.has(pathElement.attrs['g'] ?? '') && readMotionPath(pathElement))
          note(
            context,
            'skipped',
            `“${cleanName(pathElement.attrs['name'], 'Motion path')}” moves an object that was not imported, so it is left out`,
          );

    // The slide's question or result (B5 part D), before the triggers that submit or show it.
    slide.question = readQuestion(element, slide, parts, context);
    const counted = readResult(element, slide, parts, context);
    if (counted) pendingResults.push({ slide, counted, number: index + 1 });
    resultButtonTriggers(ownLists, slide, parts, context);

    // Every state the slide's triggers set, so a trigger read earlier can wait for it (B12).
    for (const data of descendants(element, 'data')) {
      if (data.attrs['action'] !== 'changeShapeState') continue;
      const shape = kid(data, 'shape');
      stateFor(parts, shape?.attrs['setStateG'] ?? '', shape?.attrs['setStateName']);
    }

    // Triggers: the slide's, each layer's, and each object's.
    readTriggers(
      kid(element, 'trigLst'),
      { kind: 'slide', id: slide.id, layer: slide.baseLayer.id, base: slide.baseLayer.id },
      element.attrs['g'] ?? '',
      slide,
      parts,
      context,
    );
    layerElements.forEach((layerElement, at) => {
      const layer = layers[at]!;
      readTriggers(
        kid(layerElement, 'trigLst'),
        { kind: 'layer', id: layer.id, layer: layer.id, base: slide.baseLayer.id },
        layerElement.attrs['g'] ?? '',
        slide,
        parts,
        context,
      );
    });
    for (const list of [
      kid(element, 'shapeLst'),
      ...layerElements.map((layer) => kid(layer, 'shapeLst')),
    ]) {
      for (const objectElement of objectsWithTriggers(list)) {
        const g = objectElement.attrs['g'] ?? '';
        const placed = parts.objects.get(g);
        if (!placed) continue;
        readTriggers(
          kid(objectElement, 'trigLst'),
          { kind: 'object', id: placed.object.id, layer: placed.layer, base: slide.baseLayer.id },
          g,
          slide,
          parts,
          context,
        );
      }
    }
    const words = notes.get(element.attrs['g'] ?? '');
    if (words) slide.notes = notesFromText(words);
  });

  // What each result slide counts: the quiz's slides that are questions or results here.
  const byId = new Map(made.map((slide) => [slide.id, slide]));
  for (const { slide, counted, number } of pendingResults) {
    const ids = [
      ...new Set(
        counted.flatMap((g) => {
          const id = context.slides.get(g);
          const named = id ? byId.get(id) : undefined;
          return named && named !== slide && (named.question || named.result) ? [id!] : [];
        }),
      ),
    ];
    slide.result!.include = { kind: 'chosen', slides: ids.slice(0, 500) };
    if (ids.length < counted.length) {
      context.slide = number;
      const missing = counted.length - ids.length;
      note(
        context,
        'approximated',
        `${missing} of the questions this result counts ${missing > 1 ? 'were' : 'was'} not imported, so it counts the others`,
      );
    }
  }

  let at = 0;
  project.scenes = scenes.map((scene) => ({
    ...createScene(scene.title),
    slides: scene.slides.map(() => made[at++]!),
  }));
  project.title = textOf(kid(story, 'title')) || options.fileName;
  return { project, report: summarise(report) };
}

/** The report, with repeated lines on a slide gathered into one with a count. */
function summarise(report: PowerPointReport): PowerPointReport {
  const counted = new Map<string, { item: PowerPointReportItem; count: number }>();
  for (const item of report) {
    const key = `${item.slide}|${item.outcome}|${item.what}`;
    const entry = counted.get(key);
    if (entry) entry.count++;
    else counted.set(key, { item, count: 1 });
  }
  return [...counted.values()].map(({ item, count }) =>
    count > 1 ? { ...item, what: `${item.what} (${count} times)` } : item,
  );
}

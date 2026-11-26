/**
 * The saved shape of a project (project.json); FORMAT_VERSION below.
 *
 * Rules for changing anything here (docs/PLAN.md §1 rule 4):
 *   1. bump FORMAT_VERSION,
 *   2. add a migration in migrations.ts,
 *   3. add a fixture of the old shape under fixtures/legacy/.
 *
 * Objects are strict: unknown keys are an error, so data is never silently
 * dropped on a load/save round trip.
 */
import { z } from 'zod';
import { LABEL_KEYS, LANGUAGE_TAG } from './labels';
import type { LabelKey } from './labels';
import { isPathData } from './path-data';

export const FORMAT_VERSION = 40;

// ---------------------------------------------------------------- primitives

export const idSchema = z.string().regex(/^[A-Za-z0-9_-]+$/, 'must be a non-empty id');
export type Id = z.infer<typeof idSchema>;

/** SHA-256 of an asset's bytes, lower-case hex. Assets are stored and referenced by this. */
export const assetHashSchema = z.string().regex(/^[0-9a-f]{64}$/, 'must be a SHA-256 hex digest');
export type AssetHash = z.infer<typeof assetHashSchema>;

const finite = z.number().refine(Number.isFinite, 'must be a finite number');
const nonNegative = finite.min(0);
const unitInterval = finite.min(0).max(1);

// --------------------------------------------------------------------- theme

export const themeColorSlots = [
  'background',
  'text',
  'accent1',
  'accent2',
  'accent3',
  'accent4',
  'accent5',
  'accent6',
] as const;
export const themeColorSlotSchema = z.enum(themeColorSlots);
export type ThemeColorSlot = z.infer<typeof themeColorSlotSchema>;

export const hexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'must be #rrggbb or #rrggbbaa');

/** A literal colour, or a reference to a theme slot that follows theme changes. */
export const colorSchema = z.union([
  hexColorSchema,
  z.strictObject({ theme: themeColorSlotSchema }),
]);
export type Color = z.infer<typeof colorSchema>;

export const themeSchema = z.strictObject({
  colors: z.strictObject(
    Object.fromEntries(themeColorSlots.map((slot) => [slot, hexColorSchema])) as Record<
      ThemeColorSlot,
      typeof hexColorSchema
    >,
  ),
  fonts: z.strictObject({ heading: z.string().min(1), body: z.string().min(1) }),
});
export type Theme = z.infer<typeof themeSchema>;

// ----------------------------------------------------------------- rich text

/**
 * A ProseMirror-style JSON node. The model only guarantees the tree shape; the
 * set of node and mark types is owned by the text editor and the static
 * serializer in @vedraopus/render (P2.4).
 */
export interface RichTextNode {
  type: string;
  attrs?: Record<string, unknown> | undefined;
  text?: string | undefined;
  marks?: { type: string; attrs?: Record<string, unknown> | undefined }[] | undefined;
  content?: RichTextNode[] | undefined;
}

export const richTextNodeSchema: z.ZodType<RichTextNode> = z.lazy(() =>
  z.strictObject({
    type: z.string().min(1),
    attrs: z.record(z.string(), z.unknown()).optional(),
    text: z.string().optional(),
    marks: z
      .array(
        z.strictObject({
          type: z.string().min(1),
          attrs: z.record(z.string(), z.unknown()).optional(),
        }),
      )
      .optional(),
    content: z.array(richTextNodeSchema).optional(),
  }),
);

export const richTextSchema = z.strictObject({
  type: z.literal('doc'),
  content: z.array(richTextNodeSchema),
});
export type RichText = z.infer<typeof richTextSchema>;

// ---------------------------------------------------------------- appearance

export const fillSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({ kind: z.literal('solid'), color: colorSchema }),
  z.strictObject({
    kind: z.literal('gradient'),
    angle: finite,
    stops: z.array(z.strictObject({ offset: unitInterval, color: colorSchema })).min(2),
  }),
  z.strictObject({ kind: z.literal('image'), asset: assetHashSchema }),
]);
export type Fill = z.infer<typeof fillSchema>;

export const strokeSchema = z.strictObject({
  color: colorSchema,
  width: nonNegative,
  dash: z.enum(['solid', 'dash', 'dot']),
});
export type Stroke = z.infer<typeof strokeSchema>;

export const shadowSchema = z.strictObject({
  color: colorSchema,
  offsetX: finite,
  offsetY: finite,
  blur: nonNegative,
});
export type Shadow = z.infer<typeof shadowSchema>;

export const appearanceSchema = z.strictObject({
  fill: fillSchema,
  stroke: strokeSchema.nullable(),
  shadow: shadowSchema.nullable(),
  opacity: unitInterval,
});
export type Appearance = z.infer<typeof appearanceSchema>;

// ------------------------------------------------------------------ geometry

/** Position and size in stage units; rotation in degrees clockwise about the centre. */
export const frameSchema = z.strictObject({
  x: finite,
  y: finite,
  width: nonNegative,
  height: nonNegative,
  rotation: finite,
});
export type Frame = z.infer<typeof frameSchema>;

/** When the object is on stage, in seconds on its layer's timeline. */
export const timingSchema = z.strictObject({
  start: nonNegative,
  duration: z.union([finite.positive(), z.literal('untilEnd')]),
});
export type Timing = z.infer<typeof timingSchema>;

const pointSchema = z.strictObject({ x: finite, y: finite });

export const shapeGeometrySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('rect') }),
  z.strictObject({ kind: z.literal('roundRect'), radius: nonNegative }),
  z.strictObject({ kind: z.literal('ellipse') }),
  z.strictObject({ kind: z.literal('triangle') }),
  z.strictObject({ kind: z.literal('line') }),
  z.strictObject({ kind: z.literal('arrow') }),
  // Points are in a 0–1 box that is stretched to the object's frame.
  z.strictObject({ kind: z.literal('polygon'), points: z.array(pointSchema).min(3) }),
  /**
   * Outlines in the same 0–1 box (docs/briefs/B13-path-shapes.md), each filled,
   * outlined or both, drawn in order. A hole is an outline wound the other way.
   */
  z.strictObject({
    kind: z.literal('path'),
    paths: z
      .array(
        z.strictObject({
          d: z
            .string()
            .min(1)
            .max(20000)
            .refine(isPathData, 'path data with only absolute M, L, C and Z'),
          fill: z.boolean(),
          stroke: z.boolean(),
        }),
      )
      .min(1)
      .max(16),
  }),
]);
export type ShapeGeometry = z.infer<typeof shapeGeometrySchema>;

// -------------------------------------------------------------------- states

/**
 * State ids with automatic runtime behaviour (docs/PLAN.md §5). Any other id
 * is a custom state, changed only by triggers.
 */
export const builtInStateIds = [
  'normal',
  'hover',
  'down',
  'selected',
  'visited',
  'disabled',
  'hidden',
  'dragOver',
  'dropCorrect',
  'dropIncorrect',
] as const;
export type BuiltInStateId = (typeof builtInStateIds)[number];

/**
 * A state is `normal` plus these overrides. The `normal` state itself has empty
 * overrides: its look is the object's own properties.
 */
export const objectStateSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1),
  overrides: z.strictObject({
    frame: frameSchema.partial().optional(),
    appearance: appearanceSchema.partial().optional(),
    text: richTextSchema.optional(),
    asset: assetHashSchema.optional(),
  }),
});
export type ObjectState = z.infer<typeof objectStateSchema>;

// ---------------------------------------------------------------- animations

/**
 * Entrance and exit effects, and the directions each takes; the first is the
 * default (docs/briefs/P6.5-animations.md). For an entrance the direction is
 * where the object comes from; an exit is its entrance run backwards.
 */
export const effectDirections = {
  fade: [],
  fly: ['left', 'right', 'top', 'bottom', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight'],
  float: ['bottom', 'top', 'left', 'right'],
  wipe: ['left', 'right', 'top', 'bottom'],
  split: ['horizontal', 'vertical'],
  iris: [],
  grow: [],
  zoom: [],
  spin: ['clockwise', 'anticlockwise'],
  spinGrow: ['clockwise', 'anticlockwise'],
  bounce: [],
  swivel: ['horizontal', 'vertical'],
} as const satisfies Record<string, readonly string[]>;
export type EffectKind = keyof typeof effectDirections;
export const effectKinds = Object.keys(effectDirections) as EffectKind[];
export type EffectDirection = (typeof effectDirections)[EffectKind][number];
const allDirections = [...new Set(Object.values(effectDirections).flat())] as [
  EffectDirection,
  ...EffectDirection[],
];

export const effectSchema = z
  .strictObject({
    kind: z.enum(effectKinds as [EffectKind, ...EffectKind[]]),
    /** Seconds; by paragraph, for each paragraph. */
    duration: finite.min(0.05).max(30),
    direction: z.enum(allDirections).nullable(),
    /** Each paragraph in turn; only for objects with text. */
    byParagraph: z.boolean(),
  })
  .refine(
    (effect) => {
      const allowed: readonly string[] = effectDirections[effect.kind];
      return allowed.length === 0
        ? effect.direction === null
        : effect.direction !== null && allowed.includes(effect.direction);
    },
    { path: ['direction'], message: 'not a direction this effect takes' },
  );
export type Effect = z.infer<typeof effectSchema>;

export const motionPathSchema = z
  .strictObject({
    id: idSchema,
    name: z.string().min(1),
    /** `line`: start and end. `arc`: start, the point the curve passes through, end. `freeform`: a polyline. */
    shape: z.enum(['line', 'arc', 'freeform']),
    /** Offsets of the object's position, in stage units. */
    points: z.array(pointSchema).min(2).max(500),
    /** Seconds. */
    duration: finite.min(0.05).max(60),
    easing: z.enum(['linear', 'easeIn', 'easeOut', 'easeInOut']),
    /** Lay the path from wherever the object is when it starts, rather than from its own place. */
    relativeStart: z.boolean(),
  })
  .refine(
    (path) =>
      path.shape === 'line'
        ? path.points.length === 2
        : path.shape === 'arc'
          ? path.points.length === 3
          : true,
    { path: ['points'], message: 'a line has 2 points and an arc 3' },
  );
export type MotionPath = z.infer<typeof motionPathSchema>;

export const animationsSchema = z.strictObject({
  entrance: effectSchema.nullable(),
  exit: effectSchema.nullable(),
  motionPaths: z.array(motionPathSchema),
});
export type Animations = z.infer<typeof animationsSchema>;

// ------------------------------------------------------------------- objects

const objectBase = {
  id: idSchema,
  /** Author-facing name shown in the timeline and trigger wizard. */
  name: z.string().min(1),
  frame: frameSchema,
  timing: timingSchema,
  locked: z.boolean(),
  hiddenInEditor: z.boolean(),
  initialState: idSchema,
  states: z.array(objectStateSchema).min(1),
  a11y: z.strictObject({
    altText: z.string(),
    visibleToAssistiveTech: z.boolean(),
  }),
  /** Objects sharing a button set behave like radio buttons for `selected`. */
  buttonSet: z.string().min(1).nullable(),
  /** Only top-level objects of a layer may have any (docs/briefs/P6.5-animations.md). */
  animations: animationsSchema,
  /**
   * The learner may drag it (docs/briefs/P9.7-drag-intersections.md), top-level
   * objects only; `returnToStart` puts it back after each drop.
   */
  drag: z.strictObject({ returnToStart: z.boolean() }).nullable(),
};

export const textObjectSchema = z.strictObject({
  ...objectBase,
  type: z.literal('text'),
  props: z.strictObject({
    text: richTextSchema,
    autofit: z.enum(['none', 'shrinkText', 'growShape']),
    padding: nonNegative,
    /**
     * Marks a text box as a layout's title or content placeholder (in a
     * layout), or as the slide's own copy of one. Ordinary text boxes are null.
     */
    placeholder: z.enum(['title', 'content']).nullable(),
  }),
});
export type TextObject = z.infer<typeof textObjectSchema>;

export const shapeObjectSchema = z.strictObject({
  ...objectBase,
  type: z.literal('shape'),
  props: z.strictObject({
    geometry: shapeGeometrySchema,
    appearance: appearanceSchema,
    text: richTextSchema.nullable(),
  }),
});
export type ShapeObject = z.infer<typeof shapeObjectSchema>;

export const imageObjectSchema = z.strictObject({
  ...objectBase,
  type: z.literal('image'),
  props: z.strictObject({
    asset: assetHashSchema,
    /** Visible region of the source image, as fractions of its size. */
    crop: z
      .strictObject({ x: unitInterval, y: unitInterval, width: unitInterval, height: unitInterval })
      .nullable(),
    opacity: unitInterval,
  }),
});
export type ImageObject = z.infer<typeof imageObjectSchema>;

export const buttonObjectSchema = z.strictObject({
  ...objectBase,
  type: z.literal('button'),
  props: z.strictObject({
    appearance: appearanceSchema,
    cornerRadius: nonNegative,
    text: richTextSchema,
  }),
});
export type ButtonObject = z.infer<typeof buttonObjectSchema>;

/**
 * One closed caption: text shown from `start` to `end`, in seconds into the
 * media file itself, as VTT and SRT files count (docs/briefs/P6.4-captions.md).
 */
export const captionCueSchema = z
  .strictObject({
    id: idSchema,
    start: nonNegative,
    end: finite.positive(),
    text: z.string(),
  })
  .refine((cue) => cue.start < cue.end, {
    message: 'a caption must end after it starts',
    path: ['end'],
  });
export type CaptionCue = z.infer<typeof captionCueSchema>;

/**
 * Sound on a slide. It is heard, not seen: the editor draws a marker at its
 * frame so it can be selected, and a player draws nothing (P6.1).
 */
/**
 * What a sound was made from by text-to-speech (docs/briefs/P6.8-text-to-speech.md),
 * so it can be changed and made again. `voice` is `<provider>:<voice>`.
 */
export const speechSchema = z.strictObject({
  text: z.string().min(1).max(5000),
  voice: z.string().min(1).max(200),
  /** 1 is the voice's normal speed. */
  rate: finite.min(0.5).max(2),
});
export type Speech = z.infer<typeof speechSchema>;

export const audioObjectSchema = z.strictObject({
  ...objectBase,
  type: z.literal('audio'),
  props: z.strictObject({
    /** An asset of kind `audio`. */
    asset: assetHashSchema,
    /** Seconds of sound, measured when the audio was inserted. */
    length: finite.positive(),
    volume: unitInterval,
    /** With the timeline when it reaches the object, or only when a trigger plays it. */
    startOn: z.enum(['timeline', 'trigger']),
    captions: z.array(captionCueSchema),
    /** Made from text; null for a recording or an imported file. */
    speech: speechSchema.nullable(),
  }),
});
export type AudioObject = z.infer<typeof audioObjectSchema>;

/**
 * A video on a slide, played from `trimStart` to `trimEnd` of its file
 * (docs/briefs/P6.2-video.md).
 */
export const videoObjectSchema = z
  .strictObject({
    ...objectBase,
    type: z.literal('video'),
    props: z.strictObject({
      /** An asset of kind `video`. */
      asset: assetHashSchema,
      /** Seconds of the whole file, measured when it was inserted. */
      length: finite.positive(),
      trimStart: nonNegative,
      trimEnd: finite.positive(),
      volume: unitInterval,
      /** With the timeline, when the learner clicks it, or only when a trigger plays it. */
      startOn: z.enum(['timeline', 'click', 'trigger']),
      /** The browser's own controls, in a course. */
      controls: z.boolean(),
      pictureInPicture: z.boolean(),
      /** An image asset shown before it plays; null shows the first frame. */
      poster: assetHashSchema.nullable(),
      captions: z.array(captionCueSchema),
    }),
  })
  .refine(
    (video) =>
      video.props.trimStart < video.props.trimEnd && video.props.trimEnd <= video.props.length,
    {
      message: 'trim must be within the video, with the start before the end',
      path: ['props', 'trimEnd'],
    },
  );
export type VideoObject = z.infer<typeof videoObjectSchema>;

/**
 * One answer of a question, drawn as a round (multiple choice) or square
 * (multiple response) mark beside its words; the mark is filled when the
 * object is drawn in its `selected` state (docs/briefs/P7.1-question-model.md).
 */
export const choiceObjectSchema = z.strictObject({
  ...objectBase,
  type: z.literal('choice'),
  props: z.strictObject({
    text: richTextSchema,
    mark: z.enum(['radio', 'checkbox']),
    padding: nonNegative,
  }),
});
export type ChoiceObject = z.infer<typeof choiceObjectSchema>;

/** Where the learner types an answer (P7.2): an input in a course, a box elsewhere. */
export const textEntryObjectSchema = z.strictObject({
  ...objectBase,
  type: z.literal('textEntry'),
  props: z.strictObject({
    placeholder: z.string().max(200),
    /** Asks for a number (a numeric keyboard where there is one). */
    numeric: z.boolean(),
    /** Takes several lines, for an essay (P7.3); a textarea in a course. */
    multiline: z.boolean(),
    /**
     * The variable it shows and writes when it loses focus (P9.2): a text
     * variable, or a number variable for a numeric field.
     */
    variable: idSchema.nullable(),
    /** A numeric field's least and greatest values (P9.2). */
    min: finite.nullable(),
    max: finite.nullable(),
  }),
});
export type TextEntryObject = z.infer<typeof textEntryObjectSchema>;

/** Where the learner chooses one of `options` (P7.2): a select in a course. */
export const dropdownObjectSchema = z.strictObject({
  ...objectBase,
  type: z.literal('dropdown'),
  props: z.strictObject({
    options: z.array(z.string().min(1).max(200)).max(20),
  }),
});
export type DropdownObject = z.infer<typeof dropdownObjectSchema>;

/**
 * Part of the slide the learner's view zooms in to while it is on stage
 * (docs/briefs/P6.7-zoom-and-cues.md). It draws nothing in a course.
 */
export const zoomRegionObjectSchema = z.strictObject({
  ...objectBase,
  type: z.literal('zoomRegion'),
  props: z.strictObject({
    /** Seconds the zoom in, and the zoom out, take. */
    speed: finite.min(0).max(3),
  }),
});
export type ZoomRegionObject = z.infer<typeof zoomRegionObjectSchema>;

/** An invisible area to click (docs/briefs/P9.1-hotspots-markers.md). */
export const hotspotObjectSchema = z.strictObject({
  ...objectBase,
  type: z.literal('hotspot'),
  props: z.strictObject({ shape: z.enum(['rect', 'ellipse']) }),
});
export type HotspotObject = z.infer<typeof hotspotObjectSchema>;

export const markerIcons = ['plus', 'info', 'question', 'pin', 'star'] as const;
export type MarkerIcon = (typeof markerIcons)[number];

/** A small icon that opens a label of its own: title, text, a picture or video, a sound (P9.1). */
export const markerObjectSchema = z.strictObject({
  ...objectBase,
  type: z.literal('marker'),
  props: z.strictObject({
    icon: z.enum(markerIcons),
    color: colorSchema,
    title: z.string().max(200),
    /** Plain text, a line a paragraph. (Not `text`: elsewhere that is always rich text.) */
    body: z.string().max(5000),
    /** A picture or a video in the label. */
    media: assetHashSchema.nullable(),
    /** A sound that plays while the label is open. */
    audio: assetHashSchema.nullable(),
    opensOn: z.enum(['click', 'hover']),
    pulse: z.boolean(),
  }),
});
export type MarkerObject = z.infer<typeof markerObjectSchema>;

/** What a slider and a dial share (docs/briefs/P9.4-sliders-dials.md). */
const controlProps = {
  /** A number variable it shows and writes as it moves. */
  variable: idSchema.nullable(),
  min: finite,
  max: finite,
  step: finite.positive(),
  /** Where it starts when it is not bound. */
  initial: finite,
  /** The thumb, the filled part, a dial's pointer and arc. */
  color: colorSchema,
  trackColor: colorSchema,
};

export const sliderObjectSchema = z.strictObject({
  ...objectBase,
  type: z.literal('slider'),
  props: z.strictObject({ ...controlProps, orientation: z.enum(['horizontal', 'vertical']) }),
});
export type SliderObject = z.infer<typeof sliderObjectSchema>;

/** A web page's address a web object may load: http or https only (P9.6). */
export const WEB_URL = /^https?:\/\/\S+$/i;
/**
 * A path inside a web folder (P9.6): relative, parts joined by `/`, no `..`,
 * no empty part, no backslash or colon.
 */
export const WEB_PATH = /^(?!.*(?:^|\/)\.\.?(?:\/|$))[^/\\:]+(?:\/[^/\\:]+)*$/;

/** A web page on a slide, from an address or a folder of the author's (P9.6). */
export const webObjectSchema = z.strictObject({
  ...objectBase,
  type: z.literal('web'),
  props: z.strictObject({
    source: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('url'), url: z.string().max(2000).regex(WEB_URL) }),
      z.strictObject({
        kind: z.literal('folder'),
        /** Every file, by its path in the folder. */
        files: z.record(z.string().max(500).regex(WEB_PATH), assetHashSchema),
        /** The page it starts at. */
        entry: z.string().max(500).regex(WEB_PATH),
      }),
    ]),
    display: z.enum(['inline', 'window']),
    /** The window button's words, and the frame's accessible name. */
    title: z.string().min(1).max(200),
  }),
});
export type WebObject = z.infer<typeof webObjectSchema>;

/** A knob turned through three quarters of a circle (P9.4). */
/**
 * A dial drawn its own way (docs/briefs/B16-dial-looks-and-paths.md): a pointer turning about a
 * pivot between two angles, over a round picture if it has one. A dial without one is drawn as
 * ours: a track, its value along it, and a pointer.
 */
export const dialLookSchema = z
  .strictObject({
    /** The pointer: path data in the dial's 0–1 box, as it is at no turn, filled with its colour. */
    pointer: z
      .string()
      .min(1)
      .max(20000)
      .refine(isPathData, 'path data with only absolute M, L, C and Z'),
    /** The point it turns about, in the same box. */
    pivot: pointSchema,
    /** Its turn at the least value and at the most: degrees, clockwise. */
    from: finite.min(-3600).max(3600),
    to: finite.min(-3600).max(3600),
    /** A round picture centred on the pivot, `size` stage units across; it does not turn. */
    face: z.strictObject({ asset: assetHashSchema, size: finite.positive().max(10000) }).nullable(),
  })
  .refine((look) => look.from !== look.to, 'a dial turns between two different angles');
export type DialLook = z.infer<typeof dialLookSchema>;

export const dialObjectSchema = z.strictObject({
  ...objectBase,
  type: z.literal('dial'),
  props: z.strictObject({ ...controlProps, look: dialLookSchema.nullable() }),
});
export type DialObject = z.infer<typeof dialObjectSchema>;

// ------------------------------------------------- graphics (P9.8)

/** A plain number, as SVG writes them. */
const SVG_NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?%?$/i;
/** Path data: the path commands, numbers and separators only. */
export const SVG_PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]*$/;
/** A polyline's or polygon's points. */
const SVG_POINTS = /^[0-9eE.,+\-\s]*$/;
/** Transforms by number only: no `url(…)` or anything else can hide in one. */
const SVG_TRANSFORM =
  /^(\s*(matrix|translate|rotate|scale|skewX|skewY)\s*\([0-9eE.,+\-\s]*\)\s*,?)*\s*$/;
/** The graphic's ink or accent colour, none, or a fixed colour. */
export const GRAPHIC_PAINT = /^(ink|accent|none|#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})$/;

const svgNumber = z.string().max(40).regex(SVG_NUMBER);
const svgPaint = z.string().regex(GRAPHIC_PAINT);

/**
 * The attributes a graphic's shape may have (docs/briefs/P9.8-icons-library.md):
 * geometry, paint and line style. Nothing else (no style, no links, no
 * events) can be saved, so a drawing cannot run or load anything.
 */
export const graphicAttrsSchema = z.strictObject({
  d: z.string().max(200_000).regex(SVG_PATH).optional(),
  points: z.string().max(20_000).regex(SVG_POINTS).optional(),
  transform: z.string().max(500).regex(SVG_TRANSFORM).optional(),
  cx: svgNumber.optional(),
  cy: svgNumber.optional(),
  r: svgNumber.optional(),
  rx: svgNumber.optional(),
  ry: svgNumber.optional(),
  x: svgNumber.optional(),
  y: svgNumber.optional(),
  width: svgNumber.optional(),
  height: svgNumber.optional(),
  x1: svgNumber.optional(),
  y1: svgNumber.optional(),
  x2: svgNumber.optional(),
  y2: svgNumber.optional(),
  fill: svgPaint.optional(),
  stroke: svgPaint.optional(),
  'stroke-width': svgNumber.optional(),
  'stroke-linecap': z.enum(['butt', 'round', 'square']).optional(),
  'stroke-linejoin': z.enum(['miter', 'round', 'bevel']).optional(),
  'fill-rule': z.enum(['nonzero', 'evenodd']).optional(),
});

export const GRAPHIC_TAGS = [
  'g',
  'path',
  'circle',
  'ellipse',
  'rect',
  'line',
  'polyline',
  'polygon',
] as const;

export interface GraphicNode {
  tag: (typeof GRAPHIC_TAGS)[number];
  attrs: z.infer<typeof graphicAttrsSchema>;
  /** Only a `g` has any. */
  children: GraphicNode[];
}

export const graphicNodeSchema: z.ZodType<GraphicNode> = z.lazy(() =>
  z.strictObject({
    tag: z.enum(GRAPHIC_TAGS),
    attrs: graphicAttrsSchema,
    children: z.array(graphicNodeSchema),
  }),
);

/** At most this many shapes in one graphic, counting every group's. */
export const MAX_GRAPHIC_NODES = 5000;

const countNodes = (nodes: readonly GraphicNode[]): number =>
  nodes.reduce((sum, node) => sum + 1 + countNodes(node.children), 0);

/** An icon or illustration from the library, holding its own drawing (P9.8). */
export const graphicObjectSchema = z.strictObject({
  ...objectBase,
  type: z.literal('graphic'),
  props: z.strictObject({
    /** Where it came from: its set, and its name there. */
    library: z.enum(['lucide', 'openDoodles']),
    key: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    /** The drawing's own size; it is drawn into the frame keeping these proportions. */
    viewBox: z.strictObject({ width: finite.positive(), height: finite.positive() }),
    nodes: z.array(graphicNodeSchema).refine((nodes) => countNodes(nodes) <= MAX_GRAPHIC_NODES, {
      message: `at most ${MAX_GRAPHIC_NODES} shapes`,
    }),
    /** What the paints `ink` and `accent` are drawn in. */
    ink: colorSchema,
    accent: colorSchema,
    /** An icon's line width, in its own units; null keeps the drawing's own. */
    strokeWidth: finite.min(0.25).max(6).nullable(),
  }),
});
export type GraphicObject = z.infer<typeof graphicObjectSchema>;

// ------------------------------------------------- tables (P9.9)

export const MAX_TABLE_COLUMNS = 20;
export const MAX_TABLE_ROWS = 100;

export const tableCellSchema = z.strictObject({
  text: richTextSchema,
  /** Its own fill, over the row's; null for none. */
  fill: colorSchema.nullable(),
});
export type TableCell = z.infer<typeof tableCellSchema>;

export const tableRowSchema = z.strictObject({
  /** Its share of the table's height. */
  height: finite.positive(),
  /** One per column (validate.ts checks the count). */
  cells: z.array(tableCellSchema).min(1).max(MAX_TABLE_COLUMNS),
});
export type TableRow = z.infer<typeof tableRowSchema>;

/** A grid of rich-text cells (docs/briefs/P9.9-tables.md). */
export const tableObjectSchema = z.strictObject({
  ...objectBase,
  type: z.literal('table'),
  props: z.strictObject({
    /** Each column's share of the table's width. */
    columns: z.array(finite.positive()).min(1).max(MAX_TABLE_COLUMNS),
    rows: z.array(tableRowSchema).min(1).max(MAX_TABLE_ROWS),
    /** The first row, or the first column, is headings. */
    headerRow: z.boolean(),
    headerColumn: z.boolean(),
    headerFill: colorSchema,
    /** The colour of header text that does not set its own. */
    headerText: colorSchema,
    /** Every other body row's fill; null for none. */
    bandFill: colorSchema.nullable(),
    borderColor: colorSchema,
    borderWidth: finite.min(0).max(8),
    /** Inside each cell, in stage units. */
    padding: finite.min(0).max(40),
  }),
});
export type TableObject = z.infer<typeof tableObjectSchema>;

// ------------------------------------------------- 360° images (P9.10)

export const MAX_PANORAMA_SPOTS = 50;
const yaw = finite.min(-180).max(180);
const pitch = finite.min(-90).max(90);

/** A point on a 360° picture the learner can open: a hotspot, or a marker with a label. */
export const panoramaSpotSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1).max(100),
  kind: z.enum(['hotspot', 'marker']),
  /** Its direction: degrees round from the picture's middle, and up from the horizon. */
  yaw,
  pitch,
  /** A marker's label; a hotspot has none. */
  title: z.string().max(200),
  body: z.string().max(5000),
});
export type PanoramaSpot = z.infer<typeof panoramaSpotSchema>;

/** An equirectangular picture seen through the frame (docs/briefs/P9.10-panoramas.md). */
export const panoramaObjectSchema = z.strictObject({
  ...objectBase,
  type: z.literal('panorama'),
  props: z.strictObject({
    asset: assetHashSchema,
    /** Free: look anywhere. Guided: Previous and Next turn to each spot in order. */
    mode: z.enum(['free', 'guided']),
    /** Where the view starts; `fov` is how wide it sees, in degrees. */
    start: z.strictObject({ yaw, pitch, fov: finite.min(30).max(100) }),
    spots: z.array(panoramaSpotSchema).max(MAX_PANORAMA_SPOTS),
  }),
});
export type PanoramaObject = z.infer<typeof panoramaObjectSchema>;

type ObjectBase = Omit<TextObject, 'type' | 'props'>;
export interface GroupObject extends ObjectBase {
  type: 'group';
  /** Back-to-front. Children's frames are in stage units, like every other object. */
  children: SceneObject[];
  /**
   * A scrolling panel (docs/briefs/P9.5-scrolling-panels.md): the group shows its
   * top `height` stage pixels and scrolls through the rest. Null: an ordinary group.
   */
  scroll: { height: number } | null;
}
export type SceneObject =
  | TextObject
  | ShapeObject
  | ImageObject
  | ButtonObject
  | AudioObject
  | VideoObject
  | ZoomRegionObject
  | HotspotObject
  | MarkerObject
  | SliderObject
  | DialObject
  | WebObject
  | GraphicObject
  | TableObject
  | PanoramaObject
  | ChoiceObject
  | TextEntryObject
  | DropdownObject
  | GroupObject;
export type SceneObjectType = SceneObject['type'];

export const groupObjectSchema: z.ZodType<GroupObject> = z.lazy(() =>
  z.strictObject({
    ...objectBase,
    type: z.literal('group'),
    children: z.array(sceneObjectSchema),
    scroll: z.strictObject({ height: finite.positive() }).nullable(),
  }),
);

export const sceneObjectSchema: z.ZodType<SceneObject> = z.lazy(() =>
  z.union([
    textObjectSchema,
    shapeObjectSchema,
    imageObjectSchema,
    buttonObjectSchema,
    audioObjectSchema,
    videoObjectSchema,
    zoomRegionObjectSchema,
    hotspotObjectSchema,
    markerObjectSchema,
    sliderObjectSchema,
    dialObjectSchema,
    webObjectSchema,
    graphicObjectSchema,
    tableObjectSchema,
    panoramaObjectSchema,
    choiceObjectSchema,
    textEntryObjectSchema,
    dropdownObjectSchema,
    groupObjectSchema,
  ]),
);

// ----------------------------------------------------------------- variables

export const variableSchema = z
  .strictObject({
    id: idSchema,
    /** Used in `%Name%` text references; unique per project, ignoring case. */
    name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'must be letters, digits and underscores'),
    type: z.enum(['text', 'number', 'boolean']),
    default: z.union([z.string(), finite, z.boolean()]),
  })
  .refine(
    (variable) => typeof variable.default === (variable.type === 'text' ? 'string' : variable.type),
    { path: ['default'], message: 'default value must match the variable type' },
  );
export type Variable = z.infer<typeof variableSchema>;
export type VariableValue = Variable['default'];

// ------------------------------------------------------------------ triggers

/** A value used by an action or a condition: a literal or another variable's current value. */
export const operandSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('literal'), value: z.union([z.string(), finite, z.boolean()]) }),
  z.strictObject({ kind: z.literal('variable'), variable: idSchema }),
]);
export type Operand = z.infer<typeof operandSchema>;

const pointerEvents = ['click', 'doubleClick', 'rightClick', 'mouseEnter', 'mouseLeave'] as const;

/** The "when" of a trigger. More event types arrive with the features that need them. */
export const triggerEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.enum(pointerEvents), object: idSchema }),
  z.strictObject({ type: z.literal('keyPress'), key: z.string().min(1) }),
  /** The learner clicked one of the player's custom tabs (P8.2). */
  z.strictObject({ type: z.literal('playerTab'), tab: idSchema }),
  z.strictObject({ type: z.enum(['timelineStart', 'timelineEnd']), layer: idSchema }),
  z.strictObject({ type: z.literal('timelineReaches'), layer: idSchema, time: nonNegative }),
  z.strictObject({ type: z.literal('cuePoint'), layer: idSchema, cuePoint: idSchema }),
  z.strictObject({ type: z.literal('stateChange'), object: idSchema, state: idSchema }),
  z.strictObject({ type: z.literal('variableChange'), variable: idSchema }),
  /** An audio or video object played to its end. */
  z.strictObject({ type: z.literal('mediaCompletes'), object: idSchema }),
  /** Focus left a text entry or dropdown, after any variable it is bound to was written (P9.2). */
  z.strictObject({ type: z.literal('controlLosesFocus'), object: idSchema }),
  /** A slider or dial moved to a new value, after any variable it is bound to was written (P9.4). */
  z.strictObject({ type: z.literal('controlMoves'), object: idSchema }),
  /** A dragged object's middle came over, or was let go on, another object (P9.7). */
  z.strictObject({
    type: z.enum(['draggedOver', 'droppedOn']),
    object: idSchema,
    target: idSchema,
  }),
  /** The learner opened a spot of a 360° image (P9.10). */
  z.strictObject({ type: z.literal('spotClicked'), object: idSchema, spot: idSchema }),
  /** Every spot of a 360° image has been opened (P9.10). */
  z.strictObject({ type: z.literal('panoramaVisited'), object: idSchema }),
  /** Two objects' boxes began, or stopped, overlapping (P9.7). */
  z.strictObject({
    type: z.enum(['intersects', 'stopsIntersecting']),
    object: idSchema,
    other: idSchema,
  }),
  /** An object's entrance, exit or a run of one of its motion paths finished. */
  z.strictObject({
    type: z.literal('animationCompletes'),
    object: idSchema,
    animation: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.enum(['entrance', 'exit']) }),
      z.strictObject({ kind: z.literal('path'), path: idSchema }),
    ]),
  }),
]);
export type TriggerEvent = z.infer<typeof triggerEventSchema>;

export const jumpTargetSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('slide'), slide: idSchema }),
  z.strictObject({ kind: z.literal('next') }),
  z.strictObject({ kind: z.literal('previous') }),
]);
export type JumpTarget = z.infer<typeof jumpTargetSchema>;

/** The "what" of a trigger. */
export const triggerActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('changeState'), object: idSchema, state: idSchema }),
  z.strictObject({ type: z.enum(['showLayer', 'hideLayer']), layer: idSchema }),
  z.strictObject({ type: z.literal('jumpToSlide'), target: jumpTargetSchema }),
  z.strictObject({
    type: z.literal('setVariable'),
    variable: idSchema,
    operator: z.enum(['assign', 'add', 'subtract', 'multiply', 'divide', 'append']),
    operand: operandSchema,
  }),
  z.strictObject({ type: z.literal('toggleVariable'), variable: idSchema }),
  z.strictObject({ type: z.enum(['pauseTimeline', 'resumeTimeline']), layer: idSchema }),
  z.strictObject({ type: z.literal('openUrl'), url: z.string().min(1) }),
  z.strictObject({ type: z.literal('executeJavaScript'), code: z.string() }),
  /** Mark the course complete, whatever the completion rule says. */
  z.strictObject({ type: z.literal('completeCourse') }),
  /** Play, pause or stop an audio or video object (docs/briefs/P6.1-audio.md). */
  z.strictObject({ type: z.enum(['playMedia', 'pauseMedia', 'stopMedia']), object: idSchema }),
  /** Check the answer to the slide's own question (docs/briefs/P7.1-question-model.md). */
  z.strictObject({ type: z.literal('submitInteraction') }),
  /**
   * Go on from the slide's feedback layer (docs/briefs/P7.5-feedback.md): take
   * the branch once the question is finished, or close the layer to try again.
   */
  z.strictObject({ type: z.literal('continueQuestion') }),
  /** Show every question's answers for review, from the first question (P7.5). */
  z.strictObject({ type: z.literal('reviewQuiz') }),
  /** Leave review, back to the result slide it started from (P7.7). */
  z.strictObject({ type: z.literal('exitReview') }),
  /** Answer the result slide's questions again, from the first (P7.7). */
  z.strictObject({ type: z.literal('retryQuiz') }),
  /** Open a printable summary of the result slide's result (P7.7). */
  z.strictObject({ type: z.literal('printResults') }),
  /** Run one of the object's motion paths (docs/briefs/P6.5-animations.md). */
  z.strictObject({ type: z.literal('moveAlongPath'), object: idSchema, path: idSchema }),
  /** Play a slide of the course over this one, which waits untouched (P8.4, plan section 5). */
  z.strictObject({ type: z.literal('openLightbox'), slide: idSchema, controls: z.boolean() }),
  z.strictObject({ type: z.literal('closeLightbox') }),
  /** The session again from the first slide; completion stays (P8.6). */
  z.strictObject({ type: z.literal('restartCourse') }),
  /** Leave the course: the LMS is told, then the window closes or says the course has ended. */
  z.strictObject({ type: z.literal('exitCourse') }),
  /** Open the learner's mail with this message; %Variable% filled in when sent. */
  z.strictObject({
    type: z.literal('sendEmail'),
    to: z
      .string()
      .max(320)
      .regex(/^[^?&#]*$/, 'an address with no ?, & or #'),
    subject: z.string().max(500),
    body: z.string().max(5000),
  }),
  /** Print the current slide. */
  z.strictObject({ type: z.literal('printSlide') }),
  /** Open one of the course's files or pictures in a new tab. */
  z.strictObject({ type: z.literal('openFile'), asset: assetHashSchema }),
  /** Move keyboard focus to an object on the slide. */
  z.strictObject({ type: z.literal('setFocus'), object: idSchema }),
  /** Move a layer's playhead, as the seekbar does. */
  z.strictObject({ type: z.literal('seekTimeline'), layer: idSchema, time: nonNegative }),
]);
export type TriggerAction = z.infer<typeof triggerActionSchema>;

/** `==i` and `!=i` compare text ignoring case (B12); `contains` always has. */
export const comparisonOperators = [
  '==',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  'contains',
  '==i',
  '!=i',
] as const;

export const conditionSchema = z.discriminatedUnion('subject', [
  z.strictObject({
    subject: z.literal('variable'),
    variable: idSchema,
    operator: z.enum(comparisonOperators),
    value: operandSchema,
  }),
  z.strictObject({
    subject: z.literal('objectState'),
    object: idSchema,
    operator: z.enum(['==', '!=']),
    state: idSchema,
  }),
]);
export type Condition = z.infer<typeof conditionSchema>;

export const triggerSchema = z.strictObject({
  id: idSchema,
  /**
   * Whose trigger this is in the trigger panel, and its scope when ordering
   * triggers that share an event (object, then layer, then slide).
   */
  owner: z.strictObject({ kind: z.enum(['object', 'layer', 'slide']), id: idSchema }),
  event: triggerEventSchema,
  action: triggerActionSchema,
  conditions: z
    .strictObject({ combine: z.enum(['and', 'or']), items: z.array(conditionSchema).min(1) })
    .nullable(),
  /** Runs when the conditions fail. */
  otherwise: triggerActionSchema.nullable(),
  enabled: z.boolean(),
});
export type Trigger = z.infer<typeof triggerSchema>;

// ------------------------------------------------------------ layers, slides

export const cuePointSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1),
  time: nonNegative,
});
export type CuePoint = z.infer<typeof cuePointSchema>;

export const revisitSchema = z.enum(['auto', 'resume', 'reset']);

/**
 * Slide and layer transitions and the directions each takes; the first is the
 * default (docs/briefs/P6.6-transitions.md). The direction is where the new
 * slide or layer comes from, or for `uncover` where the old one goes.
 */
export const transitionDirections = {
  fade: [],
  push: ['right', 'left', 'bottom', 'top'],
  cover: ['right', 'left', 'bottom', 'top'],
  uncover: ['right', 'left', 'bottom', 'top'],
  wipe: ['left', 'right', 'top', 'bottom'],
  split: ['horizontal', 'vertical'],
  iris: [],
  zoom: [],
} as const satisfies Record<string, readonly string[]>;
export type TransitionKind = keyof typeof transitionDirections;
export const transitionKinds = Object.keys(transitionDirections) as TransitionKind[];
export type TransitionDirection = (typeof transitionDirections)[TransitionKind][number];
const allTransitionDirections = [...new Set(Object.values(transitionDirections).flat())] as [
  TransitionDirection,
  ...TransitionDirection[],
];

export const transitionSchema = z
  .strictObject({
    kind: z.enum(transitionKinds as [TransitionKind, ...TransitionKind[]]),
    /** Seconds. */
    duration: finite.min(0.1).max(5),
    direction: z.enum(allTransitionDirections).nullable(),
  })
  .refine(
    (transition) => {
      const allowed: readonly string[] = transitionDirections[transition.kind];
      return allowed.length === 0
        ? transition.direction === null
        : transition.direction !== null && allowed.includes(transition.direction);
    },
    { path: ['direction'], message: 'not a direction this transition takes' },
  );
export type Transition = z.infer<typeof transitionSchema>;

export const layerSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1),
  /** Array order is z-order, back to front. */
  objects: z.array(sceneObjectSchema),
  timeline: z.strictObject({
    /** Seconds. */
    duration: finite.positive(),
    cuePoints: z.array(cuePointSchema),
  }),
  /** Only meaningful on overlay layers; the base layer ignores them. */
  properties: z.strictObject({
    hideOtherLayers: z.boolean(),
    hideBaseObjects: z.boolean(),
    pauseBaseTimeline: z.boolean(),
    blockBaseClicks: z.boolean(),
    allowSeek: z.boolean(),
    onRevisit: revisitSchema,
    /** Played when the layer is shown, and backwards when it is hidden. Always null on a base layer. */
    transition: transitionSchema.nullable(),
  }),
});
export type Layer = z.infer<typeof layerSchema>;

/** One answer of a question, and the choice object on the slide that shows it. */
export const questionChoiceSchema = z.strictObject({
  id: idSchema,
  object: idSchema,
  correct: z.boolean(),
  /** Used when the question is scored by choice. */
  points: finite.min(-1000).max(1000),
  /** Shown when feedback is by choice (P7.5). */
  feedback: z.string().max(2000),
});
export type QuestionChoice = z.infer<typeof questionChoiceSchema>;

/** A condition a numeric answer can meet (P7.2); `between` includes both ends. */
export const numericConditionSchema = z.discriminatedUnion('op', [
  z.strictObject({
    op: z.enum(['equal', 'notEqual', 'less', 'lessOrEqual', 'greater', 'greaterOrEqual']),
    value: finite,
  }),
  z.strictObject({ op: z.literal('between'), from: finite, to: finite }),
]);
export type NumericCondition = z.infer<typeof numericConditionSchema>;

/**
 * One of a question slide's feedback layers (docs/briefs/P7.5-feedback.md):
 * the overlay layer, its message (a text object on it, holding the words) and
 * its button (which continues). Generated from the feedback master.
 */
export const feedbackPartSchema = z.strictObject({
  layer: idSchema,
  message: idSchema.nullable(),
  button: idSchema.nullable(),
});
export type FeedbackPart = z.infer<typeof feedbackPartSchema>;

/** The layers a graded question shows after Submit, by result. */
const feedbackLayers = {
  correct: feedbackPartSchema.nullable(),
  incorrect: feedbackPartSchema.nullable(),
  tryAgain: feedbackPartSchema.nullable(),
};
const byQuestion = z.strictObject({ by: z.literal('question'), points: finite.min(0).max(1000) });

/** What every kind of question has (docs/briefs/P7.1-question-model.md, P7.2-graded-types.md). */
const questionCommon = {
  /** A text object showing the question. */
  prompt: idSchema.nullable(),
  /** A button that submits the answer. */
  submit: idSchema.nullable(),
  /** Tries the learner gets; null for unlimited. */
  attempts: finite.int().min(1).max(10).nullable(),
  /** Where the learner goes once it is finished; null is the next slide. */
  branch: z.strictObject({
    correct: jumpTargetSchema.nullable(),
    incorrect: jumpTargetSchema.nullable(),
  }),
  /** The learner cannot go on with Next until it is finished. */
  required: z.boolean(),
};
/** The kinds other than the choice kinds score and give feedback by question only. */
const wholeQuestion = {
  ...questionCommon,
  scoring: byQuestion,
  feedback: z.strictObject({ by: z.enum(['question', 'none']), ...feedbackLayers }),
};

/** The kinds answered by choosing among choice objects. */
export const choiceKinds = ['multipleChoice', 'multipleResponse', 'trueFalse'] as const;
export type ChoiceKind = (typeof choiceKinds)[number];

const choiceQuestion = <K extends ChoiceKind>(kind: K) =>
  z.strictObject({
    kind: z.literal(kind),
    ...questionCommon,
    choices: z.array(questionChoiceSchema).max(20),
    scoring: z.discriminatedUnion('by', [byQuestion, z.strictObject({ by: z.literal('choice') })]),
    shuffle: z.boolean(),
    feedback: z.strictObject({ by: z.enum(['question', 'choice', 'none']), ...feedbackLayers }),
  });

/**
 * What every survey question has (docs/briefs/P7.3-survey-types.md): nothing
 * is right or wrong, so no attempts or score, and one feedback and one branch,
 * both taken once it is answered.
 */
const surveyCommon = {
  prompt: idSchema.nullable(),
  submit: idSchema.nullable(),
  required: z.boolean(),
  /** Where the learner goes once it is answered; null is the next slide. */
  branch: z.strictObject({ answered: jumpTargetSchema.nullable() }),
  /** The thank-you shown once it is answered (P7.5). */
  feedback: z.strictObject({
    by: z.enum(['question', 'none']),
    answered: feedbackPartSchema.nullable(),
  }),
};

/** The survey kinds: nothing in them is right or wrong. */
export const surveyKinds = [
  'pickOne',
  'pickMany',
  'shortAnswer',
  'essay',
  'howMany',
  'whichWord',
  'ranking',
  'likert',
] as const;
export type SurveyKind = (typeof surveyKinds)[number];

/** A survey choice: the choice object that shows it, and nothing right or wrong about it. */
export const surveyChoiceSchema = z.strictObject({ id: idSchema, object: idSchema });
export type SurveyChoice = z.infer<typeof surveyChoiceSchema>;

const surveyPick = <K extends 'pickOne' | 'pickMany'>(kind: K) =>
  z.strictObject({
    kind: z.literal(kind),
    ...surveyCommon,
    choices: z.array(surveyChoiceSchema).max(20),
    shuffle: z.boolean(),
  });

const surveyEntry = <K extends 'shortAnswer' | 'essay' | 'howMany'>(kind: K) =>
  z.strictObject({
    kind: z.literal(kind),
    ...surveyCommon,
    /** The text entry the learner types in. */
    entry: idSchema.nullable(),
  });

const pairSchema = z.strictObject({
  id: idSchema,
  /** A text object showing the item to match. */
  item: idSchema,
  /** A dropdown the learner chooses its match in. */
  select: idSchema,
  /** The words of its match, one of the dropdown's options. */
  match: z.string().min(1).max(200),
});
const stepSchema = z.strictObject({
  id: idSchema,
  /** The dropdown standing in this step's place. */
  select: idSchema,
  /** The step's words, one of the dropdowns' options. */
  text: z.string().min(1).max(200),
});

/** A freeform choice or spot (P7.4): any object on the stage, right or not. */
const freeChoiceSchema = z.strictObject({ id: idSchema, object: idSchema, correct: z.boolean() });

/** The kinds made by converting an ordinary slide (docs/briefs/P7.4-freeform-questions.md). */
export const freeformKinds = [
  'freePickOne',
  'freePickMany',
  'freeText',
  'freeKey',
  'freeDrag',
  'freeHotspot',
] as const;
export type FreeformKind = (typeof freeformKinds)[number];

const freePick = <K extends 'freePickOne' | 'freePickMany'>(kind: K) =>
  z.strictObject({
    kind: z.literal(kind),
    ...wholeQuestion,
    /** Objects the learner selects by clicking (each has a Selected state). */
    choices: z.array(freeChoiceSchema).max(20),
  });

/** A key and the modifiers held with it; `key` as browsers name it, '' while unset. */
export const keyComboSchema = z.strictObject({
  key: z.string().max(40),
  ctrl: z.boolean(),
  alt: z.boolean(),
  shift: z.boolean(),
  meta: z.boolean(),
});
export type KeyCombo = z.infer<typeof keyComboSchema>;

/**
 * What makes a slide a question. Its parts are ordinary objects on the slide's
 * base layer, named by id; the kinds differ in which parts they have.
 */
export const questionSchema = z
  .discriminatedUnion('kind', [
    choiceQuestion('multipleChoice'),
    choiceQuestion('multipleResponse'),
    choiceQuestion('trueFalse'),
    z.strictObject({
      kind: z.literal('fillInBlank'),
      ...wholeQuestion,
      /** The text entry the learner types in. */
      entry: idSchema.nullable(),
      /** What counts as right. */
      answers: z.array(z.string().min(1).max(200)).max(20),
      caseSensitive: z.boolean(),
    }),
    z.strictObject({
      kind: z.literal('numeric'),
      ...wholeQuestion,
      entry: idSchema.nullable(),
      /** Right when any one of them is met. */
      answers: z.array(numericConditionSchema).max(10),
    }),
    z.strictObject({
      kind: z.literal('matchingDropdown'),
      ...wholeQuestion,
      pairs: z.array(pairSchema).max(10),
      shuffle: z.boolean(),
    }),
    z.strictObject({
      kind: z.literal('sequenceDropdown'),
      ...wholeQuestion,
      /** In the right order. */
      steps: z.array(stepSchema).max(10),
    }),
    z.strictObject({
      kind: z.literal('wordBank'),
      ...wholeQuestion,
      /** Word tiles (shapes) the learner drags; the correct ones may go in the blank. */
      words: z
        .array(z.strictObject({ id: idSchema, object: idSchema, correct: z.boolean() }))
        .max(10),
      /** The shape the word is dropped on. */
      blank: idSchema.nullable(),
    }),
    z.strictObject({
      kind: z.literal('matchingDrag'),
      ...wholeQuestion,
      /** Each item tile (a shape) and the target shape it belongs on. */
      pairs: z.array(z.strictObject({ id: idSchema, item: idSchema, target: idSchema })).max(10),
      shuffle: z.boolean(),
    }),
    z.strictObject({
      kind: z.literal('sequenceDrag'),
      ...wholeQuestion,
      /** Tiles (shapes) in the right order; the learner sees them shuffled and drags them into place. */
      steps: z.array(z.strictObject({ id: idSchema, object: idSchema })).max(10),
    }),
    z.strictObject({
      kind: z.literal('hotspot'),
      ...wholeQuestion,
      /** The area the learner marks: a shape, so it needs no imported asset. */
      picture: idSchema.nullable(),
      /** Correct regions on the picture; shapes the author positions on the slide. */
      spots: z
        .array(z.strictObject({ id: idSchema, object: idSchema, correct: z.boolean() }))
        .max(10),
    }),
    freePick('freePickOne'),
    freePick('freePickMany'),
    z.strictObject({
      kind: z.literal('freeText'),
      ...wholeQuestion,
      entry: idSchema.nullable(),
      answers: z.array(z.string().min(1).max(200)).max(20),
      caseSensitive: z.boolean(),
    }),
    z.strictObject({
      kind: z.literal('freeDrag'),
      ...wholeQuestion,
      /** Objects the learner carries, and the target each belongs on (null: none, a decoy). */
      items: z
        .array(z.strictObject({ id: idSchema, object: idSchema, target: idSchema.nullable() }))
        .max(20),
      /** Objects items are dropped on. */
      targets: z.array(idSchema).max(20),
      /** A dropped item's middle moves to its target's middle. */
      snap: z.boolean(),
      /** An item dropped off every target goes home; otherwise it stays where it was let go. */
      returnToStart: z.boolean(),
      /** A target holds one item: the one already there goes home (B11). */
      onePerTarget: z.boolean(),
      /** Drop Correct and Drop Incorrect show only once the answer has been submitted (B11). */
      dropStatesAfterSubmit: z.boolean(),
    }),
    z.strictObject({
      kind: z.literal('freeHotspot'),
      ...wholeQuestion,
      /** Regions of the slide (any objects); the learner marks anywhere on it. */
      spots: z.array(freeChoiceSchema).max(20),
    }),
    z.strictObject({
      kind: z.literal('freeKey'),
      ...wholeQuestion,
      /** The key to press; each press is an answer. */
      key: keyComboSchema,
    }),
    surveyPick('pickOne'),
    surveyPick('pickMany'),
    surveyEntry('shortAnswer'),
    surveyEntry('essay'),
    surveyEntry('howMany'),
    z.strictObject({
      kind: z.literal('whichWord'),
      ...surveyCommon,
      /** Word tiles (shapes) the learner drags; any one may go in the blank. */
      words: z.array(surveyChoiceSchema).max(10),
      /** The shape the word is dropped on. */
      blank: idSchema.nullable(),
    }),
    z.strictObject({
      kind: z.literal('ranking'),
      ...surveyCommon,
      /** Tiles (shapes) in the order the learner starts from; they drag them into theirs. */
      items: z.array(surveyChoiceSchema).max(10),
    }),
    z.strictObject({
      kind: z.literal('likert'),
      ...surveyCommon,
      /** Text objects heading the scale's points, left to right. */
      labels: z.array(idSchema).max(10),
      /** Each statement rated on the scale: its text object, and a choice object per point. */
      statements: z
        .array(z.strictObject({ id: idSchema, text: idSchema, points: z.array(idSchema).max(10) }))
        .max(10),
    }),
  ])
  .superRefine((question, context) => {
    if (question.kind === 'freeDrag') {
      question.items.forEach((item, index) => {
        if (item.target !== null && !question.targets.includes(item.target)) {
          context.addIssue({
            code: 'custom',
            path: ['items', index, 'target'],
            message: 'an item belongs on one of the question’s targets, or none',
          });
        }
      });
    }
    if (question.kind === 'freePickOne' && question.choices.filter((c) => c.correct).length > 1) {
      context.addIssue({
        code: 'custom',
        path: ['choices'],
        message: 'a pick-one question has at most one correct answer',
      });
    }
    if (question.kind === 'multipleChoice' || question.kind === 'trueFalse') {
      if (question.choices.filter((choice) => choice.correct).length > 1) {
        context.addIssue({
          code: 'custom',
          path: ['choices'],
          message: `a ${question.kind === 'trueFalse' ? 'true/false' : 'multiple-choice'} question has at most one correct answer`,
        });
      }
    }
    if (question.kind === 'likert') {
      question.statements.forEach((statement, index) => {
        if (statement.points.length !== question.labels.length) {
          context.addIssue({
            code: 'custom',
            path: ['statements', index, 'points'],
            message: 'a Likert statement has one point for each label of the scale',
          });
        }
      });
    }
    if (question.kind === 'trueFalse' && question.choices.length !== 2) {
      context.addIssue({
        code: 'custom',
        path: ['choices'],
        message: 'a true/false question has two choices',
      });
    }
  });
export type Question = z.infer<typeof questionSchema>;
export type ChoiceQuestion = Extract<Question, { kind: ChoiceKind }>;

export type SurveyQuestion = Extract<Question, { kind: SurveyKind }>;
export type GradedQuestion = Exclude<Question, SurveyQuestion>;

/** Whether a question is a graded one answered with choice objects (and so has correct choices). */
export const isChoiceQuestion = (question: Question): question is ChoiceQuestion =>
  (choiceKinds as readonly string[]).includes(question.kind);

/** Whether a question is a survey question: nothing right or wrong, no score, one try. */
export const isSurveyQuestion = (question: Question): question is SurveyQuestion =>
  (surveyKinds as readonly string[]).includes(question.kind);

/**
 * Questions drawn from a bank where this slide is (docs/briefs/P7.6-banks-and-draws.md):
 * `count` of them, the `locked` ones always among them.
 */
export const drawSchema = z.strictObject({
  /** The bank drawn from; null draws nothing (its bank was deleted). */
  bank: idSchema.nullable(),
  count: finite.int().min(1).max(100),
  order: z.enum(['random', 'inOrder']),
  /** Slides of that bank always drawn. */
  locked: z.array(idSchema).max(100),
});
export type Draw = z.infer<typeof drawSchema>;

/**
 * What makes a slide a result slide (docs/briefs/P7.7-result-slides.md): the
 * questions it adds up, its pass mark, a time limit on them, and its Passed and
 * Failed layers.
 */
export const resultSchema = z.strictObject({
  kind: z.enum(['graded', 'survey']),
  /** Every question of its kind in the course, or the slides named (questions, draws, results). */
  include: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('all') }),
    z.strictObject({ kind: z.literal('chosen'), slides: z.array(idSchema).max(500) }),
  ]),
  /** Passed at this percentage of the most it could score, or more (graded only). */
  passPercent: finite.min(0).max(100),
  /** A time limit on its questions, from the first reached; null for none. */
  timer: z.strictObject({ seconds: finite.int().min(10).max(86400) }).nullable(),
  /** Overlay layers of this slide shown with the result. */
  layers: z.strictObject({ passed: idSchema.nullable(), failed: idSchema.nullable() }),
  /** Retry answers only the questions not answered correctly; the others keep their answers (B11). */
  retryIncorrectOnly: z.boolean(),
});
export type Result = z.infer<typeof resultSchema>;

export const slideSchema = z.strictObject({
  id: idSchema,
  title: z.string(),
  /** A layout from `project.masters`, or null for a blank slide. */
  layoutId: idSchema.nullable(),
  baseLayer: layerSchema,
  /** Overlay layers, bottom to top. */
  layers: z.array(layerSchema),
  notes: richTextSchema,
  properties: z.strictObject({
    advance: z.enum(['auto', 'user']),
    onRevisit: revisitSchema,
    /** Which of the player's own buttons this slide shows. Triggers can still navigate. */
    controls: z.strictObject({ previous: z.boolean(), next: z.boolean() }),
    /** Played when the learner arrives from another slide (docs/briefs/P6.6-transitions.md). */
    transition: transitionSchema.nullable(),
    /**
     * The order Tab reaches the slide's objects in a course (P10.1): the
     * author's, by object id; null follows the layout, top to bottom, then left to right.
     */
    focusOrder: z.array(idSchema).max(500).nullable(),
  }),
  /** Every trigger on this slide, in evaluation order within each owner. */
  triggers: z.array(triggerSchema),
  /** Present when the slide is a question (P7.1). */
  question: questionSchema.nullable(),
  /** Present when the slide stands for questions drawn from a bank (P7.6). */
  draw: drawSchema.nullable(),
  /** Present when the slide is a result slide (P7.7). */
  result: resultSchema.nullable(),
});
export type Slide = z.infer<typeof slideSchema>;

export const sceneSchema = z.strictObject({
  id: idSchema,
  title: z.string(),
  slides: z.array(slideSchema),
});
export type Scene = z.infer<typeof sceneSchema>;

// ------------------------------------------------------------------- masters

/** What a feedback master's layout is for (P7.5); a slide master's layouts have none. */
export const feedbackRoles = ['correct', 'incorrect', 'tryAgain', 'answered'] as const;
export type FeedbackRole = (typeof feedbackRoles)[number];

export const slideLayoutSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1),
  layer: layerSchema,
  /** On the feedback master, the result it shows (P7.5); null on a slide master. */
  role: z.enum(feedbackRoles).nullable(),
});
export type SlideLayout = z.infer<typeof slideLayoutSchema>;

export const slideMasterSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1),
  /** A slide master, or the project's one feedback master (P7.5). */
  kind: z.enum(['slide', 'feedback']),
  /** Drawn beneath every layout of this master. */
  layer: layerSchema,
  layouts: z.array(slideLayoutSchema),
});
export type SlideMaster = z.infer<typeof slideMasterSchema>;

// -------------------------------------------------------------------- assets

export const assetMetaSchema = z.strictObject({
  kind: z.enum(['image', 'audio', 'video', 'font', 'file']),
  /** Name of the file the author imported, for display only. */
  fileName: z.string().min(1),
  /** Extension of the stored file `assets/<hash>.<ext>`, without the dot. */
  ext: z.string().regex(/^[a-z0-9]+$/),
  mimeType: z.string().min(1),
  byteLength: nonNegative,
  width: nonNegative.optional(),
  height: nonNegative.optional(),
  /** Seconds, for audio and video. */
  duration: nonNegative.optional(),
});
export type AssetMeta = z.infer<typeof assetMetaSchema>;

// ------------------------------------------------------------------- project

// ------------------------------------------------------------------ tracking

/** How the course reports to an LMS (docs/briefs/P5.1-tracking-model.md). */
export const trackingSchema = z.strictObject({
  /** When the course counts as complete. A "complete course" action completes it in any case. */
  completion: z.discriminatedUnion('kind', [
    /** After this many slides have been seen, or every slide when null. */
    z.strictObject({ kind: z.literal('slidesViewed'), count: finite.int().min(1).nullable() }),
    /** Only when a trigger completes it. */
    z.strictObject({ kind: z.literal('trigger') }),
    /** When the learner reaches this graded result slide, passing or failing by it (P7.7). */
    z.strictObject({ kind: z.literal('result'), slide: idSchema }),
  ]),
  /** The pair of statuses the LMS is given: once complete, then before (or on failing). */
  reporting: z.enum([
    'completed-incomplete',
    'passed-incomplete',
    'passed-failed',
    'completed-failed',
  ]),
  /** What a returning learner gets: their place back, a fresh start, or the choice. */
  resume: z.enum(['always', 'never', 'prompt']),
});
export type Tracking = z.infer<typeof trackingSchema>;

/**
 * How the author last published the course, kept with it so the Publish
 * dialog opens as they left it (P5.6). The output folder is not here: it is
 * a path on one computer, so the app keeps it on that computer.
 */
/**
 * The course player's frame (docs/briefs/P8.1-player-frame.md): the bar, the
 * menu and how far it lets the learner go, and which controls it shows.
 */
/**
 * Links a course may open: web pages and email. Anything else (`javascript:`,
 * `file:`) could run script in the course or reach the learner's disk.
 */
export const RESOURCE_URL = /^(https?:\/\/|mailto:)\S+$/i;

/** One entry of the Resources tab: a web address, or a file kept with the course. */
export const resourceSchema = z.strictObject({
  id: idSchema,
  title: z.string().min(1).max(200),
  target: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('link'), url: z.string().max(2000).regex(RESOURCE_URL) }),
    z.strictObject({ kind: z.literal('file'), asset: assetHashSchema }),
  ]),
});
export type Resource = z.infer<typeof resourceSchema>;

export const glossaryTermSchema = z.strictObject({
  id: idSchema,
  term: z.string().min(1).max(200),
  definition: z.string().max(5000),
});
export type GlossaryTerm = z.infer<typeof glossaryTermSchema>;

export const customTabSchema = z.strictObject({
  id: idSchema,
  label: z.string().min(1).max(40),
  /** Open this slide as a lightbox (P8.4); null runs the slide's `playerTab` triggers. */
  lightbox: z.strictObject({ slide: idSchema, controls: z.boolean() }).nullable(),
});
export type CustomTab = z.infer<typeof customTabSchema>;

export const playerLookSchema = z.strictObject({
  /** Dark, light, or whichever the learner's system asks for. */
  scheme: z.enum(['dark', 'light', 'auto']),
  /** The current menu entry, focus rings, an open tab and pressed buttons. */
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be #rrggbb'),
  /** The system's font, or one of the course theme's. */
  font: z.enum(['system', 'body', 'heading']),
  controlsAt: z.enum(['bottom', 'top']),
  menuSide: z.enum(['left', 'right']),
});
export type PlayerLook = z.infer<typeof playerLookSchema>;

export const playerLabelsSchema = z.strictObject({
  language: z.string().regex(LANGUAGE_TAG, 'must be a language tag such as en or fr-CA'),
  /** By language tag: only the words the author changed. */
  words: z.record(
    z.string().regex(LANGUAGE_TAG),
    z.partialRecord(z.enum(LABEL_KEYS as [LabelKey, ...LabelKey[]]), z.string().min(1).max(300)),
  ),
});
export type PlayerLabels = z.infer<typeof playerLabelsSchema>;

export const playerSettingsSchema = z.strictObject({
  /** Show the course title in the bar. */
  title: z.boolean(),
  /** An image of the course shown at the start of the bar. */
  logo: assetHashSchema.nullable(),
  menu: z.strictObject({
    show: z.boolean(),
    /** Free: any slide; restricted: slides visited and the current one; locked: none. */
    navigation: z.enum(['free', 'restricted', 'locked']),
    /** What the author changed, by scene slide id: a title of its own, or left out. */
    entries: z.record(
      idSchema,
      z.strictObject({ title: z.string().max(200).nullable(), hidden: z.boolean() }),
    ),
  }),
  controls: z.strictObject({
    seekbar: z.enum(['off', 'view', 'drag']),
    /** A Submit button for the current slide's question. */
    submit: z.boolean(),
    volume: z.boolean(),
    /** The CC button, when the course has captions. */
    captions: z.boolean(),
    speed: z.boolean(),
    fullscreen: z.boolean(),
    accessibility: z.boolean(),
  }),
  /** The tabs in the bar (docs/briefs/P8.2-player-tabs.md). A tab with nothing in it is not shown. */
  tabs: z.strictObject({
    resources: z.strictObject({
      show: z.boolean(),
      items: z.array(resourceSchema).max(100),
    }),
    glossary: z.strictObject({
      show: z.boolean(),
      terms: z.array(glossaryTermSchema).max(1000),
    }),
    notes: z.strictObject({ show: z.boolean() }),
    /** The author's own tabs, which fire `playerTab` triggers. */
    custom: z.array(customTabSchema).max(10),
  }),
  /** How the frame looks (docs/briefs/P8.3-player-appearance.md). */
  look: playerLookSchema,
  /** The frame's words: the course's language, and what the author changed for each. */
  labels: playerLabelsSchema,
});
export type PlayerSettings = z.infer<typeof playerSettingsSchema>;

/**
 * A saved look for the player (P8.3), kept with the installation and applied
 * to any course: never the course's own content (menu entries, tabs, logo).
 */
export const playerPresetSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1).max(80),
  look: playerLookSchema,
  labels: playerLabelsSchema,
  title: z.boolean(),
  controls: playerSettingsSchema.shape.controls,
  menu: z.strictObject({
    show: z.boolean(),
    navigation: z.enum(['free', 'restricted', 'locked']),
  }),
});
export type PlayerPreset = z.infer<typeof playerPresetSchema>;

export const publishSettingsSchema = z.strictObject({
  target: z.enum(['web', 'scorm12', 'scorm2004', 'xapi', 'cmi5']),
  scorm2004Edition: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  /** Empty: the project's title. */
  title: z.string().max(200),
  /** Empty: the target's default (manifest identifier, activity or course IRI). */
  identifier: z.string().max(2000),
  /** The SCORM manifest's version. */
  version: z.string().max(20),
  description: z.string().max(2000),
  /** A zip file rather than a folder. */
  zip: z.boolean(),
});
export type PublishSettings = z.infer<typeof publishSettingsSchema>;

export const projectSchema = z.strictObject({
  formatVersion: z.literal(FORMAT_VERSION),
  id: idSchema,
  title: z.string(),
  stage: z.strictObject({
    width: finite.int().min(1),
    height: finite.int().min(1),
  }),
  theme: themeSchema,
  /** The first slide of the first scene is where the course starts. */
  scenes: z.array(sceneSchema),
  /** Question banks (P7.6): question slides kept out of the scenes, drawn from by draw slides. */
  banks: z.array(sceneSchema),
  masters: z.array(slideMasterSchema),
  variables: z.array(variableSchema),
  assets: z.record(assetHashSchema, assetMetaSchema),
  tracking: trackingSchema,
  /** The course player's frame (P8.1). */
  player: playerSettingsSchema,
  publish: publishSettingsSchema,
});
export type Project = z.infer<typeof projectSchema>;

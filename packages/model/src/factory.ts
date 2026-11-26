import { createId } from './ids';
import { defaultLabels, defaultLook } from './player-look';
import { renewObjectIds } from './clone';
import {
  FORMAT_VERSION,
  effectDirections,
  feedbackRoles,
  isSurveyQuestion,
  transitionDirections,
} from './schema';
import type {
  PlayerSettings,
  ThemeColorSlot,
  FeedbackPart,
  FeedbackRole,
  Animations,
  DropdownObject,
  TextEntryObject,
  ChoiceObject,
  FreeformKind,
  Question,
  Trigger,
  ZoomRegionObject,
  HotspotObject,
  MarkerObject,
  SliderObject,
  WebObject,
  GraphicObject,
  TableObject,
  PanoramaObject,
  PanoramaSpot,
  DialObject,
  Transition,
  TransitionKind,
  Effect,
  EffectKind,
  MotionPath,
  Appearance,
  AssetHash,
  AudioObject,
  ButtonObject,
  Frame,
  GroupObject,
  ImageObject,
  Layer,
  ObjectState,
  Project,
  PublishSettings,
  RichText,
  RichTextNode,
  VideoObject,
  Scene,
  SceneObject,
  ShapeGeometry,
  ShapeObject,
  Slide,
  SlideLayout,
  SlideMaster,
  TextObject,
  Theme,
  Tracking,
} from './schema';

export const DEFAULT_STAGE = { width: 1280, height: 720 } as const;
export const DEFAULT_TIMELINE_DURATION = 5;

export const DEFAULT_THEME: Theme = {
  colors: {
    background: '#ffffff',
    text: '#1c2024',
    accent1: '#2f6fed',
    accent2: '#12a594',
    accent3: '#f5a524',
    accent4: '#e5484d',
    accent5: '#8e4ec6',
    accent6: '#60656c',
  },
  fonts: { heading: 'Inter', body: 'Inter' },
};

export function emptyRichText(): RichText {
  return { type: 'doc', content: [] };
}

/** The mandatory `normal` state every object starts with. */
export function normalState(): ObjectState {
  return { id: 'normal', name: 'Normal', overrides: {} };
}

export function createLayer(name: string): Layer {
  return {
    id: createId('layer'),
    name,
    objects: [],
    timeline: { duration: DEFAULT_TIMELINE_DURATION, cuePoints: [] },
    properties: {
      hideOtherLayers: true,
      hideBaseObjects: false,
      pauseBaseTimeline: false,
      blockBaseClicks: false,
      allowSeek: true,
      onRevisit: 'auto',
      transition: null,
    },
  };
}

/** A transition of this kind with its default direction, half a second long. */
export function createTransition(kind: TransitionKind, duration = 0.5): Transition {
  return { kind, duration, direction: transitionDirections[kind][0] ?? null };
}

export function createSlide(title = 'Untitled Slide'): Slide {
  return {
    id: createId('slide'),
    title,
    layoutId: null,
    baseLayer: createLayer('Base Layer'),
    layers: [],
    notes: emptyRichText(),
    properties: {
      advance: 'user',
      onRevisit: 'auto',
      controls: { previous: true, next: true },
      transition: null,
      focusOrder: null,
      background: null,
      hideLayoutObjects: false,
    },
    triggers: [],
    question: null,
    draw: null,
    result: null,
  };
}

export function createScene(title = 'Untitled Scene'): Scene {
  return { id: createId('scene'), title, slides: [createSlide()] };
}

/** A new project: one scene containing one blank slide. */
/** Complete once every slide has been seen; report completed or incomplete; ask before resuming. */
export function defaultTracking(): Tracking {
  return {
    completion: { kind: 'slidesViewed', count: null },
    reporting: 'completed-incomplete',
    resume: 'prompt',
  };
}

/** Publish settings before the author has published: a web course in a folder. */
export function defaultPublishSettings(): PublishSettings {
  return {
    target: 'web',
    scorm2004Edition: 4,
    title: '',
    identifier: '',
    version: '1.0',
    description: '',
    zip: false,
  };
}

export function createEmptyProject(title = 'Untitled Project'): Project {
  return {
    formatVersion: FORMAT_VERSION,
    id: createId('project'),
    title,
    stage: { ...DEFAULT_STAGE },
    theme: { colors: { ...DEFAULT_THEME.colors }, fonts: { ...DEFAULT_THEME.fonts } },
    scenes: [createScene()],
    banks: [],
    masters: [createFeedbackMaster(DEFAULT_STAGE)],
    variables: [],
    assets: {},
    tracking: defaultTracking(),
    player: defaultPlayer(),
    publish: defaultPublishSettings(),
  };
}

// ------------------------------------------------------------------- objects

/** Where an object sits. Anything left out takes the default. */
export type FrameInput = Partial<Frame>;

const DEFAULT_FRAME: Frame = { x: 0, y: 0, width: 200, height: 120, rotation: 0 };

/** The look a new shape or button starts with: filled with the theme's first accent, no outline. */
export function defaultAppearance(): Appearance {
  return {
    fill: { kind: 'solid', color: { theme: 'accent1' } },
    stroke: null,
    shadow: null,
    opacity: 1,
  };
}

/** Rich text holding plain paragraphs, one per line of `text`. */
export function plainRichText(text: string): RichText {
  if (text === '') return emptyRichText();
  return {
    type: 'doc',
    content: text.split('\n').map((line) => ({
      type: 'paragraph',
      content: line === '' ? [] : [{ type: 'text', text: line }],
    })),
  };
}

function objectBase(name: string, frame: FrameInput) {
  return {
    id: createId('obj'),
    name,
    frame: { ...DEFAULT_FRAME, ...frame },
    timing: { start: 0, duration: 'untilEnd' as const },
    locked: false,
    hiddenInEditor: false,
    initialState: 'normal',
    states: [normalState()],
    a11y: { altText: '', visibleToAssistiveTech: true },
    buttonSet: null,
    animations: noAnimations(),
    drag: null,
  };
}

/** No entrance, no exit, no motion paths. */
export function noAnimations(): Animations {
  return { entrance: null, exit: null, motionPaths: [] };
}

/** An effect of this kind with its default direction, half a second long. */
export function createEffect(kind: EffectKind, duration = 0.5): Effect {
  return { kind, duration, direction: effectDirections[kind][0] ?? null, byParagraph: false };
}

/**
 * A motion path of this shape, 2 s long, easing in and out, starting where the
 * object is: a line to the right, an arc over to the right, or a freeform
 * polyline through `points` (offsets in stage units).
 */
export function createMotionPath(
  shape: MotionPath['shape'],
  name: string,
  points?: MotionPath['points'],
): MotionPath {
  const defaults: Record<MotionPath['shape'], MotionPath['points']> = {
    line: [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ],
    arc: [
      { x: 0, y: 0 },
      { x: 100, y: -80 },
      { x: 200, y: 0 },
    ],
    freeform: [
      { x: 0, y: 0 },
      { x: 100, y: 50 },
      { x: 200, y: 0 },
    ],
  };
  return {
    id: createId('path'),
    name,
    shape,
    points: points ?? defaults[shape],
    duration: 2,
    easing: 'easeInOut',
    relativeStart: false,
  };
}

export function createShapeObject(
  geometry: ShapeGeometry,
  frame: FrameInput = {},
  name = 'Shape',
): ShapeObject {
  const isLine = geometry.kind === 'line' || geometry.kind === 'arrow';
  const appearance = defaultAppearance();
  if (isLine) {
    // A line has nothing to fill; it is its outline.
    appearance.fill = { kind: 'none' };
    appearance.stroke = { color: { theme: 'text' }, width: 2, dash: 'solid' };
  }
  return {
    ...objectBase(name, isLine ? { height: 0, ...frame } : frame),
    type: 'shape',
    props: { geometry, appearance, text: null },
  };
}

export function createImageObject(
  asset: AssetHash,
  frame: FrameInput = {},
  name = 'Picture',
): ImageObject {
  return { ...objectBase(name, frame), type: 'image', props: { asset, crop: null, opacity: 1 } };
}

/**
 * Sound `length` seconds long, on the timeline from the start for its whole
 * length, at full volume, starting with the timeline. Its frame is where the
 * editor draws its marker.
 */
export function createAudioObject(
  asset: AssetHash,
  length: number,
  frame: FrameInput = {},
  name = 'Audio',
): AudioObject {
  return {
    ...objectBase(name, { width: 48, height: 48, ...frame }),
    timing: { start: 0, duration: length },
    // Sound has no picture to describe; assistive technology skips the marker.
    a11y: { altText: '', visibleToAssistiveTech: false },
    type: 'audio',
    props: { asset, length, volume: 1, startOn: 'timeline', captions: [], speech: null },
  };
}

/**
 * A zoom region (docs/briefs/P6.7-zoom-and-cues.md): half the stage's size in
 * its middle unless `frame` says otherwise, zooming in and out over 0.5 s.
 */
export function createZoomRegion(
  stage: { width: number; height: number },
  frame: FrameInput = {},
  name = 'Zoom Region',
): ZoomRegionObject {
  const width = stage.width / 2;
  const height = stage.height / 2;
  return {
    ...objectBase(name, { x: width / 2, y: height / 2, width, height, ...frame }),
    type: 'zoomRegion',
    props: { speed: 0.5 },
  };
}

/** An invisible area to click (docs/briefs/P9.1-hotspots-markers.md). */
export function createHotspotObject(
  frame: FrameInput = {},
  shape: HotspotObject['props']['shape'] = 'rect',
  name = 'Hotspot',
): HotspotObject {
  return {
    ...objectBase(name, { width: 160, height: 120, ...frame }),
    type: 'hotspot',
    props: { shape },
  };
}

/** A marker: a 36 × 36 icon whose label opens on a click (P9.1). */
export function createMarkerObject(
  frame: FrameInput = {},
  title = 'Marker',
  name = 'Marker',
): MarkerObject {
  return {
    ...objectBase(name, { width: 36, height: 36, ...frame }),
    type: 'marker',
    props: {
      icon: 'plus',
      color: { theme: 'accent1' },
      title,
      body: '',
      media: null,
      audio: null,
      opensOn: 'click',
      pulse: false,
    },
  };
}

/**
 * A video `length` seconds long, played whole, with the timeline, without
 * controls, picture-in-picture off, its first frame as its poster.
 */
export function createVideoObject(
  asset: AssetHash,
  length: number,
  frame: FrameInput = {},
  name = 'Video',
): VideoObject {
  return {
    ...objectBase(name, { width: 480, height: 270, ...frame }),
    timing: { start: 0, duration: length },
    type: 'video',
    props: {
      asset,
      length,
      trimStart: 0,
      trimEnd: length,
      volume: 1,
      startOn: 'timeline',
      controls: false,
      pictureInPicture: false,
      poster: null,
      captions: [],
    },
  };
}

export function createButtonObject(
  label = 'Button',
  frame: FrameInput = {},
  name = 'Button',
): ButtonObject {
  return {
    ...objectBase(name, { width: 160, height: 48, ...frame }),
    type: 'button',
    props: { appearance: defaultAppearance(), cornerRadius: 6, text: plainRichText(label) },
  };
}

/**
 * A choice object (docs/briefs/P7.1-question-model.md): a mark and its words,
 * with the built-in `selected` state that picking it puts it in.
 */
export function createChoiceObject(
  text: string,
  mark: ChoiceObject['props']['mark'],
  frame: FrameInput = {},
  name = 'Choice',
): ChoiceObject {
  return {
    ...objectBase(name, { width: 560, height: 44, ...frame }),
    type: 'choice',
    states: [normalState(), { id: 'selected', name: 'Selected', overrides: {} }],
    props: { text: plainRichText(text), mark, padding: 8 },
  };
}

/**
 * A 360° image of a picture (docs/briefs/P9.10-panoramas.md): a 640 × 360
 * window looking at the middle of the picture, free to explore, no spots yet.
 */
export function createPanoramaObject(asset: AssetHash, frame: FrameInput = {}): PanoramaObject {
  return {
    ...objectBase('360° Image', { width: 640, height: 360, ...frame }),
    type: 'panorama',
    props: { asset, mode: 'free', start: { yaw: 0, pitch: 0, fov: 75 }, spots: [] },
  };
}

/** A spot on a 360° image, looking that way: a marker, unless `kind` says hotspot. */
export function createPanoramaSpot(
  name: string,
  yaw = 0,
  pitch = 0,
  kind: PanoramaSpot['kind'] = 'marker',
): PanoramaSpot {
  return { id: createId('spot'), name, kind, yaw, pitch, title: name, body: '' };
}

/**
 * A table of empty cells (docs/briefs/P9.9-tables.md), equal columns and rows,
 * with a header row in the first accent colour and thin borders.
 */
export function createTableObject(columns = 3, rows = 4, frame: FrameInput = {}): TableObject {
  return {
    ...objectBase('Table', { width: 600, height: 48 * rows, ...frame }),
    type: 'table',
    props: {
      columns: Array.from({ length: columns }, () => 1),
      rows: Array.from({ length: rows }, () => ({
        height: 1,
        cells: Array.from({ length: columns }, () => ({ text: emptyRichText(), fill: null })),
      })),
      headerRow: true,
      headerColumn: false,
      headerFill: { theme: 'accent1' },
      headerText: { theme: 'background' },
      bandFill: null,
      borderColor: '#9aa0a6',
      borderWidth: 1,
      padding: 8,
    },
  };
}

/** One item of the icons and illustrations library, as `createGraphicObject` takes it (P9.8). */
export interface GraphicItem {
  library: GraphicObject['props']['library'];
  key: string;
  /** Its name in the library: "Heart", "Reading side". */
  title: string;
  viewBox: GraphicObject['props']['viewBox'];
  nodes: GraphicObject['props']['nodes'];
  /** An icon's line width; null for a drawing with its own. */
  strokeWidth: number | null;
}

/**
 * An icon or illustration from the library (docs/briefs/P9.8-icons-library.md),
 * holding a copy of its drawing. Icons are 96 across and drawn in the text
 * colour; illustrations 480 across, in the text and first accent colours.
 */
export function createGraphicObject(item: GraphicItem, frame: FrameInput = {}): GraphicObject {
  const icon = item.library === 'lucide';
  const width = icon ? 96 : 480;
  const height = Math.round((width * item.viewBox.height) / item.viewBox.width);
  const name = `${item.title} ${icon ? 'icon' : 'illustration'}`;
  return {
    ...objectBase(name, { width, height, ...frame }),
    a11y: { altText: name, visibleToAssistiveTech: true },
    type: 'graphic',
    props: {
      library: item.library,
      key: item.key,
      viewBox: { ...item.viewBox },
      nodes: JSON.parse(JSON.stringify(item.nodes)) as GraphicObject['props']['nodes'],
      ink: { theme: 'text' },
      accent: { theme: 'accent1' },
      strokeWidth: item.strokeWidth,
    },
  };
}

/** A web page from an address, shown in the slide (docs/briefs/P9.6-web-objects.md). */
export function createWebObject(
  source: WebObject['props']['source'],
  title = 'Web page',
  frame: FrameInput = {},
): WebObject {
  return {
    ...objectBase('Web Object', { width: 640, height: 400, ...frame }),
    type: 'web',
    props: { source, display: 'inline', title },
  };
}

/** A slider from 0 to 10 in steps of 1, across, starting at 0 (docs/briefs/P9.4-sliders-dials.md). */
export function createSliderObject(frame: FrameInput = {}, name = 'Slider'): SliderObject {
  return {
    ...objectBase(name, { width: 320, height: 40, ...frame }),
    type: 'slider',
    props: {
      variable: null,
      min: 0,
      max: 10,
      step: 1,
      initial: 0,
      orientation: 'horizontal',
      color: { theme: 'accent1' },
      trackColor: '#d6dbe1',
    },
  };
}

/** A dial from 0 to 10 in steps of 1, starting at 0 (P9.4). */
export function createDialObject(frame: FrameInput = {}, name = 'Dial'): DialObject {
  return {
    ...objectBase(name, { width: 120, height: 120, ...frame }),
    type: 'dial',
    props: {
      variable: null,
      min: 0,
      max: 10,
      step: 1,
      initial: 0,
      color: { theme: 'accent1' },
      trackColor: '#d6dbe1',
      look: null,
    },
  };
}

/**
 * A slider's or dial's value as it can be (P9.4): within its range, and a whole
 * number of steps from its least value. Rounded to clear floating-point dust.
 */
export function snapToStep(
  props: { min: number; max: number; step: number },
  value: number,
): number {
  const { min, max, step } = props;
  if (!Number.isFinite(value)) return min;
  const clamped = Math.min(max, Math.max(min, value));
  // 0.35 / 0.1 is 3.4999999999999996 in floating point: clear that first, so a
  // value exactly halfway rounds up as it should.
  const steps = Math.round(Number(((clamped - min) / step).toFixed(9)));
  const snapped = Math.min(max, min + steps * step);
  return Number(snapped.toFixed(10));
}

/** A stock checkbox (P9.3): a square choice of its own, Normal and Selected. */
export function createCheckboxObject(text = 'Checkbox', frame: FrameInput = {}): ChoiceObject {
  return createChoiceObject(text, 'checkbox', { width: 280, ...frame }, 'Checkbox');
}

/**
 * A stock radio button (P9.3): a round choice in the button set `group`,
 * which selects one of its members at a time; a new group when none is given.
 */
export function createRadioObject(
  text = 'Radio button',
  group: string = createId('obj'),
  frame: FrameInput = {},
): ChoiceObject {
  return {
    ...createChoiceObject(text, 'radio', { width: 280, ...frame }, 'Radio Button'),
    buttonSet: group,
  };
}

/** A box the learner types an answer in (P7.2); `multiline` for an essay (P7.3). */
export function createTextEntryObject(
  frame: FrameInput = {},
  numeric = false,
  name = 'Text Entry',
  multiline = false,
): TextEntryObject {
  return {
    ...objectBase(name, { width: 360, height: multiline ? 200 : 44, ...frame }),
    type: 'textEntry',
    props: {
      placeholder: numeric ? 'Type a number' : 'Type your answer',
      numeric,
      multiline,
      variable: null,
      min: null,
      max: null,
    },
  };
}

/** A list the learner chooses one of `options` from (P7.2). */
export function createDropdownObject(
  options: string[],
  frame: FrameInput = {},
  name = 'Dropdown',
): DropdownObject {
  return {
    ...objectBase(name, { width: 280, height: 40, ...frame }),
    type: 'dropdown',
    props: { options },
  };
}

const KIND_TITLES: Record<Question['kind'], string> = {
  multipleChoice: 'Multiple Choice',
  multipleResponse: 'Multiple Response',
  trueFalse: 'True or False',
  fillInBlank: 'Fill in the Blank',
  numeric: 'Numeric',
  matchingDropdown: 'Matching',
  sequenceDropdown: 'Sequence',
  wordBank: 'Word Bank',
  matchingDrag: 'Matching',
  sequenceDrag: 'Sequence',
  hotspot: 'Hotspot',
  pickOne: 'Pick One',
  pickMany: 'Pick Many',
  shortAnswer: 'Short Answer',
  essay: 'Essay',
  howMany: 'How Many',
  whichWord: 'Which Word',
  ranking: 'Ranking',
  likert: 'Likert',
  freePickOne: 'Pick One',
  freePickMany: 'Pick Many',
  freeText: 'Text Entry',
  freeKey: 'Shortcut Key',
  freeDrag: 'Drag and Drop',
  freeHotspot: 'Hotspot',
};

/**
 * The object with a Selected state, for a freeform choice (P7.4): the one it
 * has, or a new one that outlines it in the theme's accent.
 */
export function withSelectedState<T extends SceneObject>(object: T): T {
  if (object.states.some((state) => state.id === 'selected')) return object;
  const outline = object.type !== 'group' && 'appearance' in object.props;
  const selected: ObjectState = {
    id: 'selected',
    name: 'Selected',
    overrides: outline
      ? { appearance: { stroke: { color: { theme: 'accent1' }, width: 4, dash: 'solid' } } }
      : {},
  };
  return { ...object, states: [...object.states, selected] };
}

/** A new freeform question of `kind` with no parts chosen yet (docs/briefs/P7.4-freeform-questions.md). */
export function freeformQuestion(kind: FreeformKind, submit: string | null): Question {
  const common = {
    prompt: null,
    submit,
    attempts: 1,
    branch: { correct: null, incorrect: null },
    required: true,
    scoring: { by: 'question' as const, points: 10 },
    feedback: { by: 'question' as const, correct: null, incorrect: null, tryAgain: null },
  };
  switch (kind) {
    case 'freePickOne':
    case 'freePickMany':
      return { kind, ...common, choices: [] };
    case 'freeText':
      return { kind, ...common, entry: null, answers: [], caseSensitive: false };
    case 'freeDrag':
      return {
        kind,
        ...common,
        items: [],
        targets: [],
        snap: true,
        returnToStart: true,
        onePerTarget: false,
        dropStatesAfterSubmit: false,
      };
    case 'freeHotspot':
      return { kind, ...common, spots: [] };
    case 'freeKey':
      return {
        kind,
        ...common,
        key: { key: '', ctrl: false, alt: false, shift: false, meta: false },
      };
  }
}

/** What converting an ordinary slide into a freeform question adds to it. */
export interface Conversion {
  question: Question;
  /** Its feedback layers, from the feedback master (P7.5); their triggers are in `triggers`. */
  layers: Layer[];
  /** A Submit button, unless the kind needs none (shortcut key). */
  objects: SceneObject[];
  triggers: Trigger[];
}

/**
 * Converting a slide into a freeform question of `kind` (P7.4): the question,
 * and a Submit button in the stage's bottom right corner with the trigger that
 * submits; a shortcut key is answered by pressing it, so it gets neither.
 */
export function convertToQuestion(
  kind: FreeformKind,
  stage: { width: number; height: number },
  master: SlideMaster = createFeedbackMaster(stage),
): Conversion {
  // A slide to gather the feedback layers on, made as a new question slide's are (P7.5).
  const finish = (question: Question, objects: SceneObject[], triggers: Trigger[]) => {
    const holder = createSlide();
    holder.question = question;
    addFeedbackLayers(holder, master);
    return {
      question: holder.question,
      layers: holder.layers,
      objects,
      triggers: [...triggers, ...holder.triggers],
    };
  };
  if (kind === 'freeKey') return finish(freeformQuestion(kind, null), [], []);
  const margin = Math.round(stage.width * 0.08);
  const submit = createButtonObject(
    'Submit',
    { x: stage.width - margin - 160, y: stage.height - margin - 48 },
    'Submit',
  );
  submit.timing = { start: 0, duration: 'untilEnd' };
  return finish(
    freeformQuestion(kind, submit.id),
    [submit],
    [
      {
        id: createId('trigger'),
        owner: { kind: 'object', id: submit.id },
        event: { type: 'click', object: submit.id },
        action: { type: 'submitInteraction' },
        conditions: null,
        otherwise: null,
        enabled: true,
      },
    ],
  );
}

/** The default Likert scale, from one end to the other (P7.3). */
export const LIKERT_LABELS = [
  'Strongly disagree',
  'Disagree',
  'Neither agree nor disagree',
  'Agree',
  'Strongly agree',
];

/** Where a Likert grid's parts stand (docs/briefs/P7.3-survey-types.md). */
export interface LikertGrid {
  label(column: number): { x: number; y: number; width: number; height: number };
  statement(row: number): { x: number; y: number; width: number; height: number };
  point(row: number, column: number): { x: number; y: number; width: number; height: number };
}

/**
 * A Likert grid in `area`: the statements down the left two fifths, the scale's
 * columns sharing the rest, the labels in a row above. A point is a 38-unit
 * square, its mark in the middle of its cell.
 */
export function likertGrid(
  area: { x: number; y: number; width: number },
  columns: number,
): LikertGrid {
  const side = Math.round(area.width * 0.4);
  const cell = (area.width - side) / Math.max(1, columns);
  const labelHeight = 56;
  const rowHeight = 56;
  const rowTop = (row: number) => area.y + labelHeight + 8 + row * rowHeight;
  return {
    label: (column) => ({
      x: Math.round(area.x + side + column * cell),
      y: area.y,
      width: Math.round(cell),
      height: labelHeight,
    }),
    statement: (row) => ({ x: area.x, y: rowTop(row), width: side - 8, height: 44 }),
    point: (row, column) => ({
      x: Math.round(area.x + side + column * cell + (cell - 38) / 2),
      y: rowTop(row) + 3,
      width: 38,
      height: 38,
    }),
  };
}

/** A Likert scale's heading: small centred words over its column. */
export function createLikertLabel(words: string, frame: FrameInput, name: string): TextObject {
  const label = createTextObject(words, frame, name);
  for (const block of label.props.text.content) {
    if (block.type === 'paragraph') block.attrs = { ...block.attrs, textAlign: 'center' };
  }
  return label;
}

/** A point on a Likert scale: a mark with no words; a row's points share `set`. */
export function createLikertPoint(frame: FrameInput, set: string, name: string): ChoiceObject {
  const point = createChoiceObject('', 'radio', frame, name);
  point.buttonSet = set;
  return point;
}

/** A tile the learner drags (P7.2): a rounded shape holding words. */
export function createTile(words: string, frame: FrameInput = {}, name = 'Tile'): ShapeObject {
  const tile = createShapeObject(
    { kind: 'roundRect', radius: 8 },
    { width: 200, height: 48, ...frame },
    name,
  );
  tile.props.text = plainRichText(words);
  return tile;
}

/** Where a tile is dropped (P7.2): a rounded shape with a dashed outline, and optional words. */
export function createDropTarget(
  words: string,
  frame: FrameInput = {},
  name = 'Target',
): ShapeObject {
  const target = createShapeObject(
    { kind: 'roundRect', radius: 8 },
    { width: 220, height: 56, ...frame },
    name,
  );
  target.props.appearance = {
    ...target.props.appearance,
    fill: { kind: 'none' },
    stroke: { color: { theme: 'text' }, width: 2, dash: 'dash' },
  };
  target.props.text = words ? plainRichText(words) : null;
  return target;
}

/** A hotspot region (P7.2): a translucent dashed shape the author places on the picture. */
export function createSpot(frame: FrameInput = {}, name = 'Spot'): ShapeObject {
  const spot = createShapeObject(
    { kind: 'roundRect', radius: 12 },
    { width: 160, height: 120, ...frame },
    name,
  );
  spot.props.appearance = {
    ...spot.props.appearance,
    fill: { kind: 'solid', color: { theme: 'accent2' } },
    stroke: { color: { theme: 'text' }, width: 2, dash: 'dash' },
    opacity: 0.35,
  };
  return spot;
}

/**
 * A new question slide of `kind` (docs/briefs/P7.1-question-model.md,
 * P7.2-graded-types.md): a prompt, the kind's parts with a right answer
 * already set, and a Submit button with the trigger that submits, laid out
 * for a stage of `stage`'s size.
 */
export function createQuestionSlide(
  kind: Question['kind'],
  stage: { width: number; height: number },
  title = KIND_TITLES[kind],
  master: SlideMaster = createFeedbackMaster(stage),
): Slide {
  const slide = createSlide(title);
  const margin = Math.round(stage.width * 0.08);
  const width = stage.width - 2 * margin;
  const top = Math.round(stage.height * 0.3);
  const prompt = createTextObject(
    'Type the question here',
    { x: margin, y: Math.round(stage.height * 0.1), width, height: 80 },
    'Question',
  );
  const submit = createButtonObject(
    'Submit',
    { x: stage.width - margin - 160, y: stage.height - margin - 48 },
    'Submit',
  );
  const parts: SceneObject[] = [];
  const common = {
    prompt: prompt.id,
    submit: submit.id,
    attempts: 1,
    branch: { correct: null, incorrect: null },
    required: true,
  };
  const survey = {
    prompt: prompt.id,
    submit: submit.id,
    required: true,
    branch: { answered: null },
    feedback: { by: 'question' as const, answered: null },
  };
  const feedback = { by: 'question' as const, correct: null, incorrect: null, tryAgain: null };
  let question: Question;
  switch (kind) {
    case 'multipleChoice':
    case 'multipleResponse':
    case 'trueFalse': {
      const mark = kind === 'multipleResponse' ? 'checkbox' : 'radio';
      const words =
        kind === 'trueFalse'
          ? ['True', 'False']
          : ['First answer', 'Second answer', 'Third answer'];
      const set = kind === 'multipleResponse' ? null : createId('obj');
      const choices = words.map((each, index) => {
        const choice = createChoiceObject(
          each,
          mark,
          { x: margin, y: top + index * 60, width, height: 44 },
          `Choice ${index + 1}`,
        );
        choice.buttonSet = set;
        return choice;
      });
      parts.push(...choices);
      question = {
        kind,
        ...common,
        choices: choices.map((object, index) => ({
          id: createId('choice'),
          object: object.id,
          correct: index === 0,
          points: index === 0 ? 10 : 0,
          feedback: '',
        })),
        scoring: { by: 'question', points: 10 },
        shuffle: false,
        feedback,
      };
      break;
    }
    case 'pickOne':
    case 'pickMany': {
      const set = kind === 'pickOne' ? createId('obj') : null;
      const choices = ['First answer', 'Second answer', 'Third answer'].map((each, index) => {
        const choice = createChoiceObject(
          each,
          kind === 'pickOne' ? 'radio' : 'checkbox',
          { x: margin, y: top + index * 60, width, height: 44 },
          `Choice ${index + 1}`,
        );
        choice.buttonSet = set;
        return choice;
      });
      parts.push(...choices);
      question = {
        kind,
        ...survey,
        choices: choices.map((object) => ({ id: createId('choice'), object: object.id })),
        shuffle: false,
      };
      break;
    }
    case 'shortAnswer':
    case 'essay':
    case 'howMany': {
      const entry = createTextEntryObject(
        kind === 'essay' ? { x: margin, y: top, width } : { x: margin, y: top },
        kind === 'howMany',
        'Text Entry',
        kind === 'essay',
      );
      parts.push(entry);
      question = { kind, ...survey, entry: entry.id };
      break;
    }
    case 'whichWord': {
      const blank = createDropTarget('', { x: margin, y: top, width: 240, height: 56 }, 'Blank');
      const words = ['First word', 'Second word', 'Third word'].map((each, index) =>
        createTile(each, { x: margin + index * 240, y: top + 120 }, `Word ${index + 1}`),
      );
      parts.push(blank, ...words);
      question = {
        kind,
        ...survey,
        blank: blank.id,
        words: words.map((object) => ({ id: createId('choice'), object: object.id })),
      };
      break;
    }
    case 'likert': {
      const grid = likertGrid({ x: margin, y: top - 40, width }, LIKERT_LABELS.length);
      const labels = LIKERT_LABELS.map((words, column) =>
        createLikertLabel(words, grid.label(column), `Scale ${column + 1}`),
      );
      parts.push(...labels);
      const statements = ['First statement', 'Second statement', 'Third statement'].map(
        (words, row) => {
          const text = createTextObject(words, grid.statement(row), `Statement ${row + 1}`);
          const set = createId('obj');
          const points = labels.map((_, column) =>
            createLikertPoint(
              grid.point(row, column),
              set,
              `Statement ${row + 1} point ${column + 1}`,
            ),
          );
          parts.push(text, ...points);
          return {
            id: createId('choice'),
            text: text.id,
            points: points.map((point) => point.id),
          };
        },
      );
      question = { kind, ...survey, labels: labels.map((label) => label.id), statements };
      break;
    }
    case 'freePickOne':
    case 'freePickMany': {
      // As if the author had drawn three pictures and converted the slide.
      const set = kind === 'freePickOne' ? createId('obj') : null;
      const pictures = [0, 1, 2].map((index) => {
        const shape = withSelectedState(
          createShapeObject(
            { kind: 'roundRect', radius: 12 },
            { x: margin + index * 300, y: top, width: 240, height: 160 },
            `Picture ${index + 1}`,
          ),
        );
        shape.buttonSet = set;
        return shape;
      });
      parts.push(...pictures);
      question = {
        ...(freeformQuestion(kind, submit.id) as Extract<Question, { kind: typeof kind }>),
        prompt: prompt.id,
        choices: pictures.map((object, index) => ({
          id: createId('choice'),
          object: object.id,
          correct: index === 0,
        })),
      };
      break;
    }
    case 'freeText': {
      const entry = createTextEntryObject({ x: margin, y: top });
      parts.push(entry);
      question = {
        ...(freeformQuestion(kind, submit.id) as Extract<Question, { kind: 'freeText' }>),
        prompt: prompt.id,
        entry: entry.id,
        answers: ['answer'],
      };
      break;
    }
    case 'freeHotspot': {
      // As if the author had drawn three regions on the slide; the first is right.
      const regions = [0, 1, 2].map((index) =>
        createShapeObject(
          { kind: 'ellipse' },
          { x: margin + index * 360, y: top, width: 240, height: 160 },
          `Region ${index + 1}`,
        ),
      );
      parts.push(...regions);
      question = {
        ...(freeformQuestion(kind, submit.id) as Extract<Question, { kind: 'freeHotspot' }>),
        prompt: prompt.id,
        spots: regions.map((region, index) => ({
          id: createId('choice'),
          object: region.id,
          correct: index === 0,
        })),
      };
      break;
    }
    case 'freeDrag': {
      // As if the author had drawn two bins and three things to sort, one a decoy.
      const bins = ['Fruit', 'Vegetables'].map((words, index) =>
        createDropTarget(
          words,
          { x: margin + Math.round(width / 2) + index * 260, y: top, width: 220, height: 160 },
          words,
        ),
      );
      const things = ['Apple', 'Carrot', 'Stone'].map((words, index) =>
        createTile(words, { x: margin, y: top + index * 64 }, words),
      );
      parts.push(...bins, ...things);
      question = {
        ...(freeformQuestion(kind, submit.id) as Extract<Question, { kind: 'freeDrag' }>),
        prompt: prompt.id,
        targets: bins.map((bin) => bin.id),
        items: things.map((thing, index) => ({
          id: createId('choice'),
          object: thing.id,
          target: bins[index]?.id ?? null,
        })),
      };
      break;
    }
    case 'freeKey':
      question = {
        ...(freeformQuestion(kind, null) as Extract<Question, { kind: 'freeKey' }>),
        prompt: prompt.id,
        key: { key: 's', ctrl: true, alt: false, shift: false, meta: false },
      };
      break;
    case 'ranking': {
      const items = ['First item', 'Second item', 'Third item'].map((each, index) =>
        createTile(each, { x: margin, y: top + index * 64, width: 320 }, `Item ${index + 1}`),
      );
      parts.push(...items);
      question = {
        kind,
        ...survey,
        items: items.map((object) => ({ id: createId('choice'), object: object.id })),
      };
      break;
    }
    case 'fillInBlank':
    case 'numeric': {
      const entry = createTextEntryObject({ x: margin, y: top }, kind === 'numeric');
      parts.push(entry);
      question =
        kind === 'fillInBlank'
          ? {
              kind,
              ...common,
              scoring: { by: 'question', points: 10 },
              feedback,
              entry: entry.id,
              answers: ['answer'],
              caseSensitive: false,
            }
          : {
              kind,
              ...common,
              scoring: { by: 'question', points: 10 },
              feedback,
              entry: entry.id,
              answers: [{ op: 'equal', value: 10 }],
            };
      break;
    }
    case 'matchingDropdown': {
      const matches = ['First match', 'Second match', 'Third match'];
      const pairs = ['First item', 'Second item', 'Third item'].map((words, index) => {
        const item = createTextObject(
          words,
          { x: margin, y: top + index * 60, width: Math.round(width / 2) - 20, height: 44 },
          `Item ${index + 1}`,
        );
        const select = createDropdownObject(
          matches,
          { x: margin + Math.round(width / 2), y: top + index * 60, width: Math.round(width / 2) },
          `Match ${index + 1}`,
        );
        parts.push(item, select);
        return { id: createId('choice'), item: item.id, select: select.id, match: matches[index]! };
      });
      question = {
        kind,
        ...common,
        scoring: { by: 'question', points: 10 },
        feedback,
        pairs,
        shuffle: true,
      };
      break;
    }
    case 'sequenceDropdown': {
      const texts = ['First step', 'Second step', 'Third step'];
      const steps = texts.map((text, index) => {
        const select = createDropdownObject(
          texts,
          { x: margin, y: top + index * 60, width: Math.round(width / 2) },
          `Step ${index + 1}`,
        );
        parts.push(select);
        return { id: createId('choice'), select: select.id, text };
      });
      question = {
        kind,
        ...common,
        scoring: { by: 'question', points: 10 },
        feedback,
        steps,
      };
      break;
    }
    case 'wordBank': {
      const blank = createDropTarget('', { x: margin, y: top, width: 240, height: 56 }, 'Blank');
      const words = ['right word', 'wrong word', 'other word'].map((each, index) =>
        createTile(each, { x: margin + index * 240, y: top + 120 }, `Word ${index + 1}`),
      );
      parts.push(blank, ...words);
      question = {
        kind,
        ...common,
        scoring: { by: 'question', points: 10 },
        feedback,
        blank: blank.id,
        words: words.map((object, index) => ({
          id: createId('choice'),
          object: object.id,
          correct: index === 0,
        })),
      };
      break;
    }
    case 'matchingDrag': {
      const pairs = ['First', 'Second', 'Third'].map((each, index) => {
        const item = createTile(
          `${each} item`,
          { x: margin, y: top + index * 76 },
          `Item ${index + 1}`,
        );
        const target = createDropTarget(
          `${each} match`,
          { x: margin + Math.round(width / 2), y: top + index * 76 - 4 },
          `Target ${index + 1}`,
        );
        parts.push(item, target);
        return { id: createId('choice'), item: item.id, target: target.id };
      });
      question = {
        kind,
        ...common,
        scoring: { by: 'question', points: 10 },
        feedback,
        pairs,
        shuffle: true,
      };
      break;
    }
    case 'sequenceDrag': {
      const steps = ['First step', 'Second step', 'Third step'].map((each, index) => {
        const tile = createTile(
          each,
          { x: margin, y: top + index * 64, width: 320 },
          `Step ${index + 1}`,
        );
        parts.push(tile);
        return { id: createId('choice'), object: tile.id };
      });
      question = {
        kind,
        ...common,
        scoring: { by: 'question', points: 10 },
        feedback,
        steps,
      };
      break;
    }
    case 'hotspot': {
      const height = Math.round(stage.height * 0.45);
      const picture = createShapeObject(
        { kind: 'roundRect', radius: 8 },
        { x: margin, y: top, width, height },
        'Picture',
      );
      picture.props.appearance = {
        ...picture.props.appearance,
        fill: { kind: 'solid', color: { theme: 'background' } },
        stroke: { color: { theme: 'text' }, width: 2, dash: 'dash' },
      };
      const spots = [0, 1, 2].map((index) =>
        createSpot({ x: margin + 120 + index * 300, y: top + 100 }, `Spot ${index + 1}`),
      );
      parts.push(picture, ...spots);
      question = {
        kind,
        ...common,
        scoring: { by: 'question', points: 10 },
        feedback,
        picture: picture.id,
        spots: spots.map((object, index) => ({
          id: createId('choice'),
          object: object.id,
          correct: index === 0,
        })),
      };
      break;
    }
  }
  // A shortcut key is answered by pressing it: no Submit (P7.4).
  const withSubmit = question.submit !== null;
  slide.baseLayer.objects.push(prompt, ...parts, ...(withSubmit ? [submit] : []));
  for (const object of slide.baseLayer.objects) object.timing = { start: 0, duration: 'untilEnd' };
  if (withSubmit) {
    slide.triggers.push({
      id: createId('trigger'),
      owner: { kind: 'object', id: submit.id },
      event: { type: 'click', object: submit.id },
      action: { type: 'submitInteraction' },
      conditions: null,
      otherwise: null,
      enabled: true,
    });
  }
  slide.question = question;
  addFeedbackLayers(slide, master);
  return slide;
}

// ------------------------------------------------------------- feedback (P7.5)

/** The words a new feedback layer says, by result (docs/briefs/P7.5-feedback.md). */
export const FEEDBACK_WORDS: Record<FeedbackRole, string> = {
  correct: 'That’s right.',
  incorrect: 'That’s not right.',
  tryAgain: 'That’s not right. Try again.',
  answered: 'Thank you.',
};

const FEEDBACK_LOOK: Record<
  FeedbackRole,
  { name: string; heading: string; button: string; color: ThemeColorSlot }
> = {
  // In the default theme accent2 is green-blue, accent4 red and accent3 amber (the Phase 7 review).
  correct: { name: 'Correct', heading: 'Correct', button: 'Continue', color: 'accent2' },
  incorrect: { name: 'Incorrect', heading: 'Incorrect', button: 'Continue', color: 'accent4' },
  tryAgain: { name: 'Try Again', heading: 'Not quite', button: 'Try Again', color: 'accent3' },
  answered: { name: 'Thank You', heading: 'Thank you', button: 'Continue', color: 'accent1' },
};

/**
 * The default feedback master: for each result, a panel across the bottom
 * third of the stage, outlined in a theme accent, with a heading, the message
 * (the text with the content placeholder) and a button.
 */
export function createFeedbackMaster(stage: { width: number; height: number }): SlideMaster {
  const margin = Math.round(stage.width * 0.05);
  const top = Math.round(stage.height * 0.62);
  // Never below a usable size, however small the stage.
  const width = Math.max(320, stage.width - 2 * margin);
  const height = Math.max(160, stage.height - top - margin);
  return {
    id: createId('master'),
    name: 'Feedback',
    kind: 'feedback',
    layer: createLayer('Feedback Layer'),
    layouts: feedbackRoles.map((role) => {
      const look = FEEDBACK_LOOK[role];
      const layer = createLayer(look.name);
      const panel = createShapeObject(
        { kind: 'roundRect', radius: 12 },
        { x: margin, y: top, width, height },
        'Panel',
      );
      panel.props.appearance = {
        ...panel.props.appearance,
        fill: { kind: 'solid', color: { theme: 'background' } },
        stroke: { color: { theme: look.color }, width: 4, dash: 'solid' },
      };
      const heading = createTextObject(
        look.heading,
        { x: margin + 24, y: top + 16, width: width - 48, height: 48 },
        'Heading',
      );
      // Words the author can see on the master; each question's own replace them.
      const message = createTextObject(
        'The feedback words go here.',
        { x: margin + 24, y: top + 68, width: width - 248, height: height - 92 },
        'Message',
      );
      message.props.placeholder = 'content';
      const button = createButtonObject(
        look.button,
        { x: margin + width - 184, y: top + height - 72 },
        look.button,
      );
      layer.objects.push(panel, heading, message, button);
      return { id: createId('layout'), name: look.name, layer, role };
    }),
  };
}

/**
 * A question slide's feedback layer for `role`, from the feedback master: an
 * overlay with the master's and the layout's objects (new ids), the message
 * saying `words`, and the trigger that makes its button continue.
 */
export function createFeedbackLayer(
  master: SlideMaster,
  role: FeedbackRole,
  words: string,
): { layer: Layer; part: FeedbackPart; triggers: Trigger[] } {
  const layout = master.layouts.find((each) => each.role === role);
  const layer = createLayer(FEEDBACK_LOOK[role].name);
  layer.properties = {
    ...layer.properties,
    hideOtherLayers: true,
    pauseBaseTimeline: true,
    blockBaseClicks: true,
  };
  const objects = JSON.parse(
    JSON.stringify([...master.layer.objects, ...(layout?.layer.objects ?? [])]),
  ) as SceneObject[];
  renewObjectIds(objects);
  layer.objects = objects;
  const message = objects.find(
    (object): object is TextObject =>
      object.type === 'text' && object.props.placeholder === 'content',
  );
  if (message) {
    message.props.text = plainRichText(words);
    message.props.placeholder = null;
  }
  const button = objects.find((object) => object.type === 'button');
  const triggers: Trigger[] = button
    ? [
        {
          id: createId('trigger'),
          owner: { kind: 'object', id: button.id },
          event: { type: 'click', object: button.id },
          action: { type: 'continueQuestion' },
          conditions: null,
          otherwise: null,
          enabled: true,
        },
      ]
    : [];
  return {
    layer,
    part: { layer: layer.id, message: message?.id ?? null, button: button?.id ?? null },
    triggers,
  };
}

/** The feedback layers a question needs: by result, and try again only with a try to spare. */
export function feedbackRolesFor(question: Question): FeedbackRole[] {
  if (isSurveyQuestion(question)) return ['answered'];
  const again = question.attempts === null || question.attempts > 1;
  return again ? ['correct', 'incorrect', 'tryAgain'] : ['correct', 'incorrect'];
}

/** Give a question slide the feedback layers its question needs and lacks, from `master`. */
export function addFeedbackLayers(slide: Slide, master: SlideMaster): void {
  const question = slide.question;
  if (!question || question.feedback.by === 'none') return;
  const feedback = question.feedback as Record<string, unknown>;
  for (const role of feedbackRolesFor(question)) {
    if (feedback[role]) continue;
    const made = createFeedbackLayer(master, role, FEEDBACK_WORDS[role]);
    slide.layers.push(made.layer);
    slide.triggers.push(...made.triggers);
    feedback[role] = made.part;
  }
}

/** The project's feedback master (P7.5); a valid project has exactly one. */
export function feedbackMasterOf(project: Project): SlideMaster | undefined {
  return project.masters.find((master) => master.kind === 'feedback');
}

export function createTextObject(text = '', frame: FrameInput = {}, name = 'Text Box'): TextObject {
  return {
    ...objectBase(name, frame),
    type: 'text',
    props: { text: plainRichText(text), autofit: 'none', padding: 8, placeholder: null },
  };
}

/**
 * A group around existing objects. Children keep their stage-unit frames; the
 * group's frame is the box that contains them.
 */
export function createGroupObject(children: SceneObject[], name = 'Group'): GroupObject {
  const left = Math.min(...children.map((child) => child.frame.x));
  const top = Math.min(...children.map((child) => child.frame.y));
  const right = Math.max(...children.map((child) => child.frame.x + child.frame.width));
  const bottom = Math.max(...children.map((child) => child.frame.y + child.frame.height));
  const frame: Frame =
    children.length === 0
      ? { ...DEFAULT_FRAME, width: 0, height: 0 }
      : { x: left, y: top, width: right - left, height: bottom - top, rotation: 0 };
  return { ...objectBase(name, frame), type: 'group', children, scroll: null };
}

// ------------------------------------------------------------ masters, layouts

const PLACEHOLDER_NAMES = { title: 'Title Placeholder', content: 'Content Placeholder' } as const;
const PLACEHOLDER_PROMPTS = { title: 'Click to edit the title', content: 'Click to add text' };

/**
 * A title or content placeholder. In a layout it carries a prompt; on a slide
 * (`prompt` false) it starts empty and holds the slide's own text.
 */
export function createPlaceholder(
  kind: 'title' | 'content',
  frame: FrameInput = {},
  prompt = true,
): TextObject {
  const box = createTextObject(
    prompt ? PLACEHOLDER_PROMPTS[kind] : '',
    frame,
    PLACEHOLDER_NAMES[kind],
  );
  box.props.placeholder = kind;
  return box;
}

const TITLE_FRAME = { x: 80, y: 48, width: 1120, height: 96 };
const CONTENT_FRAME = { x: 80, y: 176, width: 1120, height: 472 };

export function createSlideLayout(
  name: string,
  placeholders: readonly ('title' | 'content')[] = [],
): SlideLayout {
  const layer = createLayer(name);
  for (const kind of placeholders) {
    layer.objects.push(createPlaceholder(kind, kind === 'title' ? TITLE_FRAME : CONTENT_FRAME));
  }
  return { id: createId('layout'), name, layer, role: null };
}

/** A master with three starter layouts. */
export function createSlideMaster(name = 'Master'): SlideMaster {
  return {
    id: createId('master'),
    name,
    kind: 'slide',
    layer: createLayer(`${name} Layer`),
    layouts: [
      createSlideLayout('Title and Content', ['title', 'content']),
      createSlideLayout('Title Only', ['title']),
      createSlideLayout('Blank'),
    ],
  };
}

/**
 * Copies of a layout's placeholders that the slide does not have yet, with
 * fresh ids and empty text, ready for `slide.setLayout`'s `objects`.
 */
export function placeholdersMissingFrom(layout: SlideLayout, slide: Slide): TextObject[] {
  const have = new Set(
    slide.baseLayer.objects.flatMap((o) =>
      o.type === 'text' && o.props.placeholder ? [o.props.placeholder] : [],
    ),
  );
  return layout.layer.objects.flatMap((o) =>
    o.type === 'text' && o.props.placeholder && !have.has(o.props.placeholder)
      ? [createPlaceholder(o.props.placeholder, o.frame, false)]
      : [],
  );
}

// ---------------------------------------------------------- banks and draws (P7.6)

/** A question bank (docs/briefs/P7.6-banks-and-draws.md), starting with one multiple-choice question. */
export function createBank(
  title: string,
  stage: { width: number; height: number },
  master?: SlideMaster,
): Scene {
  return {
    id: createId('scene'),
    title,
    slides: [createQuestionSlide('multipleChoice', stage, undefined, master)],
  };
}

/** A slide standing for questions drawn from `bank`: two, at random, none locked. */
export function createDrawSlide(bank: string | null, title = 'Draw from Question Bank'): Slide {
  const slide = createSlide(title);
  slide.draw = { bank, count: 2, order: 'random', locked: [] };
  return slide;
}

// ------------------------------------------------------------- results (P7.7)

/**
 * A result slide (docs/briefs/P7.7-result-slides.md): its score shown through
 * the built-in variables, a Passed and a Failed layer, and Review, Retry and
 * Print buttons with their triggers. Graded, all questions, 80% to pass.
 */
export function createResultSlide(
  stage: { width: number; height: number },
  title = 'Results',
): Slide {
  const slide = createSlide(title);
  const margin = Math.round(stage.width * 0.08);
  const width = stage.width - 2 * margin;
  const heading = createTextObject(
    'Your results',
    { x: margin, y: Math.round(stage.height * 0.1), width, height: 72 },
    'Heading',
  );
  const score = createTextObject(
    'You scored %ResultPercent%% (%ResultScore% of %ResultMaxScore% points). To pass: %ResultPassPercent%%.',
    { x: margin, y: Math.round(stage.height * 0.28), width, height: 96 },
    'Score',
  );
  const buttons = (
    [
      ['Review', 'reviewQuiz'],
      ['Retry', 'retryQuiz'],
      ['Print', 'printResults'],
    ] as const
  ).map(([label, action], index) => {
    const button = createButtonObject(
      label,
      { x: margin + index * 184, y: stage.height - margin - 48 },
      label,
    );
    return { button, action };
  });
  slide.baseLayer.objects.push(heading, score, ...buttons.map((each) => each.button));
  for (const { button, action } of buttons) {
    slide.triggers.push({
      id: createId('trigger'),
      owner: { kind: 'object', id: button.id },
      event: { type: 'click', object: button.id },
      action: { type: action },
      conditions: null,
      otherwise: null,
      enabled: true,
    });
  }
  const layer = (name: string, words: string) => {
    const made = createLayer(name);
    made.properties = { ...made.properties, hideOtherLayers: true };
    made.objects.push(
      createTextObject(
        words,
        { x: margin, y: Math.round(stage.height * 0.48), width, height: 72 },
        'Message',
      ),
    );
    return made;
  };
  const passed = layer('Passed', 'Well done: you passed.');
  const failed = layer('Failed', 'You did not pass this time. Review your answers, or try again.');
  slide.layers.push(passed, failed);
  for (const object of [...slide.baseLayer.objects, ...passed.objects, ...failed.objects]) {
    object.timing = { start: 0, duration: 'untilEnd' };
  }
  slide.result = {
    kind: 'graded',
    include: { kind: 'all' },
    passPercent: 80,
    timer: null,
    layers: { passed: passed.id, failed: failed.id },
    retryIncorrectOnly: false,
  };
  return slide;
}

/** The player frame a new course has (docs/briefs/P8.1-player-frame.md). */
export function defaultPlayer(): PlayerSettings {
  return {
    title: true,
    logo: null,
    menu: { show: true, navigation: 'free', entries: {} },
    controls: {
      seekbar: 'view',
      submit: false,
      volume: true,
      captions: true,
      speed: true,
      fullscreen: true,
      accessibility: true,
    },
    tabs: {
      resources: { show: true, items: [] },
      glossary: { show: true, terms: [] },
      notes: { show: true },
      custom: [],
    },
    look: defaultLook(),
    labels: defaultLabels(),
  };
}

/** Slide notes from plain text: each line a paragraph (P8.2). Only blank lines is no notes. */
export function notesFromText(text: string): RichText {
  const lines = text.replace(/\r\n?/g, '\n');
  return lines.trim() === '' ? emptyRichText() : plainRichText(lines);
}

/** Slide notes as plain text, a line for each paragraph: what `notesFromText` reads back. */
export function notesText(notes: RichText): string {
  const textOf = (node: RichTextNode): string => {
    if (node.type === 'hardBreak') return '\n';
    if (node.type === 'text') return node.text ?? '';
    return (node.content ?? []).map(textOf).join('');
  };
  return notes.content.map(textOf).join('\n');
}

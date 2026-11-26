import type { Transition, VariableValue } from '@vedraopus/model';
import type { TrackingState } from './tracking';

/** Everything the engine announces. Triggers (P4.3) will listen to these. */
export type EngineEvent =
  | { type: 'slideEnter'; slideId: string; resumed: boolean }
  | { type: 'slideExit'; slideId: string }
  | { type: 'timelineStart'; slideId: string; layerId: string }
  | { type: 'timelineEnd'; slideId: string; layerId: string }
  | { type: 'cuePoint'; slideId: string; layerId: string; cuePointId: string }
  | { type: 'objectEnter'; slideId: string; layerId: string; objectId: string }
  | { type: 'objectLeave'; slideId: string; layerId: string; objectId: string }
  | { type: 'layerShow'; slideId: string; layerId: string }
  | { type: 'layerHide'; slideId: string; layerId: string }
  | { type: 'objectStateChange'; slideId: string; objectId: string; state: string }
  | { type: 'variableChange'; variableId: string; name: string; value: VariableValue }
  /** The learner did something to an object that took the input. */
  | { type: 'objectInput'; slideId: string; objectId: string; input: ObjectInput }
  | { type: 'keyPress'; key: string }
  /** The learner clicked one of the player's custom tabs (P8.2). */
  | { type: 'playerTab'; tab: string }
  /** A layer's playhead passed a time some trigger is waiting for. */
  | { type: 'timelineReaches'; slideId: string; layerId: string; time: number }
  /** A trigger asked to open a web address. The view opens it (the engine cannot). */
  | { type: 'openUrl'; url: string }
  /** Course actions the view carries out (P8.6): leave, print the slide, open a file, move focus. */
  | { type: 'exitCourse' }
  | { type: 'print' }
  | { type: 'openFile'; asset: string }
  | { type: 'focus'; slideId: string; objectId: string }
  /** Completion (or, with quizzes, success) changed. LMS drivers commit on this. */
  | { type: 'trackingChange'; tracking: TrackingState }
  /** An audio object played to its end. */
  | { type: 'mediaComplete'; slideId: string; objectId: string }
  /** Focus left a text entry or dropdown, after a bound field wrote its variable (P9.2). */
  | { type: 'controlLosesFocus'; slideId: string; objectId: string }
  /** A slider or dial moved to a new value, after a bound variable was written (P9.4). */
  | { type: 'controlMoves'; slideId: string; objectId: string }
  /** The learner opened a spot of a 360° image (P9.10). */
  | { type: 'spotClicked'; slideId: string; objectId: string; spotId: string }
  /** The learner has now opened every spot of a 360° image (P9.10). */
  | { type: 'panoramaVisited'; slideId: string; objectId: string }
  /**
   * A free-draggable object's middle came over another object (`draggedOver`),
   * or was let go on it (`droppedOn`). The target is at the top of its layer (P9.7).
   */
  | { type: 'draggedOver' | 'droppedOn'; slideId: string; objectId: string; targetId: string }
  /** Two objects a trigger names began, or stopped, overlapping (P9.7). Ids in sorted order. */
  | {
      type: 'objectsIntersect' | 'objectsSeparate';
      slideId: string;
      objectId: string;
      otherId: string;
    }
  /**
   * An object's entrance or exit finished, or a run of one of its motion paths
   * (`path` is the path's id). `layerId` and `time` are where on its layer's
   * timeline that happened, when it was the playhead that got there.
   */
  | {
      type: 'animationComplete';
      slideId: string;
      objectId: string;
      animation: 'entrance' | 'exit' | 'path';
      path?: string;
      layerId: string;
      time?: number;
      /** For a path: how many seconds ago it finished (within the last tick). */
      lateBy?: number;
    }
  /**
   * The slide's question was submitted (docs/briefs/P7.1-question-model.md):
   * `tryAgain` while attempts remain, otherwise the final result; a survey
   * question is `answered` (docs/briefs/P7.3-survey-types.md).
   */
  | {
      type: 'questionSubmit';
      slideId: string;
      result: 'correct' | 'incorrect' | 'tryAgain' | 'answered';
      score: number;
      attempt: number;
    }
  /** Submit was pressed with nothing chosen. */
  | { type: 'questionUnanswered'; slideId: string }
  /** Something the author should know about in preview, such as a stopped trigger loop. */
  | { type: 'warning'; message: string }
  /** The learner asked to print a result (P7.7). */
  | { type: 'printResults'; summary: ResultSummary };

/** A result as `printResults` gives it, for a printable page (docs/briefs/P7.7-result-slides.md). */
export interface ResultSummary {
  course: string;
  result: string;
  kind: 'graded' | 'survey';
  score: number;
  max: number;
  percent: number;
  passPercent: number;
  passed: boolean;
  questions: {
    title: string;
    result: 'correct' | 'incorrect' | 'answered' | 'unanswered';
    score: number;
  }[];
}

export type ObjectInput = 'click' | 'doubleClick' | 'rightClick' | 'mouseEnter' | 'mouseLeave';

export type PointerKind =
  'enter' | 'leave' | 'down' | 'up' | 'click' | 'doubleClick' | 'rightClick';

export type EngineListener = (event: EngineEvent) => void;

/**
 * An object inside a group, as its group's view gives it: its state, whether it
 * shows, and what a field, control or 360° image needs drawn (the Phase 9
 * review: these work inside groups too).
 */
export interface ObjectPart {
  state: string;
  /** Its group is shown and on stage, and so is it, by its own time (B8). */
  visible: boolean;
  /** The playhead is inside its own time, and its group's (B8). */
  onStage: boolean;
  /** Its own entrance or exit under way (B8), as for an object at the top of a layer. */
  effect?: { phase: 'entrance' | 'exit'; time: number };
  /** Where its own motion paths have moved it, in stage units, when not zero (B8). */
  offset?: { x: number; y: number };
  value?: string;
  options?: string[];
  controlValue?: number;
  visitedSpots?: string[];
}

export interface ObjectView {
  id: string;
  /** The playhead is inside the object's time on the timeline. */
  onStage: boolean;
  /**
   * The state the object is drawn in: disabled or hidden if set; otherwise down
   * while pressed, hover while under the pointer, then selected or visited
   * (whichever was applied last), then the state it was last changed to.
   */
  state: string;
  /** On stage, not in the `hidden` state, and its layer is not hiding it. A renderer draws exactly these. */
  visible: boolean;
  /**
   * For a group: everything inside it, at any depth, by id: the state each is
   * drawn in, and whether it shows (a hidden part hides only itself).
   */
  parts?: Record<string, ObjectPart>;
  /**
   * The entrance or exit under way, and how many seconds into it (by
   * paragraph, into the whole sequence). Absent when neither is: the object
   * looks as it does. An exit that has finished stays here at its end.
   */
  effect?: { phase: 'entrance' | 'exit'; time: number };
  /** How far motion paths have moved the object, in stage units; absent when not at all. */
  offset?: { x: number; y: number };
  /** A text entry's or dropdown's value: what the learner typed or chose (P7.2). */
  value?: string;
  /** A slider's or dial's value (P9.4). */
  controlValue?: number;
  /** A 360° image's spots the learner has opened (P9.10). */
  visitedSpots?: string[];
  /** A question's dropdown: its options, in the order to show them (shuffled). */
  options?: string[];
  /** Part of a finished question: it shows its answer and takes no more. */
  locked?: true;
  /** A drag question's tile the learner can pick up now (P7.2); see `Engine.drop`. */
  draggable?: true;
  /** A hotspot picture: where the learner marked it, in stage units (P7.2). */
  mark?: { x: number; y: number };
  /**
   * Plain words drawn in place of the object's own, a paragraph a line: a
   * feedback message showing the picked choices' feedback (P7.5).
   */
  text?: string;
  /**
   * Under review (P7.5): `right` on (part of) the right answer, `chosen` on
   * what the learner chose or put that is not.
   */
  review?: 'right' | 'chosen';
}

export interface LayerView {
  id: string;
  isBase: boolean;
  /** Overlay layers are shown by `showLayer`; the base layer is always shown. */
  shown: boolean;
  /** Seconds. */
  playhead: number;
  duration: number;
  /** Paused by the caller, or (base layer) by an overlay that pauses it. */
  paused: boolean;
  ended: boolean;
  /** Overlay property: clicks on the base layer must be ignored while this layer is shown. */
  blocksBase: boolean;
  objects: ObjectView[];
  /** The layer's audio and video objects, inside groups too: what a player should be playing. */
  media: MediaView[];
  /**
   * Its transition under way: `in` as it is shown, `out` as it is hidden
   * (then `shown` is false, and it takes no input). `time` is seconds in.
   */
  transition?: Transition & { phase: 'in' | 'out'; time: number };
}

/** What one audio or video object should be doing now (docs/briefs/P6.1-audio.md). */
export interface MediaView {
  id: string;
  playing: boolean;
  /** Seconds into what it plays (for a video, from its trim start). */
  time: number;
  /** 0–1. */
  volume: number;
  /**
   * The captions showing now, overlapping ones joined by line breaks; null
   * when none is, or the media is stopped or finished (docs/briefs/P6.4-captions.md).
   */
  caption: string | null;
}

export interface EngineView {
  slideId: string | null;
  /** Position in course order, from 0; -1 with no slide. */
  slideIndex: number;
  slideCount: number;
  canNext: boolean;
  canPrevious: boolean;
  /** The player buttons the current slide shows (both when there is no slide). */
  controls: { previous: boolean; next: boolean };
  /** A lightbox is playing (P8.4): `slideId` is its slide, over `underSlideId`. */
  lightbox?: { underSlideId: string; controls: boolean };
  /** Base layer first, then shown overlays bottom to top. */
  layers: LayerView[];
  /** Current variable values by name, the built-in ones included. */
  variables: Record<string, VariableValue>;
  /**
   * The slide transition under way, if any (docs/briefs/P6.6-transitions.md):
   * seconds in, and the slide it comes from, which a player keeps drawing.
   */
  transition?: Transition & { time: number; fromSlideId: string };
  /**
   * The part of the stage the learner sees, in stage units and the stage's
   * shape, while a zoom region has zoomed in; absent when it is all of it.
   */
  camera?: { x: number; y: number; width: number; height: number };
  /** A freeform hotspot's mark on the slide, in stage units (P7.4). */
  mark?: { x: number; y: number };
  /** The running result timer: whole seconds left (P7.7). */
  timer?: { left: number };
  /** Under review, the question slide's result (P7.5). */
  review?: 'correct' | 'incorrect' | 'answered' | 'unanswered';
}

/** What a slide needs remembered so that it can be resumed. */
export interface SavedSlide {
  /** Object states that are not the object's initial state. */
  o?: Record<string, string>;
  /** Overlay layers that were shown. */
  l?: string[];
  /** Selected / visited marks per object, in the order applied: `s`, `v`, `sv`, `vs` or empty. */
  f?: Record<string, string>;
  /** Objects a script hid. */
  h?: string[];
  /** Playheads (seconds) that are not zero. */
  t?: Record<string, number>;
  /** Where motion paths had moved objects, in whole stage units. */
  m?: Record<string, [number, number]>;
  /** The spots opened in each 360° image (P9.10). */
  p?: Record<string, string[]>;
}

/**
 * The whole session in a form that can be stored (JSON). Keys are short and
 * defaults are left out because SCORM 1.2 suspend data is tiny.
 */
export interface SessionState {
  v: 1;
  /** Current slide id. */
  s?: string;
  /** Variables whose value differs from their default, by variable id. */
  x?: Record<string, VariableValue>;
  /** Visited slide ids. */
  vis?: string[];
  /** Seconds spent in the course so far. */
  e?: number;
  /** Present when the course has been completed. */
  c?: 1;
  /** Saved slides, for resuming. */
  sv?: Record<string, SavedSlide>;
  /** Questions answered or begun, by slide id. */
  q?: Record<string, SavedQuestion>;
  /** Each result slide reached: its score (`s`) out of the most (`m`), by slide id (P7.7). */
  res?: Record<string, { s: number; m: number }>;
  /** The course time (`e`) each result's timer started at, by result slide id (P7.7). */
  tm?: Record<string, number>;
  /** The questions each draw slide drew, by draw slide id, in play order (P7.6). */
  d?: Record<string, string[]>;
}

/** A question as far as the learner has got with it (docs/briefs/P7.1-question-model.md). */
export interface SavedQuestion {
  /** Attempts used. */
  a: number;
  /**
   * Finished: correct (`c`), incorrect (`i`), or a survey answered (`a`, P7.3).
   * Absent while it can still be answered.
   */
  r?: 'c' | 'i' | 'a';
  /** Points earned, once finished. */
  s?: number;
  /** The chosen choices (graded or survey), by position in the question, once finished. */
  c?: number[];
  /** The shuffled order, by position in the question, when shuffled. */
  o?: number[];
  /** What was typed or chosen in its parts, by position (P7.2). */
  v?: string[];
}

/** The modifier keys held with a key press. */
export interface KeyModifiers {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

export interface Engine {
  /** Move time on to `nowMs` (any steady clock, milliseconds). */
  tick(nowMs: number): void;
  next(): boolean;
  previous(): boolean;
  /** Throws for an unknown slide id. */
  jumpToSlide(slideId: string): void;
  /**
   * Play a scene slide as a lightbox over the current one, which waits
   * untouched (P8.4). False when it cannot be: a draw slide, or the slide under it.
   */
  openLightbox(slideId: string, controls?: boolean): boolean;
  /** Back to the slide under the lightbox, as it was. False when none is open. */
  closeLightbox(): boolean;
  /** Start the session again from the first slide, as the restart-course action does (P8.6). */
  restart(): void;
  /** Move a layer's playhead (clamped to its timeline), firing what it crosses. */
  seek(layerId: string, seconds: number): void;
  setPaused(layerId: string, paused: boolean): void;
  /**
   * Where a playing audio element is (its `currentTime`). The audio that is
   * its layer's time master moves the playhead with it, forward only; audio
   * playing on its own keeps its place. Anything else is ignored.
   */
  mediaTime(objectId: string, seconds: number): void;
  /**
   * The learner played or paused a video (or moved it) with the browser's own
   * controls, to `seconds` into what it plays. It then plays on its own, or
   * waits, from there.
   */
  mediaControl(objectId: string, playing: boolean, seconds: number): void;
  showLayer(layerId: string): void;
  hideLayer(layerId: string): void;
  /**
   * What the learner's pointer did to an object. Drives the built-in states:
   * hover while over, down while pressed, selected and visited on click.
   * Returns false when the object takes no input (disabled, hidden, off stage,
   * or under a layer that blocks the base), in which case nothing changed.
   */
  pointer(kind: PointerKind, objectId: string): boolean;
  /**
   * What the learner typed or chose in a text entry or dropdown (P7.2).
   * Returns false when it takes no input (off stage, or a finished question's).
   */
  input(objectId: string, value: string): boolean;
  /**
   * Focus left a text entry or dropdown (P9.2): a bound field writes its
   * variable, then `controlLosesFocus` is raised. False when it is not one.
   */
  blur(objectId: string): boolean;
  /**
   * The learner moved a slider or dial toward `value` (P9.4): it goes to the
   * nearest step in range. True when that is a new value.
   */
  moveControl(objectId: string, value: number): boolean;
  /**
   * The learner opened a spot of a 360° image (P9.10): it is marked visited and
   * its triggers run; opening the last unvisited one also says all are visited.
   * False when there is no such spot that takes input now.
   */
  openSpot(objectId: string, spotId: string): boolean;
  /**
   * The learner let go of a drag question's tile with its middle at (x, y), in
   * stage units (P7.2). On a place that takes it, it goes there: a word into
   * the blank, an item onto a target, a step into another's place (the two
   * swap); whatever was there goes back. Anywhere else it goes back.
   * An object the author made draggable (P9.7) stays where it is let go, or
   * goes back if it returns to start; the object under its middle is told.
   * Returns false when the object is not one that can be dragged now.
   */
  drop(objectId: string, x: number, y: number): boolean;
  /**
   * Submit the current slide's question, as its Submit button does (the player's
   * own Submit, P8.1). False when there is none to submit, or it moved on.
   */
  submitQuestion(): boolean;
  /**
   * Where a carried freeform drag item's middle is now, in stage units (P7.4),
   * or null when it is let go: the target under it is drawn in its Drag Over
   * state. A draggable object (P9.7) does the same for any object under it,
   * and its intersections are checked where it is carried.
   * Returns whether that changed what is drawn.
   */
  carry(objectId: string | null, x?: number, y?: number): boolean;
  /**
   * Where a draggable object can be dropped now, for dragging by keyboard
   * (P10.1): a drag question's blank, targets or other tiles, or the targets a
   * draggable object's triggers name. Empty when it is not draggable now.
   */
  dropTargets(objectId: string): string[];
  /**
   * The learner marked a hotspot question's picture at (x, y), in stage units
   * (P7.2). The spot under the mark, if any, is remembered for Submit, and the
   * mark itself is shown. Returns false unless it is an unfinished hotspot's
   * picture.
   */
  mark(x: number, y: number): boolean;
  /**
   * A key the learner pressed, with the modifiers held. On an unfinished
   * shortcut-key question (P7.4) the press is the answer, marked at once, and
   * nothing else happens: true. Otherwise it is for key-press triggers: false.
   */
  key(key: string, modifiers?: Partial<KeyModifiers>): boolean;
  /** The learner clicked the player's custom tab `tabId`: its triggers on the current slide run (P8.2). */
  playerTab(tabId: string): void;
  /** A state the object does not have is ignored. Returns whether the state changed. */
  setObjectState(objectId: string, stateId: string): boolean;
  getVariable(name: string): VariableValue | undefined;
  /** Throws for an unknown name, a built-in (read-only) variable, or a value of the wrong type. */
  setVariable(name: string, value: VariableValue): void;
  getView(): EngineView;
  on(listener: EngineListener): () => void;
  getState(): SessionState;
  /** Completion, success and progress, for LMS drivers and the player frame. */
  getTracking(): TrackingState;
}

export interface EngineOptions {
  /** A saved session to continue; the current slide is resumed. */
  restore?: SessionState;
  /**
   * The learner asked for less motion (docs/briefs/reduced-motion.md). The view
   * then shows a running motion path's object at the path's end, and zoom
   * regions without travel. Times and events are unchanged.
   */
  reducedMotion?: boolean;
  /** Random numbers (0 ≤ r < 1) for shuffling choices. Default `Math.random`. */
  random?: () => number;
  /**
   * Runs the code of an "execute JavaScript" action, at its place among the
   * triggers. The engine never runs code itself: the player supplies this, and
   * an engine without it (as in the editor) skips such actions. Anything it
   * throws becomes a `warning` event.
   */
  runScript?: (code: string, api: ScriptApi) => void;
}

/**
 * What a course's JavaScript can reach (documented in docs/player-api.md).
 * Keep it stable: published courses depend on it.
 */
export interface ScriptApi {
  /** A variable's value by name (ignoring case), built-in ones included; undefined if there is none. */
  getVar(name: string): VariableValue | undefined;
  /** Throws for an unknown or built-in variable, or a value of the wrong type. */
  setVar(name: string, value: VariableValue): void;
  /** An object on the current slide by its name, or null. */
  object(name: string): ScriptObject | null;
}

export interface ScriptObject {
  readonly name: string;
  /** The state it is drawn in. */
  readonly state: string;
  /** Whether the learner can see it now. */
  readonly visible: boolean;
  /** Change its state as a trigger would; false if it has no such state. */
  setState(stateId: string): boolean;
  /** Show or hide it, whatever its state. Hidden objects take no input. */
  show(): void;
  hide(): void;
}

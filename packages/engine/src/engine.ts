import {
  allSlides,
  BUILT_IN_VARIABLES,
  forEachObject,
  isBuiltInVariableName,
  isChoiceQuestion,
  choiceMarks,
  feedbackParts,
  isSurveyQuestion,
  keyComboText,
  NOT_A_SHORTCUT,
  pickedFrom,
  questionObjects,
  replaceVariableReferences,
  snapToStep,
  variableValueText,
} from '@vedraopus/model';
import type { BuiltInVariableName, FeedbackRole } from '@vedraopus/model';
import type {
  AudioObject,
  VideoObject,
  Layer,
  MotionPath,
  Question,
  Project,
  SceneObject,
  TextEntryObject,
  SliderObject,
  DialObject,
  Slide,
  Trigger,
  Transition,
  TriggerAction,
  VariableValue,
} from '@vedraopus/model';
import {
  conditionsPass,
  inEvaluationOrder,
  listensFor,
  MAX_CASCADE_DEPTH,
  nextValue,
  operandValue,
} from './triggers';
import type { ConditionWorld } from './triggers';
import { effectAt, effectLength, objectEnd, pathPositionAt } from './animation';
import type { Point } from './animation';
import { viewAt } from './camera';
import { drawAll, drawQuestions } from './draw';
import { bestScore, freePlace, markAnswer, shuffled } from './quiz';
import type { TrackingState } from './tracking';
import type {
  Engine,
  EngineEvent,
  EngineListener,
  EngineOptions,
  EngineView,
  LayerView,
  MediaView,
  KeyModifiers,
  ObjectPart,
  ObjectView,
  SavedQuestion,
  SavedSlide,
  ScriptApi,
  SessionState,
} from './types';

interface LayerRuntime {
  layer: Layer;
  isBase: boolean;
  shown: boolean;
  playhead: number;
  paused: boolean;
  ended: boolean;
  /** Ids of the objects currently on stage. */
  onStage: Set<string>;
  /** Its time-master audio reported since the last tick, so the wall clock does not move it. */
  masterReported: boolean;
  /** Seconds its master has been reporting without moving on: past MAX_STALL the clock takes over. */
  stalledFor: number;
  /**
   * Its transition under way (docs/briefs/P6.6-transitions.md): seconds in,
   * and for a hide, what was on stage, which stays drawn until it ends.
   */
  transition: { phase: 'in' | 'out'; time: number; onStage: Set<string> } | null;
}

/** One audio object's playback (docs/briefs/P6.1-audio.md). */
interface MediaRuntime {
  object: AudioObject | VideoObject;
  layer: LayerRuntime;
  /** `follow`: tied to the playhead. `free`: playing on its own. */
  mode: 'follow' | 'free' | 'paused' | 'stopped';
  /** Seconds into the sound, for every mode but `follow` (which takes it from the playhead). */
  time: number;
  /** Played to its end; stays stopped until played again or reset. */
  completed: boolean;
}

interface SlideRuntime {
  slide: Slide;
  base: LayerRuntime;
  overlays: LayerRuntime[];
  objectStates: Map<string, string>;
  /** Selected (`s`) and visited (`v`) marks per object, in the order applied. Only objects that differ from their start. */
  marks: Map<string, Mark[]>;
  /** Objects under the pointer, and objects being pressed. Never saved. */
  hover: Set<string>;
  down: Set<string>;
  /** Overlay ids shown at some point since this entry (for `resume` layers). */
  everShown: Set<string>;
  /** Objects a script hid, whatever their state. */
  scriptHidden: Set<string>;
  /** Every audio object on the slide, inside groups too, in document order. */
  media: Map<string, MediaRuntime>;
  /** The motion path each object is running now, if any (docs/briefs/P6.5-animations.md). */
  runs: Map<string, PathRun>;
  /** Where motion paths left objects (stage units), when not where they started. */
  offsets: Map<string, Point>;
  /** The layer each top-level object is on. */
  layerOfObject: Map<string, LayerRuntime>;
  /** What the learner typed or chose in text entries and dropdowns (P7.2), by object id. */
  inputs: Map<string, string>;
  /** Unbound sliders' and dials' values (P9.4), by object id; bound ones follow their variable. */
  controls: Map<string, number>;
  /** The spots opened in each 360° image (P9.10), by object id. */
  spots: Map<string, Set<string>>;
}

/** One run of a motion path. */
interface PathRun {
  path: MotionPath;
  layer: LayerRuntime;
  /** Added to the path's positions: zero, or for a relative start where the object was less the path's start. */
  base: Point;
  /** Seconds into the run. */
  time: number;
}

type Mark = 's' | 'v';

/**
 * How long a timeline waits for its time-master media to move on (buffering)
 * before the clock moves it instead (media that cannot play, say a file the
 * browser cannot seek in). Seconds.
 */
export const MAX_STALL = 2;

/** Seconds a sound or video plays: a video only between its trim points. */
export function playedLength(object: AudioObject | VideoObject): number {
  return object.type === 'video'
    ? object.props.trimEnd - object.props.trimStart
    : object.props.length;
}

/** Whether `object` is on stage with the playhead at `t`. `untilEnd` lasts to the timeline's end, inclusive. */
export function isOnStage(object: SceneObject, t: number): boolean {
  const { start, duration } = object.timing;
  return t >= start && (duration === 'untilEnd' || t < start + duration);
}

/**
 * The objects on stage at `t`, at any depth (docs/briefs/B8-group-member-animations.md): a
 * group's member is on stage while its group is and its own time has started and not ended.
 */
export function onStageAt(objects: readonly SceneObject[], t: number): Set<string> {
  const on = new Set<string>();
  const walk = (list: readonly SceneObject[]) => {
    for (const object of list) {
      if (!isOnStage(object, t)) continue;
      on.add(object.id);
      if (object.type === 'group') walk(object.children);
    }
  };
  walk(objects);
  return on;
}

/** Every object in a list, groups' members after their group, at any depth. */
function everyObjectIn(objects: readonly SceneObject[]): SceneObject[] {
  const all: SceneObject[] = [];
  forEachObject(objects, (object) => {
    all.push(object);
  });
  return all;
}

export function createEngine(project: Project, options: EngineOptions = {}): Engine {
  // The course order (docs/briefs/P7.6-banks-and-draws.md): the scenes' slides, each
  // draw slide replaced by the bank questions drawn for it this session.
  const draws = drawAll(project, options.restore?.d, options.random ?? Math.random);
  const bankSlides = new Map(
    project.banks.flatMap((bank) => bank.slides.map((slide) => [slide.id, slide] as const)),
  );
  const order: Slide[] = [];
  /** Where a jump to a draw slide lands: its first question, or the slide after it. */
  const drawLands = new Map<string, number>();
  for (const { slide } of allSlides(project)) {
    if (!slide.draw) {
      order.push(slide);
      continue;
    }
    drawLands.set(slide.id, order.length);
    for (const id of draws.get(slide.id) ?? []) order.push(bankSlides.get(id)!);
  }
  const slideIndex = new Map<string, number>([
    ...drawLands,
    ...order.map((slide, index) => [slide.id, index] as const),
  ]);
  const variableByName = new Map(project.variables.map((v) => [v.name.toLowerCase(), v]));
  const values = new Map<string, VariableValue>(project.variables.map((v) => [v.id, v.default]));
  const visited = new Set<string>();
  const saved = new Map<string, SavedSlide>();
  const listeners = new Set<EngineListener>();
  const pending: EngineEvent[] = [];
  let flushing = false;
  let lastNow: number | null = null;
  /** Seconds the course has been running, over the whole session. */
  let elapsed = 0;
  /** Once complete, always complete. */
  let completed = false;
  let current: SlideRuntime | null = null;

  // ----------------------------------------------------------------- events

  /**
   * Every event goes to two queues: the triggers', worked through first and
   * breadth-first (events raised by a trigger's action wait their turn, one
   * level deeper), and the listeners', told afterwards in order.
   */
  const triggerQueue: { event: EngineEvent; depth: number }[] = [];
  /** How deep the cascade being run is, or -1 when no trigger is running. */
  let runningDepth = -1;
  const emit = (event: EngineEvent) => {
    pending.push(event);
    triggerQueue.push({ event, depth: runningDepth + 1 });
  };
  const flush = () => {
    if (flushing) return;
    flushing = true;
    try {
      // Every change the engine is told of ends here: see which named pairs now overlap (P9.7).
      checkIntersections();
      runTriggers();
      while (pending.length > 0) {
        const event = pending.shift()!;
        for (const listener of [...listeners]) listener(event);
        // A listener may have made changes of its own: their triggers run before the next event is told.
        runTriggers();
      }
    } finally {
      flushing = false;
    }
  };

  // ----------------------------------------------------------------- layers

  const newLayer = (layer: Layer, isBase: boolean): LayerRuntime => ({
    layer,
    isBase,
    shown: isBase,
    playhead: 0,
    paused: false,
    ended: false,
    onStage: new Set(),
    masterReported: false,
    stalledFor: 0,
    transition: null,
  });

  const layersOf = (rt: SlideRuntime) => [rt.base, ...rt.overlays];
  const shownLayers = (rt: SlideRuntime) => layersOf(rt).filter((l) => l.shown);

  /**
   * Work out what is on stage at the layer's playhead and announce the changes.
   *
   * `starting`: the timeline has just started at `from`, so something waiting
   * for exactly that time (a cue point or "reaches" at 0 s) is reached too.
   * Objects leave, then enter; then cue points, then "reaches" times, each in time order.
   */
  const settle = (
    rt: SlideRuntime,
    layer: LayerRuntime,
    from: number,
    announce: boolean,
    starting = false,
  ) => {
    const passed = (time: number) =>
      (time > from || (starting && time === from)) && time <= layer.playhead;
    const slideId = rt.slide.id;
    const layerId = layer.layer.id;
    // At any depth (B8): a group's member is on stage while its group is and its own time is.
    const now = onStageAt(layer.layer.objects, layer.playhead);
    const everything = everyObjectIn(layer.layer.objects);
    const duration = layer.layer.timeline.duration;
    const finished = (objectId: string, animation: 'entrance' | 'exit', time: number) =>
      emit({ type: 'animationComplete', slideId, objectId, animation, layerId, time });
    if (announce) {
      // An exit finishes as its object's time ends, just before it leaves.
      for (const object of everything) {
        const end = objectEnd(object, duration);
        if (object.animations.exit && passed(end)) finished(object.id, 'exit', end);
      }
      for (const object of everything) {
        if (layer.onStage.has(object.id) && !now.has(object.id)) {
          emit({ type: 'objectLeave', slideId, layerId, objectId: object.id });
        }
      }
      for (const object of everything) {
        if (!layer.onStage.has(object.id) && now.has(object.id)) {
          emit({ type: 'objectEnter', slideId, layerId, objectId: object.id });
        }
      }
      for (const object of everything) {
        const { entrance } = object.animations;
        if (!entrance) continue;
        const done = object.timing.start + effectLength(object, entrance);
        // An entrance cut short by its object's end never finishes.
        if (passed(done) && done <= objectEnd(object, duration)) {
          finished(object.id, 'entrance', done);
        }
      }
      for (const cue of layer.layer.timeline.cuePoints) {
        if (passed(cue.time)) {
          emit({ type: 'cuePoint', slideId, layerId, cuePointId: cue.id });
        }
      }
      // Times triggers wait for on this layer ("when the timeline reaches 2 s").
      const times = new Set<number>();
      for (const trigger of rt.slide.triggers) {
        const { event } = trigger;
        if (event.type === 'timelineReaches' && event.layer === layerId) times.add(event.time);
      }
      for (const time of [...times].sort((a, b) => a - b)) {
        if (passed(time)) {
          emit({ type: 'timelineReaches', slideId, layerId, time });
        }
      }
    }
    layer.onStage = now;
    const atEnd = layer.playhead >= layer.layer.timeline.duration;
    if (atEnd && !layer.ended) {
      layer.ended = true;
      if (announce) emit({ type: 'timelineEnd', slideId, layerId });
    } else if (!atEnd) {
      layer.ended = false;
    }
  };

  const basePausedByOverlay = (rt: SlideRuntime) =>
    rt.overlays.some((l) => l.shown && l.layer.properties.pauseBaseTimeline);

  const isPaused = (rt: SlideRuntime, layer: LayerRuntime) =>
    layer.paused || (layer.isBase && basePausedByOverlay(rt));

  // ------------------------------------------------------------------ media

  /** Back to how it starts: with the timeline, or waiting for a trigger. */
  const resetMedia = (media: MediaRuntime) => {
    media.mode = media.object.props.startOn === 'timeline' ? 'follow' : 'stopped';
    media.time = 0;
    media.completed = false;
  };

  /** How far into the sound it is. Audio tied to the playhead ends where the object leaves the timeline. */
  const mediaPosition = (media: MediaRuntime): number => {
    if (media.mode !== 'follow') return media.time;
    const { start, duration } = media.object.timing;
    const end =
      duration === 'untilEnd'
        ? playedLength(media.object)
        : Math.min(duration, playedLength(media.object));
    return Math.min(end, Math.max(0, media.layer.playhead - start));
  };

  const layerRunning = (rt: SlideRuntime, layer: LayerRuntime) =>
    layer.shown && !isPaused(rt, layer);

  const mediaPlaying = (rt: SlideRuntime, media: MediaRuntime): boolean => {
    if (media.completed || !layerRunning(rt, media.layer)) return false;
    if (media.mode === 'free') return true;
    if (media.mode !== 'follow') return false;
    return (
      isOnStage(media.object, media.layer.playhead) &&
      mediaPosition(media) < playedLength(media.object)
    );
  };

  /** The playing audio tied to this layer's playhead that starts first: it keeps the layer's time. */
  const masterOf = (rt: SlideRuntime, layer: LayerRuntime): MediaRuntime | undefined => {
    let master: MediaRuntime | undefined;
    for (const media of rt.media.values()) {
      if (media.layer !== layer || media.mode !== 'follow' || !mediaPlaying(rt, media)) continue;
      if (!master || media.object.timing.start < master.object.timing.start) master = media;
    }
    return master;
  };

  /** Announce audio that has reached its end, once each. */
  const checkMediaEnds = (rt: SlideRuntime) => {
    for (const media of rt.media.values()) {
      if (media.completed || (media.mode !== 'follow' && media.mode !== 'free')) continue;
      if (mediaPosition(media) < playedLength(media.object)) continue;
      media.completed = true;
      if (media.mode === 'free') media.time = playedLength(media.object);
      emit({ type: 'mediaComplete', slideId: rt.slide.id, objectId: media.object.id });
    }
  };

  /** A video that starts on a click: play it from where it is, or pause it if it is playing. */
  // ------------------------------------------------------------- animations

  /** Where motion paths have moved an object to now, or null if nowhere. */
  const offsetOf = (rt: SlideRuntime, objectId: string): Point | null => {
    const run = rt.runs.get(objectId);
    if (run) {
      const at = pathPositionAt(run.path, run.time);
      return { x: run.base.x + at.x, y: run.base.y + at.y };
    }
    const rest = rt.offsets.get(objectId);
    return rest && (rest.x !== 0 || rest.y !== 0) ? { ...rest } : null;
  };

  /**
   * Where to draw an object: where it is, or with less motion, where a running
   * path will leave it. Only the view uses this; runs and saving use `offsetOf`.
   */
  const shownOffsetOf = (rt: SlideRuntime, objectId: string): Point | null => {
    const run = rt.runs.get(objectId);
    if (!run || !options.reducedMotion) return offsetOf(rt, objectId);
    const end = pathPositionAt(run.path, run.path.duration);
    return { x: run.base.x + end.x, y: run.base.y + end.y };
  };

  /**
   * Move running paths on by `seconds`: those `only` picks, or those on every
   * shown layer that is not paused. A run that reaches its end leaves the
   * object there and announces it.
   */
  const advanceRuns = (
    rt: SlideRuntime,
    seconds: number,
    only?: (objectId: string, run: PathRun) => boolean,
  ) => {
    if (seconds <= 0) return;
    for (const [objectId, run] of [...rt.runs]) {
      if (only ? !only(objectId, run) : !run.layer.shown || isPaused(rt, run.layer)) continue;
      run.time += seconds;
      if (run.time < run.path.duration) continue;
      const lateBy = run.time - run.path.duration;
      run.time = run.path.duration;
      rt.offsets.set(objectId, offsetOf(rt, objectId) ?? { x: 0, y: 0 });
      rt.runs.delete(objectId);
      emit({
        type: 'animationComplete',
        slideId: rt.slide.id,
        objectId,
        animation: 'path',
        path: run.path.id,
        layerId: run.layer.layer.id,
        lateBy,
      });
    }
  };

  /**
   * Start a run of one of an object's paths, in place of any it is running.
   * `credit`: seconds that have already gone by since what started it happened
   * (the playhead passed that point during this tick or seek).
   */
  const startRun = (rt: SlideRuntime, objectId: string, pathId: string, credit: number) => {
    // A group's member runs its own paths too (B8).
    const layer = treeOf(rt).layer.get(objectId);
    const path = objectsOf(rt)
      .find((object) => object.id === objectId)
      ?.animations.motionPaths.find((each) => each.id === pathId);
    if (!layer || !path) return;
    const now = offsetOf(rt, objectId) ?? { x: 0, y: 0 };
    const first = path.points[0]!;
    const base = path.relativeStart ? { x: now.x - first.x, y: now.y - first.y } : { x: 0, y: 0 };
    const run: PathRun = { path, layer, base, time: 0 };
    rt.runs.set(objectId, run);
    advanceRuns(rt, credit, (_, each) => each === run);
  };

  /** An object whose exit has played out while it is still on stage (it lasts until the end). */
  const hasExited = (layer: LayerRuntime, object: SceneObject): boolean => {
    const { exit } = object.animations;
    if (!exit) return false;
    const end = objectEnd(object, layer.layer.timeline.duration);
    return layer.playhead >= end;
  };

  /** Where on a layer's timeline an event happened, if the playhead got there. */
  const eventTime = (event: EngineEvent, layer: LayerRuntime): number | null => {
    if (!('layerId' in event) || event.layerId !== layer.layer.id) return null;
    switch (event.type) {
      case 'timelineStart':
        return 0;
      case 'timelineReaches':
        return event.time;
      case 'cuePoint':
        return (
          layer.layer.timeline.cuePoints.find((cue) => cue.id === event.cuePointId)?.time ?? null
        );
      case 'objectEnter':
        return (
          layer.layer.objects.find((object) => object.id === event.objectId)?.timing.start ?? null
        );
      case 'animationComplete':
        // A path's run ends on the clock, not the playhead: count back from now.
        return event.lateBy !== undefined ? layer.playhead - event.lateBy : (event.time ?? null);
      default:
        return null;
    }
  };

  const toggleOnClick = (rt: SlideRuntime, objectId: string) => {
    const media = rt.media.get(objectId);
    if (!media || media.object.type !== 'video' || media.object.props.startOn !== 'click') return;
    // With its controls showing, the browser plays and pauses it on a click itself
    // (and the player reports that): toggling here too would undo the click.
    if (media.object.props.controls) return;
    if (mediaPlaying(rt, media)) {
      media.time = mediaPosition(media);
      media.mode = 'paused';
    } else {
      const from = media.completed || media.mode === 'stopped' ? 0 : mediaPosition(media);
      media.mode = 'free';
      media.time = from;
      media.completed = false;
    }
  };

  /** Media under way: playing, or paused part way. Not stopped, not finished, not waiting for its time. */
  const mediaUnderWay = (media: MediaRuntime): boolean => {
    if (media.completed || media.mode === 'stopped') return false;
    if (media.mode === 'follow') {
      return (
        isOnStage(media.object, media.layer.playhead) &&
        mediaPosition(media) < playedLength(media.object)
      );
    }
    return true;
  };

  /** The captions at the media's place in its file (a video's trim start counts). */
  const captionOf = (media: MediaRuntime): string | null => {
    if (!mediaUnderWay(media) || media.object.props.captions.length === 0) return null;
    const offset = media.object.type === 'video' ? media.object.props.trimStart : 0;
    const at = offset + mediaPosition(media);
    const showing = media.object.props.captions.filter((cue) => cue.start <= at && at < cue.end);
    return showing.length > 0 ? showing.map((cue) => cue.text).join('\n') : null;
  };

  const viewMedia = (rt: SlideRuntime, layer: LayerRuntime): MediaView[] =>
    [...rt.media.values()]
      .filter((media) => media.layer === layer)
      .map((media) => ({
        id: media.object.id,
        playing: mediaPlaying(rt, media),
        time: mediaPosition(media),
        volume: media.object.props.volume,
        caption: captionOf(media),
      }));

  // ------------------------------------------------------------- slide enter

  const snapshot = (rt: SlideRuntime): SavedSlide => {
    const result: SavedSlide = {};
    const o: Record<string, string> = {};
    for (const [id, state] of rt.objectStates) o[id] = state;
    if (Object.keys(o).length > 0) result.o = o;
    const f: Record<string, string> = {};
    for (const [id, marks] of rt.marks) f[id] = marks.join('');
    if (Object.keys(f).length > 0) result.f = f;
    if (rt.scriptHidden.size > 0) result.h = [...rt.scriptHidden];
    const l = rt.overlays.filter((layer) => layer.shown).map((layer) => layer.layer.id);
    if (l.length > 0) result.l = l;
    const t: Record<string, number> = {};
    for (const layer of layersOf(rt)) {
      if (layer.playhead > 0 && (layer.isBase || layer.shown)) t[layer.layer.id] = layer.playhead;
    }
    if (Object.keys(t).length > 0) result.t = t;
    const m: Record<string, [number, number]> = {};
    for (const object of treeOf(rt).layer.keys()) {
      const at = offsetOf(rt, object);
      if (at && (Math.round(at.x) !== 0 || Math.round(at.y) !== 0)) {
        m[object] = [Math.round(at.x), Math.round(at.y)];
      }
    }
    if (Object.keys(m).length > 0) result.m = m;
    const p: Record<string, string[]> = {};
    for (const [id, opened] of rt.spots) if (opened.size > 0) p[id] = [...opened];
    if (Object.keys(p).length > 0) result.p = p;
    return result;
  };

  /** Every object on the slide, inside groups too. */
  const everyObjectOn = (slide: Slide): SceneObject[] => {
    const all: SceneObject[] = [];
    for (const layer of [slide.baseLayer, ...slide.layers]) {
      forEachObject(layer.objects, (object) => all.push(object));
    }
    return all;
  };

  const initialStates = (slide: Slide) =>
    new Map(everyObjectOn(slide).map((object) => [object.id, object.initialState]));

  const interactiveObjectIds = (slide: Slide) =>
    new Set(
      everyObjectOn(slide)
        .filter((o) => o.type === 'button')
        .map((o) => o.id),
    );

  const shouldResume = (slide: Slide, memory: SavedSlide | undefined, forced: boolean) => {
    if (!memory) return false;
    if (forced) return true;
    const mode = slide.properties.onRevisit;
    if (mode === 'resume') return true;
    if (mode === 'reset') return false;
    const interactive = interactiveObjectIds(slide);
    return [...Object.keys(memory.o ?? {}), ...Object.keys(memory.f ?? {})].some((id) =>
      interactive.has(id),
    );
  };

  const leaveSlide = () => {
    if (!current) return;
    saved.set(current.slide.id, snapshot(current));
    emit({ type: 'slideExit', slideId: current.slide.id });
    current = null;
  };

  const enterSlide = (slide: Slide, forcedResume = false) => {
    const memory = saved.get(slide.id);
    const resume = shouldResume(slide, memory, forcedResume);
    const rt: SlideRuntime = {
      slide,
      base: newLayer(slide.baseLayer, true),
      overlays: slide.layers.map((layer) => newLayer(layer, false)),
      objectStates: new Map(),
      marks: new Map(),
      hover: new Set(),
      down: new Set(),
      everShown: new Set(),
      scriptHidden: new Set(),
      inputs: new Map(),
      controls: new Map(),
      spots: new Map(),
      media: new Map(),
      runs: new Map(),
      offsets: new Map(),
      layerOfObject: new Map(),
    };
    for (const layer of layersOf(rt)) {
      for (const object of layer.layer.objects) rt.layerOfObject.set(object.id, layer);
    }
    for (const layer of layersOf(rt)) {
      forEachObject(layer.layer.objects, (object) => {
        if (object.type !== 'audio' && object.type !== 'video') return;
        const media: MediaRuntime = { object, layer, mode: 'stopped', time: 0, completed: false };
        resetMedia(media);
        rt.media.set(object.id, media);
      });
    }
    current = rt;
    const firstVisit = !visited.has(slide.id);
    visited.add(slide.id);
    if (firstVisit) checkCompletion();
    const initial = initialStates(slide);
    const known = new Set(initial.keys());

    if (resume && memory) {
      for (const [id, state] of Object.entries(memory.o ?? {})) {
        if (known.has(id)) rt.objectStates.set(id, state);
      }
      for (const [id, marks] of Object.entries(memory.f ?? {})) {
        if (known.has(id)) {
          rt.marks.set(
            id,
            [...marks].filter((m): m is Mark => m === 's' || m === 'v'),
          );
        }
      }
      for (const id of memory.h ?? []) if (known.has(id)) rt.scriptHidden.add(id);
      for (const [id, [x, y]] of Object.entries(memory.m ?? {})) {
        if (treeOf(rt).layer.has(id)) rt.offsets.set(id, { x, y });
      }
      for (const [id, opened] of Object.entries(memory.p ?? {})) {
        const panorama = objectsOf(rt).find((each) => each.id === id);
        if (panorama?.type !== 'panorama') continue;
        const spots = new Set(panorama.props.spots.map((spot) => spot.id));
        rt.spots.set(id, new Set(opened.filter((spot) => spots.has(spot))));
      }
      for (const layer of layersOf(rt)) {
        const at = memory.t?.[layer.layer.id];
        if (at !== undefined) layer.playhead = Math.min(at, layer.layer.timeline.duration);
      }
      for (const layer of rt.overlays) {
        if (memory.l?.includes(layer.layer.id)) {
          layer.shown = true;
          rt.everShown.add(layer.layer.id);
        }
      }
      for (const layer of layersOf(rt)) settle(rt, layer, layer.playhead, false);
      enterQuestion(rt, true);
      emit({ type: 'slideEnter', slideId: slide.id, resumed: true });
      return;
    }

    // A restored session continues its question even when the slide had nothing else to resume.
    enterQuestion(rt, forcedResume);
    enterResult(rt);
    startTimers(rt);
    emit({ type: 'slideEnter', slideId: slide.id, resumed: false });
    emit({ type: 'timelineStart', slideId: slide.id, layerId: slide.baseLayer.id });
    settle(rt, rt.base, 0, true, true);
  };

  // ---------------------------------------------------------------- questions

  /**
   * How far the learner has got with each question, by slide id
   * (docs/briefs/P7.1-question-model.md, P7.2-graded-types.md).
   */
  const questions = new Map<string, SavedQuestion>();
  const random = options.random ?? Math.random;

  /**
   * The choice objects the learner marks, in the question's order: graded or
   * survey picks, or a Likert question's points statement by statement.
   */
  const choiceObjects = (rt: SlideRuntime) => {
    const question = rt.slide.question;
    if (!question) return [];
    return choiceMarks(question).map((id) =>
      rt.slide.baseLayer.objects.find((object) => object.id === id),
    );
  };

  /** The objects the learner answers in, by part position: a text entry, or a dropdown per pair or step. */
  const inputObjects = (question: Question): string[] => {
    switch (question.kind) {
      case 'fillInBlank':
      case 'numeric':
      case 'shortAnswer':
      case 'essay':
      case 'howMany':
      case 'freeText':
        return question.entry ? [question.entry] : [];
      case 'matchingDropdown':
        return question.pairs.map((pair) => pair.select);
      case 'sequenceDropdown':
        return question.steps.map((step) => step.select);
      default:
        return [];
    }
  };

  /** The objects that take the learner's answer, which a finished question closes. */
  const answerObjects = (question: Question) =>
    new Set(
      questionObjects(question)
        .filter((part) => part.role !== 'prompt' && part.role !== 'submit button')
        .map((part) => part.id),
    );

  /** How many options are shuffled, for the kinds that shuffle: choices, matches, or steps. */
  const shuffleCount = (question: Question): number => {
    if (isChoiceQuestion(question) || question.kind === 'pickOne' || question.kind === 'pickMany') {
      return question.shuffle ? question.choices.length : 0;
    }
    if (question.kind === 'matchingDropdown') return question.shuffle ? question.pairs.length : 0;
    if (question.kind === 'sequenceDropdown') return question.steps.length;
    if (question.kind === 'matchingDrag') return question.shuffle ? question.pairs.length : 0;
    if (question.kind === 'sequenceDrag') return question.steps.length;
    return 0;
  };

  /** The tiles the learner drags, by part position (drag kinds only). */
  const dragTiles = (question: Question): string[] => {
    switch (question.kind) {
      case 'wordBank':
      case 'whichWord':
        return question.words.map((word) => word.object);
      case 'matchingDrag':
        return question.pairs.map((pair) => pair.item);
      case 'sequenceDrag':
        return question.steps.map((step) => step.object);
      case 'ranking':
      case 'freeDrag':
        return question.items.map((item) => item.object);
      default:
        return [];
    }
  };

  /**
   * Where a drag question's tiles are, by part position, as `markAnswer` takes
   * it: the word in the blank; the target each item is on; the steps in the
   * order they stand. Read from the question's record and checked, since a
   * resumed session may hold anything: what does not fit goes back.
   */
  const placements = (rt: SlideRuntime, question: Question): string[] => {
    const record = questions.get(rt.slide.id);
    const saved = record?.v ?? [];
    switch (question.kind) {
      case 'wordBank':
      case 'whichWord': {
        const placed = saved[0] ?? '';
        return [question.words.some((word) => word.object === placed) ? placed : ''];
      }
      case 'matchingDrag': {
        const targets = new Set(question.pairs.map((pair) => pair.target));
        const taken = new Set<string>();
        return question.pairs.map((_, index) => {
          const target = saved[index] ?? '';
          if (!targets.has(target) || taken.has(target)) return '';
          taken.add(target);
          return target;
        });
      }
      case 'freeDrag': {
        // Each item's place (`target|x|y`) or '' for home; a place on no known target is home.
        const targets = new Set(question.targets);
        return question.items.map((_, index) => {
          const value = saved[index] ?? '';
          const place = freePlace(value);
          return place && (place.target === '' || targets.has(place.target)) ? value : '';
        });
      }
      case 'sequenceDrag':
      case 'ranking': {
        // Ranking is not shuffled: unmoved, its tiles stand in the author's order.
        const ids = dragTiles(question);
        const whole =
          saved.length === ids.length &&
          new Set(saved).size === ids.length &&
          ids.every((id) => saved.includes(id));
        if (whole) return [...saved];
        // Not moved yet: the shuffled order; position i holds the step `o[i]`.
        const order = record?.o;
        if (order?.length === ids.length) return order.map((index) => ids[index]!);
        return ids;
      }
      default:
        return [];
    }
  };

  /** A hotspot's remembered answer: the spot id, then the mark's position. */
  const hotspotValues = (rt: SlideRuntime, question: Question): string[] =>
    question.kind === 'hotspot' || question.kind === 'freeHotspot'
      ? [...(questions.get(rt.slide.id)?.v ?? [])]
      : [];

  const middleOf = (object: SceneObject): Point => ({
    x: object.frame.x + object.frame.width / 2,
    y: object.frame.y + object.frame.height / 2,
  });

  /**
   * Where a drag question's tile is drawn: its middle on the middle of the
   * place it is in, or in its home place (matching items' homes are shuffled
   * when the question shuffles). Null for anything else, or a tile at home.
   */
  const placeOffset = (rt: SlideRuntime, objectId: string): Point | null => {
    const question = rt.slide.question;
    if (!question || !dragTiles(question).includes(objectId)) return null;
    const objects = rt.slide.baseLayer.objects;
    const own = objects.find((object) => object.id === objectId)!;
    const moveTo = (id: string | null | undefined): Point | null => {
      const there = id ? objects.find((object) => object.id === id) : undefined;
      if (!there) return null;
      const from = middleOf(own);
      const to = middleOf(there);
      return { x: to.x - from.x, y: to.y - from.y };
    };
    const now = placements(rt, question);
    switch (question.kind) {
      case 'wordBank':
      case 'whichWord':
        return now[0] === objectId ? moveTo(question.blank) : null;
      case 'matchingDrag': {
        const index = question.pairs.findIndex((pair) => pair.item === objectId);
        if (now[index]) return moveTo(now[index]);
        const order = question.shuffle ? questions.get(rt.slide.id)?.o : undefined;
        if (!order) return null;
        return moveTo(question.pairs[order.indexOf(index)]?.item);
      }
      case 'sequenceDrag':
      case 'ranking':
        return moveTo(dragTiles(question)[now.indexOf(objectId)]);
      case 'freeDrag': {
        // Its middle where it was put (a target's middle when snapped).
        const place = freePlace(now[question.items.findIndex((item) => item.object === objectId)]!);
        if (!place) return null;
        const from = middleOf(own);
        return { x: place.x - from.x, y: place.y - from.y };
      }
      default:
        return null;
    }
  };

  /** See `Engine.drop`. False when the object is not a tile that can be dragged now. */
  const dropTile = (objectId: string, x: number, y: number): boolean => {
    const rt = current;
    const question = rt?.slide.question;
    if (!rt || !question || questionClosed(rt)) return false;
    if (!dragTiles(question).includes(objectId)) return false;
    const objects = rt.slide.baseLayer.objects;
    const tile = objects.find((object) => object.id === objectId);
    if (!tile || !acceptsInput(rt, tile)) return false;
    /** Whether (x, y) is inside the object's frame, where it stands in the slide. */
    const over = (id: string | null) => {
      const frame = objects.find((object) => object.id === id)?.frame;
      return (
        !!frame &&
        x >= frame.x &&
        x <= frame.x + frame.width &&
        y >= frame.y &&
        y <= frame.y + frame.height
      );
    };
    const now = placements(rt, question);
    /** The freeform target the item was dropped on, for its "dropped on" triggers (B11). */
    let landed: string | null = null;
    switch (question.kind) {
      case 'wordBank':
      case 'whichWord':
        if (over(question.blank)) now[0] = objectId;
        else if (now[0] === objectId) now[0] = '';
        break;
      case 'matchingDrag': {
        const index = question.pairs.findIndex((pair) => pair.item === objectId);
        const target = question.pairs.map((pair) => pair.target).find((id) => over(id));
        if (target) {
          // A target holds one item: the one there goes back.
          now.forEach((on, other) => {
            if (on === target) now[other] = '';
          });
          now[index] = target;
        } else {
          now[index] = '';
        }
        break;
      }
      case 'freeDrag': {
        const index = question.items.findIndex((item) => item.object === objectId);
        const target = targetUnder(rt, question, x, y);
        if (target) {
          landed = target;
          // One item on each target: the one already there goes home (B11).
          if (question.onePerTarget) {
            now.forEach((place, other) => {
              if (other !== index && freePlace(place)?.target === target) now[other] = '';
            });
          }
          const at = question.snap
            ? middleOf(objects.find((each) => each.id === target)!)
            : { x, y };
          now[index] = `${target}|${Math.round(at.x)}|${Math.round(at.y)}`;
        } else {
          now[index] = question.returnToStart ? '' : `|${Math.round(x)}|${Math.round(y)}`;
        }
        break;
      }
      case 'sequenceDrag':
      case 'ranking': {
        // The places are where the steps' (or items') tiles stand in the slide.
        const from = now.indexOf(objectId);
        const to = dragTiles(question).findIndex((id) => over(id));
        if (to >= 0 && to !== from) [now[from], now[to]] = [now[to]!, now[from]!];
        break;
      }
      default:
        return false;
    }
    const record = questions.get(rt.slide.id) ?? { a: 0 };
    // A drop can change drawn states: a freeform item's Drop Correct or Incorrect (P7.4).
    changeStates(rt, () => questions.set(rt.slide.id, { ...record, v: now }));
    // Its "dropped on" triggers run, as a free-dragged object's do (B11).
    if (landed !== null) {
      emit({ type: 'droppedOn', slideId: rt.slide.id, objectId, targetId: landed });
    }
    return true;
  };

  /**
   * The freeform drag target under a point: the last of the question's targets
   * whose frame contains it (P7.4).
   */
  const targetUnder = (
    rt: SlideRuntime,
    question: Extract<Question, { kind: 'freeDrag' }>,
    x: number,
    y: number,
  ): string | null => {
    const objects = rt.slide.baseLayer.objects;
    for (let i = question.targets.length - 1; i >= 0; i--) {
      const frame = objects.find((object) => object.id === question.targets[i])?.frame;
      if (frame && x >= frame.x && x <= frame.x + frame.width && y >= frame.y) {
        if (y <= frame.y + frame.height) return question.targets[i]!;
      }
    }
    return null;
  };

  /** The target a carried freeform item is over now, drawn in its Drag Over state (P7.4). */
  let carriedOver: { slideId: string; target: string } | null = null;

  /** See `Engine.carry`. */
  const carryTile = (objectId: string | null, x = 0, y = 0): boolean => {
    const rt = current;
    if (!rt) return false;
    const question = rt.slide.question;
    let next: typeof carriedOver = null;
    if (objectId !== null && question?.kind === 'freeDrag' && !questionClosed(rt)) {
      if (dragTiles(question).includes(objectId)) {
        const target = targetUnder(rt, question, x, y);
        if (target) next = { slideId: rt.slide.id, target };
      }
    }
    if (next?.target === carriedOver?.target && next?.slideId === carriedOver?.slideId) {
      return false;
    }
    const changed = changeStates(rt, () => {
      carriedOver = next;
    });
    // Its "dragged over" triggers run, as a free-dragged object's do (B11).
    if (next !== null && objectId !== null) {
      emit({ type: 'draggedOver', slideId: rt.slide.id, objectId, targetId: next.target });
    }
    return changed || next !== null;
  };

  // ------------------------------------------------- free dragging (P9.7)

  /** Where the learner is carrying a free-draggable object now: its middle, in stage units. */
  let carrying: { slideId: string; id: string; x: number; y: number } | null = null;

  /**
   * An object the learner may drag outside a question's rules (P9.7): one at the
   * top of a layer with `drag` set, that is not a question's tile and takes input now.
   */
  const freeDraggable = (rt: SlideRuntime, object: SceneObject): boolean =>
    object.drag !== null &&
    rt.layerOfObject.has(object.id) &&
    !(rt.slide.question && dragTiles(rt.slide.question).includes(object.id)) &&
    acceptsInput(rt, object);

  /** The slide's free-draggable object with this id, if it can be dragged now. */
  const freeObject = (objectId: string): SceneObject | null => {
    const rt = current;
    const object = rt && objectsOf(rt).find((each) => each.id === objectId);
    return rt && object && freeDraggable(rt, object) ? object : null;
  };

  /** Whether an object is drawn now: its layer shown, on stage, and it and its groups not hidden. */
  const shownNow = (rt: SlideRuntime, object: SceneObject): boolean => {
    const chain = chainOf(rt, object);
    const top = chain[chain.length - 1]!;
    const layer = treeOf(rt).layer.get(object.id);
    if (!layer?.shown || !layer.onStage.has(top.id)) return false;
    // It and every group around it on stage, and none whose exit has played out (B8).
    if (chain.some((each) => !layer.onStage.has(each.id) || hasExited(layer, each))) return false;
    if (layer.isBase && rt.overlays.some((l) => l.shown && l.layer.properties.hideBaseObjects)) {
      return false;
    }
    return chain.every(
      (each) => explicitOf(rt, each) !== 'hidden' && !rt.scriptHidden.has(each.id),
    );
  };

  /**
   * An object's box where it is drawn now: moved by a motion path, an earlier
   * drop, a question's placing, or the learner carrying it (it, or the group it is in).
   */
  const boxOf = (rt: SlideRuntime, object: SceneObject) => {
    const chain = chainOf(rt, object);
    const top = chain[chain.length - 1]!;
    let dx: number;
    let dy: number;
    if (carrying && carrying.slideId === rt.slide.id && carrying.id === top.id) {
      const middle = middleOf(top);
      dx = carrying.x - middle.x;
      dy = carrying.y - middle.y;
    } else {
      // Paths move the object and each group around it (B8); a question's placing moves the top.
      const placed = shuffleOffset(rt, top.id) ?? placeOffset(rt, top.id);
      dx = placed?.x ?? 0;
      dy = placed?.y ?? 0;
      for (const each of chain) {
        const moved = offsetOf(rt, each.id);
        dx += moved?.x ?? 0;
        dy += moved?.y ?? 0;
      }
    }
    const { x, y, width, height } = object.frame;
    return { x: x + dx, y: y + dy, width, height };
  };

  /**
   * The target under a dragged object's middle: the topmost of the objects that
   * its "dragged over" and "dropped on" triggers name, at the top of a shown
   * layer, whose box contains the point (P9.7). A group counts as a whole. Only
   * named targets count, so an object above one cannot catch the drop (Luke,
   * session 76).
   */
  const objectUnder = (rt: SlideRuntime, dragged: string, x: number, y: number): string | null => {
    const named = new Set<string>();
    for (const { event } of rt.slide.triggers) {
      if (
        (event.type === 'draggedOver' || event.type === 'droppedOn') &&
        event.object === dragged
      ) {
        named.add(event.target);
      }
    }
    if (named.size === 0) return null;
    const layers = layersOf(rt);
    for (let l = layers.length - 1; l >= 0; l--) {
      const objects = layers[l]!.layer.objects;
      for (let i = objects.length - 1; i >= 0; i--) {
        const object = objects[i]!;
        if (object.id === dragged || !named.has(object.id) || !shownNow(rt, object)) continue;
        const box = boxOf(rt, object);
        if (x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height) {
          return object.id;
        }
      }
    }
    return null;
  };

  /** See `Engine.carry`, for a free-draggable object: the one under its middle shows Drag Over. */
  const carryFree = (rt: SlideRuntime, object: SceneObject, x: number, y: number): boolean => {
    carrying = { slideId: rt.slide.id, id: object.id, x, y };
    const target = objectUnder(rt, object.id, x, y);
    if (target === carriedOver?.target && carriedOver.slideId === rt.slide.id) return false;
    if (target === null && carriedOver === null) return false;
    const changed = changeStates(rt, () => {
      carriedOver = target === null ? null : { slideId: rt.slide.id, target };
    });
    if (target !== null) {
      emit({ type: 'draggedOver', slideId: rt.slide.id, objectId: object.id, targetId: target });
    }
    return changed || target !== null;
  };

  /**
   * See `Engine.drop`, for a free-draggable object: it stays where it was let go,
   * or with `returnToStart` goes back, and the object under its middle is told.
   */
  const dropFree = (rt: SlideRuntime, object: SceneObject, x: number, y: number) => {
    carrying = null;
    const target = objectUnder(rt, object.id, x, y);
    if (!object.drag?.returnToStart) {
      const middle = middleOf(object);
      rt.runs.delete(object.id);
      rt.offsets.set(object.id, { x: x - middle.x, y: y - middle.y });
    }
    if (target !== null) {
      emit({ type: 'droppedOn', slideId: rt.slide.id, objectId: object.id, targetId: target });
    }
  };

  /** The pairs of objects a slide's intersection triggers name, each once (P9.7). */
  const pairsCache = new WeakMap<Slide, [string, string][]>();
  const intersectionPairs = (slide: Slide): [string, string][] => {
    const known = pairsCache.get(slide);
    if (known) return known;
    const keys = new Map<string, [string, string]>();
    for (const { event } of slide.triggers) {
      if (event.type !== 'intersects' && event.type !== 'stopsIntersecting') continue;
      if (event.object === event.other) continue;
      const pair: [string, string] =
        event.object < event.other ? [event.object, event.other] : [event.other, event.object];
      keys.set(pair.join('|'), pair);
    }
    const pairs = [...keys.values()];
    pairsCache.set(slide, pairs);
    return pairs;
  };

  /** The named pairs that overlap on the current slide, as last checked. */
  let overlapping: { rt: SlideRuntime; pairs: Set<string> } | null = null;

  /**
   * Compare the named pairs' boxes with the last check and announce the pairs
   * that began or stopped overlapping. On a slide's first check nothing is
   * announced: objects that already overlap did not come to (P9.7).
   */
  const checkIntersections = () => {
    const rt = current;
    if (!rt) {
      overlapping = null;
      return;
    }
    const pairs = intersectionPairs(rt.slide);
    if (pairs.length === 0) return;
    const objects = new Map(objectsOf(rt).map((object) => [object.id, object]));
    const now = new Set<string>();
    for (const [a, b] of pairs) {
      const first = objects.get(a);
      const second = objects.get(b);
      if (!first || !second || !shownNow(rt, first) || !shownNow(rt, second)) continue;
      const p = boxOf(rt, first);
      const q = boxOf(rt, second);
      if (p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height) {
        if (q.y < p.y + p.height) now.add(`${a}|${b}`);
      }
    }
    const before = overlapping?.rt === rt ? overlapping.pairs : null;
    overlapping = { rt, pairs: now };
    if (!before) return;
    for (const [a, b] of pairs) {
      const key = `${a}|${b}`;
      if (now.has(key) === before.has(key)) continue;
      emit({
        type: now.has(key) ? 'objectsIntersect' : 'objectsSeparate',
        slideId: rt.slide.id,
        objectId: a,
        otherId: b,
      });
    }
  };

  /** A freeform drag item's drop state from where it is (P7.4), or null. */
  const dropStateOf = (rt: SlideRuntime, object: SceneObject): string | null => {
    const question = rt.slide.question;
    if (question?.kind !== 'freeDrag') return null;
    const index = question.items.findIndex((item) => item.object === object.id);
    if (index < 0) return null;
    // Held until the answer has been submitted, when the question says so (B11).
    if (question.dropStatesAfterSubmit && !((questions.get(rt.slide.id)?.a ?? 0) > 0)) return null;
    const place = freePlace(placements(rt, question)[index] ?? '');
    if (!place || place.target === '') return null;
    return place.target === question.items[index]!.target ? 'dropCorrect' : 'dropIncorrect';
  };

  /** Mark a hotspot picture: remember the spot under the point and the point itself. */
  const markAt = (x: number, y: number): boolean => {
    const rt = current;
    const question = rt?.slide.question;
    if (!rt || !question || questionClosed(rt)) return false;
    if (question.kind === 'freeHotspot') {
      // Freeform (P7.4): the whole slide is the picture, and the spots stay visible.
      if (x < 0 || y < 0 || x > project.stage.width || y > project.stage.height) return false;
      const spot = question.spots.find((each) => {
        const frame = rt.slide.baseLayer.objects.find((item) => item.id === each.object)?.frame;
        return (
          !!frame &&
          x >= frame.x &&
          x <= frame.x + frame.width &&
          y >= frame.y &&
          y <= frame.y + frame.height
        );
      });
      const record = questions.get(rt.slide.id) ?? { a: 0 };
      questions.set(rt.slide.id, {
        ...record,
        v: [spot?.id ?? '', String(Math.round(x)), String(Math.round(y))],
      });
      return true;
    }
    if (question.kind !== 'hotspot') return false;
    const pictureId = question.picture;
    const picture = rt.slide.baseLayer.objects.find((object) => object.id === pictureId);
    if (!picture || !acceptsInput(rt, picture)) return false;
    const inside = (object: SceneObject) =>
      x >= object.frame.x &&
      x <= object.frame.x + object.frame.width &&
      y >= object.frame.y &&
      y <= object.frame.y + object.frame.height;
    if (!inside(picture)) return false;
    const spot = question.spots.find((each) => {
      const object = rt.slide.baseLayer.objects.find((item) => item.id === each.object);
      return object && inside(object);
    });
    const record = questions.get(rt.slide.id) ?? { a: 0 };
    questions.set(rt.slide.id, {
      ...record,
      v: [spot?.id ?? '', String(Math.round(x)), String(Math.round(y))],
    });
    return true;
  };

  /**
   * Arriving at a question slide: a finished question shows its answer; an
   * unfinished one starts again, unless resumed.
   */
  const enterQuestion = (rt: SlideRuntime, resumed: boolean) => {
    const question = rt.slide.question;
    if (!question) return;
    // Under review, the answers are shown, not the feedback (P7.5).
    if (reviewing) hideFeedback(rt, question);
    const record = questions.get(rt.slide.id);
    const restoreValues = (values: readonly string[] | undefined) => {
      inputObjects(question).forEach((id, index) => {
        const value = values?.[index];
        if (value) rt.inputs.set(id, value);
      });
    };
    if (record?.r) {
      const chosen = new Set(record.c ?? []);
      choiceObjects(rt).forEach((object, index) => {
        if (object) setMarks(rt, object, chosen.has(index) ? ['s'] : []);
      });
      restoreValues(record.v);
      return;
    }
    if (resumed && record) {
      restoreValues(record.v);
      return;
    }
    const fresh: SavedQuestion = { a: 0 };
    const count = shuffleCount(question);
    if (count > 1) fresh.o = shuffled(count, random);
    questions.set(rt.slide.id, fresh);
  };

  const questionFinished = (rt: SlideRuntime) => !!questions.get(rt.slide.id)?.r;

  /** Review mode (docs/briefs/P7.5-feedback.md): every question shown, none answerable. */
  let reviewing = false;

  /** A question that takes no more answers: finished, or under review. */
  const questionClosed = (rt: SlideRuntime) => questionFinished(rt) || reviewing;

  /** A required question not yet finished keeps the learner from going on with Next. */
  const holdsNext = (rt: SlideRuntime | null) =>
    !!rt?.slide.question?.required && !questionClosed(rt);

  /**
   * A Likert answer as `markAnswer` takes it: for each statement, the position
   * on the scale of its chosen point, or '' (from the marks chosen, by position).
   */
  const likertValues = (question: Question, chosen: readonly number[]): string[] => {
    if (question.kind !== 'likert') return [];
    const columns = question.labels.length;
    return question.statements.map((_, row) => {
      const at = chosen.find((index) => index >= row * columns && index < (row + 1) * columns);
      return at === undefined ? '' : String(at - row * columns);
    });
  };

  /** What the learner has given so far, as `markAnswer` takes it. */
  const answerOf = (rt: SlideRuntime, question: Question) => {
    const objects = choiceObjects(rt);
    // Chosen marks by position over all of them (a Likert grid's too); ids for the picks.
    const picks = pickedFrom(question);
    const chosenIndexes = objects.flatMap((object, index) =>
      object && marksOf(rt, object).includes('s') ? [index] : [],
    );
    const values =
      dragTiles(question).length > 0
        ? placements(rt, question)
        : question.kind === 'hotspot' || question.kind === 'freeHotspot'
          ? hotspotValues(rt, question)
          : question.kind === 'likert'
            ? likertValues(question, chosenIndexes)
            : question.kind === 'freeKey'
              ? [...(questions.get(rt.slide.id)?.v ?? [])]
              : inputObjects(question).map((id) => rt.inputs.get(id) ?? '');
    return {
      chosenIndexes,
      values,
      answer: {
        chosen: chosenIndexes.flatMap((index) => picks[index]?.id ?? []),
        values,
      },
    };
  };

  /**
   * A key press on an unfinished shortcut-key question (P7.4): it is the answer,
   * kept as its text (`Ctrl+S`) and marked at once. False when it is not one.
   */
  const answerKey = (key: string, held: Partial<KeyModifiers>): boolean => {
    const rt = current;
    const question = rt?.slide.question;
    if (!rt || question?.kind !== 'freeKey' || questionClosed(rt)) return false;
    if (NOT_A_SHORTCUT.has(key)) return false;
    const pressed = keyComboText({
      key,
      ctrl: !!held.ctrl,
      alt: !!held.alt,
      shift: !!held.shift,
      meta: !!held.meta,
    });
    const record = questions.get(rt.slide.id) ?? { a: 0 };
    questions.set(rt.slide.id, { ...record, v: [pressed] });
    submitQuestion(rt);
    return true;
  };

  /** Check the answer (the `submitInteraction` action). Returns true when it moved to another slide. */
  const submitQuestion = (rt: SlideRuntime): boolean => {
    const question = rt.slide.question;
    if (!question || questionClosed(rt)) return false;
    const record = questions.get(rt.slide.id) ?? { a: 0 };
    const { chosenIndexes, values, answer } = answerOf(rt, question);
    const { answered, correct, score } = markAnswer(question, answer);
    if (!answered) {
      emit({ type: 'questionUnanswered', slideId: rt.slide.id });
      return false;
    }
    const attempt = record.a + 1;
    if (isSurveyQuestion(question)) {
      // A survey is finished once answered: nothing to get right, no score (P7.3).
      const next: SavedQuestion = { ...record, a: attempt, r: 'a' };
      if (choiceMarks(question).length > 0) next.c = chosenIndexes;
      // A Likert answer is its chosen points (`c`); the rest have their values.
      if (values.length > 0 && question.kind !== 'likert') next.v = values;
      questions.set(rt.slide.id, next);
      emit({ type: 'questionSubmit', slideId: rt.slide.id, result: 'answered', score: 0, attempt });
      // Its Thank You layer, if it has one; its button goes on (P7.5).
      if (showFeedback(rt, question, 'answered')) return false;
      return perform(rt, {
        type: 'jumpToSlide',
        target: question.branch.answered ?? { kind: 'next' },
      });
    }
    const last = correct || (question.attempts !== null && attempt >= question.attempts);
    const next: SavedQuestion = { ...record, a: attempt };
    if (last) {
      next.r = correct ? 'c' : 'i';
      next.s = score;
      if (choiceMarks(question).length > 0) next.c = chosenIndexes;
    }
    if (values.length > 0) next.v = values;
    // Submitting can show a drag question's held drop states (B11).
    if (question.kind === 'freeDrag') changeStates(rt, () => questions.set(rt.slide.id, next));
    else questions.set(rt.slide.id, next);
    emit({
      type: 'questionSubmit',
      slideId: rt.slide.id,
      result: last ? (correct ? 'correct' : 'incorrect') : 'tryAgain',
      score,
      attempt,
    });
    // The result's feedback layer, if it has one: the branch waits for its button (P7.5).
    if (showFeedback(rt, question, last ? (correct ? 'correct' : 'incorrect') : 'tryAgain')) {
      return false;
    }
    if (!last) return false;
    const target = correct ? question.branch.correct : question.branch.incorrect;
    return perform(rt, { type: 'jumpToSlide', target: target ?? { kind: 'next' } });
  };

  /** The question's feedback layer for `role`, if it gives feedback and has that layer. */
  const feedbackLayerOf = (rt: SlideRuntime, question: Question, role: FeedbackRole) => {
    if (question.feedback.by === 'none') return null;
    const part = feedbackParts(question).find((each) => each.role === role)?.part;
    return part && rt.slide.layers.some((layer) => layer.id === part.layer) ? part : null;
  };

  /** Show the result's feedback layer (docs/briefs/P7.5-feedback.md). False when there is none. */
  const showFeedback = (rt: SlideRuntime, question: Question, role: FeedbackRole): boolean => {
    const part = feedbackLayerOf(rt, question, role);
    if (!part) return false;
    perform(rt, { type: 'showLayer', layer: part.layer });
    return true;
  };

  /** Close any of the question's feedback layers that is showing. */
  const hideFeedback = (rt: SlideRuntime, question: Question) => {
    for (const { part } of feedbackParts(question)) {
      if (rt.overlays.some((each) => each.layer.id === part.layer && each.shown)) {
        perform(rt, { type: 'hideLayer', layer: part.layer });
      }
    }
  };

  /** The `reviewQuiz` action: review mode on, from the course's first question. */
  const startReview = (rt: SlideRuntime): boolean => {
    reviewing = true;
    // From a result slide, its own questions only, and back to it at the end (P7.7).
    reviewScope = rt.slide.result
      ? { from: rt.slide.id, questions: resultQuestions(rt.slide) }
      : null;
    const firstId = reviewScope ? reviewScope.questions[0] : order.find((s) => s.question)?.id;
    if (!firstId) return false;
    const first = order[slideIndex.get(firstId) ?? -1];
    if (!first) return false;
    if (first.id === rt.slide.id) {
      hideFeedback(rt, first.question!);
      return false;
    }
    return perform(rt, { type: 'jumpToSlide', target: { kind: 'slide', slide: first.id } });
  };

  /** Review of one result's questions (P7.7): the result slide and its questions, in order. */
  let reviewScope: { from: string; questions: string[] } | null = null;

  /** The `exitReview` action: review off, back to the result slide it started from. */
  const exitReview = (rt: SlideRuntime): boolean => {
    if (!reviewing) return false;
    reviewing = false;
    const from = reviewScope?.from;
    reviewScope = null;
    if (!from || from === rt.slide.id) return false;
    return perform(rt, { type: 'jumpToSlide', target: { kind: 'slide', slide: from } });
  };

  /** The course order made again from the draws (after a retry draws anew). */
  const rebuildOrder = () => {
    order.length = 0;
    drawLands.clear();
    for (const { slide } of allSlides(project)) {
      if (!slide.draw) {
        order.push(slide);
        continue;
      }
      drawLands.set(slide.id, order.length);
      for (const id of draws.get(slide.id) ?? []) order.push(bankSlides.get(id)!);
    }
    slideIndex.clear();
    for (const [id, at] of drawLands) slideIndex.set(id, at);
    order.forEach((slide, index) => slideIndex.set(slide.id, index));
  };

  /**
   * The `retryQuiz` action (P7.7): the result's draws drawn again, its
   * questions, their slides' memory, its result and its timer cleared, and the
   * learner taken to its first question. With `retryIncorrectOnly` (B11), the
   * questions answered correctly keep their answers, the draws are kept, and the
   * learner is taken to the first question to answer again.
   */
  const retryQuiz = (rt: SlideRuntime): boolean => {
    const result = rt.slide.result;
    if (!result) return false;
    const onlyWrong = result.kind === 'graded' && result.retryIncorrectOnly;
    const before = new Set(resultQuestions(rt.slide));
    for (const [drawId, drawn] of onlyWrong ? [] : draws) {
      if (!drawn.some((id) => before.has(id))) continue;
      const drawSlide = sceneSlideById.get(drawId)!;
      const bank = project.banks.find((each) => each.id === drawSlide.draw!.bank);
      const taken = new Set(
        [...draws].filter(([other]) => other !== drawId).flatMap(([, ids]) => ids),
      );
      draws.set(
        drawId,
        drawQuestions(
          drawSlide.draw!,
          (bank?.slides ?? []).map((slide) => slide.id),
          taken,
          options.random ?? Math.random,
        ),
      );
    }
    rebuildOrder();
    const after = resultQuestions(rt.slide);
    const kept = new Set(onlyWrong ? after.filter((id) => questions.get(id)?.r === 'c') : []);
    for (const id of [...before, ...after]) {
      if (kept.has(id)) continue;
      questions.delete(id);
      saved.delete(id);
    }
    results.delete(rt.slide.id);
    timers.delete(rt.slide.id);
    reviewing = false;
    reviewScope = null;
    const first = after.find((id) => !kept.has(id));
    if (!first) return false;
    return perform(rt, { type: 'jumpToSlide', target: { kind: 'slide', slide: first } });
  };

  /** The `printResults` action (P7.7): the result as a summary, for the player to print. */
  const printResults = (rt: SlideRuntime): boolean => {
    const shown = shownResult();
    if (!shown) return false;
    emit({
      type: 'printResults',
      summary: {
        course: project.title,
        result: shown.slide.title,
        kind: shown.slide.result!.kind,
        score: shown.score,
        max: shown.max,
        percent: shown.percent,
        passPercent: shown.slide.result!.passPercent,
        passed: shown.passed,
        questions: shown.questions.map((id) => {
          const slide = order[slideIndex.get(id)!]!;
          const record = questions.get(id);
          return {
            title: slide.title,
            result:
              record?.r === 'c'
                ? 'correct'
                : record?.r === 'i'
                  ? 'incorrect'
                  : record?.r === 'a'
                    ? 'answered'
                    : 'unanswered',
            score: record?.s ?? 0,
          } as const;
        }),
      },
    });
    void rt;
    return false;
  };

  // ------------------------------------------------------------------- timers

  /** When each result's timer started, in course time (P7.7). */
  const timers = new Map<string, number>(Object.entries(options.restore?.tm ?? {}));

  /** The timed results not yet reached whose questions include `slideId`. */
  const timedFor = (slideId: string) =>
    allSlides(project)
      .map(({ slide }) => slide)
      .filter(
        (slide) =>
          slide.result?.timer && !results.has(slide.id) && resultQuestions(slide).includes(slideId),
      );

  /** Arriving at a question of a timed result starts its timer, once. */
  const startTimers = (rt: SlideRuntime) => {
    if (reviewing) return;
    for (const slide of timedFor(rt.slide.id)) {
      if (!timers.has(slide.id)) timers.set(slide.id, elapsed);
    }
  };

  /** Seconds left on a timer, rounded up; the whole time before it starts. */
  const timeLeft = (slide: Slide) => {
    const seconds = slide.result?.timer?.seconds ?? 0;
    const started = timers.get(slide.id);
    return started === undefined ? seconds : Math.max(0, Math.ceil(seconds - (elapsed - started)));
  };

  /** The running timer the learner is under now, if any. */
  const runningTimer = () => {
    if (!current || reviewing) return undefined;
    return timedFor(current.slide.id).find((slide) => timers.has(slide.id));
  };

  /** After time moves on: a timer run out takes the learner to its result slide. */
  const checkTimers = (secondsBefore: number) => {
    const slide = runningTimer();
    if (!slide) return;
    const left = timeLeft(slide);
    if (
      Math.ceil(slide.result!.timer!.seconds - (secondsBefore - timers.get(slide.id)!)) !== left
    ) {
      emit({
        type: 'variableChange',
        variableId: 'builtin:ResultTimeLeft',
        name: 'ResultTimeLeft',
        value: left,
      });
    }
    if (left <= 0 && current) {
      goTo(order[slideIndex.get(slide.id) ?? -1] ?? current.slide);
    }
  };

  /**
   * What review shows on the slide's answer objects (P7.5): `right` on what is
   * (part of) the right answer, `chosen` on what the learner chose or put that
   * is not. Survey questions have nothing right or wrong, so nothing.
   */
  const reviewMarks = (rt: SlideRuntime): Map<string, 'right' | 'chosen'> => {
    const marks = new Map<string, 'right' | 'chosen'>();
    const question = rt.slide.question;
    if (!reviewing || !question || isSurveyQuestion(question)) return marks;
    const record = questions.get(rt.slide.id);
    const fold = (text: string, exact: boolean) =>
      exact ? text.trim() : text.trim().toLowerCase();
    const entry = (id: string | null, right: boolean) => {
      if (id && (rt.inputs.get(id) ?? '') !== '') marks.set(id, right ? 'right' : 'chosen');
    };
    if ('choices' in question) {
      // Choice and freeform pick kinds: the right ones, and wrong ones picked.
      const objects = choiceObjects(rt);
      question.choices.forEach((choice, index) => {
        const picked = !!objects[index] && marksOf(rt, objects[index]).includes('s');
        if (choice.correct) marks.set(choice.object, 'right');
        else if (picked) marks.set(choice.object, 'chosen');
      });
      return marks;
    }
    const values = answerOf(rt, question).values;
    switch (question.kind) {
      case 'fillInBlank':
      case 'freeText':
        entry(
          question.entry,
          question.answers.some(
            (each) =>
              fold(each, question.caseSensitive) === fold(values[0] ?? '', question.caseSensitive),
          ),
        );
        break;
      case 'numeric':
        entry(question.entry, record?.r === 'c');
        break;
      case 'matchingDropdown':
        question.pairs.forEach((pair, i) => {
          if (values[i]) marks.set(pair.select, values[i] === pair.match ? 'right' : 'chosen');
        });
        break;
      case 'sequenceDropdown':
        question.steps.forEach((step, i) => {
          if (values[i]) marks.set(step.select, values[i] === step.text ? 'right' : 'chosen');
        });
        break;
      case 'wordBank':
        for (const word of question.words) {
          if (word.correct) marks.set(word.object, 'right');
          else if (values[0] === word.object) marks.set(word.object, 'chosen');
        }
        break;
      case 'matchingDrag':
        question.pairs.forEach((pair, i) => {
          if (values[i]) marks.set(pair.item, values[i] === pair.target ? 'right' : 'chosen');
        });
        break;
      case 'sequenceDrag':
        question.steps.forEach((step, i) => {
          const at = values[i];
          if (at) marks.set(at, at === step.object ? 'right' : 'chosen');
        });
        break;
      case 'freeDrag':
        question.items.forEach((item, i) => {
          if (!values[i]) return;
          const on = values[i]!.split('|')[0] ?? '';
          marks.set(item.object, on === (item.target ?? '') ? 'right' : 'chosen');
        });
        break;
      case 'hotspot':
      case 'freeHotspot': {
        const marked = values[0] ?? '';
        for (const spot of question.spots) {
          if (spot.correct) marks.set(spot.object, 'right');
          else if (spot.id === marked) marks.set(spot.object, 'chosen');
        }
        break;
      }
      case 'freeKey':
        break;
    }
    return marks;
  };

  /** A question slide's result as review shows it (P7.5). */
  const reviewResult = (rt: SlideRuntime): EngineView['review'] => {
    if (!reviewing || !rt.slide.question) return undefined;
    const result = questions.get(rt.slide.id)?.r;
    return result === 'c'
      ? 'correct'
      : result === 'i'
        ? 'incorrect'
        : result === 'a'
          ? 'answered'
          : 'unanswered';
  };

  /**
   * The `continueQuestion` action: close the feedback layer showing, then take
   * the finished question's branch, or leave the learner to try again.
   */
  const continueQuestion = (rt: SlideRuntime): boolean => {
    const question = rt.slide.question;
    if (!question) return false;
    for (const { part } of feedbackParts(question)) {
      if (rt.overlays.some((each) => each.layer.id === part.layer && each.shown)) {
        perform(rt, { type: 'hideLayer', layer: part.layer });
      }
    }
    const result = questions.get(rt.slide.id)?.r;
    if (!result) return false;
    const target =
      result === 'a' && isSurveyQuestion(question)
        ? question.branch.answered
        : !isSurveyQuestion(question)
          ? result === 'c'
            ? question.branch.correct
            : question.branch.incorrect
          : null;
    return perform(rt, { type: 'jumpToSlide', target: target ?? { kind: 'next' } });
  };

  /**
   * By-choice feedback (P7.5): the words a feedback layer's message shows in
   * place of its own, the picked choices' feedback a line each; null when
   * the question is not by choice or nothing picked has feedback.
   */
  const choiceFeedbackText = (rt: SlideRuntime, objectId: string): string | null => {
    const question = rt.slide.question;
    if (!question || !isChoiceQuestion(question) || question.feedback.by !== 'choice') return null;
    const { correct, incorrect } = question.feedback;
    if (objectId !== correct?.message && objectId !== incorrect?.message) return null;
    const objects = choiceObjects(rt);
    const words = question.choices
      .filter((_, index) => objects[index] && marksOf(rt, objects[index]).includes('s'))
      .map((choice) => choice.feedback.trim())
      .filter((each) => each !== '');
    return words.length > 0 ? words.join('\n') : null;
  };

  /** Where shuffled choices are drawn: each in the place of the one its turn gave it. */
  const shuffleOffset = (rt: SlideRuntime, objectId: string): Point | null => {
    const question = rt.slide.question;
    if (!question || !('choices' in question) || !('shuffle' in question) || !question.shuffle) {
      return null;
    }
    const order = questions.get(rt.slide.id)?.o;
    if (!order) return null;
    const objects = choiceObjects(rt);
    const own = objects.findIndex((object) => object?.id === objectId);
    if (own < 0) return null;
    const slot = order.indexOf(own);
    const here = objects[own]!.frame;
    const there = objects[slot]?.frame;
    return there ? { x: there.x - here.x, y: there.y - here.y } : null;
  };

  /**
   * What a text entry or dropdown shows: what the learner gave, a dropdown's
   * options in their shuffled order, and whether a finished question has
   * closed it.
   */
  const inputView = (
    rt: SlideRuntime,
    object: SceneObject,
  ): Pick<ObjectView, 'value' | 'options' | 'locked' | 'draggable'> => {
    if (object.type !== 'textEntry' && object.type !== 'dropdown') return {};
    const view: Pick<ObjectView, 'value' | 'options' | 'locked'> = {
      // A bound field shows its variable, unless the learner is typing in it (P9.2).
      value: rt.inputs.get(object.id) ?? boundText(object),
    };
    const question = rt.slide.question;
    if (question && answerObjects(question).has(object.id)) {
      if (questionClosed(rt)) view.locked = true;
      const order = questions.get(rt.slide.id)?.o;
      if (object.type === 'dropdown' && order) {
        const options =
          question.kind === 'matchingDropdown'
            ? question.pairs.map((pair) => pair.match)
            : question.kind === 'sequenceDropdown'
              ? question.steps.map((step) => step.text)
              : null;
        if (options) view.options = order.map((i) => options[i]!).filter(Boolean);
      }
    }
    return view;
  };

  /**
   * A slider's or dial's value (P9.4): its variable's, at the nearest step,
   * when bound; else its own, from its initial value.
   */
  const controlValue = (rt: SlideRuntime, object: SliderObject | DialObject): number => {
    const { variable } = object.props;
    const value =
      variable !== null
        ? values.get(variable)
        : (rt.controls.get(object.id) ?? object.props.initial);
    return snapToStep(object.props, typeof value === 'number' ? value : object.props.initial);
  };

  /**
   * The learner moved a slider or dial (P9.4): to a step within its range. A
   * new value writes a bound variable, then raises `controlMoves`.
   */
  const moveControl = (objectId: string, wanted: number): boolean => {
    const rt = current;
    const object = rt && objectsOf(rt).find((each) => each.id === objectId);
    if (!rt || !object || (object.type !== 'slider' && object.type !== 'dial')) return false;
    if (!acceptsInput(rt, object)) return false;
    const value = snapToStep(object.props, wanted);
    if (value === controlValue(rt, object)) return false;
    if (object.props.variable !== null) assignVariable(object.props.variable, value);
    else rt.controls.set(objectId, value);
    emit({ type: 'controlMoves', slideId: rt.slide.id, objectId });
    return true;
  };

  /** A bound data-entry field's variable as text (P9.2); empty when it is not bound. */
  const boundText = (object: SceneObject): string => {
    if (object.type !== 'textEntry' || object.props.variable === null) return '';
    const value = values.get(object.props.variable);
    return value === undefined ? '' : variableValueText(value);
  };

  /**
   * Focus left a text entry or dropdown (P9.2). A bound field writes its
   * variable from what was typed, then forgets it, so it shows the variable
   * again; then `controlLosesFocus` is raised, so its triggers see the value.
   */
  const blurField = (objectId: string): boolean => {
    const rt = current;
    const object = rt && objectsOf(rt).find((each) => each.id === objectId);
    if (!rt || !object || (object.type !== 'textEntry' && object.type !== 'dropdown')) return false;
    if (object.type === 'textEntry' && object.props.variable !== null) {
      // Nothing typed is the variable as it was: writing it again changes nothing.
      const value = fieldValue(object, rt.inputs.get(objectId) ?? boundText(object));
      if (value !== null) assignVariable(object.props.variable, value);
      const question = rt.slide.question;
      // A question still reads what was typed; any other bound field shows its variable again.
      if (!question || !inputObjects(question).includes(objectId)) rt.inputs.delete(objectId);
    }
    emit({ type: 'controlLosesFocus', slideId: rt.slide.id, objectId });
    return true;
  };

  /**
   * What a bound field writes (P9.2): the text as it is; or a number, read
   * locale-neutrally, blank as 0, kept within the field's limits. Null for
   * what is not a number.
   */
  const fieldValue = (object: TextEntryObject, text: string): VariableValue | null => {
    if (!object.props.numeric) return text;
    const trimmed = text.trim();
    if (trimmed === '') return 0;
    if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(trimmed)) return null;
    let number = Number(trimmed);
    if (!Number.isFinite(number)) return null;
    if (object.props.min !== null) number = Math.max(object.props.min, number);
    if (object.props.max !== null) number = Math.min(object.props.max, number);
    return number;
  };

  /** What the learner typed or chose in a text entry or dropdown. False when it takes no input. */
  const takeInput = (objectId: string, value: string): boolean => {
    const rt = current;
    // On any layer: a data-entry field may be on an overlay (P9.2).
    const object = rt && objectsOf(rt).find((each) => each.id === objectId);
    if (!rt || !object || (object.type !== 'textEntry' && object.type !== 'dropdown')) return false;
    if (!acceptsInput(rt, object)) return false;
    // An essay keeps what SCORM 2004 keeps of a long answer; one line, less (P7.3).
    const most = object.type === 'textEntry' && object.props.multiline ? 4000 : 1000;
    const text = value.slice(0, most);
    if (text === '') rt.inputs.delete(objectId);
    else rt.inputs.set(objectId, text);
    const question = rt.slide.question;
    if (question) {
      const ids = inputObjects(question);
      if (ids.includes(objectId)) {
        const record = questions.get(rt.slide.id) ?? { a: 0 };
        questions.set(rt.slide.id, { ...record, v: ids.map((id) => rt.inputs.get(id) ?? '') });
      }
    }
    return true;
  };

  /** The slide transition under way, if any: it plays on the engine clock, from the slide left. */
  let slideTransition: { transition: Transition; time: number; from: string } | null = null;

  // ------------------------------------------------- restart, email, seek (P8.6)

  /** Move a shown layer's playhead, clamped to its length, as the seekbar does. */
  const seekLayer = (rt: SlideRuntime, layer: LayerRuntime, seconds: number) => {
    const from = layer.playhead;
    layer.playhead = Math.min(layer.layer.timeline.duration, Math.max(0, seconds));
    // Moving on counts as time passing for the paths running on this layer;
    // moving back leaves them where they are.
    advanceRuns(rt, layer.playhead - from, (_, run) => run.layer === layer);
    settle(rt, layer, Math.min(from, layer.playhead), true);
  };

  /** Text with its %Variable% references filled in from the session. */
  const withVariables = (text: string) =>
    replaceVariableReferences(text, (name) => {
      if (isBuiltInVariableName(name))
        return variableValueText(builtIn(name as BuiltInVariableName));
      const variable = variableByName.get(name.toLowerCase());
      return variable ? variableValueText(values.get(variable.id)!) : undefined;
    });

  /** A `mailto:` link for a send-email action, its words filled in and encoded. */
  const mailtoLink = (action: { to: string; subject: string; body: string }) => {
    const fields = [
      ['subject', withVariables(action.subject)],
      ['body', withVariables(action.body)],
    ].filter(([, value]) => value !== '');
    const query = fields.map(([key, value]) => `${key}=${encodeURIComponent(value!)}`).join('&');
    return `mailto:${encodeURIComponent(action.to.trim()).replace(/%40/g, '@')}${query ? `?${query}` : ''}`;
  };

  /**
   * Start the session again from the first slide (P8.6): variables, slides
   * seen and their memory, answers, results, timers and draws all as new.
   * Completion stays: an LMS cannot take it back.
   */
  const restartCourse = () => {
    // Leave where the learner is, as any move does; its memory is cleared below.
    if (under) closeLightbox();
    leaveSlide();
    slideTransition = null;
    const changed = project.variables.filter(
      (variable) => values.get(variable.id) !== variable.default,
    );
    for (const variable of project.variables) values.set(variable.id, variable.default);
    visited.clear();
    saved.clear();
    questions.clear();
    results.clear();
    timers.clear();
    reviewing = false;
    reviewScope = null;
    const fresh = drawAll(project, undefined, options.random ?? Math.random);
    draws.clear();
    for (const [id, drawn] of fresh) draws.set(id, drawn);
    rebuildOrder();
    for (const variable of changed) {
      emit({
        type: 'variableChange',
        variableId: variable.id,
        name: variable.name,
        value: variable.default,
      });
    }
    const first = order[0];
    if (first) enterSlide(first);
  };

  // ---------------------------------------------------------------- lightbox

  /**
   * The slide under an open lightbox, frozen as it was (P8.4, plan section 5):
   * only `current`, the lightbox, plays. Null when no lightbox is open.
   */
  let under: SlideRuntime | null = null;
  /** Whether the open lightbox has Previous and Next. */
  let lightboxControls = false;
  const sceneSlides = new Map(
    project.scenes.flatMap((scene) => scene.slides).map((slide) => [slide.id, slide]),
  );

  /** Play `slideId` over the current slide, or in place of the lightbox open now. */
  const openLightbox = (slideId: string, controls: boolean): boolean => {
    const slide = sceneSlides.get(slideId);
    const host = under ?? current;
    if (!slide || slide.draw || !host || slide.id === host.slide.id) return false;
    if (under) {
      leaveSlide();
    } else {
      under = current;
      current = null;
    }
    slideTransition = null;
    lightboxControls = controls;
    enterSlide(slide);
    return true;
  };

  /** Back to the slide under the lightbox, as it was. */
  const closeLightbox = (): boolean => {
    if (!under) return false;
    leaveSlide();
    current = under;
    under = null;
    lightboxControls = false;
    return true;
  };

  /** The slide a lightbox with controls moves to: before or after it in the course, never the one under it. */
  const lightboxNeighbour = (step: 1 | -1): Slide | undefined => {
    if (!under || !current || !lightboxControls) return undefined;
    let index = slideIndex.get(current.slide.id) ?? -1;
    for (;;) {
      index += step;
      const slide = order[index];
      if (!slide || slide.id !== under.slide.id) return slide;
    }
  };

  const goTo = (slide: Slide, forcedResume = false) => {
    // Going anywhere from a lightbox closes it first (P8.4).
    if (under) closeLightbox();
    const from = current?.slide.id ?? null;
    leaveSlide();
    enterSlide(slide, forcedResume);
    const transition = slide.properties.transition;
    slideTransition =
      transition && from !== null && from !== slide.id ? { transition, time: 0, from } : null;
  };

  /**
   * Move transitions on by `seconds`, whatever the timelines are doing. One
   * that has played out ends; a layer that was being hidden then goes.
   */
  const advanceTransitions = (rt: SlideRuntime | null, seconds: number) => {
    if (slideTransition) {
      slideTransition.time += seconds;
      if (slideTransition.time >= slideTransition.transition.duration) slideTransition = null;
    }
    if (!rt) return;
    for (const layer of rt.overlays) {
      const { transition } = layer;
      const own = layer.layer.properties.transition;
      if (!transition) continue;
      transition.time += seconds;
      if (!own || transition.time >= own.duration) layer.transition = null;
    }
  };

  /**
   * Start a layer's transition in or out. Turned round part way, it starts as
   * far into the new direction as it had got in the old, so it does not jump.
   */
  const startLayerTransition = (layer: LayerRuntime, phase: 'in' | 'out') => {
    const own = layer.layer.properties.transition;
    if (!own) {
      layer.transition = null;
      return;
    }
    const was = layer.transition;
    const time = was && was.phase !== phase ? Math.max(0, own.duration - was.time) : 0;
    layer.transition = {
      phase,
      time,
      onStage: phase === 'out' ? new Set(layer.onStage) : new Set(),
    };
  };

  // -------------------------------------------------------------------- time

  const advanceLayer = (rt: SlideRuntime, layer: LayerRuntime, seconds: number) => {
    if (isPaused(rt, layer) || layer.ended || seconds <= 0) return;
    const from = layer.playhead;
    layer.playhead = Math.min(layer.layer.timeline.duration, from + seconds);
    settle(rt, layer, from, true);
  };

  const tick = (nowMs: number) => {
    const delta = lastNow === null ? 0 : Math.max(0, nowMs - lastNow);
    lastNow = lastNow === null ? nowMs : Math.max(lastNow, nowMs);
    const rt = current;
    if (delta === 0) return flush();
    const seconds = delta / 1000;
    const wholeBefore = Math.floor(elapsed);
    const before = elapsed;
    elapsed += seconds;
    checkTimers(before);
    if (Math.floor(elapsed) !== wholeBefore) {
      // Text showing %ElapsedSeconds% follows it like any other variable.
      emit({
        type: 'variableChange',
        variableId: 'builtin:ElapsedSeconds',
        name: 'ElapsedSeconds',
        value: Math.floor(elapsed),
      });
    }
    if (!rt) {
      advanceTransitions(null, seconds);
      return flush();
    }
    const baseWasEnded = rt.base.ended;
    for (const layer of shownLayers(rt)) {
      // A layer whose time-master audio is reporting moves with the audio, not the clock.
      const masterReported = layer.masterReported;
      layer.masterReported = false;
      if (masterReported && masterOf(rt, layer)) {
        // Waiting for media that is buffering, but not for media that never plays on.
        layer.stalledFor += seconds;
        if (layer.stalledFor <= MAX_STALL) continue;
      }
      advanceLayer(rt, layer, seconds);
    }
    for (const media of rt.media.values()) {
      if (media.mode === 'free' && mediaPlaying(rt, media)) {
        media.time = Math.min(playedLength(media.object), media.time + seconds);
      }
    }
    advanceRuns(rt, seconds);
    advanceTransitions(rt, seconds);
    checkMediaEnds(rt);
    flush();
    if (
      current === rt &&
      !baseWasEnded &&
      rt.base.ended &&
      rt.slide.properties.advance === 'auto' &&
      !holdsNext(rt)
    ) {
      navigate(1);
    }
  };

  // -------------------------------------------------------------- navigation

  const navigate = (step: 1 | -1): boolean => {
    if (!current) return false;
    // In a lightbox: its own Previous and Next, if it has them (P8.4).
    if (under) {
      const target = lightboxNeighbour(step);
      if (!target) return false;
      openLightbox(target.id, true);
      flush();
      return true;
    }
    // Reviewing one result (P7.7): among its questions, and on from the last back to it.
    if (reviewing && reviewScope) {
      const list = reviewScope.questions;
      const id = list[list.indexOf(current.slide.id) + step];
      if (id === undefined) {
        if (step === 1) {
          exitReview(current);
          flush();
          return true;
        }
        return false;
      }
      goTo(order[slideIndex.get(id)!]!);
      flush();
      return true;
    }
    const target = order[(slideIndex.get(current.slide.id) ?? -1) + step];
    if (!target) return false;
    goTo(target);
    flush();
    return true;
  };

  // ------------------------------------------------------------------- layers

  const requireLayer = (layerId: string): LayerRuntime => {
    const found = current && layersOf(current).find((l) => l.layer.id === layerId);
    if (!found) throw new Error(`No layer "${layerId}" on the current slide`);
    return found;
  };

  const hideOverlay = (rt: SlideRuntime, layer: LayerRuntime) => {
    if (!layer.shown) return;
    startLayerTransition(layer, 'out');
    layer.shown = false;
    for (const id of layer.onStage) {
      emit({ type: 'objectLeave', slideId: rt.slide.id, layerId: layer.layer.id, objectId: id });
    }
    layer.onStage = new Set();
    emit({ type: 'layerHide', slideId: rt.slide.id, layerId: layer.layer.id });
  };

  /** Show an overlay layer, applying its properties. Does not tell listeners (see `flush`). */
  const showOverlay = (rt: SlideRuntime, layer: LayerRuntime) => {
    if (layer.isBase || layer.shown) return;
    if (layer.layer.properties.hideOtherLayers) {
      for (const other of rt.overlays) if (other !== layer) hideOverlay(rt, other);
    }
    const layerId = layer.layer.id;
    const resumes = layer.layer.properties.onRevisit === 'resume' && rt.everShown.has(layerId);
    if (!resumes) {
      layer.playhead = 0;
      layer.ended = false;
      layer.onStage = new Set();
      for (const media of rt.media.values()) if (media.layer === layer) resetMedia(media);
      // Its objects, groups' members too, start again from their own places.
      forEachObject(layer.layer.objects, (object) => {
        rt.runs.delete(object.id);
        rt.offsets.delete(object.id);
      });
    }
    startLayerTransition(layer, 'in');
    layer.shown = true;
    rt.everShown.add(layerId);
    emit({ type: 'layerShow', slideId: rt.slide.id, layerId });
    if (!resumes) {
      emit({ type: 'timelineStart', slideId: rt.slide.id, layerId });
    }
    settle(rt, layer, layer.playhead, true, !resumes);
  };

  // ------------------------------------------------------------------ states

  /** Every object on the slide, groups' contents included. */
  const objectsOf = (rt: SlideRuntime) => everyObjectOn(rt.slide);
  /** Each object's enclosing group, and the layer its outermost group (or itself) sits on. */
  const treeCache = new WeakMap<
    SlideRuntime,
    { parent: Map<string, SceneObject>; layer: Map<string, LayerRuntime> }
  >();
  const treeOf = (rt: SlideRuntime) => {
    const known = treeCache.get(rt);
    if (known) return known;
    const parent = new Map<string, SceneObject>();
    const layer = new Map<string, LayerRuntime>();
    for (const runtime of layersOf(rt)) {
      const walk = (objects: readonly SceneObject[], group: SceneObject | null) => {
        for (const object of objects) {
          if (group) parent.set(object.id, group);
          layer.set(object.id, runtime);
          if (object.type === 'group') walk(object.children, object);
        }
      };
      walk(runtime.layer.objects, null);
    }
    const tree = { parent, layer };
    treeCache.set(rt, tree);
    return tree;
  };
  /** The object, then each group around it, outermost last. */
  const chainOf = (rt: SlideRuntime, object: SceneObject): SceneObject[] => {
    const chain = [object];
    for (let up = treeOf(rt).parent.get(object.id); up; up = treeOf(rt).parent.get(up.id)) {
      chain.push(up);
    }
    return chain;
  };
  const has = (object: SceneObject, stateId: string) =>
    object.states.some((state) => state.id === stateId);

  /** An object that starts selected or visited starts with that mark, on top of normal. */
  const startMarks = (object: SceneObject): Mark[] =>
    object.initialState === 'selected' ? ['s'] : object.initialState === 'visited' ? ['v'] : [];
  const marksOf = (rt: SlideRuntime, object: SceneObject) =>
    rt.marks.get(object.id) ?? startMarks(object);
  const setMarks = (rt: SlideRuntime, object: SceneObject, marks: Mark[]) => {
    if (marks.join('') === startMarks(object).join('')) rt.marks.delete(object.id);
    else rt.marks.set(object.id, marks);
  };
  /** The state last set on the object itself, under any marks. */
  const explicitOf = (rt: SlideRuntime, object: SceneObject) =>
    rt.objectStates.get(object.id) ??
    (startMarks(object).length > 0 ? 'normal' : object.initialState);

  const shownState = (rt: SlideRuntime, object: SceneObject): string => {
    const explicit = explicitOf(rt, object);
    if (explicit === 'disabled' || explicit === 'hidden') return explicit;
    if (rt.down.has(object.id) && has(object, 'down')) return 'down';
    if (rt.hover.has(object.id) && has(object, 'hover')) return 'hover';
    // Freeform drag and drop (P7.4): a target under a carried item, then an item's drop.
    if (
      carriedOver?.target === object.id &&
      carriedOver.slideId === rt.slide.id &&
      has(object, 'dragOver')
    ) {
      return 'dragOver';
    }
    const dropped = dropStateOf(rt, object);
    if (dropped && has(object, dropped)) return dropped;
    const marks = marksOf(rt, object);
    for (let i = marks.length - 1; i >= 0; i--) {
      const stateId = marks[i] === 's' ? 'selected' : 'visited';
      if (has(object, stateId)) return stateId;
    }
    return explicit;
  };

  /** Make a change to states and announce every object whose drawn state it altered. */
  const changeStates = (rt: SlideRuntime, change: () => void): boolean => {
    const objects = objectsOf(rt);
    const before = objects.map((object) => shownState(rt, object));
    change();
    let changed = false;
    objects.forEach((object, index) => {
      const state = shownState(rt, object);
      if (state === before[index]) return;
      changed = true;
      emit({ type: 'objectStateChange', slideId: rt.slide.id, objectId: object.id, state });
    });
    return changed;
  };

  const mark = (rt: SlideRuntime, object: SceneObject, which: Mark, on: boolean) => {
    const rest = marksOf(rt, object).filter((each) => each !== which);
    setMarks(rt, object, on ? [...rest, which] : rest);
  };

  /** Select an object; in a button set, that deselects the others. */
  const select = (rt: SlideRuntime, object: SceneObject) => {
    if (object.buttonSet !== null) {
      for (const other of objectsOf(rt)) {
        if (other !== object && other.buttonSet === object.buttonSet) mark(rt, other, 's', false);
      }
    }
    mark(rt, object, 's', true);
  };

  const acceptsInput = (rt: SlideRuntime, object: SceneObject): boolean => {
    const chain = chainOf(rt, object);
    const outermost = chain[chain.length - 1]!;
    const layer = treeOf(rt).layer.get(object.id);
    if (!layer || !layer.shown || !layer.onStage.has(outermost.id)) return false;
    // It and every group around it on stage (B8). After an exit has played out it is gone,
    // though its time has not ended (`untilEnd`).
    if (chain.some((each) => !layer.onStage.has(each.id) || hasExited(layer, each))) return false;
    // A finished question's answer can no longer be changed.
    if (questionClosed(rt) && answerObjects(rt.slide.question!).has(outermost.id)) return false;
    // A disabled or hidden group takes the input of everything inside it.
    for (const each of chain) {
      const explicit = explicitOf(rt, each);
      if (explicit === 'disabled' || explicit === 'hidden') return false;
      if (rt.scriptHidden.has(each.id)) return false;
    }
    if (layer.isBase && rt.overlays.some((l) => l.shown && l.layer.properties.blockBaseClicks)) {
      return false;
    }
    return true;
  };

  /** Change an object's state per section 5. Does not tell listeners. */
  const applyState = (rt: SlideRuntime, object: SceneObject, stateId: string): boolean => {
    if (!has(object, stateId)) return false;
    const objectId = object.id;
    return changeStates(rt, () => {
      const explicit = (value: string) => {
        if (value === object.initialState && startMarks(object).length === 0) {
          rt.objectStates.delete(objectId);
        } else rt.objectStates.set(objectId, value);
      };
      if (stateId === 'selected') select(rt, object);
      else if (stateId === 'visited') mark(rt, object, 'v', true);
      else if (stateId === 'normal') {
        // Back to normal clears selected and visited as well.
        setMarks(rt, object, []);
        explicit('normal');
      } else {
        explicit(stateId);
        if (stateId === 'disabled' || stateId === 'hidden') {
          rt.hover.delete(objectId);
          rt.down.delete(objectId);
        }
      }
    });
  };

  /** Give a project variable a value of its own type. Does not tell listeners. */
  const assignVariable = (variableId: string, value: VariableValue) => {
    const variable = project.variables.find((each) => each.id === variableId);
    if (!variable || typeof value !== typeof variable.default) return;
    if (values.get(variableId) === value) return;
    values.set(variableId, value);
    emit({ type: 'variableChange', variableId, name: variable.name, value });
  };

  // --------------------------------------------------------------- variables

  const builtIn = (name: BuiltInVariableName): number | boolean => {
    switch (name) {
      case 'ResultScore':
        return shownResult()?.score ?? 0;
      case 'ResultMaxScore':
        return shownResult()?.max ?? 0;
      case 'ResultPercent':
        return shownResult()?.percent ?? 0;
      case 'ResultPassPercent':
        return shownResult()?.slide.result!.passPercent ?? 0;
      case 'ResultPassed':
        return shownResult()?.passed ?? false;
      case 'ResultTimeLeft': {
        const slide = runningTimer() ?? shownResult()?.slide;
        return slide?.result?.timer ? timeLeft(slide) : 0;
      }
      case 'SlideNumber':
        return current ? (slideIndex.get(current.slide.id) ?? -1) + 1 : 0;
      case 'SlideCount':
        return order.length;
      case 'SlidesViewed':
        return visited.size;
      case 'PercentComplete':
        return order.length === 0 ? 0 : Math.round((visited.size / order.length) * 100);
      case 'ElapsedSeconds':
        return Math.floor(elapsed);
    }
  };
  const builtInNamed = (name: string) =>
    BUILT_IN_VARIABLES.find((each) => each.name.toLowerCase() === name.toLowerCase())?.name;

  // ---------------------------------------------------------------- triggers

  const world = (rt: SlideRuntime): ConditionWorld => ({
    variable: (id) => values.get(id),
    objectState: (id) => {
      const object = objectsOf(rt).find((each) => each.id === id);
      return object ? shownState(rt, object) : undefined;
    },
  });

  /** A trigger counts only while what owns it is on the slide's shown layers. */
  const isActive = (rt: SlideRuntime, trigger: Trigger): boolean => {
    if (!trigger.enabled) return false;
    const { owner } = trigger;
    if (owner.kind === 'slide') return owner.id === rt.slide.id;
    if (owner.kind === 'layer') return layersOf(rt).some((l) => l.shown && l.layer.id === owner.id);
    return treeOf(rt).layer.get(owner.id)?.shown ?? false;
  };

  /** Carry out one action. Returns true when it moved to another slide. */
  const perform = (rt: SlideRuntime, action: TriggerAction): boolean => {
    switch (action.type) {
      case 'changeState': {
        const object = objectsOf(rt).find((each) => each.id === action.object);
        if (object) applyState(rt, object, action.state);
        return false;
      }
      case 'showLayer':
      case 'hideLayer': {
        const layer = rt.overlays.find((each) => each.layer.id === action.layer);
        if (layer) {
          if (action.type === 'showLayer') showOverlay(rt, layer);
          else hideOverlay(rt, layer);
        }
        return false;
      }
      case 'openLightbox':
        return openLightbox(action.slide, action.controls);
      case 'closeLightbox':
        return closeLightbox();
      case 'jumpToSlide': {
        const { target } = action;
        // From a lightbox, next and previous are from the slide under it (P8.4).
        const here = slideIndex.get((under ?? rt).slide.id) ?? -1;
        const slide =
          target.kind === 'slide'
            ? order[slideIndex.get(target.slide) ?? -1]
            : order[here + (target.kind === 'next' ? 1 : -1)];
        if (!slide) return false;
        goTo(slide);
        return true;
      }
      case 'setVariable': {
        const variable = project.variables.find((each) => each.id === action.variable);
        const operand = operandValue(action.operand, world(rt));
        if (!variable || operand === undefined) return false;
        const value = nextValue(variable, values.get(variable.id)!, action.operator, operand);
        if (value !== undefined) assignVariable(variable.id, value);
        return false;
      }
      case 'toggleVariable': {
        const value = values.get(action.variable);
        if (typeof value === 'boolean') assignVariable(action.variable, !value);
        return false;
      }
      case 'pauseTimeline':
      case 'resumeTimeline': {
        const layer = layersOf(rt).find((each) => each.layer.id === action.layer);
        if (layer) layer.paused = action.type === 'pauseTimeline';
        return false;
      }
      case 'playMedia':
      case 'pauseMedia':
      case 'stopMedia': {
        const media = rt.media.get(action.object);
        if (!media) return false;
        if (action.type === 'playMedia') {
          // Already playing with the timeline: nothing to do.
          if (media.mode === 'follow' && mediaPlaying(rt, media)) return false;
          const from = media.completed || media.mode === 'stopped' ? 0 : mediaPosition(media);
          media.mode = 'free';
          media.time = from;
          media.completed = false;
        } else if (action.type === 'pauseMedia') {
          media.time = mediaPosition(media);
          media.mode = 'paused';
        } else {
          media.mode = 'stopped';
          media.time = 0;
          media.completed = false;
        }
        return false;
      }
      case 'openUrl':
        emit({ type: 'openUrl', url: action.url });
        return false;
      // The rest of plan 4.2's actions (docs/briefs/P8.6-course-actions.md).
      case 'restartCourse':
        restartCourse();
        return true;
      case 'exitCourse':
        emit({ type: 'exitCourse' });
        return false;
      case 'sendEmail':
        emit({ type: 'openUrl', url: mailtoLink(action) });
        return false;
      case 'printSlide':
        emit({ type: 'print' });
        return false;
      case 'openFile':
        emit({ type: 'openFile', asset: action.asset });
        return false;
      case 'setFocus':
        emit({ type: 'focus', slideId: rt.slide.id, objectId: action.object });
        return false;
      case 'seekTimeline': {
        const layer = layersOf(rt).find((each) => each.layer.id === action.layer);
        if (layer?.shown) seekLayer(rt, layer, action.time);
        return false;
      }
      case 'submitInteraction':
        return submitQuestion(rt);
      case 'continueQuestion':
        return continueQuestion(rt);
      case 'reviewQuiz':
        return startReview(rt);
      // P7.7 step B gives these their behaviour.
      case 'exitReview':
        return exitReview(rt);
      case 'retryQuiz':
        return retryQuiz(rt);
      case 'printResults':
        return printResults(rt);
      case 'moveAlongPath': {
        const layer = treeOf(rt).layer.get(action.object);
        if (!layer) return false;
        const at = runningEvent ? eventTime(runningEvent, layer) : null;
        startRun(
          rt,
          action.object,
          action.path,
          at === null ? 0 : Math.max(0, layer.playhead - at),
        );
        return false;
      }
      case 'completeCourse':
        complete();
        return false;
      case 'executeJavaScript': {
        // The host runs it (the player); the engine only offers the API.
        if (!options.runScript) return false;
        try {
          options.runScript(action.code, scriptApi(rt));
        } catch (error) {
          emit({
            type: 'warning',
            message: `A trigger's JavaScript failed: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
        // A script may have moved to another slide (it cannot today, but stay safe).
        return current !== rt;
      }
    }
  };

  // ---------------------------------------------------------------- tracking

  const tracking = (): TrackingState => {
    const rule = project.tracking.completion;
    const reached = rule.kind === 'result' ? results.get(rule.slide) : undefined;
    const slide = rule.kind === 'result' ? sceneSlideById.get(rule.slide) : undefined;
    const state: TrackingState = {
      complete: completed,
      success: 'unknown',
      progress: order.length === 0 ? 0 : visited.size / order.length,
    };
    if (reached && slide?.result) {
      state.success =
        percentOf(reached.s, reached.m) >= slide.result.passPercent ? 'passed' : 'failed';
      state.score = { raw: reached.s, max: reached.m };
    }
    return state;
  };
  const complete = () => {
    if (completed) return;
    completed = true;
    emit({ type: 'trackingChange', tracking: tracking() });
  };
  /** Completion by slides viewed: checked whenever a slide is seen for the first time. */
  const checkCompletion = () => {
    const rule = project.tracking.completion;
    if (rule.kind !== 'slidesViewed' || order.length === 0) return;
    if (visited.size >= Math.min(rule.count ?? order.length, order.length)) complete();
  };

  // ----------------------------------------------------------------- results

  /** Each result slide reached, and what it came to then (docs/briefs/P7.7-result-slides.md). */
  const results = new Map<string, { s: number; m: number }>(
    Object.entries(options.restore?.res ?? {}),
  );
  const sceneSlideById = new Map(allSlides(project).map(({ slide }) => [slide.id, slide]));
  const percentOf = (score: number, max: number) => (max > 0 ? Math.round((100 * score) / max) : 0);

  /**
   * A result's questions, by slide id, in course order: the included question
   * slides, draws' drawn questions and other results' questions, each once, of
   * the result's kind (graded or survey).
   */
  const resultQuestions = (slide: Slide, within = new Set<string>()): string[] => {
    const result = slide.result;
    if (!result || within.has(slide.id)) return [];
    within.add(slide.id);
    const fits = (id: string) => {
      const question = order[slideIndex.get(id) ?? -1]?.question;
      return !!question && isSurveyQuestion(question) === (result.kind === 'survey');
    };
    const ids = new Set<string>();
    if (result.include.kind === 'all') {
      for (const each of order) if (fits(each.id)) ids.add(each.id);
    } else {
      for (const id of result.include.slides) {
        const named = sceneSlideById.get(id);
        if (!named) continue;
        const found = named.draw
          ? (draws.get(id) ?? [])
          : named.result
            ? resultQuestions(named, within)
            : [id];
        for (const each of found) if (fits(each)) ids.add(each);
      }
    }
    return [...ids].sort((a, b) => (slideIndex.get(a) ?? 0) - (slideIndex.get(b) ?? 0));
  };

  /** A result as it stands: points (or, for a survey, answers) out of the most. */
  const scoreResult = (slide: Slide) => {
    const ids = resultQuestions(slide);
    let score = 0;
    let max = 0;
    for (const id of ids) {
      const question = order[slideIndex.get(id)!]!.question!;
      const record = questions.get(id);
      if (slide.result!.kind === 'survey') {
        max += 1;
        if (record?.r) score += 1;
      } else {
        max += bestScore(question);
        score += record?.s ?? 0;
      }
    }
    const percent = percentOf(score, max);
    return {
      slide,
      questions: ids,
      score,
      max,
      percent,
      passed: percent >= slide.result!.passPercent,
    };
  };

  /** The result the built-in variables describe: this slide's, or the tracked one's. */
  const shownResult = () => {
    const here = current?.slide.result ? current.slide : undefined;
    const rule = project.tracking.completion;
    const slide = here ?? (rule.kind === 'result' ? sceneSlideById.get(rule.slide) : undefined);
    if (!slide?.result) return undefined;
    const reached = results.get(slide.id);
    if (!reached) return scoreResult(slide);
    const percent = percentOf(reached.s, reached.m);
    return {
      slide,
      questions: resultQuestions(slide),
      score: reached.s,
      max: reached.m,
      percent,
      passed: percent >= slide.result.passPercent,
    };
  };

  /**
   * Reaching a result slide: it adds up its questions, keeps the result, shows
   * its Passed or Failed layer, and, when it is the tracked result, completes
   * the course with its success and score.
   */
  const enterResult = (rt: SlideRuntime) => {
    const result = rt.slide.result;
    if (!result || reviewing) return;
    const scored = scoreResult(rt.slide);
    results.set(rt.slide.id, { s: scored.score, m: scored.max });
    const layer =
      result.kind === 'graded'
        ? scored.passed
          ? result.layers.passed
          : result.layers.failed
        : result.layers.passed;
    if (layer && rt.slide.layers.some((each) => each.id === layer)) {
      perform(rt, { type: 'showLayer', layer });
    }
    const rule = project.tracking.completion;
    if (rule.kind === 'result' && rule.slide === rt.slide.id) {
      if (completed) emit({ type: 'trackingChange', tracking: tracking() });
      else complete();
    }
  };

  /** What a script may touch, bound to the slide its trigger is on. */
  const scriptApi = (rt: SlideRuntime): ScriptApi => ({
    getVar: (name) => {
      const provided = builtInNamed(name);
      if (provided) return builtIn(provided);
      const variable = variableByName.get(name.toLowerCase());
      return variable ? values.get(variable.id) : undefined;
    },
    setVar: (name, value) => {
      if (isBuiltInVariableName(name)) throw new Error(`"${name}" is built in and cannot be set`);
      const variable = variableByName.get(String(name).toLowerCase());
      if (!variable) throw new Error(`No variable named "${name}"`);
      if (typeof value !== typeof variable.default) {
        throw new Error(`Variable "${variable.name}" holds ${variable.type} values`);
      }
      assignVariable(variable.id, value);
    },
    object: (name) => {
      const object = objectsOf(rt).find((each) => each.name === name);
      if (!object) return null;
      const view = () => {
        const layer = layersOf(rt).find((each) => each.layer.objects.includes(object))!;
        return viewLayer(rt, layer).objects.find((each) => each.id === object.id)!;
      };
      return {
        name: object.name,
        get state() {
          return shownState(rt, object);
        },
        get visible() {
          return (
            current === rt &&
            view().visible &&
            layersOf(rt).some((l) => l.shown && l.layer.objects.includes(object))
          );
        },
        setState: (stateId) => current === rt && applyState(rt, object, stateId),
        show: () => {
          rt.scriptHidden.delete(object.id);
        },
        hide: () => {
          rt.scriptHidden.add(object.id);
          rt.hover.delete(object.id);
          rt.down.delete(object.id);
        },
      };
    },
  });

  /** The event whose triggers are running, for actions that need to know when it happened. */
  let runningEvent: EngineEvent | null = null;
  let warnedAboutLoop = false;
  /** Work through the trigger queue, breadth-first (plan section 5). */
  const runTriggers = () => {
    if (runningDepth >= 0) return;
    try {
      while (triggerQueue.length > 0) {
        const { event, depth } = triggerQueue.shift()!;
        const rt = current;
        if (!rt) continue;
        if (depth > MAX_CASCADE_DEPTH) {
          if (!warnedAboutLoop) {
            warnedAboutLoop = true;
            pending.push({
              type: 'warning',
              message:
                'Triggers kept setting each other off, so the engine stopped them. Check for triggers that change what other triggers are waiting for.',
            });
          }
          continue;
        }
        runningDepth = depth;
        runningEvent = event;
        const waking = inEvaluationOrder(
          rt.slide.triggers.filter((trigger) => listensFor(trigger.event, event)),
        );
        for (const trigger of waking) {
          // An earlier trigger may have moved on, or hidden this one's owner.
          if (current !== rt || !isActive(rt, trigger)) {
            if (current !== rt) break;
            continue;
          }
          const action = conditionsPass(trigger.conditions, world(rt))
            ? trigger.action
            : trigger.otherwise;
          // A jump ends this event's triggers.
          if (action && perform(rt, action)) break;
        }
        runningDepth = -1;
        runningEvent = null;
      }
    } finally {
      runningDepth = -1;
      runningEvent = null;
    }
  };

  // ------------------------------------------------------------------ restore

  const restore = options.restore;
  if (restore) {
    for (const [id, value] of Object.entries(restore.x ?? {})) {
      const variable = project.variables.find((v) => v.id === id);
      if (variable && typeof value === typeof variable.default) values.set(id, value);
    }
    if (typeof restore.e === 'number' && restore.e > 0) elapsed = restore.e;
    if (restore.c === 1) completed = true;
    for (const id of restore.vis ?? []) if (slideIndex.has(id)) visited.add(id);
    for (const [id, record] of Object.entries(restore.q ?? {})) {
      if (slideIndex.has(id)) questions.set(id, { ...record });
    }
    for (const [id, memory] of Object.entries(restore.sv ?? {})) {
      if (slideIndex.has(id)) saved.set(id, memory);
    }
  }
  const first = (restore?.s !== undefined && order[slideIndex.get(restore.s) ?? -1]) || order[0];
  if (first) {
    // A restored session continues the slide where it was; a new one starts at the beginning.
    enterSlide(first, restore?.s === first.id);
    flush();
  }

  // --------------------------------------------------------------------- API

  const transitionView = (layer: LayerRuntime): Pick<LayerView, 'transition'> => {
    const own = layer.layer.properties.transition;
    const now = layer.transition;
    return own && now ? { transition: { ...own, phase: now.phase, time: now.time } } : {};
  };

  const viewLayer = (rt: SlideRuntime, layer: LayerRuntime): LayerView => {
    const baseHidden =
      layer.isBase && rt.overlays.some((l) => l.shown && l.layer.properties.hideBaseObjects);
    return {
      id: layer.layer.id,
      isBase: layer.isBase,
      shown: layer.shown,
      playhead: layer.playhead,
      duration: layer.layer.timeline.duration,
      paused: isPaused(rt, layer),
      ended: layer.ended,
      blocksBase: !layer.isBase && layer.shown && layer.layer.properties.blockBaseClicks,
      ...transitionView(layer),
      media: viewMedia(rt, layer),
      objects: layer.layer.objects.map((object) => {
        const state = shownState(rt, object);
        // A layer being hidden keeps drawing what it showed until its transition ends.
        const leaving = layer.transition?.phase === 'out' ? layer.transition.onStage : null;
        const onStage = layer.onStage.has(object.id) || (leaving?.has(object.id) ?? false);
        const question = rt.slide.question;
        // Hotspot spots are the author's guides: the learner sees the picture, not them.
        const isSpot =
          !reviewing &&
          question?.kind === 'hotspot' &&
          question.spots.some((spot) => spot.object === object.id);
        const visible =
          onStage &&
          state !== 'hidden' &&
          !baseHidden &&
          !rt.scriptHidden.has(object.id) &&
          !isSpot;
        const motion: Pick<ObjectView, 'effect' | 'offset'> = {};
        const effect = onStage
          ? effectAt(object, layer.playhead, layer.layer.timeline.duration)
          : null;
        if (effect) motion.effect = effect;
        const moved = shownOffsetOf(rt, object.id);
        const swapped = shuffleOffset(rt, object.id) ?? placeOffset(rt, object.id);
        const offset =
          moved || swapped
            ? { x: (moved?.x ?? 0) + (swapped?.x ?? 0), y: (moved?.y ?? 0) + (swapped?.y ?? 0) }
            : null;
        if (offset && (offset.x !== 0 || offset.y !== 0)) motion.offset = offset;
        const input: Pick<
          ObjectView,
          'value' | 'options' | 'locked' | 'draggable' | 'mark' | 'text' | 'review'
        > = inputView(rt, object);
        const words = choiceFeedbackText(rt, object.id);
        if (words !== null) input.text = words;
        const reviewed = reviewInView.get(object.id);
        if (reviewed) input.review = reviewed;
        if (
          question &&
          layer.isBase &&
          !questionClosed(rt) &&
          dragTiles(question).includes(object.id)
        ) {
          input.draggable = true;
        }
        // Any object at the top of a layer the author made draggable (P9.7).
        if (object.drag !== null && freeDraggable(rt, object)) input.draggable = true;
        if (question?.kind === 'hotspot' && question.picture === object.id) {
          const [spot, x, y] = hotspotValues(rt, question);
          if (spot !== undefined && x !== undefined && y !== undefined) {
            const px = Number(x);
            const py = Number(y);
            if (Number.isFinite(px) && Number.isFinite(py)) input.mark = { x: px, y: py };
          }
        }
        // A 360° image's opened spots (P9.10).
        if (object.type === 'panorama') {
          return {
            id: object.id,
            onStage,
            state,
            visible,
            ...motion,
            visitedSpots: [...(rt.spots.get(object.id) ?? [])],
          };
        }
        // A slider's or dial's value (P9.4).
        if (object.type === 'slider' || object.type === 'dial') {
          return {
            id: object.id,
            onStage,
            state,
            visible,
            ...motion,
            controlValue: controlValue(rt, object),
          };
        }
        if (object.type !== 'group') {
          return { id: object.id, onStage, state, visible, ...motion, ...input };
        }
        const parts: Record<string, ObjectPart> = {};
        const walk = (children: readonly SceneObject[], shown: boolean) => {
          for (const child of children) {
            const childState = shownState(rt, child);
            // Its own time counts as well as its group's (B8).
            const childOnStage = layer.onStage.has(child.id) || (leaving?.has(child.id) ?? false);
            const childShown =
              shown && childOnStage && childState !== 'hidden' && !rt.scriptHidden.has(child.id);
            const part: ObjectPart = {
              state: childState,
              visible: childShown,
              onStage: childOnStage,
            };
            const childEffect = childOnStage
              ? effectAt(child, layer.playhead, layer.layer.timeline.duration)
              : null;
            if (childEffect) part.effect = childEffect;
            const childMoved = shownOffsetOf(rt, child.id);
            if (childMoved && (childMoved.x !== 0 || childMoved.y !== 0)) part.offset = childMoved;
            // A field, control or 360° image inside a group works as one outside it.
            const { value, options } = inputView(rt, child);
            if (value !== undefined) part.value = value;
            if (options) part.options = options;
            if (child.type === 'slider' || child.type === 'dial') {
              part.controlValue = controlValue(rt, child);
            }
            if (child.type === 'panorama') part.visitedSpots = [...(rt.spots.get(child.id) ?? [])];
            parts[child.id] = part;
            if (child.type === 'group') walk(child.children, childShown);
          }
        };
        walk(object.children, visible);
        return { id: object.id, onStage, state, visible, parts, ...motion };
      }),
    };
  };

  /**
   * Where the learner's view is (docs/briefs/P6.7-zoom-and-cues.md): the
   * topmost shown layer with a zoom region on stage decides it.
   */
  const cameraView = (): Pick<EngineView, 'camera'> => {
    if (!current) return {};
    const stage = project.stage;
    for (const layer of shownLayers(current).reverse()) {
      const duration = layer.layer.timeline.duration;
      const regions = layer.layer.objects
        .filter((object) => object.type === 'zoomRegion')
        .map((object) => ({
          start: object.timing.start,
          end: objectEnd(object, duration),
          // With less motion, the view cuts to a region rather than travelling.
          speed: object.type === 'zoomRegion' && !options.reducedMotion ? object.props.speed : 0,
          frame: object.frame,
        }));
      if (regions.length === 0) continue;
      const view = viewAt(regions, layer.playhead, stage);
      const whole =
        Math.abs(view.x) < 1e-6 &&
        Math.abs(view.y) < 1e-6 &&
        Math.abs(view.width - stage.width) < 1e-6 &&
        Math.abs(view.height - stage.height) < 1e-6;
      if (!whole) return { camera: view };
    }
    return {};
  };

  /** Review marks for the view being built (P7.5): worked out once per `getView`. */
  let reviewInView = new Map<string, 'right' | 'chosen'>();

  const getView = (): EngineView => {
    reviewInView = current ? reviewMarks(current) : new Map();
    const review = current ? reviewResult(current) : undefined;
    const variables: Record<string, VariableValue> = {};
    for (const variable of project.variables) variables[variable.name] = values.get(variable.id)!;
    for (const { name } of BUILT_IN_VARIABLES) variables[name] = builtIn(name);
    // Under a lightbox, the course is still on the slide beneath it (P8.4).
    const host = under ?? current;
    const index = host ? (slideIndex.get(host.slide.id) ?? -1) : -1;
    return {
      slideId: current?.slide.id ?? null,
      slideIndex: index,
      slideCount: order.length,
      canNext: under
        ? lightboxNeighbour(1) !== undefined
        : reviewing && reviewScope
          ? true
          : index >= 0 && index < order.length - 1 && !holdsNext(current),
      canPrevious: under
        ? lightboxNeighbour(-1) !== undefined
        : reviewing && reviewScope
          ? reviewScope.questions.indexOf(current?.slide.id ?? '') > 0
          : index > 0,
      ...(under ? { lightbox: { underSlideId: under.slide.id, controls: lightboxControls } } : {}),
      ...timerView(),
      controls: { ...(current?.slide.properties.controls ?? { previous: true, next: true }) },
      ...cameraView(),
      // Shown layers, and those still playing their way out, in document order.
      layers: current
        ? layersOf(current)
            .filter((layer) => layer.shown || layer.transition?.phase === 'out')
            .map((layer) => viewLayer(current!, layer))
        : [],
      ...(slideTransition
        ? {
            transition: {
              ...slideTransition.transition,
              time: slideTransition.time,
              fromSlideId: slideTransition.from,
            },
          }
        : {}),
      ...slideMark(),
      ...(review ? { review } : {}),
      variables,
    };
  };

  /** The running result timer, for the player to show (P7.7). */
  const timerView = (): Pick<EngineView, 'timer'> => {
    const slide = runningTimer();
    return slide ? { timer: { left: timeLeft(slide) } } : {};
  };

  /** A freeform hotspot's mark, on the slide itself (P7.4). */
  const slideMark = (): Pick<EngineView, 'mark'> => {
    const question = current?.slide.question;
    if (!current || question?.kind !== 'freeHotspot') return {};
    const [, x, y] = hotspotValues(current, question);
    const px = Number(x);
    const py = Number(y);
    return x !== undefined && Number.isFinite(px) && Number.isFinite(py)
      ? { mark: { x: px, y: py } }
      : {};
  };

  return {
    tick,
    // A required question not yet finished holds Next (triggers can still jump).
    next: () => !holdsNext(current) && navigate(1),
    previous: () => navigate(-1),

    openLightbox(slideId, controls = false) {
      const opened = openLightbox(slideId, controls);
      flush();
      return opened;
    },

    closeLightbox() {
      const closed = closeLightbox();
      flush();
      return closed;
    },

    jumpToSlide(slideId) {
      const target = order[slideIndex.get(slideId) ?? -1];
      if (!target) throw new Error(`No slide with id "${slideId}"`);
      goTo(target);
      flush();
    },

    seek(layerId, seconds) {
      const layer = requireLayer(layerId);
      if (!current || !layer.shown) return;
      seekLayer(current, layer, seconds);
      flush();
    },

    restart() {
      restartCourse();
      flush();
    },

    setPaused(layerId, paused) {
      requireLayer(layerId).paused = paused;
    },

    mediaControl(objectId, playing, seconds) {
      const rt = current;
      const media = rt?.media.get(objectId);
      if (!rt || !media || !Number.isFinite(seconds)) return;
      // The learner used the controls: that wins over the timeline.
      media.mode = playing ? 'free' : 'paused';
      media.time = Math.min(playedLength(media.object), Math.max(0, seconds));
      media.completed = false;
      checkMediaEnds(rt);
      flush();
    },

    mediaTime(objectId, seconds) {
      const rt = current;
      const media = rt?.media.get(objectId);
      if (!rt || !media || !mediaPlaying(rt, media) || !Number.isFinite(seconds)) return;
      const at = Math.min(playedLength(media.object), Math.max(0, seconds));
      if (media.mode === 'free') {
        media.time = at;
      } else if (masterOf(rt, media.layer) === media) {
        const { layer } = media;
        layer.masterReported = true;
        const target = Math.min(layer.layer.timeline.duration, media.object.timing.start + at);
        if (target > layer.playhead) {
          layer.stalledFor = 0;
          const from = layer.playhead;
          layer.playhead = target;
          settle(rt, layer, from, true);
        }
      }
      checkMediaEnds(rt);
      flush();
    },

    showLayer(layerId) {
      showOverlay(current!, requireLayer(layerId));
      flush();
    },

    hideLayer(layerId) {
      const layer = requireLayer(layerId);
      if (layer.isBase) return;
      hideOverlay(current!, layer);
      flush();
    },

    input(objectId, value) {
      const taken = takeInput(objectId, value);
      flush();
      return taken;
    },

    openSpot(objectId, spotId) {
      const rt = current;
      const object = rt && objectsOf(rt).find((each) => each.id === objectId);
      if (!rt || object?.type !== 'panorama' || !acceptsInput(rt, object)) return false;
      if (!object.props.spots.some((spot) => spot.id === spotId)) return false;
      const opened = rt.spots.get(objectId) ?? new Set<string>();
      const wasNew = !opened.has(spotId);
      opened.add(spotId);
      rt.spots.set(objectId, opened);
      emit({ type: 'spotClicked', slideId: rt.slide.id, objectId, spotId });
      if (wasNew && opened.size === object.props.spots.length) {
        emit({ type: 'panoramaVisited', slideId: rt.slide.id, objectId });
      }
      flush();
      return true;
    },

    moveControl(objectId, value) {
      const moved = moveControl(objectId, value);
      flush();
      return moved;
    },

    blur(objectId) {
      const taken = blurField(objectId);
      flush();
      return taken;
    },

    drop(objectId, x, y) {
      const free = freeObject(objectId);
      carryTile(null);
      carrying = null;
      if (free) dropFree(current!, free, x, y);
      const taken = free !== null || dropTile(objectId, x, y);
      flush();
      return taken;
    },

    submitQuestion() {
      if (!current?.slide.question) return false;
      const moved = submitQuestion(current);
      flush();
      return moved;
    },

    dropTargets(objectId) {
      const rt = current;
      if (!rt) return [];
      const question = rt.slide.question;
      if (question && dragTiles(question).includes(objectId)) {
        if (questionClosed(rt)) return [];
        switch (question.kind) {
          case 'wordBank':
          case 'whichWord':
            return question.blank ? [question.blank] : [];
          case 'matchingDrag':
            return question.pairs.map((pair) => pair.target);
          case 'sequenceDrag':
          case 'ranking':
            return dragTiles(question).filter((id) => id !== objectId);
          case 'freeDrag':
            return [...question.targets];
          default:
            return [];
        }
      }
      const object = freeObject(objectId);
      if (!object) return [];
      const named: string[] = [];
      for (const { event } of rt.slide.triggers) {
        if (
          (event.type === 'draggedOver' || event.type === 'droppedOn') &&
          event.object === objectId
        ) {
          if (!named.includes(event.target)) named.push(event.target);
        }
      }
      const objects = new Map(objectsOf(rt).map((each) => [each.id, each]));
      return named.filter((id) => {
        const target = objects.get(id);
        return !!target && shownNow(rt, target);
      });
    },

    carry(objectId, x, y) {
      const free = objectId === null ? null : freeObject(objectId);
      let changed: boolean;
      if (free) {
        changed = carryFree(current!, free, x ?? 0, y ?? 0);
      } else {
        carrying = null;
        changed = carryTile(objectId, x, y);
      }
      flush();
      return changed;
    },

    mark(x, y) {
      const taken = markAt(x, y);
      flush();
      return taken;
    },

    pointer(kind, objectId) {
      const rt = current;
      const object = rt && objectsOf(rt).find((each) => each.id === objectId);
      if (!rt || !object || !acceptsInput(rt, object)) return false;
      const input = (
        {
          enter: 'mouseEnter',
          leave: 'mouseLeave',
          click: 'click',
          doubleClick: 'doubleClick',
          rightClick: 'rightClick',
        } as const
      )[kind as 'enter'];
      // A press or a click on something inside a group is one on each group
      // around it as well, innermost first. Entering and leaving are exact:
      // only the view knows whether the pointer left the group or moved within it.
      const targets = kind === 'enter' || kind === 'leave' ? [object] : chainOf(rt, object);
      const wasOver = rt.hover.has(object.id);
      changeStates(rt, () => {
        for (const target of targets) {
          const id = target.id;
          if (kind === 'enter') rt.hover.add(id);
          else if (kind === 'leave') {
            rt.hover.delete(id);
            rt.down.delete(id);
          } else if (kind === 'down') rt.down.add(id);
          else if (kind === 'up') rt.down.delete(id);
          else if (kind === 'click') {
            // A video set to start on a click plays or pauses (the innermost object only).
            if (target === object) toggleOnClick(rt, target.id);
            if (has(target, 'selected')) {
              const selected = marksOf(rt, target).includes('s');
              // In a button set a click always selects; alone, it toggles.
              if (target.buttonSet !== null || !selected) select(rt, target);
              else mark(rt, target, 's', false);
            }
            // Visited is applied by the first click and then stays.
            if (has(target, 'visited') && !marksOf(rt, target).includes('v')) {
              mark(rt, target, 'v', true);
            }
          }
        }
      });
      // Entering what the pointer is already over, or leaving what it is not, is not news.
      if (kind === 'enter' && wasOver) return true;
      if (kind === 'leave' && !wasOver) return true;
      // The automatic states first, then the triggers: a click trigger sees the object already selected.
      if (input) {
        for (const target of targets) {
          emit({ type: 'objectInput', slideId: rt.slide.id, objectId: target.id, input });
        }
      }
      flush();
      return true;
    },

    key(key, modifiers = {}) {
      if (answerKey(key, modifiers)) {
        flush();
        return true;
      }
      emit({ type: 'keyPress', key });
      flush();
      return false;
    },

    playerTab(tabId) {
      emit({ type: 'playerTab', tab: tabId });
      flush();
    },

    setObjectState(objectId, stateId) {
      const rt = current;
      const object = rt && objectsOf(rt).find((each) => each.id === objectId);
      if (!rt || !object) return false;
      const changed = applyState(rt, object, stateId);
      flush();
      return changed;
    },

    getVariable: (name) => {
      const provided = builtInNamed(name);
      if (provided) return builtIn(provided);
      const variable = variableByName.get(name.toLowerCase());
      return variable ? values.get(variable.id) : undefined;
    },

    setVariable(name, value) {
      if (isBuiltInVariableName(name)) throw new Error(`"${name}" is built in and cannot be set`);
      const variable = variableByName.get(name.toLowerCase());
      if (!variable) throw new Error(`No variable named "${name}"`);
      if (typeof value !== typeof variable.default) {
        throw new Error(`Variable "${variable.name}" holds ${variable.type} values`);
      }
      assignVariable(variable.id, value);
      flush();
    },

    getView,
    getTracking: tracking,

    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getState() {
      const state: SessionState = { v: 1 };
      // A lightbox is not resumed: the session comes back to the slide under it (P8.4).
      const host = under ?? current;
      if (host) state.s = host.slide.id;
      const x: Record<string, VariableValue> = {};
      for (const variable of project.variables) {
        const value = values.get(variable.id)!;
        if (value !== variable.default) x[variable.id] = value;
      }
      if (Object.keys(x).length > 0) state.x = x;
      if (visited.size > 0) state.vis = [...visited];
      if (elapsed > 0) state.e = Math.round(elapsed * 10) / 10;
      if (completed) state.c = 1;
      const sv: Record<string, SavedSlide> = {};
      const live = [current, under].filter((rt): rt is SlideRuntime => rt !== null);
      for (const [id, memory] of saved) {
        if (!live.some((rt) => rt.slide.id === id) && Object.keys(memory).length > 0)
          sv[id] = memory;
      }
      for (const rt of live) {
        const memory = snapshot(rt);
        if (Object.keys(memory).length > 0) sv[rt.slide.id] = memory;
      }
      if (Object.keys(sv).length > 0) state.sv = sv;
      const q: Record<string, SavedQuestion> = {};
      for (const [id, record] of questions) {
        if (record.a > 0 || record.o || record.v) q[id] = { ...record };
      }
      if (Object.keys(q).length > 0) state.q = q;
      // Results reached (P7.7), so success and the score survive a resume.
      if (results.size > 0) state.res = Object.fromEntries(results);
      if (timers.size > 0) state.tm = Object.fromEntries(timers);
      // The session's draws, so a resumed course plays the same questions (P7.6).
      if (draws.size > 0) state.d = Object.fromEntries(draws);
      return state;
    },
  };
}

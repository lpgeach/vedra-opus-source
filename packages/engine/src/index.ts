/**
 * @vedraopus/engine — headless runtime: timelines, states, triggers, variables,
 * quiz scoring. Driven by an injected clock; never touches the DOM or timers.
 *
 * May import @vedraopus/model only. See docs/PLAN.md section 5 and
 * docs/briefs/P3.1-engine-core.md.
 */
export { createEngine, isOnStage, playedLength } from './engine';
export { effectLength, pathPolyline, paragraphCount } from './animation';
export { fitView, viewAt } from './camera';
export { bestScore, freePlace, markAnswer } from './quiz';
export { MAX_CASCADE_DEPTH } from './triggers';
export { reportStatus } from './tracking';
export type { ReportedStatus, TrackingState } from './tracking';
export type {
  Engine,
  EngineEvent,
  EngineListener,
  EngineOptions,
  EngineView,
  LayerView,
  MediaView,
  ObjectInput,
  ObjectPart,
  ObjectView,
  PointerKind,
  KeyModifiers,
  ResultSummary,
  SavedQuestion,
  SavedSlide,
  ScriptApi,
  ScriptObject,
  SessionState,
} from './types';

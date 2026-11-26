/**
 * @vedraopus/model — project schema, validation, migrations and commands.
 *
 * Pure TypeScript: no DOM, React, Node or Electron imports (enforced by lint
 * and by this package's tsconfig). See docs/PLAN.md sections 4 and 8 (P1).
 */
export * from './schema';
export * from './factory';
export * from './table';
export * from './tab-order';
export * from './a11y-check';
export * from './translation';
export * from './xliff';
export * from './translation-text';
export { shapePreset, shapePresetLabel, shapePresetNames } from './shapes';
export { isPathData, parsePathData, writePathData } from './path-data';
export type { PathCommand } from './path-data';
export type { ShapePresetName } from './shapes';
export { createId } from './ids';
export { DEFAULT_LABELS, isRightToLeft, LABEL_KEYS, LANGUAGE_TAG, labelText } from './labels';
export type { LabelKey, LabelSettings } from './labels';
export {
  accentFor,
  contrastRatio,
  defaultLabels,
  defaultLook,
  PLAYER_SCHEMES,
  presetOf,
  textOnAccent,
  UI_CONTRAST,
  withPreset,
} from './player-look';
export type { PlayerSchemeColours } from './player-look';
export {
  formatSrt,
  formatTimestamp,
  formatVtt,
  parseCaptions,
  parseTimestamp,
  plainCueText,
} from './captions';
export type { ParsedCaptions } from './captions';
export type { IdPrefix } from './ids';
export { ProjectValidationError } from './errors';
export type { ProjectIssue } from './errors';
export { migrateToCurrent } from './migrations';
export { findReferenceIssues, parseProject, serializeProject } from './validate';
export { allSlides, everySlide, forEachObject, slideLayers } from './traverse';
export { BUILT_IN_STATE_NAMES, isEmptyState, resolveObjectState } from './states';
export {
  BUILT_IN_VARIABLES,
  forEachRichText,
  isBuiltInVariableName,
  replaceVariableReferences,
  VARIABLE_REFERENCE,
  variableUsage,
  variableValueText,
} from './variables';
export type { BuiltInVariableName, VariableUsage } from './variables';
export { slideLinks, unreachableSlides } from './links';
export type { SlideLink } from './links';
export { cloneLayer, cloneScene, cloneSlide, cloneSlides, renewObjectIds } from './clone';
export { prepareSlideImport } from './import-slides';
export type { SlideImport } from './import-slides';
export * from './find';
export { CommandError } from './commands/types';
export type { CommandMap, CommandName, ObjectChanges } from './commands/types';
export { createHistory } from './history';
export type { Change, History, HistoryOptions, Patch } from './history';
export {
  branchTargets,
  choiceMarks,
  feedbackParts,
  keyComboText,
  mapFeedbackParts,
  withoutBranchesTo,
  withoutLayer,
  NOT_A_SHORTCUT,
  pickedFrom,
  questionObjects,
  questionPartIds,
  renewPartIds,
  withoutObjects,
} from './questions';
export type { QuestionObject } from './questions';

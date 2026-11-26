/**
 * @vedraopus/publish — bundling, manifests, LMS drivers (SCORM 1.2/2004, xAPI,
 * cmi5) and zip output.
 *
 * May import model, engine, render and player. See docs/PLAN.md P3.5 and P5.
 * Nothing here touches a disk: output goes through the caller's `write`.
 */
export {
  courseDataScript,
  graphicLibraries,
  indexHtml,
  noticesText,
  publishWeb,
  PublishCancelled,
} from './web';
export type { GraphicLibrary, PlayerLibraryNotice } from './web';
export { checkPublishSettings, defaultIdentifier, publishCourse, settingsFields } from './course';
export type { CoursePublishReport, SettingsProblems } from './course';
export { isXmlName } from './xml';
export type { ManifestOptions } from './xml';
export type {
  LmsTarget,
  PublishData,
  Scorm2004Edition,
  WebPublishOptions,
  WebPublishReport,
} from './web';
export {
  publishScorm12,
  SCORM12_SCHEMA_FILES,
  scorm12Manifest,
  worstCaseSuspendLength,
} from './scorm12';
export type { Scorm12PublishReport } from './scorm12';
export {
  publishScorm2004,
  SCORM2004_SUSPEND_LIMIT,
  scorm2004Manifest,
  scorm2004SchemaFiles,
} from './scorm2004';
export type { Scorm2004PublishOptions, Scorm2004PublishReport } from './scorm2004';
export { scopeProject } from './scope';
export type { PreviewScope } from './scope';
export { defaultActivityId, isIri, publishXapi, tincanXml } from './xapi';
export { cmi5Xml, moveOnFor, publishCmi5 } from './cmi5';
export type { Cmi5MoveOn, Cmi5PublishOptions, Cmi5PublishReport } from './cmi5';
export type { XapiPublishOptions, XapiPublishReport } from './xapi';
export { xapiActivityTypes, xapiVerbs } from '@vedraopus/player/xapi-vocabulary';
export type { XapiVerb } from '@vedraopus/player/xapi-vocabulary';

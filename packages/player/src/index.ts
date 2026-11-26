/**
 * @vedraopus/player — browser view over the engine plus the player frame.
 * This is the code that ships inside every published course and runs preview.
 *
 * May import model, engine and render. See docs/briefs/P3.2-player.md.
 * Built by `npm run build -w @vedraopus/player` into one script and one
 * stylesheet (`dist/player.js`, `dist/player.css`); the script defines
 * `window.VedraOpusPlayer`.
 */
export { mountPlayer } from './player';
export { startCourse } from './lms/start';
export type { CoursePlayer, LmsStandard, StartOptions } from './lms/start';
export type { LmsDriver, LmsInteraction } from './lms/driver';
export { findScorm12Api, scorm12Driver, scorm12Time } from './lms/scorm12';
export type { Scorm12Api } from './lms/scorm12';
export {
  findScorm2004Api,
  interactionId,
  scaledScore,
  scorm2004Driver,
  scorm2004Time,
} from './lms/scorm2004';
export type { Scorm2004Api, Scorm2004Edition } from './lms/scorm2004';
export {
  deliveryOutcome,
  parseActor,
  parseLaunch,
  readState,
  retryDelay,
  statusChange,
  uuid,
  lrsDriver,
  xapiDriver,
} from './lms/xapi';
export type { LrsProfile, LrsSession, XapiAgent, XapiLaunch } from './lms/xapi';
export { cmi5Driver, parseCmi5Launch, readLaunchData } from './lms/cmi5';
export type { Cmi5LaunchData } from './lms/cmi5';
export { decodeSession, encodeSession } from './lms/suspend';
export type { Player, PlayerInput, PlayerOptions } from './player';

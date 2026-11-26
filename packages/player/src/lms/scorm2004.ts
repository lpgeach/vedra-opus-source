import type { ReportedStatus } from '@vedraopus/engine';
import type { LmsDriver, LmsInteraction } from './driver';
import { formatAnswer } from './driver';
import { findApi, hasMethod } from './find-api';

/** The SCORM 2004 run-time API (`API_1484_11`) an LMS puts on one of the course's ancestor windows. */
export interface Scorm2004Api {
  Initialize(arg: ''): string;
  Terminate(arg: ''): string;
  GetValue(element: string): string;
  SetValue(element: string, value: string): string;
  Commit(arg: ''): string;
  GetLastError(): string;
  GetErrorString(code: string): string;
}

/** SCORM 2004 editions. The run-time API is the same; the 2nd keeps less suspend data. */
export type Scorm2004Edition = 2 | 3 | 4;

/** The SCORM 2004 API: on this window or a parent, else on the window that opened it or its parents. */
export const findScorm2004Api = (start: Window): Scorm2004Api | null =>
  findApi(start, 'API_1484_11', hasMethod<Scorm2004Api>('Initialize'));

/** An ISO 8601 duration such as `PT1H2M5.46S`, the form SCORM 2004 wants for times. */
export function scorm2004Time(seconds: number): string {
  // Round to hundredths first, or 59.999 s would come out as minute 0, second 60.
  const total = Math.round(Math.max(0, seconds) * 100) / 100;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = Math.round((total - hours * 3600 - minutes * 60) * 100) / 100;
  return `PT${hours ? `${hours}H` : ''}${minutes ? `${minutes}M` : ''}${rest || !(hours || minutes) ? `${rest}S` : ''}`;
}

/** (raw − min) / (max − min), within −1…1 and to 7 places as 2004's `real(10,7)` allows. */
export function scaledScore(raw: number, min: number, max: number): number | null {
  if (!(max > min)) return null;
  const scaled = Math.min(1, Math.max(-1, (raw - min) / (max - min)));
  return Math.round(scaled * 1e7) / 1e7;
}

/** 2004 wants an interaction id to be a URI; anything else becomes a URN. */
export function interactionId(id: string): string {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\S+$/.test(id)) return id;
  return `urn:vedraopus:interaction:${id.replace(/[^A-Za-z0-9()+,\-.:=@;$_!*'%/?#]/g, '_') || '_'}`;
}

const RESULT: Record<LmsInteraction['result'], string> = {
  correct: 'correct',
  wrong: 'incorrect',
  unanticipated: 'unanticipated',
  neutral: 'neutral',
};

export function scorm2004Driver(
  window: Window,
  warn: (message: string) => void,
  edition: Scorm2004Edition = 4,
): LmsDriver {
  const api = findScorm2004Api(window);
  let connected = false;
  let interactions = 0;
  /** What the LMS holds for this learner, from before or written since; never lowered. */
  let completed = false;
  let graded = false;

  /** Every call checked: a problem is a warning, never an error in the course. */
  const check = (what: string, result: string) => {
    if (result === 'true' || !api) return;
    const code = api.GetLastError();
    if (code !== '0') warn(`The LMS refused ${what}: ${api.GetErrorString(code)} (${code})`);
  };
  const get = (element: string): string => (connected && api ? api.GetValue(element) : '');
  const set = (element: string, value: string) => {
    if (connected && api) check(element, api.SetValue(element, value));
  };

  return {
    suspendLimit: edition === 2 ? 4000 : 64000,
    init() {
      if (!api) {
        warn('No SCORM 2004 LMS was found, so this course is not being tracked.');
        return false;
      }
      connected = api.Initialize('') === 'true';
      if (!connected) {
        warn('The LMS would not start a tracking session.');
        return false;
      }
      const completion = get('cmi.completion_status');
      completed = completion === 'completed';
      graded = ['passed', 'failed'].includes(get('cmi.success_status'));
      if (completion === 'unknown' || completion === 'not attempted' || completion === '') {
        set('cmi.completion_status', 'incomplete');
      }
      return true;
    },
    isResuming: () => get('cmi.entry') === 'resume',
    getBookmark: () => get('cmi.location'),
    setBookmark: (location) => set('cmi.location', location),
    getSuspendData: () => get('cmi.suspend_data'),
    setSuspendData: (data) => set('cmi.suspend_data', data),
    setStatus(status: ReportedStatus) {
      // A learner who finished and starts again keeps what they earned.
      if (status.completion === 'completed' || !completed) {
        completed ||= status.completion === 'completed';
        set('cmi.completion_status', status.completion);
      }
      if (status.success !== 'unknown' || !graded) {
        graded ||= status.success !== 'unknown';
        set('cmi.success_status', status.success);
      }
    },
    setScore(raw, min, max) {
      const scaled = scaledScore(raw, min, max);
      if (scaled !== null) set('cmi.score.scaled', String(scaled));
      set('cmi.score.raw', String(raw));
      set('cmi.score.min', String(min));
      set('cmi.score.max', String(max));
    },
    recordInteraction(interaction) {
      const n = `cmi.interactions.${interactions++}`;
      // The id comes first: the LMS creates the interaction from it.
      set(`${n}.id`, interactionId(interaction.id));
      set(`${n}.type`, interaction.type);
      set(`${n}.learner_response`, formatAnswer(interaction.response, 'scorm2004'));
      if (interaction.correct !== undefined)
        set(`${n}.correct_responses.0.pattern`, formatAnswer(interaction.correct, 'scorm2004'));
      set(`${n}.result`, RESULT[interaction.result]);
      if (interaction.latency !== undefined)
        set(`${n}.latency`, scorm2004Time(interaction.latency));
    },
    commit() {
      if (connected && api) check('saving', api.Commit(''));
    },
    terminate(sessionSeconds, complete) {
      if (!connected || !api) return;
      set('cmi.session_time', scorm2004Time(sessionSeconds));
      // "suspend" tells the LMS the learner will be back to carry on.
      set('cmi.exit', complete ? 'normal' : 'suspend');
      check('saving', api.Commit(''));
      check('finishing', api.Terminate(''));
      connected = false;
    },
  };
}

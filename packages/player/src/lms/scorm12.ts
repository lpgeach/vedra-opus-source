import type { ReportedStatus } from '@vedraopus/engine';
import type { LmsDriver } from './driver';
import { formatAnswer } from './driver';
import { findApi, hasMethod } from './find-api';

/** The SCORM 1.2 run-time API an LMS puts on one of the course's ancestor windows. */
export interface Scorm12Api {
  LMSInitialize(arg: ''): string;
  LMSFinish(arg: ''): string;
  LMSGetValue(element: string): string;
  LMSSetValue(element: string, value: string): string;
  LMSCommit(arg: ''): string;
  LMSGetLastError(): string;
  LMSGetErrorString(code: string): string;
}

/** The SCORM 1.2 API: on this window or a parent, else on the window that opened it or its parents. */
export const findScorm12Api = (start: Window): Scorm12Api | null =>
  findApi(start, 'API', hasMethod<Scorm12Api>('LMSInitialize'));

/** Statuses that mean the learner has finished; the driver never writes `incomplete` over one. */
const FINISHED = new Set(['completed', 'passed', 'failed']);

/** `HHHH:MM:SS.SS`, the form SCORM 1.2 wants for session time. */
export function scorm12Time(seconds: number): string {
  // Round to hundredths first, or 59.999 s would come out as minute 0, second 60.
  const total = Math.round(Math.max(0, seconds) * 100) / 100;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total - hours * 3600 - minutes * 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return `${String(hours).padStart(4, '0')}:${two(minutes)}:${rest.toFixed(2).padStart(5, '0')}`;
}

export function scorm12Driver(window: Window, warn: (message: string) => void): LmsDriver {
  const api = findScorm12Api(window);
  let connected = false;
  let interactions = 0;
  /** A finished status the LMS holds for this learner, from before or written since. */
  let finished = false;

  /** Every call checked: a problem is a warning, never an error in the course. */
  const check = (what: string, result: string) => {
    if (result === 'true' || !api) return;
    const code = api.LMSGetLastError();
    if (code !== '0') warn(`The LMS refused ${what}: ${api.LMSGetErrorString(code)} (${code})`);
  };
  const get = (element: string): string => (connected && api ? api.LMSGetValue(element) : '');
  const set = (element: string, value: string) => {
    if (connected && api) check(`${element}`, api.LMSSetValue(element, value));
  };

  return {
    suspendLimit: 4096,
    init() {
      if (!api) {
        warn('No SCORM 1.2 LMS was found, so this course is not being tracked.');
        return false;
      }
      connected = api.LMSInitialize('') === 'true';
      if (!connected) {
        warn('The LMS would not start a tracking session.');
        return false;
      }
      const status = get('cmi.core.lesson_status');
      finished = FINISHED.has(status);
      if (status === 'not attempted') set('cmi.core.lesson_status', 'incomplete');
      return true;
    },
    isResuming: () => get('cmi.core.entry') === 'resume',
    getBookmark: () => get('cmi.core.lesson_location'),
    setBookmark: (location) => set('cmi.core.lesson_location', location),
    getSuspendData: () => get('cmi.suspend_data'),
    setSuspendData: (data) => set('cmi.suspend_data', data),
    setStatus(status: ReportedStatus) {
      // A learner who finished and starts again keeps what they earned.
      if (status.lessonStatus === 'incomplete' && finished) return;
      if (FINISHED.has(status.lessonStatus)) finished = true;
      set('cmi.core.lesson_status', status.lessonStatus);
    },
    setScore(raw, min, max) {
      set('cmi.core.score.raw', String(raw));
      set('cmi.core.score.min', String(min));
      set('cmi.core.score.max', String(max));
    },
    recordInteraction(interaction) {
      const n = `cmi.interactions.${interactions++}`;
      set(`${n}.id`, interaction.id);
      // Our interaction types and results use SCORM 1.2's own words; it has no long-fill-in.
      set(`${n}.type`, interaction.type === 'long-fill-in' ? 'fill-in' : interaction.type);
      set(`${n}.student_response`, formatAnswer(interaction.response, 'scorm12'));
      if (interaction.correct !== undefined)
        set(`${n}.correct_responses.0.pattern`, formatAnswer(interaction.correct, 'scorm12'));
      set(`${n}.result`, interaction.result);
      if (interaction.latency !== undefined) set(`${n}.latency`, scorm12Time(interaction.latency));
    },
    commit() {
      if (connected && api) check('saving', api.LMSCommit(''));
    },
    terminate(sessionSeconds, complete) {
      if (!connected || !api) return;
      set('cmi.core.session_time', scorm12Time(sessionSeconds));
      // "suspend" tells the LMS the learner will be back to carry on.
      set('cmi.core.exit', complete ? '' : 'suspend');
      check('saving', api.LMSCommit(''));
      check('finishing', api.LMSFinish(''));
      connected = false;
    },
  };
}

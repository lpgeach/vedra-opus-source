import type { Tracking } from '@vedraopus/model';

/** Where the learner stands, as the engine knows it. */
export interface TrackingState {
  complete: boolean;
  /** Set by graded results (P7); until then always unknown. */
  success: 'unknown' | 'passed' | 'failed';
  /** Slides seen, from 0 to 1. */
  progress: number;
  /** The tracked result's score, once its slide is reached (P7.7). */
  score?: { raw: number; max: number };
}

/** What an LMS is told, in the forms the standards use. */
export interface ReportedStatus {
  /** SCORM 2004, xAPI and cmi5 keep completion and success apart. */
  completion: 'completed' | 'incomplete';
  success: 'passed' | 'failed' | 'unknown';
  /** SCORM 1.2 has one field for both. */
  lessonStatus: 'completed' | 'incomplete' | 'passed' | 'failed';
}

/**
 * The status to report for the course's reporting pair. Before completion it is
 * incomplete. Once complete it is the pair's first word; with no graded result
 * (no quiz) completing the course counts as passing it. A failed result
 * reports `failed` where the pair has it, and `incomplete` where it does not.
 */
export function reportStatus(
  reporting: Tracking['reporting'],
  state: TrackingState,
): ReportedStatus {
  const [done, otherwise] = reporting.split('-') as [
    'completed' | 'passed',
    'incomplete' | 'failed',
  ];
  if (state.success === 'failed') {
    const lessonStatus = otherwise === 'failed' ? 'failed' : 'incomplete';
    return {
      completion: state.complete ? 'completed' : 'incomplete',
      success: 'failed',
      lessonStatus,
    };
  }
  if (!state.complete)
    return { completion: 'incomplete', success: state.success, lessonStatus: 'incomplete' };
  const success = state.success === 'passed' || done === 'passed' ? 'passed' : 'unknown';
  return { completion: 'completed', success, lessonStatus: done };
}

import type { ReportedStatus } from '@vedraopus/engine';

/**
 * What a course needs from any LMS standard (plan section 8, Phase 5). The
 * plan's `setCompletion` and `setSuccess` are one call, `setStatus`, because
 * the engine's `reportStatus` already works out both and SCORM 1.2 has a
 * single field for them.
 */
export interface LmsDriver {
  /** Connect. False when there is no LMS to talk to; the course then plays untracked. */
  init(): boolean;
  /** True when the LMS says this is a return visit with saved data. */
  isResuming(): boolean;
  getBookmark(): string;
  setBookmark(location: string): void;
  getSuspendData(): string;
  setSuspendData(data: string): void;
  /** Longest suspend data the standard allows. */
  readonly suspendLimit: number;
  setStatus(status: ReportedStatus): void;
  /** Quiz results (P7). */
  setScore(raw: number, min: number, max: number): void;
  recordInteraction(interaction: LmsInteraction): void;
  commit(): void;
  /** Report the time spent and how the learner left, then disconnect. */
  terminate(sessionSeconds: number, complete: boolean): void;
  /**
   * For standards that keep saved data on a server (xAPI): load it, so the
   * getters above can answer. Called after a successful `init`, before the
   * course mounts. It never rejects.
   */
  ready?(): Promise<void>;
  /** A slide was entered (the first included), for standards that record it. */
  slideEntered?(slide: { id: string; title: string; index: number }): void;
  /** Where to send the learner once they exit, if the LMS said (cmi5's return URL). */
  exitUrl?(): string | null;
}

/**
 * A learner's answer, or the right one, as parts (docs/briefs/P7.7-result-slides.md):
 * each driver writes it the way its standard does (`formatAnswer`).
 */
export type InteractionAnswer =
  /** Choices, steps in order, or a Likert point: letters by position. */
  | { kind: 'list'; items: string[] }
  /** Matching: each item's letter with its match's. */
  | { kind: 'pairs'; pairs: [string, string][] }
  /** Typed words, or a number. */
  | { kind: 'text'; text: string }
  | { kind: 'bool'; value: boolean };

/**
 * An answer as SCORM 1.2 writes it (`a,b`, `a.b`, `t`; 255 characters at
 * most), or as SCORM 2004 and xAPI do (`a[,]b`, `a[.]b`, `true`).
 */
export function formatAnswer(answer: InteractionAnswer, style: 'scorm12' | 'scorm2004'): string {
  const old = style === 'scorm12';
  const [comma, dot] = old ? [',', '.'] : ['[,]', '[.]'];
  switch (answer.kind) {
    case 'list':
      return answer.items.join(comma);
    case 'pairs':
      return answer.pairs.map(([item, match]) => `${item}${dot}${match}`).join(comma);
    case 'text':
      return old ? answer.text.slice(0, 255) : answer.text.slice(0, 4000);
    case 'bool':
      return old ? (answer.value ? 't' : 'f') : String(answer.value);
  }
}

/** One answered question (P7). */
export interface LmsInteraction {
  id: string;
  type:
    | 'true-false'
    | 'choice'
    | 'fill-in'
    | 'long-fill-in'
    | 'matching'
    | 'performance'
    | 'sequencing'
    | 'likert'
    | 'numeric';
  response: InteractionAnswer;
  correct?: InteractionAnswer;
  result: 'correct' | 'wrong' | 'unanticipated' | 'neutral';
  /** Seconds the learner took. */
  latency?: number;
}

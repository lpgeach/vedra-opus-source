import { describe, expect, it } from 'vitest';
import {
  findScorm2004Api,
  interactionId,
  scaledScore,
  scorm2004Driver,
  scorm2004Time,
} from './scorm2004';
import type { Scorm2004Api } from './scorm2004';

/** A recording SCORM 2004 API, like an LMS's. */
function mockApi(start: Record<string, string> = {}) {
  const values: Record<string, string> = {
    'cmi.completion_status': 'unknown',
    'cmi.success_status': 'unknown',
    'cmi.entry': 'ab-initio',
    ...start,
  };
  const calls: string[] = [];
  const api: Scorm2004Api = {
    Initialize: () => (calls.push('Initialize'), 'true'),
    Terminate: () => (calls.push('Terminate'), 'true'),
    GetValue: (element) => (calls.push(`get ${element}`), values[element] ?? ''),
    SetValue: (element, value) => {
      calls.push(`set ${element}=${value}`);
      if (element === 'cmi.location' && value.length > 1000) return 'false';
      values[element] = value;
      return 'true';
    },
    Commit: () => (calls.push('Commit'), 'true'),
    GetLastError: () => '405',
    GetErrorString: () => 'Data Model Element Type Mismatch',
  };
  return { api, values, calls };
}

/** Windows linked the way frames are: each its own parent at the top. */
function frames(depth: number, api?: Scorm2004Api, at = depth) {
  const list: Record<string, unknown>[] = [];
  for (let i = 0; i <= depth; i++) list.push({});
  list.forEach((w, i) => {
    w['parent'] = list[i + 1] ?? w;
    if (api && i === at) w['API_1484_11'] = api;
  });
  return list.map((w) => w as unknown as Window);
}

const status = (
  completion: 'completed' | 'incomplete',
  success: 'passed' | 'failed' | 'unknown' = 'unknown',
) => ({ completion, success, lessonStatus: completion }) as const;

describe('finding the SCORM 2004 API', () => {
  it('as API_1484_11 on the window, a parent, or through the opener; not the 1.2 API', () => {
    const { api } = mockApi();
    expect(findScorm2004Api(frames(0, api)[0]!)).toBe(api);
    expect(findScorm2004Api(frames(5, api, 3)[0]!)).toBe(api);
    const [course] = frames(0);
    (course as unknown as Record<string, unknown>)['opener'] = frames(2, api)[0];
    expect(findScorm2004Api(course!)).toBe(api);
    // A SCORM 1.2 LMS's `API` is not mistaken for it.
    const old = frames(1)[0] as unknown as Record<string, unknown>;
    old['API'] = { LMSInitialize: () => 'true' };
    expect(findScorm2004Api(old as unknown as Window)).toBeNull();
  });
});

describe('SCORM 2004 values', () => {
  it('writes times as ISO 8601 durations, rounded to hundredths first', () => {
    expect(scorm2004Time(0)).toBe('PT0S');
    expect(scorm2004Time(12)).toBe('PT12S');
    expect(scorm2004Time(3725.456)).toBe('PT1H2M5.46S');
    expect(scorm2004Time(59.999)).toBe('PT1M');
    expect(scorm2004Time(3600)).toBe('PT1H');
    expect(scorm2004Time(3599.996)).toBe('PT1H');
    expect(scorm2004Time(90061.5)).toBe('PT25H1M1.5S');
    expect(scorm2004Time(-3)).toBe('PT0S');
  });

  it('scales a score to −1…1, to seven places, and not at all when max equals min', () => {
    expect(scaledScore(8, 0, 10)).toBe(0.8);
    expect(scaledScore(1, 0, 3)).toBe(0.3333333);
    expect(scaledScore(15, 0, 10)).toBe(1);
    expect(scaledScore(-20, -10, 10)).toBe(-0.5);
    expect(scaledScore(-40, -10, 10)).toBe(-1);
    expect(scaledScore(5, 5, 5)).toBeNull();
  });

  it('keeps URI interaction ids and turns anything else into a URN', () => {
    expect(interactionId('urn:example:q1')).toBe('urn:example:q1');
    expect(interactionId('https://example.com/q/1')).toBe('https://example.com/q/1');
    expect(interactionId('q1')).toBe('urn:vedraopus:interaction:q1');
    expect(interactionId('Question 1 (é)')).toBe('urn:vedraopus:interaction:Question_1_(_)');
    expect(interactionId('')).toBe('urn:vedraopus:interaction:_');
  });
});

describe('the SCORM 2004 driver', () => {
  it('starts an attempt, saves, and finishes with ISO time and exit', () => {
    const { api, values, calls } = mockApi();
    const warnings: string[] = [];
    const driver = scorm2004Driver(frames(1, api)[0]!, (m) => warnings.push(m));
    expect(driver.suspendLimit).toBe(64000);
    expect(driver.init()).toBe(true);
    expect(values['cmi.completion_status']).toBe('incomplete');
    expect(driver.isResuming()).toBe(false);
    driver.setSuspendData('E1.abc');
    driver.setBookmark('3');
    driver.setStatus(status('incomplete'));
    driver.commit();
    driver.terminate(61.5, false);
    expect(values).toMatchObject({
      'cmi.suspend_data': 'E1.abc',
      'cmi.location': '3',
      'cmi.completion_status': 'incomplete',
      'cmi.success_status': 'unknown',
      'cmi.session_time': 'PT1M1.5S',
      'cmi.exit': 'suspend',
    });
    expect(calls[0]).toBe('Initialize');
    expect(calls.slice(-4)).toEqual([
      'set cmi.session_time=PT1M1.5S',
      'set cmi.exit=suspend',
      'Commit',
      'Terminate',
    ]);
    expect(warnings).toEqual([]);
  });

  it('reports completion and success apart, and exits normally once complete', () => {
    const { api, values } = mockApi();
    const driver = scorm2004Driver(frames(0, api)[0]!, () => undefined);
    driver.init();
    driver.setStatus(status('completed', 'passed'));
    driver.terminate(1, true);
    expect(values).toMatchObject({
      'cmi.completion_status': 'completed',
      'cmi.success_status': 'passed',
      'cmi.exit': 'normal',
    });
  });

  it('keeps 4,000 characters for the 2nd edition, 64,000 for the 3rd and 4th', () => {
    const window = frames(0)[0]!;
    expect(scorm2004Driver(window, () => undefined, 2).suspendLimit).toBe(4000);
    expect(scorm2004Driver(window, () => undefined, 3).suspendLimit).toBe(64000);
    expect(scorm2004Driver(window, () => undefined, 4).suspendLimit).toBe(64000);
  });

  it('never marks a learner who finished as incomplete, or a graded one as unknown', () => {
    // Back on a new attempt, after starting over, or with resume set to never:
    // the engine starts fresh, but the LMS already holds the earned status.
    const { api, values, calls } = mockApi({
      'cmi.completion_status': 'completed',
      'cmi.success_status': 'passed',
    });
    const driver = scorm2004Driver(frames(0, api)[0]!, () => undefined);
    driver.init();
    driver.setStatus(status('incomplete'));
    expect(values['cmi.completion_status']).toBe('completed');
    expect(values['cmi.success_status']).toBe('passed');
    expect(calls.filter((c) => c.startsWith('set '))).toEqual([]);
    // A graded result can still change.
    driver.setStatus(status('completed', 'failed'));
    expect(values['cmi.success_status']).toBe('failed');

    // Within one session too: once written, completion stays.
    const fresh = mockApi();
    const again = scorm2004Driver(frames(0, fresh.api)[0]!, () => undefined);
    again.init();
    again.setStatus(status('completed'));
    again.setStatus(status('incomplete'));
    expect(fresh.values['cmi.completion_status']).toBe('completed');
  });

  it('reports what the LMS refuses as a warning, and plays untracked without an LMS', () => {
    const { api } = mockApi();
    const warnings: string[] = [];
    const driver = scorm2004Driver(frames(0, api)[0]!, (m) => warnings.push(m));
    driver.init();
    driver.setBookmark('x'.repeat(1001));
    expect(warnings).toEqual([
      'The LMS refused cmi.location: Data Model Element Type Mismatch (405)',
    ]);

    const none: string[] = [];
    const missing = scorm2004Driver(frames(2)[0]!, (m) => none.push(m));
    expect(missing.init()).toBe(false);
    expect(none).toEqual([expect.stringContaining('No SCORM 2004 LMS')]);
    missing.setSuspendData('x');
    missing.terminate(1, true);
  });

  it('records score and interactions in SCORM 2004’s fields', () => {
    const { api, values, calls } = mockApi();
    const driver = scorm2004Driver(frames(0, api)[0]!, () => undefined);
    driver.init();
    driver.setScore(8, 0, 10);
    driver.recordInteraction({
      id: 'q1',
      type: 'choice',
      // Parts, written in the standard's form (P7.7).
      response: { kind: 'list', items: ['b'] },
      correct: { kind: 'list', items: ['b'] },
      result: 'wrong',
      latency: 12,
    });
    expect(values).toMatchObject({
      'cmi.score.scaled': '0.8',
      'cmi.score.raw': '8',
      'cmi.score.min': '0',
      'cmi.score.max': '10',
      'cmi.interactions.0.id': 'urn:vedraopus:interaction:q1',
      'cmi.interactions.0.type': 'choice',
      'cmi.interactions.0.learner_response': 'b',
      'cmi.interactions.0.correct_responses.0.pattern': 'b',
      'cmi.interactions.0.result': 'incorrect',
      'cmi.interactions.0.latency': 'PT12S',
    });
    // The id is written before anything else about the interaction.
    const first = calls.findIndex((c) => c.startsWith('set cmi.interactions.0.'));
    expect(calls[first]).toMatch(/^set cmi\.interactions\.0\.id=/);
  });
});

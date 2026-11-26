import { describe, expect, it } from 'vitest';
import { findScorm12Api, scorm12Driver, scorm12Time } from './scorm12';
import type { Scorm12Api } from './scorm12';

/** A recording SCORM 1.2 API, like an LMS's. */
function mockApi(start: Record<string, string> = {}) {
  const values: Record<string, string> = { 'cmi.core.lesson_status': 'not attempted', ...start };
  const calls: string[] = [];
  const api: Scorm12Api = {
    LMSInitialize: () => (calls.push('LMSInitialize'), 'true'),
    LMSFinish: () => (calls.push('LMSFinish'), 'true'),
    LMSGetValue: (element) => (calls.push(`get ${element}`), values[element] ?? ''),
    LMSSetValue: (element, value) => {
      calls.push(`set ${element}=${value}`);
      if (element === 'cmi.core.lesson_status' && value === 'bad') return 'false';
      values[element] = value;
      return 'true';
    },
    LMSCommit: () => (calls.push('LMSCommit'), 'true'),
    LMSGetLastError: () => '405',
    LMSGetErrorString: () => 'Incorrect data type',
  };
  return { api, values, calls };
}

/** Windows linked the way frames are: each its own parent at the top. */
function frames(depth: number, api?: Scorm12Api, at = depth) {
  const list: Record<string, unknown>[] = [];
  for (let i = 0; i <= depth; i++) list.push({});
  list.forEach((w, i) => {
    w['parent'] = list[i + 1] ?? w;
    if (api && i === at) w['API'] = api;
  });
  return list.map((w) => w as unknown as Window);
}

describe('finding the SCORM 1.2 API', () => {
  it('on the window itself or any parent, up to the top', () => {
    const { api } = mockApi();
    expect(findScorm12Api(frames(0, api)[0]!)).toBe(api);
    expect(findScorm12Api(frames(6, api)[0]!)).toBe(api);
    expect(findScorm12Api(frames(3, api, 2)[0]!)).toBe(api);
    expect(findScorm12Api(frames(4)[0]!)).toBeNull();
  });

  it('through the window that opened the course, and past frames it may not read', () => {
    const { api } = mockApi();
    const [course] = frames(0);
    const opener = frames(2, api)[0]!;
    (course as unknown as Record<string, unknown>)['opener'] = opener;
    expect(findScorm12Api(course!)).toBe(api);

    const blocked = frames(2, api);
    Object.defineProperty(blocked[1], 'API', {
      get() {
        throw new Error('cross-origin');
      },
    });
    expect(findScorm12Api(blocked[0]!)).toBe(api);
  });
});

describe('the SCORM 1.2 driver', () => {
  it('writes session time as HHHH:MM:SS.SS', () => {
    expect(scorm12Time(0)).toBe('0000:00:00.00');
    expect(scorm12Time(3725.456)).toBe('0001:02:05.46');
    expect(scorm12Time(59.999)).toBe('0000:01:00.00');
    expect(scorm12Time(3599.996)).toBe('0001:00:00.00');
  });

  it('starts an attempt, saves, and finishes with time and exit', () => {
    const { api, values, calls } = mockApi();
    const window = frames(1, api)[0]!;
    const warnings: string[] = [];
    const driver = scorm12Driver(window, (m) => warnings.push(m));
    expect(driver.init()).toBe(true);
    expect(values['cmi.core.lesson_status']).toBe('incomplete');
    expect(driver.isResuming()).toBe(false);
    driver.setSuspendData('E1.abc');
    driver.setBookmark('3');
    driver.setStatus({ completion: 'completed', success: 'passed', lessonStatus: 'passed' });
    driver.commit();
    driver.terminate(61.5, false);
    expect(values).toMatchObject({
      'cmi.suspend_data': 'E1.abc',
      'cmi.core.lesson_location': '3',
      'cmi.core.lesson_status': 'passed',
      'cmi.core.session_time': '0000:01:01.50',
      'cmi.core.exit': 'suspend',
    });
    expect(calls[0]).toBe('LMSInitialize');
    expect(calls.at(-1)).toBe('LMSFinish');
    expect(warnings).toEqual([]);
  });

  it('never marks a learner who finished as incomplete', () => {
    // Back on a new attempt, after starting over, or with resume set to never:
    // the engine starts fresh, but the LMS already holds the earned status.
    for (const held of ['completed', 'passed', 'failed']) {
      const { api, values } = mockApi({ 'cmi.core.lesson_status': held });
      const driver = scorm12Driver(frames(0, api)[0]!, () => undefined);
      driver.init();
      driver.setStatus({
        completion: 'incomplete',
        success: 'unknown',
        lessonStatus: 'incomplete',
      });
      expect(values['cmi.core.lesson_status']).toBe(held);
    }
    // A finished status can still change to another finished one.
    const { api, values } = mockApi({ 'cmi.core.lesson_status': 'failed' });
    const driver = scorm12Driver(frames(0, api)[0]!, () => undefined);
    driver.init();
    driver.setStatus({ completion: 'completed', success: 'passed', lessonStatus: 'passed' });
    expect(values['cmi.core.lesson_status']).toBe('passed');

    // Within one session too: once written, completion stays.
    const fresh = mockApi();
    const again = scorm12Driver(frames(0, fresh.api)[0]!, () => undefined);
    again.init();
    again.setStatus({ completion: 'completed', success: 'unknown', lessonStatus: 'completed' });
    again.setStatus({ completion: 'incomplete', success: 'unknown', lessonStatus: 'incomplete' });
    expect(fresh.values['cmi.core.lesson_status']).toBe('completed');
  });

  it('reports what the LMS refuses as a warning, and plays untracked without an LMS', () => {
    const { api } = mockApi();
    const warnings: string[] = [];
    const driver = scorm12Driver(frames(0, api)[0]!, (m) => warnings.push(m));
    driver.init();
    driver.setStatus({ completion: 'completed', success: 'unknown', lessonStatus: 'bad' as never });
    expect(warnings).toEqual([expect.stringContaining('Incorrect data type (405)')]);

    const none: string[] = [];
    const missing = scorm12Driver(frames(2)[0]!, (m) => none.push(m));
    expect(missing.init()).toBe(false);
    expect(none).toEqual([expect.stringContaining('No SCORM 1.2 LMS')]);
    // Calls without a connection do nothing.
    missing.setSuspendData('x');
    missing.terminate(1, true);
  });

  it('records score and interactions in SCORM 1.2’s fields', () => {
    const { api, values } = mockApi();
    const driver = scorm12Driver(frames(0, api)[0]!, () => undefined);
    driver.init();
    driver.setScore(8, 0, 10);
    driver.recordInteraction({
      id: 'q1',
      type: 'choice',
      // Parts, written in the standard's form (P7.7).
      response: { kind: 'list', items: ['b'] },
      correct: { kind: 'list', items: ['b'] },
      result: 'correct',
      latency: 12,
    });
    expect(values).toMatchObject({
      'cmi.core.score.raw': '8',
      'cmi.core.score.max': '10',
      'cmi.interactions.0.id': 'q1',
      'cmi.interactions.0.type': 'choice',
      'cmi.interactions.0.student_response': 'b',
      'cmi.interactions.0.correct_responses.0.pattern': 'b',
      'cmi.interactions.0.result': 'correct',
      'cmi.interactions.0.latency': '0000:00:12.00',
    });
  });
});

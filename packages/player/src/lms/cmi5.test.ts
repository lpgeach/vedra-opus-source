import { describe, expect, it } from 'vitest';
import {
  CMI5_CATEGORY,
  cmi5Driver,
  MOVEON_CATEGORY,
  parseCmi5Launch,
  readLaunchData,
} from './cmi5';
import type { XapiDeps } from './xapi';

const ACTOR = {
  objectType: 'Agent',
  name: 'Ada',
  account: { homePage: 'https://lms.example.com', name: 'ada' },
};
const REG = '6b1c3f0e-8a2d-4f5b-9c7e-0d1a2b3c4d5e';
const AU = 'https://example.com/courses/safety/au';
const SESSION = 'https://w3id.org/xapi/cmi5/context/extensions/sessionid';
const TEMPLATE = {
  contextActivities: {
    grouping: [{ objectType: 'Activity', id: 'https://example.com/courses/safety' }],
  },
  extensions: { [SESSION]: 'session-1' },
};
const query = (extra: Record<string, string> = {}) =>
  `?${new URLSearchParams({
    endpoint: 'https://lrs.example.com/xapi',
    fetch: 'https://lms.example.com/fetch/abc',
    actor: JSON.stringify(ACTOR),
    registration: REG,
    activityId: AU,
    ...extra,
  })}`;

/** A pretend cmi5 LMS and LRS. */
function fakeLms(
  launchData: object = { contextTemplate: TEMPLATE, launchMode: 'Normal', moveOn: 'Completed' },
  fetchAnswer = { status: 200, body: '{"auth-token":"dG9rZW4="}' },
) {
  const requests: { url: string; init: RequestInit }[] = [];
  const stored = new Map<string, string>();
  const deps: Partial<XapiDeps> = {
    search: query(),
    now: () => new Date('2026-11-17T10:00:00.000Z'),
    crypto: globalThis.crypto,
    setTimeout: (run, ms) => globalThis.setTimeout(run, ms),
    clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
    session: { getItem: (k) => stored.get(k) ?? null, setItem: (k, v) => void stored.set(k, v) },
    fetch: async (url, init) => {
      requests.push({ url, init });
      if (url.startsWith('https://lms.example.com/fetch'))
        return { status: fetchAnswer.status, text: async () => fetchAnswer.body };
      if (url.includes('stateId=LMS.LaunchData'))
        return { status: 200, text: async () => JSON.stringify(launchData) };
      if (init.method === 'GET') return { status: 404, text: async () => '' };
      return { status: 200, text: async () => '' };
    },
  };
  const posted = () =>
    requests
      .filter((r) => r.init.method === 'POST' && r.url.endsWith('/statements'))
      .flatMap(
        (r) => JSON.parse(r.init.body as string) as Record<string, Record<string, unknown>>[],
      );
  const verbs = () => posted().map((s) => String(s['verb']!['id']).split('/').pop());
  const settle = () => new Promise((done) => setTimeout(done, 0));
  return { deps, requests, stored, posted, verbs, settle };
}

const window = {} as Window;
const course = { activityId: 'urn:unused', title: 'Safety' };
const done = { completion: 'completed', success: 'unknown', lessonStatus: 'completed' } as const;

async function started(
  lms: ReturnType<typeof fakeLms>,
  warn: (m: string) => void = () => undefined,
) {
  const driver = cmi5Driver(window, warn, course, lms.deps);
  expect(driver.init()).toBe(true);
  await driver.ready!();
  return driver;
}

describe('cmi5 launch', () => {
  it('needs endpoint, fetch, actor, registration; activityId is the unit’s id', () => {
    expect(parseCmi5Launch(query(), 'urn:x')).toEqual({
      endpoint: 'https://lrs.example.com/xapi/',
      fetchUrl: 'https://lms.example.com/fetch/abc',
      auth: '',
      actor: ACTOR,
      registration: REG,
      activityId: AU,
    });
    expect(parseCmi5Launch(query({ fetch: '' }), 'urn:x')).toEqual({
      problem: expect.stringContaining('fetch'),
    });
    expect(parseCmi5Launch(query({ registration: '' }), 'urn:x')).toEqual({
      problem: expect.stringContaining('registration'),
    });
    expect(parseCmi5Launch(query({ actor: '{}' }), 'urn:x')).toEqual({
      problem: expect.stringContaining('actor'),
    });
  });

  it('reads the launch data the LMS left, and says what is missing', () => {
    expect(
      readLaunchData(
        JSON.stringify({
          contextTemplate: TEMPLATE,
          launchMode: 'Browse',
          moveOn: 'Passed',
          returnURL: 'https://lms.example.com/back',
          masteryScore: 0.8,
          entitlementKey: { courseStructure: 'x' },
        }),
      ),
    ).toEqual({
      contextTemplate: TEMPLATE,
      launchMode: 'Browse',
      moveOn: 'Passed',
      returnURL: 'https://lms.example.com/back',
      masteryScore: 0.8,
    });
    expect(readLaunchData('{"launchMode":"Normal"}')).toEqual({
      problem: expect.stringContaining('context template'),
    });
    expect(readLaunchData('{"contextTemplate":{},"launchMode":"Fast"}')).toEqual({
      problem: expect.stringContaining('launch mode'),
    });
    expect(readLaunchData('nope')).toEqual({ problem: expect.stringContaining('not JSON') });
  });
});

describe('the cmi5 driver', () => {
  it('trades the fetch URL for a token, reads the launch data, then sends statements with it', async () => {
    const lms = fakeLms();
    const driver = await started(lms);
    const [fetchCall, launchData, ownState] = lms.requests;
    expect(fetchCall!.url).toBe('https://lms.example.com/fetch/abc');
    expect(fetchCall!.init.method).toBe('POST');
    expect(fetchCall!.init.headers).not.toHaveProperty('Authorization');
    expect(new URL(launchData!.url).searchParams.get('stateId')).toBe('LMS.LaunchData');
    expect(new URL(launchData!.url).searchParams.get('activityId')).toBe(AU);
    expect(launchData!.init.headers).toMatchObject({ Authorization: 'Basic dG9rZW4=' });
    expect(new URL(ownState!.url).searchParams.get('stateId')).toBe('vedraopus.session');
    driver.slideEntered!({ id: 's1', title: 'One', index: 0 });
    driver.setStatus(done);
    driver.commit();
    await lms.settle();
    driver.terminate(30, true);
    await lms.settle();
    expect(lms.verbs()).toEqual(['initialized', 'experienced', 'completed', 'terminated']);
    for (const r of lms.requests.slice(1))
      expect(r.init.headers).toMatchObject({ Authorization: 'Basic dG9rZW4=' });
  });

  it('builds every statement on the context template; cmi5-defined ones carry the cmi5 category', async () => {
    const lms = fakeLms();
    const driver = await started(lms);
    driver.slideEntered!({ id: 's1', title: 'One', index: 0 });
    driver.setStatus(done);
    driver.terminate(30, true);
    await lms.settle();
    const [initialized, experienced, completed, terminated] = lms.posted();
    for (const s of lms.posted()) {
      expect(s['context']).toMatchObject({
        registration: REG,
        extensions: { [SESSION]: 'session-1' },
        contextActivities: { grouping: TEMPLATE.contextActivities.grouping },
      });
      expect(s['object']!['id']).toMatch(AU);
    }
    const categories = (s: Record<string, Record<string, unknown>> | undefined) =>
      (s!['context']!['contextActivities'] as { category?: unknown[] }).category;
    expect(categories(initialized)).toEqual([CMI5_CATEGORY]);
    expect(categories(completed)).toEqual([CMI5_CATEGORY, MOVEON_CATEGORY]);
    expect(categories(terminated)).toEqual([CMI5_CATEGORY]);
    // "experienced" is a cmi5 allowed statement: the template's context, no cmi5 category.
    expect(categories(experienced)).toBeUndefined();
    // Completed carries the time since initialized; terminated the session's length.
    expect(completed!['result']).toEqual({ completion: true, duration: 'PT0S' });
    expect(terminated!['result']).toEqual({ duration: 'PT30S', completion: true });
  });

  it('reuses the token after a reload, since the fetch URL answers only once', async () => {
    const lms = fakeLms();
    await started(lms);
    await started(lms);
    expect(lms.requests.filter((r) => r.url.includes('/fetch/')).length).toBe(1);
  });

  it('does not track when the LMS gives no token or no launch data', async () => {
    const refused = fakeLms(undefined, {
      status: 400,
      body: '{"error-code":"1","error-text":"Already used"}',
    });
    const warnings: string[] = [];
    const driver = await started(refused, (m) => warnings.push(m));
    driver.setStatus(done);
    driver.commit();
    driver.terminate(1, true);
    await refused.settle();
    expect(warnings).toEqual([expect.stringContaining('no access token: Already used')]);
    expect(refused.posted()).toEqual([]);

    const empty = fakeLms({ launchMode: 'Normal' });
    const more: string[] = [];
    await started(empty, (m) => more.push(m));
    expect(more).toEqual([expect.stringContaining('no context template')]);
    expect(empty.posted()).toEqual([]);
  });

  it('in Browse and Review modes, sends no completed, passed or failed', async () => {
    for (const launchMode of ['Browse', 'Review']) {
      const lms = fakeLms({ contextTemplate: TEMPLATE, launchMode, moveOn: 'Completed' });
      const driver = await started(lms);
      driver.setStatus({ completion: 'completed', success: 'passed', lessonStatus: 'passed' });
      driver.terminate(1, true);
      await lms.settle();
      expect(lms.verbs()).toEqual(['initialized', 'terminated']);
    }
  });

  it('passes on completion when moveOn needs a pass and nothing was graded', async () => {
    for (const moveOn of ['Passed', 'CompletedAndPassed']) {
      const lms = fakeLms({ contextTemplate: TEMPLATE, launchMode: 'Normal', moveOn });
      const driver = await started(lms);
      driver.setStatus(done);
      driver.commit();
      await lms.settle();
      expect(lms.verbs()).toEqual(['initialized', 'completed', 'passed']);
      const passed = lms.posted()[2]!;
      expect(passed['result']).toEqual({ success: true, duration: 'PT0S' });
    }
    const either = fakeLms({
      contextTemplate: TEMPLATE,
      launchMode: 'Normal',
      moveOn: 'CompletedOrPassed',
    });
    const driver = await started(either);
    driver.setStatus(done);
    driver.commit();
    await either.settle();
    expect(either.verbs()).toEqual(['initialized', 'completed']);
  });

  it('never fails a learner who has passed, and offers the return URL on exit', async () => {
    const lms = fakeLms({
      contextTemplate: TEMPLATE,
      launchMode: 'Normal',
      moveOn: 'Passed',
      returnURL: 'https://lms.example.com/back',
    });
    const driver = await started(lms);
    driver.setStatus({ completion: 'completed', success: 'passed', lessonStatus: 'passed' });
    driver.setStatus({ completion: 'completed', success: 'failed', lessonStatus: 'failed' });
    driver.commit();
    await lms.settle();
    expect(lms.verbs()).toEqual(['initialized', 'completed', 'passed']);
    expect(driver.exitUrl!()).toBe('https://lms.example.com/back');
  });
});

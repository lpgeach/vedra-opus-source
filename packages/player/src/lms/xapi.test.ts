import { describe, expect, it } from 'vitest';
import {
  deliveryOutcome,
  parseActor,
  parseLaunch,
  readState,
  retryDelay,
  STATE_ID,
  statusChange,
  uuid,
  xapiDriver,
} from './xapi';
import type { XapiDeps } from './xapi';

const ACTOR = { objectType: 'Agent', name: 'Ada', mbox: 'mailto:ada@example.com' };
const REG = '6b1c3f0e-8a2d-4f5b-9c7e-0d1a2b3c4d5e';
const launchQuery = (extra: Record<string, string> = {}) =>
  `?${new URLSearchParams({
    endpoint: 'https://lrs.example.com/xapi',
    auth: 'Basic YWJjOmRlZg==',
    actor: JSON.stringify(ACTOR),
    registration: REG,
    ...extra,
  })}`;

/** A pretend LRS: answers with `statuses` in turn (null = network failure), then 200. */
function fakeLrs(
  statuses: (number | null)[] = [],
  state: { status: number; body: string } = { status: 404, body: '' },
) {
  const requests: { url: string; init: RequestInit }[] = [];
  const timers: { run: () => void; cleared: boolean }[] = [];
  const delays: number[] = [];
  let bytes = 0;
  const deps: Partial<XapiDeps> = {
    search: launchQuery(),
    now: () => new Date('2026-11-17T10:00:00.000Z'),
    crypto: {
      getRandomValues: <T extends ArrayBufferView | null>(array: T) => {
        const view = array as unknown as Uint8Array;
        for (let i = 0; i < view.length; i++) view[i] = (bytes++ * 37) & 0xff;
        return array;
      },
    },
    setTimeout: (run, ms) => {
      delays.push(ms);
      timers.push({ run, cleared: false });
      return timers.length - 1;
    },
    clearTimeout: (handle) => {
      timers[handle as number]!.cleared = true;
    },
    fetch: async (url, init) => {
      requests.push({ url, init });
      if (init.method === 'GET') return { status: state.status, text: async () => state.body };
      const status = statuses.shift();
      if (status === null) throw new TypeError('network');
      return { status: status ?? 200, text: async () => '' };
    },
  };
  /** Statements posted, in order (each batch's statements). */
  const posted = () =>
    requests
      .filter((r) => r.init.method === 'POST')
      .flatMap((r) => JSON.parse(r.init.body as string) as { id: string; verb: { id: string } }[]);
  const settle = () => new Promise((done) => setTimeout(done, 0));
  /** Timers set and not cleared or run. */
  const pending = () => timers.filter((t) => !t.cleared);
  /** Run the one pending timer (a retry). */
  const runRetry = () => {
    const [timer, ...more] = pending();
    expect(more).toEqual([]);
    timer!.cleared = true;
    timer!.run();
  };
  return { deps, requests, posted, pending, runRetry, delays, settle };
}

const window = {} as Window;
const course = { activityId: 'urn:vedraopus:course:p1', title: 'Safety' };
const verbs = (list: { verb: { id: string } }[]) => list.map((s) => s.verb.id.split('/').pop());

describe('xAPI launch', () => {
  it('reads endpoint, auth, actor, registration and activity id from the address', () => {
    const launch = parseLaunch(launchQuery({ activity_id: 'https://example.com/c/1' }), 'urn:x');
    expect(launch).toEqual({
      endpoint: 'https://lrs.example.com/xapi/',
      auth: 'Basic YWJjOmRlZg==',
      actor: ACTOR,
      registration: REG,
      activityId: 'https://example.com/c/1',
    });
    expect(parseLaunch(launchQuery(), 'urn:x')).toMatchObject({ activityId: 'urn:x' });
  });

  it('says why tracking cannot start, and leaves out a registration that is not a UUID', () => {
    expect(parseLaunch('?actor=%7B%7D', 'urn:x')).toEqual({
      problem: expect.stringContaining('endpoint'),
    });
    expect(parseLaunch('?endpoint=https://l/&actor=nonsense', 'urn:x')).toEqual({
      problem: expect.stringContaining('actor'),
    });
    const warnings: string[] = [];
    const launch = parseLaunch(launchQuery({ registration: 'attempt-1' }), 'urn:x', (m) =>
      warnings.push(m),
    );
    expect(launch).not.toHaveProperty('registration');
    expect(warnings).toEqual([expect.stringContaining('not a UUID')]);
  });

  it('accepts the older actor form with arrays, and keeps exactly one identifier', () => {
    expect(parseActor('{"name":["Ada"],"mbox":["mailto:ada@example.com"]}')).toEqual(ACTOR);
    expect(parseActor('{"mbox":"ada@example.com"}')).toEqual({
      objectType: 'Agent',
      mbox: 'mailto:ada@example.com',
    });
    expect(
      parseActor(
        '{"name":["Ada"],"account":[{"accountServiceHomePage":"https://lms.example.com","accountName":"a1"}]}',
      ),
    ).toEqual({
      objectType: 'Agent',
      name: 'Ada',
      account: { homePage: 'https://lms.example.com', name: 'a1' },
    });
    // Two identifiers: the mailbox wins, the other is left out.
    expect(parseActor('{"mbox":"mailto:a@b.c","openid":"https://id.example.com/a"}')).toEqual({
      objectType: 'Agent',
      mbox: 'mailto:a@b.c',
    });
    expect(parseActor('{"name":"Nobody"}')).toBeNull();
    expect(parseActor('[1]')).toBeNull();
  });
});

describe('xAPI values', () => {
  it('makes version 4 UUIDs', () => {
    const id = uuid(globalThis.crypto);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuid(globalThis.crypto)).not.toBe(id);
  });

  it('retries when the LRS is unreachable or busy, drops what it refuses, backing off to 30 s', () => {
    expect([200, 204, null, 429, 500, 503, 400, 401, 403, 409].map(deliveryOutcome)).toEqual([
      'done',
      'done',
      'retry',
      'retry',
      'retry',
      'retry',
      'drop',
      'drop',
      'drop',
      'drop',
    ]);
    // 2^0 … 2^4 seconds, then capped: 2^5 = 32 > 30.
    expect([0, 1, 2, 3, 4, 5, 9].map(retryDelay)).toEqual([1, 2, 4, 8, 16, 30, 30]);
  });

  it('sends a status statement only when the status moves on', () => {
    const none = { completion: 'incomplete', success: 'unknown' } as const;
    const done = { completion: 'completed', success: 'unknown' } as const;
    expect(statusChange(none, none)).toEqual({ verbs: [], reached: none });
    expect(statusChange(none, done)).toEqual({ verbs: ['completed'], reached: done });
    expect(statusChange(done, done).verbs).toEqual([]);
    // Starting over after completing: completion is kept, nothing is sent.
    expect(statusChange(done, none)).toEqual({ verbs: [], reached: done });
    expect(statusChange(none, { completion: 'completed', success: 'passed' }).verbs).toEqual([
      'completed',
      'passed',
    ]);
    const passed = { completion: 'completed', success: 'passed' } as const;
    expect(statusChange(passed, { completion: 'completed', success: 'failed' }).verbs).toEqual([
      'failed',
    ]);
    expect(statusChange(passed, done).reached).toEqual(passed);
  });

  it('reads only a state document of the expected shape', () => {
    expect(
      readState(
        '{"v":1,"data":"E1.x","location":"2","status":{"completion":"completed","success":"unknown"}}',
      ),
    ).toEqual({
      v: 1,
      data: 'E1.x',
      location: '2',
      status: { completion: 'completed', success: 'unknown' },
    });
    expect(readState('{"v":1,"data":5,"status":{"completion":"done"}}')).toEqual({ v: 1 });
    expect(readState('null')).toEqual({ v: 1 });
    expect(readState('not json')).toEqual({ v: 1 });
    expect(readState('{"v":2,"data":"x"}')).toEqual({ v: 1 });
  });
});

describe('the xAPI driver', () => {
  it('loads state, then records initialized, slides, completion and terminated as valid statements', async () => {
    const lrs = fakeLrs();
    const driver = xapiDriver(window, () => undefined, course, lrs.deps);
    expect(driver.init()).toBe(true);
    await driver.ready!();
    expect(driver.isResuming()).toBe(false);
    driver.slideEntered!({ id: 'slide_a', title: 'Welcome', index: 0 });
    driver.setStatus({ completion: 'completed', success: 'unknown', lessonStatus: 'completed' });
    driver.setSuspendData('E1.abc');
    driver.setBookmark('2');
    driver.commit();
    await lrs.settle();
    driver.terminate(65.5, true);
    await lrs.settle();

    const all = lrs.posted();
    expect(verbs(all)).toEqual(['initialized', 'experienced', 'completed', 'terminated']);
    for (const s of all as Record<string, unknown>[]) {
      expect(s['id']).toMatch(/^[0-9a-f-]{36}$/);
      expect(s['timestamp']).toBe('2026-11-17T10:00:00.000Z');
      expect(s['actor']).toEqual(ACTOR);
      expect(s['context']).toMatchObject({ registration: REG });
    }
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length);
    const [, slide, completed, terminated] = all as unknown as Record<
      string,
      Record<string, unknown>
    >[];
    expect(slide!['object']).toEqual({
      objectType: 'Activity',
      id: 'urn:vedraopus:course:p1/slides/slide_a',
      definition: {
        name: { 'en-US': 'Welcome' },
        type: 'http://id.tincanapi.com/activitytype/slide',
      },
    });
    expect(slide!['context']).toMatchObject({
      contextActivities: { parent: [{ objectType: 'Activity', id: 'urn:vedraopus:course:p1' }] },
    });
    expect(completed!['result']).toEqual({ completion: true });
    expect(terminated!['result']).toEqual({ duration: 'PT1M5.5S', completion: true });

    const first = lrs.requests[0]!;
    expect(first.init.method).toBe('GET');
    const stateUrl = new URL(first.url);
    expect(stateUrl.origin + stateUrl.pathname).toBe(
      'https://lrs.example.com/xapi/activities/state',
    );
    expect(Object.fromEntries(stateUrl.searchParams)).toEqual({
      activityId: 'urn:vedraopus:course:p1',
      agent: JSON.stringify(ACTOR),
      stateId: STATE_ID,
      registration: REG,
    });
    for (const request of lrs.requests) {
      expect(request.init.headers).toMatchObject({
        Authorization: 'Basic YWJjOmRlZg==',
        'X-Experience-API-Version': '1.0.3',
      });
    }
    const put = lrs.requests.find((r) => r.init.method === 'PUT')!;
    expect(JSON.parse(put.init.body as string)).toEqual({
      v: 1,
      data: 'E1.abc',
      location: '2',
      status: { completion: 'completed', success: 'unknown' },
    });
    // The last requests go out as the page closes.
    expect(lrs.requests.at(-1)!.init.keepalive).toBe(true);
  });

  it('resumes from saved state without announcing a completion again', async () => {
    const lrs = fakeLrs([], {
      status: 200,
      body: JSON.stringify({
        v: 1,
        data: 'E1.saved',
        location: '3',
        status: { completion: 'completed', success: 'unknown' },
      }),
    });
    const driver = xapiDriver(window, () => undefined, course, lrs.deps);
    driver.init();
    await driver.ready!();
    expect(driver.isResuming()).toBe(true);
    expect(driver.getSuspendData()).toBe('E1.saved');
    expect(driver.getBookmark()).toBe('3');
    driver.setStatus({ completion: 'completed', success: 'unknown', lessonStatus: 'completed' });
    driver.commit();
    await lrs.settle();
    expect(verbs(lrs.posted())).toEqual(['initialized']);
  });

  it('keeps statements through failures and sends each once the LRS answers, in order', async () => {
    // The first POST fails on the network, the second gets 503, then all is well.
    const lrs = fakeLrs([null, 503]);
    const warnings: string[] = [];
    const driver = xapiDriver(window, (m) => warnings.push(m), course, lrs.deps);
    driver.init();
    await driver.ready!();
    await lrs.settle();
    driver.slideEntered!({ id: 's1', title: 'One', index: 0 });
    driver.commit(); // waits for the retry already planned
    await lrs.settle();
    expect(lrs.delays.slice(-1)).toEqual([1000]);
    lrs.runRetry();
    await lrs.settle();
    expect(lrs.delays.slice(-1)).toEqual([2000]);
    lrs.runRetry();
    await lrs.settle();
    const batches = lrs.requests
      .filter((r) => r.init.method === 'POST')
      .map((r) => verbs(JSON.parse(r.init.body as string)));
    expect(batches).toEqual([
      ['initialized'],
      ['initialized', 'experienced'],
      ['initialized', 'experienced'],
    ]);
    // Retries repeat the same statements (same ids), so the LRS records each once.
    const ids = lrs.requests
      .filter((r) => r.init.method === 'POST')
      .map((r) => (JSON.parse(r.init.body as string) as { id: string }[])[0]!.id);
    expect(new Set(ids).size).toBe(1);
    expect(warnings).toEqual([]);
  });

  it('drops a batch the LRS refuses outright, with a warning, and carries on', async () => {
    const lrs = fakeLrs([400]);
    const warnings: string[] = [];
    const driver = xapiDriver(window, (m) => warnings.push(m), course, lrs.deps);
    driver.init();
    await driver.ready!();
    await lrs.settle();
    expect(warnings).toEqual([expect.stringContaining('refused 1 statement')]);
    driver.slideEntered!({ id: 's1', title: 'One', index: 0 });
    driver.commit();
    await lrs.settle();
    expect(verbs(lrs.posted())).toEqual(['initialized', 'experienced']);
    expect(lrs.pending()).toEqual([]);
  });

  it('never overwrites saved progress it could not read', async () => {
    const lrs = fakeLrs([], { status: 500, body: '' });
    const warnings: string[] = [];
    const driver = xapiDriver(window, (m) => warnings.push(m), course, lrs.deps);
    driver.init();
    await driver.ready!();
    expect(warnings).toEqual([expect.stringContaining('would not return saved progress (500)')]);
    driver.setSuspendData('E1.fresh');
    driver.commit();
    await lrs.settle();
    driver.terminate(1, false);
    expect(lrs.requests.filter((r) => r.init.method === 'PUT')).toEqual([]);
    // Statements still go.
    expect(verbs(lrs.posted())).toEqual(['initialized', 'terminated']);
  });

  it('plays untracked without launch details', () => {
    const warnings: string[] = [];
    const driver = xapiDriver(window, (m) => warnings.push(m), course, { search: '' });
    expect(driver.init()).toBe(false);
    expect(warnings).toEqual([expect.stringContaining('not being tracked')]);
  });

  it('records an answer as an interaction activity under the course', async () => {
    const lrs = fakeLrs();
    const driver = xapiDriver(window, () => undefined, course, lrs.deps);
    driver.init();
    await driver.ready!();
    driver.setScore(8, 0, 10);
    driver.recordInteraction({
      id: 'q 1',
      type: 'choice',
      // Parts, written in the standard's form (P7.7).
      response: { kind: 'list', items: ['b'] },
      correct: { kind: 'list', items: ['b'] },
      result: 'correct',
      latency: 12,
    });
    driver.setStatus({ completion: 'completed', success: 'passed', lessonStatus: 'passed' });
    driver.commit();
    await lrs.settle();
    const [, answered, , passed] = lrs.posted() as unknown as Record<
      string,
      Record<string, unknown>
    >[];
    expect(answered!['object']).toEqual({
      objectType: 'Activity',
      id: 'urn:vedraopus:course:p1/interactions/q%201',
      definition: {
        type: 'http://adlnet.gov/expapi/activities/cmi.interaction',
        interactionType: 'choice',
        correctResponsesPattern: ['b'],
      },
    });
    expect(answered!['result']).toEqual({ response: 'b', success: true, duration: 'PT12S' });
    expect(passed!['result']).toEqual({
      success: true,
      score: { scaled: 0.8, raw: 8, min: 0, max: 10 },
    });
  });
});

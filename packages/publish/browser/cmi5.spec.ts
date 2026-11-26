import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { publishCmi5 } from '../src/index';
import { checkStatement, startMockLrs } from './mock-lrs';
import { servePackage } from './serve';

const AUTH = 'Basic dGVzdDpzZWNyZXQ=';
const ACTOR = {
  objectType: 'Agent',
  name: 'Ada',
  account: { homePage: 'https://lms.example.com', name: 'ada' },
};
const COURSE = 'https://example.com/courses/two-slides';
const AU = `${COURSE}/au`;
const SESSION = 'https://w3id.org/xapi/cmi5/context/extensions/sessionid';
const CMI5 = 'https://w3id.org/xapi/cmi5/context/categories/cmi5';
const MOVEON = 'https://w3id.org/xapi/cmi5/context/categories/moveon';

let served: Awaited<ReturnType<typeof servePackage>>;
let lrs: Awaited<ReturnType<typeof startMockLrs>>;

test.beforeAll(async () => {
  served = await servePackage(
    (project, options) => publishCmi5(project, { ...options, courseId: COURSE }),
    '<!doctype html><title>Back in the LMS</title><p>Back in the LMS</p>',
  );
  lrs = await startMockLrs(AUTH);
});
test.afterAll(async () => {
  await served.close();
  await lrs.close();
});
test.describe.configure({ mode: 'serial' });
test.beforeEach(() => lrs.reset());
/**
 * A course page that is still open when a test ends sends its last statements
 * (with keepalive) as it closes, and a late one would land in the next test's
 * mock LRS. Leave the page here, and wait for those to arrive.
 */
test.afterEach(async ({ page }) => {
  const started = lrs.statements.some((s) =>
    String((s['verb'] as { id: string }).id).endsWith('/initialized'),
  );
  await page.goto('about:blank');
  if (started) {
    await expect
      .poll(
        () =>
          lrs.statements.some((s) =>
            String((s['verb'] as { id: string }).id).endsWith('/terminated'),
          ),
        { timeout: 10_000 },
      )
      .toBe(true);
  }
});

/** Launch the unit as a cmi5 LMS does: launch data left in the LRS, details in the address. */
async function launch(page: Page, registration: string, launchData: Record<string, unknown> = {}) {
  lrs.putState(
    { activityId: AU, agent: ACTOR, stateId: 'LMS.LaunchData', registration },
    {
      contextTemplate: {
        contextActivities: { grouping: [{ objectType: 'Activity', id: COURSE }] },
        extensions: { [SESSION]: `session-${registration.slice(0, 4)}` },
      },
      launchMode: 'Normal',
      moveOn: 'Completed',
      returnURL: `${served.base}lms.html`,
      ...launchData,
    },
  );
  const query = new URLSearchParams({
    endpoint: lrs.endpoint,
    fetch: lrs.fetchUrl(),
    actor: JSON.stringify(ACTOR),
    registration,
    activityId: AU,
  });
  await page.goto(`${served.base}course/index.html?${query}`);
  await expect(page.locator('.vo-player-position')).toHaveText('Slide 1 of 2');
}

const verbs = () =>
  lrs.statements.map((s) =>
    String((s['verb'] as { id: string }).id)
      .split('/')
      .pop(),
  );
const until = (verb: string) => expect.poll(verbs, { timeout: 10_000 }).toContain(verb);
const categories = (s: Record<string, unknown>) =>
  (
    ((s['context'] as Record<string, unknown>)['contextActivities'] as Record<string, unknown>)[
      'category'
    ] as { id: string }[] | undefined
  )?.map((c) => c.id) ?? [];

/** The cmi5 rules (section 9) a unit's statements in one registration must keep. */
function checkCmi5(registration: string) {
  const problems: string[] = [];
  const list = lrs.statements;
  const v = verbs();
  if (v[0] !== 'initialized') problems.push('the first statement is not initialized');
  if (v.at(-1) !== 'terminated') problems.push('the last statement is not terminated');
  if (v.filter((x) => x === 'completed').length > 1) problems.push('more than one completed');
  if (v.indexOf('failed') > v.indexOf('passed') && v.includes('passed'))
    problems.push('failed after passed');
  for (const s of list) {
    problems.push(...checkStatement(s));
    const verb = String((s['verb'] as { id: string }).id)
      .split('/')
      .pop()!;
    const context = s['context'] as Record<string, unknown>;
    if (context['registration'] !== registration) problems.push(`${verb}: wrong registration`);
    if (!(context['extensions'] as Record<string, unknown>)?.[SESSION])
      problems.push(`${verb}: no session id`);
    const defined = ['initialized', 'completed', 'passed', 'failed', 'terminated'].includes(verb);
    if (defined) {
      if ((s['object'] as { id: string }).id !== AU)
        problems.push(`${verb}: object is not the unit`);
      if (!categories(s).includes(CMI5)) problems.push(`${verb}: no cmi5 category`);
    } else if (categories(s).includes(CMI5))
      problems.push(`${verb}: an allowed statement with the cmi5 category`);
    if (['completed', 'passed', 'failed'].includes(verb)) {
      if (!categories(s).includes(MOVEON)) problems.push(`${verb}: no moveon category`);
      if (!(s['result'] as Record<string, unknown>)?.['duration'])
        problems.push(`${verb}: no duration`);
    }
  }
  return problems;
}

test('the package describes one assignable unit', () => {
  expect(served.read('cmi5.xml')).toContain(`<au id="${AU}" moveOn="Completed"`);
});

test('a first attempt: token, launch data, then statements in cmi5’s order and form', async ({
  page,
}) => {
  const registration = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
  await launch(page, registration);
  await expect.poll(verbs).toEqual(['initialized', 'experienced']);
  // The fetch URL was used once, and the launch data was read before any statement.
  expect(lrs.fetches).toBe(1);
  const firstPost = lrs.log.indexOf('POST /xapi/statements');
  expect(lrs.log.slice(0, firstPost)).toEqual([
    'POST /fetch/1',
    'GET /xapi/activities/state',
    'GET /xapi/activities/state',
  ]);
  await page.getByRole('button', { name: 'Next' }).click();
  await until('completed');
  await page.goto('about:blank');
  await until('terminated');
  expect(verbs()).toEqual(['initialized', 'experienced', 'experienced', 'completed', 'terminated']);
  expect(checkCmi5(registration)).toEqual([]);
  expect(lrs.problems).toEqual([]);
});

test('reloading the unit carries on with the same token', async ({ page }) => {
  const registration = '1a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
  await launch(page, registration);
  await until('experienced');
  await page.reload();
  // Progress was saved before the reload, so the learner is asked.
  await page
    .getByRole('dialog', { name: 'Continue where you left off?' })
    .getByRole('button', { name: 'Continue' })
    .click();
  await expect(page.locator('.vo-player-position')).toHaveText('Slide 1 of 2');
  await expect.poll(() => verbs().filter((v) => v === 'initialized').length).toBe(2);
  expect(lrs.fetches).toBe(1);
  expect(lrs.problems).toEqual([]);
});

test('exiting sends terminated and returns the learner to the LMS', async ({ page }) => {
  const registration = '2a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
  await launch(page, registration);
  await until('experienced');
  await page.evaluate(() =>
    (window as unknown as { VEDRAOPUS_PLAYER: { exit(): void } }).VEDRAOPUS_PLAYER.exit(),
  );
  await expect(page).toHaveURL(`${served.base}lms.html`);
  await expect(page.getByText('Back in the LMS')).toBeVisible();
  await until('terminated');
  expect(verbs()).toEqual(['initialized', 'experienced', 'terminated']);
  expect(checkCmi5(registration)).toEqual([]);
});

test('browsing: the course plays, but reports no completion', async ({ page }) => {
  const registration = '3a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
  await launch(page, registration, { launchMode: 'Browse' });
  await page.getByRole('button', { name: 'Next' }).click();
  await expect.poll(() => verbs().length).toBe(3);
  await page.goto('about:blank');
  await until('terminated');
  expect(verbs()).toEqual(['initialized', 'experienced', 'experienced', 'terminated']);
  expect(checkCmi5(registration)).toEqual([]);
});

test('when the LMS needs a pass, completing this ungraded course passes it', async ({ page }) => {
  const registration = '4a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
  await launch(page, registration, { moveOn: 'CompletedAndPassed' });
  await page.getByRole('button', { name: 'Next' }).click();
  await until('passed');
  expect(verbs()).toEqual(['initialized', 'experienced', 'experienced', 'completed', 'passed']);
  await page.goto('about:blank');
  await until('terminated');
  expect(checkCmi5(registration)).toEqual([]);
});

test('without a token the course plays untracked', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  const registration = '5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
  const fetchUrl = lrs.fetchUrl();
  // Someone used the fetch URL first.
  await fetch(fetchUrl, { method: 'POST' });
  const query = new URLSearchParams({
    endpoint: lrs.endpoint,
    fetch: fetchUrl,
    actor: JSON.stringify(ACTOR),
    registration,
    activityId: AU,
  });
  await page.goto(`${served.base}course/index.html?${query}`);
  await expect(page.locator('.vo-player-position')).toHaveText('Slide 1 of 2');
  expect(warnings).toEqual([expect.stringContaining('no access token: Already used')]);
  expect(lrs.statements).toEqual([]);
});

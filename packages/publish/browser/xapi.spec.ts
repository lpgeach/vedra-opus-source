import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { publishXapi } from '../src/index';
import { checkStatement, startMockLrs } from './mock-lrs';
import { servePackage } from './serve';

const AUTH = 'Basic dGVzdDpzZWNyZXQ=';
const ACTOR = { objectType: 'Agent', name: 'Ada', mbox: 'mailto:ada@example.com' };
const ACTIVITY = 'https://example.com/courses/two-slides';

let served: Awaited<ReturnType<typeof servePackage>>;
let lrs: Awaited<ReturnType<typeof startMockLrs>>;

test.beforeAll(async () => {
  served = await servePackage(
    (project, options) => publishXapi(project, { ...options, activityId: ACTIVITY }),
    '<!doctype html><title>Not used</title>',
  );
  lrs = await startMockLrs(AUTH);
});
test.afterAll(async () => {
  await served.close();
  await lrs.close();
});
// Tests share the mock LRS, so they run one at a time within this file.
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

/** Open the course as an LMS would, with the launch details in its address. */
async function launch(page: Page, registration: string, actor: object = ACTOR) {
  const query = new URLSearchParams({
    endpoint: lrs.endpoint,
    auth: AUTH,
    actor: JSON.stringify(actor),
    registration,
    activity_id: ACTIVITY,
  });
  await page.goto(`${served.base}course/index.html?${query}`);
  await expect(page.locator('.vo-player-position')).toHaveText('Slide 1 of 2');
}

/** Leave the course page, as closing the LMS window does. */
const leave = (page: Page) => page.goto('about:blank');

const verbs = () =>
  lrs.statements.map((s) =>
    String((s['verb'] as { id: string }).id)
      .split('/')
      .pop(),
  );
const until = (verb: string) => expect.poll(verbs, { timeout: 10_000 }).toContain(verb);

test('the package names its activity in tincan.xml', () => {
  expect(served.read('tincan.xml')).toContain(`<activity id="${ACTIVITY}"`);
  expect(served.read('index.html')).toContain(`activityId: "${ACTIVITY}"`);
});

test('a first attempt: statements for start, each slide, completion and leaving, all well formed', async ({
  page,
}) => {
  const registration = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
  await launch(page, registration);
  await expect.poll(verbs).toEqual(['initialized', 'experienced']);

  // The second slide completes this course (every slide seen).
  await page.getByRole('button', { name: 'Next' }).click();
  await expect.poll(verbs).toEqual(['initialized', 'experienced', 'experienced', 'completed']);
  await leave(page);
  await until('terminated');

  expect(verbs()).toEqual(['initialized', 'experienced', 'experienced', 'completed', 'terminated']);
  expect(lrs.problems).toEqual([]);
  for (const s of lrs.statements) {
    expect(checkStatement(s)).toEqual([]);
    expect(s['actor']).toEqual(ACTOR);
    expect(s['context']).toMatchObject({ registration });
  }
  const [initialized, slide1, slide2, completed, terminated] = lrs.statements;
  expect(initialized!['object']).toMatchObject({ id: ACTIVITY });
  expect((slide1!['object'] as { id: string }).id).toMatch(`${ACTIVITY}/slides/`);
  expect(slide2!['object']).not.toEqual(slide1!['object']);
  expect(slide1!['context']).toMatchObject({ contextActivities: { parent: [{ id: ACTIVITY }] } });
  expect(completed!['result']).toEqual({ completion: true });
  expect(terminated!['result']).toMatchObject({
    completion: true,
    duration: expect.stringMatching(/^PT/),
  });
  // Requests to another origin with an Authorization header are preflighted; they got through.
  expect(lrs.preflights).toBeGreaterThan(0);
  // Progress was saved to the State API.
  const [saved] = [...lrs.state.values()];
  expect(JSON.parse(saved!)).toMatchObject({
    v: 1,
    location: '2',
    data: expect.stringMatching(/^E1\./),
  });
});

test('coming back: the saved state resumes, and completion is not announced again', async ({
  page,
}) => {
  const registration = '1a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
  await launch(page, registration);
  await page.getByRole('button', { name: 'Next' }).click();
  await until('completed');
  await leave(page);
  await until('terminated');
  lrs.statements.length = 0;

  await page.goto(
    `${served.base}course/index.html?${new URLSearchParams({
      endpoint: lrs.endpoint,
      auth: AUTH,
      actor: JSON.stringify(ACTOR),
      registration,
      activity_id: ACTIVITY,
    })}`,
  );
  const ask = page.getByRole('dialog', { name: 'Continue where you left off?' });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('.vo-player-position')).toHaveText('Slide 2 of 2');
  await leave(page);
  await until('terminated');
  expect(verbs()).toEqual(['initialized', 'experienced', 'terminated']);
  expect(lrs.problems).toEqual([]);
});

test('when the LRS fails, statements wait and are sent once, in order', async ({ page }) => {
  lrs.failStatements(2);
  await launch(page, '2a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d');
  // Two failed tries (1 s, then 2 s apart), then the queue goes through.
  await expect.poll(verbs, { timeout: 10_000 }).toEqual(['initialized', 'experienced']);
  expect(lrs.log.filter((l) => l === 'POST /xapi/statements').length).toBeGreaterThanOrEqual(3);
  await page.getByRole('button', { name: 'Next' }).click();
  await until('completed');
  expect(verbs()).toEqual(['initialized', 'experienced', 'experienced', 'completed']);
  expect(new Set(lrs.statements.map((s) => s['id'])).size).toBe(lrs.statements.length);
  expect(lrs.problems).toEqual([]);
});

test('an older launch’s actor form is accepted', async ({ page }) => {
  await launch(page, '3a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', {
    name: ['Ada'],
    mbox: ['mailto:ada@example.com'],
  });
  await until('experienced');
  expect(lrs.statements[0]!['actor']).toEqual(ACTOR);
  expect(lrs.problems).toEqual([]);
});

test('without launch details the course still plays, untracked', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  await page.goto(`${served.base}course/index.html`);
  await expect(page.locator('.vo-player-position')).toHaveText('Slide 1 of 2');
  expect(warnings).toEqual([expect.stringContaining('not being tracked')]);
  expect(lrs.log).toEqual([]);
});

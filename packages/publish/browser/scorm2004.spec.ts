import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { publishScorm2004 } from '../src/index';
import {
  calls,
  closeCourse,
  mockLmsPage,
  openCourse as open,
  SCORM2004_API,
  servePackage,
  sets as setsBy,
  store,
} from './serve';
import type { Call } from './serve';

const MOCK_LMS = mockLmsPage(SCORM2004_API);

let served: Awaited<ReturnType<typeof servePackage>>;
let base = '';
let manifest = '';

test.beforeAll(async () => {
  served = await servePackage(
    (project, options) => publishScorm2004(project, { ...options, edition: 4 }),
    MOCK_LMS,
  );
  base = served.base;
  manifest = served.read('imsmanifest.xml');
});
test.afterAll(() => served.close());

const sets = (list: Call[], element: string) => setsBy(list, 'SetValue', element);
const openCourse = (page: Page, start: Record<string, string>) => open(page, base, start);
const NEW_ATTEMPT = {
  'cmi.completion_status': 'unknown',
  'cmi.success_status': 'unknown',
  'cmi.entry': 'ab-initio',
};
const failures = (list: Call[]) => list.filter((call) => call.at(-1) === 'false');

test('the package is a 4th edition SCO starting at index.html, schema files beside it', () => {
  expect(manifest).toContain('<schemaversion>2004 4th Edition</schemaversion>');
  expect(manifest).toContain('adlcp:scormType="sco" href="index.html"');
  expect(served.read('imsss_v1p0.xsd')).toContain(
    'targetNamespace = "http://www.imsglobal.org/xsd/imsss"',
  );
});

test('a first attempt: the call sequence, progress saved on each slide, completion and finish', async ({
  page,
}) => {
  const course = await openCourse(page, NEW_ATTEMPT);
  await expect(course.locator('.vo-player-position')).toHaveText('Slide 1 of 2');

  const first = await calls(page);
  expect(first[0]).toEqual(['Initialize', '', 'true']);
  expect(sets(first, 'cmi.completion_status')).toEqual(['incomplete', 'incomplete']);
  expect(sets(first, 'cmi.success_status')).toEqual(['unknown']);
  expect(sets(first, 'cmi.location')).toEqual(['1']);
  expect(sets(first, 'cmi.suspend_data')[0]).toMatch(/^E1\.[A-Za-z0-9_-]+$/);
  expect(first.at(-1)![0]).toBe('Commit');
  // Nothing written under 1.2's names.
  expect(first.some((c) => c[1]?.startsWith('cmi.core.'))).toBe(false);

  // The second slide completes this course (every slide seen). It reports
  // completed/incomplete, so success stays unknown.
  await course.getByRole('button', { name: 'Next' }).click();
  await expect(course.locator('.vo-player-position')).toHaveText('Slide 2 of 2');
  await expect.poll(async () => (await store(page))['cmi.completion_status']).toBe('completed');
  expect((await store(page))['cmi.location']).toBe('2');
  expect((await store(page))['cmi.success_status']).toBe('unknown');

  await closeCourse(page);
  await expect.poll(async () => (await calls(page)).at(-1)?.[0]).toBe('Terminate');
  const all = await calls(page);
  const tail = all.slice(-4).map((c) => (c[0] === 'SetValue' ? `${c[0]} ${c[1]}` : c[0]));
  expect(tail).toEqual(['SetValue cmi.session_time', 'SetValue cmi.exit', 'Commit', 'Terminate']);
  expect(sets(all, 'cmi.session_time')[0]).toMatch(/^PT(\d+H)?(\d+M)?(\d+(\.\d{1,2})?S)?$/);
  // Complete, so the attempt ends normally.
  expect(sets(all, 'cmi.exit')).toEqual(['normal']);
  expect(all.filter((c) => c[0] === 'Terminate')).toHaveLength(1);
  // The mock refuses out-of-order calls; none were made.
  expect(failures(all)).toEqual([]);
});

test('leaving part way suspends, and coming back resumes after the learner chooses to continue', async ({
  page,
}) => {
  let course = await openCourse(page, NEW_ATTEMPT);
  await expect(course.locator('.vo-player-position')).toHaveText('Slide 1 of 2');
  await closeCourse(page);
  await expect.poll(async () => (await calls(page)).at(-1)?.[0]).toBe('Terminate');
  expect(sets(await calls(page), 'cmi.exit')).toEqual(['suspend']);
  const saved = await store(page);
  expect(saved['cmi.completion_status']).toBe('incomplete');

  course = await openCourse(page, { ...saved, 'cmi.entry': 'resume' });
  const ask = course.getByRole('dialog', { name: 'Continue where you left off?' });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Continue' }).click();
  await expect(course.locator('.vo-player-position')).toHaveText('Slide 1 of 2');
  const back = await calls(page);
  expect(back.some((c) => c[0] === 'GetValue' && c[1] === 'cmi.suspend_data')).toBe(true);
  await course.getByRole('button', { name: 'Next' }).click();
  await expect.poll(async () => (await store(page))['cmi.completion_status']).toBe('completed');
  expect(failures(await calls(page))).toEqual([]);
});

test('a learner who completed and starts over is still completed', async ({ page }) => {
  let course = await openCourse(page, NEW_ATTEMPT);
  await course.getByRole('button', { name: 'Next' }).click();
  await expect.poll(async () => (await store(page))['cmi.completion_status']).toBe('completed');
  await closeCourse(page);
  await expect.poll(async () => (await calls(page)).at(-1)?.[0]).toBe('Terminate');
  const saved = await store(page);

  course = await openCourse(page, { ...saved, 'cmi.entry': 'resume' });
  await course
    .getByRole('dialog', { name: 'Continue where you left off?' })
    .getByRole('button', { name: 'Start over' })
    .click();
  await expect(course.locator('.vo-player-position')).toHaveText('Slide 1 of 2');
  await expect.poll(async () => sets(await calls(page), 'cmi.location')).toEqual(['1']);
  expect(sets(await calls(page), 'cmi.completion_status')).toEqual([]);
  expect((await store(page))['cmi.completion_status']).toBe('completed');
});

test('without an LMS the course still plays, untracked', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  await page.goto(`${base}course/index.html`);
  await expect(page.locator('.vo-player-position')).toHaveText('Slide 1 of 2');
  expect(warnings).toEqual([expect.stringContaining('No SCORM 2004 LMS was found')]);
});

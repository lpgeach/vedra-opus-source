import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { publishScorm12 } from '../src/index';
import {
  calls as allCalls,
  closeCourse,
  mockLmsPage,
  openCourse as open,
  servePackage,
  sets as setsBy,
  store,
} from './serve';
import type { Call } from './serve';

/**
 * A stand-in SCORM 1.2 LMS: it puts `API` on its own window, records every
 * call, keeps the values in `window.lms.store`, and opens the course in a
 * frame when the test asks.
 */
const MOCK_LMS = mockLmsPage(`
window.API = {
  LMSInitialize: function (a) { return record('LMSInitialize', [a], 'true'); },
  LMSFinish: function (a) { window.lms.finished = true; return record('LMSFinish', [a], 'true'); },
  LMSGetValue: function (e) { var v = window.lms.store[e]; return record('LMSGetValue', [e], v === undefined ? '' : v); },
  LMSSetValue: function (e, v) {
    if (window.lms.finished) return record('LMSSetValue', [e, v], 'false');
    window.lms.store[e] = String(v); return record('LMSSetValue', [e, v], 'true');
  },
  LMSCommit: function (a) { return record('LMSCommit', [a], 'true'); },
  LMSGetLastError: function () { return '0'; },
  LMSGetErrorString: function () { return ''; },
  LMSGetDiagnostic: function () { return ''; }
};`);

let served: Awaited<ReturnType<typeof servePackage>>;
let base = '';
let manifest = '';

test.beforeAll(async () => {
  served = await servePackage(publishScorm12, MOCK_LMS);
  base = served.base;
  manifest = served.read('imsmanifest.xml');
});
test.afterAll(() => served.close());

const calls = allCalls;
const sets = (list: Call[], element: string) => setsBy(list, 'LMSSetValue', element);
const openCourse = (page: Page, start: Record<string, string>) => open(page, base, start);

test('the package describes one SCO starting at index.html', () => {
  expect(manifest).toContain('adlcp:scormtype="sco" href="index.html"');
});

test('a first attempt: the call sequence, progress saved on each slide, completion and finish', async ({
  page,
}) => {
  const course = await openCourse(page, {
    'cmi.core.lesson_status': 'not attempted',
    'cmi.core.entry': 'ab-initio',
  });
  await expect(course.locator('.vo-player-position')).toHaveText('Slide 1 of 2');

  const first = await calls(page);
  expect(first[0]).toEqual(['LMSInitialize', '', 'true']);
  expect(first.map((c) => c[0]).slice(0, 3)).toEqual([
    'LMSInitialize',
    'LMSGetValue',
    'LMSSetValue',
  ]);
  expect(sets(first, 'cmi.core.lesson_status')).toEqual(['incomplete', 'incomplete']);
  expect(sets(first, 'cmi.core.lesson_location')).toEqual(['1']);
  expect(sets(first, 'cmi.suspend_data')[0]).toMatch(/^E1\.[A-Za-z0-9_-]+$/);
  expect(first.at(-1)![0]).toBe('LMSCommit');

  // The second slide completes this course (every slide seen).
  await course.getByRole('button', { name: 'Next' }).click();
  await expect(course.locator('.vo-player-position')).toHaveText('Slide 2 of 2');
  await expect.poll(async () => (await store(page))['cmi.core.lesson_status']).toBe('completed');
  expect((await store(page))['cmi.core.lesson_location']).toBe('2');

  // Leaving: time, exit, a last save, and finish, in that order, with nothing after.
  await closeCourse(page);
  await expect.poll(async () => (await calls(page)).at(-1)?.[0]).toBe('LMSFinish');
  const all = await calls(page);
  const tail = all.slice(-4).map((c) => (c[0] === 'LMSSetValue' ? `${c[0]} ${c[1]}` : c[0]));
  expect(tail).toEqual([
    'LMSSetValue cmi.core.session_time',
    'LMSSetValue cmi.core.exit',
    'LMSCommit',
    'LMSFinish',
  ]);
  expect(sets(all, 'cmi.core.session_time')[0]).toMatch(/^\d{4}:\d{2}:\d{2}\.\d{2}$/);
  // Complete, so not suspended.
  expect(sets(all, 'cmi.core.exit')).toEqual(['']);
  expect(all.filter((c) => c[0] === 'LMSFinish')).toHaveLength(1);
});

test('coming back: the saved session resumes after the learner chooses to continue', async ({
  page,
}) => {
  // A first visit that reaches the second slide (which completes this course), then leaves.
  let course = await openCourse(page, {
    'cmi.core.lesson_status': 'not attempted',
    'cmi.core.entry': 'ab-initio',
  });
  await course.getByRole('button', { name: 'Next' }).click();
  await expect(course.locator('.vo-player-position')).toHaveText('Slide 2 of 2');
  await closeCourse(page);
  await expect.poll(async () => (await calls(page)).at(-1)?.[0]).toBe('LMSFinish');
  const saved = await store(page);

  // The LMS hands it back, as it does on a return visit.
  course = await openCourse(page, { ...saved, 'cmi.core.entry': 'resume' });
  const ask = course.getByRole('dialog', { name: 'Continue where you left off?' });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Continue' }).click();
  await expect(course.locator('.vo-player-position')).toHaveText('Slide 2 of 2');
  // Still complete, and told so.
  await expect.poll(async () => (await store(page))['cmi.core.lesson_status']).toBe('completed');
  const back = await calls(page);
  expect(back.some((c) => c[0] === 'LMSGetValue' && c[1] === 'cmi.suspend_data')).toBe(true);
});

test('a learner who completed and starts over is still completed', async ({ page }) => {
  let course = await openCourse(page, {
    'cmi.core.lesson_status': 'not attempted',
    'cmi.core.entry': 'ab-initio',
  });
  await course.getByRole('button', { name: 'Next' }).click();
  await expect.poll(async () => (await store(page))['cmi.core.lesson_status']).toBe('completed');
  await closeCourse(page);
  await expect.poll(async () => (await calls(page)).at(-1)?.[0]).toBe('LMSFinish');
  const saved = await store(page);

  course = await openCourse(page, { ...saved, 'cmi.core.entry': 'resume' });
  await course
    .getByRole('dialog', { name: 'Continue where you left off?' })
    .getByRole('button', { name: 'Start over' })
    .click();
  await expect(course.locator('.vo-player-position')).toHaveText('Slide 1 of 2');
  // The fresh start was saved (place and progress), but not as incomplete.
  await expect.poll(async () => sets(await calls(page), 'cmi.core.lesson_location')).toEqual(['1']);
  expect(sets(await calls(page), 'cmi.core.lesson_status')).toEqual([]);
  expect((await store(page))['cmi.core.lesson_status']).toBe('completed');
});

test('a fresh start ignores what was saved when the LMS says this is a new attempt', async ({
  page,
}) => {
  const course = await openCourse(page, {
    'cmi.core.lesson_status': 'incomplete',
    'cmi.core.entry': 'ab-initio',
    'cmi.suspend_data': 'E1.whatever',
  });
  await expect(course.locator('.vo-player-position')).toHaveText('Slide 1 of 2');
  await expect(course.getByRole('dialog')).toHaveCount(0);
});

test('without an LMS the course still plays, untracked', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  await page.goto(`${base}course/index.html`);
  await expect(page.locator('.vo-player-position')).toHaveText('Slide 1 of 2');
  expect(warnings).toEqual([expect.stringContaining('No SCORM 1.2 LMS was found')]);
});

import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startMockLrs } from '../packages/publish/browser/mock-lrs';
import {
  closeCourse,
  mockLmsPage,
  openCourse,
  SCORM2004_API,
  serveFolder,
  store,
} from '../packages/publish/browser/serve';
import { packTwoSlides } from './fixture';
import { answerDialogs, launchApp } from './launch';

/**
 * Phase 5 from end to end, with every Phase 5 setting made in the app. The
 * author sets tracking and publishes for SCORM 2004 and xAPI. The settings
 * survive a save and a fresh start. The published packages then report what
 * the author chose to a mock LMS and a mock LRS.
 */
test('Phase 5: tracking and publish settings made in the app reach the LMS and the LRS', async () => {
  test.setTimeout(120_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-phase5-'));
  const scormOut = join(work, 'scorm');
  const xapiOut = join(work, 'xapi');
  mkdirSync(scormOut);
  mkdirSync(xapiOut);
  const projectFile = await packTwoSlides(work);
  const XAPI_ID = 'https://example.com/courses/two-slides';

  const publish = async (page: Page, target: string, identifier: string, expectResult: string) => {
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const dialog = page.getByTestId('publish-dialog');
    await dialog.getByLabel('Publish to').selectOption({ label: target });
    // A folder this time, so the package can be played straight from disk.
    await dialog.getByRole('radio', { name: 'Folder' }).check();
    await dialog.getByLabel('Identifier').fill(identifier);
    // The reporting choice is the one made in the Tracking dialog.
    await expect(dialog.getByLabel('Tell the LMS the course is')).toHaveValue('passed-incomplete');
    await dialog.getByRole('button', { name: 'Choose folder…' }).click();
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-result')).toContainText(expectResult);
    await dialog.getByRole('button', { name: 'Close' }).click();
  };

  // 1. Set tracking and publish twice, all through the UI; then save.
  const first = await launchApp({ args: [projectFile] });
  try {
    const { app, page } = first;
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await answerDialogs(app, { open: [[scormOut], [xapiOut]], message: [1, 1] });
    await page.getByTestId('ribbon').getByRole('tab', { name: 'Design', exact: true }).click();
    await page.getByRole('button', { name: 'Tracking', exact: true }).click();
    const tracking = page.getByTestId('tracking-dialog');
    await tracking.getByLabel('This many slides have been seen:').check();
    await tracking.getByLabel('Slides to see').fill('1');
    await tracking.getByLabel('Tell the LMS the course is').selectOption('passed-incomplete');
    await tracking.getByLabel('When a learner comes back').selectOption('always');
    await tracking.getByRole('button', { name: 'Apply' }).click();

    await publish(page, 'SCORM 2004', 'two-slides-2004', join(scormOut, 'two-slides'));
    await publish(page, 'xAPI', XAPI_ID, join(xapiOut, 'two-slides'));
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('project-status')).toContainText('Saved');
  } finally {
    await first.app.close();
  }

  // 2. A fresh start on the same computer: everything is as the author left it.
  const second = await launchApp({ args: [projectFile], userDataDir: first.userDataDir });
  try {
    const { app, page } = second;
    await answerDialogs(app, { message: [1, 1] });
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await page.getByTestId('ribbon').getByRole('tab', { name: 'Design', exact: true }).click();
    await page.getByRole('button', { name: 'Tracking', exact: true }).click();
    const tracking = page.getByTestId('tracking-dialog');
    await expect(tracking.getByLabel('This many slides have been seen:')).toBeChecked();
    await expect(tracking.getByLabel('Slides to see')).toHaveValue('1');
    await expect(tracking.getByLabel('Tell the LMS the course is')).toHaveValue(
      'passed-incomplete',
    );
    await expect(tracking.getByLabel('When a learner comes back')).toHaveValue('always');
    await tracking.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const dialog = page.getByTestId('publish-dialog');
    await expect(dialog.getByLabel('Publish to')).toHaveValue('xapi');
    await expect(dialog.getByLabel('Identifier')).toHaveValue(XAPI_ID);
    await expect(dialog.getByRole('radio', { name: 'Folder' })).toBeChecked();
    await expect(page.getByTestId('publish-folder')).toHaveText(xapiOut);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  } finally {
    await second.app.close();
  }

  // 3. The SCORM 2004 package in a mock LMS.
  const scormCourse = join(scormOut, 'two-slides');
  expect(readdirSync(scormOut)).toEqual(['two-slides']);
  expect(readFileSync(join(scormCourse, 'imsmanifest.xml'), 'utf8')).toContain(
    '<manifest identifier="two-slides-2004"',
  );
  const browser = await chromium.launch();
  const lms = await serveFolder(scormCourse, mockLmsPage(SCORM2004_API));
  try {
    const page = await browser.newPage();
    let course = await openCourse(page, lms.base, {
      'cmi.completion_status': 'unknown',
      'cmi.success_status': 'unknown',
      'cmi.entry': 'ab-initio',
    });
    await expect(course.locator('.vo-player-position')).toHaveText('Slide 1 of 2');
    // One slide seen completes it; with "passed, or incomplete" that is a pass.
    await expect.poll(async () => (await store(page))['cmi.completion_status']).toBe('completed');
    expect((await store(page))['cmi.success_status']).toBe('passed');
    await course.getByRole('button', { name: 'Next' }).click();
    await expect(course.locator('.vo-player-position')).toHaveText('Slide 2 of 2');
    await closeCourse(page);
    await expect.poll(async () => (await store(page))['cmi.exit']).toBe('normal');
    const saved = await store(page);

    // "Always continue": back on slide 2 with no question asked.
    course = await openCourse(page, lms.base, { ...saved, 'cmi.entry': 'resume' });
    await expect(course.locator('.vo-player-position')).toHaveText('Slide 2 of 2');
    await expect(course.getByRole('dialog')).toHaveCount(0);
  } finally {
    await lms.close();
  }

  // 4. The xAPI package with a mock LRS.
  const AUTH = 'Basic cGhhc2U6Zml2ZQ==';
  const lrs = await startMockLrs(AUTH);
  const site = await serveFolder(join(xapiOut, 'two-slides'), '<!doctype html><title>LMS</title>');
  try {
    expect(site.read('tincan.xml')).toContain(`<activity id="${XAPI_ID}"`);
    const page = await browser.newPage();
    const actor = { objectType: 'Agent', name: 'Ada', mbox: 'mailto:ada@example.com' };
    await page.goto(
      `${site.base}course/index.html?${new URLSearchParams({
        endpoint: lrs.endpoint,
        auth: AUTH,
        actor: JSON.stringify(actor),
        registration: '9a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
      })}`,
    );
    await expect(page.locator('.vo-player-position')).toHaveText('Slide 1 of 2');
    const verbs = () =>
      lrs.statements.map((s) =>
        String((s['verb'] as { id: string }).id)
          .split('/')
          .pop(),
      );
    await expect.poll(verbs).toEqual(['initialized', 'experienced', 'completed', 'passed']);
    await page.goto('about:blank');
    await expect.poll(verbs).toContain('terminated');
    for (const s of lrs.statements) {
      expect((s['object'] as { id: string }).id).toMatch(XAPI_ID);
      expect(s['actor']).toEqual(actor);
    }
    expect(lrs.problems).toEqual([]);
  } finally {
    await site.close();
    await lrs.close();
    await browser.close();
  }
});

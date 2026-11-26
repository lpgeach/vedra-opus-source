import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  closeCourse,
  mockLmsPage,
  openCourse,
  SCORM2004_API,
  serveFolder,
  store,
} from '../packages/publish/browser/serve';
import { answerDialogs, launchApp } from './launch';

/** Result slides from the editor to the LMS (docs/briefs/P7.7-result-slides.md). */

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const insertQuestion = async (page: Page, kind: string) => {
  await ribbon(page, 'Slides');
  await page.getByRole('button', { name: 'Question', exact: true }).click();
  await page.getByRole('menuitem', { name: kind, exact: true }).click();
};

test('two questions and a result slide: tracked by it, published as SCORM 2004, reported to the LMS', async () => {
  test.setTimeout(150_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-results-'));
  const out = join(work, 'out');
  mkdirSync(out);

  const app = await launchApp();
  try {
    const { page } = app;
    await answerDialogs(app.app, { open: [[out]], message: [1, 1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await insertQuestion(page, 'Multiple Choice');
    await insertQuestion(page, 'True or False');
    await insertQuestion(page, 'Result Slide');
    const form = page.getByTestId('result-form');
    await expect(form).toBeVisible();
    const pass = form.getByLabel('Pass percentage', { exact: true });
    await pass.fill('50');
    await pass.press('Enter');
    await form.getByLabel('Time limit', { exact: true }).check();
    await expect(form.getByLabel('Minutes allowed', { exact: true })).toHaveValue('10');

    await ribbon(page, 'Design');
    await page.getByRole('button', { name: 'Tracking', exact: true }).click();
    const tracking = page.getByTestId('tracking-dialog');
    await tracking.getByRole('radio', { name: /reaches a result slide/ }).check();
    await expect(tracking.getByLabel('Result slide', { exact: true })).toHaveValue(/slide_/);
    await tracking.getByLabel('Tell the LMS the course is').selectOption('passed-failed');
    await tracking.getByRole('button', { name: 'Apply' }).click();

    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const dialog = page.getByTestId('publish-dialog');
    await dialog.getByLabel('Publish to').selectOption({ label: 'SCORM 2004' });
    await dialog.getByRole('radio', { name: 'Folder' }).check();
    await dialog.getByLabel('Identifier').fill('results-2004');
    await dialog.getByRole('button', { name: 'Choose folder…' }).click();
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-result')).toBeVisible();
  } finally {
    await app.app.close();
  }

  const browser = await chromium.launch();
  const lms = await serveFolder(join(out, 'untitled-project'), mockLmsPage(SCORM2004_API));
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const course = await openCourse(page, lms.base, {
      'cmi.completion_status': 'unknown',
      'cmi.success_status': 'unknown',
      'cmi.entry': 'ab-initio',
    });
    const position = course.locator('.vo-player-position');
    const shown = (text: string) =>
      course.getByText(text, { exact: true }).filter({ visible: true });
    await course.getByRole('button', { name: 'Next' }).click();
    await expect(position).toHaveText('Slide 2 of 4');
    // The timer runs from the first question.
    await expect(course.locator('.vo-result-timer')).toContainText('Time left');
    // Right, then wrong: 10 of 20 points, 50%, which passes at 50.
    await shown('First answer').click();
    await shown('Submit').click();
    await shown('Continue').click();
    await expect(position).toHaveText('Slide 3 of 4');
    await shown('False').click();
    await shown('Submit').click();
    await shown('Continue').click();
    await expect(position).toHaveText('Slide 4 of 4');
    await expect(course.getByText('You scored 50% (10 of 20 points). To pass: 50%.')).toBeVisible();
    await expect(shown('Well done: you passed.')).toBeVisible();

    await expect.poll(async () => (await store(page))['cmi.success_status']).toBe('passed');
    const values = await store(page);
    expect(values).toMatchObject({
      'cmi.completion_status': 'completed',
      'cmi.score.raw': '10',
      'cmi.score.min': '0',
      'cmi.score.max': '20',
      'cmi.score.scaled': '0.5',
      'cmi.interactions.0.type': 'choice',
      'cmi.interactions.0.learner_response': 'a',
      'cmi.interactions.0.correct_responses.0.pattern': 'a',
      'cmi.interactions.0.result': 'correct',
      'cmi.interactions.1.type': 'true-false',
      'cmi.interactions.1.learner_response': 'false',
      'cmi.interactions.1.correct_responses.0.pattern': 'true',
      'cmi.interactions.1.result': 'incorrect',
    });
    await closeCourse(page);
  } finally {
    await lms.close();
    await browser.close();
  }
});

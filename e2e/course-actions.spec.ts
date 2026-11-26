import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  calls,
  mockLmsPage,
  openCourse,
  SCORM2004_API,
  serveFolder,
} from '../packages/publish/browser/serve';
import { answerDialogs, launchApp } from './launch';

/**
 * The rest of plan 4.2's actions (docs/briefs/P8.6-course-actions.md), made
 * with the trigger wizard: a button on each of three slides to send an email,
 * restart the course and exit it. They survive a save and a fresh start, and
 * work published as SCORM 2004 in the mock LMS, which exit commits and ends.
 */

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const items = (page: Page) => page.getByTestId('slide-list').locator('.slide-item');
const wizard = (page: Page) => page.getByTestId('trigger-wizard');

/** On the selected slide: a button whose click does `action`, set up by `fill`. */
async function buttonDoing(page: Page, action: string, fill: () => Promise<void> = async () => {}) {
  await ribbon(page, 'Insert');
  await page.getByRole('button', { name: 'Button', exact: true }).click();
  await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
  await page.getByRole('button', { name: 'New trigger' }).click();
  await wizard(page).getByLabel('Action', { exact: true }).selectOption(action);
  await fill();
  await wizard(page).getByRole('button', { name: 'Add trigger' }).click();
}

test('send email, restart and exit, made in the wizard, work in the published course', async () => {
  test.setTimeout(150_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-actions-'));
  const file = join(work, 'actions.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { save: [file] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await page.getByRole('button', { name: 'New Slide' }).click();
    await page.getByRole('button', { name: 'New Slide' }).click();

    await items(page).nth(0).click();
    await buttonDoing(page, 'sendEmail', async () => {
      const to = wizard(page).getByLabel('Action email to', { exact: true });
      await to.fill('tutor@example.com');
      await to.press('Enter');
      const subject = wizard(page).getByLabel('Action email subject', { exact: true });
      await subject.fill('Slide %SlideNumber%');
      await subject.press('Enter');
      await expect(page.getByTestId('trigger-sentence')).toContainText(
        'Send an email to tutor@example.com when the learner clicks Button',
      );
    });
    await items(page).nth(1).click();
    await buttonDoing(page, 'restartCourse');
    await items(page).nth(2).click();
    await buttonDoing(page, 'exitCourse');

    await ribbon(page, 'Home');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('project-status')).toContainText('Saved');
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ args: [file] });
  try {
    const { app, page } = second;
    await answerDialogs(app, { open: [[out]], message: [1] });
    const sentences = [
      'Send an email to tutor@example.com',
      'Restart the course',
      'Exit the course',
    ];
    for (const [index, sentence] of sentences.entries()) {
      await items(page).nth(index).click();
      await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
      await expect(page.getByTestId('triggers-panel')).toContainText(sentence);
    }
    await ribbon(page, 'Home');
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const dialog = page.getByTestId('publish-dialog');
    await dialog.getByLabel('Publish to').selectOption({ label: 'SCORM 2004' });
    await dialog.getByRole('radio', { name: 'Folder' }).check();
    await dialog.getByLabel('Identifier').fill('actions-2004');
    await dialog.getByRole('button', { name: 'Choose folder…' }).click();
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-result')).toBeVisible();
  } finally {
    await second.app.close();
  }

  const browser = await chromium.launch();
  const lms = await serveFolder(join(out, 'untitled-project'), mockLmsPage(SCORM2004_API));
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    // What the course asks the browser to open, kept instead of opened.
    await page.addInitScript(() => {
      const opened: string[] = [];
      (window as unknown as { opened: string[] }).opened = opened;
      window.open = (url?: string | URL) => {
        opened.push(String(url));
        return null;
      };
    });
    const course = await openCourse(page, lms.base, {
      'cmi.completion_status': 'unknown',
      'cmi.success_status': 'unknown',
      'cmi.entry': 'ab-initio',
    });
    const position = course.locator('.vo-player-position');
    const button = course.locator('.vo-player-stage').getByText('Button', { exact: true });
    await expect(position).toHaveText('Slide 1 of 3');

    // Slide 1: the email, its subject filled in from the Slide variable.
    await button.click();
    await expect
      .poll(() =>
        course.locator('body').evaluate(() => (window as unknown as { opened: string[] }).opened),
      )
      .toEqual(['mailto:tutor@example.com?subject=Slide%201']);

    // Slide 2: restart, back to slide 1.
    await course.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(position).toHaveText('Slide 2 of 3');
    await button.click();
    await expect(position).toHaveText('Slide 1 of 3');

    // Slide 3: exit. The LMS is told and the session ends; the course says so.
    await course.getByRole('button', { name: 'Next', exact: true }).click();
    await course.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(position).toHaveText('Slide 3 of 3');
    await button.click();
    await expect.poll(async () => (await calls(page)).at(-1)?.[0]).toBe('Terminate');
    const tail = (await calls(page)).slice(-2).map((call) => call[0]);
    expect(tail).toEqual(['Commit', 'Terminate']);
    // Not the player's announcer, which is a status region too (P10.1).
    await expect(course.getByRole('status').filter({ hasText: 'The course has ended' })).toHaveText(
      'The course has ended. You can close this page now.',
    );
  } finally {
    await browser.close();
    lms.close();
  }
});

import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { answerDialogs, launchApp } from './launch';

/**
 * The icons and illustrations library (docs/briefs/P9.8-icons-library.md):
 * search and insert an icon and an illustration, change a colour, save and
 * reopen, then publish and see both drawn in the course.
 */

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const graphics = (page: Page) =>
  page.getByTestId('stage-canvas').locator('[data-object-type="graphic"]');

async function openLibrary(page: Page) {
  await ribbon(page, 'Insert');
  await page.getByRole('button', { name: 'Icons…', exact: true }).click();
  const dialog = page.getByTestId('library-dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

test('an icon and an illustration from the library survive saving and are drawn in the course', async () => {
  test.setTimeout(150_000);
  const work = mkdtempSync(join(tmpdir(), 'vo-e2e-library-'));
  const file = join(work, 'library.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { save: [file] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();

    let dialog = await openLibrary(page);
    await expect(dialog.getByTestId('library-count')).toContainText('Showing 240 of 2098 icons');
    await dialog.getByLabel('Search the library').fill('heart');
    // The heart itself comes first.
    await expect(
      dialog.getByTestId('library-grid').getByRole('button').first(),
    ).toHaveAccessibleName('Heart');
    await dialog.getByRole('button', { name: 'Heart', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(graphics(page)).toHaveCount(1);

    dialog = await openLibrary(page);
    await dialog.getByRole('tab', { name: 'Illustrations' }).click();
    await expect(dialog.getByTestId('library-count')).toHaveText('33 illustrations');
    await dialog.getByLabel('Search the library').fill('read');
    await expect(dialog.getByTestId('library-count')).toHaveText('3 illustrations');
    await dialog.getByRole('button', { name: 'Reading', exact: true }).click();
    await expect(graphics(page)).toHaveCount(2);

    // The illustration is selected: give it a custom accent colour.
    await page.getByRole('tab', { name: 'Format', exact: true }).click();
    const format = page.getByTestId('graphic-format');
    await expect(format.getByRole('heading')).toHaveText('Illustration');
    await format.getByLabel('Graphic accent source').selectOption('literal');
    await format.getByLabel('Graphic accent colour').fill('#30a46c');
    await expect(graphics(page).nth(1).locator('[fill="#30a46c"]').first()).toBeAttached();

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
    await page.getByTestId('slide-list').locator('.slide-item').first().click();
    await expect(graphics(page)).toHaveCount(2);
    await ribbon(page, 'Home');
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const publish = page.getByTestId('publish-dialog');
    await publish.getByRole('button', { name: 'Choose folder…' }).click();
    await publish.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-result')).toBeVisible();
  } finally {
    await second.app.close();
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await page.goto(pathToFileURL(join(out, 'untitled-project', 'index.html')).href);
    const stage = page.locator('.vo-player-stage');
    await expect(stage.getByRole('img', { name: 'Heart icon' })).toBeVisible();
    const reading = stage.getByRole('img', { name: 'Reading illustration' });
    await expect(reading).toBeVisible();
    await expect(reading.locator('[fill="#30a46c"]').first()).toBeAttached();
    // The course carries both sets' licence notices (Luke, session 76).
    const notices = readFileSync(join(out, 'untitled-project', 'THIRD-PARTY-NOTICES.txt'), 'utf8');
    expect(notices).toContain('Lucide icons');
    expect(notices).toContain('ISC License');
    expect(notices).toContain('Open Doodles by Pablo Stanley');
  } finally {
    await browser.close();
  }
});

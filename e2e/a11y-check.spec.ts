import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { answerDialogs, launchApp } from './launch';

/**
 * The accessibility checker (docs/briefs/P10.2-accessibility-checker.md): the
 * right panel's Check tab lists what learners would miss, Show goes to it, and
 * a fix in the Format panel takes its line away.
 */

const fixtureAssets = join(import.meta.dirname, '../fixtures/projects/two-slides/assets');
const imagePath = join(fixtureAssets, readdirSync(fixtureAssets)[0]!);
const DONT_SAVE = 1;

const rightTab = (page: Page, name: string) =>
  page
    .getByRole('tablist', { name: 'Right panel' })
    .getByRole('tab', { name, exact: true })
    .click();
const check = (page: Page) => page.getByTestId('a11y-check');

test('the Check tab lists problems, Show selects the object, and fixing the alt text clears it', async () => {
  test.setTimeout(120_000);
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { open: [[imagePath]], message: [DONT_SAVE] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await rightTab(page, 'Check');
    await expect(check(page).getByRole('status')).toHaveText('No problems found.');

    // A picture with no alt text.
    await page.getByTestId('ribbon').getByRole('tab', { name: 'Insert', exact: true }).click();
    await page.getByRole('button', { name: 'Picture…' }).click();
    await expect(page.getByTestId('project-status')).toContainText('1 object selected');
    // Nothing selected, so Show has something to do.
    await page.getByTestId('stage-canvas').click({ position: { x: 4, y: 4 } });
    await expect(page.getByTestId('project-status')).not.toContainText('selected');

    await rightTab(page, 'Check');
    await expect(check(page).getByRole('status')).toHaveText('1 problem found.');
    const issue = check(page).getByTestId('a11y-issue');
    await expect(issue).toHaveCount(1);
    await expect(issue).toContainText('Alt text');
    await expect(issue).toContainText('has no alt text');
    await issue.getByRole('button', { name: 'Show', exact: true }).click();
    await expect(page.getByTestId('project-status')).toContainText('1 object selected');

    // The fix is made where it always is: the Format panel's Alt text.
    await rightTab(page, 'Format');
    const alt = page.getByTestId('format-a11y').getByLabel('Alt text', { exact: true });
    await alt.fill('A small test picture');
    await alt.blur();
    await rightTab(page, 'Check');
    await expect(check(page).getByRole('status')).toHaveText('No problems found.');
    await expect(check(page).getByTestId('a11y-issue')).toHaveCount(0);

    // Undo brings it back: the list follows the project.
    await page.getByTestId('ribbon').getByRole('tab', { name: 'Home', exact: true }).click();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(check(page).getByRole('status')).toHaveText('1 problem found.');

    // Marked decorative instead, the picture is skipped by screen readers, and by the check.
    await check(page).getByRole('button', { name: 'Show', exact: true }).click();
    await rightTab(page, 'Format');
    await page
      .getByTestId('format-a11y')
      .getByLabel(/Decorative/)
      .check();
    await rightTab(page, 'Check');
    await expect(check(page).getByRole('status')).toHaveText('No problems found.');
  } finally {
    await app.close();
  }
});

import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { answerDialogs, launchApp } from './launch';

/**
 * Lightbox slides (docs/briefs/P8.4-lightbox.md), made in the app: a button
 * on slide 1 opens slide 3 as a lightbox with Previous and Next, and a custom
 * tab opens slide 2. Both survive a save and a fresh start, and work in the
 * published course.
 */

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const items = (page: Page) => page.getByTestId('slide-list').locator('.slide-item');
const wizard = (page: Page) => page.getByTestId('trigger-wizard');
const playerDialog = (page: Page) => page.getByTestId('player-dialog');
const openPlayerDialog = async (page: Page) => {
  await ribbon(page, 'Design');
  await page.getByRole('button', { name: 'Player…', exact: true }).click();
  await expect(playerDialog(page)).toBeVisible();
};

test('a lightbox button and a lightbox tab survive saving and work in the published course', async () => {
  test.setTimeout(150_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-lightbox-'));
  const file = join(work, 'lightbox.vedraopus');
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
    await expect(items(page)).toHaveCount(3);

    // Slide 1: a button that opens slide 3 as a lightbox, with Previous and Next.
    await items(page).first().click();
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Button', exact: true }).click();
    await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
    await page.getByRole('button', { name: 'New trigger' }).click();
    await wizard(page).getByLabel('Action', { exact: true }).selectOption('openLightbox');
    // Slide 1 itself is not offered: slides 2 and 3.
    const target = wizard(page).getByLabel('Action slide', { exact: true });
    await expect(target.locator('option')).toHaveCount(2);
    await target.selectOption({ index: 1 });
    await wizard(page).getByLabel('Action shows Previous and Next', { exact: true }).check();
    await expect(page.getByTestId('trigger-sentence')).toContainText(
      'as a lightbox, with Previous and Next when the learner clicks Button',
    );
    await wizard(page).getByRole('button', { name: 'Add trigger' }).click();

    // A custom tab that opens slide 2.
    await openPlayerDialog(page);
    const tabs = playerDialog(page).getByTestId('player-tabs');
    await tabs.getByRole('button', { name: 'Add tab', exact: true }).click();
    const label = tabs.getByLabel('Custom tab 1 label', { exact: true });
    await label.fill('Glance');
    await label.press('Enter');
    // Options: run triggers, then slides 1, 2 and 3.
    await tabs.getByLabel('Custom tab 1 does', { exact: true }).selectOption({ index: 2 });
    await playerDialog(page).getByRole('button', { name: 'Close', exact: true }).click();

    await ribbon(page, 'Home');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('project-status')).toContainText('Saved');
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ args: [file] });
  try {
    const { app, page } = second;
    await answerDialogs(app, { open: [[out]] });
    await items(page).first().click();
    await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
    await expect(page.getByTestId('triggers-panel')).toContainText(
      'as a lightbox, with Previous and Next when the learner clicks Button',
    );
    await openPlayerDialog(page);
    const does = playerDialog(page).getByLabel('Custom tab 1 does', { exact: true });
    await expect(does.locator('option:checked')).toHaveText(
      'Opens slide 2 (“Untitled Slide”) as a lightbox',
    );
    await playerDialog(page).getByRole('button', { name: 'Close', exact: true }).click();

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
    const bar = page.getByRole('group', { name: 'Lightbox' });
    const player = page.locator('.vo-player');
    await expect(bar).toBeHidden();

    // The button: slide 3 as a lightbox, over slide 1, which stays drawn behind it.
    await page.locator('.vo-player-stage').getByText('Button', { exact: true }).click();
    await expect(player).toHaveAttribute('data-lightbox', 'true');
    await expect(page.locator('.vo-player-lightbox-under')).toBeAttached();
    await expect(page.locator('.vo-player-position')).toHaveText('Slide 1 of 3');
    await expect(bar.getByRole('button')).toHaveText(['Previous', 'Next', 'Close']);
    // Slide 3: before it is slide 2; after it, nothing.
    await expect(bar.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    await bar.getByRole('button', { name: 'Previous', exact: true }).click();
    // Slide 2: before it is slide 1, the slide under it.
    await expect(bar.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
    await bar.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(bar).toBeHidden();
    await expect(player).not.toHaveAttribute('data-lightbox', 'true');

    // The tab: slide 2, with Close only; Escape closes it.
    await page
      .getByRole('group', { name: 'Course tabs' })
      .getByRole('button', { name: 'Glance', exact: true })
      .click();
    await expect(bar.getByRole('button')).toHaveText(['Close']);
    await player.focus();
    await page.keyboard.press('Escape');
    await expect(bar).toBeHidden();
    await expect(page.locator('.vo-player-position')).toHaveText('Slide 1 of 3');
  } finally {
    await browser.close();
  }
});

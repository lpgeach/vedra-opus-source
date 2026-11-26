import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { answerDialogs, launchApp } from './launch';

/**
 * The player frame (docs/briefs/P8.1-player-frame.md), set up in Design →
 * Player…: a renamed and a hidden menu entry, restricted navigation, a
 * draggable seekbar and no speed control. It survives a save and a fresh
 * start, and the published course has it.
 */

const playerDialog = (page: Page) => page.getByTestId('player-dialog');
const openPlayerDialog = async (page: Page) => {
  await page.getByTestId('ribbon').getByRole('tab', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Player…', exact: true }).click();
  await expect(playerDialog(page)).toBeVisible();
};

test('the Player dialog sets up the frame, which survives saving and is in the published course', async () => {
  test.setTimeout(120_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-player-'));
  const file = join(work, 'player.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { save: [file] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    // Three slides.
    await page.getByRole('button', { name: 'New Slide' }).click();
    await page.getByRole('button', { name: 'New Slide' }).click();

    await openPlayerDialog(page);
    const dialog = playerDialog(page);
    const title = dialog.getByLabel('Menu title for slide 1', { exact: true });
    await title.fill('Welcome');
    await title.press('Enter');
    await dialog.getByLabel('Hide slide 2', { exact: true }).check();
    await dialog.getByLabel('Navigation', { exact: true }).selectOption('restricted');
    await dialog.getByLabel('Seekbar', { exact: true }).selectOption('drag');
    await dialog.getByRole('checkbox', { name: 'Playback speed', exact: true }).uncheck();
    // Each change is its own undo step: undoing the last turns speed back on.
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Undo' }).click();
    await openPlayerDialog(page);
    await expect(
      dialog.getByRole('checkbox', { name: 'Playback speed', exact: true }),
    ).toBeChecked();
    await dialog.getByRole('checkbox', { name: 'Playback speed', exact: true }).uncheck();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();

    await page.getByTestId('ribbon').getByRole('tab', { name: 'Home', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('project-status')).toContainText('Saved');
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ args: [file] });
  try {
    const { app, page } = second;
    await answerDialogs(app, { open: [[out]] });
    await openPlayerDialog(page);
    const dialog = playerDialog(page);
    await expect(dialog.getByLabel('Menu title for slide 1', { exact: true })).toHaveValue(
      'Welcome',
    );
    await expect(dialog.getByLabel('Hide slide 2', { exact: true })).toBeChecked();
    await expect(dialog.getByLabel('Hide slide 3', { exact: true })).not.toBeChecked();
    await expect(dialog.getByLabel('Navigation', { exact: true })).toHaveValue('restricted');
    await expect(dialog.getByLabel('Seekbar', { exact: true })).toHaveValue('drag');
    await expect(
      dialog.getByRole('checkbox', { name: 'Playback speed', exact: true }),
    ).not.toBeChecked();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();

    await page.getByTestId('ribbon').getByRole('tab', { name: 'Home', exact: true }).click();
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
    await expect(page.locator('.vo-player-position')).toHaveText('Slide 1 of 3');
    await expect(page.getByRole('slider', { name: 'Slide time', exact: true })).toBeEnabled();
    await expect(page.locator('.vo-player-speed')).toHaveCount(0);
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    const menu = page.getByRole('navigation', { name: 'Course menu' });
    // The renamed first, the hidden second left out, the third not yet seen.
    await expect(menu.getByRole('button')).toHaveText(['Welcome', 'Untitled Slide']);
    await expect(menu.getByRole('button', { name: 'Welcome', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(menu.getByRole('button', { name: 'Untitled Slide', exact: true })).toBeDisabled();
  } finally {
    await browser.close();
  }
});

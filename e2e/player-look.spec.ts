import { chromium, expect, test } from '@playwright/test';
import { accentFor } from '@vedraopus/model';
import type { Page } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { answerDialogs, launchApp } from './launch';

/**
 * The player's look and words (docs/briefs/P8.3-player-appearance.md): set in
 * the Player dialog, kept as a preset, applied to a project in a later
 * session, and published.
 */

const playerDialog = (page: Page) => page.getByTestId('player-dialog');
const openPlayerDialog = async (page: Page) => {
  await page.getByTestId('ribbon').getByRole('tab', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Player…', exact: true }).click();
  await expect(playerDialog(page)).toBeVisible();
};

test('a look made in the Player dialog, saved as a preset, applies to another project and publishes', async () => {
  test.setTimeout(150_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-look-'));
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { page } = first;
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await openPlayerDialog(page);
    const look = playerDialog(page).getByTestId('player-look');
    await look.getByLabel('Colour scheme', { exact: true }).selectOption('light');
    await look.getByLabel('Accent colour', { exact: true }).fill('#ffd23f');
    // Yellow is too faint on the light scheme: the dialog names the shade courses show
    // (docs/briefs/P10.1-accessibility.md, part C). Dark does not need it.
    await expect(look.getByTestId('accent-note')).toContainText(
      `${accentFor('#ffd23f', 'light')} on the light scheme`,
    );
    await look.getByLabel('Colour scheme', { exact: true }).selectOption('dark');
    await expect(look.getByTestId('accent-note')).toHaveCount(0);
    await look.getByLabel('Colour scheme', { exact: true }).selectOption('light');
    await look.getByLabel('Controls position', { exact: true }).selectOption('top');
    const words = playerDialog(page).getByTestId('player-words');
    await words.getByText(/^Every word/).click();
    const next = words.getByLabel('Word for Next', { exact: true });
    await next.fill('Onward');
    await next.press('Enter');
    // Each is one undo step: undo the word, and it is back to blank.
    await playerDialog(page).getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByTestId('ribbon').getByRole('tab', { name: 'Home', exact: true }).click();
    await page.getByRole('button', { name: 'Undo' }).click();
    await openPlayerDialog(page);
    await words.getByText(/^Every word/).click();
    await expect(next).toHaveValue('');
    await next.fill('Onward');
    await next.press('Enter');
    await look.getByLabel('New preset name', { exact: true }).fill('House style');
    await look.getByRole('button', { name: 'Save as preset', exact: true }).click();
    await expect(look.getByLabel('Preset', { exact: true })).toHaveValue(/.+/);
    // The look and preset name are unsaved; closing asks what to do with them.
    await answerDialogs(first.app, { message: [1] });
  } finally {
    await first.app.close();
  }

  // A later session on the same computer: a new project takes the preset.
  const second = await launchApp({ userDataDir: first.userDataDir });
  try {
    const { app, page } = second;
    await answerDialogs(app, { open: [[out]], message: [1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await page.getByRole('button', { name: 'New Slide' }).click();
    await openPlayerDialog(page);
    const look = playerDialog(page).getByTestId('player-look');
    await expect(look.getByLabel('Colour scheme', { exact: true })).toHaveValue('dark');
    await expect(look.getByLabel('Preset', { exact: true }).locator('option')).toHaveText([
      'House style',
    ]);
    await look.getByRole('button', { name: 'Apply preset', exact: true }).click();
    await expect(look.getByLabel('Colour scheme', { exact: true })).toHaveValue('light');
    await expect(look.getByLabel('Accent colour', { exact: true })).toHaveValue('#ffd23f');
    await expect(look.getByLabel('Controls position', { exact: true })).toHaveValue('top');
    await playerDialog(page).getByRole('button', { name: 'Close', exact: true }).click();

    await page.getByTestId('ribbon').getByRole('tab', { name: 'Home', exact: true }).click();
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const publish = page.getByTestId('publish-dialog');
    await publish.getByRole('button', { name: 'Choose folder…' }).click();
    await publish.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-result')).toBeVisible();
    // Publishing writes settings into the project, so closing asks again.
    await answerDialogs(second.app, { message: [1] });
  } finally {
    await second.app.close();
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await page.goto(pathToFileURL(join(out, 'untitled-project', 'index.html')).href);
    const player = page.locator('.vo-player');
    await expect(player).toHaveAttribute('data-scheme', 'light');
    await expect(player).toHaveAttribute('data-controls', 'top');
    const footer = await page.locator('.vo-player-footer').boundingBox();
    const viewport = await page.locator('.vo-player-viewport').boundingBox();
    expect(footer!.y).toBeLessThan(viewport!.y);
    await page.getByRole('button', { name: 'Onward', exact: true }).click();
    await expect(page.locator('.vo-player-position')).toHaveText('Slide 2 of 2');
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    const current = page.locator('.vo-player-menu-item[aria-current="page"]');
    // The accent as the light scheme shows it: the author's yellow, made strong enough.
    const shade = accentFor('#ffd23f', 'light');
    const rgb = [1, 3, 5].map((at) => parseInt(shade.slice(at, at + 2), 16)).join(', ');
    await expect(current).toHaveCSS('background-color', `rgb(${rgb})`);
  } finally {
    await browser.close();
  }
});

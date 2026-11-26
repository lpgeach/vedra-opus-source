import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { accentFor } from '@vedraopus/model';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { answerDialogs, launchApp, previewFrom } from './launch';

/**
 * The Phase 10 review: a course using the whole phase, built through the UI as
 * an author would. It survives a save and a fresh start, is translated into
 * Arabic, plays in Preview, and plays published.
 *
 * - A picture and two buttons named by their alt text in the Format panel (P10.2).
 * - The author's own Tab order, the right-hand button first (P10.1 part B).
 * - The Check tab: nothing but the default buttons' contrast (P10.2).
 * - A pale accent on the light scheme, strengthened, and the Player dialog saying so (P10.1 part C).
 * - Exported as XLIFF, translated, imported: an Arabic course, right to left (P10.3).
 * - Published: the alt texts translated, Tab in the author's order, the text view (P10.1).
 */

const fixtureAssets = join(import.meta.dirname, '../fixtures/projects/two-slides/assets');
const imagePath = join(fixtureAssets, readdirSync(fixtureAssets)[0]!);
const DONT_SAVE = 1;

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const rightTab = (page: Page, name: string) =>
  page.getByTestId('panel-right').getByRole('tab', { name, exact: true }).click();
const canvas = (page: Page) => page.getByTestId('stage-canvas');
const alt = (page: Page) => page.getByTestId('format-a11y').getByLabel('Alt text', { exact: true });

async function describe(page: Page, words: string) {
  await rightTab(page, 'Format');
  await alt(page).fill(words);
  await alt(page).blur();
}

async function buttonAt(page: Page, x: number, words: string) {
  await ribbon(page, 'Insert');
  await page.getByRole('button', { name: 'Button', exact: true }).click();
  await rightTab(page, 'Format');
  const field = page.getByTestId('format-panel').getByLabel('X', { exact: true });
  await field.fill(String(x));
  await field.press('Enter');
  await describe(page, words);
}

async function openPlayer(page: Page) {
  await ribbon(page, 'Design');
  await page.getByRole('button', { name: 'Player…', exact: true }).click();
  await expect(page.getByTestId('player-dialog')).toBeVisible();
  return page.getByTestId('player-dialog').getByTestId('player-look');
}

test('a course using all of Phase 10 survives saving, is translated, plays in Preview and published', async () => {
  test.setTimeout(240_000);
  const work = mkdtempSync(join(tmpdir(), 'vo-e2e-phase10-'));
  const file = join(work, 'phase10.vedraopus');
  const xlf = join(work, 'phase10-ar.xlf');
  const out = join(work, 'out');
  mkdirSync(out);
  const accent = '#ffd23f';

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { open: [[imagePath]], save: [file], message: [DONT_SAVE] });
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    await expect(canvas(page)).toBeVisible();
    await page.getByTestId('project-title').fill('Safety');

    // A picture, described; two buttons, named by their alt text.
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Picture…', exact: true }).click();
    await describe(page, 'A map of the site');
    await buttonAt(page, 100, 'Left');
    await buttonAt(page, 900, 'Right');

    // The author's Tab order: the right-hand button first.
    await canvas(page).click({ position: { x: 4, y: 4 } });
    await rightTab(page, 'Slide Properties');
    await page.getByLabel('Tab order', { exact: true }).selectOption('own');
    const rows = page.getByTestId('tab-order').getByTestId('tab-order-item');
    await expect(rows).toHaveCount(2);
    await rows
      .nth(1)
      .getByRole('button', { name: /earlier/ })
      .click();
    await expect(rows.first()).toContainText('Right');

    // The Check tab: alt text and names are fine; the default buttons' words are too faint.
    await rightTab(page, 'Check');
    const issues = page.getByTestId('a11y-check').getByTestId('a11y-issue');
    await expect(issues).toHaveCount(2);
    for (const each of await issues.all()) await expect(each).toContainText('Contrast');

    // A pale accent on the light scheme: the Player dialog says courses show a stronger shade.
    const look = await openPlayer(page);
    await look.getByLabel('Colour scheme', { exact: true }).selectOption('light');
    await look.getByLabel('Accent colour', { exact: true }).fill(accent);
    await expect(look.getByTestId('accent-note')).toContainText(accentFor(accent, 'light'));
    await page
      .getByTestId('player-dialog')
      .getByRole('button', { name: 'Close', exact: true })
      .click();

    await ribbon(page, 'Home');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('project-status')).toContainText('Saved');
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ args: [file] });
  try {
    const { app, page } = second;
    await answerDialogs(app, { save: [xlf], open: [[xlf], [out]], message: [DONT_SAVE] });
    await expect(canvas(page)).toBeVisible();

    // Everything came back.
    await rightTab(page, 'Slide Properties');
    await expect(page.getByLabel('Tab order', { exact: true })).toHaveValue('own');
    await expect(page.getByTestId('tab-order').getByTestId('tab-order-item').first()).toContainText(
      'Right',
    );
    await canvas(page).locator('[data-object-type="image"]').click();
    await expect(alt(page)).toHaveValue('A map of the site');
    const look = await openPlayer(page);
    await expect(look.getByTestId('accent-note')).toBeVisible();
    await page
      .getByTestId('player-dialog')
      .getByRole('button', { name: 'Close', exact: true })
      .click();

    // Into Arabic: exported, every target filled, imported.
    await ribbon(page, 'Design');
    await page.getByRole('button', { name: 'Translation…', exact: true }).click();
    const dialog = page.getByTestId('translation-dialog');
    await dialog.getByLabel('Translate into', { exact: true }).fill('ar');
    await dialog.getByRole('button', { name: 'Export XLIFF…', exact: true }).click();
    await expect(dialog.getByTestId('translation-result')).toContainText(xlf);
    const filled = readFileSync(xlf, 'utf8').replace(
      /<source>(.*?)<\/source>\n(\s*)<target><\/target>/g,
      (_whole, source: string, indent: string) =>
        `<source>${source}</source>\n${indent}<target>AR ${source}</target>`,
    );
    writeFileSync(xlf, filled);
    await dialog.getByRole('button', { name: 'Import translation…', exact: true }).click();
    await expect(dialog.getByTestId('translation-result')).toContainText(
      /into ar: Translated (\d+) of \1 pieces/,
    );
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByTestId('project-title')).toHaveValue('AR Safety');

    // Preview: right to left, in Arabic.
    await ribbon(page, 'Home');
    const [preview] = await Promise.all([
      app.waitForEvent('window'),
      previewFrom(page, 'Entire Project'),
    ]);
    await expect(preview.locator('.vo-player')).toHaveAttribute('dir', 'rtl');
    await expect(
      preview.locator('.vo-player-stage').getByRole('button', { name: 'AR Right' }),
    ).toBeVisible();
    await preview.close();

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
    await page.route(/^https?:\/\//, (route) => route.abort());
    await page.goto(pathToFileURL(join(out, 'ar-safety', 'index.html')).href);
    const root = page.locator('.vo-player');
    const stage = page.locator('.vo-player-stage');
    await expect(root).toHaveAttribute('lang', 'ar');
    await expect(root).toHaveAttribute('dir', 'rtl');
    // The alt texts, translated, name the picture and the buttons.
    await expect(stage.getByRole('img', { name: 'AR A map of the site' })).toBeVisible();
    await expect(stage.getByRole('button', { name: 'AR Left' })).toBeVisible();

    // The skip link, in Arabic, goes to the author's first stop; Tab to the second.
    await root.focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'AR Skip to slide' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(stage.getByRole('button', { name: 'AR Right' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(stage.getByRole('button', { name: 'AR Left' })).toBeFocused();
    // Its ring is the strengthened accent.
    const ring = await page
      .locator('.vo-player-next')
      .evaluate((element) => getComputedStyle(element).getPropertyValue('--vo-accent').trim());
    expect(ring).toBe(accentFor(accent, 'light'));

    // The text view, turned on from the accessibility panel, in Arabic.
    await page.locator('.vo-player-a11y-button').click();
    await page.locator('.vo-player-a11y input[type="checkbox"]').check();
    const view = page.getByRole('complementary', { name: 'AR Slide text' });
    await expect(view).toBeVisible();
    await expect(view.locator('p')).toContainText(['AR Picture: AR A map of the site']);
  } finally {
    await browser.close();
  }
});

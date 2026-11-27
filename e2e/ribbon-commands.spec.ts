import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { answerDialogs, launchApp, previewFrom } from './launch';
import { chooseEffect, effectButton } from './animation';

/**
 * The ribbon's new commands (docs/briefs/B17-ribbon-and-panels.md, part 1): Animation Painter,
 * Hyperlink, Trigger, Symbol, Clear Formatting, and Find and Replace; each change undoable.
 */

const ribbonTab = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const objects = (page: Page) => page.locator('.stage-slide > [data-object-id]');
const undo = (page: Page) => page.getByRole('button', { name: 'Undo', exact: true }).click();

test('Animation Painter, Hyperlink, Trigger, Symbol, Clear Formatting, and Find and Replace (B17)', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [1] });
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();

    // Two buttons, side by side; the first flies in.
    for (const x of ['100', '900']) {
      await ribbonTab(page, 'Insert');
      await page.getByRole('button', { name: 'Button', exact: true }).click();
      await page.getByTestId('right-upper').getByRole('tab', { name: 'Format' }).click();
      const field = page.getByTestId('format-panel').getByLabel('X', { exact: true });
      await field.fill(x);
      await field.press('Enter');
    }
    await objects(page).nth(0).click();
    await ribbonTab(page, 'Animations');
    await chooseEffect(page, 'Entrance', 'Fly');

    // Animation Painter: the first button's entrance onto the second, in one undoable step.
    await page.getByRole('button', { name: 'Animation Painter', exact: true }).click();
    await objects(page).nth(1).click();
    await expect(effectButton(page, 'Entrance')).toHaveAttribute('data-kind', 'fly');
    await expect(
      page.getByRole('button', { name: 'Animation Painter', exact: true }),
    ).toBeVisible();
    await undo(page);
    await objects(page).nth(1).click();
    await expect(effectButton(page, 'Entrance')).not.toHaveAttribute('data-kind', 'fly');

    // Hyperlink on an object: a click trigger that opens the address.
    await ribbonTab(page, 'Insert');
    await page.getByRole('button', { name: 'Hyperlink', exact: true }).click();
    const address = page.getByLabel('Link address');
    await address.fill('https://example.org/');
    await address.press('Enter');
    const triggers = page.getByTestId('triggers');
    await page.getByTestId('right-upper').getByRole('tab', { name: 'Triggers' }).click();
    await expect(triggers).toContainText('Open https://example.org/');
    await undo(page);
    await expect(triggers).not.toContainText('Open https://example.org/');

    // Trigger opens the new-trigger wizard, on the Triggers tab.
    await page.getByTestId('right-upper').getByRole('tab', { name: 'Format' }).click();
    await page.getByRole('button', { name: 'Trigger', exact: true }).click();
    await expect(page.getByTestId('trigger-wizard')).toBeVisible();
    await expect(
      page.getByTestId('right-upper').getByRole('tab', { name: 'Triggers' }),
    ).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('trigger-wizard').getByRole('button', { name: 'Cancel' }).click();

    // Symbol: typed where the text cursor is.
    await page.getByRole('button', { name: 'Text Box', exact: true }).click();
    const box = page.locator('.stage-slide > [data-object-type="text"]');
    await box.dblclick();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Hello');
    await ribbonTab(page, 'Insert');
    await page.getByRole('button', { name: 'Symbol', exact: true }).click();
    await page.getByRole('button', { name: 'Insert ©', exact: true }).click();
    await expect(page.getByTestId('text-editor')).toHaveText('Hello©');
    await page.keyboard.press('Escape');
    await expect(box).toHaveText('Hello©');

    // Clear Formatting takes bold away again.
    await box.click();
    await ribbonTab(page, 'Home');
    await page.getByRole('button', { name: 'Bold', exact: true }).click();
    await expect(box.locator('strong')).toHaveText('Hello©');
    await page.getByRole('button', { name: 'Clear formatting', exact: true }).click();
    await expect(box.locator('strong')).toHaveCount(0);
    await expect(box).toHaveText('Hello©');

    // Find and Replace across the course, undone in one step.
    await page.getByRole('button', { name: 'Find and Replace…', exact: true }).click();
    const dialog = page.getByTestId('find-replace');
    await dialog.getByLabel('Find', { exact: true }).fill('hello');
    await expect(dialog.getByTestId('find-count')).toHaveText('1 match in 1 object.');
    await dialog.getByLabel('Match case').check();
    await expect(dialog.getByTestId('find-count')).toHaveText('Not found.');
    await dialog.getByLabel('Match case').uncheck();
    await dialog.getByLabel('Replace with').fill('Howdy');
    await dialog.getByRole('button', { name: 'Replace All' }).click();
    await expect(dialog.getByTestId('find-count')).toHaveText('Replaced 1 time.');
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(box).toHaveText('Howdy©');
    await undo(page);
    await expect(box).toHaveText('Hello©');
  } finally {
    await app.close();
  }
});

test('Insert → Caption makes callouts, and Design applies a ready-made theme, undoably (B17)', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [1] });
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();

    await ribbonTab(page, 'Insert');
    for (const kind of ['Rounded', 'Square', 'Oval', 'Cloud']) {
      await page.getByRole('button', { name: 'Caption', exact: true }).click();
      await page.getByRole('menuitem', { name: `${kind} Callout`, exact: true }).click();
      await expect(page.getByTestId('selection-name')).toHaveText(`${kind} Callout`);
    }
    await expect(objects(page)).toHaveCount(4);
    // Drawn as path shapes, the cloud with its bubbles.
    await expect(objects(page).last().locator('path')).toHaveCount(4);

    await ribbonTab(page, 'Design');
    const themes = page.getByRole('radiogroup', { name: 'Ready-made themes' });
    await expect(themes.getByRole('radio', { name: 'Default theme' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await themes.getByRole('radio', { name: 'Harbour theme' }).click();
    await expect(themes.getByRole('radio', { name: 'Harbour theme' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await undo(page);
    await expect(themes.getByRole('radio', { name: 'Default theme' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  } finally {
    await app.close();
  }
});

test('Design → Background gives a slide its own fill, shown on the stage and in the course, and hides its layout objects (B17)', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [1] });
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    const background = page.getByTestId('stage').locator('.vo-slide-background');
    await expect(background).toHaveCount(0);

    await ribbonTab(page, 'Design');
    await page.getByRole('button', { name: 'Background', exact: true }).click();
    await page.getByLabel('Background fill').selectOption('solid');
    await page.getByLabel('Background colour').fill('#123456');
    await expect(background.locator('rect')).toHaveAttribute('fill', '#123456');
    await page.getByLabel('Background fill').selectOption('gradient');
    await page.getByLabel('Gradient direction').selectOption('0');
    await expect(background.locator('linearGradient')).toHaveCount(1);
    await page.keyboard.press('Escape');

    // In the course too.
    const [preview] = await Promise.all([
      app.waitForEvent('window'),
      previewFrom(page, 'This Slide'),
    ]);
    await expect(preview.locator('.vo-slide-background linearGradient')).toHaveCount(1);
    await preview.close();

    // Hide Layout Objects is an on/off command, undoable like the background.
    const hide = page.getByRole('button', { name: 'Hide Layout Objects', exact: true });
    await expect(hide).toHaveAttribute('aria-pressed', 'false');
    await hide.click();
    await expect(hide).toHaveAttribute('aria-pressed', 'true');
    await undo(page);
    await expect(hide).toHaveAttribute('aria-pressed', 'false');
    // Four steps set it (fill, colour, gradient, direction); undone, the theme's shows again.
    for (let i = 0; i < 6 && (await background.count()) > 0; i++) await undo(page);
    await expect(background).toHaveCount(0);
  } finally {
    await app.close();
  }
});

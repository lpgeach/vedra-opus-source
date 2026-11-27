import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { answerDialogs, launchApp } from './launch';

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const commands = (page: Page) => page.getByTestId('ribbon').getByRole('tabpanel');
const marks = (page: Page) => page.getByTestId('slide-transition-mark');
const slideItem = (page: Page, n: number) =>
  page
    .getByTestId('slide-list')
    .getByRole('button')
    .nth(n - 1);
const layerRow = (page: Page, name: string) =>
  page.getByTestId('layer-row').filter({ hasText: name }).locator('.layer-name');
/** A tile in the Transitions tab's gallery (B27), of the slide's or the layer's transition. */
const tile = (page: Page, gallery: 'Slide transition' | 'Layer transition', name: string) =>
  page
    .getByRole('radiogroup', { name: gallery, exact: true })
    .getByRole('radio', { name, exact: true });

test('transitions: a slide’s, applied to all, and a layer’s; previewed, kept, and played', async () => {
  test.setTimeout(120_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-transitions-'));
  const file = join(work, 'transitions.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { save: [file], message: [1, 1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await page.getByRole('button', { name: 'New Slide' }).click();
    await expect(page.getByTestId('project-status')).toContainText('Slide 2 of 2');

    await ribbon(page, 'Transitions');
    await tile(page, 'Slide transition', 'Push').click();
    await page.getByLabel('Slide transition direction').selectOption('left');
    await page.getByLabel('Slide transition duration').fill('1');
    await page.getByLabel('Slide transition duration').press('Enter');
    await expect(marks(page)).toHaveCount(1);
    await expect(slideItem(page, 2)).toHaveAttribute('data-transition', 'push');

    // Preview plays it once on the stage.
    await commands(page).getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.getByTestId('transition-preview')).toHaveAttribute('data-kind', 'push');
    await expect(page.getByTestId('transition-preview')).toHaveCount(0, { timeout: 3000 });

    await commands(page).getByRole('button', { name: 'Apply to All Slides' }).click();
    await expect(marks(page)).toHaveCount(2);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(marks(page)).toHaveCount(1);
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(marks(page)).toHaveCount(2);

    // A layer of its own, fading.
    await page.getByRole('tab', { name: 'Slide Layers', exact: true }).click();
    await page.getByRole('button', { name: 'New layer' }).click();
    await ribbon(page, 'Transitions');
    // While the layer is being edited, the tab sets the layer's transition.
    await tile(page, 'Layer transition', 'Fade').click();
    await commands(page).getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.getByTestId('transition-preview')).toHaveAttribute('data-kind', 'fade');

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('project-status')).toContainText('Saved');
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ args: [file] });
  try {
    const { app, page } = second;
    await answerDialogs(app, { open: [[out]], message: [1, 1] });
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await expect(marks(page)).toHaveCount(2);
    await slideItem(page, 2).click();
    await ribbon(page, 'Transitions');
    await expect(tile(page, 'Slide transition', 'Push')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByLabel('Slide transition direction')).toHaveValue('left');
    await expect(page.getByLabel('Slide transition duration')).toHaveValue('1');
    await page.getByRole('tab', { name: 'Slide Layers', exact: true }).click();
    await layerRow(page, 'Layer 1').click();
    await expect(tile(page, 'Layer transition', 'Fade')).toHaveAttribute('aria-checked', 'true');

    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const dialog = page.getByTestId('publish-dialog');
    await dialog.getByRole('button', { name: 'Choose folder…' }).click();
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-result')).toBeVisible();
  } finally {
    await second.app.close();
  }

  // In a browser: going to slide 2, both slides are drawn while it is pushed in, then only one.
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(join(out, 'untitled-project', 'index.html')).href);
    await expect(page.locator('.vo-player-position')).toHaveText('Slide 1 of 2');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.locator('.vo-player-leaving')).toHaveCount(1);
    await expect(page.locator('.vo-player-slide')).toHaveCount(2);
    await expect(page.locator('.vo-player-leaving')).toHaveCount(0, { timeout: 3000 });
    await expect(page.locator('.vo-player-slide')).toHaveCount(1);
  } finally {
    await browser.close();
  }
});

test('the gallery: a tile for each transition, chosen by pointer or keys, each picture playing while pointed at (B27)', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await ribbon(page, 'Transitions');
    const gallery = page.getByRole('radiogroup', { name: 'Slide transition', exact: true });
    await expect(gallery.getByRole('radio')).toHaveText([
      'None',
      'Fade',
      'Push',
      'Cover',
      'Uncover',
      'Wipe',
      'Split',
      'Iris',
      'Zoom',
    ]);
    await expect(tile(page, 'Slide transition', 'None')).toHaveAttribute('aria-checked', 'true');
    // With no transition, there is no direction or duration to set.
    await expect(page.getByLabel('Slide transition direction')).toBeDisabled();
    await expect(page.getByLabel('Slide transition duration')).toBeDisabled();

    // Push from the left, then Cover: the direction carries over, as Cover takes it too.
    await tile(page, 'Slide transition', 'Push').click();
    await page.getByLabel('Slide transition direction').selectOption('left');
    await tile(page, 'Slide transition', 'Cover').click();
    await expect(tile(page, 'Slide transition', 'Cover')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByLabel('Slide transition direction')).toHaveValue('left');
    // Fade has no direction.
    await tile(page, 'Slide transition', 'Fade').click();
    await expect(page.getByLabel('Slide transition direction')).toBeDisabled();

    // The arrow keys move through the gallery and choose, as radio buttons do.
    await tile(page, 'Slide transition', 'Fade').focus();
    await page.keyboard.press('ArrowRight');
    await expect(tile(page, 'Slide transition', 'Push')).toHaveAttribute('aria-checked', 'true');
    await expect(tile(page, 'Slide transition', 'Push')).toBeFocused();
    await page.keyboard.press('End');
    await expect(tile(page, 'Slide transition', 'Zoom')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(tile(page, 'Slide transition', 'None')).toHaveAttribute('aria-checked', 'true');
    // One undo step for each choice.
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(tile(page, 'Slide transition', 'Zoom')).toHaveAttribute('aria-checked', 'true');

    // Pointing at a tile plays its picture; moving away leaves it standing still.
    const running = (name: string) =>
      tile(page, 'Slide transition', name).evaluate((element) =>
        element.getAnimations({ subtree: true }).some((each) => each.playState === 'running'),
      );
    await page.mouse.move(0, 0);
    expect(await running('Wipe')).toBe(false);
    await tile(page, 'Slide transition', 'Wipe').hover();
    await expect.poll(() => running('Wipe')).toBe(true);
    await page.mouse.move(0, 0);
    await expect.poll(() => running('Wipe')).toBe(false);
  } finally {
    await app.close();
  }
});

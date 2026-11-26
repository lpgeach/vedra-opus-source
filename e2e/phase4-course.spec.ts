import { chromium, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { answerDialogs, launchApp, previewFrom } from './launch';

/**
 * Phase 4 end to end: a course built only through the UI with every kind of
 * interactivity, saved, reopened in a fresh app, then played in preview and as
 * a published course. Proves the pieces work together and survive a save.
 */

const ribbonTab = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const rightTab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true }).click();
const wizard = (page: Page) => page.getByTestId('trigger-wizard');
const selectRow = (page: Page, name: string) =>
  page.getByTestId('timeline-row').filter({ hasText: name }).locator('.timeline-name').click();

async function typeInto(page: Page, box: ReturnType<Page['locator']>, text: string) {
  const bounds = (await box.boundingBox())!;
  await box.dblclick({ position: { x: bounds.width / 4, y: bounds.height / 2 } });
  await expect(page.getByTestId('text-editor')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
}

async function build(page: Page): Promise<void> {
  // A variable.
  await ribbonTab(page, 'Insert');
  await page.getByRole('button', { name: 'Variables', exact: true }).click();
  const variables = page.getByTestId('variables-dialog');
  await variables.getByRole('button', { name: 'Add variable' }).click();
  await variables.getByLabel('Variable name').fill('Score');
  await variables.getByLabel('Variable name').press('Enter');
  await variables.getByLabel('Variable type').selectOption('number');
  await variables.getByRole('button', { name: 'Close' }).click();

  // A text box showing it, and a button with a hover state.
  await page.getByRole('button', { name: 'Text Box', exact: true }).click();
  await typeInto(page, page.locator('.stage-slide > [data-object-type="text"]'), 'Score: %Score%');
  await ribbonTab(page, 'Insert');
  await page.getByRole('button', { name: 'Button', exact: true }).click();
  await page.getByTestId('panel-bottom').getByRole('tab', { name: 'States' }).click();
  await page.getByLabel('Add state').selectOption('hover');
  await page.getByRole('button', { name: 'Done editing states' }).click();
  await page.getByTestId('panel-bottom').getByRole('tab', { name: 'Timeline' }).click();

  // A layer with a message on it.
  await rightTab(page, 'Slide Layers');
  await page.getByRole('button', { name: 'New layer' }).click();
  await ribbonTab(page, 'Insert');
  await page.getByRole('button', { name: 'Text Box', exact: true }).click();
  await typeInto(page, page.locator('.stage-slide > [data-object-type="text"]'), 'Well done');
  await rightTab(page, 'Slide Layers');
  await page
    .getByTestId('layer-row')
    .filter({ hasText: 'Base Layer' })
    .locator('.layer-name')
    .click();

  // Clicking the button adds 1; at 2 or more it shows the layer.
  await selectRow(page, 'Button');
  await rightTab(page, 'Triggers');
  await page.getByRole('button', { name: 'New trigger' }).click();
  await wizard(page).getByLabel('Action', { exact: true }).selectOption('setVariable');
  await wizard(page).getByLabel('Action operation').selectOption('add');
  await wizard(page).getByLabel('Action value', { exact: true }).fill('1');
  await wizard(page).getByLabel('Action value', { exact: true }).press('Enter');
  await wizard(page).getByRole('button', { name: 'Add trigger' }).click();

  await page.getByRole('button', { name: 'New trigger' }).click();
  await wizard(page).getByLabel('Action', { exact: true }).selectOption('showLayer');
  await wizard(page).getByRole('button', { name: 'Add condition' }).click();
  await wizard(page).getByLabel('Comparison').selectOption('>=');
  await wizard(page).getByLabel('Compared with', { exact: true }).fill('2');
  await wizard(page).getByLabel('Compared with', { exact: true }).press('Enter');
  await expect(page.getByTestId('trigger-sentence')).toHaveText(
    'Show layer Layer 1 when the learner clicks Button if Score is at least 2',
  );
  await wizard(page).getByRole('button', { name: 'Add trigger' }).click();

  // Pressing S runs JavaScript that sets the score to 10.
  await page.getByRole('button', { name: 'New trigger' }).click();
  await wizard(page).getByLabel('Action', { exact: true }).selectOption('executeJavaScript');
  await wizard(page).getByLabel('Action code').fill("player.setVar('Score', 10);");
  await wizard(page).getByLabel('Action code').blur();
  await wizard(page).getByLabel('Event', { exact: true }).selectOption('keyPress');
  await wizard(page).getByLabel('Key').click();
  await page.keyboard.press('s');
  await wizard(page).getByRole('button', { name: 'Add trigger' }).click();
  await expect(page.getByTestId('trigger-item')).toHaveCount(3);

  // No Next button on this slide.
  await ribbonTab(page, 'Home');
  await page.getByRole('button', { name: 'New Slide' }).click();
  await page.getByTestId('slide-list').locator('.slide-item').first().click();
  await rightTab(page, 'Slide Properties');
  await page.getByTestId('slide-properties').getByLabel('Next').uncheck();
}

/** Play the course in a page: the same in preview and published. */
async function play(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const score = page.locator('[data-object-type="text"]').first();
  const button = page.locator('[data-object-type="button"]');
  const message = page.locator('.vo-player-layer').nth(1);
  await expect(score).toContainText('Score: 0');
  await expect(page.getByRole('button', { name: 'Next' })).toBeHidden();
  const messageShown = () => message.evaluate((e: HTMLElement) => e.style.display !== 'none');

  await button.hover();
  await expect.poll(() => button.getAttribute('data-state')).toBe('hover');
  await button.click();
  await expect(score).toContainText('Score: 1');
  expect(await messageShown()).toBe(false);
  await button.click();
  await expect(score).toContainText('Score: 2');
  await expect.poll(messageShown).toBe(true);
  await expect(message).toContainText('Well done');

  await page.locator('.vo-player').focus();
  await page.keyboard.press('s');
  await expect(score).toContainText('Score: 10');
  expect(errors).toEqual([]);
}

async function startWith(args: string[] = []): Promise<{ app: ElectronApplication; page: Page }> {
  const { app, page } = await launchApp({ args });
  return { app, page };
}

test('a course using all of Phase 4 survives saving and plays in preview and published', async () => {
  test.setTimeout(120_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-phase4-'));
  const file = join(work, 'interactive.vedraopus');
  const out = join(work, 'out');

  // Build and save.
  {
    const { app, page } = await startWith();
    try {
      await answerDialogs(app, { save: [file], message: [1] });
      await page.getByRole('button', { name: 'New Project' }).click();
      await expect(page.getByTestId('stage-canvas')).toBeVisible();
      await build(page);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByTestId('project-status')).toContainText('Saved');
      expect(existsSync(file)).toBe(true);
    } finally {
      await app.close();
    }
  }

  // Reopen in a fresh app: everything is still there.
  const { app, page } = await startWith([file]);
  try {
    await answerDialogs(app, { open: [[out]], message: [1, 1] });
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await rightTab(page, 'Triggers');
    await expect(page.getByTestId('trigger-item')).toHaveCount(3);
    await expect(page.getByTestId('triggers-panel')).toContainText(
      'Show layer Layer 1 when the learner clicks Button if Score is at least 2',
    );
    await expect(page.getByTestId('triggers-panel')).toContainText('when the learner presses s');
    await rightTab(page, 'Slide Layers');
    await expect(page.getByTestId('layer-row').filter({ hasText: 'Layer 1' })).toHaveCount(1);
    await rightTab(page, 'Slide Properties');
    await expect(page.getByTestId('slide-properties').getByLabel('Next')).not.toBeChecked();
    await selectRow(page, 'Button');
    await page.getByTestId('panel-bottom').getByRole('tab', { name: 'States' }).click();
    await expect(page.getByTestId('states-panel').locator('.state-chip')).toHaveCount(2);

    // Preview.
    await ribbonTab(page, 'Home');
    const [preview] = await Promise.all([
      app.waitForEvent('window'),
      previewFrom(page, 'This Slide'),
    ]);
    await play(preview);
    await preview.close();

    // Publish.
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const dialog = page.getByTestId('publish-dialog');
    await dialog.getByRole('button', { name: 'Choose folder…' }).click();
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-result')).toBeVisible();
  } finally {
    await app.close();
  }

  // The published course, from disk, in a plain browser.
  const browser = await chromium.launch();
  try {
    const published = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await published.goto(pathToFileURL(join(out, 'untitled-project', 'index.html')).href);
    await play(published);
  } finally {
    await browser.close();
  }
});

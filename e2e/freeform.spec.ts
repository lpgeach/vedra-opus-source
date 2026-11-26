import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { submitAnswer } from './course';
import { answerDialogs, launchApp } from './launch';

/** Freeform questions, made by converting slides (docs/briefs/P7.4-freeform-questions.md). */

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const form = (page: Page) => page.getByTestId('question-form');
const slideItem = (page: Page, n: number) =>
  page
    .getByTestId('slide-list')
    .getByRole('button')
    .nth(n - 1);

/** Insert a shape from the gallery and put it at `x` with the Format panel. */
async function shapeAt(page: Page, label: string, x: number) {
  await ribbon(page, 'Insert');
  await page.getByRole('button', { name: 'Shape', exact: true }).click();
  await page.getByTestId('shape-gallery').getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('tab', { name: 'Format', exact: true }).click();
  const field = page.getByTestId('format-panel').getByLabel('X', { exact: true });
  await field.fill(String(x));
  await field.press('Enter');
}

async function convert(page: Page, kind: string) {
  await ribbon(page, 'Insert');
  await page.getByRole('button', { name: 'Convert Slide', exact: true }).click();
  await page.getByRole('menuitem', { name: kind, exact: true }).click();
  await expect(form(page)).toBeVisible();
}

test('pick one and shortcut key: slides converted, set up, kept, and answered', async () => {
  test.setTimeout(150_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-freeform-'));
  const file = join(work, 'freeform.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { save: [file], message: [1, 1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();

    // Slide 1: three shapes the author drew, converted to pick one; the ellipse is right.
    await shapeAt(page, 'Rectangle', 100);
    await shapeAt(page, 'Ellipse', 450);
    await shapeAt(page, 'Triangle', 800);
    await convert(page, 'Pick One');
    await expect(form(page).getByLabel('Question type', { exact: true })).toHaveValue(
      'freePickOne',
    );
    for (const name of ['Rectangle', 'Ellipse', 'Triangle']) {
      await form(page).getByLabel(`“${name}” is a choice`, { exact: true }).check();
    }
    await form(page).getByLabel('“Ellipse” is correct', { exact: true }).check();
    await expect(page.getByTestId('question-warning')).toHaveCount(0);
    // The Submit button the conversion added is the question's, and not a choice.
    await expect(form(page).getByLabel('Submit button', { exact: true })).not.toHaveValue('');
    await expect(form(page).getByLabel('“Submit” is a choice', { exact: true })).toHaveCount(0);

    // Slide 2: a new slide converted to a shortcut key, Ctrl+K, recorded by pressing it.
    await ribbon(page, 'Home');
    await page.getByRole('button', { name: 'New Slide' }).click();
    await convert(page, 'Shortcut Key');
    await expect(page.getByTestId('question-kind')).toHaveText('Shortcut key (freeform)');
    await page.getByTestId('shortcut-key').press('Control+k');
    await expect(page.getByTestId('shortcut-key')).toHaveValue('Ctrl+K');

    await ribbon(page, 'Home');
    await page.getByRole('button', { name: 'New Slide' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('project-status')).toContainText('Saved');
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ args: [file] });
  try {
    const { app, page } = second;
    await answerDialogs(app, { open: [[out]], message: [1, 1] });
    await slideItem(page, 1).click();
    await expect(form(page).getByLabel('“Ellipse” is correct', { exact: true })).toBeChecked();
    await expect(form(page).getByLabel('“Triangle” is a choice', { exact: true })).toBeChecked();
    await slideItem(page, 2).click();
    await expect(page.getByTestId('shortcut-key')).toHaveValue('Ctrl+K');
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const dialog = page.getByTestId('publish-dialog');
    await dialog.getByRole('button', { name: 'Choose folder…' }).click();
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-result')).toBeVisible();
  } finally {
    await second.app.close();
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await page.goto(pathToFileURL(join(out, 'untitled-project', 'index.html')).href);
    const position = page.locator('.vo-player-position');
    await expect(position).toHaveText('Slide 1 of 3');
    // The shapes in the order they were drawn: the ellipse is the second.
    const shapes = page
      .locator('.vo-player-stage [data-object-type="shape"]')
      // What the learner sees: not the hidden feedback layers' panels (P7.5).
      .filter({ visible: true });
    await expect(shapes).toHaveCount(3);
    await shapes.nth(0).click();
    await shapes.nth(1).click();
    await expect(shapes.nth(0)).toHaveAttribute('data-state', 'normal');
    await expect(shapes.nth(1)).toHaveAttribute('data-state', 'selected');
    await submitAnswer(page);
    await expect(position).toHaveText('Slide 2 of 3');
    await page.keyboard.press('Control+k');
    // Right: the Correct feedback layer, whose Continue moves on (P7.5).
    await page.getByText('Continue', { exact: true }).filter({ visible: true }).click();
    await expect(position).toHaveText('Slide 3 of 3');
  } finally {
    await browser.close();
  }
});

test('drag and drop: a slide converted, items and targets chosen, kept, and answered', async () => {
  test.setTimeout(150_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-freeform-drag-'));
  const file = join(work, 'drag.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { save: [file], message: [1, 1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await shapeAt(page, 'Rectangle', 100);
    await shapeAt(page, 'Ellipse', 700);
    await convert(page, 'Drag and Drop');
    await expect(page.getByTestId('question-warning')).toBeVisible();
    await form(page).getByLabel('Role of “Rectangle”', { exact: true }).selectOption('item');
    await form(page).getByLabel('Role of “Ellipse”', { exact: true }).selectOption('target');
    await form(page)
      .getByLabel('Where “Rectangle” belongs', { exact: true })
      .selectOption({ label: 'On “Ellipse”' });
    await expect(page.getByTestId('question-warning')).toHaveCount(0);
    await ribbon(page, 'Home');
    await page.getByRole('button', { name: 'New Slide' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('project-status')).toContainText('Saved');
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ args: [file] });
  try {
    const { app, page } = second;
    await answerDialogs(app, { open: [[out]], message: [1, 1] });
    await slideItem(page, 1).click();
    await expect(form(page).getByLabel('Role of “Ellipse”', { exact: true })).toHaveValue('target');
    await expect(
      form(page).getByLabel('Where “Rectangle” belongs', { exact: true }).locator('option:checked'),
    ).toHaveText('On “Ellipse”');
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const dialog = page.getByTestId('publish-dialog');
    await dialog.getByRole('button', { name: 'Choose folder…' }).click();
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-result')).toBeVisible();
  } finally {
    await second.app.close();
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await page.goto(pathToFileURL(join(out, 'untitled-project', 'index.html')).href);
    const position = page.locator('.vo-player-position');
    const shapes = page
      .locator('.vo-player-stage [data-object-type="shape"]')
      // What the learner sees: not the hidden feedback layers' panels (P7.5).
      .filter({ visible: true });
    await expect(shapes).toHaveCount(2);
    await expect(shapes.nth(0)).toHaveAttribute('data-draggable', 'true');
    const box = async (n: number) => {
      const b = (await shapes.nth(n).boundingBox())!;
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    const from = await box(0);
    const to = await box(1);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    await submitAnswer(page);
    await expect(position).toHaveText('Slide 2 of 2');
  } finally {
    await browser.close();
  }
});

test('hotspot: a slide converted, its right region ticked, kept, and marked right after a wrong try', async () => {
  test.setTimeout(150_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-freeform-hotspot-'));
  const file = join(work, 'hotspot.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { save: [file], message: [1, 1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await shapeAt(page, 'Rectangle', 100);
    await shapeAt(page, 'Ellipse', 700);
    await convert(page, 'Hotspot');
    await expect(page.getByTestId('question-kind')).toHaveText('Hotspot (freeform)');
    await form(page).getByLabel('“Rectangle” is a region', { exact: true }).check();
    await form(page).getByLabel('“Ellipse” is a region', { exact: true }).check();
    await form(page).getByLabel('“Ellipse” is a right region', { exact: true }).check();
    await form(page).getByLabel('Attempts allowed', { exact: true }).selectOption('2');
    await ribbon(page, 'Home');
    await page.getByRole('button', { name: 'New Slide' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('project-status')).toContainText('Saved');
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ args: [file] });
  try {
    const { app, page } = second;
    await answerDialogs(app, { open: [[out]], message: [1, 1] });
    await slideItem(page, 1).click();
    await expect(
      form(page).getByLabel('“Ellipse” is a right region', { exact: true }),
    ).toBeChecked();
    await expect(
      form(page).getByLabel('“Rectangle” is a right region', { exact: true }),
    ).not.toBeChecked();
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const dialog = page.getByTestId('publish-dialog');
    await dialog.getByRole('button', { name: 'Choose folder…' }).click();
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-result')).toBeVisible();
  } finally {
    await second.app.close();
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await page.goto(pathToFileURL(join(out, 'untitled-project', 'index.html')).href);
    const position = page.locator('.vo-player-position');
    const shapes = page
      .locator('.vo-player-stage [data-object-type="shape"]')
      // What the learner sees: not the hidden feedback layers' panels (P7.5).
      .filter({ visible: true });
    // The rectangle (wrong), then the ellipse (right).
    await shapes.nth(0).click();
    await submitAnswer(page);
    await expect(position).toHaveText('Slide 1 of 2');
    await shapes.nth(1).click();
    await submitAnswer(page);
    await expect(position).toHaveText('Slide 2 of 2');
  } finally {
    await browser.close();
  }
});

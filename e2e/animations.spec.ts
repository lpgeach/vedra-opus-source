import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { answerDialogs, launchApp } from './launch';

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const row = (page: Page, name: string) =>
  page.getByTestId('timeline-row').filter({ hasText: name });
const onStage = (page: Page) =>
  page.locator('[data-testid="stage-canvas"] .stage-slide > [data-object-type="button"]');
const handle = (page: Page, role: 'start' | 'end') =>
  page.locator(`[data-testid="path-handle"][data-role="${role}"]`);
const middle = async (page: Page, role: 'start' | 'end') => {
  const box = (await handle(page, role).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
const zoomOf = async (page: Page) =>
  Number(await page.getByTestId('stage-canvas').getAttribute('data-zoom'));
/** How far the path's end is from its start, in stage units. */
const pathEnd = async (page: Page) => {
  const zoom = await zoomOf(page);
  const start = await middle(page, 'start');
  const end = await middle(page, 'end');
  return { x: (end.x - start.x) / zoom, y: (end.y - start.y) / zoom };
};
async function rulerPoint(page: Page, seconds: number) {
  const ruler = page.getByTestId('timeline-ruler');
  await page.locator('.timeline-scroll').evaluate((element) => element.scrollTo(0, 0));
  const box = (await ruler.boundingBox())!;
  const pps = Number(await ruler.getAttribute('data-pps'));
  return { x: box.x + seconds * pps, y: box.y + 4 };
}
/** The `easeInOut` of the engine: 2p² to halfway, then 1 − 2(1 − p)². */
const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p));
const translateX = (style: string) => (style === '' ? 0 : Number.parseFloat(style));

test('animations: an entrance, an exit and a motion path, set in the editor, kept, scrubbed and published', async () => {
  test.setTimeout(120_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-animations-'));
  const file = join(work, 'animated.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);
  let end: { x: number; y: number };

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { save: [file], message: [1, 1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await ribbon(page, 'Animations');
    await expect(page.getByTestId('animations-hint')).toContainText('Select one object');
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Button', exact: true }).click();

    await ribbon(page, 'Animations');
    await page.getByLabel('Entrance effect').selectOption('fly');
    await page.getByLabel('Entrance direction').selectOption('right');
    await page.getByLabel('Entrance duration').fill('1');
    await page.getByLabel('Entrance duration').press('Enter');
    await page.getByLabel('Exit effect').selectOption('fade');
    // A button has text, so it can come in by paragraph.
    await expect(page.getByLabel('Entrance by paragraph')).not.toBeChecked();

    // The bar shades the entrance at its start and the exit at its end.
    await expect(row(page, 'Button').getByTestId('timeline-entrance')).toHaveAttribute(
      'data-seconds',
      '1',
    );
    await expect(row(page, 'Button').getByTestId('timeline-exit')).toHaveAttribute(
      'data-seconds',
      '0.5',
    );

    // A line path, with the trigger that runs it.
    await page.getByRole('button', { name: 'Add line path' }).click();
    await expect(page.getByTestId('motion-path')).toHaveCount(1);
    await expect(page.getByTestId('path-handle')).toHaveCount(2);
    await expect(page.getByLabel('Motion path', { exact: true })).toHaveValue(/.+/);
    await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
    await expect(page.getByTestId('trigger-item')).toContainText(
      'Move Button along Line when the timeline of the slide starts',
    );

    // Drag the path's end 100 stage units down; one undo puts it back.
    const before = await pathEnd(page);
    const zoom = await zoomOf(page);
    const grip = await middle(page, 'end');
    await page.mouse.move(grip.x, grip.y);
    await page.mouse.down();
    await page.mouse.move(grip.x, grip.y + 100 * zoom, { steps: 6 });
    await page.mouse.up();
    end = await pathEnd(page);
    expect(end.x).toBeCloseTo(before.x, 0);
    expect(end.y).toBeCloseTo(before.y + 100, 0);
    await page.getByRole('button', { name: 'Undo' }).click();
    expect((await pathEnd(page)).y).toBeCloseTo(before.y, 0);
    await page.getByRole('button', { name: 'Redo' }).click();
    expect((await pathEnd(page)).y).toBeCloseTo(before.y + 100, 0);
    end = await pathEnd(page);

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
    await row(page, 'Button').locator('.timeline-name').click();
    await ribbon(page, 'Animations');
    await expect(page.getByLabel('Entrance effect')).toHaveValue('fly');
    await expect(page.getByLabel('Entrance direction')).toHaveValue('right');
    await expect(page.getByLabel('Exit effect')).toHaveValue('fade');
    await expect(page.getByLabel('Motion path', { exact: true }).locator('option')).toHaveText([
      'Line',
    ]);

    // Scrubbing: at 1 s the 2 s path (speeding up, then slowing down) is part way.
    const at = await rulerPoint(page, 1);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    const shown = Number(await page.getByTestId('timeline-playhead').getAttribute('data-time'));
    const style = await onStage(page).evaluate((element: HTMLElement) => element.style.translate);
    expect(translateX(style)).toBeCloseTo(end.x * easeInOut(shown / 2), 0);
    // At 0.5 s the fly-in is still under way.
    const halfway = await rulerPoint(page, 0.5);
    await page.mouse.move(halfway.x, halfway.y);
    await expect
      .poll(() => onStage(page).evaluate((element) => element.getAnimations().length))
      .toBe(1);
    await page.mouse.up();
    // Not scrubbing: the button is back where it is edited.
    await expect
      .poll(() => onStage(page).evaluate((element: HTMLElement) => element.style.translate))
      .toBe('');

    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const dialog = page.getByTestId('publish-dialog');
    await dialog.getByRole('button', { name: 'Choose folder…' }).click();
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-result')).toBeVisible();
  } finally {
    await second.app.close();
  }

  // The course in a browser: the button flies in, then moves along its path to the end.
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(join(out, 'untitled-project', 'index.html')).href);
    const button = page.locator('[data-object-type="button"]');
    await expect
      .poll(() => button.evaluate((element) => element.getAnimations().length))
      .toBeGreaterThan(0);
    await expect
      .poll(
        () => button.evaluate((element: HTMLElement) => Number.parseFloat(element.style.translate)),
        { timeout: 6000 },
      )
      .toBeCloseTo(end.x, 0);
  } finally {
    await browser.close();
  }
});

test('a freeform path drawn on the stage, and triggers for moving along it and its end', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [1, 1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Button', exact: true }).click();
    await ribbon(page, 'Animations');

    // Escape gives up drawing.
    await page.getByRole('button', { name: 'Draw freeform path' }).click();
    await expect(page.getByTestId('path-drawing')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('path-drawing')).toHaveCount(0);
    await expect(page.getByTestId('motion-path')).toHaveCount(0);

    await page.getByRole('button', { name: 'Draw freeform path' }).click();
    const box = (await onStage(page).boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (const [dx, dy] of [
      [40, 30],
      [80, 0],
      [120, 30],
      [160, 0],
    ] as const) {
      await page.mouse.move(x + dx, y + dy, { steps: 4 });
    }
    await page.mouse.up();
    await expect(page.getByTestId('path-drawing')).toHaveCount(0);
    await expect(page.getByTestId('motion-path')).toHaveCount(1);
    await expect(page.getByLabel('Motion path', { exact: true }).locator('option')).toHaveText([
      'Freeform',
    ]);
    expect(await page.getByTestId('path-handle').count()).toBeGreaterThanOrEqual(3);
    // It starts where the object is: the drawing is laid from its middle.
    const start = await middle(page, 'start');
    expect(start.x).toBeCloseTo(x, 0);
    expect(start.y).toBeCloseTo(y, 0);

    // A trigger waiting for it to finish, made in the wizard.
    await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
    await page.getByRole('button', { name: 'New trigger' }).click();
    const wizard = page.getByTestId('trigger-wizard');
    await wizard.getByLabel('Event', { exact: true }).selectOption('animationCompletes');
    await wizard.getByLabel('Event animation').selectOption({ label: 'path Freeform' });
    await wizard.getByLabel('Action', { exact: true }).selectOption('moveAlongPath');
    await expect(page.getByTestId('trigger-sentence')).toHaveText(
      'Move Button along Freeform when Button finishes moving along Freeform',
    );
    await wizard.getByRole('button', { name: 'Add trigger' }).click();
    await expect(page.getByTestId('trigger-item')).toHaveCount(2);

    // Deleting the path takes both its triggers.
    await ribbon(page, 'Animations');
    await page.getByRole('button', { name: 'Delete path' }).click();
    await expect(page.getByTestId('motion-path')).toHaveCount(0);
    await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
    await expect(page.getByTestId('trigger-item')).toHaveCount(0);
  } finally {
    await app.close();
  }
});

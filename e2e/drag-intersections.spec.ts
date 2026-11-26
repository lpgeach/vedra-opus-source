import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { answerDialogs, launchApp } from './launch';

/**
 * Dragging and intersections (docs/briefs/P9.7-drag-intersections.md), made in
 * the app: a rectangle the learner can drag, an "intersects" trigger that
 * toggles Met, and a "dropped on" trigger that goes on. They survive a save
 * and a fresh start, and work in the published course.
 */

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const formatPanel = (page: Page) => page.getByTestId('format-panel');

async function insertRectangle(page: Page, x: number) {
  await ribbon(page, 'Insert');
  await page.getByRole('button', { name: 'Shape', exact: true }).click();
  await page
    .getByTestId('shape-gallery')
    .getByRole('button', { name: 'Rectangle', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Format', exact: true }).click();
  const field = formatPanel(page).getByLabel('X', { exact: true });
  await field.fill(String(x));
  await field.press('Enter');
}

async function newTrigger(page: Page, event: string, action?: string) {
  await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
  await page.getByRole('button', { name: 'New trigger' }).click();
  const wizard = page.getByTestId('trigger-wizard');
  await wizard.getByLabel('Event', { exact: true }).selectOption(event);
  if (action) await wizard.getByLabel('Action', { exact: true }).selectOption(action);
  return wizard;
}

test('a draggable object with "dropped on" and "intersects" triggers survives saving and works in the course', async () => {
  test.setTimeout(150_000);
  const work = mkdtempSync(join(tmpdir(), 'vo-e2e-drag-'));
  const file = join(work, 'drag.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { save: [file] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await page.getByRole('button', { name: 'New Slide' }).click();
    await page.getByTestId('slide-list').locator('.slide-item').first().click();

    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Variables', exact: true }).click();
    const variables = page.getByTestId('variables-dialog');
    await variables.getByRole('button', { name: 'Add variable' }).click();
    const row = variables.getByTestId('variable-row').last();
    await row.getByLabel('Variable type').selectOption('boolean');
    await row.getByLabel('Variable name').fill('Met');
    await row.getByLabel('Variable name').press('Enter');
    await variables.getByRole('button', { name: 'Close' }).click();

    // The first rectangle, at the left, is the one learners drag.
    await insertRectangle(page, 100);
    const drag = page.getByTestId('drag-format');
    await drag.getByLabel('Learners can drag it', { exact: true }).check();
    await expect(
      drag.getByLabel('Goes back after it is dropped', { exact: true }),
    ).not.toBeChecked();
    await insertRectangle(page, 800);
    // Not the second one.
    await expect(drag.getByLabel('Learners can drag it', { exact: true })).not.toBeChecked();

    let wizard = await newTrigger(page, 'intersects', 'toggleVariable');
    await expect(page.getByTestId('trigger-sentence')).toContainText('intersects');
    await wizard.getByRole('button', { name: 'Add trigger' }).click();
    wizard = await newTrigger(page, 'droppedOn', 'jumpToSlide');
    await expect(page.getByTestId('trigger-sentence')).toContainText('when the learner drops');
    await wizard.getByRole('button', { name: 'Add trigger' }).click();

    await ribbon(page, 'Home');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('project-status')).toContainText('Saved');
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ args: [file] });
  try {
    const { app, page } = second;
    await answerDialogs(app, { open: [[out]], message: [1] });
    await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
    const triggers = page.getByTestId('triggers-panel');
    await expect(triggers).toContainText('intersects');
    await expect(triggers).toContainText('when the learner drops');
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
    const stage = page.locator('.vo-player-stage');
    const dragged = stage.locator('[data-draggable="true"]');
    await expect(dragged).toHaveCount(1);
    const target = stage.locator('[data-object-id]:not([data-draggable="true"])');
    await expect(target).toHaveCount(1);
    const met = () =>
      page.evaluate(() =>
        (
          window as unknown as {
            VEDRAOPUS_PLAYER: { engine: { getVariable(name: string): unknown } };
          }
        ).VEDRAOPUS_PLAYER.engine.getVariable('Met'),
      );
    const from = (await dragged.boundingBox())!;
    const to = (await target.first().boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    // Just touching the target: they intersect, though its middle is not over it yet.
    await page.mouse.move(to.x - from.width / 2 + 10, from.y + from.height / 2, { steps: 10 });
    await expect.poll(met).toBe(true);
    await expect(page.locator('.vo-player-position')).toHaveText('Slide 1 of 2');
    // Let go over the target's middle: on to slide 2.
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator('.vo-player-position')).toHaveText('Slide 2 of 2');
  } finally {
    await browser.close();
  }
});

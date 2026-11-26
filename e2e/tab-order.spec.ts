import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { answerDialogs, launchApp } from './launch';

/**
 * A slide's Tab order (docs/briefs/P10.1-accessibility.md, part B), set in the
 * Slide panel: the author's own order survives a save and a fresh start, and
 * Tab follows it in the published course.
 */

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const items = (page: Page) => page.getByTestId('tab-order').getByTestId('tab-order-item');

async function buttonAt(page: Page, label: string, x: number) {
  await ribbon(page, 'Insert');
  await page.getByRole('button', { name: 'Button', exact: true }).click();
  await page.getByRole('tab', { name: 'Format', exact: true }).click();
  const field = page.getByTestId('format-panel').getByLabel('X', { exact: true });
  await field.fill(String(x));
  await field.press('Enter');
  const name = page.getByTestId('format-panel').getByLabel('Name', { exact: true });
  if (await name.count()) {
    await name.fill(label);
    await name.press('Enter');
  }
}

test('the author’s Tab order is kept and followed in the course', async () => {
  test.setTimeout(150_000);
  const work = mkdtempSync(join(tmpdir(), 'vo-e2e-tab-order-'));
  const file = join(work, 'order.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);

  let saved: string[] | undefined;
  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { save: [file], message: [1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await buttonAt(page, 'Left', 100);
    await buttonAt(page, 'Right', 900);
    // Nothing selected: the Format tab shows the Slide panel.
    await page.getByTestId('stage-canvas').click({ position: { x: 4, y: 4 } });
    await expect(page.getByTestId('project-status')).not.toContainText('selected');
    await page.getByRole('tab', { name: 'Format', exact: true }).click();
    await expect(items(page)).toHaveCount(2);
    const ids = () =>
      items(page).evaluateAll((rows) => rows.map((row) => row.getAttribute('data-tab-object')));
    const [left, right] = await ids();
    // By layout, the left button comes first; in my own order, the right one moves earlier.
    await page.getByLabel('Tab order', { exact: true }).selectOption('own');
    await items(page)
      .nth(1)
      .getByRole('button', { name: /earlier/ })
      .click();
    await expect.poll(ids).toEqual([right, left]);
    saved = [right ?? '', left ?? ''];

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
    await page.getByTestId('slide-list').locator('.slide-item').first().click();
    await page.getByRole('tab', { name: 'Format', exact: true }).click();
    await expect(page.getByLabel('Tab order', { exact: true })).toHaveValue('own');
    const order = await items(page).evaluateAll((rows) =>
      rows.map((row) => row.getAttribute('data-tab-object') ?? ''),
    );
    expect(order).toEqual(saved);
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
    // The skip link goes to the first stop of the author's order; Tab to the second.
    await page.locator('.vo-player').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to slide' })).toBeFocused();
    await page.keyboard.press('Enter');
    const stage = page.locator('.vo-player-stage');
    const buttons = stage.getByRole('button');
    await expect(buttons).toHaveCount(2);
    const focusedX = () =>
      page.evaluate(
        () => (document.activeElement as HTMLElement | null)?.getBoundingClientRect().x ?? -1,
      );
    const firstX = await focusedX();
    await page.keyboard.press('Tab');
    const secondX = await focusedX();
    // The right-hand button was moved first: focus goes right to left.
    expect(firstX).toBeGreaterThan(secondX);
  } finally {
    await browser.close();
  }
});

import { chromium, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { answerDialogs, launchApp } from './launch';

/**
 * Scrolling panels (docs/briefs/P9.5-scrolling-panels.md), made in the app: a
 * shape and a button whose trigger goes on, put in a scrolling panel with a
 * 30-pixel window. It survives a save and a fresh start, and in the published
 * course the button, scrolled into view, still works.
 */

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const chooseMenuItem = (app: ElectronApplication, id: string) =>
  app.evaluate(
    ({ Menu }, itemId) => Menu.getApplicationMenu()!.getMenuItemById(itemId)!.click(),
    id,
  );
const panelFormat = (page: Page) => page.getByTestId('group-format');

test('a scrolling panel made in the app survives saving and scrolls in the published course', async () => {
  test.setTimeout(150_000);
  const work = mkdtempSync(join(tmpdir(), 'vo-e2e-scroll-'));
  const file = join(work, 'scroll.vedraopus');
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
    await page.getByRole('button', { name: 'Text Box', exact: true }).click();
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Button', exact: true }).click();
    // The button goes on to slide 2.
    await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
    await page.getByRole('button', { name: 'New trigger' }).click();
    await page.getByTestId('trigger-wizard').getByRole('button', { name: 'Add trigger' }).click();

    await chooseMenuItem(app, 'edit.selectAll');
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Scrolling Panel', exact: true }).click();
    await page.getByRole('tab', { name: 'Format', exact: true }).click();
    await expect(panelFormat(page).getByLabel('Group scrolls', { exact: true })).toBeChecked();
    const height = panelFormat(page).getByLabel('Scroll window height', { exact: true });
    await height.fill('30');
    await height.press('Enter');

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
    // A fresh start has no slide chosen yet: Select All works on the chosen one.
    await page.getByTestId('slide-list').locator('.slide-item').first().click();
    await chooseMenuItem(app, 'edit.selectAll');
    await page.getByRole('tab', { name: 'Format', exact: true }).click();
    await expect(panelFormat(page).getByLabel('Scroll window height', { exact: true })).toHaveValue(
      '30',
    );
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
    const panel = page.getByRole('region', { name: 'Scrolling Panel', exact: true });
    await expect(panel).toBeVisible();
    const scale = Number(await page.locator('.vo-player-stage').getAttribute('data-scale'));
    expect((await panel.boundingBox())!.height).toBeCloseTo(30 * scale, 0);
    const button = panel.getByText('Button', { exact: true });
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await expect(page.locator('.vo-player-position')).toHaveText('Slide 2 of 2');
  } finally {
    await browser.close();
  }
});

import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { answerDialogs, launchApp } from './launch';

/**
 * Sliders and dials (docs/briefs/P9.4-sliders-dials.md), made in the app: a
 * slider bound to Level (0 to 5) and a dial whose "moves" trigger goes on.
 * They survive a save and a fresh start, and work in the published course.
 */

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const format = (page: Page) => page.getByTestId('control-format');

async function insert(page: Page, kind: 'Slider' | 'Dial') {
  await ribbon(page, 'Insert');
  await page.getByRole('button', { name: 'Data Entry', exact: true }).click();
  await page.getByRole('menuitem', { name: kind, exact: true }).click();
  await page.getByRole('tab', { name: 'Format', exact: true }).click();
}

test('a slider and a dial made in the app survive saving and work in the published course', async () => {
  test.setTimeout(150_000);
  const work = mkdtempSync(join(tmpdir(), 'vo-e2e-sliders-'));
  const file = join(work, 'sliders.vedraopus');
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
    await row.getByLabel('Variable type').selectOption('number');
    await row.getByLabel('Variable name').fill('Level');
    await row.getByLabel('Variable name').press('Enter');
    await variables.getByRole('button', { name: 'Close' }).click();

    await insert(page, 'Slider');
    await format(page)
      .getByLabel('Control variable', { exact: true })
      .selectOption({ label: 'Level' });
    const greatest = format(page).getByLabel('Control greatest value', { exact: true });
    await greatest.fill('5');
    await greatest.press('Enter');

    await insert(page, 'Dial');
    await expect(format(page).getByRole('heading')).toHaveText('Dial');
    await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
    await page.getByRole('button', { name: 'New trigger' }).click();
    const wizard = page.getByTestId('trigger-wizard');
    await wizard.getByLabel('Event', { exact: true }).selectOption('controlMoves');
    await expect(page.getByTestId('trigger-sentence')).toContainText('when Dial moves');
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
    await expect(page.getByTestId('triggers-panel')).toContainText('when Dial moves');
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
    const slider = stage.getByRole('slider', { name: 'Slider', exact: true });
    const dial = stage.getByRole('slider', { name: 'Dial', exact: true });
    // The slider runs 0 to 5, bound to Level.
    await expect(slider).toHaveAttribute('max', '5');
    await slider.focus();
    await page.keyboard.press('End');
    await expect(slider).toHaveValue('5');
    // Turning the dial runs its trigger: on to slide 2.
    await dial.focus();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('.vo-player-position')).toHaveText('Slide 2 of 2');
  } finally {
    await browser.close();
  }
});

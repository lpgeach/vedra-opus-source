import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { answerDialogs, launchApp } from './launch';

/**
 * Stock checkboxes and radio buttons (docs/briefs/P9.3-checkboxes-radios.md),
 * made in the app: a checkbox, and two radio buttons in one group, the first
 * starting checked, with a trigger on the second's Selected state. They survive
 * a save and a fresh start, and work in the published course by mouse and keys.
 */

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const choice = (page: Page) => page.getByTestId('choice-format');

async function insert(page: Page, kind: 'Checkbox' | 'Radio Button') {
  await ribbon(page, 'Insert');
  await page.getByRole('button', { name: 'Data Entry', exact: true }).click();
  await page.getByRole('menuitem', { name: kind, exact: true }).click();
  await page.getByRole('tab', { name: 'Format', exact: true }).click();
}

test('checkboxes and radio buttons made in the app survive saving and work in the published course', async () => {
  test.setTimeout(150_000);
  const work = mkdtempSync(join(tmpdir(), 'vo-e2e-choices-'));
  const file = join(work, 'choices.vedraopus');
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

    await insert(page, 'Checkbox');
    await expect(choice(page).getByRole('heading')).toHaveText('Checkbox');
    await insert(page, 'Radio Button');
    await expect(choice(page).getByLabel('Radio group', { exact: true })).toHaveValue('Group 1');
    await choice(page).getByLabel('Starts checked', { exact: true }).check();
    // With the first selected, the next joins its group.
    await insert(page, 'Radio Button');
    await expect(choice(page).getByLabel('Radio group', { exact: true })).toHaveValue('Group 1');

    // When the second radio button becomes selected, go on to slide 2.
    await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
    await page.getByRole('button', { name: 'New trigger' }).click();
    const wizard = page.getByTestId('trigger-wizard');
    await wizard.getByLabel('Event', { exact: true }).selectOption('stateChange');
    await wizard.getByLabel('Event state', { exact: true }).selectOption({ label: 'Selected' });
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
    await expect(page.getByTestId('triggers-panel')).toContainText('Selected');
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
    const box = page.getByRole('checkbox', { name: 'Checkbox', exact: true });
    const radios = page.getByRole('radio', { name: 'Radio button', exact: true });
    await expect(radios).toHaveCount(2);
    // The first starts checked.
    await expect(radios.nth(0)).toHaveAttribute('aria-checked', 'true');
    await expect(radios.nth(1)).toHaveAttribute('aria-checked', 'false');
    // Inserted objects cascade from the middle, so the radio buttons overlap the checkbox: its
    // top-left corner is clear.
    await box.click({ position: { x: 4, y: 4 } });
    await expect(box).toHaveAttribute('aria-checked', 'true');
    // The arrow key selects the second, whose trigger goes on to slide 2.
    await radios.nth(0).focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.vo-player-position')).toHaveText('Slide 2 of 2');
  } finally {
    await browser.close();
  }
});

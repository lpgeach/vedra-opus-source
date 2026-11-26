import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { answerDialogs, launchApp } from './launch';

/**
 * Data-entry fields (docs/briefs/P9.2-data-entry.md), made in the app: a text
 * entry bound to Name and a numeric entry bound to Age (0 to 120), with a
 * "loses focus" trigger that goes on. They survive a save and a fresh start
 * and work in the published course.
 */

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const variables = (page: Page) => page.getByTestId('variables-dialog');
const format = (page: Page) => page.getByTestId('field-format');

async function addVariable(page: Page, name: string, type: string, value: string) {
  await variables(page).getByRole('button', { name: 'Add variable' }).click();
  const row = variables(page).getByTestId('variable-row').last();
  await row.getByLabel('Variable type').selectOption(type);
  const field = row.getByLabel('Variable name');
  await field.fill(name);
  await field.press('Enter');
  const initial = row.getByLabel('Default value');
  await initial.fill(value);
  await initial.press('Enter');
}

async function insertField(page: Page, kind: 'Text Entry' | 'Numeric Entry') {
  await ribbon(page, 'Insert');
  await page.getByRole('button', { name: 'Data Entry', exact: true }).click();
  await page.getByRole('menuitem', { name: kind, exact: true }).click();
  await page.getByRole('tab', { name: 'Format', exact: true }).click();
}

test('bound fields made in the app survive saving and write their variables in the published course', async () => {
  test.setTimeout(150_000);
  const work = mkdtempSync(join(tmpdir(), 'vo-e2e-fields-'));
  const file = join(work, 'fields.vedraopus');
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
    await addVariable(page, 'Name', 'text', 'Sam');
    await addVariable(page, 'Age', 'number', '30');
    await variables(page).getByRole('button', { name: 'Close' }).click();

    await insertField(page, 'Numeric Entry');
    await format(page).getByLabel('Field variable', { exact: true }).selectOption({ label: 'Age' });
    for (const [label, value] of [
      ['Field least value', '0'],
      ['Field greatest value', '120'],
    ] as const) {
      const limit = format(page).getByLabel(label, { exact: true });
      await limit.fill(value);
      await limit.press('Enter');
    }
    // Only number variables are offered to a numeric field.
    await expect(
      format(page).getByLabel('Field variable', { exact: true }).locator('option'),
    ).toHaveText(['None', 'Age']);

    await insertField(page, 'Text Entry');
    await format(page)
      .getByLabel('Field variable', { exact: true })
      .selectOption({ label: 'Name' });
    // When it loses focus, go on to slide 2.
    await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
    await page.getByRole('button', { name: 'New trigger' }).click();
    const wizard = page.getByTestId('trigger-wizard');
    await wizard.getByLabel('Event', { exact: true }).selectOption('controlLosesFocus');
    await expect(page.getByTestId('trigger-sentence')).toContainText('when Text Entry loses focus');
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
    await expect(page.getByTestId('triggers-panel')).toContainText('when Text Entry loses focus');
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
    const fields = page.locator('.vo-player-stage input');
    await expect(fields).toHaveCount(2);
    const [age, name] = [fields.nth(0), fields.nth(1)];
    // Each shows its variable.
    await expect(age).toHaveValue('30');
    await expect(name).toHaveValue('Sam');
    // Past the greatest: written as 120.
    await age.fill('500');
    await age.press('Enter');
    await expect(age).toHaveValue('120');
    // Leaving the name field runs its trigger: on to slide 2.
    await name.fill('Ali');
    await name.press('Tab');
    await expect(page.locator('.vo-player-position')).toHaveText('Slide 2 of 2');
  } finally {
    await browser.close();
  }
});

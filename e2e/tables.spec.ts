import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { answerDialogs, launchApp } from './launch';

/**
 * Tables (docs/briefs/P9.9-tables.md), made in the app: typed into, a row
 * inserted and a column deleted, a header column and a cell fill; saved and
 * reopened; published, with a variable shown in a cell.
 */

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const table = (page: Page) =>
  page.getByTestId('stage-canvas').locator('[data-object-type="table"]');
const format = (page: Page) => page.getByTestId('table-format');

test('a table made in the app survives saving and shows in the course', async () => {
  test.setTimeout(150_000);
  const work = mkdtempSync(join(tmpdir(), 'vo-e2e-tables-'));
  const file = join(work, 'tables.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { app, page } = first;
    // message: if a step fails, closing with unsaved changes must not wait for an answer.
    await answerDialogs(app, { save: [file], message: [1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();

    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Variables', exact: true }).click();
    const variables = page.getByTestId('variables-dialog');
    await variables.getByRole('button', { name: 'Add variable' }).click();
    const row = variables.getByTestId('variable-row').last();
    await row.getByLabel('Variable type').selectOption('number');
    await row.getByLabel('Variable name').fill('Score');
    await row.getByLabel('Variable name').press('Enter');
    await row.getByLabel('Default value').fill('7');
    await row.getByLabel('Default value').press('Enter');
    await variables.getByRole('button', { name: 'Close' }).click();

    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Table', exact: true }).click();
    await expect(table(page)).toHaveCount(1);
    await page.getByRole('tab', { name: 'Format', exact: true }).click();
    await expect(format(page).getByTestId('table-size')).toContainText('4 rows, 3 columns');

    // Type into the first cell of the second row.
    await table(page).locator('[data-cell="1:0"]').dblclick();
    await expect(page.getByTestId('text-editor')).toBeVisible();
    await page.keyboard.type('Price %Score%');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('text-editor')).toBeHidden();
    await expect(table(page).locator('[data-cell="1:0"]')).toContainText('Price');

    // A row below the first, then the last column goes.
    await format(page).getByRole('button', { name: 'Insert row below' }).click();
    await expect(format(page).getByTestId('table-size')).toContainText('5 rows, 3 columns');
    await format(page).getByLabel('Table column').selectOption({ label: '3' });
    await format(page).getByRole('button', { name: 'Delete column' }).click();
    await expect(format(page).getByTestId('table-size')).toContainText('5 rows, 2 columns');
    // The typed cell moved down with its row.
    await expect(table(page).locator('[data-cell="2:0"]')).toContainText('Price');

    await format(page).getByLabel('Header column').check();
    await format(page).getByLabel('Table row').selectOption({ label: '4' });
    await format(page).getByLabel('Table column').selectOption({ label: '2' });
    await format(page).getByLabel('Cell has its own fill').check();
    await format(page).getByLabel('Cell fill source').selectOption('literal');
    await format(page).getByLabel('Cell fill colour').fill('#30a46c');
    await expect(table(page).locator('[data-cell="3:1"]')).toHaveCSS(
      'background-color',
      'rgb(48, 164, 108)',
    );

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
    await expect(table(page).locator('tr')).toHaveCount(5);
    await expect(table(page).locator('[data-cell="2:0"]')).toContainText('Price');
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
    const grid = page.locator('.vo-player-stage').getByRole('table');
    await expect(grid).toBeVisible();
    await expect(grid.getByRole('row')).toHaveCount(5);
    // The header row's two cells, and the header column's four below it.
    await expect(grid.getByRole('columnheader')).toHaveCount(2);
    await expect(grid.getByRole('rowheader')).toHaveCount(4);
    // The variable shows its value.
    await expect(grid.getByRole('rowheader').filter({ hasText: 'Price' })).toHaveText('Price 7');
  } finally {
    await browser.close();
  }
});

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { answerDialogs, launchApp } from './launch';

/**
 * The drag-and-drop and retry options (docs/briefs/B11-drag-and-retry-options.md):
 * set in Form View and the result form, saved, and there again when reopened.
 */

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const slideItem = (page: Page, n: number) =>
  page
    .getByTestId('slide-list')
    .getByRole('button')
    .nth(n - 1);
const onePerTarget = (page: Page) =>
  page
    .getByTestId('question-form')
    .getByLabel('One item on each target: the one already there goes back', { exact: true });
const afterSubmit = (page: Page) =>
  page
    .getByTestId('question-form')
    .getByLabel('Show Drop Correct and Drop Incorrect only after Submit', { exact: true });
const retryWrong = (page: Page) =>
  page
    .getByTestId('result-form')
    .getByLabel('Retry only the questions answered wrongly; the rest keep their answers', {
      exact: true,
    });

test('one item per target, drop states after Submit and retrying wrong answers: set and kept', async () => {
  test.setTimeout(120_000);
  const file = join(mkdtempSync(join(tmpdir(), 'vedraopus-e2e-b11-')), 'options.vedraopus');

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { save: [file], message: [1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Convert Slide', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Drag and Drop', exact: true }).click();
    await expect(onePerTarget(page)).not.toBeChecked();
    await onePerTarget(page).check();
    await afterSubmit(page).check();
    await expect(onePerTarget(page)).toBeChecked();
    await expect(afterSubmit(page)).toBeChecked();

    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Question', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Result Slide', exact: true }).click();
    await expect(retryWrong(page)).not.toBeChecked();
    await retryWrong(page).check();
    await expect(retryWrong(page)).toBeChecked();

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('project-status')).toContainText('Saved');
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ args: [file] });
  try {
    const { page } = second;
    await slideItem(page, 1).click();
    await expect(onePerTarget(page)).toBeChecked();
    await expect(afterSubmit(page)).toBeChecked();
    await slideItem(page, 2).click();
    await expect(retryWrong(page)).toBeChecked();
  } finally {
    await second.app.close();
  }
});

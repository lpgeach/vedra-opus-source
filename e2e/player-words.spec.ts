import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { answerDialogs, launchApp } from './launch';

/**
 * The player's words for each language (docs/briefs/P10.3-translation.md,
 * part C): the Player dialog shows and edits the words kept for any language,
 * without changing the course's own, and they are saved with the project.
 */

const DONT_SAVE = 1;
const playerDialog = (page: Page) => page.getByTestId('player-dialog');
const words = (page: Page) => playerDialog(page).getByTestId('player-words');

async function openWords(page: Page) {
  await page.getByTestId('ribbon').getByRole('tab', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Player…', exact: true }).click();
  await expect(playerDialog(page)).toBeVisible();
  await words(page)
    .getByText(/^Every word/)
    .click();
}

async function setLanguage(page: Page, tag: string) {
  const field = words(page).getByLabel('Course language', { exact: true });
  await field.fill(tag);
  await field.press('Enter');
}

test('the words for another language are kept, shown and edited without changing the course’s language', async () => {
  test.setTimeout(150_000);
  const file = join(mkdtempSync(join(tmpdir(), 'vo-e2e-words-')), 'words.vedraopus');
  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { save: [file], message: [DONT_SAVE] });
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await openWords(page);
    // One language only: no chooser.
    await expect(words(page).getByLabel('Words for', { exact: true })).toHaveCount(0);

    // French words, then the course becomes Arabic: the French are kept.
    await setLanguage(page, 'fr');
    const next = words(page).getByLabel('Word for Next', { exact: true });
    await next.fill('Suivant');
    await next.press('Enter');
    await setLanguage(page, 'ar');
    await expect(next).toHaveValue('');
    const chooser = words(page).getByLabel('Words for', { exact: true });
    await expect(chooser.locator('option')).toHaveText(['ar (the course’s)', 'fr']);

    // The French words, seen and changed while the course stays Arabic.
    await chooser.selectOption('fr');
    await expect(next).toHaveValue('Suivant');
    await next.fill('Suivant !');
    await next.press('Enter');
    await expect(words(page).getByLabel('Course language', { exact: true })).toHaveValue('ar');

    await playerDialog(page).getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByTestId('ribbon').getByRole('tab', { name: 'Home', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('project-status')).toContainText('Saved');
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ args: [file] });
  try {
    const { app, page } = second;
    await answerDialogs(app, { message: [DONT_SAVE] });
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await openWords(page);
    await expect(words(page).getByLabel('Course language', { exact: true })).toHaveValue('ar');
    await words(page).getByLabel('Words for', { exact: true }).selectOption('fr');
    await expect(words(page).getByLabel('Word for Next', { exact: true })).toHaveValue('Suivant !');
  } finally {
    await second.app.close();
  }
});

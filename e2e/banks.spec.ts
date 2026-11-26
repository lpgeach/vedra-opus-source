import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { submitAnswer } from './course';
import { answerDialogs, launchApp } from './launch';

/** Question banks and draws, through the editor (docs/briefs/P7.6-banks-and-draws.md). */

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const insertQuestion = async (page: Page, kind: string) => {
  await ribbon(page, 'Insert');
  await page.getByRole('button', { name: 'Question', exact: true }).click();
  await page.getByRole('menuitem', { name: kind, exact: true }).click();
};
const bank = (page: Page) => page.getByTestId('bank');
const drawForm = (page: Page) => page.getByTestId('draw-form');

test('a bank of three, a draw of two with one locked: kept, published and played', async () => {
  test.setTimeout(150_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-banks-'));
  const file = join(work, 'banks.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { save: [file], message: [1, 1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();

    // A bank: it starts with a multiple-choice question; two more are inserted into it.
    await page.getByRole('button', { name: 'New Question Bank', exact: true }).click();
    await expect(bank(page)).toHaveCount(1);
    await expect(page.getByTestId('question-form')).toBeVisible();
    await insertQuestion(page, 'True or False');
    await insertQuestion(page, 'Fill in the Blank');
    await expect(bank(page).locator('.slide-item')).toHaveCount(3);
    await expect(bank(page)).toContainText('Fill in the Blank');
    // Renamed.
    const name = page.getByLabel('Name of Question Bank 1', { exact: true });
    await name.fill('Chapter 1');
    await name.press('Enter');
    await expect(page.getByLabel('Name of Chapter 1', { exact: true })).toBeVisible();

    // The first scene slide, then a draw after it: two, in order, Fill in the Blank locked.
    await page.getByTestId('slide-list').locator('.slide-item').first().click();
    await insertQuestion(page, 'Draw from Question Bank');
    await expect(drawForm(page)).toBeVisible();
    await expect(drawForm(page).getByLabel('Question bank', { exact: true })).toHaveValue(/scene_/);
    await drawForm(page).getByLabel('Draw order', { exact: true }).selectOption('inOrder');
    await drawForm(page).getByLabel('Lock “Fill in the Blank”', { exact: true }).check();
    await expect(page.getByTestId('slide-draw-mark')).toHaveCount(1);
    // Slide View says what it stands for.
    await page.getByRole('button', { name: 'Slide', exact: true }).click();
    await expect(page.getByTestId('draw-note')).toContainText(
      'replaced by 2 questions drawn in order from “Chapter 1”',
    );

    await ribbon(page, 'Home');
    await page.getByRole('button', { name: 'New Slide' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('project-status')).toContainText('Saved');
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ args: [file] });
  try {
    const { app, page } = second;
    await answerDialogs(app, { open: [[out]], message: [1, 1] });
    await expect(bank(page).locator('.slide-item')).toHaveCount(3);
    await page.getByTestId('slide-list').locator('.slide-item').nth(1).click();
    await expect(drawForm(page).getByLabel('Draw order', { exact: true })).toHaveValue('inOrder');
    await expect(
      drawForm(page).getByLabel('Lock “Fill in the Blank”', { exact: true }),
    ).toBeChecked();
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const dialog = page.getByTestId('publish-dialog');
    await dialog.getByRole('button', { name: 'Choose folder…' }).click();
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-result')).toBeVisible();
  } finally {
    await second.app.close();
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await page.goto(pathToFileURL(join(out, 'untitled-project', 'index.html')).href);
    const position = page.locator('.vo-player-position');
    // Intro, two drawn questions, End.
    await expect(position).toHaveText('Slide 1 of 4');
    await page.getByRole('button', { name: 'Next' }).click();
    // In the bank's order with Fill in the Blank locked: the multiple choice first.
    await expect(position).toHaveText('Slide 2 of 4');
    await page.getByText('First answer', { exact: true }).click();
    await submitAnswer(page);
    await expect(position).toHaveText('Slide 3 of 4');
    // Then the locked fill in the blank.
    await page.locator('input.vo-entry').filter({ visible: true }).fill('answer');
    await submitAnswer(page);
    await expect(position).toHaveText('Slide 4 of 4');
  } finally {
    await browser.close();
  }
});

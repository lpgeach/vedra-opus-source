import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { submitAnswer } from './course';
import { answerDialogs, launchApp } from './launch';

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const form = (page: Page) => page.getByTestId('question-form');
const slideItem = (page: Page, n: number) =>
  page
    .getByTestId('slide-list')
    .getByRole('button')
    .nth(n - 1);
/** Type into a field of the form and leave it, which keeps what was typed. */
async function type(page: Page, label: string, text: string) {
  const field = form(page).getByLabel(label, { exact: true });
  await field.fill(text);
  await field.blur();
}

test('a multiple-choice question: made in Form View, seen in Slide View, kept, and answered in the course', async () => {
  test.setTimeout(120_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-quiz-'));
  const file = join(work, 'quiz.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { save: [file], message: [1, 1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();

    // Slide 2 is the question; slide 3 follows it.
    await ribbon(page, 'Slides');
    await page.getByRole('button', { name: 'Question', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Multiple Choice', exact: true }).click();
    await expect(form(page)).toBeVisible();
    await expect(page.getByTestId('slide-question-mark')).toHaveCount(1);
    await type(page, 'Question text', 'What is the capital of France?');
    await type(page, 'Choice 1 text', 'Paris');
    await type(page, 'Choice 2 text', 'Rome');
    await type(page, 'Choice 3 text', 'Madrid');

    // One right answer: marking another moves it, and back.
    await form(page).getByLabel('Choice 2 is correct', { exact: true }).check();
    await expect(form(page).getByLabel('Choice 1 is correct', { exact: true })).not.toBeChecked();
    await form(page).getByLabel('Choice 1 is correct', { exact: true }).check();
    await expect(page.getByTestId('question-warning')).toHaveCount(0);

    // A fourth answer, deleted, and the delete undone.
    await form(page).getByRole('button', { name: 'Add choice' }).click();
    await expect(page.getByTestId('question-choice')).toHaveCount(4);
    await type(page, 'Choice 4 text', 'Berlin');
    await form(page).getByRole('button', { name: 'Delete choice 4' }).click();
    await expect(page.getByTestId('question-choice')).toHaveCount(3);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId('question-choice')).toHaveCount(4);
    await expect(form(page).getByLabel('Choice 4 text', { exact: true })).toHaveValue('Berlin');

    await form(page).getByLabel('Attempts allowed', { exact: true }).selectOption('2');
    // Wrong twice: back to the first slide.
    await form(page)
      .getByLabel('After an incorrect answer', { exact: true })
      .selectOption({ index: 1 });

    // Slide View: the form's words are the slide's objects.
    await page.getByRole('button', { name: 'Slide', exact: true }).click();
    const canvas = page.getByTestId('stage-canvas');
    await expect(canvas).toContainText('What is the capital of France?');
    await expect(canvas).toContainText('Paris');
    await expect(canvas.locator('[data-object-type="choice"]')).toHaveCount(4);
    await page.getByRole('button', { name: 'Form', exact: true }).click();

    await page.getByRole('button', { name: 'New Slide' }).click();
    await expect(page.getByTestId('project-status')).toContainText('Slide 3 of 3');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('project-status')).toContainText('Saved');
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ args: [file] });
  try {
    const { app, page } = second;
    await answerDialogs(app, { open: [[out]], message: [1, 1] });
    await slideItem(page, 2).click();
    await expect(form(page)).toBeVisible();
    await expect(form(page).getByLabel('Question text', { exact: true })).toHaveValue(
      'What is the capital of France?',
    );
    await expect(form(page).getByLabel('Choice 1 is correct', { exact: true })).toBeChecked();
    await expect(form(page).getByLabel('Attempts allowed', { exact: true })).toHaveValue('2');
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const dialog = page.getByTestId('publish-dialog');
    await dialog.getByRole('button', { name: 'Choose folder…' }).click();
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-result')).toBeVisible();
  } finally {
    await second.app.close();
  }

  // In the course: Next waits for the answer; a wrong try, then the right one.
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await page.goto(pathToFileURL(join(out, 'untitled-project', 'index.html')).href);
    const position = page.locator('.vo-player-position');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(position).toHaveText('Slide 2 of 3');
    await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
    await page.getByText('Rome', { exact: true }).click();
    await submitAnswer(page);
    await expect(position).toHaveText('Slide 2 of 3');
    await page.getByText('Paris', { exact: true }).click();
    await submitAnswer(page);
    await expect(position).toHaveText('Slide 3 of 3');
  } finally {
    await browser.close();
  }
});

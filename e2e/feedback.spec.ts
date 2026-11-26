import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { answerDialogs, launchApp } from './launch';

/** Feedback masters and feedback layers, through the editor (docs/briefs/P7.5-feedback.md). */

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const form = (page: Page) => page.getByTestId('question-form');
const objects = (page: Page) =>
  page.getByTestId('stage-canvas').locator('.stage-slide > [data-object-id]');
async function type(page: Page, label: string, text: string) {
  const field = form(page).getByLabel(label, { exact: true });
  await field.fill(text);
  await field.blur();
}
const slideItem = (page: Page, n: number) =>
  page
    .getByTestId('slide-list')
    .getByRole('button')
    .nth(n - 1);

test('the feedback master’s layouts make a question’s layers; Form View edits and remakes them; the course shows them', async () => {
  test.setTimeout(150_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-feedback-'));
  const file = join(work, 'feedback.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { save: [file], message: [1, 1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    // No slide master yet: the layout picker has nothing to offer, the feedback master included.
    await expect(page.getByLabel('Slide layout')).toBeDisabled();

    // Master View lists the feedback master and its four layouts; they cannot be added to or deleted.
    await page.getByRole('button', { name: 'Master View', exact: true }).click();
    const list = page.getByTestId('master-list');
    for (const name of ['Feedback', 'Correct', 'Incorrect', 'Try Again', 'Thank You']) {
      await expect(list.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await list.getByRole('button', { name: 'Correct', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Add layout', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
    // The Correct layout gets a rectangle: new questions' Correct layers will have it.
    await expect(objects(page)).toHaveCount(4);
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Shape', exact: true }).click();
    await page
      .getByTestId('shape-gallery')
      .getByRole('button', { name: 'Rectangle', exact: true })
      .click();
    await expect(objects(page)).toHaveCount(5);
    await page.getByRole('button', { name: 'Slide View', exact: true }).click();

    // A multiple-choice question: its layers' words in Form View.
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Question', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Multiple Choice', exact: true }).click();
    await expect(form(page).getByLabel('Correct feedback', { exact: true })).toHaveValue(
      'That’s right.',
    );
    await type(page, 'Correct feedback', 'Well done!');
    // Two tries: a Try Again layer is made on request.
    await expect(form(page).getByLabel('Try Again feedback', { exact: true })).toHaveCount(0);
    await form(page).getByLabel('Attempts allowed', { exact: true }).selectOption('2');
    await form(page).getByRole('button', { name: 'Make the Try Again layer', exact: true }).click();
    await expect(form(page).getByLabel('Try Again feedback', { exact: true })).toHaveValue(
      'That’s not right. Try again.',
    );
    // The Incorrect layer deleted on the slide, then made again from Form View.
    await page.getByRole('button', { name: 'Slide', exact: true }).click();
    await page.getByRole('tab', { name: 'Layers', exact: true }).click();
    await page.getByRole('button', { name: 'Delete Incorrect', exact: true }).click();
    await page.getByRole('button', { name: 'Form', exact: true }).click();
    await form(page).getByRole('button', { name: 'Make the Incorrect layer', exact: true }).click();
    await expect(form(page).getByLabel('Incorrect feedback', { exact: true })).toBeVisible();

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
    await slideItem(page, 2).click();
    await expect(form(page).getByLabel('Correct feedback', { exact: true })).toHaveValue(
      'Well done!',
    );
    // Kept: three layers; the Correct one has the master's rectangle with its four parts.
    await page.getByRole('button', { name: 'Slide', exact: true }).click();
    await page.getByRole('tab', { name: 'Layers', exact: true }).click();
    // Names by their own Delete buttons: "Correct" is also in "Incorrect".
    const rowOf = (name: string) =>
      page.getByTestId('layer-row').filter({
        has: page.getByRole('button', { name: `Delete ${name}`, exact: true }),
      });
    for (const name of ['Correct', 'Incorrect', 'Try Again']) {
      await expect(rowOf(name)).toHaveCount(1);
    }
    await rowOf('Correct').getByText('Correct', { exact: true }).click();
    await expect(objects(page)).toHaveCount(5);
    await expect(page.getByTestId('stage-canvas')).toContainText('Well done!');
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
    const shown = (text: string) => page.getByText(text, { exact: true }).filter({ visible: true });
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(position).toHaveText('Slide 2 of 3');
    // Wrong: Try Again, which closes.
    await page.getByText('Second answer', { exact: true }).click();
    await page.getByText('Submit', { exact: true }).click();
    await expect(shown('Not quite')).toBeVisible();
    // By its role: the player's announcer may be saying the same words.
    await page.getByRole('button', { name: 'Try Again', exact: true }).click();
    await expect(shown('Not quite')).toHaveCount(0);
    // Right: the Correct layer with the author's words; Continue moves on.
    await page.getByText('First answer', { exact: true }).click();
    await page.getByText('Submit', { exact: true }).click();
    await expect(shown('Well done!')).toBeVisible();
    await expect(position).toHaveText('Slide 2 of 3');
    await shown('Continue').click();
    await expect(position).toHaveText('Slide 3 of 3');
  } finally {
    await browser.close();
  }
});

test('review: a button made a Review the quiz trigger in the wizard, published, shows the answers', async () => {
  test.setTimeout(150_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-review-'));
  const out = join(work, 'out');
  mkdirSync(out);

  const app = await launchApp();
  try {
    const { page } = app;
    await answerDialogs(app.app, { open: [[out]], message: [1, 1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Question', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Multiple Choice', exact: true }).click();
    await expect(form(page)).toBeVisible();

    // Slide 3: the results, with a button that reviews the quiz.
    await ribbon(page, 'Home');
    await page.getByRole('button', { name: 'New Slide' }).click();
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Button', exact: true }).click();
    await page
      .getByTestId('timeline-row')
      .filter({ hasText: 'Button' })
      .locator('.timeline-name')
      .click();
    await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
    await page.getByRole('button', { name: 'New trigger' }).click();
    const wizard = page.getByTestId('trigger-wizard');
    await wizard.getByLabel('Action', { exact: true }).selectOption('reviewQuiz');
    await expect(page.getByTestId('trigger-sentence')).toHaveText(
      'Review the quiz when the learner clicks Button',
    );
    await wizard.getByRole('button', { name: 'Add trigger' }).click();

    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const dialog = page.getByTestId('publish-dialog');
    await dialog.getByRole('button', { name: 'Choose folder…' }).click();
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-result')).toBeVisible();
  } finally {
    await app.app.close();
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await page.goto(pathToFileURL(join(out, 'untitled-project', 'index.html')).href);
    const position = page.locator('.vo-player-position');
    const shown = (text: string) => page.getByText(text, { exact: true }).filter({ visible: true });
    await page.getByRole('button', { name: 'Next' }).click();
    // Wrong: the Incorrect layer, then on to the results.
    await page.getByText('Second answer', { exact: true }).click();
    await page.getByText('Submit', { exact: true }).click();
    await shown('Continue').click();
    await expect(position).toHaveText('Slide 3 of 3');
    await shown('Button').click();
    // Review: back on the question, its result said, the right and wrong answers marked.
    await expect(position).toHaveText('Slide 2 of 3');
    await expect(page.locator('.vo-review-banner')).toHaveText(
      'Review: you answered this incorrectly',
    );
    const choice = (words: string) =>
      page.locator('[data-object-type="choice"]').filter({ hasText: words });
    await expect(choice('First answer')).toHaveAttribute('data-review', 'right');
    await expect(choice('Second answer')).toHaveAttribute('data-review', 'chosen');
    // No feedback layer while reviewing.
    await expect(shown('Continue')).toHaveCount(0);
  } finally {
    await browser.close();
  }
});

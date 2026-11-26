import { chromium, expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { submitAnswer } from './course';
import { answerDialogs, launchApp } from './launch';

/** Survey questions, authored through the editor (docs/briefs/P7.3-survey-types.md). */

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const form = (page: Page) => page.getByTestId('question-form');
const insertSurvey = async (page: Page, kind: string) => {
  await ribbon(page, 'Insert');
  await page.getByRole('button', { name: 'Survey', exact: true }).click();
  await page.getByRole('menuitem', { name: kind, exact: true }).click();
  await expect(form(page)).toBeVisible();
};
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

test('pick one and essay: set up in Form View, kept, and answered in the course', async () => {
  test.setTimeout(120_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-survey-'));
  const file = join(work, 'survey.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { save: [file], message: [1, 1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();

    // Slide 2: pick one, four answers, a thank-you, and on to the essay by name.
    await insertSurvey(page, 'Pick One');
    await expect(form(page).getByLabel('Question type', { exact: true })).toHaveValue('pickOne');
    // A survey has no score or attempts, and no right answer to tick.
    await expect(form(page).getByRole('group', { name: 'Score', exact: true })).toHaveCount(0);
    await expect(form(page).getByLabel('Attempts allowed', { exact: true })).toHaveCount(0);
    await expect(form(page).getByLabel('Choice 1 is correct', { exact: true })).toHaveCount(0);
    await type(page, 'Question text', 'How often do you back up your work?');
    await type(page, 'Choice 1 text', 'Daily');
    await type(page, 'Choice 2 text', 'Weekly');
    await type(page, 'Choice 3 text', 'Monthly');
    await form(page).getByRole('button', { name: 'Add choice', exact: true }).click();
    await type(page, 'Choice 4 text', 'Never');
    await type(page, 'Thank You feedback', 'Thanks for telling us.');

    // Slide 3: an essay; the slide shows a tall box.
    await insertSurvey(page, 'Essay');
    await expect(page.getByTestId('question-kind')).toHaveText('Essay (survey)');
    await expect(page.getByTestId('question-any-answer')).toBeVisible();
    await type(page, 'Question text', 'What would make backing up easier?');

    // Back to the first: after answering, go to the essay.
    await slideItem(page, 2).click();
    await form(page)
      .getByLabel('After answering', { exact: true })
      .selectOption({ label: 'Go to “Essay”' });

    await ribbon(page, 'Home');
    await slideItem(page, 3).click();
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
    await expect(form(page).getByLabel('Choice 4 text', { exact: true })).toHaveValue('Never');
    await expect(form(page).getByLabel('Thank You feedback', { exact: true })).toHaveValue(
      'Thanks for telling us.',
    );
    await expect(
      form(page).getByLabel('After answering', { exact: true }).locator('option:checked'),
    ).toHaveText('Go to “Essay”');
    await slideItem(page, 3).click();
    await page.getByRole('button', { name: 'Slide', exact: true }).click();
    await expect(
      page.getByTestId('stage-canvas').locator('[data-object-type="textEntry"]'),
    ).toHaveCount(1);
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
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(position).toHaveText('Slide 2 of 4');
    // Nothing picked: no answer yet.
    await submitAnswer(page);
    await expect(position).toHaveText('Slide 2 of 4');
    await page.getByText('Never', { exact: true }).click();
    await submitAnswer(page);
    await expect(position).toHaveText('Slide 3 of 4');
    await page.locator('textarea.vo-entry').fill('Do it for me.\nAt night.');
    await submitAnswer(page);
    await expect(position).toHaveText('Slide 4 of 4');
  } finally {
    await browser.close();
  }
});

/** The middle of an element on the screen, in CSS pixels. */
async function middle(element: Locator) {
  const box = (await element.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Carry one element onto another with real pointer moves, as a learner would. */
async function drag(page: Page, from: Locator, to: Locator) {
  const start = await middle(from);
  const end = await middle(to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}

test('which word and ranking: set up in Form View, kept, and answered by dragging', async () => {
  test.setTimeout(120_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-survey-drag-'));
  const file = join(work, 'survey-drag.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { save: [file], message: [1, 1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();

    // Slide 2: which word, with a fourth word added; nothing to mark right.
    await insertSurvey(page, 'Which Word');
    await expect(page.getByTestId('question-kind')).toHaveText('Which word (survey)');
    await expect(form(page).getByLabel('Word 1 is correct', { exact: true })).toHaveCount(0);
    await type(page, 'Question text', 'I would rather drink ___ in the morning.');
    await type(page, 'Word 1 text', 'Coffee');
    await type(page, 'Word 2 text', 'Tea');
    await type(page, 'Word 3 text', 'Water');
    await form(page).getByRole('button', { name: 'Add word', exact: true }).click();
    await type(page, 'Word 4 text', 'Juice');
    await expect(page.getByTestId('question-word')).toHaveCount(4);

    // Slide 3: ranking, with the third item moved up to second.
    await insertSurvey(page, 'Ranking');
    await type(page, 'Question text', 'Rank these, most important first.');
    await type(page, 'Item 1 text', 'Price');
    await type(page, 'Item 2 text', 'Speed');
    await type(page, 'Item 3 text', 'Support');
    await form(page).getByRole('button', { name: 'Move item 3 up', exact: true }).click();
    await expect(form(page).getByLabel('Item 2 text', { exact: true })).toHaveValue('Support');

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
    await expect(form(page).getByLabel('Word 4 text', { exact: true })).toHaveValue('Juice');
    await slideItem(page, 3).click();
    await expect(form(page).getByLabel('Item 2 text', { exact: true })).toHaveValue('Support');
    await expect(form(page).getByLabel('Item 3 text', { exact: true })).toHaveValue('Speed');
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
    const tile = (words: string) =>
      page.locator('[data-draggable="true"]').filter({ hasText: words });
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(position).toHaveText('Slide 2 of 4');
    // Nothing in the blank: no answer yet. Then any word will do.
    await submitAnswer(page);
    await expect(position).toHaveText('Slide 2 of 4');
    const blank = page
      .locator('[data-object-type="shape"]:not([data-draggable="true"])')
      // What the learner sees: not the hidden feedback layers' panels (P7.5).
      .filter({ visible: true });
    await expect(blank).toHaveCount(1);
    await drag(page, tile('Tea'), blank);
    await submitAnswer(page);
    await expect(position).toHaveText('Slide 3 of 4');

    // Ranking starts in the author's order: Price, Support, Speed. Speed onto Price swaps them.
    const y = async (words: string) => (await middle(tile(words))).y;
    expect(await y('Price')).toBeLessThan(await y('Support'));
    expect(await y('Support')).toBeLessThan(await y('Speed'));
    await drag(page, tile('Speed'), tile('Price'));
    expect(await y('Speed')).toBeLessThan(await y('Support'));
    expect(await y('Support')).toBeLessThan(await y('Price'));
    await submitAnswer(page);
    await expect(position).toHaveText('Slide 4 of 4');
  } finally {
    await browser.close();
  }
});

test('Likert: scale and statements set up in Form View, kept, and rated in the course', async () => {
  test.setTimeout(120_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-likert-'));
  const file = join(work, 'likert.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { save: [file], message: [1, 1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();

    await insertSurvey(page, 'Likert');
    await expect(page.getByTestId('question-kind')).toHaveText('Likert (survey)');
    await type(page, 'Question text', 'How did the course feel?');
    await expect(page.getByTestId('question-scale-point')).toHaveCount(5);
    await expect(page.getByTestId('question-statement')).toHaveCount(3);
    // Four points instead of five, the middle one renamed; a fourth statement.
    await form(page).getByRole('button', { name: 'Delete scale point 3', exact: true }).click();
    await expect(page.getByTestId('question-scale-point')).toHaveCount(4);
    await type(page, 'Scale point 2 text', 'Somewhat disagree');
    await type(page, 'Statement 1 text', 'It was clear.');
    // A point added and taken away again; two statements added, the last deleted.
    await form(page).getByRole('button', { name: 'Add scale point', exact: true }).click();
    await expect(page.getByTestId('question-scale-point')).toHaveCount(5);
    await expect(form(page).getByLabel('Scale point 5 text', { exact: true })).toHaveValue(
      'New point',
    );
    await form(page).getByRole('button', { name: 'Delete scale point 5', exact: true }).click();
    await expect(page.getByTestId('question-scale-point')).toHaveCount(4);
    await form(page).getByRole('button', { name: 'Add statement', exact: true }).click();
    await form(page).getByRole('button', { name: 'Add statement', exact: true }).click();
    await expect(page.getByTestId('question-statement')).toHaveCount(5);
    await form(page).getByRole('button', { name: 'Delete statement 5', exact: true }).click();
    await expect(page.getByTestId('question-statement')).toHaveCount(4);
    await type(page, 'Statement 4 text', 'It was quick.');
    // The slide's grid follows: four rows of four points.
    await page.getByRole('button', { name: 'Slide', exact: true }).click();
    await expect(
      page.getByTestId('stage-canvas').locator('[data-object-type="choice"]'),
    ).toHaveCount(16);
    await expect(page.getByTestId('stage-canvas')).toContainText('Somewhat disagree');
    await expect(page.getByTestId('stage-canvas')).not.toContainText('Neither agree nor disagree');

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
    await expect(page.getByTestId('question-scale-point')).toHaveCount(4);
    await expect(form(page).getByLabel('Scale point 2 text', { exact: true })).toHaveValue(
      'Somewhat disagree',
    );
    await expect(form(page).getByLabel('Statement 4 text', { exact: true })).toHaveValue(
      'It was quick.',
    );
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
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(position).toHaveText('Slide 2 of 3');
    // The points, row by row (four to a row): rate the first three rows only.
    const point = (row: number, column: number) =>
      page.locator('[data-object-type="choice"]').nth(row * 4 + column);
    await expect(page.locator('[data-object-type="choice"]')).toHaveCount(16);
    await point(0, 3).click();
    await point(1, 0).click();
    await point(2, 2).click();
    await submitAnswer(page);
    await expect(position).toHaveText('Slide 2 of 3');
    await point(3, 1).click();
    await submitAnswer(page);
    await expect(position).toHaveText('Slide 3 of 3');
  } finally {
    await browser.close();
  }
});

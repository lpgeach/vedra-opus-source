import { chromium, expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { submitAnswer } from './course';
import { answerDialogs, launchApp } from './launch';

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const form = (page: Page) => page.getByTestId('question-form');
const insertQuestion = async (page: Page, kind: string) => {
  await ribbon(page, 'Insert');
  await page.getByRole('button', { name: 'Question', exact: true }).click();
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

test('fill in the blank and matching: set up in Form View, kept, and answered in the course', async () => {
  test.setTimeout(120_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-graded-'));
  const file = join(work, 'graded.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { save: [file], message: [1, 1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();

    // Slide 2: fill in the blank, with two right answers.
    await insertQuestion(page, 'Fill in the Blank');
    await expect(page.getByTestId('question-kind')).toHaveText('Fill in the blank');
    await type(page, 'Question text', 'What is the capital of France?');
    await type(page, 'Answer 1', 'Paris');
    await form(page).getByRole('button', { name: 'Add answer' }).click();
    await type(page, 'Answer 2', 'Paris, France');
    await expect(page.getByTestId('question-answer')).toHaveCount(2);

    // Slide 3: matching, three countries to their capitals.
    await insertQuestion(page, 'Matching (Dropdowns)');
    await type(page, 'Question text', 'Match each country to its capital.');
    const capitals: [string, string][] = [
      ['France', 'Paris'],
      ['Italy', 'Rome'],
      ['Spain', 'Madrid'],
    ];
    for (const [index, [country, capital]] of capitals.entries()) {
      await type(page, `Item ${index + 1} text`, country);
      await type(page, `Item ${index + 1} match`, capital);
    }
    // Slide View shows the items and the dropdowns.
    await page.getByRole('button', { name: 'Slide', exact: true }).click();
    await expect(page.getByTestId('stage-canvas')).toContainText('Italy');
    await expect(
      page.getByTestId('stage-canvas').locator('[data-object-type="dropdown"]'),
    ).toHaveCount(3);
    await page.getByRole('button', { name: 'Form', exact: true }).click();

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
    await expect(form(page).getByLabel('Answer 2', { exact: true })).toHaveValue('Paris, France');
    await slideItem(page, 3).click();
    await expect(form(page).getByLabel('Item 2 match', { exact: true })).toHaveValue('Rome');
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
    await page.locator('input.vo-entry').fill('  paris ');
    await submitAnswer(page);
    await expect(position).toHaveText('Slide 3 of 4');
    for (const [index, capital] of ['Paris', 'Rome', 'Madrid'].entries()) {
      await page.getByLabel(`Match ${index + 1}`, { exact: true }).selectOption(capital);
    }
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

/** Carry one element to a screen point with real pointer moves, as a learner would. */
async function dragToPoint(page: Page, from: Locator, end: { x: number; y: number }) {
  const start = await middle(from);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}

/** Carry one element onto another with real pointer moves, as a learner would. */
async function drag(page: Page, from: Locator, to: Locator) {
  await dragToPoint(page, from, await middle(to));
}

test('drag question types: set up in Form View, kept, and answered in the course', async () => {
  test.setTimeout(180_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-drag-'));
  const file = join(work, 'drag.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { save: [file], message: [1, 1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();

    // Slide 2: a word bank, with one right word and a third added in the form.
    await insertQuestion(page, 'Word Bank');
    await expect(page.getByTestId('question-kind')).toHaveText('Word bank');
    await type(page, 'Question text', 'Which word is right?');
    await type(page, 'Word 1 text', 'Paris');
    await type(page, 'Word 2 text', 'Rome');
    await form(page).getByLabel('Word 1 is correct', { exact: true }).check();
    await form(page).getByRole('button', { name: 'Add word' }).click();
    await type(page, 'Word 4 text', 'London');
    await expect(page.getByTestId('question-word')).toHaveCount(4);

    // Slide 3: a drag matching question; the target words are the matches.
    await insertQuestion(page, 'Matching (Drag and Drop)');
    await expect(page.getByTestId('question-kind')).toHaveText('Matching (drag and drop)');
    await type(page, 'Question text', 'Match each country to its capital.');
    await type(page, 'Item 1 text', 'France');
    await type(page, 'Target 1 text', 'Paris');
    await type(page, 'Item 2 text', 'Italy');
    await type(page, 'Target 2 text', 'Rome');
    await type(page, 'Item 3 text', 'Spain');
    await type(page, 'Target 3 text', 'Madrid');
    await expect(page.getByTestId('question-pair')).toHaveCount(3);

    // Slide 4: a drag sequence; moving a step swaps the tiles as well as the order.
    await insertQuestion(page, 'Sequence (Drag and Drop)');
    await expect(page.getByTestId('question-kind')).toHaveText('Sequence (drag and drop)');
    await type(page, 'Question text', 'Put the steps in order.');
    await type(page, 'Step 1 text', 'First');
    await type(page, 'Step 2 text', 'Second');
    await form(page).getByRole('button', { name: 'Move step 2 up' }).click();
    await expect(form(page).getByLabel('Step 1 text', { exact: true })).toHaveValue('Second');
    await form(page).getByRole('button', { name: 'Move step 1 down' }).click();
    await expect(form(page).getByLabel('Step 1 text', { exact: true })).toHaveValue('First');

    // Slide View shows the words on the slide's own shapes.
    await page.getByRole('button', { name: 'Slide', exact: true }).click();
    const canvas = page.getByTestId('stage-canvas');
    await expect(canvas).toContainText('Put the steps in order.');
    await expect(canvas).toContainText('First');
    await expect(canvas).toContainText('Second');
    await page.getByRole('button', { name: 'Form', exact: true }).click();

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
    await expect(form(page).getByLabel('Word 4 text', { exact: true })).toHaveValue('London');
    await expect(form(page).getByLabel('Word 1 is correct', { exact: true })).toBeChecked();
    await slideItem(page, 3).click();
    await expect(form(page).getByLabel('Target 2 text', { exact: true })).toHaveValue('Rome');
    await expect(form(page).getByLabel('Target 3 text', { exact: true })).toHaveValue('Madrid');
    await slideItem(page, 4).click();
    await expect(form(page).getByLabel('Step 2 text', { exact: true })).toHaveValue('Second');
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
    await expect(position).toHaveText('Slide 2 of 5');

    // The right word goes in the blank; the other tiles stay where they were.
    const tile = page.locator('[data-draggable="true"]').filter({ hasText: 'Paris' });
    const blank = page
      .locator('[data-object-type="shape"]:not([data-draggable="true"])')
      // What the learner sees: not the hidden feedback layers' panels (P7.5).
      .filter({ visible: true });
    await expect(tile).toHaveCount(1);
    await expect(blank).toHaveCount(1);
    await drag(page, tile, blank);
    await submitAnswer(page);
    await expect(position).toHaveText('Slide 3 of 5');

    // Each item onto its own target, found by the words set in Form View.
    const item = (words: string) =>
      page.locator('[data-draggable="true"]').filter({ hasText: words });
    const target = (words: string) =>
      page.locator('[data-object-type="shape"]').filter({ hasText: words });
    await drag(page, item('France'), target('Paris'));
    await drag(page, item('Italy'), target('Rome'));
    await drag(page, item('Spain'), target('Madrid'));
    await submitAnswer(page);
    await expect(position).toHaveText('Slide 4 of 5');

    // Sequence: each tile onto the place its step occupies in the factory layout.
    // Dropping on a place swaps the tile there, so all three in order are right.
    const stage = (await page.locator('.vo-player-stage').boundingBox())!;
    const at = (x: number, y: number) => ({
      x: stage.x + x * (stage.width / 1280),
      y: stage.y + y * (stage.height / 720),
    });
    const steps = ['First', 'Second', 'Third step'];
    for (const [index, text] of steps.entries()) {
      const tile = page.locator('[data-draggable="true"]').filter({ hasText: text });
      await dragToPoint(page, tile, at(102 + 160, 216 + index * 64 + 24));
    }
    await submitAnswer(page);
    await expect(position).toHaveText('Slide 5 of 5');
  } finally {
    await browser.close();
  }
});

test('hotspot: set up in Form View, kept, and answered in the course', async () => {
  test.setTimeout(180_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-hotspot-'));
  const file = join(work, 'hotspot.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { save: [file], message: [1, 1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();

    await insertQuestion(page, 'Hotspot');
    await expect(page.getByTestId('question-kind')).toHaveText('Hotspot');
    await type(page, 'Question text', 'Click the right region.');
    await expect(page.getByTestId('question-spot')).toHaveCount(3);
    await expect(form(page).getByLabel('Spot 1 is correct', { exact: true })).toBeChecked();
    await form(page).getByRole('button', { name: 'Add spot' }).click();
    await expect(page.getByTestId('question-spot')).toHaveCount(4);

    await page.getByRole('button', { name: 'Slide', exact: true }).click();
    await expect(page.getByTestId('stage-canvas')).toContainText('Click the right region.');
    await page.getByRole('button', { name: 'Form', exact: true }).click();

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
    await expect(page.getByTestId('question-spot')).toHaveCount(4);
    await expect(form(page).getByLabel('Spot 1 is correct', { exact: true })).toBeChecked();
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
    await page.getByRole('button', { name: 'Next' }).click();
    const position = page.locator('.vo-player-position');
    await expect(position).toHaveText('Slide 2 of 3');
    // The middle of the first region in the factory's default layout, in stage units.
    const stage = (await page.locator('.vo-player-stage').boundingBox())!;
    await page.mouse.click(
      stage.x + 302 * (stage.width / 1280),
      stage.y + 376 * (stage.height / 720),
    );
    await expect(page.locator('.vo-hotspot-mark')).toBeVisible();
    await submitAnswer(page);
    await expect(position).toHaveText('Slide 3 of 3');
  } finally {
    await browser.close();
  }
});

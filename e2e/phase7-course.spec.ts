import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { answerDialogs, launchApp, previewFrom } from './launch';

/**
 * Phase 7 from end to end, with everything made in the app: a graded question
 * with its own feedback words, a Likert survey, a question bank and a draw from
 * it, and a result slide the course is tracked by. It survives a save and a
 * fresh start, and plays in preview and published, as a learner meets it.
 */

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
/** Commands on the Slides tab (B17); the rest are on Insert. */
const ON_SLIDES = ['Question', 'Survey', 'Convert Slide', 'Question Bank', 'Screen Recording…'];
const insert = async (page: Page, menu: string, item: string) => {
  await ribbon(page, ON_SLIDES.includes(menu) ? 'Slides' : 'Insert');
  await page.getByRole('button', { name: menu, exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
};
const form = (page: Page) => page.getByTestId('question-form');
const items = (page: Page) => page.getByTestId('slide-list').locator('.slide-item');

/** Play the course in a page, preview or published: what Phase 7 added, as the learner meets it. */
async function play(page: Page) {
  const position = page.locator('.vo-player-position');
  const shown = (text: string) => page.getByText(text, { exact: true }).filter({ visible: true });
  await expect(position).toHaveText('Slide 1 of 6');
  await page.getByRole('button', { name: 'Next' }).click();
  // The multiple-choice question, and its Correct layer with the author's words.
  await expect(position).toHaveText('Slide 2 of 6');
  await page.getByRole('radio', { name: 'First answer', exact: true }).click();
  await shown('Submit').click();
  await expect(shown('Spot on.')).toBeVisible();
  await shown('Continue').click();
  // The Likert survey, rated by its accessible names, and its Thank You.
  await expect(position).toHaveText('Slide 3 of 6');
  for (const statement of ['First', 'Second', 'Third']) {
    await page.getByRole('radio', { name: `${statement} statement: Agree`, exact: true }).click();
  }
  await shown('Submit').click();
  await shown('Continue').click();
  // The draw: the bank's two questions, in order.
  await expect(position).toHaveText('Slide 4 of 6');
  await page.getByRole('radio', { name: 'First answer', exact: true }).click();
  await shown('Submit').click();
  await shown('Continue').click();
  await expect(position).toHaveText('Slide 5 of 6');
  await page.getByRole('radio', { name: 'True', exact: true }).click();
  await shown('Submit').click();
  await shown('Continue').click();
  // The result: every graded question right, 30 of 30.
  await expect(position).toHaveText('Slide 6 of 6');
  await expect(shown('You scored 100% (30 of 30 points). To pass: 50%.')).toBeVisible();
  await expect(shown('Well done: you passed.')).toBeVisible();
  // Review from the result: the first question, marked right.
  await shown('Review').click();
  await expect(position).toHaveText('Slide 2 of 6');
  await expect(page.locator('.vo-review-banner')).toHaveText('Review: you answered this correctly');
}

test('a course using all of Phase 7 survives saving and plays in preview and published', async () => {
  test.setTimeout(180_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-phase7-'));
  const file = join(work, 'phase7.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { save: [file], message: [1, 1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();

    // Slide 2: a graded question with its own Correct words.
    await insert(page, 'Question', 'Multiple Choice');
    const words = form(page).getByLabel('Correct feedback', { exact: true });
    await words.fill('Spot on.');
    await words.blur();
    // Slide 3: a Likert survey.
    await insert(page, 'Survey', 'Likert');
    await expect(page.getByTestId('question-kind')).toHaveText('Likert (survey)');
    // A bank of two: its multiple choice, and a true/false added to it.
    await page.getByRole('button', { name: 'New Question Bank', exact: true }).click();
    await insert(page, 'Question', 'True or False');
    await expect(page.getByTestId('bank').locator('.slide-item')).toHaveCount(2);
    // Slide 4: a draw of two from it, in order; slide 5: the result, passing at 50%.
    await items(page).nth(2).click();
    await insert(page, 'Question', 'Draw from Question Bank');
    await page
      .getByTestId('draw-form')
      .getByLabel('Draw order', { exact: true })
      .selectOption('inOrder');
    await insert(page, 'Question', 'Result Slide');
    const pass = page.getByTestId('result-form').getByLabel('Pass percentage', { exact: true });
    await pass.fill('50');
    await pass.press('Enter');
    // Tracked by the result.
    await ribbon(page, 'Design');
    await page.getByRole('button', { name: 'Tracking', exact: true }).click();
    const tracking = page.getByTestId('tracking-dialog');
    await tracking.getByRole('radio', { name: /reaches a result slide/ }).check();
    await tracking.getByRole('button', { name: 'Apply' }).click();

    await ribbon(page, 'Home');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('project-status')).toContainText('Saved');
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ args: [file] });
  try {
    const { app, page } = second;
    await answerDialogs(app, { open: [[out]], message: [1, 1] });
    // Five slides in the scene and two in the bank, each as it was left.
    await expect(items(page)).toHaveCount(7);
    await items(page).nth(1).click();
    await expect(form(page).getByLabel('Correct feedback', { exact: true })).toHaveValue(
      'Spot on.',
    );
    await items(page).nth(3).click();
    await expect(
      page.getByTestId('draw-form').getByLabel('Draw order', { exact: true }),
    ).toHaveValue('inOrder');
    await items(page).nth(4).click();
    await expect(
      page.getByTestId('result-form').getByLabel('Pass percentage', { exact: true }),
    ).toHaveValue('50');
    await ribbon(page, 'Design');
    await page.getByRole('button', { name: 'Tracking', exact: true }).click();
    await expect(
      page.getByTestId('tracking-dialog').getByRole('radio', { name: /reaches a result slide/ }),
    ).toBeChecked();
    await page.getByTestId('tracking-dialog').getByRole('button', { name: 'Cancel' }).click();

    // Preview, from the start.
    await items(page).nth(0).click();
    await ribbon(page, 'Home');
    const [preview] = await Promise.all([
      app.waitForEvent('window'),
      previewFrom(page, 'Entire Project'),
    ]);
    await play(preview);
    await preview.close();

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
    await play(page);
  } finally {
    await browser.close();
  }
});

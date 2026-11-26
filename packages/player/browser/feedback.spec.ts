import {
  addFeedbackLayers,
  createEmptyProject,
  createFeedbackMaster,
  createQuestionSlide,
  createScene,
  createSlide,
} from '@vedraopus/model';
import type { ChoiceQuestion, Project } from '@vedraopus/model';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Feedback layers in a course (docs/briefs/P7.5-feedback.md). */

const dist = join(import.meta.dirname, '../dist');

function page(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vedraopus-player-feedback-'));
  cpSync(join(dist, 'player.js'), join(dir, 'player.js'));
  cpSync(join(dist, 'player.css'), join(dir, 'player.css'));
  writeFileSync(
    join(dir, 'index.html'),
    `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="player.css">
<style>html,body{margin:0;height:100%}#app{width:1280px;height:800px}</style></head>
<body><div id="app"></div><script src="player.js"></script></body></html>`,
  );
  return pathToFileURL(join(dir, 'index.html')).href;
}

async function mount(browserPage: Page, project: Project) {
  await browserPage.goto(page());
  await browserPage.evaluate((data) => {
    const w = window as unknown as Record<string, unknown>;
    w['player'] = (
      w['VedraOpusPlayer'] as { mountPlayer: (...args: unknown[]) => unknown }
    ).mountPlayer(document.getElementById('app'), data, {});
  }, project);
}
const position = (browserPage: Page) => browserPage.locator('.vo-player-position');
const object = (browserPage: Page, id: string) =>
  browserPage.locator(`.vo-player-stage [data-object-id="${id}"]`).first();

test('a wrong answer shows Try Again, which closes; a right one shows Correct, whose Continue moves on', async ({
  page: browserPage,
}) => {
  const project = createEmptyProject('Feedback');
  const slide = createQuestionSlide('multipleChoice', project.stage);
  const question = slide.question as ChoiceQuestion;
  question.attempts = 2;
  addFeedbackLayers(slide, createFeedbackMaster(project.stage));
  project.scenes = [{ ...createScene(), slides: [slide, createSlide('End')] }];
  const { correct, tryAgain } = question.feedback;
  await mount(browserPage, project);

  const layerOf = (id: string) => browserPage.locator(`[data-layer-id="${id}"]`).first();
  await expect(layerOf(tryAgain!.layer)).toBeHidden();
  await object(browserPage, question.choices[1]!.object).click();
  await object(browserPage, question.submit!).click();
  await expect(layerOf(tryAgain!.layer)).toBeVisible();
  await expect(object(browserPage, tryAgain!.message!)).toContainText('Try again');
  await object(browserPage, tryAgain!.button!).click();
  await expect(layerOf(tryAgain!.layer)).toBeHidden();
  await expect(position(browserPage)).toHaveText('Slide 1 of 2');

  await object(browserPage, question.choices[0]!.object).click();
  await object(browserPage, question.submit!).click();
  await expect(layerOf(correct!.layer)).toBeVisible();
  await expect(position(browserPage)).toHaveText('Slide 1 of 2');
  await object(browserPage, correct!.button!).click();
  await expect(position(browserPage)).toHaveText('Slide 2 of 2');
});

test('feedback by choice shows the picked choice’s words in the message', async ({
  page: browserPage,
}) => {
  const project = createEmptyProject('By choice');
  const slide = createQuestionSlide('multipleChoice', project.stage);
  const question = slide.question as ChoiceQuestion;
  question.feedback.by = 'choice';
  question.choices[2]!.feedback = 'The third one is a common mix-up.';
  project.scenes = [{ ...createScene(), slides: [slide, createSlide('End')] }];
  await mount(browserPage, project);
  await object(browserPage, question.choices[2]!.object).click();
  await object(browserPage, question.submit!).click();
  const message = object(browserPage, question.feedback.incorrect!.message!);
  await expect(message).toBeVisible();
  await expect(message).toHaveText('The third one is a common mix-up.');
});

test('review: a Review button shows each question’s result and marks the right and wrong answers', async ({
  page: browserPage,
}) => {
  const project = createEmptyProject('Review');
  const slide = createQuestionSlide('multipleChoice', project.stage);
  const question = slide.question as ChoiceQuestion;
  question.feedback.by = 'none';
  const results = createSlide('Results');
  const button = {
    ...slide.baseLayer.objects.find((o) => o.id === question.submit)!,
    id: 'obj_review',
  };
  results.baseLayer.objects.push(button);
  results.triggers.push({
    id: 'trigger_review',
    owner: { kind: 'object', id: button.id },
    event: { type: 'click', object: button.id },
    action: { type: 'reviewQuiz' },
    conditions: null,
    otherwise: null,
    enabled: true,
  });
  project.scenes = [{ ...createScene(), slides: [slide, results] }];
  await mount(browserPage, project);
  const banner = browserPage.locator('.vo-review-banner');
  await expect(banner).toBeHidden();

  await object(browserPage, question.choices[2]!.object).click();
  await object(browserPage, question.submit!).click();
  await expect(position(browserPage)).toHaveText('Slide 2 of 2');
  await object(browserPage, button.id).click();

  await expect(position(browserPage)).toHaveText('Slide 1 of 2');
  await expect(banner).toBeVisible();
  await expect(banner).toHaveText('Review: you answered this incorrectly');
  await expect(object(browserPage, question.choices[0]!.object)).toHaveAttribute(
    'data-review',
    'right',
  );
  await expect(object(browserPage, question.choices[2]!.object)).toHaveAttribute(
    'data-review',
    'chosen',
  );
  await expect(object(browserPage, question.choices[1]!.object)).not.toHaveAttribute('data-review');
  // Locked: picking another changes nothing.
  await object(browserPage, question.choices[0]!.object).click();
  await expect(object(browserPage, question.choices[0]!.object)).toHaveAttribute(
    'data-state',
    'normal',
  );
});

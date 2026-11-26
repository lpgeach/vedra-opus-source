import {
  createEmptyProject,
  createQuestionSlide,
  createScene,
  createSlide,
} from '@vedraopus/model';
import type { Project, Question } from '@vedraopus/model';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * A question slide whose Submit takes its branch at once: feedback none, so
 * no feedback layer waits for the learner (feedback.spec.ts tests those, P7.5).
 */
const quizSlide = (...args: Parameters<typeof createQuestionSlide>) => {
  const slide = createQuestionSlide(...args);
  slide.question!.feedback.by = 'none';
  return slide;
};

const dist = join(import.meta.dirname, '../dist');

function page(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vedraopus-player-quiz-'));
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

/** A question slide (changed by `edit`), then "Right" and "Wrong" slides. */
function course(kind: Question['kind'], edit: (question: Question) => void = () => undefined) {
  const project: Project = createEmptyProject('Quiz');
  const quiz = quizSlide(kind, project.stage);
  const right = createSlide('Right');
  const wrong = createSlide('Wrong');
  edit(quiz.question!);
  quiz.question!.branch.incorrect = { kind: 'slide', slide: wrong.id };
  project.scenes = [{ ...createScene(), slides: [quiz, right, wrong] }];
  return { project, question: quiz.question! };
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
const choice = (browserPage: Page, question: Question, n: number) =>
  browserPage.locator(`[data-object-id="${question.choices[n]!.object}"]`);
const submit = (browserPage: Page, question: Question) =>
  browserPage.locator(`[data-object-id="${question.submit!}"]`).click();
const position = (browserPage: Page) => browserPage.locator('.vo-player-position');

test('a multiple-choice question: required, picked, marked, answered right', async ({
  page: browserPage,
}) => {
  const { project, question } = course('multipleChoice');
  await mount(browserPage, project);
  await expect(position(browserPage)).toHaveText('Slide 1 of 3');
  // Required: Next waits.
  await expect(browserPage.getByRole('button', { name: 'Next' })).toBeDisabled();
  await choice(browserPage, question, 1).click();
  await choice(browserPage, question, 0).click();
  // One pick at a time: the mark shows which.
  await expect(choice(browserPage, question, 0).locator('.vo-choice-mark')).toHaveAttribute(
    'data-selected',
    'true',
  );
  await expect(choice(browserPage, question, 1).locator('.vo-choice-mark')).not.toHaveAttribute(
    'data-selected',
  );
  await submit(browserPage, question);
  await expect(position(browserPage)).toHaveText('Slide 2 of 3');
});

test('a multiple-response question with two tries, answered wrong twice, goes the wrong way', async ({
  page: browserPage,
}) => {
  const { project, question } = course('multipleResponse', (q) => {
    q.attempts = 2;
    q.choices[2]!.correct = true;
  });
  await mount(browserPage, project);
  await choice(browserPage, question, 0).click();
  await submit(browserPage, question);
  // A try left: still here, and the answer can change.
  await expect(position(browserPage)).toHaveText('Slide 1 of 3');
  await choice(browserPage, question, 1).click();
  await submit(browserPage, question);
  await expect(position(browserPage)).toHaveText('Slide 3 of 3');
});

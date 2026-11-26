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

/** Survey questions in a course (docs/briefs/P7.3-survey-types.md). */

const dist = join(import.meta.dirname, '../dist');

function page(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vedraopus-player-survey-'));
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

type Of<K extends Question['kind']> = Extract<Question, { kind: K }>;

/** A pick-many and an essay question, then an end slide. */
function course() {
  const project: Project = createEmptyProject('Survey');
  const pick = quizSlide('pickMany', project.stage);
  const essay = quizSlide('essay', project.stage);
  project.scenes = [{ ...createScene(), slides: [pick, essay, createSlide('End')] }];
  return { project, pick: pick.question as Of<'pickMany'>, essay: essay.question as Of<'essay'> };
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
const submit = (browserPage: Page, question: Question) =>
  browserPage.locator(`[data-object-id="${question.submit!}"]`).click();
const mark = (browserPage: Page, objectId: string) =>
  browserPage.locator(`[data-object-id="${objectId}"] .vo-choice-mark`);

test('a survey: pick many and an essay over two lines, answered, then closed', async ({
  page: browserPage,
}) => {
  const { project, pick, essay } = course();
  await mount(browserPage, project);

  // Pick many: nothing picked keeps the learner here; two picks are an answer.
  await submit(browserPage, pick);
  await expect(position(browserPage)).toHaveText('Slide 1 of 3');
  await browserPage.locator(`[data-object-id="${pick.choices[0]!.object}"]`).click();
  await browserPage.locator(`[data-object-id="${pick.choices[2]!.object}"]`).click();
  await expect(mark(browserPage, pick.choices[0]!.object)).toHaveAttribute('data-selected', 'true');
  await expect(mark(browserPage, pick.choices[2]!.object)).toHaveAttribute('data-selected', 'true');
  await submit(browserPage, pick);
  await expect(position(browserPage)).toHaveText('Slide 2 of 3');

  // Essay: a textarea, where Enter starts a new line and an arrow key does not change slide.
  const box = browserPage.locator(`[data-object-id="${essay.entry!}"] textarea`);
  await expect(box).toBeVisible();
  await box.click();
  await box.pressSequentially('First line');
  await box.press('Enter');
  await box.pressSequentially('second line');
  await box.press('ArrowRight');
  await expect(position(browserPage)).toHaveText('Slide 2 of 3');
  await expect(box).toHaveValue('First line\nsecond line');
  await submit(browserPage, essay);
  await expect(position(browserPage)).toHaveText('Slide 3 of 3');

  // Back on both: the answers are kept and closed.
  await browserPage.getByRole('button', { name: 'Previous' }).click();
  await expect(position(browserPage)).toHaveText('Slide 2 of 3');
  await expect(box).toHaveValue('First line\nsecond line');
  await expect(box).toBeDisabled();
  await browserPage.getByRole('button', { name: 'Previous' }).click();
  await expect(position(browserPage)).toHaveText('Slide 1 of 3');
  await expect(mark(browserPage, pick.choices[0]!.object)).toHaveAttribute('data-selected', 'true');
  await browserPage.locator(`[data-object-id="${pick.choices[1]!.object}"]`).click();
  await expect(mark(browserPage, pick.choices[1]!.object)).not.toHaveAttribute('data-selected');
});

/** The middle of an object as the learner sees it now, in screen pixels. */
async function middleShown(browserPage: Page, id: string) {
  const box = (await browserPage.locator(`[data-object-id="${id}"]`).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Press on a tile, carry it to `to` (screen pixels) in small moves, and let go. */
async function dragTo(browserPage: Page, id: string, to: { x: number; y: number }) {
  const from = await middleShown(browserPage, id);
  await browserPage.mouse.move(from.x, from.y);
  await browserPage.mouse.down();
  await browserPage.mouse.move(to.x, to.y, { steps: 8 });
  await browserPage.mouse.up();
}

test('a ranking: unshuffled, reordered by dragging, answered, then fixed', async ({
  page: browserPage,
}) => {
  const project: Project = createEmptyProject('Ranking');
  const slide = quizSlide('ranking', project.stage);
  project.scenes = [{ ...createScene(), slides: [slide, createSlide('End')] }];
  const question = slide.question as Of<'ranking'>;
  const [first, , last] = question.items.map((item) => item.object);
  await mount(browserPage, project);
  // Clicking Submit can scroll a page larger than the window (pitfall #103): fit it.
  await browserPage.evaluate(() => {
    document.getElementById('app')!.style.cssText = 'width:100vw;height:100vh';
  });
  await expect
    .poll(async () => (await browserPage.locator('.vo-player-stage').boundingBox())!.width)
    .toBeLessThanOrEqual(960);
  const tile = (id: string) => browserPage.locator(`[data-object-id="${id}"]`);
  await expect(tile(first!)).toHaveAttribute('data-draggable', 'true');

  // In the author's order: the first item is above the last.
  const top = await middleShown(browserPage, first!);
  const bottom = await middleShown(browserPage, last!);
  expect(top.y).toBeLessThan(bottom.y);

  // The last item dropped on the first's place: the two swap.
  await dragTo(browserPage, last!, top);
  const movedLast = await middleShown(browserPage, last!);
  const movedFirst = await middleShown(browserPage, first!);
  expect(Math.abs(movedLast.y - top.y)).toBeLessThan(2);
  expect(Math.abs(movedFirst.y - bottom.y)).toBeLessThan(2);

  await submit(browserPage, question);
  await expect(position(browserPage)).toHaveText('Slide 2 of 2');
  await browserPage.getByRole('button', { name: 'Previous' }).click();
  await expect(position(browserPage)).toHaveText('Slide 1 of 2');
  // Kept, and fixed: dragging again moves nothing.
  const kept = await middleShown(browserPage, last!);
  expect(Math.abs(kept.y - top.y)).toBeLessThan(2);
  await dragTo(browserPage, first!, kept);
  const after = await middleShown(browserPage, first!);
  expect(Math.abs(after.y - bottom.y)).toBeLessThan(2);
});

test('a Likert question: one point a row, every row rated, then fixed', async ({
  page: browserPage,
}) => {
  const project: Project = createEmptyProject('Likert');
  const slide = quizSlide('likert', project.stage);
  project.scenes = [{ ...createScene(), slides: [slide, createSlide('End')] }];
  const question = slide.question as Of<'likert'>;
  const [r0, r1, r2] = question.statements.map((statement) => statement.points);
  await mount(browserPage, project);
  const point = (id: string) => browserPage.locator(`[data-object-id="${id}"]`);

  // The scale's words are shown, and a row's points exclude each other.
  await expect(browserPage.getByText('Strongly agree', { exact: true })).toBeVisible();
  await point(r0![1]!).click();
  await point(r0![4]!).click();
  await point(r1![2]!).click();
  await expect(mark(browserPage, r0![4]!)).toHaveAttribute('data-selected', 'true');
  await expect(mark(browserPage, r0![1]!)).not.toHaveAttribute('data-selected');
  await expect(mark(browserPage, r1![2]!)).toHaveAttribute('data-selected', 'true');

  // A row unrated: no answer yet.
  await submit(browserPage, question);
  await expect(position(browserPage)).toHaveText('Slide 1 of 2');
  await point(r2![0]!).click();
  await submit(browserPage, question);
  await expect(position(browserPage)).toHaveText('Slide 2 of 2');

  await browserPage.getByRole('button', { name: 'Previous' }).click();
  await expect(mark(browserPage, r0![4]!)).toHaveAttribute('data-selected', 'true');
  await expect(mark(browserPage, r2![0]!)).toHaveAttribute('data-selected', 'true');
  await point(r2![3]!).click();
  await expect(mark(browserPage, r2![3]!)).not.toHaveAttribute('data-selected');
});

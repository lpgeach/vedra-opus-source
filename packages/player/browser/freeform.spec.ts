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

/** Freeform questions in a course (docs/briefs/P7.4-freeform-questions.md). */

const dist = join(import.meta.dirname, '../dist');

function page(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vedraopus-player-freeform-'));
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

test('freeform pick many: pictures picked, shown selected, and marked', async ({
  page: browserPage,
}) => {
  const project: Project = createEmptyProject('Pictures');
  const slide = quizSlide('freePickMany', project.stage);
  const question = slide.question as Of<'freePickMany'>;
  question.choices[2]!.correct = true;
  project.scenes = [{ ...createScene(), slides: [slide, createSlide('End')] }];
  const [a, b, c] = question.choices.map((choice) => choice.object);
  await mount(browserPage, project);

  await object(browserPage, a!).click();
  await object(browserPage, c!).click();
  await expect(object(browserPage, a!)).toHaveAttribute('data-state', 'selected');
  await expect(object(browserPage, b!)).toHaveAttribute('data-state', 'normal');
  await expect(object(browserPage, c!)).toHaveAttribute('data-state', 'selected');
  await object(browserPage, question.submit!).click();
  await expect(position(browserPage)).toHaveText('Slide 2 of 2');
});

test('freeform shortcut key: a wrong press (an arrow) does not change slide; Ctrl+S answers', async ({
  page: browserPage,
}) => {
  const project: Project = createEmptyProject('Keys');
  const slide = quizSlide('freeKey', project.stage);
  const question = slide.question as Of<'freeKey'>;
  question.attempts = 3;
  project.scenes = [{ ...createScene(), slides: [slide, createSlide('End')] }];
  await mount(browserPage, project);
  await browserPage.locator('.vo-player-stage').click({ position: { x: 5, y: 5 } });

  // A wrong answer, not the player's Next.
  await browserPage.keyboard.press('ArrowRight');
  await expect(position(browserPage)).toHaveText('Slide 1 of 2');
  // Ctrl alone is not an answer; with S it is the right one. The page is not saved.
  await browserPage.keyboard.down('Control');
  await browserPage.keyboard.press('s');
  await browserPage.keyboard.up('Control');
  await expect(position(browserPage)).toHaveText('Slide 2 of 2');
});

/** The middle of an element on the screen. */
async function middleOf(browserPage: Page, id: string) {
  const box = (await object(browserPage, id).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('freeform drag and drop: Drag Over while carried, then snapped with its drop state; off a target it stays', async ({
  page: browserPage,
}) => {
  const project: Project = createEmptyProject('Sorting');
  const slide = quizSlide('freeDrag', project.stage);
  const question = slide.question as Of<'freeDrag'>;
  question.returnToStart = false;
  const [fruit] = question.targets;
  const [apple, carrot] = question.items.map((item) => item.object);
  const states = (id: string, ...ids: string[]) =>
    slide.baseLayer.objects
      .find((each) => each.id === id)!
      .states.push(...ids.map((state) => ({ id: state, name: state, overrides: {} })));
  states(fruit!, 'dragOver');
  states(apple!, 'dropCorrect', 'dropIncorrect');
  project.scenes = [{ ...createScene(), slides: [slide, createSlide('End')] }];
  await mount(browserPage, project);
  // Fit the course to the window, so nothing scrolls under the pointer (pitfall #103).
  await browserPage.evaluate(() => {
    document.getElementById('app')!.style.cssText = 'width:100vw;height:100vh';
  });
  await expect
    .poll(async () => (await browserPage.locator('.vo-player-stage').boundingBox())!.width)
    .toBeLessThanOrEqual(960);

  const bin = await middleOf(browserPage, fruit!);
  const from = await middleOf(browserPage, apple!);
  await browserPage.mouse.move(from.x, from.y);
  await browserPage.mouse.down();
  await browserPage.mouse.move(bin.x - 20, bin.y - 10, { steps: 8 });
  await expect(object(browserPage, fruit!)).toHaveAttribute('data-state', 'dragOver');
  await browserPage.mouse.up();
  await expect(object(browserPage, fruit!)).toHaveAttribute('data-state', 'normal');
  await expect(object(browserPage, apple!)).toHaveAttribute('data-state', 'dropCorrect');
  // Snapped: its middle is the bin's.
  const snapped = await middleOf(browserPage, apple!);
  expect(Math.abs(snapped.x - bin.x)).toBeLessThan(2);
  expect(Math.abs(snapped.y - bin.y)).toBeLessThan(2);

  // Off every target, with return-to-start off: it stays where it was let go.
  const start = await middleOf(browserPage, carrot!);
  const spot = { x: start.x + 60, y: start.y + 150 };
  await browserPage.mouse.move(start.x, start.y);
  await browserPage.mouse.down();
  await browserPage.mouse.move(spot.x, spot.y, { steps: 8 });
  await browserPage.mouse.up();
  const left = await middleOf(browserPage, carrot!);
  expect(Math.abs(left.x - spot.x)).toBeLessThan(2);
  expect(Math.abs(left.y - spot.y)).toBeLessThan(2);
});

test('freeform drag and drop by keyboard: the arrows go bin to bin, with Drag Over and the drop states, marked right (P10.1)', async ({
  page: browserPage,
}) => {
  const project: Project = createEmptyProject('Sorting');
  const slide = quizSlide('freeDrag', project.stage);
  const question = slide.question as Of<'freeDrag'>;
  const [fruit] = question.targets;
  const [apple, carrot] = question.items.map((item) => item.object);
  const states = (id: string, ...ids: string[]) =>
    slide.baseLayer.objects
      .find((each) => each.id === id)!
      .states.push(...ids.map((state) => ({ id: state, name: state, overrides: {} })));
  states(fruit!, 'dragOver');
  states(apple!, 'dropCorrect', 'dropIncorrect');
  project.scenes = [{ ...createScene(), slides: [slide, createSlide('End')] }];
  await mount(browserPage, project);
  await browserPage.evaluate(() => {
    const w = window as unknown as {
      results: string[];
      player: {
        engine: { on(listener: (event: { type: string; result?: string }) => void): void };
      };
    };
    w.results = [];
    w.player.engine.on((event) => {
      if (event.type === 'questionSubmit') w.results.push(event.result ?? '');
    });
  });
  const announcer = browserPage.locator('.vo-player-announcer');

  await object(browserPage, apple!).focus();
  await browserPage.keyboard.press('Enter');
  await expect(announcer).toHaveText('Apple picked up.');
  await browserPage.keyboard.press('ArrowRight');
  await expect(announcer).toHaveText('Over Fruit.');
  await expect(object(browserPage, fruit!)).toHaveAttribute('data-state', 'dragOver');
  await browserPage.keyboard.press('Enter');
  await expect(announcer).toHaveText('Apple dropped.');
  await expect(object(browserPage, fruit!)).toHaveAttribute('data-state', 'normal');
  await expect(object(browserPage, apple!)).toHaveAttribute('data-state', 'dropCorrect');
  // Snapped to the bin's middle, as by the pointer.
  const bin = await middleOf(browserPage, fruit!);
  const snapped = await middleOf(browserPage, apple!);
  expect(Math.abs(snapped.x - bin.x)).toBeLessThan(2);
  expect(Math.abs(snapped.y - bin.y)).toBeLessThan(2);

  // The carrot two stops on: past Fruit to Vegetables. The stone stays out.
  await object(browserPage, carrot!).focus();
  await browserPage.keyboard.press('Space');
  await browserPage.keyboard.press('ArrowRight');
  await browserPage.keyboard.press('ArrowRight');
  await expect(announcer).toHaveText('Over Vegetables.');
  await browserPage.keyboard.press('Space');
  await object(browserPage, question.submit!).click();
  await expect(position(browserPage)).toHaveText('Slide 2 of 2');
  expect(
    await browserPage.evaluate(() => (window as unknown as { results: string[] }).results),
  ).toEqual(['correct']);
});

test('freeform hotspot: a mark on empty slide is wrong, on the right region is right; Submit does not move it', async ({
  page: browserPage,
}) => {
  const project: Project = createEmptyProject('Regions');
  const slide = quizSlide('freeHotspot', project.stage);
  const question = slide.question as Of<'freeHotspot'>;
  question.attempts = 2;
  project.scenes = [{ ...createScene(), slides: [slide, createSlide('End')] }];
  await mount(browserPage, project);
  await browserPage.evaluate(() => {
    document.getElementById('app')!.style.cssText = 'width:100vw;height:100vh';
  });
  await expect
    .poll(async () => (await browserPage.locator('.vo-player-stage').boundingBox())!.width)
    .toBeLessThanOrEqual(960);
  const stageBox = (await browserPage.locator('.vo-player-stage').boundingBox())!;
  const at = (x: number, y: number) => ({
    x: stageBox.x + (x * stageBox.width) / 1280,
    y: stageBox.y + (y * stageBox.height) / 720,
  });
  const mark = browserPage.locator('.vo-hotspot-mark');
  await expect(mark).toBeHidden();

  // Empty slide, below the regions (y 600): a mark, and wrong.
  const empty = at(640, 600);
  await browserPage.mouse.click(empty.x, empty.y);
  await expect(mark).toBeVisible();
  const placed = (await mark.boundingBox())!;
  await object(browserPage, question.submit!).click();
  // Submit did not move it.
  expect((await mark.boundingBox())!).toEqual(placed);
  await expect(position(browserPage)).toHaveText('Slide 1 of 2');

  // Inside Region 1 (x 102–342, y 216–376): right.
  const inside = at(220, 300);
  await browserPage.mouse.click(inside.x, inside.y);
  await object(browserPage, question.submit!).click();
  await expect(position(browserPage)).toHaveText('Slide 2 of 2');
  await browserPage.getByRole('button', { name: 'Previous' }).click();
  await expect(mark).toBeVisible();
});

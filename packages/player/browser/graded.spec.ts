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
  const dir = mkdtempSync(join(tmpdir(), 'vedraopus-player-graded-'));
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

/** A fill-in-the-blank, a numeric and a matching question, then an end slide. */
function course() {
  const project: Project = createEmptyProject('Graded');
  const blank = quizSlide('fillInBlank', project.stage);
  (blank.question as Extract<Question, { kind: 'fillInBlank' }>).answers = ['Paris'];
  const numeric = quizSlide('numeric', project.stage);
  (numeric.question as Extract<Question, { kind: 'numeric' }>).answers = [
    { op: 'between', from: 9, to: 11 },
  ];
  numeric.question!.attempts = 2;
  const matching = quizSlide('matchingDropdown', project.stage);
  project.scenes = [{ ...createScene(), slides: [blank, numeric, matching, createSlide('End')] }];
  return {
    project,
    blank: blank.question as Extract<Question, { kind: 'fillInBlank' }>,
    numeric: numeric.question as Extract<Question, { kind: 'numeric' }>,
    matching: matching.question as Extract<Question, { kind: 'matchingDropdown' }>,
  };
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
const field = (browserPage: Page, id: string) =>
  browserPage.locator(`[data-object-id="${id}"] input, [data-object-id="${id}"] select`);
const position = (browserPage: Page) => browserPage.locator('.vo-player-position');
const submit = (browserPage: Page, question: Question) =>
  browserPage.locator(`[data-object-id="${question.submit!}"]`).click();

test('typed and chosen answers: fill in the blank, numeric and matching, marked and then closed', async ({
  page: browserPage,
}) => {
  const { project, blank, numeric, matching } = course();
  await mount(browserPage, project);

  // Fill in the blank: case does not matter; an arrow key in the field does not change slide.
  await field(browserPage, blank.entry!).fill('paris');
  await field(browserPage, blank.entry!).press('ArrowRight');
  await expect(position(browserPage)).toHaveText('Slide 1 of 4');
  await submit(browserPage, blank);
  await expect(position(browserPage)).toHaveText('Slide 2 of 4');

  // Numeric: 12 is outside 9 to 11 (a try left), 10.5 is in.
  await field(browserPage, numeric.entry!).fill('12');
  await submit(browserPage, numeric);
  await expect(position(browserPage)).toHaveText('Slide 2 of 4');
  await field(browserPage, numeric.entry!).fill('10.5');
  await submit(browserPage, numeric);
  await expect(position(browserPage)).toHaveText('Slide 3 of 4');

  // Matching: every dropdown chosen right.
  for (const pair of matching.pairs) {
    await field(browserPage, pair.select).selectOption(pair.match);
  }
  await submit(browserPage, matching);
  await expect(position(browserPage)).toHaveText('Slide 4 of 4');

  // Back on the first: its answer is kept, and closed.
  await browserPage.getByRole('button', { name: 'Previous' }).click();
  await browserPage.getByRole('button', { name: 'Previous' }).click();
  await browserPage.getByRole('button', { name: 'Previous' }).click();
  await expect(position(browserPage)).toHaveText('Slide 1 of 4');
  await expect(field(browserPage, blank.entry!)).toHaveValue('paris');
  await expect(field(browserPage, blank.entry!)).toBeDisabled();
});

/** A word bank, a drag matching and a drag sequence question, then an end slide. */
function dragCourse() {
  const project: Project = createEmptyProject('Dragging');
  const bank = quizSlide('wordBank', project.stage);
  const matching = quizSlide('matchingDrag', project.stage);
  const sequence = quizSlide('sequenceDrag', project.stage);
  project.scenes = [{ ...createScene(), slides: [bank, matching, sequence, createSlide('End')] }];
  /** The middle of an object as its slide places it, in stage units. */
  const middle = (slide: typeof bank, id: string) => {
    const { frame } = slide.baseLayer.objects.find((object) => object.id === id)!;
    return { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
  };
  return {
    project,
    bank: { slide: bank, question: bank.question as Extract<Question, { kind: 'wordBank' }> },
    matching: {
      slide: matching,
      question: matching.question as Extract<Question, { kind: 'matchingDrag' }>,
    },
    sequence: {
      slide: sequence,
      question: sequence.question as Extract<Question, { kind: 'sequenceDrag' }>,
    },
    middle,
  };
}

/** A point on the stage, in stage units, as a point on the screen. */
async function onScreen(browserPage: Page, point: { x: number; y: number }) {
  const box = (await browserPage.locator('.vo-player-stage').boundingBox())!;
  const scale = box.width / 1280;
  return { x: box.x + point.x * scale, y: box.y + point.y * scale };
}

/** The middle of an object as the learner sees it now. */
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

/** A hotspot with two tries, then an end slide. */
function hotspotCourse() {
  const project: Project = createEmptyProject('Hotspot');
  const slide = quizSlide('hotspot', project.stage);
  slide.question!.attempts = 2;
  project.scenes = [{ ...createScene(), slides: [slide, createSlide('End')] }];
  const question = slide.question as Extract<Question, { kind: 'hotspot' }>;
  /** The middle of an object as its slide places it, in stage units. */
  const centre = (id: string) => {
    const { frame } = slide.baseLayer.objects.find((object) => object.id === id)!;
    return { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
  };
  return { project, question, centre };
}

test('hotspot: a mark on a spot is submitted and kept; the guides stay hidden', async ({
  page: browserPage,
}) => {
  const { project, question, centre } = hotspotCourse();
  await mount(browserPage, project);
  // Fit the course to the window: a click on Submit otherwise scrolls the page,
  // which moves the stage under a point measured beforehand.
  await browserPage.evaluate(() => {
    document.getElementById('app')!.style.cssText = 'width:100vw;height:100vh';
  });
  await expect
    .poll(async () => (await browserPage.locator('.vo-player-stage').boundingBox())!.width)
    .toBeLessThanOrEqual(960);
  const mark = browserPage.locator('.vo-hotspot-mark');
  await expect(browserPage.locator(`[data-object-id="${question.picture!}"]`)).toBeVisible();
  for (const spot of question.spots) {
    await expect(browserPage.locator(`[data-object-id="${spot.object}"]`)).toBeHidden();
  }
  await expect(mark).toBeHidden();

  // A wrong spot is a try again; the wrong answer is not the end of the question.
  const wrong = await onScreen(browserPage, centre(question.spots[1]!.object));
  await browserPage.mouse.click(wrong.x, wrong.y);
  await expect(mark).toBeVisible();
  await submit(browserPage, question);
  await expect(position(browserPage)).toHaveText('Slide 1 of 2');

  // The right spot moves on; coming back keeps the mark and locks the picture.
  const right = await onScreen(browserPage, centre(question.spots[0]!.object));
  await browserPage.mouse.click(right.x, right.y);
  await submit(browserPage, question);
  await expect(position(browserPage)).toHaveText('Slide 2 of 2');
  await browserPage.getByRole('button', { name: 'Previous' }).click();
  await expect(position(browserPage)).toHaveText('Slide 1 of 2');
  await expect(mark).toBeVisible();
  const shown = (await mark.boundingBox())!;
  expect(Math.abs(shown.x + shown.width / 2 - right.x)).toBeLessThan(3);
  expect(Math.abs(shown.y + shown.height / 2 - right.y)).toBeLessThan(3);
  await browserPage.mouse.click(wrong.x, wrong.y);
  const still = (await mark.boundingBox())!;
  expect(Math.abs(still.x + still.width / 2 - right.x)).toBeLessThan(3);
});

test('drag questions: a word into the blank, items onto targets, steps into order; then fixed', async ({
  page: browserPage,
}) => {
  const { project, bank, matching, sequence, middle } = dragCourse();
  await mount(browserPage, project);
  // The page is larger than the window, and clicking Submit scrolls it, which would
  // leave tiles out of the mouse's reach: fit the course to the window (it refits).
  await browserPage.evaluate(() => {
    document.getElementById('app')!.style.cssText = 'width:100vw;height:100vh';
  });
  await expect
    .poll(async () => (await browserPage.locator('.vo-player-stage').boundingBox())!.width)
    .toBeLessThanOrEqual(960);
  const [right, wrong] = bank.question.words.map((word) => word.object);
  const tile = (id: string) => browserPage.locator(`[data-object-id="${id}"]`);
  await expect(tile(right!)).toHaveAttribute('data-draggable', 'true');

  // A press that does not move is a click, not a drag: the word stays home.
  const home = await middleShown(browserPage, wrong!);
  await tile(wrong!).click();
  expect(await middleShown(browserPage, wrong!)).toEqual(home);

  // Carried part way, the tile follows the pointer.
  const blank = await onScreen(browserPage, middle(bank.slide, bank.question.blank!));
  await browserPage.mouse.move(home.x, home.y);
  await browserPage.mouse.down();
  await browserPage.mouse.move(home.x + 40, home.y - 30, { steps: 4 });
  const carried = await middleShown(browserPage, wrong!);
  expect(Math.abs(carried.x - (home.x + 40))).toBeLessThan(2);
  expect(Math.abs(carried.y - (home.y - 30))).toBeLessThan(2);
  // Let go short of the blank: it goes back.
  await browserPage.mouse.up();
  expect(await middleShown(browserPage, wrong!)).toEqual(home);

  // Into the blank; then the right word takes its place and the wrong one goes back.
  await dragTo(browserPage, wrong!, blank);
  const inBlank = await middleShown(browserPage, wrong!);
  expect(Math.abs(inBlank.x - blank.x)).toBeLessThan(2);
  expect(Math.abs(inBlank.y - blank.y)).toBeLessThan(2);
  await dragTo(browserPage, right!, blank);
  expect(await middleShown(browserPage, wrong!)).toEqual(home);
  await submit(browserPage, bank.question);
  await expect(position(browserPage)).toHaveText('Slide 2 of 4');

  // Matching: each item onto its own target, from wherever the shuffle put it.
  for (const pair of matching.question.pairs) {
    await dragTo(
      browserPage,
      pair.item,
      await onScreen(browserPage, middle(matching.slide, pair.target)),
    );
  }
  await submit(browserPage, matching.question);
  await expect(position(browserPage)).toHaveText('Slide 3 of 4');

  // Sequence: step i dropped on place i (where step i's tile stands in the slide) swaps it in.
  for (const step of sequence.question.steps) {
    await dragTo(
      browserPage,
      step.object,
      await onScreen(browserPage, middle(sequence.slide, step.object)),
    );
  }
  await submit(browserPage, sequence.question);
  await expect(position(browserPage)).toHaveText('Slide 4 of 4');

  // Back on the word bank: the answer is shown, and the tiles no longer move.
  for (let i = 0; i < 3; i++) await browserPage.getByRole('button', { name: 'Previous' }).click();
  await expect(position(browserPage)).toHaveText('Slide 1 of 4');
  await expect(tile(right!)).not.toHaveAttribute('data-draggable', 'true');
  const answered = await middleShown(browserPage, right!);
  expect(Math.abs(answered.x - blank.x)).toBeLessThan(2);
  await dragTo(browserPage, right!, home);
  expect(await middleShown(browserPage, right!)).toEqual(answered);
});

test('the drag kinds answered by keyboard, marked as by the pointer: word bank, matching, sequence (P10.1)', async ({
  page: browserPage,
}) => {
  const { project, bank, matching, sequence, middle } = dragCourse();
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
  const results = () =>
    browserPage.evaluate(() => (window as unknown as { results: string[] }).results);
  const announcer = browserPage.locator('.vo-player-announcer');
  /** Focus a tile, pick it up, take it `steps` stops on with the arrow key, and drop it. */
  const keyDrop = async (id: string, steps: number) => {
    await browserPage.locator(`.vo-player-stage [data-object-id="${id}"]`).focus();
    await browserPage.keyboard.press('Space');
    await expect(announcer).toHaveText(/picked up\.$/);
    for (let i = 0; i < steps; i++) await browserPage.keyboard.press('ArrowRight');
    await browserPage.keyboard.press('Space');
    await expect(announcer).toHaveText(/dropped\.$/);
  };

  // Word bank: the right word's only target is the blank.
  const [right] = bank.question.words.map((word) => word.object);
  await keyDrop(right!, 1);
  await submit(browserPage, bank.question);
  await expect(position(browserPage)).toHaveText('Slide 2 of 4');

  // Matching: item i's targets are the pairs' targets in order, so its own is i + 1 stops on.
  for (const [i, pair] of matching.question.pairs.entries()) await keyDrop(pair.item, i + 1);
  await submit(browserPage, matching.question);
  await expect(position(browserPage)).toHaveText('Slide 3 of 4');

  // Sequence: each step goes onto whichever tile stands in its own place now (where its
  // tile is in the slide; its targets are the other tiles, in order), which swaps the two.
  const tiles = sequence.question.steps.map((step) => step.object);
  for (const id of tiles) {
    const place = await onScreen(browserPage, middle(sequence.slide, id));
    const distances = await Promise.all(
      tiles.map(async (each) => {
        const at = await middleShown(browserPage, each);
        return Math.hypot(at.x - place.x, at.y - place.y);
      }),
    );
    const there = tiles[distances.indexOf(Math.min(...distances))]!;
    if (there === id) continue;
    await keyDrop(id, tiles.filter((each) => each !== id).indexOf(there) + 1);
  }
  await submit(browserPage, sequence.question);
  await expect(position(browserPage)).toHaveText('Slide 4 of 4');
  expect(await results()).toEqual(['correct', 'correct', 'correct']);
});

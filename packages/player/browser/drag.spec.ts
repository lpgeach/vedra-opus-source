import {
  createEmptyProject,
  createId,
  createScene,
  createShapeObject,
  createSlide,
  createTextObject,
} from '@vedraopus/model';
import type { Project, TriggerEvent } from '@vedraopus/model';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Dragging objects outside questions, and intersections (docs/briefs/P9.7-drag-intersections.md). */

const dist = join(import.meta.dirname, '../dist');

function page(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vedraopus-player-drag-'));
  cpSync(join(dist, 'player.js'), join(dir, 'player.js'));
  cpSync(join(dist, 'player.css'), join(dir, 'player.css'));
  writeFileSync(
    join(dir, 'index.html'),
    `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="player.css">
<style>html,body{margin:0;height:100%}#app{width:100vw;height:100vh}</style></head>
<body><div id="app"></div><script src="player.js"></script></body></html>`,
  );
  return pathToFileURL(join(dir, 'index.html')).href;
}

/**
 * A Card (200 × 120 at 100,100) the learner can drag, a Bin (300 × 300 at
 * 800,100) with a Drag Over state, and a Note whose text each trigger sets.
 */
function course(returnToStart: boolean, events: [TriggerEvent['type'], string][]) {
  const project: Project = createEmptyProject('Dragging');
  project.variables.push({ id: createId('var'), name: 'Said', type: 'text', default: '' });
  const slide = createSlide('One');
  const card = createShapeObject(
    { kind: 'rect' },
    { x: 100, y: 100, width: 200, height: 120 },
    'Card',
  );
  card.drag = { returnToStart };
  const bin = createShapeObject(
    { kind: 'rect' },
    { x: 800, y: 100, width: 300, height: 300 },
    'Bin',
  );
  bin.states.push({ id: 'dragOver', name: 'Drag Over', overrides: {} });
  const note = createTextObject('%Said%', { x: 100, y: 600, width: 600, height: 60 }, 'Note');
  slide.baseLayer.objects.push(note, bin, card);
  for (const [type, words] of events) {
    const event = (
      type === 'intersects' || type === 'stopsIntersecting'
        ? { type, object: card.id, other: bin.id }
        : { type, object: card.id, target: bin.id }
    ) as TriggerEvent;
    slide.triggers.push({
      id: createId('trigger'),
      owner: { kind: 'slide', id: slide.id },
      event,
      action: {
        type: 'setVariable',
        variable: project.variables[0]!.id,
        operator: 'append',
        operand: { kind: 'literal', value: `${words} ` },
      },
      conditions: null,
      otherwise: null,
      enabled: true,
    });
  }
  project.scenes = [{ ...createScene(), slides: [slide] }];
  return { project, card, bin, note };
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
const object = (browserPage: Page, id: string) =>
  browserPage.locator(`.vo-player-stage [data-object-id="${id}"]`).first();

async function middleOf(browserPage: Page, id: string) {
  const box = (await object(browserPage, id).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('an object dragged onto another stays there, and its "dropped on" trigger runs', async ({
  page: browserPage,
}) => {
  const { project, card, bin, note } = course(false, [['droppedOn', 'dropped']]);
  await mount(browserPage, project);
  const target = await middleOf(browserPage, bin.id);
  const from = await middleOf(browserPage, card.id);
  await browserPage.mouse.move(from.x, from.y);
  await browserPage.mouse.down();
  await browserPage.mouse.move(target.x, target.y, { steps: 10 });
  await expect(object(browserPage, bin.id)).toHaveAttribute('data-state', 'dragOver');
  await browserPage.mouse.up();
  await expect(object(browserPage, bin.id)).toHaveAttribute('data-state', 'normal');
  await expect(object(browserPage, note.id)).toContainText('dropped');
  // It stays where it was let go: its middle is the Bin's.
  const now = await middleOf(browserPage, card.id);
  expect(Math.abs(now.x - target.x)).toBeLessThan(3);
  expect(Math.abs(now.y - target.y)).toBeLessThan(3);
});

test('an object that goes back after it is dropped returns to where it started', async ({
  page: browserPage,
}) => {
  const { project, card, bin, note } = course(true, [['droppedOn', 'dropped']]);
  await mount(browserPage, project);
  const from = await middleOf(browserPage, card.id);
  const target = await middleOf(browserPage, bin.id);
  await browserPage.mouse.move(from.x, from.y);
  await browserPage.mouse.down();
  await browserPage.mouse.move(target.x, target.y, { steps: 10 });
  await browserPage.mouse.up();
  await expect(object(browserPage, note.id)).toContainText('dropped');
  const now = await middleOf(browserPage, card.id);
  expect(Math.abs(now.x - from.x)).toBeLessThan(3);
  expect(Math.abs(now.y - from.y)).toBeLessThan(3);
});

test('"intersects" runs while the object is still being dragged, once, and "stops" when it leaves', async ({
  page: browserPage,
}) => {
  const { project, card, bin, note } = course(false, [
    ['intersects', 'met'],
    ['stopsIntersecting', 'parted'],
  ]);
  await mount(browserPage, project);
  const from = await middleOf(browserPage, card.id);
  const bin0 = (await object(browserPage, bin.id).boundingBox())!;
  const card0 = (await object(browserPage, card.id).boundingBox())!;
  await browserPage.mouse.move(from.x, from.y);
  await browserPage.mouse.down();
  // Far enough that the Card's right edge passes the Bin's left edge.
  const across = bin0.x - (card0.x + card0.width) + 20;
  await browserPage.mouse.move(from.x + across, from.y, { steps: 10 });
  await expect(object(browserPage, note.id)).toHaveText('met');
  await browserPage.mouse.move(from.x + across + 10, from.y, { steps: 3 });
  await browserPage.mouse.move(from.x, from.y, { steps: 10 });
  await expect(object(browserPage, note.id)).toHaveText('met parted');
  await browserPage.mouse.up();
  await expect(object(browserPage, note.id)).toHaveText('met parted');
});

// ---------------------------------------------------------- by keyboard (P10.1)

test('by keyboard: Space picks the object up, an arrow moves it over its target, Space drops it', async ({
  page: browserPage,
}) => {
  const { project, card, bin, note } = course(false, [['droppedOn', 'dropped']]);
  await mount(browserPage, project);
  const stage = browserPage.locator('.vo-player-stage');
  const cardButton = stage.getByRole('button', { name: 'Card' });
  await expect(cardButton).toHaveAttribute('tabindex', '0');
  await cardButton.focus();
  await browserPage.keyboard.press('Space');
  const announcer = browserPage.locator('.vo-player-announcer');
  await expect(announcer).toHaveText('Card picked up.');
  await browserPage.keyboard.press('ArrowRight');
  await expect(announcer).toHaveText('Over Bin.');
  await expect(object(browserPage, bin.id)).toHaveAttribute('data-state', 'dragOver');
  await browserPage.keyboard.press('Space');
  await expect(object(browserPage, note.id)).toContainText('dropped');
  await expect(announcer).toHaveText('Card dropped.');
  // It stays where it was dropped, on the Bin's middle, and keeps the focus.
  const now = await middleOf(browserPage, card.id);
  const target = await middleOf(browserPage, bin.id);
  expect(Math.abs(now.x - target.x)).toBeLessThan(3);
  await expect(cardButton).toBeFocused();
});

test('by keyboard: with no targets the arrows move it in steps, and Escape puts it back', async ({
  page: browserPage,
}) => {
  const { project, card } = course(false, []);
  await mount(browserPage, project);
  const cardButton = browserPage.locator('.vo-player-stage').getByRole('button', { name: 'Card' });
  const start = await middleOf(browserPage, card.id);
  await cardButton.focus();
  await browserPage.keyboard.press('Enter');
  for (let i = 0; i < 5; i++) await browserPage.keyboard.press('ArrowRight');
  await browserPage.keyboard.press('Shift+ArrowDown');
  await browserPage.keyboard.press('Escape');
  const back = await middleOf(browserPage, card.id);
  expect(Math.abs(back.x - start.x)).toBeLessThan(2);
  // Again, and dropped: 50 across and 1 down, in stage pixels.
  await browserPage.keyboard.press('Enter');
  for (let i = 0; i < 5; i++) await browserPage.keyboard.press('ArrowRight');
  await browserPage.keyboard.press('Shift+ArrowDown');
  await browserPage.keyboard.press('Space');
  const moved = await middleOf(browserPage, card.id);
  const scale = (await object(browserPage, card.id).boundingBox())!.width / 200;
  expect((moved.x - start.x) / scale).toBeCloseTo(50, 0);
  expect((moved.y - start.y) / scale).toBeCloseTo(1, 0);
  // The keys did not change slides.
  await expect(browserPage.locator('.vo-player-position')).toHaveText('Slide 1 of 1');
});

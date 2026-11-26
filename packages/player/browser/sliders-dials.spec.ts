import {
  createDialObject,
  createEmptyProject,
  createGroupObject,
  createId,
  createScene,
  createSlide,
  createSliderObject,
  createTextObject,
} from '@vedraopus/model';
import type { Project } from '@vedraopus/model';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Sliders and dials (docs/briefs/P9.4-sliders-dials.md). */

const dist = join(import.meta.dirname, '../dist');

function page(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vo-player-sliders-'));
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

/**
 * A slider bound to Volume (0 to 10), a dial bound to Heat (0 to 100 in
 * fives), text showing both, and a "moves" trigger on the dial that counts.
 */
function course() {
  const project = createEmptyProject('Controls');
  const volume = { id: createId('var'), name: 'Volume', type: 'number' as const, default: 2 };
  const heat = { id: createId('var'), name: 'Heat', type: 'number' as const, default: 50 };
  const turns = { id: createId('var'), name: 'Turns', type: 'number' as const, default: 0 };
  project.variables.push(volume, heat, turns);
  const slide = createSlide('One');
  const slider = createSliderObject({ x: 100, y: 100, width: 400, height: 40 }, 'Volume');
  slider.props.variable = volume.id;
  const dial = createDialObject({ x: 100, y: 220, width: 200, height: 200 }, 'Heat');
  Object.assign(dial.props, { variable: heat.id, min: 0, max: 100, step: 5 });
  const words = createTextObject('Volume %Volume%, heat %Heat%', {
    x: 600,
    y: 100,
    width: 500,
    height: 60,
  });
  for (const object of [slider, dial, words]) {
    object.timing = { start: 0, duration: 'untilEnd' };
    slide.baseLayer.objects.push(object);
  }
  slide.triggers.push({
    id: createId('trigger'),
    owner: { kind: 'object', id: dial.id },
    event: { type: 'controlMoves', object: dial.id },
    action: {
      type: 'setVariable',
      variable: turns.id,
      operator: 'add',
      operand: { kind: 'literal', value: 1 },
    },
    conditions: null,
    otherwise: null,
    enabled: true,
  });
  project.scenes = [{ ...createScene(), slides: [slide, createSlide('Two')] }];
  return { project, words };
}

const variable = (p: Page, name: string) =>
  p.evaluate(
    (n) =>
      (
        window as unknown as { player: { engine: { getVariable(name: string): unknown } } }
      ).player.engine.getVariable(n),
    name,
  );

test('a slider moves by keys and by dragging, writing its variable and the text', async ({
  page: browserPage,
}) => {
  const { project, words } = course();
  await mount(browserPage, project);
  // In the stage: the player's own Volume control (P8.1) has the same name.
  const slider = browserPage
    .locator('.vo-player-stage')
    .getByRole('slider', { name: 'Volume', exact: true });
  await expect(slider).toHaveValue('2');
  await slider.focus();
  await browserPage.keyboard.press('ArrowRight');
  await expect.poll(() => variable(browserPage, 'Volume')).toBe(3);
  await browserPage.keyboard.press('End');
  await expect.poll(() => variable(browserPage, 'Volume')).toBe(10);
  await expect(browserPage.locator(`[data-object-id="${words.id}"]`)).toContainText('Volume 10');
  // Dragging the thumb to the far left.
  const box = (await slider.boundingBox())!;
  await browserPage.mouse.move(box.x + box.width - 5, box.y + box.height / 2);
  await browserPage.mouse.down();
  await browserPage.mouse.move(box.x + 1, box.y + box.height / 2, { steps: 5 });
  await browserPage.mouse.up();
  await expect.poll(() => variable(browserPage, 'Volume')).toBe(0);
  // The keys did not change slides.
  await expect(browserPage.locator('.vo-player-position')).toHaveText('Slide 1 of 2');
});

test('a dial turns by keys and by dragging, saying its value, and its moves trigger runs', async ({
  page: browserPage,
}) => {
  const { project, words } = course();
  await mount(browserPage, project);
  const dial = browserPage.getByRole('slider', { name: 'Heat', exact: true });
  await expect(dial).toHaveAttribute('aria-valuenow', '50');
  await expect(dial).toHaveAttribute('aria-valuemin', '0');
  await expect(dial).toHaveAttribute('aria-valuemax', '100');
  await dial.focus();
  await browserPage.keyboard.press('ArrowUp');
  await expect(dial).toHaveAttribute('aria-valuenow', '55');
  await browserPage.keyboard.press('PageDown');
  await expect(dial).toHaveAttribute('aria-valuenow', '5');
  await browserPage.keyboard.press('Home');
  await expect(dial).toHaveAttribute('aria-valuenow', '0');
  await expect.poll(() => variable(browserPage, 'Turns')).toBe(3);
  // A press at the dial's right, level with its middle: +90°, (90 + 135) / 270 × 100 ≈ 83.3, so 85.
  const box = (await dial.boundingBox())!;
  await browserPage.mouse.click(box.x + box.width - 4, box.y + box.height / 2);
  await expect.poll(() => variable(browserPage, 'Heat')).toBe(85);
  await expect(dial).toHaveAttribute('aria-valuenow', '85');
  await expect(browserPage.locator(`[data-object-id="${words.id}"]`)).toContainText('heat 85');
  await expect(browserPage.locator('.vo-player-position')).toHaveText('Slide 1 of 2');
});

test('inside a group, a slider and a dial follow their variables and still turn (the Phase 9 review)', async ({
  page: browserPage,
}) => {
  const { project } = course();
  const slide = project.scenes[0]!.slides[0]!;
  // The slider and the dial grouped together.
  const [slider, dial, ...rest] = slide.baseLayer.objects;
  slide.baseLayer.objects = [createGroupObject([slider!, dial!], 'Controls'), ...rest];
  await mount(browserPage, project);
  const stage = browserPage.locator('.vo-player-stage');
  const volume = stage.getByRole('slider', { name: 'Volume', exact: true });
  const heat = stage.getByRole('slider', { name: 'Heat', exact: true });
  await expect(volume).toHaveValue('2');
  await expect(heat).toHaveAttribute('aria-valuenow', '50');
  await browserPage.evaluate(() => {
    const player = (
      window as unknown as { player: { engine: { setVariable(n: string, v: number): void } } }
    ).player;
    player.engine.setVariable('Volume', 7);
    player.engine.setVariable('Heat', 25);
  });
  await expect(volume).toHaveValue('7');
  await expect(heat).toHaveAttribute('aria-valuenow', '25');
  await heat.focus();
  await browserPage.keyboard.press('ArrowUp');
  await expect(heat).toHaveAttribute('aria-valuenow', '30');
  await expect.poll(() => variable(browserPage, 'Heat')).toBe(30);
});

test('a dial drawn its own way turns about its pivot, by keys and by a press (B16)', async ({
  page: browserPage,
}) => {
  const { project } = course();
  const slide = project.scenes[0]!.slides[0]!;
  const dial = slide.baseLayer.objects.find((object) => object.type === 'dial')!;
  if (dial.type !== 'dial') return;
  // A needle 40 × 200 about a pivot 0.75 of the way down, turning from -45° to 45° over 0 to
  // 100, the whole dial upside down: straight down on the screen is straight up for it.
  dial.frame = { x: 400, y: 250, width: 40, height: 200, rotation: 180 };
  Object.assign(dial.props, { step: 1 });
  dial.props.look = {
    pointer: 'M0.5 0L0.1 0.75L0.5 1L0.9 0.75Z',
    pivot: { x: 0.5, y: 0.75 },
    from: -45,
    to: 45,
    face: null,
  };
  await mount(browserPage, project);
  const heat = browserPage.locator('.vo-player-stage').getByRole('slider', { name: 'Heat' });
  await expect(heat).toHaveAttribute('aria-valuenow', '50');
  const pointer = heat.locator('.vo-dial-pointer');
  // At 50, halfway: no turn, about the pivot (20, 150).
  await expect(pointer).toHaveAttribute('transform', 'rotate(0 20 150)');
  await heat.focus();
  await browserPage.keyboard.press('End');
  await expect(pointer).toHaveAttribute('transform', 'rotate(45 20 150)');
  await expect.poll(() => variable(browserPage, 'Heat')).toBe(100);
  // A press straight below the pivot on the screen: straight up for the dial, its middle.
  // Far from the pivot (still on the dial), so a fraction of a pixel in where a browser puts
  // the pivot moves the angle too little to change the value (WebKit, CI).
  const pivot = (await heat.locator('.vo-dial-pivot').boundingBox())!;
  const [px, py] = [pivot.x + pivot.width / 2, pivot.y + pivot.height / 2];
  await browserPage.mouse.click(px, py + 140);
  await expect.poll(() => variable(browserPage, 'Heat')).toBe(50);
  // To its right on the screen, still on the dial: its left, past its range, so its least.
  await browserPage.mouse.click(px + 15, py);
  await expect.poll(() => variable(browserPage, 'Heat')).toBe(0);
});

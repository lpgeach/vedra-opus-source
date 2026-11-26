import {
  createEmptyProject,
  createId,
  createLayer,
  createScene,
  createShapeObject,
  createSlide,
  createTransition,
} from '@vedraopus/model';
import type { Project } from '@vedraopus/model';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dist = join(import.meta.dirname, '../dist');

function page(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vedraopus-player-transitions-'));
  cpSync(join(dist, 'player.js'), join(dir, 'player.js'));
  cpSync(join(dist, 'player.css'), join(dir, 'player.css'));
  writeFileSync(
    join(dir, 'index.html'),
    `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="player.css">
<style>html,body{margin:0;height:100%}#app{width:960px;height:600px}</style></head>
<body><div id="app"></div><script src="player.js"></script></body></html>`,
  );
  return pathToFileURL(join(dir, 'index.html')).href;
}

/** Three slides: the second fades in (1 s), the third is pushed in from the right (1 s). */
function course(): Project {
  const project = createEmptyProject('Transitions');
  const slides = [createSlide('One'), createSlide('Two'), createSlide('Three')];
  slides[1]!.properties.transition = createTransition('fade', 1);
  slides[2]!.properties.transition = { ...createTransition('push', 1), direction: 'right' };
  for (const slide of slides) {
    slide.baseLayer.objects.push(
      createShapeObject({ kind: 'rect' }, { x: 380, y: 200, width: 200, height: 140 }),
    );
  }
  project.scenes = [{ ...createScene(), slides }];
  return project;
}

async function mount(browserPage: Page, project: Project) {
  await browserPage.goto(page());
  await browserPage.evaluate((data) => {
    const w = window as unknown as Record<string, unknown>;
    w['player'] = (
      w['VedraOpusPlayer'] as { mountPlayer: (...args: unknown[]) => unknown }
    ).mountPlayer(document.getElementById('app'), data, { autoStart: false, clock: () => 0 });
  }, project);
}
const tick = (browserPage: Page, ms: number) =>
  browserPage.evaluate(
    (now) => (window as unknown as { player: { tick(n: number): void } }).player.tick(now),
    ms,
  );
const incoming = (browserPage: Page) =>
  browserPage.locator('.vo-player-slide:not(.vo-player-leaving)');
const leaving = (browserPage: Page) => browserPage.locator('.vo-player-leaving');
const opacity = (target: ReturnType<Page['locator']>) =>
  target.evaluate((each) => Number(getComputedStyle(each).opacity));
const left = (target: ReturnType<Page['locator']>) =>
  target.evaluate((each) => each.getBoundingClientRect().left);

test('a fade and a push between slides, the old slide drawn until they end', async ({
  page: browserPage,
}) => {
  await mount(browserPage, course());
  await tick(browserPage, 0);
  await browserPage.getByRole('button', { name: 'Next' }).click();
  await tick(browserPage, 500);
  await expect(browserPage.locator('.vo-player-position')).toHaveText('Slide 2 of 3');
  // Half way: the new slide part faded in over the old, which is still there.
  const half = await opacity(incoming(browserPage));
  expect(half).toBeGreaterThan(0);
  expect(half).toBeLessThan(1);
  await expect(leaving(browserPage)).toHaveCount(1);
  await tick(browserPage, 1100);
  await expect(leaving(browserPage)).toHaveCount(0);
  expect(await opacity(incoming(browserPage))).toBe(1);

  const stageLeft = await left(browserPage.getByTestId('player-stage'));
  await browserPage.getByRole('button', { name: 'Next' }).click();
  await tick(browserPage, 1600);
  // Pushed in from the right: the new slide is right of the stage's edge, the old left of it.
  expect(await left(incoming(browserPage))).toBeGreaterThan(stageLeft + 10);
  expect(await left(leaving(browserPage))).toBeLessThan(stageLeft - 10);
  await tick(browserPage, 2200);
  await expect(leaving(browserPage)).toHaveCount(0);
  expect(await left(incoming(browserPage))).toBeCloseTo(stageLeft, 0);
});

test('a layer fades in, and out while taking no clicks', async ({ page: browserPage }) => {
  const project = createEmptyProject('Layer');
  const slide = project.scenes[0]!.slides[0]!;
  const popUp = createLayer('Pop-up');
  popUp.properties.transition = createTransition('fade', 1);
  const box = createShapeObject({ kind: 'rect' }, { x: 100, y: 100, width: 300, height: 200 });
  popUp.objects.push(box);
  slide.layers.push(popUp);
  project.variables.push({ id: 'var_hits', name: 'Hits', type: 'number', default: 0 });
  slide.triggers.push({
    id: createId('trigger'),
    owner: { kind: 'object', id: box.id },
    event: { type: 'click', object: box.id },
    action: {
      type: 'setVariable',
      variable: 'var_hits',
      operator: 'add',
      operand: { kind: 'literal', value: 1 },
    },
    conditions: null,
    otherwise: null,
    enabled: true,
  });
  await mount(browserPage, project);
  const layer = browserPage.locator(`[data-layer-id="${popUp.id}"]`);
  const engine = (call: 'showLayer' | 'hideLayer') =>
    browserPage.evaluate(
      ([name, id]) =>
        (window as unknown as { player: { engine: Record<string, (id: string) => void> } }).player
          .engine[name]!(id),
      [call, popUp.id] as const,
    );
  const hits = () =>
    browserPage.evaluate(() =>
      (
        window as unknown as { player: { engine: { getVariable(n: string): unknown } } }
      ).player.engine.getVariable('Hits'),
    );

  await tick(browserPage, 0);
  await engine('showLayer');
  await tick(browserPage, 500);
  const fadingIn = await opacity(layer);
  expect(fadingIn).toBeGreaterThan(0);
  expect(fadingIn).toBeLessThan(1);
  await tick(browserPage, 1200);
  expect(await opacity(layer)).toBe(1);
  // The layer is the stage's size, so clipping and scaling it work about its middle.
  const stageBox = (await browserPage.getByTestId('player-stage').boundingBox())!;
  const layerBox = (await layer.boundingBox())!;
  expect(layerBox.width).toBeCloseTo(stageBox.width, 0);
  expect(layerBox.height).toBeCloseTo(stageBox.height, 0);
  await browserPage.locator(`[data-object-id="${box.id}"]`).click();
  expect(await hits()).toBe(1);

  await engine('hideLayer');
  await tick(browserPage, 1700);
  // Still drawn on its way out, but a click does nothing.
  await expect(browserPage.locator(`[data-object-id="${box.id}"]`)).toBeVisible();
  const fadingOut = await opacity(layer);
  expect(fadingOut).toBeGreaterThan(0);
  expect(fadingOut).toBeLessThan(1);
  await browserPage.locator(`[data-object-id="${box.id}"]`).click({ force: true });
  expect(await hits()).toBe(1);
  await tick(browserPage, 2300);
  await expect(browserPage.locator(`[data-object-id="${box.id}"]`)).toBeHidden();
});

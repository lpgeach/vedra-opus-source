import {
  createEffect,
  createEmptyProject,
  createId,
  createMotionPath,
  createScene,
  createShapeObject,
  createSlide,
  createTransition,
  createZoomRegion,
} from '@vedraopus/model';
import type { MotionPath, Project } from '@vedraopus/model';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dist = join(import.meta.dirname, '../dist');

function page(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vedraopus-player-calm-'));
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

/**
 * Slide 1: a box flying in from the left (1 s), a box running a 2 s line of
 * 200 from the start, and a zoom region on the middle half from 1 s to 3 s.
 * Slide 2 is pushed in (1 s).
 */
function course() {
  const project: Project = createEmptyProject('Calm');
  project.stage = { width: 960, height: 540 };
  const one = createSlide('One');
  one.baseLayer.timeline.duration = 10;
  const flying = createShapeObject({ kind: 'rect' }, { x: 500, y: 60, width: 100, height: 60 });
  flying.animations.entrance = { ...createEffect('fly', 1), direction: 'left' };
  const moving = createShapeObject({ kind: 'ellipse' }, { x: 60, y: 300, width: 80, height: 80 });
  const path: MotionPath = {
    ...createMotionPath('line', 'Across', [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ]),
    easing: 'linear',
  };
  moving.animations.motionPaths = [path];
  const region = {
    ...createZoomRegion(project.stage, { x: 240, y: 135, width: 480, height: 270 }),
    timing: { start: 1, duration: 2 },
  };
  one.baseLayer.objects.push(flying, moving, region);
  one.triggers.push({
    id: createId('trigger'),
    owner: { kind: 'object', id: moving.id },
    event: { type: 'timelineStart', layer: one.baseLayer.id },
    action: { type: 'moveAlongPath', object: moving.id, path: path.id },
    conditions: null,
    otherwise: null,
    enabled: true,
  });
  const two = createSlide('Two');
  two.properties.transition = { ...createTransition('push', 1), direction: 'right' };
  project.scenes = [{ ...createScene(), slides: [one, two] }];
  return { project, flying, moving };
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
/** Where an object is drawn, in stage units from the stage's corner. */
async function at(browserPage: Page, id: string) {
  const stage = browserPage.getByTestId('player-stage');
  const scale = Number(await stage.getAttribute('data-scale'));
  const corner = (await stage.boundingBox())!;
  const box = (await browserPage.locator(`[data-object-id="${id}"]`).boundingBox())!;
  return { x: (box.x - corner.x) / scale, y: (box.y - corner.y) / scale };
}
const opacity = (browserPage: Page, selector: string) =>
  browserPage.locator(selector).evaluate((each) => Number(getComputedStyle(each).opacity));

test('with the learner’s reduced-motion setting, things fade and cut instead of moving', async ({
  page: browserPage,
}) => {
  await browserPage.emulateMedia({ reducedMotion: 'reduce' });
  const { project, flying, moving } = course();
  await mount(browserPage, project);
  await expect(browserPage.locator('.vo-player')).toHaveAttribute('data-reduced-motion', 'true');

  await tick(browserPage, 0);
  // The fly-in starts in its place, unseen; the path's object is at the path's end already.
  expect((await at(browserPage, flying.id)).x).toBeCloseTo(500, 0);
  expect(await opacity(browserPage, `[data-object-id="${flying.id}"]`)).toBe(0);
  expect((await at(browserPage, moving.id)).x).toBeCloseTo(260, 0);

  await tick(browserPage, 500);
  // Half way: fading in, still in its place.
  expect((await at(browserPage, flying.id)).x).toBeCloseTo(500, 0);
  const half = await opacity(browserPage, `[data-object-id="${flying.id}"]`);
  expect(half).toBeGreaterThan(0);
  expect(half).toBeLessThan(1);

  // 1.1 s: the zoom region has just started, and the view is already all the way in (×2).
  await tick(browserPage, 1100);
  const slide = browserPage.locator('.vo-player-slide');
  expect(Number(await slide.evaluate((each: HTMLElement) => each.style.scale))).toBeCloseTo(2, 5);

  // The push to slide 2 is a fade: nothing slides.
  await browserPage.getByRole('button', { name: 'Next' }).click();
  await tick(browserPage, 1600);
  const stageLeft = (await browserPage.getByTestId('player-stage').boundingBox())!.x;
  const incoming = browserPage.locator('.vo-player-slide:not(.vo-player-leaving)');
  expect((await incoming.boundingBox())!.x).toBeCloseTo(stageLeft, 0);
  // The slide left stays as it was (still zoomed, as it was left), with nothing moving it.
  expect(
    await browserPage.locator('.vo-player-leaving').evaluate((each) => each.getAnimations().length),
  ).toBe(0);
  const fading = await incoming.evaluate((each) => Number(getComputedStyle(each).opacity));
  expect(fading).toBeGreaterThan(0);
  expect(fading).toBeLessThan(1);
});

test('without it, the same course moves', async ({ page: browserPage }) => {
  await browserPage.emulateMedia({ reducedMotion: 'no-preference' });
  const { project, flying, moving } = course();
  await mount(browserPage, project);
  await expect(browserPage.locator('.vo-player')).not.toHaveAttribute('data-reduced-motion');
  await tick(browserPage, 0);
  await tick(browserPage, 500);
  expect((await at(browserPage, flying.id)).x).toBeLessThan(450);
  // 0.5 s of 2 along 200.
  expect((await at(browserPage, moving.id)).x).toBeCloseTo(110, 0);
});

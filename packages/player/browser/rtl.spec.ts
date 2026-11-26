import { createEmptyProject, createScene, createSlide, createTextObject } from '@vedraopus/model';
import type { Project } from '@vedraopus/model';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Right to left (docs/briefs/P10.3-translation.md, part C): a course in Arabic
 * runs its frame right to left; every paragraph runs the way its own words do,
 * in any course; the slide itself is not mirrored.
 */

const dist = join(import.meta.dirname, '../dist');

function page(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vedraopus-player-rtl-'));
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

/** Two slides: an Arabic paragraph at the left of the slide, an English one below it. */
function course(language: string): { project: Project; arabic: string; english: string } {
  const project = createEmptyProject('Course');
  project.player.labels.language = language;
  const first = createSlide('One');
  const arabic = createTextObject('مرحبا بكم في الدورة', { x: 40, y: 40, width: 600, height: 60 });
  const english = createTextObject('Welcome to the course', {
    x: 40,
    y: 200,
    width: 600,
    height: 60,
  });
  first.baseLayer.objects.push(arabic, english);
  project.scenes = [{ ...createScene(), slides: [first, createSlide('Two')] }];
  return { project, arabic: arabic.id, english: english.id };
}

const direction = (browserPage: Page, id: string) =>
  browserPage
    .locator(`.vo-player-stage [data-object-id="${id}"] p`)
    .first()
    .evaluate((element) => getComputedStyle(element).direction);

test('an Arabic course runs its frame right to left, each paragraph its own way, and the slide is not mirrored', async ({
  page: browserPage,
}) => {
  const { project, arabic, english } = course('ar');
  await mount(browserPage, project);
  const root = browserPage.locator('.vo-player');
  await expect(root).toHaveAttribute('dir', 'rtl');
  await expect(root).toHaveAttribute('lang', 'ar');
  // The footer runs right to left: Previous is on the right, Next on the left.
  const previous = (await browserPage.locator('.vo-player-previous').boundingBox())!;
  const next = (await browserPage.locator('.vo-player-next').boundingBox())!;
  expect(previous.x).toBeGreaterThan(next.x);
  // Each paragraph takes its own words' direction.
  expect(await direction(browserPage, arabic)).toBe('rtl');
  expect(await direction(browserPage, english)).toBe('ltr');
  // Not mirrored: the objects stay where the author put them, at the left of the slide.
  const stage = (await browserPage.locator('.vo-player-stage').boundingBox())!;
  const box = (await browserPage.locator(`[data-object-id="${english}"]`).boundingBox())!;
  expect(box.x - stage.x).toBeLessThan(stage.width / 2);
});

test('an English course runs left to right, with Arabic words still right to left', async ({
  page: browserPage,
}) => {
  const { project, arabic, english } = course('en');
  await mount(browserPage, project);
  await expect(browserPage.locator('.vo-player')).toHaveAttribute('dir', 'ltr');
  const previous = (await browserPage.locator('.vo-player-previous').boundingBox())!;
  const next = (await browserPage.locator('.vo-player-next').boundingBox())!;
  expect(previous.x).toBeLessThan(next.x);
  expect(await direction(browserPage, arabic)).toBe('rtl');
  expect(await direction(browserPage, english)).toBe('ltr');
});

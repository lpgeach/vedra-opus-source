import {
  createAudioObject,
  createEmptyProject,
  createQuestionSlide,
  createScene,
  createSlide,
} from '@vedraopus/model';
import type { Project } from '@vedraopus/model';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The player frame (docs/briefs/P8.1-player-frame.md). */

const dist = join(import.meta.dirname, '../dist');

/** A page for `project`, with `files` (by path) beside the player. */
function page(files: Record<string, Buffer> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'vedraopus-player-frame-'));
  mkdirSync(join(dir, 'assets'));
  for (const [path, bytes] of Object.entries(files)) writeFileSync(join(dir, path), bytes);
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

async function mount(browserPage: Page, project: Project, url = page()) {
  await browserPage.goto(url);
  await browserPage.evaluate((data) => {
    const w = window as unknown as Record<string, unknown>;
    w['player'] = (
      w['VedraOpusPlayer'] as { mountPlayer: (...args: unknown[]) => unknown }
    ).mountPlayer(document.getElementById('app'), data, {});
  }, project);
}

/** Three slides, the second a multiple-choice question that branches at once. */
function course(change: (project: Project) => void = () => {}) {
  const project = createEmptyProject('Frame');
  const quiz = createQuestionSlide('multipleChoice', project.stage);
  quiz.question!.feedback.by = 'none';
  quiz.question!.required = false;
  quiz.title = 'Quiz';
  project.scenes = [
    { ...createScene('Part one'), slides: [createSlide('Intro'), quiz, createSlide('End')] },
  ];
  change(project);
  return { project, quiz };
}

const position = (p: Page) => p.locator('.vo-player-position');
const menu = (p: Page) => p.getByRole('navigation', { name: 'Course menu' });
const entry = (p: Page, title: string) => menu(p).getByRole('button', { name: title, exact: true });

test('the menu jumps where navigation lets it: free anywhere, restricted where seen, locked nowhere', async ({
  page: browserPage,
}) => {
  const free = course();
  await mount(browserPage, free.project);
  await expect(menu(browserPage)).toBeHidden();
  await browserPage.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(entry(browserPage, 'Intro')).toHaveAttribute('aria-current', 'page');
  await entry(browserPage, 'End').click();
  await expect(position(browserPage)).toHaveText('Slide 3 of 3');
  await expect(menu(browserPage)).toBeHidden();

  const restricted = course((project) => {
    project.player.menu.navigation = 'restricted';
  });
  await mount(browserPage, restricted.project);
  await browserPage.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(entry(browserPage, 'Quiz')).toBeDisabled();
  await expect(entry(browserPage, 'End')).toBeDisabled();
  await browserPage.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(entry(browserPage, 'Intro')).toBeEnabled();
  await expect(entry(browserPage, 'End')).toBeDisabled();
  await entry(browserPage, 'Intro').click();
  await expect(position(browserPage)).toHaveText('Slide 1 of 3');

  const locked = course((project) => {
    project.player.menu.navigation = 'locked';
  });
  await mount(browserPage, locked.project);
  await browserPage.getByRole('button', { name: 'Menu', exact: true }).click();
  for (const title of ['Intro', 'Quiz', 'End'])
    await expect(entry(browserPage, title)).toBeDisabled();
});

test('a draggable seekbar shows the time and seeks; the player’s Submit submits', async ({
  page: browserPage,
}) => {
  const { project } = course((p) => {
    p.player.controls.seekbar = 'drag';
    p.player.controls.submit = true;
  });
  await mount(browserPage, project);
  const seek = browserPage.getByRole('slider', { name: 'Slide time', exact: true });
  await expect(seek).toBeEnabled();
  await expect(seek).toHaveAttribute('max', '5');
  await expect.poll(async () => Number(await seek.inputValue())).toBeGreaterThan(0);
  await seek.fill('4');
  const playhead = () =>
    browserPage.evaluate(
      () =>
        (
          window as unknown as {
            player: { engine: { getView(): { layers: { playhead: number }[] } } };
          }
        ).player.engine.getView().layers[0]!.playhead,
    );
  expect(await playhead()).toBeGreaterThanOrEqual(4);
  // Submit shows on the question slide only.
  const submit = browserPage.locator('.vo-player-submit');
  await expect(submit).toBeHidden();
  await browserPage.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(submit).toBeVisible();
  await browserPage.getByRole('radio', { name: 'First answer', exact: true }).click();
  await submit.click();
  await expect(position(browserPage)).toHaveText('Slide 3 of 3');
});

test('the accessibility panel sets the caption size; full screen; and controls turned off are absent', async ({
  page: browserPage,
}) => {
  const { project } = course();
  await mount(browserPage, project);
  await browserPage.getByRole('button', { name: 'Accessibility', exact: true }).click();
  const panel = browserPage.getByRole('dialog', { name: 'Accessibility' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('list', { name: 'Keyboard shortcuts' })).toContainText(
    'Right arrow',
  );
  await panel.getByLabel('Caption size', { exact: true }).selectOption('large');
  await expect(browserPage.locator('.vo-player')).toHaveAttribute('data-caption-size', 'large');
  await panel.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(panel).toBeHidden();
  // The seekbar is there, view only.
  await expect(browserPage.getByRole('slider', { name: 'Slide time', exact: true })).toBeDisabled();
  await browserPage.getByRole('button', { name: 'Full screen', exact: true }).click();
  await expect
    .poll(() => browserPage.evaluate(() => document.fullscreenElement?.className ?? ''))
    .toContain('vo-player');

  const bare = course((p) => {
    p.player.title = false;
    p.player.menu.show = false;
    p.player.controls = {
      seekbar: 'off',
      submit: false,
      volume: false,
      captions: false,
      speed: false,
      fullscreen: false,
      accessibility: false,
    };
  });
  await mount(browserPage, bare.project);
  for (const selector of [
    '.vo-player-title',
    '.vo-player-menu-button',
    '.vo-player-seek',
    '.vo-player-volume',
    '.vo-player-speed',
    '.vo-player-fullscreen',
    '.vo-player-a11y-button',
  ]) {
    await expect(browserPage.locator(selector)).toHaveCount(0);
  }
  await expect(position(browserPage)).toHaveText('Slide 1 of 3');
});

/** A mono 16-bit WAV of a quiet tone. */
function wav(seconds: number, rate = 8000): Buffer {
  const samples = Math.round(seconds * rate);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 6000), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'latin1');
  header.write('fmt ', 12, 'latin1');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'latin1');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** A 1×1 PNG, for the logo. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('volume and speed reach the sound, and the logo shows', async ({ page: browserPage }) => {
  const bytes = wav(6);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const logoHash = createHash('sha256').update(PNG).digest('hex');
  const project = createEmptyProject('Sound');
  project.assets[hash] = {
    kind: 'audio',
    fileName: 'tone.wav',
    ext: 'wav',
    mimeType: 'audio/wav',
    byteLength: bytes.length,
    duration: 6,
  };
  project.assets[logoHash] = {
    kind: 'image',
    fileName: 'logo.png',
    ext: 'png',
    mimeType: 'image/png',
    byteLength: PNG.length,
  };
  project.player.logo = logoHash;
  const slide = createSlide('One');
  slide.baseLayer.timeline.duration = 8;
  const audio = createAudioObject(hash, 6, {}, 'Narration');
  slide.baseLayer.objects.push(audio);
  project.scenes = [{ ...createScene(), slides: [slide] }];
  await mount(
    browserPage,
    project,
    page({ [`assets/${hash}.wav`]: bytes, [`assets/${logoHash}.png`]: PNG }),
  );
  await expect(browserPage.locator('.vo-player-logo')).toHaveAttribute(
    'src',
    `assets/${logoHash}.png`,
  );
  const media = (property: 'volume' | 'playbackRate') =>
    browserPage.evaluate(
      ([id, key]) =>
        (document.querySelector(`[data-media-id="${id}"]`) as HTMLMediaElement)[key as 'volume'],
      [audio.id, property] as const,
    );
  // WebKit keeps volume as a 32-bit float.
  await expect.poll(async () => Math.abs((await media('volume')) - 1)).toBeLessThan(0.001);
  await browserPage.getByRole('slider', { name: 'Volume', exact: true }).fill('0.5');
  await expect.poll(async () => Math.abs((await media('volume')) - 0.5)).toBeLessThan(0.001);
  await browserPage.getByLabel('Playback speed', { exact: true }).selectOption('2');
  await expect.poll(() => media('playbackRate')).toBe(2);
});

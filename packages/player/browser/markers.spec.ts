import {
  createEmptyProject,
  createHotspotObject,
  createId,
  createMarkerObject,
  createSlide,
} from '@vedraopus/model';
import type { Project, Trigger } from '@vedraopus/model';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Hotspots and markers in a course (docs/briefs/P9.1-hotspots-markers.md). */

const dist = join(import.meta.dirname, '../dist');
const image = 'a'.repeat(64);
const sound = 'b'.repeat(64);
const clicks = 'clicks';

const pictureBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/nY8AAAAASUVORK5CYII=',
  'base64',
);

/** A short WAV, so a marker's sound has something real to play. */
function wav(): Buffer {
  const rate = 8000;
  const samples = rate / 4;
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

function page(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vedraopus-player-markers-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', `${image}.png`), pictureBytes);
  writeFileSync(join(dir, 'assets', `${sound}.wav`), wav());
  cpSync(join(dist, 'player.js'), join(dir, 'player.js'));
  cpSync(join(dist, 'player.css'), join(dir, 'player.css'));
  writeFileSync(
    join(dir, 'index.html'),
    `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="player.css">
<style>html,body{margin:0;height:100%}#app{width:960px;height:640px}</style></head>
<body><div id="app"></div><script src="player.js"></script></body></html>`,
  );
  return pathToFileURL(join(dir, 'index.html')).href;
}

const trigger = (objectId: string, variableId: string): Trigger => ({
  id: createId('trigger'),
  owner: { kind: 'object', id: objectId },
  event: { type: 'click', object: objectId },
  action: {
    type: 'setVariable',
    variable: variableId,
    operator: 'add',
    operand: { kind: 'literal', value: 1 },
  },
  conditions: null,
  otherwise: null,
  enabled: true,
});

function course(change: (parts: Parts) => void = () => {}) {
  interface Parts {
    project: Project;
    rect: ReturnType<typeof createHotspotObject>;
    ellipse: ReturnType<typeof createHotspotObject>;
    first: ReturnType<typeof createMarkerObject>;
    last: ReturnType<typeof createMarkerObject>;
    variableId: string;
  }
  const project = createEmptyProject('Markers');
  project.stage = { width: 960, height: 540 };
  const variableId = createId('var');
  project.variables.push({ id: variableId, name: clicks, type: 'number', default: 0 });
  project.assets = {
    [image]: {
      kind: 'image',
      fileName: 'picture.png',
      ext: 'png',
      mimeType: 'image/png',
      byteLength: pictureBytes.length,
    },
    [sound]: {
      kind: 'audio',
      fileName: 'tone.wav',
      ext: 'wav',
      mimeType: 'audio/wav',
      byteLength: wav().length,
      duration: 0.25,
    },
  };
  const slide = createSlide('One');
  const rect = createHotspotObject({ x: 40, y: 40, width: 200, height: 120 }, 'rect', 'Rectangle');
  const ellipse = createHotspotObject(
    { x: 300, y: 40, width: 200, height: 120 },
    'ellipse',
    'Oval',
  );
  const first = createMarkerObject({ x: 120, y: 220 }, 'First label');
  first.props.body = 'One line\n\nAnother line';
  first.props.media = image;
  first.props.audio = sound;
  const last = createMarkerObject({ x: 850, y: 450 }, 'Last label');
  last.props.body = first.props.body;
  last.props.media = image;
  last.props.icon = 'star';
  last.props.pulse = true;
  slide.baseLayer.objects.push(rect, ellipse, first, last);
  slide.triggers.push(trigger(rect.id, variableId), trigger(ellipse.id, variableId));
  project.scenes[0]!.slides = [slide];
  const parts = { project, rect, ellipse, first, last, variableId };
  change(parts);
  return { ...parts, url: page() };
}

async function mount(browserPage: Page, url: string, project: Project) {
  await browserPage.goto(url);
  await browserPage.evaluate((data) => {
    const w = window as unknown as Record<string, unknown>;
    w['player'] = (
      w['VedraOpusPlayer'] as { mountPlayer: (...args: unknown[]) => unknown }
    ).mountPlayer(document.getElementById('app'), data, { autoStart: false, clock: () => 0 });
  }, project);
  await tick(browserPage, 0);
}

const tick = (browserPage: Page, ms: number) =>
  browserPage.evaluate(
    (now) => (window as unknown as { player: { tick(n: number): void } }).player.tick(now),
    ms,
  );
const valueOf = (browserPage: Page, id: string) =>
  browserPage.evaluate(
    (name) =>
      Number(
        (
          window as unknown as {
            player: { engine: { getVariable(name: string): unknown } };
          }
        ).player.engine.getVariable(name),
      ),
    id,
  );
const object = (browserPage: Page, id: string) => browserPage.locator(`[data-object-id="${id}"]`);
const label = (browserPage: Page) => browserPage.locator('.vo-marker-label');

test('hotspots run their trigger with a click or Enter, and an ellipse ignores its corners', async ({
  page,
}) => {
  const { url, project, rect, ellipse } = course();
  await mount(page, url, project);
  await expect(object(page, rect.id)).toHaveAttribute('data-press', 'true');
  await expect(object(page, rect.id)).toHaveAttribute('role', 'button');

  await object(page, rect.id).click();
  expect(await valueOf(page, clicks)).toBe(1);
  await object(page, ellipse.id).focus();
  await page.keyboard.press('Enter');
  expect(await valueOf(page, clicks)).toBe(2);

  const box = (await object(page, ellipse.id).boundingBox())!;
  await page.mouse.click(box.x + 6, box.y + 6);
  expect(await valueOf(page, clicks)).toBe(2);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  expect(await valueOf(page, clicks)).toBe(3);
});

test('a marker opens and closes on a click, Escape and a press elsewhere, one label at a time', async ({
  page,
}) => {
  const { url, project, first, last } = course();
  await mount(page, url, project);
  await expect(object(page, first.id)).toHaveAttribute('aria-expanded', 'false');

  await object(page, first.id).click();
  await expect(label(page)).toHaveCount(1);
  await expect(label(page)).toHaveAttribute('data-marker-id', first.id);
  await expect(object(page, first.id)).toHaveAttribute('aria-expanded', 'true');
  await object(page, first.id).click();
  await expect(label(page)).toHaveCount(0);

  await object(page, first.id).click();
  await page.keyboard.press('Escape');
  await expect(label(page)).toHaveCount(0);

  await object(page, first.id).click();
  await page.getByTestId('player-stage').click({ position: { x: 8, y: 8 } });
  await expect(label(page)).toHaveCount(0);

  await object(page, first.id).click();
  await object(page, last.id).click();
  await expect(label(page)).toHaveCount(1);
  await expect(label(page)).toHaveAttribute('data-marker-id', last.id);
});

test('a hover marker opens when pointed at or focused, and closes when left', async ({ page }) => {
  const { url, project, first } = course(({ first: marker }) => {
    marker.props.opensOn = 'hover';
  });
  await mount(page, url, project);

  await object(page, first.id).hover();
  await expect(label(page)).toHaveCount(1);
  await page.mouse.move(5, 5);
  await expect(label(page)).toHaveCount(0);

  await object(page, first.id).focus();
  await expect(label(page)).toHaveCount(1);
  await page.locator('.vo-player').focus();
  await expect(label(page)).toHaveCount(0);
});

test('a label shows its words and picture, and stays inside the stage', async ({ page }) => {
  const { url, project, last } = course();
  await mount(page, url, project);
  await object(page, last.id).click();
  await expect(label(page).locator('h2')).toHaveText('Last label');
  await expect(label(page).locator('p')).toHaveText(['One line', 'Another line']);
  await expect(label(page).locator('img')).toHaveAttribute('src', `assets/${image}.png`);
  await expect(label(page)).toHaveAttribute('role', 'region');

  const stage = (await page.getByTestId('player-stage').boundingBox())!;
  const box = (await label(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(stage.x - 1);
  expect(box.y).toBeGreaterThanOrEqual(stage.y - 1);
  expect(box.x + box.width).toBeLessThanOrEqual(stage.x + stage.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(stage.y + stage.height + 1);
});

test('a label’s sound follows the learner’s volume and speed and stops when it closes', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as {
      markerPlayed: HTMLMediaElement[];
      markerPaused: HTMLMediaElement[];
    };
    w.markerPlayed = [];
    w.markerPaused = [];
    const play = HTMLMediaElement.prototype.play;
    const pause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      w.markerPlayed.push(this);
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement) {
      w.markerPaused.push(this);
      return pause.call(this);
    };
    void play;
  });
  const { url, project, first } = course();
  await mount(page, url, project);
  await page.getByRole('slider', { name: 'Volume' }).fill('0.5');
  await page.getByLabel('Playback speed').selectOption('2');

  await object(page, first.id).click();
  const audio = page.locator('.vo-marker-sound');
  await expect(audio).toHaveCount(1);
  await expect(audio).toHaveAttribute('src', `assets/${sound}.wav`);
  expect(await audio.evaluate((each) => (each as HTMLAudioElement).volume)).toBeCloseTo(0.5);
  expect(await audio.evaluate((each) => (each as HTMLAudioElement).playbackRate)).toBe(2);
  expect(
    await page.evaluate(() => {
      const w = window as unknown as { markerPlayed: unknown[] };
      return w.markerPlayed.length;
    }),
  ).toBe(1);

  await page.keyboard.press('Escape');
  expect(
    await page.evaluate(() => {
      const w = window as unknown as { markerPaused: unknown[] };
      return w.markerPaused.length;
    }),
  ).toBe(1);
});

test('a marker pulses, unless the learner prefers reduced motion', async ({ page }) => {
  const { url, project, last } = course();
  await mount(page, url, project);
  await expect(object(page, last.id)).toHaveAttribute('data-pulse', 'true');
  const motion = await object(page, last.id).evaluate(
    (each) => getComputedStyle(each, '::after').animationName,
  );
  expect(motion).toBe('vo-marker-pulse');
});

test('reduced motion turns the pulse off', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { url, project, last } = course();
  await mount(page, url, project);
  await expect(page.locator('.vo-player')).toHaveAttribute('data-reduced-motion', 'true');
  const motion = await object(page, last.id).evaluate(
    (each) => getComputedStyle(each, '::after').animationName,
  );
  expect(motion).toBe('none');
});

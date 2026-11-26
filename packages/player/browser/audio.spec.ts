import {
  createAudioObject,
  createButtonObject,
  createEmptyProject,
  createId,
  createScene,
  createSlide,
} from '@vedraopus/model';
import type { Project, Trigger, TriggerAction, TriggerEvent } from '@vedraopus/model';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dist = join(import.meta.dirname, '../dist');

/** A mono 16-bit WAV of a quiet 440 Hz tone, `seconds` long. */
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
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'latin1');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const trigger = (owner: Trigger['owner'], event: TriggerEvent, action: TriggerAction): Trigger => ({
  id: createId('trigger'),
  owner,
  event,
  action,
  conditions: null,
  otherwise: null,
  enabled: true,
});

/**
 * A course with one slide and one sound of `seconds`, in a page on disk. `build` sets
 * the slide up. Returns the page address and the project.
 */
function course(
  seconds: number,
  build: (s: { project: Project; audio: ReturnType<typeof createAudioObject> }) => void,
) {
  const bytes = wav(seconds);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const project = createEmptyProject('Sound');
  project.assets[hash] = {
    kind: 'audio',
    fileName: 'tone.wav',
    ext: 'wav',
    mimeType: 'audio/wav',
    byteLength: bytes.length,
    duration: seconds,
  };
  const slide = createSlide('One');
  slide.baseLayer.timeline.duration = 8;
  const audio = createAudioObject(hash, seconds, {}, 'Narration');
  slide.baseLayer.objects.push(audio);
  project.scenes = [{ ...createScene(), slides: [slide] }];
  build({ project, audio });
  const dir = mkdtempSync(join(tmpdir(), 'vedraopus-player-audio-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', `${hash}.wav`), bytes);
  cpSync(join(dist, 'player.js'), join(dir, 'player.js'));
  cpSync(join(dist, 'player.css'), join(dir, 'player.css'));
  writeFileSync(
    join(dir, 'index.html'),
    `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="player.css">
<style>html,body{margin:0;height:100%}#app{width:100%;height:100%}</style></head>
<body><div id="app"></div><script src="player.js"></script></body></html>`,
  );
  return { url: pathToFileURL(join(dir, 'index.html')).href, project };
}

async function mount(page: Page, url: string, project: Project) {
  await page.goto(url);
  await page.evaluate((data) => {
    const w = window as unknown as Record<string, unknown>;
    w['player'] = (
      w['VedraOpusPlayer'] as { mountPlayer: (...args: unknown[]) => unknown }
    ).mountPlayer(document.getElementById('app'), data, {});
  }, project);
}

type Probe = { paused: boolean; time: number; volume: number; playhead: number };
const probe = (page: Page, id: string): Promise<Probe> =>
  page.evaluate((mediaId) => {
    const element = document.querySelector<HTMLAudioElement>(`[data-media-id="${mediaId}"]`)!;
    const player = (
      window as unknown as { player: { engine: { getView(): { layers: { playhead: number }[] } } } }
    ).player;
    return {
      paused: element.paused,
      time: element.currentTime,
      volume: element.volume,
      playhead: player.engine.getView().layers[0]!.playhead,
    };
  }, id);
const variable = (page: Page, name: string) =>
  page.evaluate(
    (n) =>
      (
        window as unknown as { player: { engine: { getVariable(n: string): unknown } } }
      ).player.engine.getVariable(n),
    name,
  );
const clickObject = (page: Page, id: string) => page.locator(`[data-object-id="${id}"]`).click();

test('the timeline keeps the time the audio keeps', async ({ page }) => {
  const { url, project } = course(4, () => undefined);
  const id = project.scenes[0]!.slides[0]!.baseLayer.objects[0]!.id;
  await mount(page, url, project);
  await expect
    .poll(async () => (await probe(page, id)).time, { timeout: 5000 })
    .toBeGreaterThan(0.2);
  // Half speed: if the audio keeps time, the timeline moves at half speed too.
  await page.evaluate((mediaId) => {
    document.querySelector<HTMLAudioElement>(`[data-media-id="${mediaId}"]`)!.playbackRate = 0.5;
  }, id);
  const before = await probe(page, id);
  await page.waitForTimeout(1000);
  const after = await probe(page, id);
  const moved = after.playhead - before.playhead;
  expect(moved).toBeGreaterThan(0.25);
  expect(moved).toBeLessThan(0.75);
  // And it is where the audio is.
  expect(Math.abs(after.playhead - after.time)).toBeLessThan(0.2);
  expect(after.paused).toBe(false);
});

test('triggers pause and play the sound, and its end runs a media-completes trigger', async ({
  page,
}) => {
  let ids = { audio: '', play: '', pause: '' };
  const { url, project } = course(1, ({ project, audio }) => {
    audio.props.startOn = 'trigger';
    audio.props.volume = 0.3;
    audio.timing = { start: 0, duration: 'untilEnd' };
    const slide = project.scenes[0]!.slides[0]!;
    const play = createButtonObject('Play', { x: 40, y: 40 });
    const pause = createButtonObject('Pause', { x: 240, y: 40 });
    for (const b of [play, pause]) b.timing = { start: 0, duration: 'untilEnd' };
    slide.baseLayer.objects.push(play, pause);
    project.variables.push({ id: createId('var'), name: 'Heard', type: 'boolean', default: false });
    slide.triggers.push(
      trigger(
        { kind: 'object', id: play.id },
        { type: 'click', object: play.id },
        { type: 'playMedia', object: audio.id },
      ),
      trigger(
        { kind: 'object', id: pause.id },
        { type: 'click', object: pause.id },
        { type: 'pauseMedia', object: audio.id },
      ),
      trigger(
        { kind: 'slide', id: slide.id },
        { type: 'mediaCompletes', object: audio.id },
        { type: 'toggleVariable', variable: project.variables[0]!.id },
      ),
    );
    ids = { audio: audio.id, play: play.id, pause: pause.id };
  });
  await mount(page, url, project);
  await page.waitForTimeout(300);
  expect(await probe(page, ids.audio)).toMatchObject({ paused: true, time: 0 });

  await clickObject(page, ids.play);
  await expect.poll(async () => (await probe(page, ids.audio)).paused).toBe(false);
  expect((await probe(page, ids.audio)).volume).toBeCloseTo(0.3);
  await page.waitForTimeout(300);
  await clickObject(page, ids.pause);
  await expect.poll(async () => (await probe(page, ids.audio)).paused).toBe(true);
  const held = (await probe(page, ids.audio)).time;
  expect(held).toBeGreaterThan(0.1);
  await page.waitForTimeout(400);
  expect((await probe(page, ids.audio)).time).toBeCloseTo(held, 1);
  expect(await variable(page, 'Heard')).toBe(false);

  await clickObject(page, ids.play);
  await expect.poll(() => variable(page, 'Heard'), { timeout: 5000 }).toBe(true);
  expect((await probe(page, ids.audio)).paused).toBe(true);
});

test('when the browser blocks sound, the course waits behind Play', async ({ page }) => {
  // Stand in for a browser's autoplay rule: no sound until the page allows it.
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (!(window as unknown as { soundAllowed?: boolean }).soundAllowed) {
        return Promise.reject(new DOMException('Not allowed', 'NotAllowedError'));
      }
      return play.call(this);
    };
  });
  const { url, project } = course(3, () => undefined);
  const id = project.scenes[0]!.slides[0]!.baseLayer.objects[0]!.id;
  await mount(page, url, project);
  const button = page.getByRole('button', { name: 'Play the course with sound' });
  await expect(button).toBeVisible();
  await page.waitForTimeout(500);
  // Nothing goes on without the sound.
  expect((await probe(page, id)).playhead).toBeLessThan(0.1);
  await page.evaluate(() => ((window as unknown as { soundAllowed: boolean }).soundAllowed = true));
  await button.click();
  await expect(button).toBeHidden();
  await expect
    .poll(async () => (await probe(page, id)).playhead, { timeout: 5000 })
    .toBeGreaterThan(0.3);
  expect((await probe(page, id)).paused).toBe(false);
});

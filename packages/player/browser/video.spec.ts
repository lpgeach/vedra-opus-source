import {
  createButtonObject,
  createEmptyProject,
  createId,
  createScene,
  createSlide,
  createVideoObject,
} from '@vedraopus/model';
import type { Project, Trigger, TriggerAction, TriggerEvent, VideoObject } from '@vedraopus/model';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeSeekableWebm, makeWebm } from '../../../fixtures/make-media';

const dist = join(import.meta.dirname, '../dist');
let film: Buffer;
let seekable: Buffer;
test.beforeAll(async () => {
  film = await makeWebm(4);
  seekable = await makeSeekableWebm(4);
});

const trigger = (owner: Trigger['owner'], event: TriggerEvent, action: TriggerAction): Trigger => ({
  id: createId('trigger'),
  owner,
  event,
  action,
  conditions: null,
  otherwise: null,
  enabled: true,
});

/** One slide with the 4 s test video on it; `build` sets it up. */
function course(build: (s: { project: Project; video: VideoObject }) => void, file = () => film) {
  const bytes = file();
  const hash = createHash('sha256').update(bytes).digest('hex');
  const project = createEmptyProject('Film');
  project.assets[hash] = {
    kind: 'video',
    fileName: 'film.webm',
    ext: 'webm',
    mimeType: 'video/webm',
    byteLength: bytes.length,
  };
  const slide = createSlide('One');
  slide.baseLayer.timeline.duration = 8;
  const video = createVideoObject(hash, 4, { x: 40, y: 120, width: 320, height: 180 }, 'Film');
  slide.baseLayer.objects.push(video);
  project.variables.push({ id: 'var_done', name: 'Done', type: 'boolean', default: false });
  slide.triggers.push(
    trigger(
      { kind: 'slide', id: slide.id },
      { type: 'mediaCompletes', object: video.id },
      { type: 'toggleVariable', variable: 'var_done' },
    ),
  );
  project.scenes = [{ ...createScene(), slides: [slide] }];
  build({ project, video });
  const dir = mkdtempSync(join(tmpdir(), 'vedraopus-player-video-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', `${hash}.webm`), bytes);
  cpSync(join(dist, 'player.js'), join(dir, 'player.js'));
  cpSync(join(dist, 'player.css'), join(dir, 'player.css'));
  writeFileSync(
    join(dir, 'index.html'),
    `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="player.css">
<style>html,body{margin:0;height:100%}#app{width:100%;height:100%}</style></head>
<body><div id="app"></div><script src="player.js"></script></body></html>`,
  );
  return { url: pathToFileURL(join(dir, 'index.html')).href, project, video };
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

interface Probe {
  paused: boolean;
  muted: boolean;
  time: number;
  playhead: number;
  playing: boolean;
  done: unknown;
}
const probe = (page: Page, id: string): Promise<Probe> =>
  page.evaluate((mediaId) => {
    const element = document.querySelector<HTMLVideoElement>(`video[data-media-id="${mediaId}"]`)!;
    const engine = (
      window as unknown as {
        player: {
          engine: {
            getView(): {
              layers: { playhead: number; media: { id: string; playing: boolean }[] }[];
            };
            getVariable(n: string): unknown;
          };
        };
      }
    ).player.engine;
    const layer = engine.getView().layers[0]!;
    return {
      paused: element.paused,
      muted: element.muted,
      time: element.currentTime,
      playhead: layer.playhead,
      playing: layer.media.find((m) => m.id === mediaId)?.playing ?? false,
      done: engine.getVariable('Done'),
    };
  }, id);
const videoOf = (page: Page, id: string) => page.locator(`video[data-media-id="${id}"]`);

test('a trimmed video starts at its trim start, and its slide completes it at its trim end', async ({
  page,
  browserName,
}) => {
  const { url, project, video } = course(({ video }) => {
    video.props.trimStart = 1;
    video.props.trimEnd = 2.5;
    video.timing = { start: 0, duration: 1.5 };
  });
  await mount(page, url, project);
  await expect
    .poll(async () => (await probe(page, video.id)).paused, { timeout: 5000 })
    .toBe(false);
  const early = await probe(page, video.id);
  // From one second into the file, not from the start, with sound.
  expect(early.time).toBeGreaterThanOrEqual(0.9);
  expect(early.muted).toBe(false);
  // Firefox completes it through the engine's 2 s stall limit (see below), which takes longer.
  await expect.poll(async () => (await probe(page, video.id)).done, { timeout: 15_000 }).toBe(true);
  const after = await probe(page, video.id);
  expect(after.paused).toBe(true);
  expect(after.playhead).toBeGreaterThanOrEqual(1.5);
  if (browserName === 'chromium') {
    // It played to its trim end.
    expect(after.time).toBeGreaterThan(2.2);
    expect(after.time).toBeLessThan(2.9);
  }
  // Firefox cannot play on after a seek in a WebM without cues, which is what this
  // recorded test file is: there the slide must still go on (the engine's stall
  // limit), rather than wait for the video for ever. P6.3 will normalise such files.
});

test('a video as the media pipeline leaves it plays from its trim start to its trim end, in every browser', async ({
  page,
}) => {
  const { url, project, video } = course(
    ({ video }) => {
      video.props.trimStart = 1;
      video.props.trimEnd = 2.5;
      video.timing = { start: 0, duration: 1.5 };
    },
    () => seekable,
  );
  await mount(page, url, project);
  // It plays on from the seek to its trim start (Firefox stuck here on the recorded file).
  await expect
    .poll(async () => (await probe(page, video.id)).time, { timeout: 5000 })
    .toBeGreaterThan(1.4);
  await expect.poll(async () => (await probe(page, video.id)).done, { timeout: 8000 }).toBe(true);
  const after = await probe(page, video.id);
  expect(after.time).toBeGreaterThan(2.2);
  expect(after.time).toBeLessThan(2.9);
});

test('a video set to start on a click plays and pauses when clicked', async ({ page }) => {
  const { url, project, video } = course(({ video }) => {
    video.props.startOn = 'click';
    video.timing = { start: 0, duration: 'untilEnd' };
  });
  await mount(page, url, project);
  await page.waitForTimeout(400);
  expect(await probe(page, video.id)).toMatchObject({ paused: true, playing: false });
  await videoOf(page, video.id).click();
  await expect.poll(async () => (await probe(page, video.id)).paused).toBe(false);
  await page.waitForTimeout(500);
  await videoOf(page, video.id).click();
  await expect.poll(async () => (await probe(page, video.id)).paused).toBe(true);
  const held = (await probe(page, video.id)).time;
  expect(held).toBeGreaterThan(0.2);
  await page.waitForTimeout(400);
  expect((await probe(page, video.id)).time).toBeCloseTo(held, 1);
});

test('the learner’s own controls win over the timeline', async ({ page }) => {
  const { url, project, video } = course(({ video }) => {
    video.props.controls = true;
  });
  await mount(page, url, project);
  await expect(videoOf(page, video.id)).toHaveAttribute('controls', '');
  await expect
    .poll(async () => (await probe(page, video.id)).paused, { timeout: 5000 })
    .toBe(false);
  await page.waitForTimeout(300);
  // As if the learner pressed the controls' pause.
  await videoOf(page, video.id).evaluate((element: HTMLVideoElement) => element.pause());
  await expect.poll(async () => (await probe(page, video.id)).playing).toBe(false);
  await page.waitForTimeout(500);
  // The board did not start it again.
  expect((await probe(page, video.id)).paused).toBe(true);
  await videoOf(page, video.id).evaluate((element: HTMLVideoElement) => void element.play());
  await expect.poll(async () => (await probe(page, video.id)).playing).toBe(true);
  // As if the learner dragged the scrubber: the engine follows, the board does not pull it back.
  await videoOf(page, video.id).evaluate((element: HTMLVideoElement) => {
    element.currentTime = 3;
  });
  await expect
    .poll(() =>
      page.evaluate((mediaId) => {
        const engine = (
          window as unknown as {
            player: {
              engine: { getView(): { layers: { media: { id: string; time: number }[] }[] } };
            };
          }
        ).player.engine;
        return engine.getView().layers[0]!.media.find((m) => m.id === mediaId)!.time;
      }, video.id),
    )
    .toBeGreaterThan(2.8);
  expect((await probe(page, video.id)).time).toBeGreaterThan(2.8);
});

test('the timeline keeps the video’s time, and a change of state does not restart it', async ({
  page,
}) => {
  let buttonId = '';
  const { url, project, video } = course(({ project, video }) => {
    video.states.push({ id: 'moved', name: 'Moved', overrides: { frame: { x: 420 } } });
    const button = createButtonObject('Move', { x: 40, y: 40 });
    button.timing = { start: 0, duration: 'untilEnd' };
    const slide = project.scenes[0]!.slides[0]!;
    slide.baseLayer.objects.push(button);
    slide.triggers.push(
      trigger(
        { kind: 'object', id: button.id },
        { type: 'click', object: button.id },
        { type: 'changeState', object: video.id, state: 'moved' },
      ),
    );
    buttonId = button.id;
  });
  await mount(page, url, project);
  await expect
    .poll(async () => (await probe(page, video.id)).time, { timeout: 5000 })
    .toBeGreaterThan(0.3);
  await videoOf(page, video.id).evaluate((element: HTMLVideoElement) => {
    element.playbackRate = 0.5;
    element.dataset['marked'] = 'yes';
  });
  const before = await probe(page, video.id);
  await page.waitForTimeout(1000);
  const after = await probe(page, video.id);
  const moved = after.playhead - before.playhead;
  expect(moved).toBeGreaterThan(0.25);
  expect(moved).toBeLessThan(0.75);

  await page.locator(`[data-object-id="${buttonId}"]`).click();
  await expect(page.locator(`[data-object-id="${video.id}"]`)).toHaveAttribute(
    'data-state',
    'moved',
  );
  // The same element, still playing from where it was.
  await expect(videoOf(page, video.id)).toHaveAttribute('data-marked', 'yes');
  const later = await probe(page, video.id);
  expect(later.paused).toBe(false);
  expect(later.time).toBeGreaterThanOrEqual(after.time);
});

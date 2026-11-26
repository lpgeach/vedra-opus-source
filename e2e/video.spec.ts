import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { makeWebm, vendorFfmpeg, wav } from '../fixtures/make-media';
import { answerDialogs, launchApp } from './launch';

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const row = (page: Page, name: string) =>
  page.getByTestId('timeline-row').filter({ hasText: name });
const selectRow = (page: Page, name: string) => row(page, name).locator('.timeline-name').click();
const length = (page: Page) => page.getByLabel('Timeline length in seconds');

test('a video: inserted at its size and length, trimmed, started by a click, with controls and a poster; kept, published and played', async () => {
  test.setTimeout(150_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-video-'));
  const film = join(work, 'film.webm');
  writeFileSync(film, await makeWebm(4));
  const picture = join(work, 'poster.png');
  const fixtureAssets = join(import.meta.dirname, '../fixtures/projects/two-slides/assets');
  cpSync(
    join(
      fixtureAssets,
      readdirSync(fixtureAssets).find((f) => f.endsWith('.png'))!,
    ),
    picture,
  );
  const narration = join(work, 'narration.wav');
  writeFileSync(narration, wav(8));
  const file = join(work, 'film.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, {
      open: [[film], [picture], [narration]],
      save: [file],
      message: [1, 1],
    });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await expect(length(page)).toHaveValue('5');
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Video…', exact: true }).click();

    // Its own size (320×180 fits the stage), and its whole length on the timeline.
    const bar = row(page, 'film').getByTestId('timeline-bar');
    await expect(bar).toBeVisible();
    const seconds = Number(await bar.getAttribute('data-duration'));
    expect(seconds).toBeGreaterThan(3.5);
    expect(seconds).toBeLessThan(4.6);
    const onStage = page.locator('[data-testid="stage-canvas"] [data-object-type="video"]');
    await expect(onStage).toHaveCSS('width', '320px');
    await expect(onStage.locator('video')).toHaveCount(1);

    // A picture for the poster, in the project's media but not on the slide.
    await page.getByRole('button', { name: 'Import Media…', exact: true }).click();
    await selectRow(page, 'film');
    await page.getByRole('tab', { name: 'Format', exact: true }).click();
    await page.getByLabel('Video starts').selectOption('click');
    await page.getByLabel('Show controls').check();
    await page.getByLabel('Trim start (s)').fill('1');
    await page.getByLabel('Trim start (s)').press('Enter');
    await page.getByLabel('Poster', { exact: true }).selectOption({ label: 'poster.png' });
    // Trimmed: it plays a second less, and its bar is a second shorter.
    await expect(bar).toHaveAttribute(
      'data-duration',
      String(Math.round((seconds - 1) * 100) / 100),
    );
    await expect(onStage.locator('video')).toHaveAttribute('poster', /vedraopus-asset:/);

    // Narration longer than the slide: the timeline grows to fit it.
    await page.getByRole('button', { name: 'Audio…', exact: true }).click();
    await expect(row(page, 'narration').getByTestId('timeline-bar')).toHaveAttribute(
      'data-duration',
      '8',
    );
    await expect(length(page)).toHaveValue('8');
    // One step back takes both the narration and the longer timeline away.
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(row(page, 'narration')).toHaveCount(0);
    await expect(length(page)).toHaveValue('5');
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(length(page)).toHaveValue('8');

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('project-status')).toContainText('Saved');
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ args: [file] });
  try {
    const { app, page } = second;
    await answerDialogs(app, { open: [[out]], message: [1, 1] });
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await selectRow(page, 'film');
    await page.getByRole('tab', { name: 'Format', exact: true }).click();
    await expect(page.getByLabel('Video starts')).toHaveValue('click');
    await expect(page.getByLabel('Show controls')).toBeChecked();
    await expect(page.getByLabel('Trim start (s)')).toHaveValue('1');
    await expect(page.getByLabel('Poster', { exact: true })).not.toHaveValue('');

    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const dialog = page.getByTestId('publish-dialog');
    await dialog.getByRole('button', { name: 'Choose folder…' }).click();
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-result')).toBeVisible();
  } finally {
    await second.app.close();
  }

  // The course: the video waits with its poster and controls; a click plays it from its trim start.
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(join(out, 'untitled-project', 'index.html')).href);
    const video = page.locator('video[data-media-id]');
    await expect(video).toHaveAttribute('controls', '');
    await expect(video).toHaveAttribute('poster', /content\/assets\/.+\.png$/);
    await page.waitForTimeout(300);
    expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
    await video.click({ position: { x: 160, y: 60 } });
    await expect
      .poll(() => video.evaluate((element: HTMLVideoElement) => element.paused))
      .toBe(false);
    await expect
      .poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime))
      .toBeGreaterThan(1.1);
  } finally {
    await browser.close();
  }
});

test('an mp4 becomes WebM with a poster, set as the video’s poster, and plays when published', async () => {
  test.setTimeout(120_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-video-'));
  const mp4 = join(work, 'clip.mp4');
  // An mp4 that is not WebM but in formats Vedra Opus reads (VP9, Opus); H.264/AAC is
  // refused on every system (next test).
  const made = spawnSync(vendorFfmpeg(), [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=320x180:rate=30:duration=3',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=3',
    '-c:v',
    'libvpx-vp9',
    '-c:a',
    'libopus',
    mp4,
  ]);
  expect(made.status).toBe(0);
  const out = join(work, 'out');
  mkdirSync(out);
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { open: [[mp4], [out]], message: [1, 1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Video…', exact: true }).click();
    await expect(row(page, 'clip').getByTestId('timeline-bar')).toBeVisible();
    await page.getByRole('tab', { name: 'Media', exact: true }).click();
    const media = page.getByTestId('assets');
    await expect(media).toContainText('clip.webm');
    await expect(media).not.toContainText('clip.mp4');
    // The poster is the video's thumbnail there, not an item of its own (Luke, alpha 1:
    // one mp4 had become "a webm and an image").
    await expect(media.getByRole('listitem')).toHaveCount(1);
    await expect(media).not.toContainText('clip poster.png');
    await expect(media.locator('img')).toHaveCount(1);
    await selectRow(page, 'clip');
    await page.getByRole('tab', { name: 'Format', exact: true }).click();
    await expect(page.getByLabel('Poster', { exact: true }).locator('option:checked')).toHaveText(
      'clip poster.png',
    );

    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const dialog = page.getByTestId('publish-dialog');
    await dialog.getByRole('button', { name: 'Choose folder…' }).click();
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-result')).toBeVisible();
  } finally {
    await app.close();
  }
  const course = join(out, 'untitled-project');
  const assets = readdirSync(join(course, 'content', 'assets'));
  expect(assets.some((name) => name.endsWith('.webm'))).toBe(true);
  expect(assets.some((name) => name.endsWith('.mp4'))).toBe(false);
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(join(course, 'index.html')).href);
    const video = page.locator('video[data-media-id]');
    await expect(video).toHaveAttribute('poster', /content\/assets\/.+\.png$/);
    // Starts with the timeline: it plays at once.
    await expect
      .poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime))
      .toBeGreaterThan(0.5);
  } finally {
    await browser.close();
  }
});

test('an H.264/AAC file comes in through the system’s decoders on Windows and macOS, and is refused on Linux', async () => {
  // Our ffmpeg cannot make one, so a tiny one is kept in the fixtures (fixtures/media/README.md).
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-video-'));
  const camera = join(work, 'camera.mp4');
  cpSync(join(import.meta.dirname, '../fixtures/media/h264-aac.mp4'), camera);
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { open: [[camera]], message: [1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Video…', exact: true }).click();
    if (process.platform === 'linux') {
      // Linux has no licensed decoder of its own (docs/licences.md).
      await expect(page.getByRole('alert')).toContainText(
        '"camera.mp4" uses H.264 and AAC, which needs a patent licence, so Vedra Opus cannot import it on Linux. Convert it to WebM',
      );
      await expect(page.getByTestId('timeline-row')).toHaveCount(0);
      await page.getByRole('tab', { name: 'Media', exact: true }).click();
      await expect(page.getByTestId('assets')).not.toContainText('camera');
    } else {
      // Read by Media Foundation or AVFoundation, encoded by our ffmpeg (R3).
      await expect(page.getByTestId('timeline-row')).toHaveCount(1, { timeout: 30_000 });
      await page.getByRole('tab', { name: 'Media', exact: true }).click();
      await expect(page.getByTestId('assets')).toContainText('camera.webm');
    }
  } finally {
    await app.close();
  }
});

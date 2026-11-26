import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vendorFfmpeg } from '../fixtures/make-media';
import { answerDialogs, launchApp, previewFrom } from './launch';

/**
 * A video plays in Preview (found by Luke testing alpha 1, 2026-11-23): an mp4 is
 * imported (converted to WebM), put on a slide, and previewed; it plays and seeks.
 * Preview's own scheme lacked the stream privilege and byte ranges, so it did not.
 */

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();

async function previewPlays(file: string) {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { open: [[file]], message: [1] });
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Video…', exact: true }).click();
    await expect(page.getByTestId('timeline-row')).toHaveCount(1, { timeout: 60_000 });
    await ribbon(page, 'Home');
    const [preview] = await Promise.all([
      app.waitForEvent('window'),
      previewFrom(page, 'This Slide'),
    ]);
    const video = preview.locator('.vo-player-stage video');
    await expect(video).toHaveCount(1);
    const state = () =>
      video.evaluate((element: HTMLVideoElement) => ({
        time: element.currentTime,
        error: element.error?.code ?? null,
        ready: element.readyState,
      }));
    // It plays to its end, with nothing gone wrong. (Without byte ranges a video of a few MB
    // started, then stopped with a format error part of the way through.) The end of the
    // video's bar on the timeline can pause it a few hundredths of a second before the media
    // itself ends (3.0 of 3.021 s, seen on Linux), so either counts as the end.
    await expect
      .poll(
        async () =>
          video.evaluate(
            (element: HTMLVideoElement) =>
              element.ended ||
              element.error !== null ||
              (element.paused && element.currentTime >= element.duration - 0.1),
          ),
        { timeout: 20_000 },
      )
      .toBe(true);
    expect((await state()).error).toBeNull();
    // And seeks, which needs byte ranges.
    await video.evaluate((element: HTMLVideoElement) => {
      element.pause();
      element.currentTime = 0.1;
    });
    await expect
      .poll(async () => (await state()).ready, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(2);
    expect((await state()).error).toBeNull();
    await preview.close();
  } finally {
    await app.close();
  }
}

test('an mp4 in royalty-free formats, converted on import, plays and seeks in Preview', async () => {
  test.setTimeout(120_000);
  const work = mkdtempSync(join(tmpdir(), 'vo-e2e-preview-video-'));
  const clip = join(work, 'clip.mp4');
  const made = spawnSync(vendorFfmpeg(), [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=1280x720:rate=30:duration=3',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=3',
    '-c:v',
    'libvpx-vp9',
    // Near lossless, for a file of several MB.
    '-crf',
    '4',
    '-b:v',
    '0',
    '-c:a',
    'libopus',
    '-shortest',
    clip,
  ]);
  expect(made.status).toBe(0);
  await previewPlays(clip);
});

test('an H.264 mp4, read through the system’s decoders, plays in Preview (Windows and macOS)', async () => {
  test.skip(process.platform === 'linux', 'Linux refuses H.264 (docs/licences.md)');
  test.setTimeout(120_000);
  const work = mkdtempSync(join(tmpdir(), 'vo-e2e-preview-h264-'));
  const camera = join(work, 'camera.mp4');
  cpSync(join(import.meta.dirname, '../fixtures/media/h264-aac.mp4'), camera);
  await previewPlays(camera);
});

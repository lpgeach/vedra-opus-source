import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vendorFfmpeg } from '../fixtures/make-media';
import { answerDialogs, launchApp } from './launch';

/**
 * Found by Luke testing alpha 1 (2026-11-23): pressing Play on the timeline moved
 * the playhead and played the video's sound, but its picture on the stage stood
 * still; and Space should play the timeline.
 */

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();

test('a video on the stage plays with the timeline; Space plays and pauses, and still pans when held', async () => {
  test.setTimeout(120_000);
  const work = mkdtempSync(join(tmpdir(), 'vo-e2e-timeline-video-'));
  const clip = join(work, 'clip.mp4');
  const made = spawnSync(vendorFfmpeg(), [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=640x360:rate=25:duration=4',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=4',
    '-c:v',
    'libvpx-vp9',
    '-c:a',
    'libopus',
    '-shortest',
    clip,
  ]);
  expect(made.status).toBe(0);
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { open: [[clip]], message: [1] });
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Video…', exact: true }).click();
    await expect(page.getByTestId('timeline-row')).toHaveCount(1, { timeout: 60_000 });

    const video = page.getByTestId('stage-canvas').locator('video');
    const state = () =>
      video.evaluate((element: HTMLVideoElement) => ({
        paused: element.paused,
        time: element.currentTime,
      }));
    const timeline = page.getByTestId('timeline');

    // Play: the picture plays with the playhead.
    await timeline.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(async () => (await state()).time, { timeout: 10_000 }).toBeGreaterThan(0.5);
    expect((await state()).paused).toBe(false);
    await timeline.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect.poll(async () => (await state()).paused).toBe(true);
    const held = (await state()).time;

    // Space, with the stage in focus: plays, then pauses.
    await page.getByTestId('stage-canvas').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press(' ');
    await expect(timeline.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await expect
      .poll(async () => (await state()).time, { timeout: 10_000 })
      .toBeGreaterThan(held + 0.3);
    await page.keyboard.press(' ');
    await expect(timeline.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await expect.poll(async () => (await state()).paused).toBe(true);

    // Space held while dragging pans the stage, and does not play the timeline.
    const canvas = (await page.getByTestId('stage-canvas').boundingBox())!;
    await page.mouse.move(canvas.x + 20, canvas.y + 20);
    await page.keyboard.down(' ');
    await page.mouse.down();
    await page.mouse.move(canvas.x + 80, canvas.y + 60, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up(' ');
    await expect(timeline.getByRole('button', { name: 'Play', exact: true })).toBeVisible();

    // Typing a space in a field does not play it either.
    const title = page.getByTestId('project-title');
    await title.click();
    await page.keyboard.press('End');
    await page.keyboard.press(' ');
    await expect(timeline.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await expect(title).toHaveValue('Untitled Project ');
  } finally {
    await app.close();
  }
});

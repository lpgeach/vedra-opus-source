import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { answerDialogs, launchApp } from './launch';

/**
 * Screen recording (docs/briefs/P9.11-screen-recording.md). Nothing real is
 * listed or recorded: main's list of screens and windows is replaced with two
 * made-up ones, and the capture with a moving canvas, so no picture of the
 * computer's screen is ever taken.
 */

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();

test('a screen recording is chosen, recorded, watched back and inserted as a video that plays in the course', async () => {
  test.setTimeout(150_000);
  const work = mkdtempSync(join(tmpdir(), 'vo-e2e-screen-'));
  const file = join(work, 'screen.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { save: [file], message: [1] });
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('screen:sources');
      ipcMain.handle('screen:sources', () => [
        { id: 'screen:test:0', name: 'Test screen', kind: 'screen', thumbnail: '' },
        { id: 'window:test:0', name: 'Test window', kind: 'window', thumbnail: '' },
      ]);
      ipcMain.removeHandler('screen:choose');
      ipcMain.handle('screen:choose', () => true);
    });
    await page.evaluate(() => {
      // A canvas whose colour moves, recorded in place of a screen.
      navigator.mediaDevices.getDisplayMedia = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 180;
        const context = canvas.getContext('2d')!;
        let frame = 0;
        const draw = () => {
          frame += 1;
          context.fillStyle = `hsl(${(frame * 7) % 360} 70% 50%)`;
          context.fillRect(0, 0, 320, 180);
          context.fillStyle = '#ffffff';
          context.fillRect((frame * 4) % 320, 70, 40, 40);
        };
        draw();
        window.setInterval(draw, 40);
        return canvas.captureStream(25);
      };
    });

    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Screen Recording…', exact: true }).click();
    const dialog = page.getByTestId('screen-record-dialog');
    await expect(dialog.getByRole('button', { name: 'Record', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('group', { name: 'Screens' })).toContainText('Test screen');
    await expect(dialog.getByRole('group', { name: 'Windows' })).toContainText('Test window');
    await dialog.getByRole('button', { name: 'Test screen' }).click();
    await expect(dialog.getByRole('button', { name: 'Test screen' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await dialog.getByRole('button', { name: 'Record', exact: true }).click();
    const status = dialog.getByTestId('screen-record-status');
    await expect(status).toHaveText(/Recording in [123]…/);
    await expect(status).toHaveText('Recording 0:02', { timeout: 10_000 });
    await dialog.getByRole('button', { name: 'Stop' }).click();
    await expect(status).toHaveText(/Recorded 0:0[2-4]/);
    const take = dialog.getByLabel('Watch the recording');
    await expect(take).toBeVisible();
    await dialog.getByRole('button', { name: 'Insert' }).click();
    await expect(dialog).toHaveCount(0, { timeout: 60_000 });

    const video = page.getByTestId('stage-canvas').locator('[data-object-type="video"]');
    await expect(video).toHaveCount(1);
    await page.getByRole('tab', { name: 'Media', exact: true }).click();
    await expect(page.getByTestId('assets')).toContainText(/Screen recording \d\d:\d\d:\d\d\.webm/);

    await ribbon(page, 'Home');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('project-status')).toContainText('Saved');
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ args: [file] });
  try {
    const { app, page } = second;
    await answerDialogs(app, { open: [[out]], message: [1] });
    await ribbon(page, 'Home');
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const publish = page.getByTestId('publish-dialog');
    await publish.getByRole('button', { name: 'Choose folder…' }).click();
    await publish.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-result')).toBeVisible();
  } finally {
    await second.app.close();
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await page.goto(pathToFileURL(join(out, 'untitled-project', 'index.html')).href);
    const video = page.locator('.vo-player-stage video').first();
    await expect(video).toBeAttached();
    // It loads, and has the length of the take.
    await expect
      .poll(() => video.evaluate((element: HTMLVideoElement) => element.duration), {
        timeout: 15_000,
      })
      .toBeGreaterThan(1.5);
  } finally {
    await browser.close();
  }
});

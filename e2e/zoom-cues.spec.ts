import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { wav } from '../fixtures/make-media';
import { answerDialogs, launchApp } from './launch';

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const row = (page: Page, name: string) =>
  page.getByTestId('timeline-row').filter({ hasText: name });

test('a zoom region: inserted, its speed set, kept, and zooming the published course', async () => {
  test.setTimeout(120_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-zoom-'));
  const file = join(work, 'zoom.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { save: [file], message: [1, 1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Zoom Region', exact: true }).click();
    // On the stage it is a frame marked "Zoom"; on the timeline, a bar of 3 s.
    const marker = page.locator('[data-testid="stage-canvas"] [data-object-type="zoomRegion"]');
    await expect(marker).toContainText('Zoom');
    await expect(row(page, 'Zoom Region').getByTestId('timeline-bar')).toHaveAttribute(
      'data-duration',
      '3',
    );
    await page.getByRole('tab', { name: 'Format', exact: true }).click();
    await page.getByLabel('Zoom speed').fill('1');
    await page.getByLabel('Zoom speed').press('Enter');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('project-status')).toContainText('Saved');
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ args: [file] });
  try {
    const { app, page } = second;
    await answerDialogs(app, { open: [[out]], message: [1, 1] });
    await row(page, 'Zoom Region').locator('.timeline-name').click();
    await page.getByRole('tab', { name: 'Format', exact: true }).click();
    await expect(page.getByLabel('Zoom speed')).toHaveValue('1');
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const dialog = page.getByTestId('publish-dialog');
    await dialog.getByRole('button', { name: 'Choose folder…' }).click();
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-result')).toBeVisible();
  } finally {
    await second.app.close();
  }

  // The course zooms in to half the stage, so to twice the size, and back out by 3 s.
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(join(out, 'untitled-project', 'index.html')).href);
    const slide = page.locator('.vo-player-slide');
    const scale = () => slide.evaluate((each: HTMLElement) => Number(each.style.scale || 1));
    await expect.poll(scale, { timeout: 3000 }).toBeCloseTo(2, 1);
    await expect.poll(scale, { timeout: 5000 }).toBe(1);
  } finally {
    await browser.close();
  }
});

test('cue points: the sound plays in the editor, C drops cues on it, and objects align to them', async () => {
  test.setTimeout(90_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-cues-'));
  const sound = join(work, 'talk.wav');
  writeFileSync(sound, wav(4));
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { open: [[sound]], message: [1, 1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Button', exact: true }).click();
    await page.getByRole('button', { name: 'Audio…', exact: true }).click();
    await expect(row(page, 'talk')).toBeVisible();

    await page.getByRole('button', { name: 'Play', exact: true }).click();
    const playing = page.locator('audio[data-timeline-sound]');
    await expect(playing).toHaveCount(1);
    await expect
      .poll(() => playing.evaluate((each: HTMLAudioElement) => !each.paused && each.currentTime))
      .toBeGreaterThan(0.2);
    await page.keyboard.press('c');
    await page.waitForTimeout(600);
    await page.keyboard.press('c');
    const cues = page.getByTestId('timeline-cue');
    await expect(cues).toHaveCount(2);
    const times = (await cues.evaluateAll((each) =>
      each.map((cue) => Number(cue.getAttribute('data-time'))),
    )) as number[];
    expect(times[0]!).toBeGreaterThan(0);
    expect(times[1]! - times[0]!).toBeGreaterThan(0.4);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(playing).toHaveCount(0);
    // C does nothing when the timeline is not playing.
    await page.keyboard.press('c');
    await expect(cues).toHaveCount(2);

    // Start the button at the second cue; one undo puts it back.
    await row(page, 'Button').locator('.timeline-name').click();
    const bar = row(page, 'Button').getByTestId('timeline-bar');
    await expect(bar).toHaveAttribute('data-start', '0');
    await page.getByLabel('Align to cue point', { exact: true }).selectOption({ index: 2 });
    await expect(bar).toHaveAttribute('data-start', String(times[1]));
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(bar).toHaveAttribute('data-start', '0');
  } finally {
    await app.close();
  }
});

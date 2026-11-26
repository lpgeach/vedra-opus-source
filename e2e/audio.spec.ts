import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { answerDialogs, launchApp } from './launch';

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

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const row = (page: Page, name: string) =>
  page.getByTestId('timeline-row').filter({ hasText: name });
const selectRow = (page: Page, name: string) => row(page, name).locator('.timeline-name').click();
const wizard = (page: Page) => page.getByTestId('trigger-wizard');

test('a sound: inserted with its length and waveform, set to wait for a click, kept, published and heard', async () => {
  test.setTimeout(120_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-audio-'));
  const sound = join(work, 'tone.wav');
  writeFileSync(sound, wav(2.5));
  const file = join(work, 'sound.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { open: [[sound]], save: [file], message: [1, 1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Button', exact: true }).click();
    await page.getByRole('button', { name: 'Audio…', exact: true }).click();

    // On the timeline from 0 s for its whole length, its waveform drawn in its bar.
    const bar = row(page, 'tone').getByTestId('timeline-bar');
    await expect(bar).toHaveAttribute('data-duration', '2.5');
    await expect(bar).toHaveAttribute('data-start', '0');
    await expect(row(page, 'tone').getByTestId('timeline-waveform')).toBeVisible();
    // Its marker is on the stage, so it can be picked up.
    await expect(
      page.locator('[data-testid="stage-canvas"] [data-object-type="audio"] svg'),
    ).toHaveCount(1);
    // The media pipeline (P6.3) turned the WAV into an MP3.
    await page.getByRole('tab', { name: 'Media', exact: true }).click();
    await expect(page.getByTestId('assets')).toContainText('tone.mp3');
    await expect(page.getByTestId('assets')).not.toContainText('tone.wav');

    await page.getByRole('tab', { name: 'Format', exact: true }).click();
    await page.getByLabel('Volume').fill('0.5');
    await page.getByLabel('Audio starts').selectOption('trigger');
    await expect(page.getByTestId('format-panel')).toContainText('Length 2.50 s');

    await selectRow(page, 'Button');
    await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
    await page.getByRole('button', { name: 'New trigger' }).click();
    await wizard(page).getByLabel('Action', { exact: true }).selectOption('playMedia');
    await expect(page.getByTestId('trigger-sentence')).toHaveText(
      'Play media tone when the learner clicks Button',
    );
    await wizard(page).getByRole('button', { name: 'Add trigger' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('project-status')).toContainText('Saved');
  } finally {
    await first.app.close();
  }

  // Reopened in a fresh app: the sound, its settings and the trigger are all there.
  const second = await launchApp({ args: [file] });
  try {
    const { app, page } = second;
    await answerDialogs(app, { open: [[out]], message: [1, 1] });
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await expect(row(page, 'tone').getByTestId('timeline-waveform')).toBeVisible();
    await selectRow(page, 'tone');
    await page.getByRole('tab', { name: 'Format', exact: true }).click();
    await expect(page.getByLabel('Volume')).toHaveValue('0.5');
    await expect(page.getByLabel('Audio starts')).toHaveValue('trigger');
    await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
    await expect(page.getByTestId('trigger-item')).toContainText(
      'Play media tone when the learner clicks Button',
    );

    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const dialog = page.getByTestId('publish-dialog');
    await dialog.getByRole('button', { name: 'Choose folder…' }).click();
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-result')).toBeVisible();
  } finally {
    await second.app.close();
  }

  // The published course, in a browser: silent until the button is clicked, then the sound plays.
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(join(out, 'untitled-project', 'index.html')).href);
    await expect(page.locator('.vo-player-position')).toHaveText('Slide 1 of 1');
    const audio = page.locator('audio[data-media-id]');
    await expect(audio).toHaveCount(1);
    const paused = () => audio.evaluate((element: HTMLAudioElement) => element.paused);
    await page.waitForTimeout(300);
    expect(await paused()).toBe(true);
    await page.locator('[data-object-type="button"]').click();
    await expect.poll(paused).toBe(false);
    expect(await audio.evaluate((element: HTMLAudioElement) => element.volume)).toBeCloseTo(0.5);
    await expect
      .poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime))
      .toBeGreaterThan(0.3);
  } finally {
    await browser.close();
  }
});

test('narration recorded from the microphone goes on the slide', async () => {
  // Chromium's stand-in microphone (a beeping tone) and permission prompt.
  const { app, page } = await launchApp({
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  try {
    await answerDialogs(app, { message: [1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Record Audio…', exact: true }).click();
    const dialog = page.getByTestId('record-dialog');
    await expect(dialog.getByRole('button', { name: 'Insert' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Record', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Stop' })).toBeVisible();
    await expect(dialog.getByTestId('record-time')).toHaveText('0:01', { timeout: 5000 });
    await dialog.getByRole('button', { name: 'Stop' }).click();
    await expect(dialog.getByLabel('Listen to the recording')).toBeVisible();
    await dialog.getByRole('button', { name: 'Insert' }).click();
    await expect(dialog).toHaveCount(0);

    const bar = row(page, 'Recording').getByTestId('timeline-bar');
    await expect(bar).toBeVisible();
    expect(Number(await bar.getAttribute('data-duration'))).toBeGreaterThan(0.5);
    await expect(row(page, 'Recording').getByTestId('timeline-waveform')).toBeVisible();
    await page.getByRole('tab', { name: 'Media', exact: true }).click();
    // The media pipeline (P6.3) keeps narration as MP3, which every browser can seek in.
    await expect(page.getByTestId('assets')).toContainText(/Recording \d\d:\d\d:\d\d\.mp3/);
  } finally {
    await app.close();
  }
});

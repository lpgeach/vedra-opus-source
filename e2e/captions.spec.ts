import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { vendorFfmpeg, wav } from '../fixtures/make-media';
import { answerDialogs, launchApp } from './launch';

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const bottomTab = (page: Page, name: string) =>
  page.getByTestId('panel-bottom').getByRole('tab', { name, exact: true }).click();
const rows = (page: Page) => page.getByTestId('caption-row');
const text = (page: Page, n: number) => page.getByLabel(`Caption ${n} text`, { exact: true });

const VTT = `WEBVTT

00:00.000 --> 00:01.000
Hello there

00:01.000 --> 00:02.000
Second line

00:02.000 --> 00:03.000
Third line
`;

test('captions: imported, edited against the waveform, exported, kept, and shown by CC', async () => {
  test.setTimeout(120_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-captions-'));
  const sound = join(work, 'talk.wav');
  writeFileSync(sound, wav(4));
  const vtt = join(work, 'talk.vtt');
  writeFileSync(vtt, VTT);
  const srt = join(work, 'out.srt');
  const file = join(work, 'captions.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { open: [[sound], [vtt]], save: [srt, file], message: [1, 1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();

    // Nothing to caption yet.
    await bottomTab(page, 'Captions');
    await expect(page.getByTestId('captions-empty')).toBeVisible();

    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Audio…', exact: true }).click();
    await expect(page.getByTestId('captions-panel')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export captions…' })).toBeDisabled();

    await page.getByRole('button', { name: 'Import captions…' }).click();
    await expect(page.getByTestId('captions-notice')).toContainText('3 captions from talk.vtt');
    await expect(rows(page)).toHaveCount(3);
    await expect(page.getByTestId('captions-block')).toHaveCount(3);
    await expect(text(page, 2)).toHaveValue('Second line');

    // Edit a cue's words and its end.
    await text(page, 2).fill('Second, edited');
    await text(page, 2).press('Enter');
    await page.getByLabel('Caption 3 end', { exact: true }).fill('2.8');
    await page.getByLabel('Caption 3 end', { exact: true }).press('Enter');
    await text(page, 1).focus();
    await expect(page.getByLabel('Caption 3 end', { exact: true })).toHaveValue('2.8');

    // Click the waveform near 3.5 s, then add a caption there.
    const wave = page.getByTestId('captions-wave');
    const box = (await wave.boundingBox())!;
    const length = Number(await wave.getAttribute('aria-valuemax'));
    await wave.click({ position: { x: (box.width * 3.5) / length, y: box.height / 2 } });
    const at = Number(await wave.getAttribute('aria-valuenow'));
    expect(at).toBeGreaterThan(3.4);
    expect(at).toBeLessThan(3.6);
    await page.getByRole('button', { name: 'Add caption' }).click();
    await expect(rows(page)).toHaveCount(4);
    // The new caption's words box has the focus.
    await expect(text(page, 4)).toBeFocused();
    await page.keyboard.type('Fourth');
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Caption 4 start', { exact: true })).toHaveValue(String(at));

    await page.getByRole('button', { name: 'Delete caption 1' }).click();
    await expect(rows(page)).toHaveCount(3);
    await expect(text(page, 1)).toHaveValue('Second, edited');
    // Undo and redo, as for any other change.
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(rows(page)).toHaveCount(4);
    await expect(text(page, 1)).toHaveValue('Hello there');
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(rows(page)).toHaveCount(3);
    // A row keeps its place while its time is typed, and moves into order afterwards.
    const start2 = page.getByLabel('Caption 2 start', { exact: true });
    await start2.fill('0.5');
    await expect(start2).toBeFocused();
    await expect(text(page, 2)).toHaveValue('Third line');
    await page.getByTestId('captions-cursor').click();
    await expect(text(page, 1)).toHaveValue('Third line');
    await expect(page.getByLabel('Caption 1 start', { exact: true })).toHaveValue('0.5');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(text(page, 1)).toHaveValue('Second, edited');

    // Export as SubRip, named by the file chosen.
    await page.getByRole('button', { name: 'Export captions…' }).click();
    await expect(page.getByTestId('captions-notice')).toContainText('Saved 3 captions');
    const written = readFileSync(srt, 'utf8');
    expect(written).toMatch(
      /^1\r?\n00:00:01,000 --> 00:00:02,000\r?\nSecond, edited\r?\n\r?\n2\r?\n00:00:02,000 --> 00:00:02,800\r?\nThird line\r?\n\r?\n3\r?\n00:00:03,[45]\d0 --> 00:00:0\d,\d{3}\r?\nFourth\r?\n/,
    );

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('project-status')).toContainText('Saved');
  } finally {
    await first.app.close();
  }

  // Reopened: the captions are kept. Published: CC shows them as the sound plays.
  const second = await launchApp({ args: [file] });
  try {
    const { app, page } = second;
    await answerDialogs(app, { open: [[out]], message: [1, 1] });
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await bottomTab(page, 'Timeline');
    await page
      .getByTestId('timeline-row')
      .filter({ hasText: 'talk' })
      .locator('.timeline-name')
      .click();
    await bottomTab(page, 'Captions');
    await expect(rows(page)).toHaveCount(3);
    await expect(text(page, 1)).toHaveValue('Second, edited');
    await expect(text(page, 3)).toHaveValue('Fourth');

    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const dialog = page.getByTestId('publish-dialog');
    await dialog.getByRole('button', { name: 'Choose folder…' }).click();
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-result')).toBeVisible();
  } finally {
    await second.app.close();
  }

  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(join(out, 'untitled-project', 'index.html')).href);
    await expect(page.locator('.vo-player-position')).toHaveText('Slide 1 of 1');
    const cc = page.getByRole('button', { name: 'Captions' });
    await cc.click();
    await expect(cc).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('player-captions')).toHaveText('Second, edited', {
      timeout: 5000,
    });
    await expect(page.getByTestId('player-captions')).toHaveText('Third line', { timeout: 5000 });
  } finally {
    await browser.close();
  }
});

/** Drag on the waveform from `from` to `to` seconds, through several moves. */
async function dragWave(page: Page, from: number, to: number) {
  const wave = page.getByTestId('captions-wave');
  const box = (await wave.boundingBox())!;
  const length = Number(await wave.getAttribute('aria-valuemax'));
  const x = (seconds: number) => box.x + (box.width * seconds) / length;
  const y = box.y + box.height / 2;
  await page.mouse.move(x(from), y);
  await page.mouse.down();
  await page.mouse.move(x(to), y, { steps: 8 });
  await page.mouse.up();
}
const time = async (page: Page, n: number, which: 'start' | 'end') =>
  Number(await page.getByLabel(`Caption ${n} ${which}`, { exact: true }).inputValue());

test('captions: dragged by their edges and bodies on the waveform, each drag one undo step; the cursor by keys', async () => {
  test.setTimeout(90_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-captions-drag-'));
  const sound = join(work, 'talk.wav');
  writeFileSync(sound, wav(4));
  const vtt = join(work, 'talk.vtt');
  writeFileSync(vtt, VTT);
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { open: [[sound], [vtt]], message: [1, 1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Audio…', exact: true }).click();
    await bottomTab(page, 'Captions');
    // A sound has no picture to show.
    await expect(page.getByTestId('captions-video')).toHaveCount(0);
    await page.getByRole('button', { name: 'Import captions…' }).click();
    await expect(rows(page)).toHaveCount(3);

    // Caption 1 is 0–1 s and caption 2 1–2 s. Pressed just inside caption 1, at 0.995 s,
    // the shared edge at 1 s is caption 1's end; dragged 0.5 s on, it ends near 1.5 s.
    await dragWave(page, 0.995, 1.495);
    const end1 = await time(page, 1, 'end');
    expect(end1).toBeGreaterThan(1.44);
    expect(end1).toBeLessThan(1.56);
    expect(await time(page, 1, 'start')).toBe(0);
    expect(await time(page, 2, 'start')).toBe(1);
    // The whole drag is one undo step.
    await page.getByRole('button', { name: 'Undo' }).click();
    expect(await time(page, 1, 'end')).toBe(1);
    await page.getByRole('button', { name: 'Undo' }).click();
    // One more undo takes back the import.
    await expect(rows(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(rows(page)).toHaveCount(3);

    // Pressed just inside caption 2, at 1.005 s, the same edge is caption 2's start.
    await dragWave(page, 1.005, 1.305);
    const start2 = await time(page, 2, 'start');
    expect(start2).toBeGreaterThan(1.25);
    expect(start2).toBeLessThan(1.36);
    expect(await time(page, 1, 'end')).toBe(1);
    expect(await time(page, 2, 'end')).toBe(2);

    // Caption 3 (2–3 s), taken by its middle and moved about 0.5 s later, keeps its 1 s.
    await dragWave(page, 2.5, 3);
    const start3 = await time(page, 3, 'start');
    expect(start3).toBeGreaterThan(2.44);
    expect(start3).toBeLessThan(2.56);
    expect(await time(page, 3, 'end')).toBeCloseTo(start3 + 1, 5);
    await expect(rows(page).nth(2)).toHaveClass('chosen');

    // Dragged where there is no caption, only the cursor moves.
    const wave = page.getByTestId('captions-wave');
    await dragWave(page, 3.8, 3.7);
    const at = Number(await wave.getAttribute('aria-valuenow'));
    expect(at).toBeGreaterThan(3.64);
    expect(at).toBeLessThan(3.76);
    expect(await time(page, 3, 'start')).toBe(start3);

    // The cursor by keys: Home, a tenth of a second, a second with Shift, End.
    await wave.focus();
    await page.keyboard.press('Home');
    await expect(wave).toHaveAttribute('aria-valuenow', '0');
    await page.keyboard.press('ArrowRight');
    await expect(wave).toHaveAttribute('aria-valuenow', '0.1');
    await page.keyboard.press('Shift+ArrowRight');
    await expect(wave).toHaveAttribute('aria-valuenow', '1.1');
    await page.keyboard.press('End');
    await expect(wave).toHaveAttribute(
      'aria-valuenow',
      (await wave.getAttribute('aria-valuemax')) ?? 'missing',
    );
  } finally {
    await app.close();
  }
});

test('captions for a video with no sound: its picture plays in the tab, and it says there is no waveform', async () => {
  test.setTimeout(90_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-captions-silent-'));
  const film = join(work, 'silent.webm');
  const made = spawnSync(vendorFfmpeg(), [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=320x180:rate=15:duration=3',
    '-an',
    '-c:v',
    'libvpx-vp9',
    film,
  ]);
  expect(made.status).toBe(0);
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { open: [[film]], message: [1, 1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Video…', exact: true }).click();
    await bottomTab(page, 'Captions');
    await expect(page.getByTestId('captions-video')).toBeVisible();
    await expect(page.getByTestId('captions-silent')).toContainText('no sound track');

    // Played, the picture moves the cursor on, and a caption goes where it has got to.
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    const wave = page.getByTestId('captions-wave');
    await expect
      .poll(async () => Number(await wave.getAttribute('aria-valuenow')), { timeout: 5000 })
      .toBeGreaterThan(0.5);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const at = Number(await wave.getAttribute('aria-valuenow'));
    await page.getByRole('button', { name: 'Add caption' }).click();
    await expect(rows(page)).toHaveCount(1);
    expect(await time(page, 1, 'start')).toBeCloseTo(at, 1);
  } finally {
    await app.close();
  }
});

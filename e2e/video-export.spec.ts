import { expect, test } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import {
  createAudioObject,
  createEmptyProject,
  createShapeObject,
  createSlide,
} from '@vedraopus/model';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ZipFile } from 'yazl';
import { answerDialogs, launchApp } from './launch';

/**
 * The course as a video (docs/briefs/P11.3-video-and-handout.md, part C):
 * played straight through, frame by frame, into a WebM with VP9 and Opus.
 * Needs the fetched ffmpeg (`npm run fetch:ffmpeg`); skipped without it.
 */

const os = { linux: 'linux', win32: 'win', darwin: 'mac' }[process.platform as string];
const tools = resolve(
  import.meta.dirname,
  '..',
  'vendor',
  'ffmpeg',
  `${os}-${process.arch}`,
  'bin',
);
const exe = process.platform === 'win32' ? '.exe' : '';
const ffmpeg = join(tools, `ffmpeg${exe}`);
const ffprobe = join(tools, `ffprobe${exe}`);

async function chooseMenuItem(app: ElectronApplication, id: string): Promise<void> {
  await app.evaluate(({ Menu }, menuId) => {
    Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click();
  }, id);
}

/** A course of two short slides: a shape, then a slide with a second of sound. */
async function course(dir: string): Promise<string> {
  const sound = join(dir, 'tone.mp3');
  const made = spawnSync(ffmpeg, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=1',
    sound,
  ]);
  expect(made.status).toBe(0);
  const bytes = readFileSync(sound);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const project = createEmptyProject('Video course');
  project.assets[hash] = {
    kind: 'audio',
    fileName: 'tone.mp3',
    ext: 'mp3',
    mimeType: 'audio/mpeg',
    byteLength: bytes.length,
    duration: 1,
  };
  const [first] = project.scenes[0]!.slides;
  first!.baseLayer.timeline.duration = 2;
  first!.baseLayer.objects.push(
    createShapeObject({ kind: 'ellipse' }, { x: 200, y: 200, width: 300, height: 300 }, 'Dot'),
  );
  const second = createSlide('With sound');
  second.baseLayer.timeline.duration = 1.5;
  const tone = createAudioObject(hash, 1, {}, 'Tone');
  tone.timing = { start: 0.25, duration: 'untilEnd' };
  second.baseLayer.objects.push(tone);
  project.scenes[0]!.slides.push(second);

  const file = join(dir, 'video-course.vedraopus');
  const zip = new ZipFile();
  zip.addBuffer(Buffer.from(JSON.stringify(project)), 'project.json');
  zip.addBuffer(bytes, `assets/${hash}.mp3`);
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(file));
  return file;
}

test('the course plays straight through into a WebM video with its sound', async () => {
  test.skip(
    !existsSync(ffmpeg) || !existsSync(ffprobe),
    'ffmpeg is not fetched (npm run fetch:ffmpeg)',
  );
  test.setTimeout(240_000);
  const dir = mkdtempSync(join(tmpdir(), 'vo-e2e-video-'));
  const file = await course(dir);
  const output = join(dir, 'course.webm');
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { open: [[file]], save: [output], message: [1] });
    await page.getByRole('button', { name: 'Open…', exact: true }).click();
    await expect(page.getByTestId('slide-list').locator('.slide-item')).toHaveCount(2);

    await chooseMenuItem(app, 'file.exportVideo');
    const dialog = page.getByTestId('video-dialog');
    // 2 s + 1.5 s, rounded to the second.
    await expect(dialog).toContainText('0:04, at 1280 × 720, as a WebM video');
    await dialog.getByRole('button', { name: 'Export WebM…' }).click();
    await expect(dialog.getByTestId('video-saved')).toHaveText(`Saved to ${output}`, {
      timeout: 180_000,
    });
  } finally {
    await app.close();
  }

  const probe = spawnSync(ffprobe, [
    '-v',
    'error',
    '-show_entries',
    'format=format_name,duration:stream=codec_type,codec_name,width,height',
    '-of',
    'json',
    output,
  ]);
  expect(probe.status).toBe(0);
  const info = JSON.parse(probe.stdout.toString()) as {
    format: { format_name: string; duration: string };
    streams: { codec_type: string; codec_name: string; width?: number; height?: number }[];
  };
  expect(info.format.format_name).toContain('webm');
  const video = info.streams.find((stream) => stream.codec_type === 'video')!;
  expect(video).toMatchObject({ codec_name: 'vp9', width: 1280, height: 720 });
  expect(info.streams.find((stream) => stream.codec_type === 'audio')).toMatchObject({
    codec_name: 'opus',
  });
  expect(Number(info.format.duration)).toBeGreaterThan(3.3);
  expect(Number(info.format.duration)).toBeLessThan(3.8);

  // What each moment shows: the first slide's dot at 1 s, gone on the second slide at 2.8 s,
  // and white at the very top edge (no part of the player's frame). Crops are 2 x 2, as
  // the video's colour planes are half size; the first pixel is read.
  const pixel = (seconds: number, x: number, y: number) => {
    const frame = spawnSync(ffmpeg, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      String(seconds),
      '-i',
      output,
      '-frames:v',
      '1',
      '-vf',
      `crop=2:2:${x}:${y}`,
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      'pipe:1',
    ]);
    return [...frame.stdout.subarray(0, 3)];
  };
  const [red, green, blue] = pixel(1, 350, 350);
  expect(blue).toBeGreaterThan(200);
  expect(red).toBeLessThan(120);
  expect(green).toBeLessThan(160);
  expect(Math.min(...pixel(2.8, 350, 350))).toBeGreaterThan(230);
  expect(Math.min(...pixel(1, 640, 0))).toBeGreaterThan(230);
});

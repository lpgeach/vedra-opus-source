import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  createButtonObject,
  createEmptyProject,
  createId,
  createImageObject,
  createShapeObject,
  createSlide,
  createTextObject,
  plainRichText,
} from '@vedraopus/model';
import type { Project } from '@vedraopus/model';
import { createWriteStream, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ZipFile } from 'yazl';
import { answerDialogs, launchApp } from './launch';

/**
 * The performance budget (docs/briefs/P11.5-hardening.md, part A): a 200-slide
 * project opens in under 3 seconds, and dragging and typing on it keep the
 * editor at 60 frames a second. The numbers are printed for the session log.
 */

const SLIDES = 200;
const FRAME = 1000 / 60;
const fixture = join(import.meta.dirname, '../fixtures/projects/two-slides');
const picture = JSON.parse(readFileSync(join(fixture, 'project.json'), 'utf8')) as Project;
const [hash, meta] = Object.entries(picture.assets)[0]!;

/** A course of `SLIDES` slides, each about as full as a real one. */
function bigCourse(): Project {
  const project = createEmptyProject('Two hundred slides');
  project.assets[hash] = meta;
  project.scenes[0]!.slides = Array.from({ length: SLIDES }, (_, index) => {
    const slide = createSlide(`Slide ${index + 1}`);
    const title = createTextObject(
      `Slide ${index + 1}: what to know`,
      { x: 80, y: 48, width: 1120, height: 80 },
      'Title',
    );
    const body = createTextObject(
      'A paragraph of words about this part of the course.\nAnd a second line.',
      { x: 80, y: 160, width: 640, height: 200 },
      'Body',
    );
    const panel = createShapeObject(
      { kind: 'roundRect', radius: 16 },
      { x: 760, y: 160, width: 400, height: 240 },
      'Panel',
    );
    const dot = createShapeObject(
      { kind: 'ellipse' },
      { x: 80, y: 420, width: 120, height: 120 },
      'Dot',
    );
    const image = createImageObject(hash, { x: 260, y: 420, width: 160, height: 160 }, 'Picture');
    const next = createButtonObject('Next', { x: 1040, y: 600 }, 'Next');
    slide.baseLayer.objects.push(title, body, panel, dot, image, next);
    slide.notes = plainRichText(`Notes for slide ${index + 1}.`);
    slide.triggers.push({
      id: createId('trigger'),
      owner: { kind: 'object', id: next.id },
      event: { type: 'click', object: next.id },
      action: { type: 'jumpToSlide', target: { kind: 'next' } },
      conditions: null,
      otherwise: null,
      enabled: true,
    });
    return slide;
  });
  return project;
}

async function pack(dir: string, project: Project): Promise<string> {
  const target = join(dir, 'big.vedraopus');
  const zip = new ZipFile();
  zip.addBuffer(Buffer.from(JSON.stringify(project)), 'project.json');
  zip.addFile(join(fixture, 'assets', `${hash}.${meta.ext}`), `assets/${hash}.${meta.ext}`);
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(target));
  return target;
}

/** Start counting the time between frames in the page. */
const startFrames = (page: Page) =>
  page.evaluate(() => {
    const state = window as unknown as { voFrames: number[]; voRecording: boolean };
    state.voFrames = [];
    state.voRecording = true;
    let last = performance.now();
    const tick = (now: number) => {
      state.voFrames.push(now - last);
      last = now;
      if (state.voRecording) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

/** Stop counting; the median and 95th percentile frame times, in milliseconds. */
async function stopFrames(page: Page): Promise<{ median: number; p95: number; frames: number }> {
  const frames = await page.evaluate(() => {
    const state = window as unknown as { voFrames: number[]; voRecording: boolean };
    state.voRecording = false;
    return state.voFrames.slice(1);
  });
  const sorted = [...frames].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  return { median: at(0.5), p95: at(0.95), frames: frames.length };
}

test('a 200-slide project opens in under 3 seconds, and editing it keeps 60 frames a second', async () => {
  // Not on macOS at all (Luke, 2026-11-26): CI's shared macOS machine, with no graphics card,
  // misses the frame budget by a frame now and then however the code does. Windows and Linux
  // keep the budget.
  test.skip(process.platform === 'darwin', 'no performance testing on macOS (Luke)');
  test.setTimeout(180_000);
  const dir = mkdtempSync(join(tmpdir(), 'vo-e2e-performance-'));
  const file = await pack(dir, bigCourse());
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { open: [[file]], message: [1] });
    const items = page.getByTestId('slide-list').locator('.slide-item');

    // Opening: from the choice to all 200 slides listed and the stage drawn.
    const opened = Date.now();
    await page.getByRole('button', { name: 'Open…', exact: true }).click();
    await expect(items).toHaveCount(SLIDES, { timeout: 30_000 });
    await expect(
      page.getByTestId('stage-canvas').locator('[data-object-type="button"]'),
    ).toBeVisible();
    const openMs = Date.now() - opened;

    // Dragging the panel across the stage.
    const panel = page.getByTestId('stage-canvas').locator('[data-object-type="shape"]').first();
    const box = (await panel.boundingBox())!;
    await panel.click();
    await startFrames(page);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let step = 1; step <= 90; step++) {
      await page.mouse.move(box.x + box.width / 2 - step * 3, box.y + box.height / 2 + step);
    }
    await page.mouse.up();
    const drag = await stopFrames(page);
    // The frames measured were a real drag: the panel moved.
    const moved = (await panel.boundingBox())!;
    expect(box.x - moved.x).toBeGreaterThan(100);

    // Typing into the body text.
    const body = page.getByTestId('stage-canvas').locator('[data-object-type="text"]').nth(1);
    await body.dblclick();
    await startFrames(page);
    await page.keyboard.type(' More words typed one key at a time, as an author writes them.', {
      delay: 15,
    });
    const typing = await stopFrames(page);
    await page.keyboard.press('Escape');
    // And real typing: the words are in the text.
    await expect(body).toContainText('as an author writes them');

    console.log(
      `performance: open ${openMs} ms; drag median ${drag.median.toFixed(1)} ms, p95 ${drag.p95.toFixed(1)} ms over ${drag.frames} frames; typing median ${typing.median.toFixed(1)} ms, p95 ${typing.p95.toFixed(1)} ms over ${typing.frames} frames`,
    );
    expect(openMs).toBeLessThan(3000);
    expect(drag.median).toBeLessThanOrEqual(FRAME + 0.8);
    expect(drag.p95).toBeLessThanOrEqual(2 * FRAME + 0.8);
    expect(typing.median).toBeLessThanOrEqual(FRAME + 0.8);
    expect(typing.p95).toBeLessThanOrEqual(2 * FRAME + 0.8);
  } finally {
    await app.close();
  }
});

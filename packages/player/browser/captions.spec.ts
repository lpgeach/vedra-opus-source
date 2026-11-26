import {
  createAudioObject,
  createEmptyProject,
  createId,
  createScene,
  createSlide,
} from '@vedraopus/model';
import type { CaptionCue, Project } from '@vedraopus/model';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { wav } from '../../../fixtures/make-media';

const dist = join(import.meta.dirname, '../dist');
const cue = (start: number, end: number, text: string): CaptionCue => ({
  id: createId('caption'),
  start,
  end,
  text,
});

/** Two slides, each with a 3 s sound carrying `captions(slide)`, in a page on disk. */
function course(captions: (slide: number) => CaptionCue[]) {
  const bytes = wav(3);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const project: Project = createEmptyProject('Captioned');
  project.assets[hash] = {
    kind: 'audio',
    fileName: 't.wav',
    ext: 'wav',
    mimeType: 'audio/wav',
    byteLength: bytes.length,
  };
  const slides = [0, 1].map((index) => {
    const slide = createSlide(`S${index + 1}`);
    slide.baseLayer.timeline.duration = 5;
    const audio = createAudioObject(hash, 3, {}, `Narration ${index + 1}`);
    audio.props.captions = captions(index);
    slide.baseLayer.objects.push(audio);
    return slide;
  });
  project.scenes = [{ ...createScene(), slides }];
  const dir = mkdtempSync(join(tmpdir(), 'vedraopus-player-captions-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', `${hash}.wav`), bytes);
  cpSync(join(dist, 'player.js'), join(dir, 'player.js'));
  cpSync(join(dist, 'player.css'), join(dir, 'player.css'));
  writeFileSync(
    join(dir, 'index.html'),
    `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="player.css">
<style>html,body{margin:0;height:100%}#app{width:100%;height:100%}</style></head>
<body><div id="app"></div><script src="player.js"></script></body></html>`,
  );
  return { url: pathToFileURL(join(dir, 'index.html')).href, project };
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

test('no CC button for a course without captions', async ({ page }) => {
  const { url, project } = course(() => []);
  await mount(page, url, project);
  await expect(page.locator('.vo-player-position')).toHaveText('Slide 1 of 2');
  await expect(page.getByRole('button', { name: 'Captions' })).toBeHidden();
});

test('CC shows the captions in time with the sound, hides them, and stays on across slides', async ({
  page,
}) => {
  const { url, project } = course((slide) =>
    slide === 0
      ? [cue(0, 1.2, 'Welcome'), cue(1.2, 3, 'to the course')]
      : [cue(0, 3, 'Slide two speaking')],
  );
  await mount(page, url, project);
  const button = page.getByRole('button', { name: 'Captions' });
  const band = page.getByTestId('player-captions');
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  // Off until the learner asks.
  await expect(band).toBeHidden();

  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(band).toBeVisible();
  await expect(band).toHaveText(/Welcome|to the course/);
  await expect(band).toHaveText('to the course', { timeout: 4000 });
  // For the eye only.
  await expect(band).toHaveAttribute('aria-hidden', 'true');

  await button.click();
  await expect(band).toBeHidden();
  await button.click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.vo-player-position')).toHaveText('Slide 2 of 2');
  await expect(band).toHaveText('Slide two speaking');
  await expect(band).toBeVisible();
});

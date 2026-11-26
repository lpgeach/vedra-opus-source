import {
  createBank,
  createDrawSlide,
  createEmptyProject,
  createQuestionSlide,
  createScene,
  createSlide,
} from '@vedraopus/model';
import type { Project } from '@vedraopus/model';
import { expect, test } from '@playwright/test';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Drawn questions in a course (docs/briefs/P7.6-banks-and-draws.md). */

const dist = join(import.meta.dirname, '../dist');

function page(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vedraopus-player-banks-'));
  cpSync(join(dist, 'player.js'), join(dir, 'player.js'));
  cpSync(join(dist, 'player.css'), join(dir, 'player.css'));
  writeFileSync(
    join(dir, 'index.html'),
    `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="player.css">
<style>html,body{margin:0;height:100%}#app{width:1280px;height:800px}</style></head>
<body><div id="app"></div><script src="player.js"></script></body></html>`,
  );
  return pathToFileURL(join(dir, 'index.html')).href;
}

test('a draw of 2 from a bank of 3 plays two of them, and the slide numbers count them', async ({
  page: browserPage,
}) => {
  const project: Project = createEmptyProject('Drawn');
  const pool = createBank('Pool', project.stage);
  pool.slides.push(
    createQuestionSlide('trueFalse', project.stage),
    createQuestionSlide('numeric', project.stage),
  );
  pool.slides.forEach((slide, n) => {
    slide.question!.required = false;
    slide.title = `Question ${n + 1}`;
  });
  project.banks = [pool];
  const draw = createDrawSlide(pool.id);
  project.scenes = [{ ...createScene(), slides: [createSlide('Intro'), draw, createSlide('End')] }];
  await browserPage.goto(page());
  await browserPage.evaluate((data) => {
    const w = window as unknown as Record<string, unknown>;
    w['player'] = (
      w['VedraOpusPlayer'] as { mountPlayer: (...args: unknown[]) => unknown }
    ).mountPlayer(document.getElementById('app'), data, {});
  }, project);
  const position = browserPage.locator('.vo-player-position');
  const next = browserPage.getByRole('button', { name: 'Next' });
  await expect(position).toHaveText('Slide 1 of 4');
  const seen: string[] = [];
  for (const n of [2, 3]) {
    await next.click();
    await expect(position).toHaveText(`Slide ${n} of 4`);
    // Which bank question this is: its own objects are on the stage.
    const ids = await browserPage
      .locator('.vo-player-stage [data-object-id]')
      .evaluateAll((elements) => elements.map((e) => e.getAttribute('data-object-id')));
    const which = pool.slides.findIndex((slide) =>
      slide.baseLayer.objects.some((object) => ids.includes(object.id)),
    );
    expect(which).toBeGreaterThanOrEqual(0);
    seen.push(pool.slides[which]!.id);
  }
  expect(new Set(seen).size).toBe(2);
  await next.click();
  await expect(position).toHaveText('Slide 4 of 4');
});

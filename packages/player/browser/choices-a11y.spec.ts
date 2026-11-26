import {
  createEmptyProject,
  createQuestionSlide,
  createScene,
  createSlide,
} from '@vedraopus/model';
import type { Project } from '@vedraopus/model';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Question choices for keyboard and screen-reader users (the Phase 7 review). */

const dist = join(import.meta.dirname, '../dist');

async function mount(browserPage: Page, project: Project) {
  const dir = mkdtempSync(join(tmpdir(), 'vedraopus-player-a11y-'));
  cpSync(join(dist, 'player.js'), join(dir, 'player.js'));
  cpSync(join(dist, 'player.css'), join(dir, 'player.css'));
  writeFileSync(
    join(dir, 'index.html'),
    `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="player.css">
<style>html,body{margin:0;height:100%}#app{width:1280px;height:800px}</style></head>
<body><div id="app"></div><script src="player.js"></script></body></html>`,
  );
  await browserPage.goto(pathToFileURL(join(dir, 'index.html')).href);
  await browserPage.evaluate((data) => {
    const w = window as unknown as Record<string, unknown>;
    w['player'] = (
      w['VedraOpusPlayer'] as { mountPlayer: (...args: unknown[]) => unknown }
    ).mountPlayer(document.getElementById('app'), data, {});
  }, project);
}

test('choices are radio buttons or checkboxes, named, checked, and chosen with the keyboard', async ({
  page: browserPage,
}) => {
  const project = createEmptyProject('Choices');
  const one = createQuestionSlide('multipleChoice', project.stage);
  const many = createQuestionSlide('multipleResponse', project.stage);
  const likert = createQuestionSlide('likert', project.stage);
  project.scenes = [{ ...createScene(), slides: [one, many, likert, createSlide('End')] }];
  await mount(browserPage, project);

  const radios = browserPage.getByRole('radio');
  await expect(radios).toHaveCount(3);
  const second = browserPage.getByRole('radio', { name: 'Second answer', exact: true });
  await expect(second).toHaveAttribute('aria-checked', 'false');
  // Tab to it and press Space: chosen, as a click chooses it.
  await second.focus();
  await browserPage.keyboard.press('Space');
  await expect(second).toHaveAttribute('aria-checked', 'true');
  const first = browserPage.getByRole('radio', { name: 'First answer', exact: true });
  await first.focus();
  await browserPage.keyboard.press('Enter');
  await expect(first).toHaveAttribute('aria-checked', 'true');
  await expect(second).toHaveAttribute('aria-checked', 'false');

  // Multiple response: checkboxes.
  await browserPage.evaluate((id) => {
    (
      window as unknown as { player: { engine: { jumpToSlide: (s: string) => void } } }
    ).player.engine.jumpToSlide(id);
  }, many.id);
  await expect(browserPage.getByRole('checkbox')).toHaveCount(3);

  // Likert: each point named by its statement and its place on the scale.
  await browserPage.evaluate((id) => {
    (
      window as unknown as { player: { engine: { jumpToSlide: (s: string) => void } } }
    ).player.engine.jumpToSlide(id);
  }, likert.id);
  await expect(
    browserPage.getByRole('radio', { name: 'First statement: Strongly agree', exact: true }),
  ).toHaveCount(1);
  await expect(browserPage.getByRole('radio')).toHaveCount(15);
});

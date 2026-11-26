import {
  createEmptyProject,
  createQuestionSlide,
  createResultSlide,
  createScene,
} from '@vedraopus/model';
import type { ChoiceQuestion, Project } from '@vedraopus/model';
import { expect, test } from '@playwright/test';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Result slides in a course (docs/briefs/P7.7-result-slides.md). */

const dist = join(import.meta.dirname, '../dist');

function page(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vedraopus-player-results-'));
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

test('two questions, then the result: the score, Print, Retry and Review', async ({
  page: browserPage,
}) => {
  const project: Project = createEmptyProject('Results');
  const q1 = createQuestionSlide('multipleChoice', project.stage);
  const q2 = createQuestionSlide('trueFalse', project.stage);
  for (const slide of [q1, q2]) slide.question!.feedback.by = 'none';
  const result = createResultSlide(project.stage);
  project.scenes = [{ ...createScene(), slides: [q1, q2, result] }];
  await browserPage.goto(page());
  await browserPage.evaluate((data) => {
    const w = window as unknown as Record<string, unknown>;
    w['printed'] = [];
    w['player'] = (
      w['VedraOpusPlayer'] as { mountPlayer: (...args: unknown[]) => unknown }
    ).mountPlayer(document.getElementById('app'), data, {
      onPrintResults: (_summary: unknown, html: string) => (w['printed'] as string[]).push(html),
    });
  }, project);
  const object = (id: string) =>
    browserPage.locator(`.vo-player-stage [data-object-id="${id}"]`).first();
  const position = browserPage.locator('.vo-player-position');
  const [a, b] = [q1.question as ChoiceQuestion, q2.question as ChoiceQuestion];

  // Right, then wrong: 10 of 20, 50%, below 80.
  await object(a.choices[0]!.object).click();
  await object(a.submit!).click();
  await object(b.choices[1]!.object).click();
  await object(b.submit!).click();
  await expect(position).toHaveText('Slide 3 of 3');
  await expect(
    browserPage.getByText('You scored 50% (10 of 20 points). To pass: 80%.'),
  ).toBeVisible();
  await expect(
    browserPage.getByText('You did not pass this time.', { exact: false }),
  ).toBeVisible();

  const button = (label: string) => {
    const id = result.baseLayer.objects.find((each) => each.name === label)!.id;
    return object(id);
  };
  await button('Print').click();
  const printed = await browserPage.evaluate(
    () => (window as unknown as Record<string, string[]>)['printed']!,
  );
  expect(printed).toHaveLength(1);
  expect(printed[0]).toContain('Score: 10 of 20 (50%)');
  expect(printed[0]).toContain('Not passed');

  // Review: the first question, marked, and back to the result past the last.
  await button('Review').click();
  await expect(position).toHaveText('Slide 1 of 3');
  await expect(browserPage.locator('.vo-review-banner')).toHaveText(
    'Review: you answered this correctly',
  );
  await browserPage.getByRole('button', { name: 'Next' }).click();
  await browserPage.getByRole('button', { name: 'Next' }).click();
  await expect(position).toHaveText('Slide 3 of 3');
  await expect(browserPage.locator('.vo-review-banner')).toBeHidden();

  // Retry: back to the first question, unanswered.
  await button('Retry').click();
  await expect(position).toHaveText('Slide 1 of 3');
  await expect(object(a.choices[0]!.object)).toHaveAttribute('data-state', 'normal');
});

import { parseProject } from '@vedraopus/model';
import type { Project } from '@vedraopus/model';
import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readGolden } from '../fixtures/golden';
import type { GoldenSnapshot } from '../fixtures/golden';
import { packFixture } from './fixture';
import { answerDialogs, launchApp } from './launch';

const FIXTURE = 'states-and-triggers';
const project: Project = parseProject(
  JSON.parse(
    readFileSync(
      join(import.meta.dirname, '../fixtures/projects', FIXTURE, 'project.json'),
      'utf8',
    ),
  ),
);
const golden = readGolden(FIXTURE);
const slides = project.scenes.flatMap((scene) => scene.slides);
const allObjects = slides.flatMap((slide) =>
  [slide.baseLayer, ...slide.layers].flatMap((layer) => layer.objects),
);
const idOf = (name: string) => allObjects.find((object) => object.name === name)!.id;
const names: Record<string, string> = Object.fromEntries([
  ...allObjects.map((o) => [o.id, o.name]),
  ...slides.flatMap((s) => [s.baseLayer, ...s.layers].map((l) => [l.id, l.name])),
]);

/** The same facts as the engine test reads, but from what the player put on the page. */
async function readPage(page: Page, expected: GoldenSnapshot): Promise<GoldenSnapshot> {
  const raw = await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="player-stage"]')!;
    // Each slide is drawn in its own container (P6.6), the one being left marked as leaving.
    const containers = [
      ...stage.querySelectorAll<HTMLElement>(
        ':scope > .vo-player-slide:not(.vo-player-leaving) > .vo-player-layer',
      ),
    ];
    const shown = containers.filter((c) => c.style.display !== 'none');
    const objects = (container: HTMLElement) => [
      ...container.querySelectorAll<HTMLElement>(':scope > [data-object-id]'),
    ];
    return {
      position: document.querySelector('.vo-player-position')!.textContent ?? '',
      layers: shown.slice(1).map((c) => c.dataset['layerId']!),
      visible: shown.flatMap((c) =>
        objects(c)
          .filter((o) => o.style.display !== 'none')
          .map((o) => o.dataset['objectId']!),
      ),
      states: Object.fromEntries(
        containers.flatMap(objects).map((o) => [o.dataset['objectId']!, o.dataset['state']!]),
      ),
      text: Object.fromEntries(
        containers
          .flatMap(objects)
          .map((o) => [o.dataset['objectId']!, (o.textContent ?? '').trim()]),
      ),
    };
  });
  const number = Number(/Slide (\d+)/.exec(raw.position)![1]);
  return {
    slide: slides[number - 1]!.title,
    layers: raw.layers.map((id) => names[id]!),
    visible: raw.visible.map((id) => names[id]!),
    states: Object.fromEntries(Object.keys(expected.states).map((n) => [n, raw.states[idOf(n)]!])),
    text: Object.fromEntries(Object.keys(expected.text).map((n) => [n, raw.text[idOf(n)]!])),
  };
}

async function playGolden(page: Page): Promise<void> {
  const failed: string[] = [];
  page.on('pageerror', (error) => failed.push(error.message));
  await expect(page.locator('.vo-player-position')).toBeVisible();
  for (const [index, step] of golden.steps.entries()) {
    if (step.click) {
      await page.locator(`[data-object-id="${idOf(step.click)}"]`).click();
      // Move away, as the engine run's pointer leaves after each click.
      await page.mouse.move(1, 1);
    }
    await expect
      .poll(() => readPage(page, step.expect), { message: `step ${index}`, timeout: 5000 })
      .toEqual(step.expect);
  }
  expect(failed).toEqual([]);
}

test('the states-and-triggers golden run plays identically in preview and in a published course', async () => {
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-golden-'));
  const file = await packFixture(work, FIXTURE);
  const { app, page } = await launchApp({ args: [file] });
  const out = join(work, 'out');
  try {
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await answerDialogs(app, { open: [[out]], message: [1] });

    // Preview.
    const [preview] = await Promise.all([
      app.waitForEvent('window'),
      page.getByRole('button', { name: 'Entire Project', exact: true }).click(),
    ]);
    await playGolden(preview);
    await preview.close();

    // Publish, then play the output from disk in a plain browser.
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const dialog = page.getByTestId('publish-dialog');
    await dialog.getByRole('button', { name: 'Choose folder…' }).click();
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-result')).toBeVisible();
  } finally {
    await app.close();
  }
  const browser = await chromium.launch();
  try {
    const published = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await published.goto(pathToFileURL(join(out, 'states-and-triggers', 'index.html')).href);
    await playGolden(published);
  } finally {
    await browser.close();
  }
});

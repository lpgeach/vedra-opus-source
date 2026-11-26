import {
  createButtonObject,
  createEmptyProject,
  createId,
  createLayer,
  createScene,
  createSlide,
  createTextObject,
} from '@vedraopus/model';
import type { Project } from '@vedraopus/model';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * The text view (docs/briefs/P10.1-accessibility.md, part C): the slide's text
 * in reading order beside the slide, at the learner's size, following layers;
 * remembered; and reflowing at 320 CSS pixels wide.
 */

const dist = join(import.meta.dirname, '../dist');
const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

function page(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vedraopus-player-text-view-'));
  cpSync(join(dist, 'player.js'), join(dir, 'player.js'));
  cpSync(join(dist, 'player.css'), join(dir, 'player.css'));
  writeFileSync(
    join(dir, 'index.html'),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Course</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="player.css">
<style>html,body{margin:0;height:100%}#app{width:100vw;height:100vh}</style></head>
<body><div id="app"></div><script src="player.js"></script></body></html>`,
  );
  return pathToFileURL(join(dir, 'index.html')).href;
}

async function mount(browserPage: Page, project: Project, url = page()) {
  await browserPage.goto(url);
  await browserPage.evaluate((data) => {
    const w = window as unknown as Record<string, unknown>;
    w['player'] = (
      w['VedraOpusPlayer'] as { mountPlayer: (...args: unknown[]) => unknown }
    ).mountPlayer(document.getElementById('app'), data, { reducedMotion: true });
  }, project);
  return url;
}

/** Two slides: words, and a button that shows a layer; then a long paragraph. */
function course(): Project {
  const project = createEmptyProject('Reading');
  const first = createSlide('Welcome');
  const more = createLayer('More');
  more.objects.push(createTextObject('Words on the layer', { x: 100, y: 500 }));
  first.layers.push(more);
  const show = createButtonObject('Show more', { x: 100, y: 300 });
  first.baseLayer.objects.push(
    createTextObject('Read this first', { x: 100, y: 100 }),
    show,
    createTextObject('Then this', { x: 100, y: 200 }),
  );
  first.triggers.push({
    id: createId('trigger'),
    owner: { kind: 'object', id: show.id },
    event: { type: 'click', object: show.id },
    action: { type: 'showLayer', layer: more.id },
    conditions: null,
    otherwise: null,
    enabled: true,
  });
  const second = createSlide('Next steps');
  second.baseLayer.objects.push(
    createTextObject(
      'A long paragraph that must wrap inside the text view, however narrow the window, ' +
        'with averyveryverylongwordthatwouldotherwisemaketheviewscrollsideways in it.',
      { x: 100, y: 100, width: 1000 },
    ),
  );
  project.scenes = [{ ...createScene(), slides: [first, second] }];
  return project;
}

const panel = (browserPage: Page) => browserPage.getByRole('complementary', { name: 'Slide text' });

async function turnOn(browserPage: Page, size?: string) {
  // On a narrow screen the panel's button is behind More (P8.5).
  const more = browserPage.getByRole('button', { name: 'More', exact: true });
  if (await more.isVisible()) await more.click();
  await browserPage.getByRole('button', { name: 'Accessibility', exact: true }).click();
  const dialog = browserPage.getByRole('dialog', { name: 'Accessibility' });
  await dialog.getByLabel('Text view').check();
  if (size) await dialog.getByLabel('Text size').selectOption(size);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
}

test('the text view shows the slide’s text in order, follows layers and slides, and is remembered', async ({
  page: browserPage,
}) => {
  const project = course();
  const url = await mount(browserPage, project);
  await expect(panel(browserPage)).toBeHidden();
  await turnOn(browserPage);
  const view = panel(browserPage);
  await expect(view).toBeVisible();
  await expect(view.locator('h2')).toHaveText('Welcome');
  // The button is read too (its words), in layout order.
  await expect(view.locator('p')).toHaveText(['Read this first', 'Then this', 'Show more']);
  // Beside the slide, not over it.
  const stage = (await browserPage.locator('.vo-player-viewport').boundingBox())!;
  const beside = (await view.boundingBox())!;
  expect(beside.x).toBeGreaterThanOrEqual(stage.x + stage.width - 1);

  // A layer shown adds its words.
  await browserPage.locator('.vo-player-stage').getByRole('button', { name: 'Show more' }).click();
  await expect(view.locator('p').last()).toHaveText('Words on the layer');

  // The next slide's text replaces it.
  await browserPage.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(view.locator('h2')).toHaveText('Next steps');

  // Bigger text: 200 % of the 16 px it starts at.
  const fontSize = () =>
    view
      .locator('p')
      .first()
      .evaluate((element) => getComputedStyle(element).fontSize);
  expect(await fontSize()).toBe('16px');
  await browserPage.getByRole('button', { name: 'Accessibility', exact: true }).click();
  await browserPage
    .getByRole('dialog', { name: 'Accessibility' })
    .getByLabel('Text size')
    .selectOption('200');
  expect(await fontSize()).toBe('32px');

  // The same course in the same browser again: on, at 200 %.
  await mount(browserPage, project, url);
  await expect(panel(browserPage)).toBeVisible();
  expect(
    await panel(browserPage)
      .locator('p')
      .first()
      .evaluate((element) => getComputedStyle(element).fontSize),
  ).toBe('32px');
  await browserPage.getByRole('button', { name: 'Accessibility', exact: true }).click();
  await expect(
    browserPage.getByRole('dialog', { name: 'Accessibility' }).getByLabel('Text view'),
  ).toBeChecked();
});

test('at 320 CSS pixels wide the text view goes below the slide and wraps, with nothing sideways', async ({
  page: browserPage,
}) => {
  await browserPage.setViewportSize({ width: 320, height: 640 });
  await mount(browserPage, course());
  await turnOn(browserPage, '200');
  await browserPage.getByRole('button', { name: 'Next', exact: true }).click();
  const view = panel(browserPage);
  await expect(view.locator('h2')).toHaveText('Next steps');
  const stage = (await browserPage.locator('.vo-player-viewport').boundingBox())!;
  const below = (await view.boundingBox())!;
  expect(below.y).toBeGreaterThanOrEqual(stage.y + stage.height - 1);
  expect(below.width).toBeLessThanOrEqual(320);
  // Nothing scrolls sideways: not the page, not the view.
  const widths = await view.evaluate((element) => ({
    page: document.documentElement.scrollWidth,
    view: element.scrollWidth,
    shown: element.clientWidth,
  }));
  expect(widths.page).toBeLessThanOrEqual(320);
  expect(widths.view).toBeLessThanOrEqual(widths.shown);
  // WCAG 1.4.12: the learner's own spacing fits too.
  await browserPage.addStyleTag({
    content:
      '.vo-player-text-view * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } .vo-player-text-view p { margin-bottom: 2em !important; }',
  });
  expect(await view.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test('axe finds nothing with the text view on', async ({ page: browserPage }) => {
  await mount(browserPage, course());
  await turnOn(browserPage, '150');
  await browserPage.addScriptTag({ path: axePath });
  const found = await browserPage.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run(
            ...args: unknown[]
          ): Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }>;
        };
      }
    ).axe;
    const result = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    });
    return result.violations.map((each) => each.id);
  });
  expect(found).toEqual([]);
});

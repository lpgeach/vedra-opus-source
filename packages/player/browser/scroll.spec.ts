import {
  createButtonObject,
  createEmptyProject,
  createGroupObject,
  createId,
  createScene,
  createShapeObject,
  createSlide,
} from '@vedraopus/model';
import type { Project } from '@vedraopus/model';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Scrolling panels (docs/briefs/P9.5-scrolling-panels.md). */

const dist = join(import.meta.dirname, '../dist');

function page(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vo-player-scroll-'));
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

async function mount(browserPage: Page, project: Project) {
  await browserPage.goto(page());
  await browserPage.evaluate((data) => {
    const w = window as unknown as Record<string, unknown>;
    w['player'] = (
      w['VedraOpusPlayer'] as { mountPlayer: (...args: unknown[]) => unknown }
    ).mountPlayer(document.getElementById('app'), data, {});
  }, project);
}

/**
 * A panel 600 high that shows its top 200: a tall shape, and at the bottom a
 * button whose trigger counts its presses.
 */
function course() {
  const project = createEmptyProject('Scroll');
  const pressed = { id: createId('var'), name: 'Pressed', type: 'number' as const, default: 0 };
  project.variables.push(pressed);
  const slide = createSlide('One');
  const tall = createShapeObject({ kind: 'rect' }, { x: 100, y: 100, width: 400, height: 500 });
  const button = createButtonObject('Deep', { x: 150, y: 620, width: 200, height: 60 });
  const panel = createGroupObject([tall, button], 'Reading');
  panel.scroll = { height: 200 };
  panel.timing = { start: 0, duration: 'untilEnd' };
  slide.baseLayer.objects.push(panel);
  slide.triggers.push({
    id: createId('trigger'),
    owner: { kind: 'object', id: button.id },
    event: { type: 'click', object: button.id },
    action: {
      type: 'setVariable',
      variable: pressed.id,
      operator: 'add',
      operand: { kind: 'literal', value: 1 },
    },
    conditions: null,
    otherwise: null,
    enabled: true,
  });
  project.scenes = [{ ...createScene(), slides: [slide, createSlide('Two')] }];
  return { project, button };
}

const scrollTop = (p: Page) =>
  p.locator('.vo-scroll-panel').evaluate((element) => element.scrollTop);

test('a scrolling panel clips to its window, a named region the wheel and keys scroll', async ({
  page: browserPage,
}) => {
  const { project, button } = course();
  await mount(browserPage, project);
  const panel = browserPage.getByRole('region', { name: 'Reading', exact: true });
  await expect(panel).toBeVisible();
  // The window is 200 of the panel's 580 (from y 100 to 680), drawn at the stage's scale.
  const box = (await panel.boundingBox())!;
  const scale = Number(await browserPage.locator('.vo-player-stage').getAttribute('data-scale'));
  expect(box.height).toBeCloseTo(200 * scale, 0);
  // The deep button is below the window.
  await expect(browserPage.locator(`[data-object-id="${button.id}"]`)).not.toBeInViewport();
  expect(await scrollTop(browserPage)).toBe(0);
  await panel.hover();
  await browserPage.mouse.wheel(0, 300);
  await expect.poll(() => scrollTop(browserPage)).toBeGreaterThan(0);
  // Keys scroll it while it has focus, and do not change slides.
  await panel.evaluate((element) => (element.scrollTop = 0));
  await panel.focus();
  await browserPage.keyboard.press('End');
  await expect.poll(() => scrollTop(browserPage)).toBeGreaterThan(0);
  await browserPage.keyboard.press('Home');
  await expect.poll(() => scrollTop(browserPage)).toBe(0);
  await browserPage.keyboard.press('PageDown');
  await expect.poll(() => scrollTop(browserPage)).toBeGreaterThan(0);
  await expect(browserPage.locator('.vo-player-position')).toHaveText('Slide 1 of 2');
});

test('a button scrolled into view runs its trigger, and the panel stays where it was scrolled', async ({
  page: browserPage,
}) => {
  const { project, button } = course();
  await mount(browserPage, project);
  const deep = browserPage.locator(`[data-object-id="${button.id}"]`);
  await deep.scrollIntoViewIfNeeded();
  const before = await scrollTop(browserPage);
  expect(before).toBeGreaterThan(0);
  await deep.click();
  await expect
    .poll(() =>
      browserPage.evaluate(() =>
        (
          window as unknown as { player: { engine: { getVariable(name: string): unknown } } }
        ).player.engine.getVariable('Pressed'),
      ),
    )
    .toBe(1);
  // Pressing the button redrew the panel; it did not jump back to the top.
  expect(await scrollTop(browserPage)).toBe(before);
});

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

/** The player on small screens and touch (docs/briefs/P8.5-responsive.md). */

const dist = join(import.meta.dirname, '../dist');

/** A page whose player fills the window, as a published course's does. */
function page(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vedraopus-player-responsive-'));
  cpSync(join(dist, 'player.js'), join(dir, 'player.js'));
  cpSync(join(dist, 'player.css'), join(dir, 'player.css'));
  writeFileSync(
    join(dir, 'index.html'),
    `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="player.css">
<style>html,body{margin:0;height:100%}#app{width:100vw;height:100vh}</style></head>
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

function course(change: (project: Project) => void = () => {}) {
  const project = createEmptyProject('Responsive');
  project.scenes = [
    { ...createScene(), slides: [createSlide('One'), createSlide('Two'), createSlide('Three')] },
  ];
  change(project);
  return project;
}

const position = (p: Page) => p.locator('.vo-player-position');

/** A finger (or the mouse) moving across the course from (x, y) by dx, quickly. */
async function swipe(p: Page, x: number, y: number, dx: number, pointerType = 'touch') {
  await p.evaluate(
    ([sx, sy, ddx, type]) => {
      const at = document.elementFromPoint(sx as number, sy as number)!;
      const init = { bubbles: true, pointerId: 7, isPrimary: true, pointerType: type as string };
      at.dispatchEvent(
        new PointerEvent('pointerdown', { ...init, clientX: sx as number, clientY: sy as number }),
      );
      at.dispatchEvent(
        new PointerEvent('pointerup', {
          ...init,
          clientX: (sx as number) + (ddx as number),
          clientY: sy as number,
        }),
      );
    },
    [x, y, dx, pointerType] as const,
  );
}

test('the stage fits the window and keeps its shape, at phone and desktop sizes', async ({
  page: browserPage,
}) => {
  const project = course();
  const ratio = project.stage.width / project.stage.height;
  for (const size of [
    { width: 375, height: 667 },
    { width: 667, height: 375 },
    { width: 1920, height: 1080 },
  ]) {
    await browserPage.setViewportSize(size);
    await mount(browserPage, project);
    const stage = (await browserPage.locator('.vo-player-stage').boundingBox())!;
    const viewport = (await browserPage.locator('.vo-player-viewport').boundingBox())!;
    expect(stage.width / stage.height).toBeCloseTo(ratio, 1);
    expect(stage.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(stage.height).toBeLessThanOrEqual(viewport.height + 1);
    // It fills one way or the other.
    expect(Math.max(stage.width / viewport.width, stage.height / viewport.height)).toBeCloseTo(
      1,
      1,
    );
  }
});

test('below 640 pixels the frame is compact: More shows the extra controls, and the menu covers the course', async ({
  page: browserPage,
}) => {
  await browserPage.setViewportSize({ width: 800, height: 600 });
  await mount(browserPage, course());
  const player = browserPage.locator('.vo-player');
  await expect(player).not.toHaveAttribute('data-compact', 'true');
  await expect(browserPage.getByRole('button', { name: 'More', exact: true })).toBeHidden();
  await expect(browserPage.getByRole('slider', { name: 'Volume', exact: true })).toBeVisible();

  await browserPage.setViewportSize({ width: 375, height: 667 });
  await expect(player).toHaveAttribute('data-compact', 'true');
  const more = browserPage.getByRole('button', { name: 'More', exact: true });
  await expect(more).toBeVisible();
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  // Previous, the count and Next stay; volume waits behind More.
  await expect(browserPage.getByRole('button', { name: 'Next', exact: true })).toBeVisible();
  await expect(browserPage.getByRole('slider', { name: 'Volume', exact: true })).toBeHidden();
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect(browserPage.getByRole('slider', { name: 'Volume', exact: true })).toBeVisible();
  // On a row above Previous and Next.
  const volume = (await browserPage
    .getByRole('slider', { name: 'Volume', exact: true })
    .boundingBox())!;
  const next = (await browserPage
    .getByRole('button', { name: 'Next', exact: true })
    .boundingBox())!;
  expect(volume.y + volume.height).toBeLessThanOrEqual(next.y + 1);
  await more.click();
  await expect(browserPage.getByRole('slider', { name: 'Volume', exact: true })).toBeHidden();

  await browserPage.getByRole('button', { name: 'Menu', exact: true }).click();
  const menu = (await browserPage.locator('.vo-player-menu').boundingBox())!;
  const viewport = (await browserPage.locator('.vo-player-viewport').boundingBox())!;
  expect(Math.round(menu.width)).toBe(Math.round(viewport.width));
  // Wide again: not compact, and More closes.
  await browserPage.setViewportSize({ width: 900, height: 600 });
  await expect(player).not.toHaveAttribute('data-compact', 'true');
});

test('a touch swipe changes slides; a mouse drag does not; hidden Next stops it', async ({
  page: browserPage,
}) => {
  await browserPage.setViewportSize({ width: 375, height: 667 });
  await mount(
    browserPage,
    course((p) => {
      p.scenes[0]!.slides[2]!.properties.controls.previous = false;
    }),
  );
  const box = (await browserPage.locator('.vo-player-stage').boundingBox())!;
  const x = box.x + box.width * 0.7;
  const y = box.y + box.height / 2;
  await swipe(browserPage, x, y, -120);
  await expect(position(browserPage)).toHaveText('Slide 2 of 3');
  await swipe(browserPage, x, y, -120, 'mouse');
  await expect(position(browserPage)).toHaveText('Slide 2 of 3');
  await swipe(browserPage, box.x + box.width * 0.2, y, 120);
  await expect(position(browserPage)).toHaveText('Slide 1 of 3');
  await swipe(browserPage, x, y, -120);
  await swipe(browserPage, x, y, -120);
  await expect(position(browserPage)).toHaveText('Slide 3 of 3');
  // Slide 3 hides Previous: a swipe back does nothing, as the key would.
  await swipe(browserPage, box.x + box.width * 0.2, y, 120);
  await expect(position(browserPage)).toHaveText('Slide 3 of 3');
});

test('a swipe that starts on a drag tile is the tile’s, not a slide change', async ({
  page: browserPage,
}) => {
  await browserPage.setViewportSize({ width: 375, height: 667 });
  const project = course((p) => {
    p.scenes[0]!.slides.splice(0, 1, createQuestionSlide('sequenceDrag', p.stage));
  });
  await mount(browserPage, project);
  const tile = browserPage.locator('.vo-player-stage [data-draggable="true"]').first();
  const box = (await tile.boundingBox())!;
  await swipe(browserPage, box.x + box.width / 2, box.y + box.height / 2, -120);
  await expect(position(browserPage)).toHaveText('Slide 1 of 3');
});

test('a landscape course on a portrait phone suggests turning it, until dismissed', async ({
  page: browserPage,
}) => {
  await browserPage.setViewportSize({ width: 375, height: 667 });
  await mount(browserPage, course());
  const hint = browserPage.getByRole('status').filter({ hasText: 'Turn your device sideways' });
  await expect(hint).toBeVisible();
  await expect(browserPage.locator('.vo-player')).toHaveAttribute('data-orientation', 'portrait');
  // Turned: no hint.
  await browserPage.setViewportSize({ width: 667, height: 375 });
  await expect(hint).toBeHidden();
  await expect(browserPage.locator('.vo-player')).toHaveAttribute('data-orientation', 'landscape');
  await browserPage.setViewportSize({ width: 375, height: 667 });
  await expect(hint).toBeVisible();
  await hint.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(hint).toBeHidden();
  await browserPage.setViewportSize({ width: 667, height: 375 });
  await browserPage.setViewportSize({ width: 375, height: 667 });
  await expect(hint).toBeHidden();
});

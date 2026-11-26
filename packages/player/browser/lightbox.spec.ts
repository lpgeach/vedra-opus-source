import {
  createButtonObject,
  createEmptyProject,
  createId,
  createScene,
  createSlide,
} from '@vedraopus/model';
import type { Project, Trigger, TriggerAction } from '@vedraopus/model';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Lightbox slides (docs/briefs/P8.4-lightbox.md). */

const dist = join(import.meta.dirname, '../dist');

function page(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vedraopus-player-lightbox-'));
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

const onClick = (slideId: string, objectId: string, action: TriggerAction): Trigger => ({
  id: createId('trigger'),
  owner: { kind: 'object', id: objectId },
  event: { type: 'click', object: objectId },
  action,
  conditions: null,
  otherwise: null,
  enabled: true,
});

/** Three slides; One has a button opening Two as a lightbox, with or without controls. */
function course(controls: boolean) {
  const project = createEmptyProject('Lightbox');
  const one = createSlide('One');
  const open = createButtonObject('Open the box', { x: 100, y: 100 });
  open.timing = { start: 0, duration: 'untilEnd' };
  one.baseLayer.objects.push(open);
  const two = createSlide('Two');
  const inside = createButtonObject('Inside', { x: 300, y: 300 });
  inside.timing = { start: 0, duration: 'untilEnd' };
  two.baseLayer.objects.push(inside);
  const three = createSlide('Three');
  one.triggers.push(onClick(one.id, open.id, { type: 'openLightbox', slide: two.id, controls }));
  project.scenes = [{ ...createScene(), slides: [one, two, three] }];
  project.player.tabs.custom = [
    { id: 'tab_box', label: 'Three in a box', lightbox: { slide: three.id, controls: false } },
  ];
  return { project, one, two, three, open, inside };
}

const playing = (p: Page) =>
  p.evaluate(
    () =>
      (
        window as unknown as { player: { engine: { getView(): { slideId: string } } } }
      ).player.engine.getView().slideId,
  );
const lightboxBar = (p: Page) => p.getByRole('group', { name: 'Lightbox' });

test('a button opens a lightbox over the slide, which stays drawn behind it; Close and Escape close it', async ({
  page: browserPage,
}) => {
  const { project, one, two, open, inside } = course(false);
  await mount(browserPage, project);
  await expect(lightboxBar(browserPage)).toBeHidden();
  await browserPage.locator(`[data-object-id="${open.id}"]`).click();
  await expect.poll(() => playing(browserPage)).toBe(two.id);
  await expect(browserPage.locator('.vo-player')).toHaveAttribute('data-lightbox', 'true');
  // The slide under it, drawn still behind the lightbox; the lightbox smaller than the stage.
  const under = browserPage.locator('.vo-player-lightbox-under');
  await expect(under.locator(`[data-object-id="${open.id}"]`)).toBeAttached();
  const lightboxBox = (await browserPage.locator('.vo-player-stage').boundingBox())!;
  const underBox = (await under.boundingBox())!;
  expect(lightboxBox.width).toBeCloseTo(underBox.width * 0.8, 0);
  await expect(
    browserPage.locator(`.vo-player-stage [data-object-id="${inside.id}"]`),
  ).toBeVisible();
  // The slide count is the slide under it.
  await expect(browserPage.locator('.vo-player-position')).toHaveText('Slide 1 of 3');
  // Keyboard focus moved into the lightbox (the Phase 8 review).
  await expect(
    lightboxBar(browserPage).getByRole('button', { name: 'Close', exact: true }),
  ).toBeFocused();
  // So does the menu: it marks the slide under the lightbox (P8.4 rule 6; the Phase 8 review).
  await browserPage.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(
    browserPage.getByRole('navigation', { name: 'Course menu' }).locator('[aria-current="page"]'),
  ).toHaveText('One');
  await browserPage.getByRole('button', { name: 'Menu', exact: true }).click();
  // No controls: Close only.
  await expect(lightboxBar(browserPage).getByRole('button')).toHaveText(['Close']);
  await lightboxBar(browserPage).getByRole('button', { name: 'Close', exact: true }).click();
  await expect.poll(() => playing(browserPage)).toBe(one.id);
  await expect(under).toHaveCount(0);
  await expect(lightboxBar(browserPage)).toBeHidden();

  await browserPage.locator(`[data-object-id="${open.id}"]`).click();
  await expect.poll(() => playing(browserPage)).toBe(two.id);
  await browserPage.locator('.vo-player').focus();
  await browserPage.keyboard.press('Escape');
  await expect.poll(() => playing(browserPage)).toBe(one.id);
});

test('with controls, the lightbox’s Previous and Next move it along the course', async ({
  page: browserPage,
}) => {
  const { project, one, two, three, open } = course(true);
  await mount(browserPage, project);
  await browserPage.locator(`[data-object-id="${open.id}"]`).click();
  const bar = lightboxBar(browserPage);
  await expect(bar.getByRole('button')).toHaveText(['Previous', 'Next', 'Close']);
  // Before Two is One, the slide under it: there is no going back to it.
  await expect(bar.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
  await bar.getByRole('button', { name: 'Next', exact: true }).click();
  await expect.poll(() => playing(browserPage)).toBe(three.id);
  await expect(bar.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await bar.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect.poll(() => playing(browserPage)).toBe(two.id);
  await bar.getByRole('button', { name: 'Close', exact: true }).click();
  await expect.poll(() => playing(browserPage)).toBe(one.id);
});

test('a custom tab opens a slide as a lightbox', async ({ page: browserPage }) => {
  const { project, one, three } = course(false);
  await mount(browserPage, project);
  await browserPage
    .getByRole('group', { name: 'Course tabs' })
    .getByRole('button', { name: 'Three in a box', exact: true })
    .click();
  await expect.poll(() => playing(browserPage)).toBe(three.id);
  await expect(lightboxBar(browserPage)).toBeVisible();
  await lightboxBar(browserPage).getByRole('button', { name: 'Close', exact: true }).click();
  await expect.poll(() => playing(browserPage)).toBe(one.id);
});

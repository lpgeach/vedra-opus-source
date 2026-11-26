import { createEmptyProject, createScene, createSlide } from '@vedraopus/model';
import type { Project } from '@vedraopus/model';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The player's look and words (docs/briefs/P8.3-player-appearance.md). */

const dist = join(import.meta.dirname, '../dist');

function page(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vedraopus-player-look-'));
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

function course(change: (project: Project) => void = () => {}) {
  const project = createEmptyProject('Look');
  project.scenes = [{ ...createScene(), slides: [createSlide('One'), createSlide('Two')] }];
  change(project);
  return project;
}

const style = (p: Page, selector: string, property: string) =>
  p
    .locator(selector)
    .first()
    .evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
const box = async (p: Page, selector: string) => (await p.locator(selector).first().boundingBox())!;

test('light and dark change the frame, and auto follows the browser', async ({
  page: browserPage,
}) => {
  await mount(browserPage, course());
  // Dark, as courses were: the footer #11181c.
  expect(await style(browserPage, '.vo-player-footer', 'background-color')).toBe('rgb(17, 24, 28)');
  await mount(
    browserPage,
    course((p) => (p.player.look.scheme = 'light')),
  );
  expect(await style(browserPage, '.vo-player-footer', 'background-color')).toBe(
    'rgb(255, 255, 255)',
  );
  expect(await style(browserPage, '.vo-player', 'color')).toBe('rgb(28, 32, 36)');

  const auto = course((p) => (p.player.look.scheme = 'auto'));
  await browserPage.emulateMedia({ colorScheme: 'light' });
  await mount(browserPage, auto);
  expect(await style(browserPage, '.vo-player-footer', 'background-color')).toBe(
    'rgb(255, 255, 255)',
  );
  await browserPage.emulateMedia({ colorScheme: 'dark' });
  expect(await style(browserPage, '.vo-player-footer', 'background-color')).toBe('rgb(17, 24, 28)');
});

test('the accent marks the current menu entry, with text that reads on it', async ({
  page: browserPage,
}) => {
  await mount(
    browserPage,
    course((p) => (p.player.look.accent = '#ffd23f')),
  );
  await browserPage.getByRole('button', { name: 'Menu', exact: true }).click();
  const current = '.vo-player-menu-item[aria-current="page"]';
  expect(await style(browserPage, current, 'background-color')).toBe('rgb(255, 210, 63)');
  expect(await style(browserPage, current, 'color')).toBe('rgb(0, 0, 0)');
  // The open Menu button wears it too.
  expect(await style(browserPage, '.vo-player-menu-button', 'background-color')).toBe(
    'rgb(255, 210, 63)',
  );
});

test('controls at the top come before the course, and the menu can be at the right', async ({
  page: browserPage,
}) => {
  await mount(browserPage, course());
  expect((await box(browserPage, '.vo-player-footer')).y).toBeGreaterThan(
    (await box(browserPage, '.vo-player-viewport')).y,
  );
  await mount(
    browserPage,
    course((p) => {
      p.player.look.controlsAt = 'top';
      p.player.look.menuSide = 'right';
    }),
  );
  const footer = await box(browserPage, '.vo-player-footer');
  const viewport = await box(browserPage, '.vo-player-viewport');
  const bar = await box(browserPage, '.vo-player-bar');
  expect(footer.y).toBeLessThan(viewport.y);
  expect(bar.y).toBeLessThan(footer.y);
  await browserPage.getByRole('button', { name: 'Menu', exact: true }).click();
  const menu = await box(browserPage, '.vo-player-menu');
  expect(Math.round(menu.x + menu.width)).toBe(Math.round(viewport.x + viewport.width));
});

test('the theme font, the author’s words and the course language', async ({
  page: browserPage,
}) => {
  await mount(
    browserPage,
    course((p) => {
      p.theme.fonts.body = 'Georgia';
      p.player.look.font = 'body';
      p.player.labels = {
        language: 'fr',
        words: {
          fr: { next: 'Suivant', slideOf: 'Diapo {n} sur {total}' },
          de: { previous: 'Zurück' },
        },
      };
    }),
  );
  expect(await style(browserPage, '.vo-player', 'font-family')).toContain('Georgia');
  await expect(browserPage.locator('.vo-player')).toHaveAttribute('lang', 'fr');
  await expect(browserPage.getByRole('button', { name: 'Suivant', exact: true })).toBeVisible();
  await expect(browserPage.locator('.vo-player-position')).toHaveText('Diapo 1 sur 2');
  // German's words are not French: Previous stays English.
  await expect(browserPage.getByRole('button', { name: 'Previous', exact: true })).toBeVisible();
  await browserPage.getByRole('button', { name: 'Suivant', exact: true }).click();
  await expect(browserPage.locator('.vo-player-position')).toHaveText('Diapo 2 sur 2');
});

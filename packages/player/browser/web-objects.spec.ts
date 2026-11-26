import { createEmptyProject, createScene, createSlide, createWebObject } from '@vedraopus/model';
import type { Project } from '@vedraopus/model';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Web objects (docs/briefs/P9.6-web-objects.md). */

const dist = join(import.meta.dirname, '../dist');

/**
 * The page a folder's web object shows: its script writes that it ran, and
 * whether it could reach the course's window (the sandbox must stop it).
 */
const GAME = `<!doctype html><html><body><p id="ran">not yet</p><p id="reach"></p>
<script>
document.getElementById('ran').textContent = 'the game ran';
var reach;
try { reach = 'reached ' + String(window.parent.document.title); } catch (e) { reach = 'blocked'; }
document.getElementById('reach').textContent = reach;
</script></body></html>`;

/** A page with the player, and the folder at web/<id>/ beside it, as `webUrl` says by default. */
function page(webId: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'vo-player-web-'));
  mkdirSync(join(dir, 'web', webId, 'my game'), { recursive: true });
  writeFileSync(join(dir, 'web', webId, 'my game', 'index.html'), GAME);
  cpSync(join(dist, 'player.js'), join(dir, 'player.js'));
  cpSync(join(dist, 'player.css'), join(dir, 'player.css'));
  writeFileSync(
    join(dir, 'index.html'),
    `<!doctype html><html><head><meta charset="utf-8"><title>The course</title><link rel="stylesheet" href="player.css">
<style>html,body{margin:0;height:100%}#app{width:1280px;height:800px}</style></head>
<body><div id="app"></div><script src="player.js"></script></body></html>`,
  );
  return pathToFileURL(join(dir, 'index.html')).href;
}

async function mount(browserPage: Page, project: Project, webId: string) {
  // Nothing goes off the machine in tests: any web address is refused.
  await browserPage.route(/^https?:\/\//, (route) => route.abort());
  await browserPage.addInitScript(() => {
    const opened: string[] = [];
    (window as unknown as { opened: string[] }).opened = opened;
    window.open = (url?: string | URL) => {
      opened.push(String(url));
      return null;
    };
  });
  await browserPage.goto(page(webId));
  await browserPage.evaluate((data) => {
    const w = window as unknown as Record<string, unknown>;
    w['player'] = (
      w['VedraOpusPlayer'] as { mountPlayer: (...args: unknown[]) => unknown }
    ).mountPlayer(document.getElementById('app'), data, {});
  }, project);
}

/** One slide with a folder's game in the slide, and a page from an address. */
function course(display: 'inline' | 'window') {
  const project = createEmptyProject('Web');
  const hash = 'a'.repeat(64);
  project.assets[hash] = {
    kind: 'file',
    fileName: 'index.html',
    ext: 'html',
    mimeType: 'text/html',
    byteLength: GAME.length,
  };
  const game = createWebObject(
    { kind: 'folder', files: { 'my game/index.html': hash }, entry: 'my game/index.html' },
    'The game',
    { x: 40, y: 40, width: 500, height: 300 },
  );
  game.timing = { start: 0, duration: 'untilEnd' };
  const site = createWebObject({ kind: 'url', url: 'https://example.com/help' }, 'Help site', {
    x: 600,
    y: 40,
    width: 400,
    height: 300,
  });
  site.props.display = display;
  site.timing = { start: 0, duration: 'untilEnd' };
  const slide = createSlide('One');
  slide.baseLayer.objects.push(game, site);
  project.scenes = [{ ...createScene(), slides: [slide] }];
  return { project, game, site };
}

test('a folder’s page runs in the slide, in a sandbox that keeps it from the course', async ({
  page: browserPage,
}) => {
  const { project, game } = course('inline');
  await mount(browserPage, project, game.id);
  const frame = browserPage.locator(`[data-object-id="${game.id}"] iframe`);
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-forms allow-popups');
  await expect(frame).toHaveAttribute('title', 'The game');
  // The space in its path is encoded.
  await expect(frame).toHaveAttribute('src', `web/${game.id}/my%20game/index.html`);
  const inside = browserPage.frameLocator(`[data-object-id="${game.id}"] iframe`);
  await expect(inside.locator('#ran')).toHaveText('the game ran');
  await expect(inside.locator('#reach')).toHaveText('blocked');
});

test('a page from an address is a sandboxed frame of it, or a button that opens it', async ({
  page: browserPage,
}) => {
  const inline = course('inline');
  await mount(browserPage, inline.project, inline.game.id);
  const frame = browserPage.locator(`[data-object-id="${inline.site.id}"] iframe`);
  await expect(frame).toHaveAttribute('src', 'https://example.com/help');
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-forms allow-popups');

  const windowed = course('window');
  await mount(browserPage, windowed.project, windowed.game.id);
  const button = browserPage.getByRole('button', { name: 'Help site', exact: true });
  await button.click();
  await expect
    .poll(() => browserPage.evaluate(() => (window as unknown as { opened: string[] }).opened))
    .toEqual(['https://example.com/help']);
});

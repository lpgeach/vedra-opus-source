import {
  createEmptyProject,
  createId,
  createScene,
  createSlide,
  notesFromText,
} from '@vedraopus/model';
import type { Project } from '@vedraopus/model';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The player's tabs (docs/briefs/P8.2-player-tabs.md). */

const dist = join(import.meta.dirname, '../dist');
const PDF = Buffer.from('%PDF-1.4\n%%EOF\n');
const PDF_HASH = createHash('sha256').update(PDF).digest('hex');

function page(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vedraopus-player-tabs-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', `${PDF_HASH}.pdf`), PDF);
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

/** Two slides, the first with notes; every tab filled, and a custom tab that counts its clicks. */
function course() {
  const project = createEmptyProject('Tabs');
  const one = createSlide('One');
  one.notes = notesFromText('Say hello.\nThen point at the chart.');
  const two = createSlide('Two');
  project.scenes = [{ ...createScene(), slides: [one, two] }];
  project.assets[PDF_HASH] = {
    kind: 'file',
    fileName: 'Guide.pdf',
    ext: 'pdf',
    mimeType: 'application/pdf',
    byteLength: PDF.length,
  };
  const { tabs } = project.player;
  tabs.resources.items = [
    {
      id: 'res_site',
      title: 'Our site',
      target: { kind: 'link', url: 'https://example.com/help' },
    },
    { id: 'res_guide', title: 'The guide', target: { kind: 'file', asset: PDF_HASH } },
  ];
  tabs.glossary.terms = [
    { id: 'term_z', term: 'zebra', definition: 'A striped horse.' },
    { id: 'term_a', term: 'Apple', definition: 'A fruit.' },
  ];
  tabs.custom = [{ id: 'tab_count', label: 'Count', lightbox: null }];
  const clicks = { id: createId('var'), name: 'Clicks', type: 'number' as const, default: 0 };
  project.variables.push(clicks);
  one.triggers.push({
    id: createId('trigger'),
    owner: { kind: 'slide', id: one.id },
    event: { type: 'playerTab', tab: 'tab_count' },
    action: {
      type: 'setVariable',
      variable: clicks.id,
      operator: 'add',
      operand: { kind: 'literal', value: 1 },
    },
    conditions: null,
    otherwise: null,
    enabled: true,
  });
  return project;
}

const tab = (p: Page, name: string) =>
  p.getByRole('group', { name: 'Course tabs' }).getByRole('button', { name, exact: true });
const clicks = (p: Page) =>
  p.evaluate(() =>
    (
      window as unknown as { player: { engine: { getVariable(name: string): unknown } } }
    ).player.engine.getVariable('Clicks'),
  );

test('resources list links and files, and a panel closes on a second click or Escape', async ({
  page: browserPage,
}) => {
  await mount(browserPage, course());
  await expect(tab(browserPage, 'Resources')).toHaveAttribute('aria-expanded', 'false');
  await tab(browserPage, 'Resources').click();
  const panel = browserPage.getByRole('region', { name: 'Resources' });
  await expect(panel).toBeVisible();
  await expect(tab(browserPage, 'Resources')).toHaveAttribute('aria-expanded', 'true');
  const site = panel.getByRole('link', { name: 'Our site' });
  await expect(site).toHaveAttribute('href', 'https://example.com/help');
  await expect(site).toHaveAttribute('target', '_blank');
  await expect(site).toHaveAttribute('rel', 'noopener noreferrer');
  const guide = panel.getByRole('link', { name: 'The guide' });
  await expect(guide).toHaveAttribute('href', `assets/${PDF_HASH}.pdf`);
  await expect(guide).toHaveAttribute('download', 'Guide.pdf');
  await tab(browserPage, 'Resources').click();
  await expect(panel).toBeHidden();
  await tab(browserPage, 'Resources').click();
  await expect(panel).toBeVisible();
  await browserPage.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(tab(browserPage, 'Resources')).toBeFocused();
  // Escape is not taken as a move to another slide.
  await expect(browserPage.locator('.vo-player-position')).toHaveText('Slide 1 of 2');
});

test('the glossary is sorted by term, and notes follow the slide', async ({
  page: browserPage,
}) => {
  await mount(browserPage, course());
  await tab(browserPage, 'Glossary').click();
  const glossary = browserPage.getByRole('region', { name: 'Glossary' });
  await expect(glossary.locator('dt')).toHaveText(['Apple', 'zebra']);
  await expect(glossary.locator('dd')).toHaveText(['A fruit.', 'A striped horse.']);
  // One panel at a time.
  await tab(browserPage, 'Notes').click();
  await expect(glossary).toBeHidden();
  const notes = browserPage.getByRole('region', { name: 'Notes' });
  await expect(notes.locator('p')).toHaveText(['Say hello.', 'Then point at the chart.']);
  await browserPage.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(notes.locator('p')).toHaveText(['This slide has no notes.']);
  await browserPage.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(notes.locator('p').first()).toHaveText('Say hello.');
});

test('a custom tab fires its slide’s trigger, and empty tabs are not there', async ({
  page: browserPage,
}) => {
  await mount(browserPage, course());
  await tab(browserPage, 'Count').click();
  await tab(browserPage, 'Count').click();
  await expect.poll(() => clicks(browserPage)).toBe(2);
  await expect(browserPage.locator('.vo-player-tab-panel')).toBeHidden();
  // The second slide has no trigger for it.
  await browserPage.getByRole('button', { name: 'Next', exact: true }).click();
  await tab(browserPage, 'Count').click();
  await expect.poll(() => clicks(browserPage)).toBe(2);

  const bare = createEmptyProject('Bare');
  bare.player.tabs.glossary.terms = [{ id: 'term_a', term: 'A', definition: 'a' }];
  bare.player.tabs.glossary.show = false;
  await mount(browserPage, bare);
  await expect(browserPage.locator('.vo-player-tab')).toHaveCount(0);
  await expect(browserPage.getByRole('group', { name: 'Course tabs' })).toHaveCount(0);
});

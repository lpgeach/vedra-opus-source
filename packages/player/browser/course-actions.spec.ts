import {
  createButtonObject,
  createEmptyProject,
  createId,
  createScene,
  createShapeObject,
  createSlide,
} from '@vedraopus/model';
import type { Project, SceneObject, Slide, TriggerAction } from '@vedraopus/model';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The rest of plan 4.2's actions (docs/briefs/P8.6-course-actions.md). */

const dist = join(import.meta.dirname, '../dist');
const PDF = Buffer.from('%PDF-1.4\n%%EOF\n');
const PDF_HASH = createHash('sha256').update(PDF).digest('hex');

function page(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vedraopus-player-actions-'));
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

/** Records what the page asked the browser for, instead of doing it. */
async function mount(browserPage: Page, project: Project) {
  await browserPage.addInitScript(() => {
    const calls: unknown[][] = [];
    (window as unknown as { calls: unknown[][] }).calls = calls;
    window.open = (...args: unknown[]) => {
      calls.push(['open', ...args]);
      return null;
    };
    window.print = () => void calls.push(['print']);
    // As a browser does for a window the page did not open: it stays.
    window.close = () => void calls.push(['close']);
  });
  await browserPage.goto(page());
  await browserPage.evaluate((data) => {
    const w = window as unknown as Record<string, unknown> & { calls: unknown[][] };
    w['player'] = (
      w['VedraOpusPlayer'] as { mountPlayer: (...args: unknown[]) => unknown }
    ).mountPlayer(document.getElementById('app'), data, {
      onExit: () => w.calls.push(['exit']),
    });
  }, project);
}

const calls = (p: Page) => p.evaluate(() => (window as unknown as { calls: unknown[][] }).calls);

function button(slide: Slide, label: string, x: number, action: TriggerAction): SceneObject {
  const made = createButtonObject(label, { x, y: 100 });
  made.timing = { start: 0, duration: 'untilEnd' };
  slide.baseLayer.objects.push(made);
  slide.triggers.push({
    id: createId('trigger'),
    owner: { kind: 'object', id: made.id },
    event: { type: 'click', object: made.id },
    action,
    conditions: null,
    otherwise: null,
    enabled: true,
  });
  return made;
}

/** Slide One has a button for each action, a counter button and a shape to focus. */
function course() {
  const project = createEmptyProject('Actions');
  const count = { id: createId('var'), name: 'Count', type: 'number' as const, default: 0 };
  project.variables.push(count);
  project.assets[PDF_HASH] = {
    kind: 'file',
    fileName: 'Guide.pdf',
    ext: 'pdf',
    mimeType: 'application/pdf',
    byteLength: PDF.length,
  };
  const one = createSlide('One');
  const target = createShapeObject({ kind: 'rect' }, { x: 100, y: 400 }, 'Target');
  target.timing = { start: 0, duration: 'untilEnd' };
  one.baseLayer.objects.push(target);
  button(one, 'Add', 40, {
    type: 'setVariable',
    variable: count.id,
    operator: 'add',
    operand: { kind: 'literal', value: 1 },
  });
  button(one, 'Restart', 200, { type: 'restartCourse' });
  button(one, 'Email', 360, {
    type: 'sendEmail',
    to: 'tutor@example.com',
    subject: 'Count %Count%',
    body: '',
  });
  button(one, 'Print', 520, { type: 'printSlide' });
  button(one, 'File', 680, { type: 'openFile', asset: PDF_HASH });
  button(one, 'Focus', 840, { type: 'setFocus', object: target.id });
  button(one, 'Exit', 1000, { type: 'exitCourse' });
  project.scenes = [{ ...createScene(), slides: [one, createSlide('Two')] }];
  return { project, target };
}

const press = (p: Page, label: string) =>
  p.locator('.vo-player-stage').getByText(label, { exact: true }).click();
const count = (p: Page) =>
  p.evaluate(() =>
    (
      window as unknown as { player: { engine: { getVariable(name: string): unknown } } }
    ).player.engine.getVariable('Count'),
  );

test('restart goes back to slide 1 with the variables reset', async ({ page: browserPage }) => {
  await mount(browserPage, course().project);
  await press(browserPage, 'Add');
  await press(browserPage, 'Add');
  await expect.poll(() => count(browserPage)).toBe(2);
  await browserPage.getByRole('button', { name: 'Next', exact: true }).click();
  await browserPage.getByRole('button', { name: 'Previous', exact: true }).click();
  await press(browserPage, 'Restart');
  await expect.poll(() => count(browserPage)).toBe(0);
  await expect(browserPage.locator('.vo-player-position')).toHaveText('Slide 1 of 2');
});

test('email, print and file ask the browser, with the right addresses', async ({
  page: browserPage,
}) => {
  await mount(browserPage, course().project);
  await press(browserPage, 'Add');
  await press(browserPage, 'Email');
  await press(browserPage, 'Print');
  await press(browserPage, 'File');
  await expect
    .poll(() => calls(browserPage))
    .toEqual([
      ['open', 'mailto:tutor@example.com?subject=Count%201', '_blank', 'noopener,noreferrer'],
      ['print'],
      ['open', `assets/${PDF_HASH}.pdf`, '_blank', 'noopener,noreferrer'],
    ]);
});

test('set focus moves the keyboard to the object', async ({ page: browserPage }) => {
  const { project, target } = course();
  await mount(browserPage, project);
  await press(browserPage, 'Focus');
  await expect(browserPage.locator(`[data-object-id="${target.id}"]`)).toBeFocused();
});

test('exit tells the course’s host, tries to close the window, then says the course has ended', async ({
  page: browserPage,
}) => {
  await mount(browserPage, course().project);
  await press(browserPage, 'Exit');
  await expect.poll(() => calls(browserPage)).toEqual([['exit'], ['close']]);
  // Not the player's announcer, which is a status region too (P10.1).
  await expect(
    browserPage.getByRole('status').filter({ hasText: 'The course has ended' }),
  ).toHaveText('The course has ended. You can close this page now.');
  await expect(browserPage.locator('.vo-player')).toHaveAttribute('data-ended', 'true');
  // Nothing in the course can be used any more: the frame is inert under the message.
  for (const part of ['.vo-player-bar', '.vo-player-viewport', '.vo-player-footer']) {
    await expect(browserPage.locator(part)).toHaveJSProperty('inert', true);
  }
});

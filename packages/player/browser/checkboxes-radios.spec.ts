import {
  createCheckboxObject,
  createEmptyProject,
  createId,
  createRadioObject,
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

/** Stock checkboxes and radio buttons (docs/briefs/P9.3-checkboxes-radios.md). */

const dist = join(import.meta.dirname, '../dist');

function page(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vo-player-choices-'));
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

/** Two slides; the first has a checkbox, a group of three radio buttons, and a trigger on Blue. */
function course() {
  const project = createEmptyProject('Choices');
  const picked = { id: createId('var'), name: 'Picked', type: 'text' as const, default: '' };
  project.variables.push(picked);
  const slide = createSlide('One');
  const agree = createCheckboxObject('I agree', { x: 40, y: 40 });
  const group = 'Colours';
  const [red, green, blue] = ['Red', 'Green', 'Blue'].map((text, index) =>
    createRadioObject(text, group, { x: 40, y: 120 + index * 60 }),
  );
  for (const object of [agree, red!, green!, blue!]) {
    object.timing = { start: 0, duration: 'untilEnd' };
    slide.baseLayer.objects.push(object);
  }
  slide.triggers.push({
    id: createId('trigger'),
    owner: { kind: 'object', id: blue!.id },
    event: { type: 'stateChange', object: blue!.id, state: 'selected' },
    action: {
      type: 'setVariable',
      variable: picked.id,
      operator: 'assign',
      operand: { kind: 'literal', value: 'blue' },
    },
    conditions: null,
    otherwise: null,
    enabled: true,
  });
  project.scenes = [{ ...createScene(), slides: [slide, createSlide('Two')] }];
  return { project };
}

const picked = (p: Page) =>
  p.evaluate(() =>
    (
      window as unknown as { player: { engine: { getVariable(name: string): unknown } } }
    ).player.engine.getVariable('Picked'),
  );

test('a checkbox toggles by click and by Space, saying whether it is checked', async ({
  page: browserPage,
}) => {
  await mount(browserPage, course().project);
  const agree = browserPage.getByRole('checkbox', { name: 'I agree', exact: true });
  await expect(agree).toHaveAttribute('aria-checked', 'false');
  await agree.click();
  await expect(agree).toHaveAttribute('aria-checked', 'true');
  await agree.focus();
  await browserPage.keyboard.press('Space');
  await expect(agree).toHaveAttribute('aria-checked', 'false');
});

test('radio buttons select one at a time, by click and by the arrow keys, and their triggers run', async ({
  page: browserPage,
}) => {
  await mount(browserPage, course().project);
  const radio = (name: string) => browserPage.getByRole('radio', { name, exact: true });
  await radio('Red').click();
  await expect(radio('Red')).toHaveAttribute('aria-checked', 'true');
  await radio('Green').click();
  await expect(radio('Green')).toHaveAttribute('aria-checked', 'true');
  await expect(radio('Red')).toHaveAttribute('aria-checked', 'false');
  // The arrow keys move along the group, selecting as they go, and not between slides.
  await radio('Green').focus();
  await browserPage.keyboard.press('ArrowDown');
  await expect(radio('Blue')).toHaveAttribute('aria-checked', 'true');
  await expect(radio('Blue')).toBeFocused();
  await expect(radio('Green')).toHaveAttribute('aria-checked', 'false');
  await expect.poll(() => picked(browserPage)).toBe('blue');
  await browserPage.keyboard.press('ArrowRight');
  // Round from the last to the first.
  await expect(radio('Red')).toHaveAttribute('aria-checked', 'true');
  await browserPage.keyboard.press('ArrowUp');
  await expect(radio('Blue')).toHaveAttribute('aria-checked', 'true');
  await expect(browserPage.locator('.vo-player-position')).toHaveText('Slide 1 of 2');
});

import {
  createEmptyProject,
  createId,
  createScene,
  createSlide,
  createTextEntryObject,
  createTextObject,
} from '@vedraopus/model';
import type { Project } from '@vedraopus/model';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Data-entry fields bound to variables (docs/briefs/P9.2-data-entry.md). */

const dist = join(import.meta.dirname, '../dist');

function page(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vo-player-fields-'));
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
 * A name field bound to Name, an age field bound to Age (0 to 120), text that
 * shows both, and a loses-focus trigger on the name field that counts.
 */
function course() {
  const project = createEmptyProject('Fields');
  const name = { id: createId('var'), name: 'Name', type: 'text' as const, default: 'Sam' };
  const age = { id: createId('var'), name: 'Age', type: 'number' as const, default: 30 };
  const left = { id: createId('var'), name: 'Left', type: 'number' as const, default: 0 };
  project.variables.push(name, age, left);
  const slide = createSlide('One');
  const nameField = createTextEntryObject({ x: 40, y: 40 });
  nameField.props.variable = name.id;
  const ageField = createTextEntryObject({ x: 40, y: 120 }, true);
  ageField.props.variable = age.id;
  ageField.props.min = 0;
  ageField.props.max = 120;
  const words = createTextObject('Hello %Name%, aged %Age%', {
    x: 40,
    y: 220,
    width: 600,
    height: 60,
  });
  words.timing = { start: 0, duration: 'untilEnd' };
  slide.baseLayer.objects.push(nameField, ageField, words);
  slide.triggers.push({
    id: createId('trigger'),
    owner: { kind: 'object', id: nameField.id },
    event: { type: 'controlLosesFocus', object: nameField.id },
    action: {
      type: 'setVariable',
      variable: left.id,
      operator: 'add',
      operand: { kind: 'literal', value: 1 },
    },
    conditions: null,
    otherwise: null,
    enabled: true,
  });
  project.scenes = [{ ...createScene(), slides: [slide] }];
  return { project, nameField, ageField, words };
}

const variable = (p: Page, name: string) =>
  p.evaluate(
    (n) =>
      (
        window as unknown as { player: { engine: { getVariable(name: string): unknown } } }
      ).player.engine.getVariable(n),
    name,
  );

test('typing and Tab writes the variable, runs the loses-focus trigger, and updates the text', async ({
  page: browserPage,
}) => {
  const { project, nameField, ageField, words } = course();
  await mount(browserPage, project);
  const name = browserPage.locator(`[data-object-id="${nameField.id}"] input`);
  const age = browserPage.locator(`[data-object-id="${ageField.id}"] input`);
  const text = browserPage.locator(`[data-object-id="${words.id}"]`);
  await expect(name).toHaveValue('Sam');
  await expect(age).toHaveValue('30');
  await expect(text).toContainText('Hello Sam, aged 30');
  await name.fill('Ali');
  // Not written while typing.
  expect(await variable(browserPage, 'Name')).toBe('Sam');
  await name.press('Tab');
  await expect.poll(() => variable(browserPage, 'Name')).toBe('Ali');
  await expect.poll(() => variable(browserPage, 'Left')).toBe(1);
  await expect(text).toContainText('Hello Ali, aged 30');
});

test('Enter in a one-line field writes it too; a numeric field keeps within its limits and refuses words', async ({
  page: browserPage,
}) => {
  const { project, nameField, ageField } = course();
  await mount(browserPage, project);
  const name = browserPage.locator(`[data-object-id="${nameField.id}"] input`);
  const age = browserPage.locator(`[data-object-id="${ageField.id}"] input`);
  await name.fill('Jo');
  await name.press('Enter');
  await expect.poll(() => variable(browserPage, 'Name')).toBe('Jo');
  await expect.poll(() => variable(browserPage, 'Left')).toBe(1);
  await age.fill('250');
  await age.press('Enter');
  await expect.poll(() => variable(browserPage, 'Age')).toBe(120);
  await expect(age).toHaveValue('120');
  await age.fill('abc');
  await age.press('Tab');
  // Not a number: the variable is kept, and the field shows it again.
  await expect(age).toHaveValue('120');
  expect(await variable(browserPage, 'Age')).toBe(120);
});

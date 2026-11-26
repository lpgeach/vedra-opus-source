import {
  createButtonObject,
  createEmptyProject,
  createGroupObject,
  createTextObject,
} from '@vedraopus/model';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = join(import.meta.dirname, '../../..');
const dist = join(root, 'packages/player/dist');
const fixture = join(root, 'fixtures/projects/two-slides');
const project = JSON.parse(readFileSync(join(fixture, 'project.json'), 'utf8')) as {
  scenes: { slides: { id: string }[] }[];
};

/**
 * A plain HTML page beside the fixture's assets, loading only the two files
 * the build produced, from disk: no server, no network.
 */
function makePage(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vedraopus-player-'));
  cpSync(join(fixture, 'assets'), join(dir, 'assets'), { recursive: true });
  cpSync(join(dist, 'player.js'), join(dir, 'player.js'));
  cpSync(join(dist, 'player.css'), join(dir, 'player.css'));
  writeFileSync(
    join(dir, 'index.html'),
    `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="player.css">
<style>html,body{margin:0;height:100%}#app{width:100%;height:100%}</style></head>
<body><div id="app"></div><script src="player.js"></script></body></html>`,
  );
  return pathToFileURL(join(dir, 'index.html')).href;
}

async function mount(
  page: Page,
  autoStart: boolean,
  data: unknown = project,
  restore?: unknown,
): Promise<string[]> {
  const failed: string[] = [];
  page.on('requestfailed', (request) => failed.push(request.url()));
  page.on('pageerror', (error) => failed.push(error.message));
  await page.goto(makePage());
  await page.evaluate(
    ({ data, auto, restore }) => {
      const w = window as unknown as Record<string, unknown>;
      w['inputs'] = [];
      w['started'] = [];
      w['player'] = (
        w['VedraOpusPlayer'] as { mountPlayer: (...args: unknown[]) => unknown }
      ).mountPlayer(document.getElementById('app'), data, {
        autoStart: auto,
        // With a manual clock, time starts at zero and only `tick` moves it.
        ...(auto ? {} : { clock: () => 0 }),
        onInput: (input: unknown) => (w['inputs'] as unknown[]).push(input),
        onStart: (engine: { getView(): { slideIndex: number } }) =>
          (w['started'] as number[]).push(engine.getView().slideIndex),
        ...(restore ? { restore } : {}),
      });
    },
    { data, auto: autoStart, restore },
  );
  return failed;
}

const tick = (page: Page, ms: number) =>
  page.evaluate(
    (now) => (window as unknown as { player: { tick(n: number): void } }).player.tick(now),
    ms,
  );

/** Object types currently drawn (not display:none) on the stage. */
const visibleTypes = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-testid="player-stage"] [data-object-id]')]
      .filter((e) => e.style.display !== 'none' && !e.parentElement?.closest('[data-object-id]'))
      .map((e) => e.dataset['objectType']),
  );

test('plays the two-slides fixture: objects appear on their timing and navigation works', async ({
  page,
}) => {
  const failed = await mount(page, false);
  await expect(page.locator('.vo-player-title')).toHaveText('Two Slides');
  await expect(page.locator('.vo-player-position')).toHaveText('Slide 1 of 2');

  await tick(page, 0);
  expect(await visibleTypes(page)).toEqual(['text', 'button']);
  await tick(page, 600); // the panel starts at 0.5 s
  expect(await visibleTypes(page)).toEqual(['text', 'shape', 'button']);
  await tick(page, 1200); // the picture runs from 1 s to 4 s
  expect(await visibleTypes(page)).toEqual(['text', 'shape', 'image', 'button']);
  await tick(page, 4500);
  expect(await visibleTypes(page)).toEqual(['text', 'shape', 'button']);

  await expect(page.getByRole('button', { name: 'Previous' })).toBeDisabled();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.vo-player-position')).toHaveText('Slide 2 of 2');
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
  expect(await visibleTypes(page)).toEqual(['text', 'group']);

  // The keyboard goes back, and the first slide starts over.
  await page.locator('.vo-player').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.vo-player-position')).toHaveText('Slide 1 of 2');
  await tick(page, 4600);
  expect(await visibleTypes(page)).toEqual(['text', 'button']);
  expect(failed).toEqual([]);
});

test('draws the picture and scales the stage to fit its room', async ({ page }) => {
  const failed = await mount(page, false);
  await tick(page, 0);
  await tick(page, 1500);
  const stage = page.getByTestId('player-stage');
  const viewport = page.locator('.vo-player-viewport');
  const [s, v] = await Promise.all([stage.boundingBox(), viewport.boundingBox()]);
  expect(s!.width / s!.height).toBeCloseTo(1280 / 720, 1);
  expect(s!.x).toBeGreaterThanOrEqual(v!.x - 1);
  expect(s!.x + s!.width).toBeLessThanOrEqual(v!.x + v!.width + 1);
  expect(s!.y + s!.height).toBeLessThanOrEqual(v!.y + v!.height + 1);
  // One dimension fills the viewport.
  expect(Math.min(v!.width - s!.width, v!.height - s!.height)).toBeLessThan(2);

  await page.setViewportSize({ width: 480, height: 400 });
  await expect.poll(async () => (await stage.boundingBox())!.width).toBeLessThanOrEqual(480);
  const image = page.locator('[data-object-type="image"] image, [data-object-type="image"] img');
  await expect(image.first()).toHaveCount(1);
  expect(failed).toEqual([]);
});

test('forwards pointer and keyboard input', async ({ page }) => {
  await mount(page, false);
  await tick(page, 0);
  await page.locator('[data-object-type="button"]').click();
  await page.locator('.vo-player').focus();
  await page.keyboard.press('x');
  const inputs = await page.evaluate(
    () => (window as unknown as { inputs: { type: string }[] }).inputs,
  );
  expect(inputs.map((i) => i.type)).toContain('click');
  expect(inputs.map((i) => i.type)).toContain('mouseEnter');
  expect(inputs).toContainEqual({ type: 'keyPress', key: 'x' });
  expect(inputs.find((i) => i.type === 'click')).toMatchObject({
    slideId: project.scenes[0]!.slides[0]!.id,
  });
});

test('runs on its own clock with the frame loop', async ({ page }) => {
  const failed = await mount(page, true);
  // The panel appears at 0.5 s of real time.
  await expect
    .poll(async () => (await visibleTypes(page)).includes('shape'), { timeout: 5000 })
    .toBe(true);
  expect(failed).toEqual([]);
});

test('built-in states respond to the pointer: hover, down, selected in a button set', async ({
  page,
}) => {
  const course = createEmptyProject('States');
  const make = (name: string, x: number) => {
    const button = createButtonObject(name, { x, y: 100, width: 200, height: 80 });
    button.timing = { start: 0, duration: 'untilEnd' };
    button.buttonSet = 'choices';
    button.states.push(
      { id: 'hover', name: 'Hover', overrides: { appearance: { opacity: 0.5 } } },
      { id: 'down', name: 'Down', overrides: { appearance: { opacity: 0.25 } } },
      { id: 'selected', name: 'Selected', overrides: { frame: { y: 300 } } },
    );
    return button;
  };
  const [one, two] = [make('One', 100), make('Two', 500)];
  course.scenes[0]!.slides[0]!.baseLayer.objects.push(one, two);

  const failed = await mount(page, false, course);
  await tick(page, 0);
  const el = (id: string) => page.locator(`[data-object-id="${id}"]`);
  const look = (id: string) =>
    el(id).evaluate((e: HTMLElement) => ({ opacity: e.style.opacity || '1', top: e.style.top }));

  expect(await look(one.id)).toEqual({ opacity: '1', top: '100px' });
  await el(one.id).hover();
  expect(await look(one.id)).toEqual({ opacity: '0.5', top: '100px' });
  await page.mouse.down();
  expect((await look(one.id)).opacity).toBe('0.25');
  await page.mouse.up();
  // The press and release made a click, but the pointer is still over it: hover wins.
  expect(await look(one.id)).toEqual({ opacity: '0.5', top: '100px' });
  await page.mouse.move(5, 5);
  // Pointer gone: it shows selected, which moves it down.
  expect(await look(one.id)).toEqual({ opacity: '1', top: '300px' });

  await el(two.id).click();
  await page.mouse.move(5, 5);
  // One of a set: selecting the second put the first back.
  expect(await look(one.id)).toEqual({ opacity: '1', top: '100px' });
  expect(await look(two.id)).toEqual({ opacity: '1', top: '300px' });
  expect(failed).toEqual([]);
});

test('text showing a variable updates when the variable changes', async ({ page }) => {
  const course = createEmptyProject('Variables');
  course.variables.push({ id: 'var_score0000000000', name: 'Score', type: 'number', default: 0 });
  const box = createTextObject('Score: %Score% on slide %SlideNumber% of %SlideCount%', {
    x: 100,
    y: 100,
    width: 600,
    height: 80,
  });
  box.timing = { start: 0, duration: 'untilEnd' };
  course.scenes[0]!.slides[0]!.baseLayer.objects.push(box);
  const failed = await mount(page, false, course);
  await tick(page, 0);
  const text = page.locator(`[data-object-id="${box.id}"]`);
  await expect(text).toContainText('Score: 0 on slide 1 of 1');
  await page.evaluate(() =>
    (
      window as unknown as { player: { engine: { setVariable(n: string, v: number): void } } }
    ).player.engine.setVariable('score', 12.5),
  );
  await tick(page, 16);
  await expect(text).toContainText('Score: 12.5 on slide 1 of 1');
  expect(failed).toEqual([]);
});

test('triggers run in the player: click to reveal, and a key press', async ({ page }) => {
  const course = createEmptyProject('Reveal');
  const slide = course.scenes[0]!.slides[0]!;
  const button = createButtonObject('Show', { x: 100, y: 100, width: 200, height: 80 });
  const secret = createButtonObject('Secret', { x: 500, y: 100, width: 200, height: 80 });
  for (const object of [button, secret]) object.timing = { start: 0, duration: 'untilEnd' };
  secret.states.push({ id: 'hidden', name: 'Hidden', overrides: {} });
  secret.initialState = 'hidden';
  slide.baseLayer.objects.push(button, secret);
  const base = { conditions: null, otherwise: null, enabled: true };
  slide.triggers.push(
    {
      ...base,
      id: 'trigger_reveal000000',
      owner: { kind: 'object', id: button.id },
      event: { type: 'click', object: button.id },
      action: { type: 'changeState', object: secret.id, state: 'normal' },
    },
    {
      ...base,
      id: 'trigger_hide00000000',
      owner: { kind: 'slide', id: slide.id },
      event: { type: 'keyPress', key: 'h' },
      action: { type: 'changeState', object: secret.id, state: 'hidden' },
    },
  );
  const failed = await mount(page, false, course);
  await tick(page, 0);
  const shown = () =>
    page
      .locator(`[data-object-id="${secret.id}"]`)
      .evaluate((e: HTMLElement) => e.style.display !== 'none');
  expect(await shown()).toBe(false);
  await page.locator(`[data-object-id="${button.id}"]`).click();
  await expect.poll(shown).toBe(true);
  await page.locator('.vo-player').focus();
  await page.keyboard.press('h');
  await expect.poll(shown).toBe(false);
  expect(failed).toEqual([]);
});

test('a slide can hide the player’s buttons, and their keys follow', async ({ page }) => {
  const course = createEmptyProject('Controls');
  const [first] = course.scenes[0]!.slides;
  first!.properties.controls = { previous: true, next: false };
  const second = { ...structuredClone(first!), id: 'slide_second0000000', title: 'Second' };
  second.baseLayer = { ...second.baseLayer, id: 'layer_second0000000' };
  second.properties = { ...second.properties, controls: { previous: true, next: true } };
  course.scenes[0]!.slides.push(second);
  const failed = await mount(page, false, course);
  await tick(page, 0);
  await expect(page.getByRole('button', { name: 'Next' })).toBeHidden();
  await page.locator('.vo-player').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.vo-player-position')).toHaveText('Slide 1 of 2');
  // Moved on some other way (here, by the engine), the second slide shows both again.
  await page.evaluate(() =>
    (
      window as unknown as { player: { engine: { next(): boolean }; tick(n: number): void } }
    ).player.engine.next(),
  );
  await tick(page, 16);
  await expect(page.getByRole('button', { name: 'Previous' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();
  expect(failed).toEqual([]);
});

test('a Run JavaScript trigger runs in the player with the player API', async ({ page }) => {
  const course = createEmptyProject('Script');
  const slide = course.scenes[0]!.slides[0]!;
  const button = createButtonObject('Go', { x: 100, y: 100, width: 200, height: 80 }, 'Go');
  const badge = createButtonObject('Badge', { x: 500, y: 100, width: 200, height: 80 }, 'Badge');
  for (const object of [button, badge]) object.timing = { start: 0, duration: 'untilEnd' };
  slide.baseLayer.objects.push(button, badge);
  course.variables.push({ id: 'var_count0000000000', name: 'Count', type: 'number', default: 0 });
  slide.triggers.push({
    id: 'trigger_script000000',
    owner: { kind: 'object', id: button.id },
    event: { type: 'click', object: button.id },
    action: {
      type: 'executeJavaScript',
      code: "player.setVar('Count', player.getVar('Count') + 1); if (player.getVar('Count') >= 2) player.object('Badge').hide();",
    },
    conditions: null,
    otherwise: null,
    enabled: true,
  });
  const failed = await mount(page, false, course);
  await tick(page, 0);
  const badgeShown = () =>
    page
      .locator(`[data-object-id="${badge.id}"]`)
      .evaluate((e: HTMLElement) => e.style.display !== 'none');
  const go = page.locator(`[data-object-id="${button.id}"]`);
  await go.click();
  expect(await badgeShown()).toBe(true);
  await go.click();
  await expect.poll(badgeShown).toBe(false);
  const count = await page.evaluate(() =>
    (
      window as unknown as { player: { engine: { getVariable(n: string): unknown } } }
    ).player.engine.getVariable('Count'),
  );
  expect(count).toBe(2);
  expect(failed).toEqual([]);
});

test('objects inside a group take clicks and show their own states', async ({ page }) => {
  const course = createEmptyProject('Groups');
  const slide = course.scenes[0]!.slides[0]!;
  const a = createButtonObject('A', { x: 100, y: 100, width: 200, height: 80 }, 'A');
  const b = createButtonObject('B', { x: 400, y: 100, width: 200, height: 80 }, 'B');
  a.states.push({ id: 'hover', name: 'Hover', overrides: { appearance: { opacity: 0.5 } } });
  const group = createGroupObject([a, b], 'Pair');
  group.timing = { start: 0, duration: 'untilEnd' };
  slide.baseLayer.objects.push(group);
  course.variables.push({ id: 'var_log0000000000000', name: 'Log', type: 'text', default: '' });
  const append = (owner: string, text: string, id: string) => ({
    id,
    owner: { kind: 'object' as const, id: owner },
    event: { type: 'click' as const, object: owner },
    action: {
      type: 'setVariable' as const,
      variable: 'var_log0000000000000',
      operator: 'append' as const,
      operand: { kind: 'literal' as const, value: text },
    },
    conditions: null,
    otherwise: null,
    enabled: true,
  });
  slide.triggers.push(
    append(a.id, 'a ', 'trigger_a00000000000'),
    append(group.id, 'group ', 'trigger_g00000000000'),
  );
  const failed = await mount(page, false, course);
  await tick(page, 0);
  const opacity = () =>
    page.locator(`[data-object-id="${a.id}"]`).evaluate((e: HTMLElement) => e.style.opacity || '1');
  const log = () =>
    page.evaluate(() =>
      (
        window as unknown as { player: { engine: { getVariable(n: string): unknown } } }
      ).player.engine.getVariable('Log'),
    );
  await page.locator(`[data-object-id="${a.id}"]`).hover();
  await expect.poll(opacity).toBe('0.5');
  await page.locator(`[data-object-id="${a.id}"]`).click();
  await expect.poll(log).toBe('a group ');
  await page.locator(`[data-object-id="${b.id}"]`).click();
  // Moving to B left A (hover gone) but not the group.
  await expect.poll(opacity).toBe('1');
  await expect.poll(log).toBe('a group group ');
  expect(failed).toEqual([]);
});

test('a returning learner: continue always, never, or when they choose to', async ({ page }) => {
  const second = project.scenes[0]!.slides[1]!.id;
  // A saved session on the second slide.
  const saved = { v: 1, s: second, vis: [project.scenes[0]!.slides[0]!.id, second] };
  const withResume = (resume: string) => ({
    ...project,
    tracking: { ...(project as { tracking: object }).tracking, resume },
  });
  const position = page.locator('.vo-player-position');
  /** Slide indexes `onStart` reported, once the course was playing. */
  const started = () => page.evaluate(() => (window as unknown as { started: number[] }).started);

  await mount(page, false, withResume('always'), saved);
  await expect(position).toHaveText('Slide 2 of 2');
  expect(await started()).toEqual([1]);

  await mount(page, false, withResume('never'), saved);
  await expect(position).toHaveText('Slide 1 of 2');
  expect(await started()).toEqual([0]);

  await mount(page, false, withResume('prompt'), saved);
  const ask = page.getByRole('dialog', { name: 'Continue where you left off?' });
  await expect(ask).toBeVisible();
  // Nothing plays while the learner decides.
  await expect(position).toHaveCount(0);
  expect(await started()).toEqual([]);
  await ask.getByRole('button', { name: 'Continue' }).click();
  await expect(position).toHaveText('Slide 2 of 2');
  expect(await started()).toEqual([1]);

  await mount(page, false, withResume('prompt'), saved);
  await page.getByRole('button', { name: 'Start over' }).click();
  await expect(position).toHaveText('Slide 1 of 2');
  expect(await started()).toEqual([0]);

  // With nothing saved there is nothing to ask.
  await mount(page, false, withResume('prompt'));
  await expect(position).toHaveText('Slide 1 of 2');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('completion is reported to the page through onTrackingChange', async ({ page }) => {
  await page.goto(makePage());
  const reports = await page.evaluate((data) => {
    const seen: unknown[] = [];
    const w = window as unknown as Record<string, unknown>;
    const player = (
      w['VedraOpusPlayer'] as {
        mountPlayer: (...args: unknown[]) => { engine: { next(): boolean } };
      }
    ).mountPlayer(document.getElementById('app'), data, {
      autoStart: false,
      clock: () => 0,
      onTrackingChange: (tracking: unknown) => seen.push(tracking),
    });
    player.engine.next();
    return seen;
  }, project);
  expect(reports).toEqual([{ complete: true, success: 'unknown', progress: 1 }]);
});

import {
  createEffect,
  createEmptyProject,
  createGroupObject,
  createId,
  createMotionPath,
  createShapeObject,
  createTextObject,
} from '@vedraopus/model';
import type { Project, SceneObject, Trigger } from '@vedraopus/model';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dist = join(import.meta.dirname, '../dist');

function page(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vedraopus-player-animations-'));
  cpSync(join(dist, 'player.js'), join(dir, 'player.js'));
  cpSync(join(dist, 'player.css'), join(dir, 'player.css'));
  writeFileSync(
    join(dir, 'index.html'),
    `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="player.css">
<style>html,body{margin:0;height:100%}#app{width:960px;height:600px}</style></head>
<body><div id="app"></div><script src="player.js"></script></body></html>`,
  );
  return pathToFileURL(join(dir, 'index.html')).href;
}

/** One 10 s slide holding `objects`, with `triggers`. */
function course(objects: SceneObject[], triggers: Trigger[] = []): Project {
  const project = createEmptyProject('Animated');
  const slide = project.scenes[0]!.slides[0]!;
  slide.baseLayer.timeline.duration = 10;
  slide.baseLayer.objects.push(...objects);
  slide.triggers.push(...triggers);
  return project;
}

/** Mounted with a hand-turned clock: only `tick` moves time. */
async function mount(browserPage: Page, project: Project) {
  await browserPage.goto(page());
  await browserPage.evaluate((data) => {
    const w = window as unknown as Record<string, unknown>;
    w['player'] = (
      w['VedraOpusPlayer'] as { mountPlayer: (...args: unknown[]) => unknown }
    ).mountPlayer(document.getElementById('app'), data, { autoStart: false, clock: () => 0 });
  }, project);
}
const tick = (browserPage: Page, ms: number) =>
  browserPage.evaluate(
    (now) => (window as unknown as { player: { tick(n: number): void } }).player.tick(now),
    ms,
  );
const element = (browserPage: Page, id: string) =>
  browserPage.locator(`[data-object-id="${id}"]`).first();
const opacity = (browserPage: Page, selector: string) =>
  browserPage.locator(selector).evaluate((each) => Number(getComputedStyle(each).opacity));

test('a fade and a fly in, driven by the course’s own time', async ({ page: browserPage }) => {
  const faded = createShapeObject({ kind: 'rect' }, { x: 100, y: 100, width: 200, height: 100 });
  faded.animations.entrance = createEffect('fade', 1);
  const flown = createShapeObject({ kind: 'rect' }, { x: 500, y: 100, width: 200, height: 100 });
  flown.animations.entrance = { ...createEffect('fly', 1), direction: 'left' };
  await mount(browserPage, course([faded, flown]));
  const stageLeft = await browserPage
    .getByTestId('player-stage')
    .evaluate((each) => each.getBoundingClientRect().left);

  await tick(browserPage, 0);
  expect(await opacity(browserPage, `[data-object-id="${faded.id}"]`)).toBe(0);
  // Fully off the stage to the left.
  const startBox = await element(browserPage, flown.id).boundingBox();
  expect(startBox!.x + startBox!.width).toBeLessThanOrEqual(stageLeft + 1);

  await tick(browserPage, 500);
  const half = await opacity(browserPage, `[data-object-id="${faded.id}"]`);
  expect(half).toBeGreaterThan(0);
  expect(half).toBeLessThan(1);
  const midBox = await element(browserPage, flown.id).boundingBox();
  expect(midBox!.x).toBeGreaterThan(startBox!.x);

  await tick(browserPage, 1500);
  expect(await opacity(browserPage, `[data-object-id="${faded.id}"]`)).toBe(1);
  // In its place, with nothing left running on it.
  const scale = Number(await browserPage.getByTestId('player-stage').getAttribute('data-scale'));
  const endBox = await element(browserPage, flown.id).boundingBox();
  expect(endBox!.x).toBeCloseTo(stageLeft + 500 * scale, 0);
  expect(await element(browserPage, flown.id).evaluate((each) => each.getAnimations().length)).toBe(
    0,
  );

  // Time can go back: the fade is half done again.
  await browserPage.evaluate(() => {
    const w = window as unknown as {
      player: {
        engine: { seek(layer: string, s: number): void; getView(): { layers: { id: string }[] } };
      };
    };
    const engine = w.player.engine;
    engine.seek(engine.getView().layers[0]!.id, 0.5);
  });
  await tick(browserPage, 1500);
  const again = await opacity(browserPage, `[data-object-id="${faded.id}"]`);
  expect(again).toBeCloseTo(half, 2);
});

test('text by paragraph, one after another, and an exit finishing at the end', async ({
  page: browserPage,
}) => {
  const text = createTextObject('First\nSecond\nThird', {
    x: 100,
    y: 100,
    width: 300,
    height: 120,
  });
  text.animations.entrance = { ...createEffect('fade', 0.5), byParagraph: true };
  const leaving = createShapeObject({ kind: 'rect' }, { x: 500, y: 300, width: 100, height: 100 });
  leaving.timing = { start: 0, duration: 3 };
  leaving.animations.exit = createEffect('fade', 1);
  await mount(browserPage, course([text, leaving]));
  const paragraph = (n: number) =>
    `[data-object-id="${text.id}"] .vo-rich-text > p:nth-child(${n})`;

  await tick(browserPage, 0);
  await tick(browserPage, 750); // the second of three 0.5 s paragraphs is half done
  expect(await opacity(browserPage, paragraph(1))).toBe(1);
  const second = await opacity(browserPage, paragraph(2));
  expect(second).toBeGreaterThan(0);
  expect(second).toBeLessThan(1);
  expect(await opacity(browserPage, paragraph(3))).toBe(0);

  await tick(browserPage, 1900); // 1.9 s: the exit has not begun (it runs from 2 s to 3 s)
  expect(await opacity(browserPage, `[data-object-id="${leaving.id}"]`)).toBe(1);
  await tick(browserPage, 2500);
  const fading = await opacity(browserPage, `[data-object-id="${leaving.id}"]`);
  expect(fading).toBeGreaterThan(0);
  expect(fading).toBeLessThan(1);
  await tick(browserPage, 3100);
  await expect(element(browserPage, leaving.id)).toBeHidden();
  // The text has finished: every paragraph shows.
  expect(await opacity(browserPage, paragraph(3))).toBe(1);
});

test('a motion path moves the object, stops while paused, and its end runs a trigger', async ({
  page: browserPage,
}) => {
  const box = createShapeObject({ kind: 'rect' }, { x: 100, y: 100, width: 100, height: 100 });
  const path = {
    ...createMotionPath('line', 'Across', [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ]),
    easing: 'linear' as const,
  };
  box.animations.motionPaths = [path];
  const project = course([box]);
  const slide = project.scenes[0]!.slides[0]!;
  const base = { id: createId('trigger'), conditions: null, otherwise: null, enabled: true };
  slide.triggers.push(
    {
      ...base,
      owner: { kind: 'object', id: box.id },
      event: { type: 'timelineStart', layer: slide.baseLayer.id },
      action: { type: 'moveAlongPath', object: box.id, path: path.id },
    },
    {
      ...base,
      id: createId('trigger'),
      owner: { kind: 'object', id: box.id },
      event: {
        type: 'animationCompletes',
        object: box.id,
        animation: { kind: 'path', path: path.id },
      },
      action: {
        type: 'setVariable',
        variable: 'var_done',
        operator: 'assign',
        operand: { kind: 'literal', value: true },
      },
    },
  );
  // A one-slide course is complete once seen, so the trigger sets a variable instead.
  project.variables.push({ id: 'var_done', name: 'Done', type: 'boolean', default: false });
  await mount(browserPage, project);
  /** How far the box is from its own place, in stage units. */
  const moved = async () => {
    const scale = Number(await browserPage.getByTestId('player-stage').getAttribute('data-scale'));
    const stageLeft = await browserPage
      .getByTestId('player-stage')
      .evaluate((each) => each.getBoundingClientRect().left);
    const drawn = await element(browserPage, box.id).boundingBox();
    return Math.round((drawn!.x - stageLeft) / scale - 100);
  };
  const complete = () =>
    browserPage.evaluate(() =>
      (
        window as unknown as { player: { engine: { getVariable(name: string): unknown } } }
      ).player.engine.getVariable('Done'),
    );

  await tick(browserPage, 0);
  await tick(browserPage, 1000); // halfway through 2 s
  expect(await moved()).toBe(100);
  await browserPage.evaluate(() => {
    const engine = (
      window as unknown as {
        player: {
          engine: {
            setPaused(l: string, p: boolean): void;
            getView(): { layers: { id: string }[] };
          };
        };
      }
    ).player.engine;
    engine.setPaused(engine.getView().layers[0]!.id, true);
  });
  await tick(browserPage, 3000);
  expect(await moved()).toBe(100);
  expect(await complete()).toBe(false);
  await browserPage.evaluate(() => {
    const engine = (
      window as unknown as {
        player: {
          engine: {
            setPaused(l: string, p: boolean): void;
            getView(): { layers: { id: string }[] };
          };
        };
      }
    ).player.engine;
    engine.setPaused(engine.getView().layers[0]!.id, false);
  });
  await tick(browserPage, 4200); // 1.2 s more: the path is done
  expect(await moved()).toBe(200);
  expect(await complete()).toBe(true);
});

test('a group’s members show by their own time, with their own entrance, exit and path, inside a moving group (B8)', async ({
  page: browserPage,
}) => {
  // Two boxes in a group: one from 2 s, fading in over 1 s and out over its last 1 s (to 6 s);
  // the other the whole time, running its own path down while the group runs its path across.
  const timed = createShapeObject({ kind: 'rect' }, { x: 100, y: 100, width: 100, height: 100 });
  timed.timing = { start: 2, duration: 4 };
  timed.animations.entrance = createEffect('fade', 1);
  timed.animations.exit = createEffect('fade', 1);
  const mover = createShapeObject({ kind: 'rect' }, { x: 300, y: 100, width: 100, height: 100 });
  const down = {
    ...createMotionPath('line', 'Down', [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
    ]),
    easing: 'linear' as const,
    duration: 1,
  };
  mover.animations.motionPaths = [down];
  const group = createGroupObject([timed, mover]);
  const across = {
    ...createMotionPath('line', 'Across', [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ]),
    easing: 'linear' as const,
    duration: 1,
  };
  group.animations.motionPaths = [across];
  const project = course([group]);
  const slide = project.scenes[0]!.slides[0]!;
  const runAt = (object: string, path: string): Trigger => ({
    id: createId('trigger'),
    owner: { kind: 'slide', id: slide.id },
    event: { type: 'timelineStart', layer: slide.baseLayer.id },
    action: { type: 'moveAlongPath', object, path },
    conditions: null,
    otherwise: null,
    enabled: true,
  });
  slide.triggers.push(runAt(mover.id, down.id), runAt(group.id, across.id));
  await mount(browserPage, project);
  const stage = browserPage.getByTestId('player-stage');
  const scale = Number(await stage.getAttribute('data-scale'));
  const origin = await stage.evaluate((each) => {
    const box = each.getBoundingClientRect();
    return { x: box.left, y: box.top };
  });
  /** Where an object is drawn, in stage units. */
  const at = async (id: string) => {
    const box = (await element(browserPage, id).boundingBox())!;
    return {
      x: Math.round((box.x - origin.x) / scale),
      y: Math.round((box.y - origin.y) / scale),
    };
  };
  const shown = (id: string) =>
    element(browserPage, id).evaluate((each) => getComputedStyle(each).display !== 'none');

  await tick(browserPage, 0);
  // Before 2 s the timed box is not shown.
  expect(await shown(timed.id)).toBe(false);
  await tick(browserPage, 500);
  // Half-way along both paths: the group 100 across, the mover 50 down as well.
  expect(await at(mover.id)).toEqual({ x: 400, y: 150 });
  await tick(browserPage, 1500);
  // Both paths done: the mover 200 across with its group, and 100 down on its own.
  expect(await at(mover.id)).toEqual({ x: 500, y: 200 });

  await tick(browserPage, 2500); // 2.5 s: half-way into the timed box's fade in
  expect(await shown(timed.id)).toBe(true);
  const fadingIn = await opacity(browserPage, `[data-object-id="${timed.id}"]`);
  expect(fadingIn).toBeGreaterThan(0);
  expect(fadingIn).toBeLessThan(1);
  // It moved with its group too.
  expect(await at(timed.id)).toEqual({ x: 300, y: 100 });
  await tick(browserPage, 4000);
  expect(await opacity(browserPage, `[data-object-id="${timed.id}"]`)).toBe(1);
  await tick(browserPage, 5500); // half-way into its fade out
  const fadingOut = await opacity(browserPage, `[data-object-id="${timed.id}"]`);
  expect(fadingOut).toBeGreaterThan(0);
  expect(fadingOut).toBeLessThan(1);
  await tick(browserPage, 6500);
  expect(await shown(timed.id)).toBe(false);
  expect(await shown(mover.id)).toBe(true);
});

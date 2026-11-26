import {
  createEmptyProject,
  createGroupObject,
  createId,
  createPanoramaObject,
  createPanoramaSpot,
  createScene,
  createSlide,
  createTextObject,
} from '@vedraopus/model';
import type { PanoramaObject, Project } from '@vedraopus/model';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** 360° images in a course (docs/briefs/P9.10-panoramas.md). */

const dist = join(import.meta.dirname, '../dist');
const PICTURE = 'a'.repeat(64);

function page(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vedraopus-player-panorama-'));
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

/**
 * A slide with a 360° image (a Door marker straight ahead, a Window hotspot
 * behind) and a Note whose text says what triggers ran.
 */
function course(mode: PanoramaObject['props']['mode']) {
  const project: Project = createEmptyProject('Room');
  project.assets[PICTURE] = {
    kind: 'image',
    fileName: 'room.svg',
    ext: 'svg',
    mimeType: 'image/svg+xml',
    byteLength: 1,
  };
  project.variables.push({ id: createId('var'), name: 'Said', type: 'text', default: '' });
  const slide = createSlide('One');
  const image = createPanoramaObject(PICTURE, { x: 100, y: 50, width: 800, height: 400 });
  image.props.mode = mode;
  const door = createPanoramaSpot('Door', 0, 0);
  door.title = 'The door';
  door.body = 'It leads outside.';
  const window = createPanoramaSpot('Window', 180, 0, 'hotspot');
  image.props.spots = [door, window];
  const note = createTextObject('%Said%', { x: 100, y: 500, width: 600, height: 60 }, 'Note');
  slide.baseLayer.objects.push(image, note);
  const said = (event: Parameters<typeof slide.triggers.push>[0]['event'], words: string) =>
    slide.triggers.push({
      id: createId('trigger'),
      owner: { kind: 'slide', id: slide.id },
      event,
      action: {
        type: 'setVariable',
        variable: project.variables[0]!.id,
        operator: 'append',
        operand: { kind: 'literal', value: `${words} ` },
      },
      conditions: null,
      otherwise: null,
      enabled: true,
    });
  said({ type: 'spotClicked', object: image.id, spot: door.id }, 'door');
  said({ type: 'spotClicked', object: image.id, spot: window.id }, 'window');
  said({ type: 'panoramaVisited', object: image.id }, 'all');
  project.scenes = [{ ...createScene(), slides: [slide, createSlide('Two')] }];
  return { project, image, door, window, note };
}

async function mount(browserPage: Page, project: Project) {
  await browserPage.goto(page());
  await browserPage.evaluate((data) => {
    const w = window as unknown as Record<string, unknown>;
    // A picture made here, so nothing is fetched: four colours across, as a 360° picture would be.
    const picture =
      'data:image/svg+xml,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="256">' +
          '<rect width="128" height="256" fill="#e5484d"/><rect x="128" width="128" height="256" fill="#30a46c"/>' +
          '<rect x="256" width="128" height="256" fill="#3e63dd"/><rect x="384" width="128" height="256" fill="#ffc53d"/></svg>',
      );
    w['player'] = (
      w['VedraOpusPlayer'] as { mountPlayer: (...args: unknown[]) => unknown }
    ).mountPlayer(document.getElementById('app'), data, {
      assetUrl: () => picture,
      reducedMotion: true,
    });
  }, project);
}

const stage = (browserPage: Page) => browserPage.locator('.vo-player-stage');
const view = (browserPage: Page) => stage(browserPage).locator('.vo-panorama');
const note = (browserPage: Page, id: string) =>
  stage(browserPage).locator(`[data-object-id="${id}"]`).first();

test('a 360° image draws its picture, shows the spot ahead, and turns by drag and keys', async ({
  page: browserPage,
}) => {
  const { project } = course('free');
  await mount(browserPage, project);
  await expect(view(browserPage)).toHaveAttribute('data-painter', /sphere|flat/);
  const door = stage(browserPage).getByRole('button', { name: 'Door' });
  const window = stage(browserPage).getByRole('button', { name: 'Window' });
  await expect(door).toBeVisible();
  await expect(window).toBeHidden();
  await expect(view(browserPage)).toHaveAttribute('data-yaw', '0.0');

  // Dragging left turns the view right.
  const box = (await view(browserPage).boundingBox())!;
  await browserPage.mouse.move(box.x + box.width / 2 + 100, box.y + 50);
  await browserPage.mouse.down();
  await browserPage.mouse.move(box.x + box.width / 2 - 100, box.y + 50, { steps: 5 });
  await browserPage.mouse.up();
  const yaw = Number(await view(browserPage).getAttribute('data-yaw'));
  expect(yaw).toBeGreaterThan(5);

  // Keys turn it while it has focus; the slide does not change.
  await view(browserPage).focus();
  await browserPage.keyboard.press('ArrowRight');
  await expect(view(browserPage)).toHaveAttribute('data-yaw', (yaw + 5).toFixed(1));
  await expect(browserPage.locator('.vo-player-position')).toHaveText('Slide 1 of 2');
  await browserPage.keyboard.press('-');
  await expect(view(browserPage)).toHaveAttribute('data-fov', '80.0');
});

test('opening spots runs their triggers, a marker shows its label, and all visited runs once', async ({
  page: browserPage,
}) => {
  const { project, note: text } = course('free');
  await mount(browserPage, project);
  await stage(browserPage).getByRole('button', { name: 'Door' }).click();
  await expect(note(browserPage, text.id)).toHaveText('door');
  const label = stage(browserPage).getByRole('dialog', { name: 'The door' });
  await expect(label).toContainText('It leads outside.');
  await browserPage.keyboard.press('Escape');
  await expect(label).toBeHidden();
  // Turn round to the window, behind.
  await view(browserPage).focus();
  for (let i = 0; i < 36; i++) await browserPage.keyboard.press('ArrowRight');
  const window = stage(browserPage).getByRole('button', { name: 'Window' });
  await expect(window).toBeVisible();
  await window.click();
  await expect(note(browserPage, text.id)).toHaveText('door window all');
  // A hotspot has no label.
  await expect(stage(browserPage).getByRole('dialog')).toHaveCount(0);
  await stage(browserPage).getByRole('button', { name: 'Window' }).click();
  await expect(note(browserPage, text.id)).toHaveText('door window all window');
});

test('guided: Next turns to each spot in order and opens it', async ({ page: browserPage }) => {
  const { project, note: text } = course('guided');
  await mount(browserPage, project);
  const next = stage(browserPage).getByRole('button', { name: 'Next spot' });
  await next.click();
  await expect(view(browserPage)).toHaveAttribute('data-yaw', '0.0');
  await expect(stage(browserPage).getByRole('dialog', { name: 'The door' })).toBeVisible();
  await next.click();
  await expect(view(browserPage)).toHaveAttribute('data-yaw', /^-?180\.0$/);
  await expect(stage(browserPage).getByRole('button', { name: 'Window' })).toBeVisible();
  await expect(note(browserPage, text.id)).toHaveText('door window all');
  await stage(browserPage).getByRole('button', { name: 'Previous spot' }).click();
  await expect(view(browserPage)).toHaveAttribute('data-yaw', '0.0');
});

test('without WebGL the picture pans flat, and the spots still work', async ({
  page: browserPage,
}) => {
  await browserPage.addInitScript(() => {
    const own = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind: string,
      ...rest: unknown[]
    ) {
      if (kind === 'webgl' || kind === 'webgl2') return null;
      return (own as (...args: unknown[]) => unknown).call(this, kind, ...rest);
    } as typeof own;
  });
  const { project, note: text } = course('free');
  await mount(browserPage, project);
  await expect(view(browserPage)).toHaveAttribute('data-painter', 'flat');
  // The middle of the view is the picture's middle: the green and blue meet there.
  const colour = await view(browserPage)
    .locator('canvas')
    .evaluate((canvas: HTMLCanvasElement) => {
      const context = canvas.getContext('2d')!;
      const left = context.getImageData(canvas.width / 2 - 20, canvas.height / 2, 1, 1).data;
      const right = context.getImageData(canvas.width / 2 + 20, canvas.height / 2, 1, 1).data;
      return [Array.from(left.slice(0, 3)), Array.from(right.slice(0, 3))];
    });
  expect(colour).toEqual([
    [48, 164, 108],
    [62, 99, 221],
  ]);
  await stage(browserPage).getByRole('button', { name: 'Door' }).click();
  await expect(note(browserPage, text.id)).toHaveText('door');
});

test('inside a group, a 360° image is drawn and its spots work (the Phase 9 review)', async ({
  page: browserPage,
}) => {
  const { project, image, note: text } = course('free');
  const slide = project.scenes[0]!.slides[0]!;
  const others = slide.baseLayer.objects.filter((each) => each.id !== image.id);
  slide.baseLayer.objects = [createGroupObject([image, others[0]!], 'Room'), ...others.slice(1)];
  await mount(browserPage, project);
  await expect(view(browserPage)).toHaveAttribute('data-painter', /sphere|flat/);
  await stage(browserPage).getByRole('button', { name: 'Door' }).click();
  await expect(note(browserPage, text.id)).toHaveText('door');
  await expect(stage(browserPage).getByRole('button', { name: 'Door' })).toHaveAttribute(
    'data-visited',
    'true',
  );
});

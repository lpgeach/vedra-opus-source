import { createEmptyProject, createShapeObject, createZoomRegion } from '@vedraopus/model';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dist = join(import.meta.dirname, '../dist');

function page(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vedraopus-player-zoom-'));
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

const tick = (browserPage: Page, ms: number) =>
  browserPage.evaluate(
    (now) => (window as unknown as { player: { tick(n: number): void } }).player.tick(now),
    ms,
  );

test('a zoom region zooms the view in to it, and back out at its end', async ({
  page: browserPage,
}) => {
  const project = createEmptyProject('Zoom');
  project.stage = { width: 960, height: 540 };
  const slide = project.scenes[0]!.slides[0]!;
  slide.baseLayer.timeline.duration = 10;
  // A box in the top-left quarter, and a region over that quarter from 1 s to 4 s.
  const box = createShapeObject({ kind: 'rect' }, { x: 40, y: 40, width: 100, height: 60 });
  const region = { ...createZoomRegion(project.stage, { x: 0, y: 0, width: 480, height: 270 }) };
  region.timing = { start: 1, duration: 3 };
  slide.baseLayer.objects.push(box, region);
  await browserPage.goto(page());
  await browserPage.evaluate((data) => {
    const w = window as unknown as Record<string, unknown>;
    w['player'] = (
      w['VedraOpusPlayer'] as { mountPlayer: (...args: unknown[]) => unknown }
    ).mountPlayer(document.getElementById('app'), data, { autoStart: false, clock: () => 0 });
  }, project);
  const stage = browserPage.getByTestId('player-stage');
  const scale = Number(await stage.getAttribute('data-scale'));
  const stageBox = (await stage.boundingBox())!;
  const boxAt = async () => {
    const drawn = (await browserPage.locator(`[data-object-id="${box.id}"]`).boundingBox())!;
    return {
      x: (drawn.x - stageBox.x) / scale,
      y: (drawn.y - stageBox.y) / scale,
      width: drawn.width / scale,
    };
  };
  const unzoomed = async () => {
    const at = await boxAt();
    expect(at.x).toBeCloseTo(40, 0);
    expect(at.y).toBeCloseTo(40, 0);
    expect(at.width).toBeCloseTo(100, 0);
  };
  // The region draws nothing in a course.
  expect(
    await browserPage
      .locator(`[data-object-id="${region.id}"]`)
      .evaluate((each) => each.children.length),
  ).toBe(0);

  await tick(browserPage, 0);
  await unzoomed();
  // 2 s: zoomed in on the quarter, so everything is twice the size from the corner.
  await tick(browserPage, 2000);
  const zoomed = await boxAt();
  expect(zoomed.x).toBeCloseTo(80, 0);
  expect(zoomed.y).toBeCloseTo(80, 0);
  expect(zoomed.width).toBeCloseTo(200, 0);
  // 1.25 s: a quarter second into a half-second zoom, half eased: the view is halfway from
  // 960 wide to 480, so 720, and the box 100 × 960 / 720 = 133.3 wide.
  await browserPage.evaluate(() => {
    const engine = (
      window as unknown as {
        player: {
          engine: { seek(l: string, s: number): void; getView(): { layers: { id: string }[] } };
        };
      }
    ).player.engine;
    engine.seek(engine.getView().layers[0]!.id, 1.25);
  });
  await tick(browserPage, 2000);
  expect((await boxAt()).width).toBeCloseTo(133.33, 0);
  // 4.5 s: the region's bar has ended, and the view is whole again.
  await tick(browserPage, 5250);
  await unzoomed();
});

import { createEngine } from '@vedraopus/engine';
import { parseProject } from '@vedraopus/model';
import { expect, test } from '@playwright/test';
import type { ElectronApplication, Locator, Page } from '@playwright/test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packTwoSlides } from './fixture';
import { answerDialogs, launchApp } from './launch';

const project = parseProject(
  JSON.parse(
    readFileSync(join(import.meta.dirname, '../fixtures/projects/two-slides/project.json'), 'utf8'),
  ),
);
const slide = project.scenes[0]!.slides[0]!;
const byName = (name: string) => slide.baseLayer.objects.find((o) => o.name === name)!;

/** What the engine itself shows on the first slide at `seconds`, back to front. */
function engineShows(seconds: number): string[] {
  const engine = createEngine(project);
  engine.seek(slide.baseLayer.id, seconds);
  return engine
    .getView()
    .layers[0]!.objects.filter((o) => o.visible)
    .map((o) => o.id);
}

async function start(): Promise<{ app: ElectronApplication; page: Page }> {
  const file = await packTwoSlides(mkdtempSync(join(tmpdir(), 'vedraopus-e2e-timeline-')));
  const { app, page } = await launchApp({ args: [file] });
  await expect(page.getByTestId('stage-canvas')).toBeVisible();
  await answerDialogs(app, { message: [1] });
  await expect(page.getByTestId('timeline')).toBeVisible();
  return { app, page };
}

const stageIds = (page: Page) =>
  page
    .locator('.stage-slide > [data-object-id]')
    .evaluateAll((elements) => elements.map((e) => e.getAttribute('data-object-id')));
const rows = (page: Page) => page.getByTestId('timeline-row');
const row = (page: Page, name: string) =>
  page.locator(`[data-testid="timeline-row"][data-object-id="${byName(name).id}"]`);
const bar = (page: Page, name: string) => row(page, name).getByTestId('timeline-bar');
const undo = (page: Page) => page.getByRole('button', { name: 'Undo' }).click();

/** Where a time is on the ruler, on screen. */
async function rulerPoint(page: Page, seconds: number): Promise<{ x: number; y: number }> {
  const ruler = page.getByTestId('timeline-ruler');
  await page.locator('.timeline-scroll').evaluate((element) => element.scrollTo(0, 0));
  const box = (await ruler.boundingBox())!;
  const pps = Number(await ruler.getAttribute('data-pps'));
  return { x: box.x + seconds * pps, y: box.y + 4 };
}

async function dragBy(page: Page, target: Locator, dx: number): Promise<void> {
  // The panel scrolls; a pointer can only press what is in view.
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y);
  await page.mouse.move(x + dx, y);
  await page.mouse.up();
}

test('scrubbing the playhead shows the stage exactly as the engine would', async () => {
  const { app, page } = await start();
  try {
    const all = slide.baseLayer.objects.map((o) => o.id);
    // Not scrubbing: every object is on the stage, whatever its timing, so it can be edited.
    expect(await stageIds(page)).toEqual(all);

    const first = await rulerPoint(page, 0.2);
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    for (const seconds of [0.2, 0.7, 2, 4.5, 0.9, 5]) {
      const at = await rulerPoint(page, seconds);
      await page.mouse.move(at.x, at.y);
      const shown = Number(await page.getByTestId('timeline-playhead').getAttribute('data-time'));
      expect(shown).toBeCloseTo(seconds, 1);
      // Compare with the engine at the time the playhead really reports.
      expect(await stageIds(page), `stage at ${seconds} s`).toEqual(engineShows(shown));
    }
    // The cases above do differ from one another: the picture is only there from 1 s to 4 s.
    expect(engineShows(2)).toContain(byName('Blue square').id);
    expect(engineShows(4.5)).not.toContain(byName('Blue square').id);
    expect(engineShows(0.2)).not.toContain(byName('Panel').id);

    await page.mouse.up();
    expect(await stageIds(page)).toEqual(all);
  } finally {
    await app.close();
  }
});

test('rows follow z-order and bars follow timing; dragging a bar changes it, undoably', async () => {
  const { app, page } = await start();
  try {
    // Top row is the front object.
    const order = await rows(page).evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-object-id')),
    );
    expect(order).toEqual(slide.baseLayer.objects.map((o) => o.id).reverse());

    const picture = bar(page, 'Blue square');
    await expect(picture).toHaveAttribute('data-start', '1');
    await expect(picture).toHaveAttribute('data-duration', '3');
    await expect(bar(page, 'Panel')).toHaveAttribute('data-duration', 'untilEnd');

    // 80 px is one second at the default zoom.
    await dragBy(page, picture, 40);
    await expect(picture).toHaveAttribute('data-start', '1.5');
    await expect(picture).toHaveAttribute('data-duration', '3');
    await undo(page);
    await expect(picture).toHaveAttribute('data-start', '1');

    await dragBy(page, row(page, 'Blue square').getByTestId('timeline-bar-end'), -80);
    await expect(picture).toHaveAttribute('data-duration', '2');
    await dragBy(page, row(page, 'Blue square').getByTestId('timeline-bar-start'), 40);
    await expect(picture).toHaveAttribute('data-start', '1.5');
    await expect(picture).toHaveAttribute('data-duration', '1.5');
    // Dragged past the end of the timeline, it stays until the end.
    await dragBy(page, row(page, 'Blue square').getByTestId('timeline-bar-end'), 400);
    await expect(picture).toHaveAttribute('data-duration', 'untilEnd');
  } finally {
    await app.close();
  }
});

test('hide, lock, rename, reorder, show until end and align to playhead', async () => {
  const { app, page } = await start();
  try {
    const panel = byName('Panel');
    await page.getByRole('button', { name: 'Hide Panel', exact: true }).click();
    expect(await stageIds(page)).not.toContain(panel.id);
    await page.getByRole('button', { name: 'Show Panel', exact: true }).click();
    expect(await stageIds(page)).toContain(panel.id);

    await page.getByRole('button', { name: 'Lock Panel', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Unlock Panel', exact: true })).toBeVisible();

    await row(page, 'Panel').locator('.timeline-name').dblclick();
    await page.getByLabel('Object name').fill('Backdrop');
    await page.keyboard.press('Enter');
    await expect(row(page, 'Panel')).toContainText('Backdrop');

    // Bring the back object (the title) forward one place.
    await page.getByRole('button', { name: 'Bring Title forward', exact: true }).click();
    const ids = slide.baseLayer.objects.map((o) => o.id);
    expect(await stageIds(page)).toEqual([ids[1], ids[0], ids[2], ids[3]]);
    await undo(page);
    expect(await stageIds(page)).toEqual(ids);

    // Select the picture's row, then use the playhead commands.
    await row(page, 'Blue square').locator('.timeline-name').click();
    await expect(page.getByTestId('project-status')).toContainText('1 object selected');
    const at = await rulerPoint(page, 2);
    await page.mouse.click(at.x, at.y);
    await page.getByRole('button', { name: 'Align to playhead' }).click();
    await expect(bar(page, 'Blue square')).toHaveAttribute('data-start', '2');
    await page.getByRole('button', { name: 'Show until end' }).click();
    await expect(bar(page, 'Blue square')).toHaveAttribute('data-duration', 'untilEnd');
  } finally {
    await app.close();
  }
});

test('cue points, timeline length, zoom and play', async () => {
  const { app, page } = await start();
  try {
    const cues = page.getByTestId('timeline-cue');
    const at = await rulerPoint(page, 1);
    await page.mouse.click(at.x, at.y);
    await page.getByRole('button', { name: 'Add cue point' }).click();
    await expect(cues).toHaveCount(1);
    await expect(cues).toHaveAttribute('data-time', '1');
    await dragBy(page, cues, 80);
    await expect(cues).toHaveAttribute('data-time', '2');
    await page.getByRole('button', { name: 'Delete cue point' }).click();
    await expect(cues).toHaveCount(0);
    await undo(page);
    await expect(cues).toHaveCount(1);

    const ruler = page.getByTestId('timeline-ruler');
    await page.getByRole('button', { name: 'Zoom timeline in' }).click();
    await expect(ruler).toHaveAttribute('data-pps', '160');
    await page.getByRole('button', { name: 'Zoom timeline out' }).click();
    await expect(ruler).toHaveAttribute('data-pps', '80');

    // A shorter timeline pulls the cue point back, and Play runs to its end and stops.
    await page.getByLabel('Timeline length in seconds').fill('1');
    await expect(cues).toHaveAttribute('data-time', '1');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId('timeline-playhead')).toHaveAttribute('data-time', '1');
    // Playing is over: everything is back on the stage for editing.
    expect(await stageIds(page)).toHaveLength(4);
  } finally {
    await app.close();
  }
});

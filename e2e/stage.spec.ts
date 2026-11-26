import { expect, test } from '@playwright/test';
import type { ElectronApplication, Locator, Page } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { answerDialogs, launchApp, windowsHidden, windowsTransparent } from './launch';

const DONT_SAVE = 1;
const fixtureAssets = join(import.meta.dirname, '../fixtures/projects/two-slides/assets');
const imagePath = join(fixtureAssets, readdirSync(fixtureAssets)[0]!);

interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}
interface Point {
  x: number;
  y: number;
}

const canvas = (page: Page) => page.getByTestId('stage-canvas');
const objects = (page: Page) => canvas(page).locator('.stage-slide > [data-object-id]');
const status = (page: Page) => page.getByTestId('project-status');
const handle = (page: Page, name: string) => canvas(page).locator(`[data-handle="${name}"]`);
const undo = (page: Page) => page.getByRole('button', { name: 'Undo' }).click();
const redo = (page: Page) => page.getByRole('button', { name: 'Redo' }).click();

/** An object's frame in stage units, read from how it is drawn. */
async function frameOf(object: Locator): Promise<Frame> {
  return object.evaluate((element: HTMLElement) => {
    const turn = /rotate\(([-\d.]+)deg\)/.exec(element.style.transform);
    return {
      x: parseFloat(element.style.left),
      y: parseFloat(element.style.top),
      width: parseFloat(element.style.width),
      height: parseFloat(element.style.height),
      rotation: turn ? Number(turn[1]) : 0,
    };
  });
}

/** Where a stage point is on screen right now. */
async function onScreen(page: Page, point: Point): Promise<Point> {
  const bounds = await canvas(page).boundingBox();
  const zoom = Number(await canvas(page).getAttribute('data-zoom'));
  return { x: bounds!.x + point.x * zoom, y: bounds!.y + point.y * zoom };
}

/**
 * Wait for layout to settle. Two frames cover a ResizeObserver's callback and
 * the render it causes, which is what moves the canvas when a panel or ruler
 * appears or disappears.
 */
async function settleLayout(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

type Modifier = 'Shift' | 'Alt' | 'Control';

/** Press at one stage point and release at another, optionally holding keys for the move. */
async function dragOnStage(
  page: Page,
  from: Point,
  to: Point,
  options: { modifiers?: Modifier[]; release?: boolean } = {},
): Promise<void> {
  const start = await onScreen(page, from);
  const end = await onScreen(page, to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const key of options.modifiers ?? []) await page.keyboard.down(key);
  await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2);
  await page.mouse.move(end.x, end.y);
  if (options.release === false) return;
  await page.mouse.up();
  for (const key of options.modifiers ?? []) await page.keyboard.up(key);
}

/** Drag a selection handle to a stage point. */
async function dragHandle(
  page: Page,
  name: string,
  to: Point,
  modifiers: Modifier[] = [],
): Promise<void> {
  const bounds = await handle(page, name).boundingBox();
  const end = await onScreen(page, to);
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.mouse.down();
  for (const key of modifiers) await page.keyboard.down(key);
  await page.mouse.move((bounds!.x + end.x) / 2, (bounds!.y + end.y) / 2);
  await page.mouse.move(end.x, end.y);
  await page.mouse.up();
  for (const key of modifiers) await page.keyboard.up(key);
}

async function clickStage(page: Page, point: Point, modifiers: Modifier[] = []): Promise<void> {
  const at = await onScreen(page, point);
  for (const key of modifiers) await page.keyboard.down(key);
  await page.mouse.click(at.x, at.y);
  for (const key of modifiers) await page.keyboard.up(key);
}

/** Right-click the stage and wait for its menu to appear. */
async function rightClickStage(page: Page, point: Point): Promise<void> {
  const at = await onScreen(page, point);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await expect(page.getByTestId('stage-context-menu')).toBeVisible();
}

/** Choose an item from the stage's own right-click menu. */
async function chooseStageMenu(page: Page, name: string): Promise<void> {
  const menu = page.getByTestId('stage-context-menu');
  await menu.getByRole('menuitem', { name, exact: true }).click();
  await expect(menu).toHaveCount(0);
}

async function insertShape(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name: 'Insert' }).click();
  await page.getByRole('button', { name: 'Shape', exact: true }).click();
  await page.getByTestId('shape-gallery').getByRole('button', { name, exact: true }).click();
}

async function chooseMenuItem(app: ElectronApplication, id: string): Promise<void> {
  await app.evaluate(({ Menu }, itemId) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(itemId);
    if (!item) throw new Error(`No menu item ${itemId}`);
    item.click();
  }, id);
}

/** A new project with unsaved changes expected, so closing does not prompt. */
async function start(): Promise<{ app: ElectronApplication; page: Page }> {
  const { app, page } = await launchApp();
  await answerDialogs(app, { message: [DONT_SAVE] });
  await page.getByRole('button', { name: 'New Project' }).click();
  await expect(canvas(page)).toBeVisible();
  return { app, page };
}

const RECT: Frame = { x: 540, y: 300, width: 200, height: 120, rotation: 0 };

test('draw, move, resize, rotate, then undo each', async () => {
  const { app, page } = await start();
  try {
    // Draw: a new shape lands in the middle of the 1280×720 stage, selected.
    await insertShape(page, 'Rectangle');
    await expect(objects(page)).toHaveCount(1);
    const shape = objects(page).first();
    expect(await frameOf(shape)).toEqual(RECT);
    await expect(status(page)).toContainText('1 object selected');
    await expect(page.getByTestId('selection')).toBeVisible();

    // Move.
    await dragOnStage(page, { x: 640, y: 360 }, { x: 740, y: 410 }, { modifiers: ['Control'] });
    const moved = { ...RECT, x: 640, y: 350 };
    expect(await frameOf(shape)).toEqual(moved);

    // Resize from the bottom-right handle: the top-left corner stays put.
    await dragHandle(page, 'se', { x: 900, y: 510 }, ['Control']);
    const resized = { ...moved, width: 260, height: 160 };
    expect(await frameOf(shape)).toEqual(resized);

    // Rotate: carry the handle from above the centre round to its right.
    const centre = { x: resized.x + resized.width / 2, y: resized.y + resized.height / 2 };
    await dragHandle(page, 'rotate', { x: centre.x + 300, y: centre.y });
    const rotated = { ...resized, rotation: 90 };
    expect(await frameOf(shape)).toEqual(rotated);

    // Each of those was one step.
    await undo(page);
    expect(await frameOf(shape)).toEqual(resized);
    await undo(page);
    expect(await frameOf(shape)).toEqual(moved);
    await undo(page);
    expect(await frameOf(shape)).toEqual(RECT);
    await undo(page);
    await expect(objects(page)).toHaveCount(0);
    await expect(page.getByTestId('selection')).toHaveCount(0);

    for (let step = 0; step < 4; step++) await redo(page);
    expect(await frameOf(objects(page).first())).toEqual(rotated);
  } finally {
    await app.close();
  }
});

test('select by click, shift-click and marquee; clear with a click on empty stage or Escape', async () => {
  const { app, page } = await start();
  try {
    await insertShape(page, 'Rectangle');
    await insertShape(page, 'Ellipse');
    // The second lands just off the first rather than exactly on top of it.
    expect(await frameOf(objects(page).nth(1))).toMatchObject({ x: 556, y: 316 });
    // Pull them apart: rectangle left, ellipse right.
    await dragOnStage(page, { x: 700, y: 400 }, { x: 1000, y: 400 }, { modifiers: ['Control'] });
    await clickStage(page, { x: 100, y: 100 });
    await expect(status(page)).not.toContainText('selected');
    await expect(page.getByTestId('selection')).toHaveCount(0);

    await clickStage(page, { x: 600, y: 360 });
    await expect(status(page)).toContainText('1 object selected');
    await clickStage(page, { x: 950, y: 376 }, ['Shift']);
    await expect(status(page)).toContainText('2 objects selected');
    // Shift-click again takes it back out.
    await clickStage(page, { x: 950, y: 376 }, ['Shift']);
    await expect(status(page)).toContainText('1 object selected');

    await page.keyboard.press('Escape');
    await expect(status(page)).not.toContainText('selected');

    // A marquee from empty stage picks up everything it touches.
    await dragOnStage(page, { x: 400, y: 200 }, { x: 600, y: 350 });
    await expect(status(page)).toContainText('1 object selected');
    await dragOnStage(page, { x: 400, y: 200 }, { x: 900, y: 350 });
    await expect(status(page)).toContainText('2 objects selected');
    await expect(page.getByTestId('marquee')).toHaveCount(0);

    await clickStage(page, { x: 100, y: 600 });
    await expect(status(page)).not.toContainText('selected');
    await chooseMenuItem(app, 'edit.selectAll');
    await expect(status(page)).toContainText('2 objects selected');
  } finally {
    await app.close();
  }
});

test('several objects move together as one undo step', async () => {
  const { app, page } = await start();
  try {
    await insertShape(page, 'Rectangle');
    await insertShape(page, 'Triangle');
    await chooseMenuItem(app, 'edit.selectAll');
    await dragOnStage(page, { x: 600, y: 360 }, { x: 500, y: 460 }, { modifiers: ['Control'] });

    expect(await frameOf(objects(page).nth(0))).toMatchObject({ x: 440, y: 400 });
    expect(await frameOf(objects(page).nth(1))).toMatchObject({ x: 456, y: 416 });
    await undo(page);
    expect(await frameOf(objects(page).nth(0))).toMatchObject({ x: 540, y: 300 });
    expect(await frameOf(objects(page).nth(1))).toMatchObject({ x: 556, y: 316 });
  } finally {
    await app.close();
  }
});

test('group, move, resize and rotate as one, then ungroup', async () => {
  const { app, page } = await start();
  try {
    // Put three shapes where each can be clicked on its own.
    await insertShape(page, 'Rectangle');
    await dragOnStage(page, { x: 640, y: 360 }, { x: 400, y: 200 }, { modifiers: ['Control'] });
    await insertShape(page, 'Ellipse');
    await dragOnStage(page, { x: 640, y: 360 }, { x: 880, y: 200 }, { modifiers: ['Control'] });
    await insertShape(page, 'Triangle');
    await dragOnStage(page, { x: 640, y: 360 }, { x: 640, y: 520 }, { modifiers: ['Control'] });

    await clickStage(page, { x: 400, y: 200 });
    await clickStage(page, { x: 880, y: 200 }, ['Shift']);
    await expect(status(page)).toContainText('2 objects selected');
    await page.getByRole('tab', { name: 'Home' }).click();
    await page.getByRole('button', { name: 'Group', exact: true }).click();

    // The two became one top-level object, selected.
    await expect(objects(page)).toHaveCount(2);
    await expect(status(page)).toContainText('1 object selected');

    // Moving the group moves both children and is one undo step.
    const group = objects(page).first();
    const children = group.locator('[data-object-id]');
    await dragOnStage(page, { x: 400, y: 200 }, { x: 450, y: 250 }, { modifiers: ['Control'] });
    expect(await frameOf(children.nth(0))).toMatchObject({ x: 350, y: 190 });
    expect(await frameOf(children.nth(1))).toMatchObject({ x: 830, y: 190 });
    await undo(page);
    expect(await frameOf(children.nth(0))).toMatchObject({ x: 300, y: 140 });

    // The group's box is 300–980 × 140–260; pull its east handle half as wide
    // again: both children grow and move with it.
    await dragHandle(page, 'e', { x: 1320, y: 200 }, ['Control']);
    expect(await frameOf(children.nth(0))).toEqual({
      x: 300,
      y: 140,
      width: 300,
      height: 120,
      rotation: 0,
    });
    expect(await frameOf(children.nth(1))).toEqual({
      x: 1020,
      y: 140,
      width: 300,
      height: 120,
      rotation: 0,
    });
    await undo(page);

    // Turning the group turns each child about the group's centre.
    await dragHandle(page, 'rotate', { x: 940, y: 200 });
    expect((await frameOf(children.nth(0))).rotation).toBe(90);
    expect((await frameOf(children.nth(1))).rotation).toBe(90);
    await undo(page);

    await page.getByRole('button', { name: 'Ungroup', exact: true }).click();
    await expect(objects(page)).toHaveCount(3);
    await expect(status(page)).toContainText('2 objects selected');
  } finally {
    await app.close();
  }
});

test('a locked object cannot be clicked, selected, moved or deleted until Unlock All', async () => {
  const { app, page } = await start();
  try {
    await insertShape(page, 'Rectangle');
    await dragOnStage(page, { x: 640, y: 360 }, { x: 400, y: 200 }, { modifiers: ['Control'] });
    await page.getByRole('tab', { name: 'Home' }).click();
    await page.getByRole('button', { name: 'Lock', exact: true }).click();
    await expect(status(page)).not.toContainText('selected');
    await expect(objects(page)).toHaveCount(1);

    // Neither a click nor a marquee picks it up.
    await clickStage(page, { x: 400, y: 200 });
    await expect(status(page)).not.toContainText('selected');
    await dragOnStage(page, { x: 250, y: 100 }, { x: 550, y: 300 });
    await expect(status(page)).not.toContainText('selected');

    // Select All skips it, so there is nothing for Delete to remove.
    await chooseMenuItem(app, 'edit.selectAll');
    await expect(status(page)).not.toContainText('selected');
    await page.keyboard.press('Delete');
    await expect(objects(page)).toHaveCount(1);

    await page.getByRole('button', { name: 'Unlock All', exact: true }).click();
    await clickStage(page, { x: 400, y: 200 });
    await expect(status(page)).toContainText('1 object selected');
  } finally {
    await app.close();
  }
});

test('z-order commands move the selection, keeping its own order', async () => {
  const { app, page } = await start();
  try {
    await insertShape(page, 'Rectangle');
    await dragOnStage(page, { x: 640, y: 360 }, { x: 400, y: 200 }, { modifiers: ['Control'] });
    await insertShape(page, 'Ellipse');
    await dragOnStage(page, { x: 640, y: 360 }, { x: 880, y: 200 }, { modifiers: ['Control'] });
    await insertShape(page, 'Triangle');
    await dragOnStage(page, { x: 640, y: 360 }, { x: 640, y: 520 }, { modifiers: ['Control'] });
    await page.getByRole('tab', { name: 'Home' }).click();

    // Back to front, bottom to top.
    const order = async () =>
      canvas(page)
        .locator('.stage-slide > [data-object-id]')
        .evaluateAll((elements) =>
          elements.map((element) => element.getAttribute('data-object-id')),
        );
    const [rect, ellipse, triangle] = await order();

    await clickStage(page, { x: 400, y: 200 });
    const choose = async (item: string) => {
      await page.getByRole('button', { name: 'Order', exact: true }).click();
      await page.getByRole('menuitem', { name: item }).click();
    };

    await choose('Bring to Front');
    expect(await order()).toEqual([ellipse, triangle, rect]);
    await choose('Send to Back');
    expect(await order()).toEqual([rect, ellipse, triangle]);
    await choose('Bring Forward');
    expect(await order()).toEqual([ellipse, rect, triangle]);
    await choose('Send Backward');
    expect(await order()).toEqual([rect, ellipse, triangle]);

    // Two at once keep their order: rectangle stayed below ellipse.
    await clickStage(page, { x: 880, y: 200 }, ['Shift']);
    await choose('Bring to Front');
    expect(await order()).toEqual([triangle, rect, ellipse]);
  } finally {
    await app.close();
  }
});

test('aligns to the stage or to each other, and distributes the gaps', async () => {
  const { app, page } = await start();
  try {
    // Rectangle and ellipse side by side, triangle below between them.
    await insertShape(page, 'Rectangle');
    await dragOnStage(page, { x: 640, y: 360 }, { x: 400, y: 200 }, { modifiers: ['Control'] });
    await insertShape(page, 'Ellipse');
    await dragOnStage(page, { x: 640, y: 360 }, { x: 880, y: 200 }, { modifiers: ['Control'] });
    await insertShape(page, 'Triangle');
    await dragOnStage(page, { x: 640, y: 360 }, { x: 700, y: 520 }, { modifiers: ['Control'] });
    await page.getByRole('tab', { name: 'Home' }).click();

    const frames = async () =>
      Promise.all([0, 1, 2].map((index) => frameOf(objects(page).nth(index))));
    const choose = async (item: string) => {
      await page.getByRole('button', { name: 'Align', exact: true }).click();
      await page.getByRole('menuitem', { name: item }).click();
    };
    expect(await frames()).toMatchObject([
      { x: 300, y: 140 },
      { x: 780, y: 140 },
      { x: 600, y: 460 },
    ]);

    // Several objects line up inside the box around them.
    await chooseMenuItem(app, 'edit.selectAll');
    await choose('Align Left');
    expect(await frames()).toMatchObject([
      { x: 300, y: 140 },
      { x: 300, y: 140 },
      { x: 300, y: 460 },
    ]);
    await undo(page);
    await choose('Align Top');
    expect((await frames()).map((frame) => frame.y)).toEqual([140, 140, 140]);
    await undo(page);

    // One object lines up in the stage instead.
    await clickStage(page, { x: 100, y: 600 });
    await clickStage(page, { x: 400, y: 200 });
    expect(status(page)).toContainText('1 object selected');
    await choose('Align Right');
    expect(await frameOf(objects(page).nth(0))).toMatchObject({ x: 1080, y: 140 });
    await undo(page);
    expect(await frameOf(objects(page).nth(0))).toMatchObject({ x: 300, y: 140 });

    // Distribute leaves the outermost two alone and evens out the middle.
    await chooseMenuItem(app, 'edit.selectAll');
    await choose('Distribute Horizontally');
    expect(await frames()).toMatchObject([
      { x: 300, y: 140 },
      { x: 780, y: 140 },
      { x: 540, y: 460 },
    ]);
    await undo(page);
    await choose('Distribute Vertically');
    expect(await frames()).toMatchObject([
      { x: 300, y: 140 },
      { x: 780, y: 300 },
      { x: 600, y: 460 },
    ]);
    await undo(page);
    expect(await frames()).toMatchObject([
      { x: 300, y: 140 },
      { x: 780, y: 140 },
      { x: 600, y: 460 },
    ]);
  } finally {
    await app.close();
  }
});

test('a move snaps to other objects, lines show where, and Ctrl suspends it', async () => {
  const { app, page } = await start();
  try {
    await insertShape(page, 'Rectangle');
    await dragOnStage(page, { x: 640, y: 360 }, { x: 400, y: 200 }, { modifiers: ['Control'] });
    await insertShape(page, 'Ellipse');
    await dragOnStage(page, { x: 640, y: 360 }, { x: 880, y: 200 }, { modifiers: ['Control'] });
    // The rectangle is at 300–500; the ellipse at 780–980.
    // Aim close enough to snap at the fit zoom, but not exactly on the line,
    // so suspending the snap with Ctrl is visibly different.
    const zoom = Number(await canvas(page).getAttribute('data-zoom'));
    const near = Math.max(1, Math.min(20, Math.floor(6 / zoom) - 1));
    const aim = 780 - near;
    // The pointer grabbed the rectangle 100 units in from its left edge.
    const pointer = 880 - near;

    await dragOnStage(page, { x: 400, y: 200 }, { x: pointer, y: 200 }, { release: false });
    expect(await frameOf(objects(page).nth(0))).toMatchObject({ x: 780, y: 140 });
    await expect(canvas(page).locator('.snap-line')).not.toHaveCount(0);
    await page.mouse.up();
    await expect(canvas(page).locator('.snap-line')).toHaveCount(0);
    await undo(page);
    expect(await frameOf(objects(page).nth(0))).toMatchObject({ x: 300, y: 140 });

    // With Ctrl held the same drag leaves it where the pointer is.
    await dragOnStage(page, { x: 400, y: 200 }, { x: pointer, y: 200 }, { modifiers: ['Control'] });
    expect(await frameOf(objects(page).nth(0))).toMatchObject({ x: aim, y: 140 });
    await undo(page);

    // Dragging the east handle to the ellipse's edge snaps at 780, so the
    // rectangle becomes 480 wide rather than 478.
    await dragHandle(page, 'e', { x: aim, y: 200 });
    expect(await frameOf(objects(page).nth(0))).toMatchObject({ x: 300, width: 480 });
  } finally {
    await app.close();
  }
});

test('the View tab turns rulers, grid, guides and snapping on and off', async () => {
  const { app, page } = await start();
  try {
    await page.getByRole('tab', { name: 'View' }).click();
    const rulers = page.getByRole('button', { name: 'Rulers', exact: true });
    const grid = page.getByRole('button', { name: 'Grid', exact: true });
    const guides = page.getByRole('button', { name: 'Guides', exact: true });
    const snap = page.getByRole('button', { name: 'Snap', exact: true });

    await expect(rulers).toHaveAttribute('aria-pressed', 'false');
    await expect(grid).toHaveAttribute('aria-pressed', 'false');
    await expect(guides).toHaveAttribute('aria-pressed', 'true');
    await expect(snap).toHaveAttribute('aria-pressed', 'true');

    await rulers.click();
    await expect(page.getByTestId('ruler-top')).toBeVisible();
    await expect(page.getByTestId('ruler-left')).toBeVisible();
    await expect(rulers).toHaveAttribute('aria-pressed', 'true');

    await grid.click();
    await expect(page.locator('.stage-grid')).toBeVisible();
    await expect(grid).toHaveAttribute('aria-pressed', 'true');

    await guides.click();
    await expect(guides).toHaveAttribute('aria-pressed', 'false');
    await snap.click();
    await expect(snap).toHaveAttribute('aria-pressed', 'false');

    await rulers.click();
    await expect(page.getByTestId('ruler-top')).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('guides come from the rulers, move, snap and are dragged back to delete', async () => {
  const { app, page } = await start();
  try {
    await insertShape(page, 'Rectangle');
    await page.getByRole('tab', { name: 'View' }).click();
    await page.getByRole('button', { name: 'Rulers', exact: true }).click();
    await expect(page.getByTestId('ruler-left')).toBeVisible();
    await settleLayout(page);
    const area = (await page.getByTestId('stage').boundingBox())!;

    // Drag a vertical guide out of the left ruler to stage x = 400. The target
    // is measured after the press and after layout settles, because focusing
    // the stage or showing the rulers can move the canvas. A guide is rounded
    // to whole stage units and the screen mapping is only exact to a fraction
    // of a pixel, so allow one unit either way.
    await page.mouse.move(area.x + 10, area.y + area.height / 2);
    await page.mouse.down();
    await settleLayout(page);
    const onStage = await onScreen(page, { x: 400, y: 300 });
    await page.mouse.move((area.x + 10 + onStage.x) / 2, area.y + area.height / 2, { steps: 4 });
    await page.mouse.move(onStage.x, onStage.y, { steps: 4 });
    await page.mouse.up();
    const vertical = page.locator('.guide-vertical');
    await expect(vertical).toHaveCount(1);
    const guideX = Number(await vertical.getAttribute('data-guide-x'));
    expect(Math.abs(guideX - 400)).toBeLessThanOrEqual(1);

    // A horizontal guide from the top ruler, at stage y = 200. The ruler is under the stage's
    // toolbar (B17), so it is found by its own place.
    const ruler = (await page.getByTestId('ruler-top').boundingBox())!;
    await page.mouse.move(area.x + area.width / 2, ruler.y + ruler.height / 2);
    await page.mouse.down();
    await settleLayout(page);
    const across = await onScreen(page, { x: 300, y: 200 });
    await page.mouse.move(area.x + area.width / 2, (ruler.y + across.y) / 2, { steps: 4 });
    await page.mouse.move(across.x, across.y, { steps: 4 });
    await page.mouse.up();
    const horizontal = page.locator('.guide-horizontal');
    await expect(horizontal).toHaveCount(1);
    const guideY = Number(await horizontal.getAttribute('data-guide-y'));
    expect(Math.abs(guideY - 200)).toBeLessThanOrEqual(1);

    // A rectangle dragged near the vertical guide snaps its left edge onto it.
    const from = await onScreen(page, { x: 640, y: 360 });
    const near = await onScreen(page, { x: guideX + 110, y: 300 });
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(near.x, near.y);
    await page.mouse.up();
    expect(await frameOf(objects(page).nth(0))).toMatchObject({ x: guideX, y: 240 });
    await undo(page);

    // The guide itself moves, then goes away when dragged back onto the ruler.
    const guideAt = await onScreen(page, { x: guideX, y: 500 });
    await page.mouse.move(guideAt.x, guideAt.y);
    await page.mouse.down();
    await settleLayout(page);
    const guideTo = await onScreen(page, { x: guideX + 200, y: 500 });
    await page.mouse.move(guideTo.x, guideTo.y, { steps: 4 });
    await page.mouse.up();
    await expect(vertical).toHaveCount(1);
    const movedX = Number(await vertical.getAttribute('data-guide-x'));
    expect(Math.abs(movedX - (guideX + 200))).toBeLessThanOrEqual(1);

    const moved = await onScreen(page, { x: movedX, y: 500 });
    await page.mouse.move(moved.x, moved.y);
    await page.mouse.down();
    await settleLayout(page);
    await page.mouse.move(area.x + 10, moved.y, { steps: 4 });
    await page.mouse.up();
    await expect(vertical).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('turning snapping off leaves a move where the pointer is', async () => {
  const { app, page } = await start();
  try {
    await insertShape(page, 'Rectangle');
    await dragOnStage(page, { x: 640, y: 360 }, { x: 400, y: 200 }, { modifiers: ['Control'] });
    await insertShape(page, 'Ellipse');
    await dragOnStage(page, { x: 640, y: 360 }, { x: 880, y: 200 }, { modifiers: ['Control'] });
    const zoom = Number(await canvas(page).getAttribute('data-zoom'));
    const near = Math.max(1, Math.min(20, Math.floor(6 / zoom) - 1));

    await page.getByRole('tab', { name: 'View' }).click();
    await page.getByRole('button', { name: 'Snap', exact: true }).click();
    await dragOnStage(page, { x: 400, y: 200 }, { x: 880 - near, y: 200 });
    expect(await frameOf(objects(page).nth(0))).toMatchObject({ x: 780 - near });
  } finally {
    await app.close();
  }
});

test('resizing several objects scales them inside the selection box', async () => {
  const { app, page } = await start();
  try {
    await insertShape(page, 'Rectangle');
    await insertShape(page, 'Ellipse');
    await dragOnStage(page, { x: 700, y: 400 }, { x: 900, y: 400 }, { modifiers: ['Control'] });
    // Rectangle 540–740, ellipse 756–956 across; the box around both is 540–956 × 300–436.
    await chooseMenuItem(app, 'edit.selectAll');
    await dragHandle(page, 'e', { x: 1372, y: 368 }, ['Control']);

    // Twice as wide: both double in width and keep their heights.
    expect(await frameOf(objects(page).nth(0))).toEqual({ ...RECT, width: 400 });
    expect(await frameOf(objects(page).nth(1))).toEqual({
      x: 972,
      y: 316,
      width: 400,
      height: 120,
      rotation: 0,
    });
  } finally {
    await app.close();
  }
});

test('Shift keeps proportions, Alt resizes about the centre, and size never goes below one', async () => {
  const { app, page } = await start();
  try {
    await insertShape(page, 'Rectangle');
    const shape = objects(page).first();

    // Asked for 400 wide and barely taller: Shift follows the width.
    await dragHandle(page, 'se', { x: 940, y: 430 }, ['Shift', 'Control']);
    expect(await frameOf(shape)).toEqual({ ...RECT, width: 400, height: 240 });
    await undo(page);

    await dragHandle(page, 'e', { x: 790, y: 360 }, ['Alt', 'Control']);
    expect(await frameOf(shape)).toEqual({ ...RECT, x: 490, width: 300 });
    await undo(page);

    // Dragged far past the opposite corner, it stops at one unit and does not flip.
    await dragHandle(page, 'se', { x: 100, y: 100 }, ['Control']);
    expect(await frameOf(shape)).toEqual({ ...RECT, width: 1, height: 1 });
  } finally {
    await app.close();
  }
});

test('a rotated object resizes along its own axes with the opposite side fixed', async () => {
  const { app, page } = await start();
  try {
    await insertShape(page, 'Rectangle');
    const shape = objects(page).first();
    // Turn it a quarter with Shift (15° steps): its "east" handle now points down.
    await dragHandle(page, 'rotate', { x: 940, y: 360 }, ['Shift']);
    expect((await frameOf(shape)).rotation).toBe(90);

    // The east handle is at the bottom of what is now a tall box: (640, 460).
    // Pull it 50 down. Width grows by 50; the west end stays at (640, 260).
    await dragHandle(page, 'e', { x: 640, y: 510 }, ['Control']);
    const frame = await frameOf(shape);
    expect(frame.width).toBeCloseTo(250, 3);
    expect(frame.height).toBeCloseTo(120, 3);
    expect(frame.rotation).toBe(90);
    // Centre moved 25 down from (640, 360).
    expect(frame.x + frame.width / 2).toBeCloseTo(640, 3);
    expect(frame.y + frame.height / 2).toBeCloseTo(385, 3);
  } finally {
    await app.close();
  }
});

test('arrow keys nudge, Delete removes, and the Edit menu undoes', async () => {
  const { app, page } = await start();
  try {
    await insertShape(page, 'Rectangle');
    const shape = objects(page).first();
    await clickStage(page, { x: 640, y: 360 });

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    expect(await frameOf(shape)).toEqual({ ...RECT, x: 541, y: 301 });
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowUp');
    expect(await frameOf(shape)).toEqual({ ...RECT, x: 531, y: 291 });

    await page.keyboard.press('Delete');
    await expect(objects(page)).toHaveCount(0);
    await expect(status(page)).not.toContainText('selected');

    await chooseMenuItem(app, 'edit.undo');
    await expect(objects(page)).toHaveCount(1);
    await chooseMenuItem(app, 'edit.redo');
    await expect(objects(page)).toHaveCount(0);
    await chooseMenuItem(app, 'edit.undo');
    await clickStage(page, { x: 640, y: 360 });
    await chooseMenuItem(app, 'edit.delete');
    await expect(objects(page)).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('Escape during a drag puts the object back and leaves nothing to undo', async () => {
  const { app, page } = await start();
  try {
    await insertShape(page, 'Rectangle');
    const shape = objects(page).first();

    await dragOnStage(page, { x: 640, y: 360 }, { x: 900, y: 500 }, { release: false });
    // Mid-drag the object really is somewhere else.
    expect(await frameOf(shape)).toMatchObject({ x: 800, y: 440 });
    await page.keyboard.press('Escape');
    expect(await frameOf(shape)).toEqual(RECT);
    await page.mouse.up();
    expect(await frameOf(shape)).toEqual(RECT);

    // The only step to undo is the insert itself.
    await undo(page);
    await expect(objects(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  } finally {
    await app.close();
  }
});

test('inserts every kind of object', async () => {
  const { app, page } = await start();
  try {
    await answerDialogs(app, { open: [[imagePath]], message: [DONT_SAVE] });
    await page.getByRole('tab', { name: 'Insert' }).click();

    await page.getByRole('button', { name: 'Text Box' }).click();
    await expect(objects(page).last()).toHaveAttribute('data-object-type', 'text');
    await expect(objects(page).last()).toContainText('Text');

    await page.getByRole('button', { name: 'Button', exact: true }).click();
    await expect(objects(page).last()).toHaveAttribute('data-object-type', 'button');
    await expect(objects(page).last()).toContainText('Button');

    // A line offers only its two ends as handles.
    await insertShape(page, 'Line');
    await expect(canvas(page).locator('[data-handle]')).toHaveCount(3);
    await expect(handle(page, 'e')).toBeVisible();
    await expect(handle(page, 'w')).toBeVisible();
    await expect(handle(page, 'rotate')).toBeVisible();
    expect(await frameOf(objects(page).last())).toMatchObject({ width: 200, height: 0 });

    await insertShape(page, 'Star');
    await expect(canvas(page).locator('[data-handle]')).toHaveCount(9);

    // A picture from disk goes into the media list and onto the slide at its own size.
    await page.getByRole('button', { name: 'Picture…' }).click();
    const picture = objects(page).last();
    await expect(picture).toHaveAttribute('data-object-type', 'image');
    expect(await frameOf(picture)).toEqual({ x: 608, y: 328, width: 64, height: 64, rotation: 0 });
    await expect
      .poll(() => picture.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBe(64);

    // The same picture again, from the media list.
    await page.getByRole('button', { name: /^Insert .*\.png$/ }).click();
    await expect(objects(page)).toHaveCount(6);
    await expect(status(page)).toContainText('1 object selected');
  } finally {
    await app.close();
  }
});

test('zoom changes the size on screen but not the document; Ctrl+wheel zooms about the pointer', async () => {
  const { app, page } = await start();
  try {
    await insertShape(page, 'Rectangle');
    const level = page.getByTestId('zoom-level');
    const fitWidth = (await canvas(page).boundingBox())!.width;

    await page.getByRole('button', { name: 'Zoom in' }).click();
    const zoomedWidth = (await canvas(page).boundingBox())!.width;
    expect(zoomedWidth).toBeGreaterThan(fitWidth);
    expect(await frameOf(objects(page).first())).toEqual(RECT);

    // Dragging still moves by stage units at the new zoom.
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await dragOnStage(page, { x: 640, y: 360 }, { x: 700, y: 400 }, { modifiers: ['Control'] });
    expect(await frameOf(objects(page).first())).toEqual({ ...RECT, x: 600, y: 340 });

    await page.getByRole('button', { name: 'Fit' }).click();
    expect((await canvas(page).boundingBox())!.width).toBeCloseTo(fitWidth, 0);

    // Zoom in with the wheel: whatever stage point is under the pointer stays under it.
    // Wheel events report the pointer in whole pixels, so park it on a whole
    // pixel and work out which stage point that is, rather than the reverse.
    const near = await onScreen(page, { x: 700, y: 400 });
    const pointer = { x: Math.round(near.x), y: Math.round(near.y) };
    const fitBounds = (await canvas(page).boundingBox())!;
    const fitZoom = Number(await canvas(page).getAttribute('data-zoom'));
    const target = {
      x: (pointer.x - fitBounds.x) / fitZoom,
      y: (pointer.y - fitBounds.y) / fitZoom,
    };
    await page.mouse.move(pointer.x, pointer.y);
    await page.keyboard.down('Control');
    // Many events in quick succession, as a real wheel or trackpad sends them:
    // the point must not creep as they add up. Far enough that the stage
    // overflows its area both ways, since a stage smaller than its area is
    // centred and cannot follow the pointer.
    for (let turn = 0; turn < 10; turn++) {
      await page.mouse.wheel(0, -80);
      // A slow machine can leave long gaps between events; the gesture is
      // still one gesture for as long as the pointer stays put.
      if (turn === 0 || turn === 4) await page.waitForTimeout(400);
    }
    await page.keyboard.up('Control');
    await expect(level).not.toHaveText(`${Math.round(fitZoom * 100)}%`);
    const overflow = await page.getByTestId('stage-viewport').evaluate((element) => ({
      x: element.scrollWidth - element.clientWidth,
      y: element.scrollHeight - element.clientHeight,
    }));
    expect(overflow.x).toBeGreaterThan(0);
    expect(overflow.y).toBeGreaterThan(0);
    const after = await onScreen(page, target);
    // Scroll positions are whole pixels, so "the same place" is to within one.
    expect(Math.abs(after.x - pointer.x)).toBeLessThan(1);
    expect(Math.abs(after.y - pointer.y)).toBeLessThan(1);
    expect((await canvas(page).boundingBox())!.width).toBeGreaterThan(fitWidth * 1.5);

    // Zoomed in, the stage scrolls; Space+drag pans it.
    const viewport = page.getByTestId('stage-viewport');
    const scrollBefore = await viewport.evaluate((element) => element.scrollLeft);
    const middle = await viewport.boundingBox();
    await page.mouse.move(middle!.x + middle!.width / 2, middle!.y + middle!.height / 2);
    await page.keyboard.down('Space');
    await page.mouse.down();
    await page.mouse.move(middle!.x + middle!.width / 2 - 80, middle!.y + middle!.height / 2);
    await page.mouse.up();
    await page.keyboard.up('Space');
    // It moves with the pointer, as far as there is stage left to scroll to.
    const furthest = await viewport.evaluate(
      (element) => element.scrollWidth - element.clientWidth,
    );
    expect(furthest).toBeGreaterThan(scrollBefore);
    // Scroll offsets can be fractional where the display is scaled, and are kept in single
    // precision, so to within a hundredth of a pixel.
    expect(await viewport.evaluate((element) => element.scrollLeft)).toBeCloseTo(
      Math.min(scrollBefore + 80, furthest),
      2,
    );
    // Panning is not editing.
    expect(await frameOf(objects(page).first())).toEqual({ ...RECT, x: 600, y: 340 });
  } finally {
    await app.close();
  }
});

test('objects stay on their own slide, and the selection does not follow to another', async () => {
  const { app, page } = await start();
  try {
    await insertShape(page, 'Rectangle');
    await page.getByRole('button', { name: 'New Slide' }).click();
    await expect(objects(page)).toHaveCount(0);
    await expect(status(page)).not.toContainText('selected');

    await insertShape(page, 'Ellipse');
    await insertShape(page, 'Triangle');
    await expect(objects(page)).toHaveCount(2);

    await page.getByTestId('slide-list').getByRole('button').first().click();
    await expect(objects(page)).toHaveCount(1);
    await expect(status(page)).not.toContainText('selected');
  } finally {
    await app.close();
  }
});

test('copy and cut move objects between slides; paste offsets on the same slide', async () => {
  const { app, page } = await start();
  try {
    await insertShape(page, 'Rectangle');
    await dragOnStage(page, { x: 640, y: 360 }, { x: 400, y: 200 }, { modifiers: ['Control'] });
    await chooseMenuItem(app, 'edit.copy');

    // A different slide gets the copy where it was, not shifted.
    await page.getByRole('button', { name: 'New Slide' }).click();
    await chooseMenuItem(app, 'edit.paste');
    await expect(objects(page)).toHaveCount(1);
    expect(await frameOf(objects(page).nth(0))).toMatchObject({ x: 300, y: 140 });

    // Duplicating lands 16 units away, and is one undo step.
    await chooseMenuItem(app, 'edit.duplicate');
    await expect(objects(page)).toHaveCount(2);
    expect(await frameOf(objects(page).nth(1))).toMatchObject({ x: 316, y: 156 });
    await undo(page);
    await expect(objects(page)).toHaveCount(1);

    // Back on the slide the objects were copied from, paste shifts the copy.
    await page.getByTestId('slide-list').getByRole('button').first().click();
    await chooseMenuItem(app, 'edit.paste');
    await expect(objects(page)).toHaveCount(2);
    expect(await frameOf(objects(page).nth(1))).toMatchObject({ x: 316, y: 156 });

    // Cut removes the selection but leaves the objects on the clipboard.
    await chooseMenuItem(app, 'edit.selectAll');
    await chooseMenuItem(app, 'edit.cut');
    await expect(objects(page)).toHaveCount(0);
    await undo(page);
    await expect(objects(page)).toHaveCount(2);
  } finally {
    await app.close();
  }
});

test('the Edit menu leaves a text field to the browser', async () => {
  const { app, page } = await start();
  try {
    const title = page.getByTestId('project-title');
    await title.selectText();
    await page.evaluate(() => window.vedraopus.clipboard.write('A different project'));
    await chooseMenuItem(app, 'edit.paste');
    await expect(title).toHaveValue('A different project');
  } finally {
    await app.close();
  }
});

test('paste reaches another running copy of the app through the system clipboard', async () => {
  // Windows drawn to the off-screen surface have no shared X/Wayland clipboard,
  // so two hidden app instances cannot see each other's copy. CI has a display.
  test.skip(windowsHidden, 'hidden windows have no shared system clipboard');
  // Elsewhere each app gets a clipboard of its own, to leave the developer's alone.
  test.skip(windowsTransparent, 'each app has its own clipboard; run with VEDRAOPUS_E2E_SHOW=1');
  const first = await start();
  const second = await start();
  try {
    await insertShape(first.page, 'Ellipse');
    await chooseMenuItem(first.app, 'edit.copy');
    // The menu item only starts the write; wait for it to reach the clipboard.
    await expect
      .poll(() => first.page.evaluate(() => window.vedraopus.clipboard.read()))
      .toContain('"vedraopus":1');

    await chooseMenuItem(second.app, 'edit.paste');
    await expect(objects(second.page)).toHaveCount(1);
    await expect(status(second.page)).toContainText('1 object selected');
  } finally {
    await first.app.close();
    await second.app.close();
  }
});

test('the stage context menu selects, reorders, groups, duplicates and locks', async () => {
  const { app, page } = await start();
  try {
    await insertShape(page, 'Rectangle');
    await dragOnStage(page, { x: 640, y: 360 }, { x: 400, y: 200 }, { modifiers: ['Control'] });
    await insertShape(page, 'Ellipse');
    await dragOnStage(page, { x: 640, y: 360 }, { x: 880, y: 200 }, { modifiers: ['Control'] });

    const order = async () =>
      canvas(page)
        .locator('.stage-slide > [data-object-id]')
        .evaluateAll((elements) =>
          elements.map((element) => element.getAttribute('data-object-id')),
        );
    const [rect, ellipse] = await order();

    // Right-clicking an object outside the selection selects it first.
    await rightClickStage(page, { x: 400, y: 200 });
    await expect(status(page)).toContainText('1 object selected');
    await chooseStageMenu(page, 'Bring to Front');
    expect(await order()).toEqual([ellipse, rect]);

    // Duplicate from the menu, then undo it.
    await rightClickStage(page, { x: 400, y: 200 });
    await chooseStageMenu(page, 'Duplicate');
    await expect(objects(page)).toHaveCount(3);
    await undo(page);
    await expect(objects(page)).toHaveCount(2);

    // Group and ungroup the two objects.
    await clickStage(page, { x: 100, y: 600 });
    await clickStage(page, { x: 880, y: 200 });
    await clickStage(page, { x: 400, y: 200 }, ['Shift']);
    await rightClickStage(page, { x: 400, y: 200 });
    await chooseStageMenu(page, 'Group');
    await expect(objects(page)).toHaveCount(1);
    await rightClickStage(page, { x: 400, y: 200 });
    await chooseStageMenu(page, 'Ungroup');
    await expect(objects(page)).toHaveCount(2);

    // Locking clears the selection and makes the object unclickable. Ungroup
    // selected both objects, so clear that first and pick out one.
    await clickStage(page, { x: 100, y: 600 });
    await clickStage(page, { x: 400, y: 200 });
    await rightClickStage(page, { x: 400, y: 200 });
    await chooseStageMenu(page, 'Lock');
    await expect(status(page)).not.toContainText('selected');
    await clickStage(page, { x: 400, y: 200 });
    await expect(status(page)).not.toContainText('selected');

    // Paste is available from the menu too.
    await clickStage(page, { x: 880, y: 200 });
    await expect(status(page)).toContainText('1 object selected');
    await chooseMenuItem(app, 'edit.copy');
    // The menu command only starts the async copy; wait for it to reach the clipboard.
    await expect
      .poll(() => page.evaluate(() => window.vedraopus.clipboard.read()))
      .toContain('"vedraopus":1');
    await clickStage(page, { x: 100, y: 600 });
    await rightClickStage(page, { x: 100, y: 600 });
    await chooseStageMenu(page, 'Paste');
    await expect(objects(page)).toHaveCount(3);
  } finally {
    await app.close();
  }
});

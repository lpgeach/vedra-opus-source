import { expect, test } from '@playwright/test';
import type { ElectronApplication, Locator, Page } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { answerDialogs, launchApp } from './launch';

const DONT_SAVE = 1;
const LIGHT_BACKGROUND = 'rgb(236, 238, 242)';
const DARK_BACKGROUND = 'rgb(21, 23, 27)';

const panel = (page: Page, name: 'left' | 'right' | 'bottom') => page.getByTestId(`panel-${name}`);
const splitter = (page: Page, name: 'left' | 'right' | 'bottom') =>
  page.getByTestId(`splitter-${name}`);
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });
// The slides only: the list also has the question banks' controls (P7.6).
const slideItems = (page: Page) => page.getByTestId('slide-list').locator('.slide-item');
const background = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

async function box(locator: Locator) {
  const bounds = await locator.boundingBox();
  if (!bounds) throw new Error('element is not visible');
  return bounds;
}
const width = async (locator: Locator) => (await box(locator)).width;
const height = async (locator: Locator) => (await box(locator)).height;

async function newProject(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'New Project' }).click();
  await expect(page.getByTestId('editor')).toBeVisible();
}

/** Drag a divider by the given distance, in steps as a hand would. */
async function drag(page: Page, handle: Locator, dx: number, dy: number): Promise<void> {
  const { x, y, width: w, height: h } = await box(handle);
  const from = { x: x + w / 2, y: y + h / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx / 2, from.y + dy / 2);
  await page.mouse.move(from.x + dx, from.y + dy);
  await page.mouse.up();
}

/** Choose an application-menu item, as the author would from the menu bar. */
async function chooseMenuItem(app: ElectronApplication, id: string): Promise<void> {
  await app.evaluate(({ Menu }, itemId) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(itemId);
    if (!item) throw new Error(`No menu item ${itemId}`);
    item.click();
  }, id);
}

function readSettings(userDataDir: string): unknown {
  return JSON.parse(readFileSync(join(userDataDir, 'settings.json'), 'utf8'));
}

test('every part of the layout is present with its placeholder content', async () => {
  const { app, page } = await launchApp();
  try {
    // No editor chrome until there is a project to edit.
    await expect(page.getByTestId('ribbon')).toHaveCount(0);
    await newProject(page);

    for (const name of ['Home', 'Insert', 'Design', 'Transitions', 'Animations', 'View']) {
      await tab(page, name).click();
      await expect(tab(page, name)).toHaveAttribute('aria-selected', 'true');
      // Every tab has its groups (Animations shows a hint until an object is selected).
      await expect(page.getByTestId('ribbon').getByRole('group').first()).toBeVisible();
    }

    await expect(slideItems(page)).toHaveCount(1);
    await expect(slideItems(page).first()).toContainText('Untitled Slide');
    await tab(page, 'Media').click();
    await expect(panel(page, 'left')).toContainText('Nothing imported yet');

    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await expect(page.getByTestId('zoom-level')).toHaveText(/^\d+%$/);

    // The timeline is real now (P3.3): an empty slide has no rows yet.
    await expect(panel(page, 'bottom').getByTestId('timeline')).toContainText(
      'No objects on this slide yet.',
    );
    await tab(page, 'States').click();
    // The States panel is real now (P4.1): with nothing selected it asks for a selection.
    await expect(panel(page, 'bottom')).toContainText(
      'Select one object to see and edit its states',
    );
    await tab(page, 'Notes').click();
    // The Notes panel is real now (P8.2): the slide's notes, empty for a new slide.
    await expect(panel(page, 'bottom').getByLabel('Slide notes', { exact: true })).toHaveValue('');

    await expect(page.getByTestId('triggers')).toContainText('No triggers on this slide');
    await tab(page, 'Slide Layers').click();
    await expect(page.getByTestId('slide-layers')).toContainText('Base Layer');
    await expect(page.getByTestId('project-status')).toContainText('Slide 1 of 1');
  } finally {
    await app.close();
  }
});

test('the stage frame keeps the project proportions and fits its area', async () => {
  const { app, page } = await launchApp();
  try {
    await newProject(page);
    const frame = await box(page.getByTestId('stage-canvas'));
    const area = await box(page.getByTestId('stage'));
    expect(frame.width / frame.height).toBeCloseTo(1280 / 720, 1);
    expect(frame.width).toBeLessThanOrEqual(area.width);
    expect(frame.height).toBeLessThanOrEqual(area.height);
    expect(frame.width).toBeGreaterThan(100);
  } finally {
    await app.close();
  }
});

test('panels resize by dragging their dividers and with the keyboard', async () => {
  const { app, page } = await launchApp();
  try {
    await newProject(page);

    const left = await width(panel(page, 'left'));
    await drag(page, splitter(page, 'left'), 40, 0);
    expect(await width(panel(page, 'left'))).toBe(left + 40);

    const right = await width(panel(page, 'right'));
    await drag(page, splitter(page, 'right'), 30, 0);
    expect(await width(panel(page, 'right'))).toBe(right - 30);

    const bottom = await height(panel(page, 'bottom'));
    await drag(page, splitter(page, 'bottom'), 0, 24);
    expect(await height(panel(page, 'bottom'))).toBe(bottom - 24);

    // Keyboard: arrows move a divider 8 px, 40 px with Shift.
    await splitter(page, 'left').focus();
    await page.keyboard.press('ArrowLeft');
    expect(await width(panel(page, 'left'))).toBe(left + 32);
    await page.keyboard.press('Shift+ArrowLeft');
    expect(await width(panel(page, 'left'))).toBe(left - 8);
    await splitter(page, 'bottom').focus();
    await page.keyboard.press('ArrowDown');
    expect(await height(panel(page, 'bottom'))).toBe(bottom - 32);

    // Limits: a panel cannot be dragged away to nothing, nor over the stage.
    await drag(page, splitter(page, 'left'), -2000, 0);
    expect(await width(panel(page, 'left'))).toBe(160);
    await splitter(page, 'left').focus();
    await page.keyboard.press('End');
    expect(Math.round(await width(page.getByTestId('stage')))).toBe(320);
    await expect(splitter(page, 'left')).toHaveAttribute(
      'aria-valuenow',
      String(await width(panel(page, 'left'))),
    );
  } finally {
    await app.close();
  }
});

test('panels collapse to a rail and come back at the size they had', async () => {
  const { app, page } = await launchApp();
  try {
    await newProject(page);
    const stageBefore = await width(page.getByTestId('stage'));
    const left = await width(panel(page, 'left'));

    await page.getByTestId('collapse-left').click();
    await expect(page.getByTestId('slide-list')).toHaveCount(0);
    await expect(splitter(page, 'left')).toHaveCount(0);
    expect(await width(panel(page, 'left'))).toBe(28);
    expect(await width(page.getByTestId('stage'))).toBeGreaterThan(stageBefore);

    await page.getByTestId('expand-left').click();
    await expect(page.getByTestId('slide-list')).toBeVisible();
    expect(await width(panel(page, 'left'))).toBe(left);

    // The View tab shows and hides every panel, and can put everything back.
    await tab(page, 'View').click();
    for (const name of ['Left Panel', 'Bottom Panel', 'Right Panel']) {
      const toggle = page.getByRole('button', { name, exact: true });
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    }
    await expect(page.getByTestId('expand-left')).toBeVisible();
    await expect(page.getByTestId('expand-bottom')).toBeVisible();
    await expect(page.getByTestId('expand-right')).toBeVisible();
    expect(await height(panel(page, 'bottom'))).toBe(28);

    await page.getByRole('button', { name: 'Reset Layout' }).click();
    await expect(page.getByTestId('collapse-left')).toBeVisible();
    await expect(page.getByTestId('collapse-bottom')).toBeVisible();
    await expect(page.getByTestId('collapse-right')).toBeVisible();
    expect(await width(panel(page, 'left'))).toBe(left);
  } finally {
    await app.close();
  }
});

test('the arrangement and theme are restored after a restart', async () => {
  const first = await launchApp();
  await newProject(first.page);

  await drag(first.page, splitter(first.page, 'left'), 48, 0);
  await splitter(first.page, 'bottom').focus();
  await first.page.keyboard.press('ArrowDown');
  await first.page.getByTestId('collapse-right').click();
  await tab(first.page, 'Media').click();
  await tab(first.page, 'Notes').click();
  await tab(first.page, 'View').click();
  await first.page.getByRole('radio', { name: 'Dark' }).click();
  await expect.poll(() => background(first.page)).toBe(DARK_BACKGROUND);

  const left = await width(panel(first.page, 'left'));
  const bottom = await height(panel(first.page, 'bottom'));
  await first.app.close();

  expect(readSettings(first.userDataDir)).toMatchObject({
    theme: 'dark',
    layout: {
      left: { size: left, collapsed: false },
      right: { collapsed: true },
      bottom: { size: bottom, collapsed: false },
      leftTab: 'media',
      bottomTab: 'notes',
    },
  });

  const second = await launchApp({ userDataDir: first.userDataDir });
  try {
    // The theme applies from the first screen, before any project is open.
    await expect.poll(() => background(second.page)).toBe(DARK_BACKGROUND);
    await newProject(second.page);

    expect(await width(panel(second.page, 'left'))).toBe(left);
    expect(await height(panel(second.page, 'bottom'))).toBe(bottom);
    await expect(second.page.getByTestId('expand-right')).toBeVisible();
    await expect(tab(second.page, 'Media')).toHaveAttribute('aria-selected', 'true');
    await expect(tab(second.page, 'Notes')).toHaveAttribute('aria-selected', 'true');
    await tab(second.page, 'View').click();
    await expect(second.page.getByRole('radio', { name: 'Dark' })).toBeChecked();

    await second.page.getByRole('radio', { name: 'Light' }).click();
    await expect.poll(() => background(second.page)).toBe(LIGHT_BACKGROUND);
  } finally {
    await second.app.close();
  }
});

test('a damaged settings file is ignored and the app starts with the defaults', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-'));
  writeFileSync(join(userDataDir, 'settings.json'), '{ "layout": { "left": "wide" }, "theme": ');

  const { app, page } = await launchApp({ userDataDir });
  try {
    await newProject(page);
    await expect(page.getByTestId('collapse-left')).toBeVisible();
    await expect(
      page.getByTestId('panel-left').getByRole('tab', { name: 'Slides', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(tab(page, 'Timeline')).toHaveAttribute('aria-selected', 'true');
    await tab(page, 'View').click();
    await expect(page.getByRole('radio', { name: 'System' })).toBeChecked();
  } finally {
    await app.close();
  }
});

test('Overview and Slide View switch from the top bar, the menu and a slide card', async () => {
  const { app, page } = await launchApp();
  try {
    await newProject(page);
    const overview = page.getByTestId('overview');
    const overviewButton = page.getByRole('button', { name: 'Overview' });
    const slideButton = page.getByRole('button', { name: 'Slide View' });
    await expect(slideButton).toHaveAttribute('aria-pressed', 'true');

    await overviewButton.click();
    await expect(overview).toBeVisible();
    await expect(overview).toContainText('Untitled Scene');
    await expect(page.getByTestId('stage')).toHaveCount(0);
    await expect(page.getByTestId('ribbon')).toBeVisible();

    await overview.getByRole('button', { name: 'Untitled Slide' }).dblclick();
    await expect(page.getByTestId('stage')).toBeVisible();
    await expect(overview).toHaveCount(0);

    await chooseMenuItem(app, 'view.overview');
    await expect(overview).toBeVisible();
    await overview.getByRole('button', { name: 'Untitled Slide' }).press('Enter');
    await expect(page.getByTestId('stage')).toBeVisible();
    await chooseMenuItem(app, 'view.overview');
    await chooseMenuItem(app, 'view.slide');
    await expect(page.getByTestId('stage')).toBeVisible();
  } finally {
    await app.close();
  }
});

test('New Slide adds a slide after the current one and makes it current; undo takes it back', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [DONT_SAVE] });
    await newProject(page);
    const status = page.getByTestId('project-status');
    const current = page.getByTestId('slide-list').locator('[aria-current="true"]');

    await page.getByRole('button', { name: 'New Slide' }).click();
    await expect(slideItems(page)).toHaveCount(2);
    await expect(status).toContainText('Slide 2 of 2');
    await expect(current).toContainText('2');

    // Select the first slide, then add from the menu: the new slide lands second.
    await slideItems(page).first().click();
    await expect(status).toContainText('Slide 1 of 2');
    await chooseMenuItem(app, 'insert.newSlide');
    await expect(slideItems(page)).toHaveCount(3);
    await expect(status).toContainText('Slide 2 of 3');

    // Undo removes the current slide; the editor falls back to a slide that exists.
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(slideItems(page)).toHaveCount(2);
    await expect(status).toContainText('Slide 1 of 2');
    await expect(page.getByTestId('stage-canvas')).toBeVisible();

    await page.getByRole('button', { name: 'Overview' }).click();
    await expect(page.getByTestId('overview').locator('.overview-card')).toHaveCount(2);
  } finally {
    await app.close();
  }
});

test('a narrow window keeps the ribbon inside it, not scrolling the editor, and its menus open whole', async () => {
  // Found in the Phase 9 review: a click on a command past the window's edge scrolled the whole
  // page sideways. Since B17 the ribbon shows groups' small commands as icons, or folds groups,
  // instead of running off the side, so nothing is past the edge.
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [DONT_SAVE] });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(900, 640));
    await newProject(page);
    await tab(page, 'Insert').click();
    const commands = page.getByTestId('ribbon').locator('.ribbon-commands');
    await expect
      .poll(() => commands.evaluate((row) => row.scrollWidth <= row.clientWidth))
      .toBe(true);
    // Its last commands are still there (as icons); the Data Entry menu opens whole, inside the
    // window.
    await page.getByRole('button', { name: 'Data Entry', exact: true }).click();
    const menu = page.getByRole('menu', { name: 'Data Entry' });
    await expect(menu).toBeVisible();
    const inside = await box(menu);
    const view = await page.evaluate(() => window.innerWidth);
    expect(inside.x).toBeGreaterThanOrEqual(0);
    expect(inside.x + inside.width).toBeLessThanOrEqual(view);
    await menu.getByRole('menuitem', { name: 'Slider' }).click();
    expect(await page.evaluate(() => document.scrollingElement!.scrollLeft)).toBe(0);
    // The editor still starts at the window's left edge.
    expect((await box(page.getByTestId('editor'))).x).toBe(0);
    await expect(
      page.getByTestId('stage-canvas').locator('[data-object-type="slider"]'),
    ).toHaveCount(1);
  } finally {
    await app.close();
  }
});

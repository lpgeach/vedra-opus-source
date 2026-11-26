import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { answerDialogs, launchApp } from './launch';

const DONT_SAVE = 1;
const canvas = (page: Page) => page.getByTestId('stage-canvas');
const objects = (page: Page) => canvas(page).locator('.stage-slide > [data-object-id]');
const formatPanel = (page: Page) => page.getByTestId('format-panel');

async function start(): Promise<{ app: ElectronApplication; page: Page }> {
  const { app, page } = await launchApp();
  await answerDialogs(app, { message: [DONT_SAVE] });
  await page.getByRole('button', { name: 'New Project' }).click();
  await expect(canvas(page)).toBeVisible();
  return { app, page };
}

async function insertRectangle(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Insert' }).click();
  await page.getByRole('button', { name: 'Shape', exact: true }).click();
  await page
    .getByTestId('shape-gallery')
    .getByRole('button', { name: 'Rectangle', exact: true })
    .click();
}

const showFormat = (page: Page) => page.getByRole('tab', { name: 'Format', exact: true }).click();
const left = (object: ReturnType<typeof objects>) =>
  object.evaluate((element: HTMLElement) => parseFloat(element.style.left));
const undo = (page: Page) => page.getByRole('button', { name: 'Undo' }).click();

test('the Format panel edits every selected object as one undoable step', async () => {
  const { app, page } = await start();
  try {
    await showFormat(page);
    await expect(page.getByText('Select an object to format')).toBeVisible();
    await insertRectangle(page);
    await expect(formatPanel(page)).toBeVisible();
    await formatPanel(page).getByLabel('X', { exact: true }).fill('100');
    await insertRectangle(page);
    await expect(objects(page)).toHaveCount(2);
    await objects(page)
      .nth(0)
      .click({ modifiers: ['Shift'], force: true });
    await expect(formatPanel(page)).toContainText('2 objects selected');
    // The two differ in X, so the field says so rather than showing one of them.
    await expect(formatPanel(page).getByLabel('X', { exact: true })).toHaveAttribute(
      'placeholder',
      'Mixed',
    );
    await formatPanel(page).getByLabel('X', { exact: true }).fill('300');
    expect(await left(objects(page).nth(0))).toBe(300);
    expect(await left(objects(page).nth(1))).toBe(300);
    await undo(page);
    expect(await left(objects(page).nth(0))).toBe(100);
    expect(await left(objects(page).nth(1))).toBe(540);
  } finally {
    await app.close();
  }
});

test('changing a theme colour recolours objects that refer to it, not literal ones', async () => {
  const { app, page } = await start();
  try {
    await insertRectangle(page);
    await showFormat(page);
    await formatPanel(page).getByLabel('X', { exact: true }).fill('100');
    await insertRectangle(page);
    // The second rectangle follows the theme; the first gets a literal colour.
    await formatPanel(page).getByLabel('Fill source').selectOption('theme:accent1');
    await objects(page).nth(0).click({ force: true });
    await formatPanel(page).getByLabel('Fill source').selectOption('literal');
    await formatPanel(page).getByLabel('Fill colour').fill('#112233');

    const fill = (i: number) => objects(page).nth(i).locator('path').first().getAttribute('fill');
    expect(await fill(0)).toBe('#112233');
    const before = await fill(1);

    await page.getByRole('tab', { name: 'Design' }).click();
    await page.getByRole('button', { name: 'Colours' }).click();
    const dialog = page.getByTestId('theme-dialog');
    await dialog.getByLabel('Theme colour accent1').fill('#aa0000');
    await dialog.getByRole('button', { name: 'Apply' }).click();

    expect(await fill(1)).toBe('#aa0000');
    expect(await fill(1)).not.toBe(before);
    expect(await fill(0)).toBe('#112233');

    await undo(page);
    expect(await fill(1)).toBe(before);
  } finally {
    await app.close();
  }
});

test('the format painter copies appearance once, and Escape cancels it', async () => {
  const { app, page } = await start();
  try {
    await insertRectangle(page);
    await showFormat(page);
    await formatPanel(page).getByLabel('X', { exact: true }).fill('100');
    await formatPanel(page).getByLabel('Opacity').fill('0.4');
    const opacity = (i: number) =>
      objects(page)
        .nth(i)
        .evaluate((element: HTMLElement) => element.style.opacity);
    expect(await opacity(0)).toBe('0.4');

    await insertRectangle(page);
    await objects(page).nth(0).click({ force: true });
    await page.getByRole('tab', { name: 'Home' }).click();
    await page.getByRole('button', { name: 'Format Painter' }).click();
    await expect(page.getByRole('button', { name: 'Cancel Painter' })).toBeVisible();
    await objects(page).nth(1).click({ force: true });
    await expect(page.getByRole('button', { name: 'Format Painter' })).toBeVisible();
    expect(await opacity(1)).toBe('0.4');

    // Armed, then cancelled: the next click only selects.
    await objects(page).nth(0).click({ force: true });
    await page.getByRole('button', { name: 'Format Painter' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Format Painter' })).toBeVisible();
  } finally {
    await app.close();
  }
});

test('Stage Size offers scale or keep, applies as one step, and undoes', async () => {
  const { app, page } = await start();
  try {
    await insertRectangle(page);
    const width = () =>
      objects(page)
        .first()
        .evaluate((element: HTMLElement) => parseFloat(element.style.width));
    expect(await width()).toBe(200);

    await page.getByRole('tab', { name: 'Design' }).click();
    await page.getByRole('button', { name: 'Stage Size' }).click();
    const dialog = page.getByTestId('stage-size-dialog');
    await expect(dialog.getByLabel('Scale content to new stage')).toBeChecked();
    await expect(dialog.getByLabel('Keep content size (crop/margins)')).toBeVisible();
    await dialog.getByLabel('Stage width').fill('640');
    await dialog.getByLabel('Stage height').fill('360');
    await dialog.getByRole('button', { name: 'Apply' }).click();
    await expect(canvas(page).locator('.stage-slide')).toHaveCSS('width', '640px');
    expect(await width()).toBe(100);

    await undo(page);
    expect(await width()).toBe(200);
    await expect(canvas(page).locator('.stage-slide')).toHaveCSS('width', '1280px');

    await page.getByRole('button', { name: 'Stage Size' }).click();
    await dialog.getByLabel('Keep content size (crop/margins)').check();
    await dialog.getByLabel('Stage width').fill('640');
    await dialog.getByLabel('Stage height').fill('360');
    await dialog.getByRole('button', { name: 'Apply' }).click();
    expect(await width()).toBe(200);
  } finally {
    await app.close();
  }
});

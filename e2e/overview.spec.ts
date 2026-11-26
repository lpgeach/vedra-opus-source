import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { answerDialogs, launchApp } from './launch';

const DONT_SAVE = 1;
const overview = (page: Page) => page.getByTestId('overview');
const cards = (page: Page) => overview(page).locator('.overview-card');
const scenes = (page: Page) => overview(page).locator('.overview-scene');
const sceneTitles = (page: Page) => scenes(page).locator('.overview-scene-title');

async function start(): Promise<{ app: ElectronApplication; page: Page }> {
  const { app, page } = await launchApp();
  await answerDialogs(app, { message: [DONT_SAVE] });
  await page.getByRole('button', { name: 'New Project' }).click();
  await expect(page.getByTestId('stage-canvas')).toBeVisible();
  return { app, page };
}

const showOverview = async (page: Page) => {
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(overview(page)).toBeVisible();
};
const undo = (page: Page) => page.getByRole('button', { name: 'Undo' }).click();

test('slides can be added, renamed, duplicated and deleted, each undoable', async () => {
  const { app, page } = await start();
  try {
    await showOverview(page);
    await expect(cards(page)).toHaveCount(1);

    await overview(page).getByRole('button', { name: 'Add slide', exact: true }).click();
    await expect(cards(page)).toHaveCount(2);

    // Rename the selected (new) slide in place.
    await overview(page).getByRole('button', { name: 'Rename', exact: true }).click();
    await page.getByLabel('Slide name').fill('Intro');
    await page.keyboard.press('Enter');
    await expect(cards(page).nth(1)).toContainText('Intro');

    await overview(page).getByRole('button', { name: 'Duplicate', exact: true }).click();
    await expect(cards(page)).toHaveCount(3);
    await expect(cards(page).nth(2)).toContainText('Intro copy');

    await overview(page).getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(cards(page)).toHaveCount(2);
    await undo(page);
    await expect(cards(page)).toHaveCount(3);
    await undo(page); // the duplicate
    await expect(cards(page)).toHaveCount(2);
    await undo(page); // the rename
    await expect(cards(page).nth(1)).toContainText('Untitled Slide');
  } finally {
    await app.close();
  }
});

test('scenes: add, rename, duplicate, reorder, set the starting scene, delete', async () => {
  const { app, page } = await start();
  try {
    await showOverview(page);
    await overview(page).getByRole('button', { name: 'Add scene', exact: true }).click();
    await expect(scenes(page)).toHaveCount(2);
    await expect(sceneTitles(page).nth(0)).toContainText('Start');
    await expect(sceneTitles(page).nth(1)).not.toContainText('Start');

    await scenes(page).nth(1).getByRole('button', { name: 'Rename scene' }).click();
    await page.getByLabel('Scene name').fill('Quiz');
    await page.keyboard.press('Enter');
    await expect(sceneTitles(page).nth(1)).toContainText('Quiz');

    await scenes(page).nth(1).getByRole('button', { name: 'Set as starting scene' }).click();
    await expect(sceneTitles(page).nth(0)).toContainText('Quiz');
    await expect(sceneTitles(page).nth(0)).toContainText('Start');

    await scenes(page).nth(0).getByRole('button', { name: 'Duplicate scene' }).click();
    await expect(scenes(page)).toHaveCount(3);
    await expect(sceneTitles(page).nth(1)).toContainText('Quiz copy');

    await scenes(page).nth(1).getByRole('button', { name: 'Move scene later' }).click();
    await expect(sceneTitles(page).nth(2)).toContainText('Quiz copy');

    await scenes(page).nth(2).getByRole('button', { name: 'Delete scene' }).click();
    await expect(scenes(page)).toHaveCount(2);
    await undo(page);
    await expect(scenes(page)).toHaveCount(3);
  } finally {
    await app.close();
  }
});

test('dragging a slide to another scene moves it, and undo puts it back', async () => {
  const { app, page } = await start();
  try {
    await showOverview(page);
    await overview(page).getByRole('button', { name: 'Add scene', exact: true }).click();
    await expect(scenes(page)).toHaveCount(2);
    await expect(scenes(page).nth(0).locator('.overview-card')).toHaveCount(1);
    await expect(scenes(page).nth(1).locator('.overview-card')).toHaveCount(1);

    await scenes(page)
      .nth(0)
      .locator('.overview-card')
      .dragTo(scenes(page).nth(1).locator('.overview-scene-header'));
    await expect(scenes(page).nth(0).locator('.overview-card')).toHaveCount(0);
    await expect(scenes(page).nth(1).locator('.overview-card')).toHaveCount(2);

    await undo(page);
    await expect(scenes(page).nth(0).locator('.overview-card')).toHaveCount(1);
    await expect(scenes(page).nth(1).locator('.overview-card')).toHaveCount(1);
  } finally {
    await app.close();
  }
});

test('thumbnails draw the slide, and update when the slide changes', async () => {
  const { app, page } = await start();
  try {
    await showOverview(page);
    const thumb = cards(page).first().getByTestId('slide-thumbnail');
    await expect(thumb.locator('[data-object-id]')).toHaveCount(0);

    await cards(page).first().dblclick();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await page.getByRole('tab', { name: 'Insert' }).click();
    await page.getByRole('button', { name: 'Shape', exact: true }).click();
    await page
      .getByTestId('shape-gallery')
      .getByRole('button', { name: 'Rectangle', exact: true })
      .click();

    await showOverview(page);
    await expect(
      cards(page).first().getByTestId('slide-thumbnail').locator('[data-object-id]'),
    ).toHaveCount(1);
  } finally {
    await app.close();
  }
});

test('dragging a slide before another reorders within the scene', async () => {
  const { app, page } = await start();
  try {
    await showOverview(page);
    await overview(page).getByRole('button', { name: 'Add slide', exact: true }).click();
    await overview(page).getByRole('button', { name: 'Rename', exact: true }).click();
    await page.getByLabel('Slide name').fill('Second');
    await page.keyboard.press('Enter');
    await expect(cards(page).nth(1)).toContainText('Second');

    await cards(page).nth(1).dragTo(cards(page).nth(0));
    await expect(cards(page).nth(0)).toContainText('Second');
    await expect(cards(page).nth(1)).toContainText('Untitled Slide');

    // Dropping a slide just before its own successor leaves the order alone.
    await cards(page).nth(0).dragTo(cards(page).nth(1));
    await expect(cards(page).nth(0)).toContainText('Second');
  } finally {
    await app.close();
  }
});

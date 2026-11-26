import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { answerDialogs, launchApp } from './launch';

const DONT_SAVE = 1;
const canvas = (page: Page) => page.getByTestId('stage-canvas');
const objects = (page: Page) => canvas(page).locator('.stage-slide > [data-object-id]');
const underlayObjects = (page: Page) =>
  page.getByTestId('stage-underlay').locator('[data-object-id]');
const masterButton = (page: Page) => page.getByRole('button', { name: 'Master View', exact: true });
const slideButton = (page: Page) => page.getByRole('button', { name: 'Slide View', exact: true });

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

test('a master gives its slides shared objects and layouts with placeholders', async () => {
  const { app, page } = await start();
  try {
    // No master yet: the layout picker says so.
    await expect(page.getByLabel('Slide layout')).toBeDisabled();

    await masterButton(page).click();
    await expect(page.getByTestId('master-list')).toBeVisible();
    await page.getByRole('button', { name: 'Add master', exact: true }).click();
    await expect(page.getByTestId('master-list')).toContainText('Title and Content');

    // The master itself: a shape that every slide using it will show.
    await insertRectangle(page);
    await expect(objects(page)).toHaveCount(1);

    // A layout shows its placeholders and sits on the master's shape.
    await page.getByRole('button', { name: 'Title and Content', exact: true }).click();
    await expect(objects(page)).toHaveCount(2);
    await expect(underlayObjects(page)).toHaveCount(1);

    await slideButton(page).click();
    await page.getByRole('tab', { name: 'Home' }).click();
    await expect(objects(page)).toHaveCount(0);
    await page.getByLabel('Slide layout').selectOption({ label: 'Master 1 › Title and Content' });
    // The slide gets its own empty title and content boxes; the master's shape is beneath.
    await expect(objects(page)).toHaveCount(2);
    await expect(underlayObjects(page)).toHaveCount(1);

    // Master objects are not selectable from the slide: clicking where the master's
    // shape lies (under the slide's own content box) selects the slide's box, and
    // deleting that leaves the master's shape in place.
    const bounds = (await canvas(page).boundingBox())!;
    const zoom = Number(await canvas(page).getAttribute('data-zoom'));
    await page.mouse.click(bounds.x + 640 * zoom, bounds.y + 360 * zoom);
    await expect(page.getByTestId('project-status')).toContainText('1 object selected');
    await page.keyboard.press('Delete');
    await expect(objects(page)).toHaveCount(1);
    await expect(underlayObjects(page)).toHaveCount(1);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(objects(page)).toHaveCount(2);

    // Undo takes the layout and its placeholders back in one step.
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(objects(page)).toHaveCount(0);
    await expect(underlayObjects(page)).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('editing a master updates every slide that uses it', async () => {
  const { app, page } = await start();
  try {
    await page
      .getByRole('button', { name: 'New Slide' })
      .click()
      .catch(() => undefined);
    await masterButton(page).click();
    await page.getByRole('button', { name: 'Add master', exact: true }).click();
    await insertRectangle(page);
    await page.getByRole('tab', { name: 'Format', exact: true }).click();
    await page.getByTestId('format-panel').getByLabel('X', { exact: true }).fill('50');
    await slideButton(page).click();
    await page.getByRole('tab', { name: 'Home' }).click();

    await page.getByLabel('Slide layout').selectOption({ label: 'Master 1 › Title Only' });
    const left = () =>
      underlayObjects(page)
        .first()
        .evaluate((element: HTMLElement) => parseFloat(element.style.left));
    expect(await left()).toBe(50);

    await masterButton(page).click();
    await page.getByRole('button', { name: 'Master 1', exact: true }).click();
    await page
      .getByTestId('stage-canvas')
      .locator('.stage-slide > [data-object-id]')
      .first()
      .click({ force: true });
    await page.getByTestId('format-panel').getByLabel('X', { exact: true }).fill('300');
    await slideButton(page).click();
    expect(await left()).toBe(300);
  } finally {
    await app.close();
  }
});

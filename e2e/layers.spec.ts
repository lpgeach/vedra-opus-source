import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { answerDialogs, launchApp } from './launch';

async function start(): Promise<{ app: ElectronApplication; page: Page }> {
  const { app, page } = await launchApp();
  await answerDialogs(app, { message: [1] });
  await page.getByRole('button', { name: 'New Project' }).click();
  await expect(page.getByTestId('stage-canvas')).toBeVisible();
  await page.getByRole('tab', { name: 'Layers', exact: true }).click();
  return { app, page };
}

const rows = (page: Page) => page.getByTestId('layer-row');
const row = (page: Page, name: string) => rows(page).filter({ hasText: name });
const editable = (page: Page) => page.locator('.stage-slide > [data-object-id]');
const beneath = (page: Page) => page.getByTestId('stage-underlay').locator('[data-object-id]');
const insert = async (page: Page, what: 'Text Box' | 'Button') => {
  await page.getByTestId('ribbon').getByRole('tab', { name: 'Insert', exact: true }).click();
  await page.getByRole('button', { name: what, exact: true }).click();
};
const undo = (page: Page) => page.getByRole('button', { name: 'Undo' }).click();

test('layers: add, edit on the stage with the base beneath, rename, eye, properties', async () => {
  const { app, page } = await start();
  try {
    await insert(page, 'Button');
    await page.getByRole('tab', { name: 'Layers', exact: true }).click();
    await expect(rows(page)).toHaveCount(1);
    await expect(row(page, 'Base Layer')).toHaveAttribute('aria-current', 'true');

    await page.getByRole('button', { name: 'New layer' }).click();
    await expect(rows(page)).toHaveCount(2);
    await expect(row(page, 'Layer 1')).toHaveAttribute('aria-current', 'true');
    // Editing the new layer: the base layer's button is beneath, dimmed and not selectable.
    await expect(editable(page)).toHaveCount(0);
    await expect(beneath(page)).toHaveCount(1);
    await expect(page.getByTestId('stage-underlay')).toHaveAttribute('data-dim', 'true');

    // What is inserted now goes on the layer, with its own timeline.
    await insert(page, 'Text Box');
    await expect(editable(page)).toHaveCount(1);
    await expect(page.getByTestId('timeline-row')).toHaveCount(1);
    await expect(page.getByTestId('timeline-row')).toContainText('Text Box');

    // The eye takes the base layer away from beneath.
    await page.getByRole('tab', { name: 'Layers', exact: true }).click();
    await page.getByRole('button', { name: 'Hide Base Layer beneath other layers' }).click();
    await expect(beneath(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Show Base Layer beneath other layers' }).click();
    await expect(beneath(page)).toHaveCount(1);

    await row(page, 'Layer 1').locator('.layer-name').dblclick();
    await page.getByLabel('Layer name').fill('Feedback');
    await page.getByLabel('Layer name').press('Enter');
    await expect(rows(page).first()).toContainText('Feedback');

    const property = page.getByLabel('Hide the base layer’s objects');
    await expect(property).not.toBeChecked();
    await property.check();
    await expect(property).toBeChecked();
    await page.getByLabel('When shown again').selectOption('resume');
    await undo(page);
    await expect(page.getByLabel('When shown again')).toHaveValue('auto');

    // Back to the base layer: its own objects again, and the layer's are not drawn.
    await row(page, 'Base Layer').locator('.layer-name').click();
    await expect(editable(page)).toHaveCount(1);
    await expect(editable(page)).toHaveAttribute('data-object-type', 'button');
    await expect(page.getByTestId('timeline-row')).toContainText('Button');
  } finally {
    await app.close();
  }
});

test('layers: duplicate, reorder, delete with undo, and a trigger that shows one in preview', async () => {
  const { app, page } = await start();
  try {
    await insert(page, 'Button');
    await page.getByRole('tab', { name: 'Layers', exact: true }).click();
    await page.getByRole('button', { name: 'New layer' }).click();
    await insert(page, 'Text Box');
    await page.getByRole('tab', { name: 'Layers', exact: true }).click();

    await page.getByRole('button', { name: 'Duplicate Layer 1' }).click();
    await expect(rows(page).first()).toContainText('Layer 1 copy');
    await expect(editable(page)).toHaveCount(1); // the copied text box, on the copy
    await page.getByRole('button', { name: 'Move Layer 1 copy down' }).click();
    await expect(rows(page).first()).toContainText('Layer 1');
    await expect(rows(page).nth(1)).toContainText('Layer 1 copy');
    await page.getByRole('button', { name: 'Delete Layer 1 copy' }).click();
    await expect(rows(page)).toHaveCount(2);
    await undo(page);
    await expect(rows(page)).toHaveCount(3);
    await page.getByRole('button', { name: 'Delete Layer 1 copy' }).click();

    // Base layer: a trigger on the button that shows Layer 1.
    await row(page, 'Base Layer').locator('.layer-name').click();
    await page
      .getByTestId('timeline-row')
      .filter({ hasText: 'Button' })
      .locator('.timeline-name')
      .click();
    await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
    await page.getByRole('button', { name: 'New trigger' }).click();
    const wizard = page.getByTestId('trigger-wizard');
    await wizard.getByLabel('Action', { exact: true }).selectOption('showLayer');
    await expect(page.getByTestId('trigger-sentence')).toHaveText(
      'Show layer Layer 1 when the learner clicks Button',
    );
    await wizard.getByRole('button', { name: 'Add trigger' }).click();

    await page.getByTestId('ribbon').getByRole('tab', { name: 'Home', exact: true }).click();
    const [preview] = await Promise.all([
      app.waitForEvent('window'),
      page.getByRole('button', { name: 'This Slide', exact: true }).click(),
    ]);
    const text = preview.locator('[data-object-type="text"]');
    const shown = () =>
      text.evaluate((e) => (e.closest('.vo-player-layer') as HTMLElement).style.display !== 'none');
    await expect(preview.locator('[data-object-type="button"]')).toBeVisible();
    expect(await shown()).toBe(false);
    await preview.locator('[data-object-type="button"]').click();
    await expect.poll(shown).toBe(true);
    await preview.close();
  } finally {
    await app.close();
  }
});

import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { answerDialogs, launchApp, previewFrom } from './launch';

async function start(): Promise<{ app: ElectronApplication; page: Page }> {
  const { app, page } = await launchApp();
  await answerDialogs(app, { message: [1] });
  await page.getByRole('button', { name: 'New Project' }).click();
  await expect(page.getByTestId('stage-canvas')).toBeVisible();
  return { app, page };
}

const ribbonTab = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const selectRow = (page: Page, name: string) =>
  page.getByTestId('timeline-row').filter({ hasText: name }).locator('.timeline-name').click();
const wizard = (page: Page) => page.getByTestId('trigger-wizard');
const items = (page: Page) => page.getByTestId('trigger-item');

/** A button and a rectangle; the rectangle starts hidden. */
async function buttonAndHiddenBox(page: Page): Promise<void> {
  await ribbonTab(page, 'Insert');
  await page.getByRole('button', { name: 'Button', exact: true }).click();
  await page.getByRole('button', { name: 'Shape', exact: true }).click();
  await page
    .getByTestId('shape-gallery')
    .getByRole('button', { name: 'Rectangle', exact: true })
    .click();
  await page.getByTestId('panel-bottom').getByRole('tab', { name: 'States' }).click();
  await page.getByLabel('Add state').selectOption('hidden');
  await page.getByRole('button', { name: 'Done editing states' }).click();
  await page.getByLabel('Initial state').selectOption({ label: 'Hidden' });
  await page.getByTestId('panel-bottom').getByRole('tab', { name: 'Timeline' }).click();
}

test('click to reveal: built with the trigger wizard, played in preview', async () => {
  const { app, page } = await start();
  try {
    await buttonAndHiddenBox(page);
    await selectRow(page, 'Button');
    await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
    await expect(page.getByTestId('triggers')).toContainText('No triggers on this slide');

    await page.getByRole('button', { name: 'New trigger' }).click();
    await wizard(page).getByLabel('Action', { exact: true }).selectOption('changeState');
    await wizard(page).getByLabel('Action object').selectOption({ label: 'Rectangle' });
    await wizard(page).getByLabel('Action state').selectOption({ label: 'Normal' });
    // A new trigger starts out about the selected object.
    await expect(wizard(page).getByLabel('Event', { exact: true })).toHaveValue('click');
    await expect(wizard(page).getByLabel('Event object')).toHaveValue(/obj_/);
    await expect(page.getByTestId('trigger-sentence')).toHaveText(
      'Change Rectangle to Normal when the learner clicks Button',
    );
    await wizard(page).getByRole('button', { name: 'Add trigger' }).click();
    await expect(items(page)).toHaveCount(1);
    await expect(
      page.getByTestId('triggers-panel').getByRole('region', { name: 'Button' }),
    ).toContainText('Change Rectangle to Normal when the learner clicks Button');

    await ribbonTab(page, 'Home');
    const [preview] = await Promise.all([
      app.waitForEvent('window'),
      previewFrom(page, 'This Slide'),
    ]);
    const box = preview.locator('[data-object-type="shape"]');
    const shown = () => box.evaluate((e: HTMLElement) => e.style.display !== 'none');
    await expect(preview.locator('[data-object-type="button"]')).toBeVisible();
    expect(await shown()).toBe(false);
    await preview.locator('[data-object-type="button"]').click();
    await expect.poll(shown).toBe(true);
    await preview.close();
  } finally {
    await app.close();
  }
});

test('conditions and otherwise, editing, enable, reorder, copy, paste and delete', async () => {
  const { app, page } = await start();
  try {
    await buttonAndHiddenBox(page);
    await ribbonTab(page, 'Insert');
    await page.getByRole('button', { name: 'Variables', exact: true }).click();
    const variables = page.getByTestId('variables-dialog');
    await variables.getByRole('button', { name: 'Add variable' }).click();
    await variables.getByLabel('Variable name').fill('Score');
    await variables.getByLabel('Variable name').press('Enter');
    await variables.getByLabel('Variable type').selectOption('number');
    await variables.getByRole('button', { name: 'Close' }).click();

    await selectRow(page, 'Button');
    await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
    await page.getByRole('button', { name: 'New trigger' }).click();
    await wizard(page).getByLabel('Action', { exact: true }).selectOption('setVariable');
    await wizard(page).getByLabel('Action operation').selectOption('add');
    await wizard(page).getByLabel('Action value', { exact: true }).fill('1');
    await wizard(page).getByLabel('Action value', { exact: true }).press('Enter');
    await wizard(page).getByRole('button', { name: 'Add condition' }).click();
    await wizard(page).getByLabel('Comparison').selectOption('<');
    await wizard(page).getByLabel('Compared with', { exact: true }).fill('3');
    await wizard(page).getByLabel('Compared with', { exact: true }).press('Enter');
    await wizard(page).getByRole('button', { name: 'Add “otherwise”' }).click();
    await wizard(page).getByLabel('Otherwise action', { exact: true }).selectOption('changeState');
    await wizard(page).getByLabel('Otherwise action object').selectOption({ label: 'Rectangle' });
    await wizard(page).getByLabel('Otherwise action state').selectOption({ label: 'Normal' });
    const sentence =
      'Add 1 to Score when the learner clicks Button if Score is less than 3; otherwise change Rectangle to Normal';
    await expect(page.getByTestId('trigger-sentence')).toHaveText(sentence);
    await wizard(page).getByRole('button', { name: 'Add trigger' }).click();
    await expect(items(page).first()).toContainText(sentence);

    // A second trigger for the same owner, then reorder.
    await page.getByRole('button', { name: 'New trigger' }).click();
    await wizard(page).getByRole('button', { name: 'Add trigger' }).click();
    await expect(items(page)).toHaveCount(2);
    await expect(items(page).nth(1)).toContainText('Jump to the next slide');
    await items(page).nth(1).getByRole('button', { name: 'Move trigger up' }).click();
    await expect(items(page).nth(0)).toContainText('Jump to the next slide');

    // Edit the jump into opening a web page.
    await items(page).nth(0).locator('.trigger-text').click();
    await wizard(page).getByLabel('Action', { exact: true }).selectOption('openUrl');
    await wizard(page).getByLabel('Action address').fill('https://example.com');
    await wizard(page).getByLabel('Action address').press('Enter');
    await wizard(page).getByRole('button', { name: 'Save' }).click();
    await expect(items(page).nth(0)).toContainText(
      'Open https://example.com when the learner clicks Button',
    );

    // Disable, copy and paste, delete; each undoable.
    await items(page).nth(0).getByLabel('Enabled').uncheck();
    await expect(items(page).nth(0)).toHaveAttribute('data-enabled', 'false');
    await items(page).nth(0).getByRole('button', { name: 'Copy trigger' }).click();
    await page.getByRole('button', { name: 'Paste trigger', exact: true }).click();
    await expect(items(page)).toHaveCount(3);
    await items(page).nth(2).getByRole('button', { name: 'Delete trigger' }).click();
    await expect(items(page)).toHaveCount(2);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(items(page)).toHaveCount(3);

    // Pasting onto a slide without those objects is refused with a message.
    await ribbonTab(page, 'Home');
    await page.getByRole('button', { name: 'New Slide' }).click();
    await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
    await page.getByRole('button', { name: 'Paste trigger', exact: true }).click();
    await expect(page.getByTestId('error')).toContainText('not on this slide');
    await expect(items(page)).toHaveCount(0);
  } finally {
    await app.close();
  }
});

import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { answerDialogs, launchApp } from './launch';

async function start(): Promise<{ app: ElectronApplication; page: Page }> {
  const { app, page } = await launchApp();
  await answerDialogs(app, { message: [1] });
  await page.getByRole('button', { name: 'New Project' }).click();
  await expect(page.getByTestId('stage-canvas')).toBeVisible();
  return { app, page };
}

const dialog = (page: Page) => page.getByTestId('variables-dialog');
const rows = (page: Page) => dialog(page).getByTestId('variable-row');
const openVariables = async (page: Page) => {
  await page.getByTestId('ribbon').getByRole('tab', { name: 'Insert', exact: true }).click();
  await page.getByRole('button', { name: 'Variables', exact: true }).click();
  await expect(dialog(page)).toBeVisible();
};
const close = (page: Page) => dialog(page).getByRole('button', { name: 'Close' }).click();
const rename = async (page: Page, row: number, name: string) => {
  const field = rows(page).nth(row).getByLabel('Variable name');
  await field.fill(name);
  await field.press('Enter');
};

/** Add a text box and put a reference to `name` in it with the Insert variable picker. */
async function boxShowing(page: Page, name: string) {
  await page.getByTestId('ribbon').getByRole('tab', { name: 'Insert', exact: true }).click();
  await page.getByRole('button', { name: 'Text Box', exact: true }).click();
  await page.getByTestId('ribbon').getByRole('tab', { name: 'Text Format', exact: true }).click();
  await page.getByRole('button', { name: 'Insert variable', exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: `%${name}%`, exact: true }).click();
  await expect(page.getByTestId('text-editor')).toContainText(`%${name}%`);
  await page.keyboard.press('Escape');
  return page.locator('.stage-slide > [data-object-type="text"]').last();
}

test('variables: add, rename with references following, type and default, refused names', async () => {
  const { app, page } = await start();
  try {
    await openVariables(page);
    await expect(dialog(page)).toContainText('No variables yet');
    await dialog(page).getByRole('button', { name: 'Add variable' }).click();
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first().getByLabel('Variable name')).toHaveValue('Variable1');
    await rename(page, 0, 'Score');
    await rows(page).first().getByLabel('Variable type').selectOption('number');
    const value = rows(page).first().getByLabel('Default value');
    await value.click();
    await value.fill('');
    await value.pressSequentially('5');
    await value.press('Enter');
    await close(page);

    // The editor shows the reference itself; the course will show the value.
    const box = await boxShowing(page, 'Score');
    await expect(box).toContainText('%Score%');

    await openVariables(page);
    await expect(rows(page).first().getByTestId('variable-usage')).toHaveText('1');
    await rename(page, 0, 'Points');
    await close(page);
    await expect(box).toContainText('%Points%');

    // Names already taken (any case) and built-in names are refused, and the field shows the real name again.
    await openVariables(page);
    await dialog(page).getByRole('button', { name: 'Add variable' }).click();
    await rename(page, 1, 'points');
    await expect(page.getByTestId('variables-error')).toContainText('already');
    await expect(rows(page).nth(1).getByLabel('Variable name')).toHaveValue('Variable1');
    await rename(page, 1, 'SlideNumber');
    await expect(page.getByTestId('variables-error')).toContainText('built-in');
    await rename(page, 1, 'bad name');
    await expect(page.getByTestId('variables-error')).toBeVisible();
    await expect(rows(page).nth(1).getByLabel('Variable name')).toHaveValue('Variable1');
    await expect(dialog(page)).toContainText('%PercentComplete%');
    await close(page);

    // One undo per rename: the text box goes back to the old name.
    await page.getByRole('button', { name: 'Undo' }).click(); // the second variable
    await page.getByRole('button', { name: 'Undo' }).click(); // Score → Points
    await expect(box).toContainText('%Score%');
  } finally {
    await app.close();
  }
});

test('deleting a used variable asks first; an unused one goes at once', async () => {
  const { app, page } = await start();
  try {
    await openVariables(page);
    await dialog(page).getByRole('button', { name: 'Add variable' }).click();
    await dialog(page).getByRole('button', { name: 'Add variable' }).click();
    await rename(page, 0, 'Name');
    await close(page);
    const box = await boxShowing(page, 'Name');

    await openVariables(page);
    await dialog(page).getByRole('button', { name: 'Delete Variable2' }).click();
    await expect(rows(page)).toHaveCount(1);
    await dialog(page).getByRole('button', { name: 'Delete Name' }).click();
    await expect(dialog(page).getByRole('alert')).toContainText('Used 1 time');
    await dialog(page).getByRole('button', { name: 'Keep' }).click();
    await expect(rows(page)).toHaveCount(1);
    await dialog(page).getByRole('button', { name: 'Delete Name' }).click();
    await dialog(page).getByRole('button', { name: 'Delete anyway' }).click();
    await expect(rows(page)).toHaveCount(0);
    await close(page);
    // The text keeps what was written; it is just no longer a variable.
    await expect(box).toContainText('%Name%');
  } finally {
    await app.close();
  }
});

test('preview shows variables’ values, built-in ones included', async () => {
  const { app, page } = await start();
  try {
    await openVariables(page);
    await dialog(page).getByRole('button', { name: 'Add variable' }).click();
    await rename(page, 0, 'Learner');
    await rows(page).first().getByLabel('Default value').fill('Ada');
    await rows(page).first().getByLabel('Default value').press('Enter');
    await close(page);
    await boxShowing(page, 'Learner');
    await page.getByTestId('ribbon').getByRole('tab', { name: 'Text Format', exact: true }).click();
    await page.getByRole('button', { name: 'Insert variable', exact: true }).click();
    await page.getByRole('menuitemcheckbox', { name: '%SlideCount%', exact: true }).click();
    // As in `boxShowing`: the edit starts on the next render, so wait for it before Escape.
    await expect(page.getByTestId('text-editor')).toContainText('%SlideCount%');
    await page.keyboard.press('Escape');
    const box = page.locator('.stage-slide > [data-object-type="text"]').last();
    await expect(box).toContainText('%Learner%%SlideCount%');

    await page.getByTestId('ribbon').getByRole('tab', { name: 'Home', exact: true }).click();
    const [preview] = await Promise.all([
      app.waitForEvent('window'),
      page.getByRole('button', { name: 'This Slide', exact: true }).click(),
    ]);
    await expect(preview.locator('[data-object-type="text"]')).toContainText('Ada1');
    await preview.close();
  } finally {
    await app.close();
  }
});

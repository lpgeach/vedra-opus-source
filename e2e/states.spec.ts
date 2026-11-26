import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { answerDialogs, launchApp, previewFrom } from './launch';

async function start(): Promise<{ app: ElectronApplication; page: Page }> {
  const { app, page } = await launchApp();
  await answerDialogs(app, { message: [1] });
  await page.getByRole('button', { name: 'New Project' }).click();
  await page.getByRole('tab', { name: 'Insert' }).click();
  await page.getByRole('button', { name: 'Button', exact: true }).click();
  await expect(page.locator('.stage-slide > [data-object-type="button"]')).toHaveCount(1);
  await page.getByTestId('panel-bottom').getByRole('tab', { name: 'States' }).click();
  await expect(page.getByTestId('states-panel')).toBeVisible();
  return { app, page };
}

const button = (page: Page) => page.locator('.stage-slide > [data-object-type="button"]');
// The chips, not the <option>s of the panel's own dropdowns (which share the role).
const chips = (page: Page) => page.getByTestId('states-panel').locator('.state-chip');
const chip = (page: Page, name: string) =>
  chips(page).filter({ hasText: new RegExp(`^${name}( \\(initial\\))?$`) });
const leftOf = (page: Page) => button(page).evaluate((e: HTMLElement) => parseFloat(e.style.left));
const look = (page: Page) =>
  button(page).evaluate((e: HTMLElement) => ({
    width: parseFloat(e.style.width),
    opacity: e.style.opacity || '1',
  }));
const formatField = async (page: Page, label: string, value: string) => {
  await page.getByRole('tab', { name: 'Format', exact: true }).click();
  await page.getByTestId('format-panel').getByLabel(label, { exact: true }).fill(value);
};
const undo = (page: Page) => page.getByRole('button', { name: 'Undo' }).click();

test('editing a state changes only that state, and the course shows it on hover', async () => {
  const { app, page } = await start();
  try {
    const normal = await look(page);
    await expect(chip(page, 'Normal')).toHaveAttribute('aria-selected', 'true');

    await page.getByLabel('Add state').selectOption('hover');
    await expect(chip(page, 'Hover')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('states-editing')).toContainText('Editing the Hover state');
    await expect(page.getByTestId('project-status')).toContainText('Editing state: hover');

    // Changes made now belong to Hover.
    // Wider, so it is still under the pointer when hovered: moving it away (X) would
    // end the hover and make it flicker, in any player.
    await formatField(page, 'W', '240');
    await formatField(page, 'Opacity', '0.5');
    expect(await look(page)).toEqual({ width: 240, opacity: '0.5' });

    // Normal is untouched; going back to Hover shows its look again.
    await chip(page, 'Normal').click();
    await expect(page.getByTestId('states-editing')).toHaveCount(0);
    expect(await look(page)).toEqual(normal);
    await chip(page, 'Hover').click();
    expect(await look(page)).toEqual({ width: 240, opacity: '0.5' });

    // Undo takes the state's changes back one at a time.
    await undo(page);
    expect(await look(page)).toEqual({ width: 240, opacity: '1' });
    await page.getByRole('button', { name: 'Redo' }).click();

    // Selecting something else leaves the mode.
    await page.getByRole('button', { name: 'Done editing states' }).click();
    expect(await look(page)).toEqual(normal);

    // The same project in preview: hovering the button shows the Hover state.
    await page.getByRole('tab', { name: 'Home' }).click();
    const [preview] = await Promise.all([
      app.waitForEvent('window'),
      previewFrom(page, 'This Slide'),
    ]);
    const played = preview.locator('[data-object-type="button"]');
    await expect(played).toBeVisible();
    const playedLook = () =>
      played.evaluate((e: HTMLElement) => ({
        width: parseFloat(e.style.width),
        opacity: e.style.opacity || '1',
      }));
    // Away from the button first: under a real display the pointer stays where the last click
    // left it, which can be over the course's button.
    await preview.mouse.move(0, 0);
    await expect.poll(playedLook).toEqual(normal);
    await played.hover();
    await expect.poll(playedLook).toEqual({ width: 240, opacity: '0.5' });
    await preview.close();
  } finally {
    await app.close();
  }
});

test('add built-in and custom states, duplicate, reset, delete, initial state and button set', async () => {
  const { app, page } = await start();
  try {
    await page.getByLabel('Add state').selectOption('selected');
    await expect(chips(page)).toHaveCount(2);
    // A built-in state can only be added once.
    await expect(page.getByLabel('Add state').locator('option[value="selected"]')).toHaveCount(0);

    await page.getByLabel('Add state').selectOption('__custom');
    await page.getByLabel('New state name').fill('Glow');
    await page.getByLabel('New state name').press('Enter');
    await expect(chip(page, 'Glow')).toHaveAttribute('aria-selected', 'true');

    await formatField(page, 'X', '70');
    await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
    await expect(chip(page, 'Glow copy')).toHaveAttribute('aria-selected', 'true');
    expect(await leftOf(page)).toBe(70);

    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    expect(await leftOf(page)).not.toBe(70);
    await expect(page.getByRole('button', { name: 'Reset', exact: true })).toBeDisabled();

    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(chips(page)).toHaveCount(3);
    await expect(chip(page, 'Normal')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
    await undo(page);
    await expect(chips(page)).toHaveCount(4);

    await page.getByLabel('Initial state').selectOption({ label: 'Selected' });
    await expect(chip(page, 'Selected')).toContainText('(initial)');

    await page.getByLabel('Button set').fill('choices');
    await page.getByLabel('Button set').press('Enter');
    await undo(page);
    await expect(page.getByLabel('Button set')).toHaveValue('');
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(page.getByLabel('Button set')).toHaveValue('choices');
  } finally {
    await app.close();
  }
});

import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packTwoSlides } from './fixture';
import { answerDialogs, launchApp } from './launch';

/** Checks that span the app: theming of every dialog and panel, and fields that must take typing anywhere. */

async function start(): Promise<{ app: ElectronApplication; page: Page }> {
  const file = await packTwoSlides(mkdtempSync(join(tmpdir(), 'vedraopus-e2e-audit-')));
  const { app, page } = await launchApp({ args: [file] });
  await expect(page.getByTestId('stage-canvas')).toBeVisible();
  await answerDialogs(app, { message: [1, 1] });
  return { app, page };
}

const tab = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();

async function chooseMenuItem(app: ElectronApplication, id: string): Promise<void> {
  await app.evaluate(({ Menu }, menuId) => {
    Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click();
  }, id);
}

/**
 * Perceived lightness (0 black, 255 white) of the background that shows behind
 * an element: its own, or, where it has none, the nearest one behind it.
 */
const lightness = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((element) => {
      for (let at: Element | null = element; at; at = at.parentElement) {
        const parts = getComputedStyle(at)
          .backgroundColor.match(/[\d.]+/g)!
          .map(Number);
        const [r = 0, g = 0, b = 0, alpha = 1] = parts;
        if (alpha > 0) return 0.299 * r + 0.587 * g + 0.114 * b;
      }
      return 255;
    });

for (const theme of ['Dark', 'Light'] as const) {
  test(`every dialog, panel field and menu follows the ${theme.toLowerCase()} theme`, async () => {
    const { app, page } = await start();
    try {
      await tab(page, 'View');
      await page.getByRole('radio', { name: theme, exact: true }).click();
      const dark = theme === 'Dark';
      const follows = async (selector: string) => {
        const value = await lightness(page, selector);
        if (dark) expect(value, `${selector} in dark mode`).toBeLessThan(90);
        else expect(value, `${selector} in light mode`).toBeGreaterThan(200);
      };

      await tab(page, 'Design');
      await page.getByRole('button', { name: 'Colours' }).click();
      await follows('[data-testid="theme-dialog"]');
      await follows('[data-testid="theme-dialog"] input[aria-label="Theme heading font"]');
      await page.getByTestId('theme-dialog').getByRole('button', { name: 'Cancel' }).click();

      await page.getByRole('button', { name: 'Stage Size' }).click();
      await follows('[data-testid="stage-size-dialog"]');
      await follows('[data-testid="stage-size-dialog"] input[aria-label="Stage width"]');
      await page.getByTestId('stage-size-dialog').getByRole('button', { name: 'Cancel' }).click();

      await tab(page, 'Insert');
      await page.getByRole('button', { name: 'Variables', exact: true }).click();
      await page
        .getByTestId('variables-dialog')
        .getByRole('button', { name: 'Add variable' })
        .click();
      await follows('[data-testid="variables-dialog"]');
      await follows('[data-testid="variables-dialog"] input');
      await follows('[data-testid="variables-dialog"] select');
      await page.getByTestId('variables-dialog').getByRole('button', { name: 'Close' }).click();

      await page.getByRole('button', { name: 'Publish', exact: true }).click();
      await follows('[data-testid="publish-dialog"]');
      await follows('[data-testid="publish-dialog"] input');
      await page.getByTestId('publish-dialog').getByRole('button', { name: 'Cancel' }).click();

      // A selected object: Format panel fields and dropdowns, the States panel, the ribbon's fields.
      await page
        .getByTestId('timeline-row')
        .filter({ hasText: 'Continue' })
        .locator('.timeline-name')
        .click();
      await page.getByRole('tab', { name: 'Format', exact: true }).click();
      await follows('[data-testid="format-panel"] input[type="text"]');
      await follows('[data-testid="format-panel"] select');
      await page.getByTestId('panel-bottom').getByRole('tab', { name: 'States' }).click();
      await follows('[data-testid="states-panel"] select');
      await follows('[data-testid="states-panel"] input');
      await tab(page, 'Text Format');
      await follows('.ribbon select[aria-label="Font"]');
      await follows('.ribbon input[aria-label="Font size"]');
      await page.getByRole('button', { name: 'Line and paragraph spacing' }).click();
      await follows('.menu-panel');
      await page.keyboard.press('Escape');

      await page.getByRole('tab', { name: 'Layers', exact: true }).click();
      await page.getByRole('button', { name: 'New layer' }).click();
      await follows('[data-testid="layers-panel"] select');
      await page
        .getByTestId('layer-row')
        .filter({ hasText: 'Base Layer' })
        .locator('.layer-name')
        .click();
      await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
      await page.getByRole('button', { name: 'New trigger' }).click();
      await follows('[data-testid="trigger-wizard"]');
      await follows('[data-testid="trigger-wizard"] select');
      await page.getByTestId('trigger-wizard').getByRole('button', { name: 'Cancel' }).click();

      await page.getByTestId('panel-bottom').getByRole('tab', { name: 'Timeline' }).click();
      await follows('.timeline-toolbar input');
      await page.getByRole('button', { name: 'Master View', exact: true }).click();
      await page.getByRole('button', { name: 'Add master', exact: true }).click();
      await follows('[data-testid="master-list"]');
      await page.getByRole('button', { name: 'Slide View', exact: true }).click();
      await tab(page, 'Home');
      await follows('.ribbon select[aria-label="Slide layout"]');
    } finally {
      await app.close();
    }
  });
}

test('panel number fields take typing while text is being edited, as one undo step each', async () => {
  const { app, page } = await start();
  try {
    const title = page.locator('.stage-slide > [data-object-type="text"]').first();
    const left = () => title.evaluate((e: HTMLElement) => parseFloat(e.style.left));
    await page
      .getByTestId('timeline-row')
      .filter({ hasText: 'Title' })
      .locator('.timeline-name')
      .click();
    await page.getByRole('tab', { name: 'Format', exact: true }).click();
    const before = await left();

    const bounds = (await title.boundingBox())!;
    await title.dblclick({ position: { x: bounds.width / 4, y: bounds.height / 2 } });
    await expect(page.getByTestId('text-editor')).toBeVisible();
    await page.keyboard.press('ControlOrMeta+a');

    // Typed a key at a time, while the editor still holds a text selection.
    const x = page.getByTestId('format-panel').getByLabel('X', { exact: true });
    await x.click();
    await x.press('ControlOrMeta+a');
    await x.pressSequentially('300');
    await expect(x).toHaveValue('300');
    await x.press('Enter');
    await page.keyboard.press('Escape');
    await expect.poll(left).toBe(300);

    // "3", "30" and "300" were one entry: one undo goes all the way back.
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(left).toBe(before);

    // The timeline length takes typing the same way.
    const length = page.getByLabel('Timeline length in seconds');
    await length.click();
    await length.press('ControlOrMeta+a');
    await length.pressSequentially('12');
    await length.press('Enter');
    await expect(page.getByTestId('timeline-ruler')).toContainText('12s');
  } finally {
    await app.close();
  }
});

test('stage size fields can be cleared and retyped; a blank or zero size cannot be applied', async () => {
  const { app, page } = await start();
  try {
    await tab(page, 'Design');
    await page.getByRole('button', { name: 'Stage Size' }).click();
    const dialog = page.getByTestId('stage-size-dialog');
    const width = dialog.getByLabel('Stage width');
    await width.fill('');
    await expect(width).toHaveValue('');
    await expect(dialog.getByRole('button', { name: 'Apply' })).toBeDisabled();
    await width.pressSequentially('640');
    await expect(width).toHaveValue('640');
    await dialog.getByLabel('Stage height').fill('0');
    await expect(dialog.getByRole('button', { name: 'Apply' })).toBeDisabled();
    await dialog.getByLabel('Stage height').fill('360');
    await dialog.getByRole('button', { name: 'Apply' }).click();
    await expect(page.locator('.stage-slide')).toHaveCSS('width', '640px');
  } finally {
    await app.close();
  }
});

test('the Insert menu in the menu bar inserts objects', async () => {
  const { app, page } = await start();
  try {
    const objects = page.locator('.stage-slide > [data-object-id]');
    const before = await objects.count();
    await chooseMenuItem(app, 'insert.textBox');
    await chooseMenuItem(app, 'insert.shape');
    await chooseMenuItem(app, 'insert.button');
    await expect(objects).toHaveCount(before + 3);
    const types = await objects.evaluateAll((els) =>
      els.slice(-3).map((e) => e.getAttribute('data-object-type')),
    );
    expect(types).toEqual(['text', 'shape', 'button']);
  } finally {
    await app.close();
  }
});

test('a shape with no text gets the Text Format tab, and formatting gives it text', async () => {
  const { app, page } = await start();
  try {
    await chooseMenuItem(app, 'insert.shape');
    const shape = page.locator('.stage-slide > [data-object-type="shape"]').last();
    const textTab = page
      .getByTestId('ribbon')
      .getByRole('tab', { name: 'Text Format', exact: true });
    await expect(textTab).toBeVisible();
    await textTab.click();
    // Nothing to make bold yet: Bold starts typing in the shape, in bold.
    await page.getByRole('button', { name: 'Bold', exact: true }).click();
    await expect(page.getByTestId('text-editor')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bold', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.keyboard.type('Label');
    await page.keyboard.press('Escape');
    await expect(shape.locator('strong')).toContainText('Label');
  } finally {
    await app.close();
  }
});

import { expect, test } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packTwoSlides } from './fixture';
import { answerDialogs, launchApp } from './launch';

/**
 * Importing slides (docs/briefs/P11.2-templates.md, part B): a slide of a
 * saved project copied in with its picture, then taken back with Undo.
 */

const DONT_SAVE = 1;

async function chooseMenuItem(app: ElectronApplication, id: string): Promise<void> {
  await app.evaluate(({ Menu }, menuId) => {
    Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click();
  }, id);
}

test('a slide of another project comes in after the current one, with its picture, and Undo takes it back', async () => {
  test.setTimeout(120_000);
  const source = await packTwoSlides(mkdtempSync(join(tmpdir(), 'vo-e2e-import-slides-')));
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { open: [[source]], message: [DONT_SAVE] });
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    const slides = page.getByTestId('slide-list').locator('.slide-item');
    await expect(slides).toHaveCount(1);

    await chooseMenuItem(app, 'file.importSlides');
    const dialog = page.getByTestId('import-slides');
    await expect(dialog).toContainText('From “two-slides.vedraopus”.');
    await expect(dialog.getByRole('group', { name: 'Scene: Main' })).toBeVisible();
    await dialog.getByRole('checkbox', { name: '1. Welcome' }).check();
    await expect(dialog).toContainText('1 chosen');
    await dialog.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText('Imported 1 slide.');
    await expect(dialog).toContainText('1 media files');
    // Its Continue button went to The End, which did not come.
    await expect(dialog.getByTestId('import-slides-dropped')).toContainText('“Welcome”');
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();

    await expect(slides).toHaveCount(2);
    await expect(slides).toContainText(['Untitled Slide', 'Welcome']);
    const picture = page.getByTestId('stage-canvas').locator('[data-object-type="image"] img');
    await expect(picture).toHaveCount(1);
    await expect
      .poll(() => picture.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
      .toBeGreaterThan(0);

    // One step: Undo takes the slide back.
    await chooseMenuItem(app, 'edit.undo');
    await expect(slides).toHaveCount(1);
  } finally {
    await app.close();
  }
});

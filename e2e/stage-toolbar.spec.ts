import { expect, test } from '@playwright/test';
import { answerDialogs, launchApp } from './launch';

/**
 * Above the stage and on it (docs/briefs/B17-ribbon-and-panels.md, part 3): the toolbar shows
 * the slide, the layer being edited (and switches it) and the slide's size; the selection shows
 * its name and size on the stage.
 */
test('the stage toolbar shows the slide, its layer and size, and the selection its name and size (B17)', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [1] });
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    const toolbar = page.getByTestId('stage-toolbar');
    await expect(toolbar.getByTestId('stage-slide')).toHaveText('1 · Untitled Slide');
    await expect(toolbar.getByTestId('stage-size')).toHaveText('1280 × 720');
    const layer = toolbar.getByLabel('Layer being edited');
    await expect(layer.locator('option')).toHaveText(['Base Layer']);

    // The selection's name and size, on the stage.
    await page.getByTestId('ribbon').getByRole('tab', { name: 'Insert', exact: true }).click();
    await page.getByRole('button', { name: 'Button', exact: true }).click();
    await expect(page.getByTestId('selection-name')).toHaveText('Button');
    await expect(page.getByTestId('selection-size')).toHaveText(/^\d+ × \d+$/);
    const name = (await page.getByTestId('selection-name').boundingBox())!;
    const size = (await page.getByTestId('selection-size').boundingBox())!;
    // The frame's outline, without the turn handle above it.
    const outline = (await page.getByTestId('selection').locator('polygon').boundingBox())!;
    expect(name.y + name.height).toBeLessThanOrEqual(outline.y + 1);
    expect(size.y).toBeGreaterThanOrEqual(outline.y + outline.height - 1);
    // Nothing selected, no tags.
    await page.getByTestId('stage-canvas').click({ position: { x: 4, y: 4 } });
    await expect(page.getByTestId('selection-name')).toHaveCount(0);

    // A new layer is listed and edited; the toolbar switches back to the base layer.
    await page.getByRole('tab', { name: 'Slide Layers', exact: true }).click();
    await page.getByRole('button', { name: 'New layer' }).click();
    await expect(layer.locator('option')).toHaveText(['Base Layer', 'Layer 1']);
    await expect(layer.locator('option:checked')).toHaveText('Layer 1');
    await layer.selectOption({ label: 'Base Layer' });
    await expect(page.getByTestId('layer-row').filter({ hasText: 'Base Layer' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await layer.selectOption({ label: 'Layer 1' });
    await expect(page.getByTestId('layer-row').filter({ hasText: 'Layer 1' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  } finally {
    await app.close();
  }
});

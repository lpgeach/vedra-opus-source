import { expect, test } from '@playwright/test';
import { answerDialogs, launchApp, previewFrom } from './launch';

/**
 * The ribbon's tab row (docs/briefs/B17-ribbon-and-panels.md, part 1): Preview and Publish at
 * its end on every tab, and nowhere else; and the ribbon collapsing to the row, remembered.
 */
test('Preview and Publish stay at the end of the tab row on every tab, and the ribbon collapses (B17)', async () => {
  const first = await launchApp();
  let { app, page } = first;
  try {
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    const ribbon = page.getByTestId('ribbon');
    const tabs = ribbon.getByRole('tablist', { name: 'Ribbon' }).getByRole('tab');
    const row = page.getByTestId('ribbon-tab-row');
    const preview = row.getByRole('button', { name: 'Preview', exact: true });
    const publish = row.getByRole('button', { name: 'Publish', exact: true });
    const where = async () => ({
      preview: (await preview.boundingBox())!,
      publish: (await publish.boundingBox())!,
    });

    // In the same place on every tab, after the last tab, and the only ones of their kind.
    const start = await where();
    const lastTab = (await tabs.last().boundingBox())!;
    expect(start.preview.x).toBeGreaterThan(lastTab.x + lastTab.width);
    expect(start.publish.x).toBeGreaterThan(start.preview.x);
    for (const name of await tabs.allTextContents()) {
      await tabs.filter({ hasText: name }).first().click();
      expect(await where()).toEqual(start);
      await expect(page.getByRole('button', { name: 'Publish', exact: true })).toHaveCount(1);
      await expect(page.getByRole('button', { name: 'This Slide', exact: true })).toHaveCount(0);
    }

    // Publish opens publishing; Preview's menu previews this slide.
    await publish.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const [window] = await Promise.all([
      app.waitForEvent('window'),
      previewFrom(page, 'This Slide'),
    ]);
    await expect(window.locator('.vo-player')).toBeVisible();
    await window.close();

    // Collapsed, only the tab row shows; a tab shows its commands over the stage until one is used.
    const commands = ribbon.getByRole('tabpanel');
    const stageTop = (await page.getByTestId('stage').boundingBox())!.y;
    await ribbon.getByRole('button', { name: 'Collapse the ribbon' }).click();
    await expect(commands).toHaveCount(0);
    const stageTopCollapsed = (await page.getByTestId('stage').boundingBox())!.y;
    expect(stageTopCollapsed).toBeLessThan(stageTop - 40);
    await tabs.filter({ hasText: 'Insert' }).click();
    await expect(commands).toBeVisible();
    // Over the stage: the stage does not move.
    expect((await page.getByTestId('stage').boundingBox())!.y).toBe(stageTopCollapsed);
    await commands.getByRole('button', { name: 'Button', exact: true }).click();
    await expect(commands).toHaveCount(0);
    await expect(page.getByTestId('selection-name')).toHaveText('Button');
    // A click elsewhere closes it too.
    await tabs.filter({ hasText: 'Home' }).click();
    await expect(commands).toBeVisible();
    const stage = (await page.getByTestId('stage').boundingBox())!;
    await page.mouse.click(stage.x + 20, stage.y + stage.height - 20);
    await expect(commands).toHaveCount(0);

    // Remembered after a restart.
    await answerDialogs(app, { message: [1] });
    await app.close();
    ({ app, page } = await launchApp({ userDataDir: first.userDataDir }));
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await expect(page.getByTestId('ribbon').getByRole('tabpanel')).toHaveCount(0);
    await page.getByRole('button', { name: 'Expand the ribbon' }).click();
    await expect(page.getByTestId('ribbon').getByRole('tabpanel')).toBeVisible();
  } finally {
    await app.close();
  }
});

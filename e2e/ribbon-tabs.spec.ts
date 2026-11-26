import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { answerDialogs, launchApp } from './launch';

/**
 * The ribbon's tabs and groups (docs/briefs/B17-ribbon-and-panels.md, part 1), in the order the
 * authoring tool we match has them, and the commands that moved or are new still working.
 */

const ribbonTab = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const groups = (page: Page) =>
  page
    .getByTestId('ribbon')
    .getByRole('tabpanel')
    .locator('.ribbon-group')
    .evaluateAll((all) => all.map((group) => group.getAttribute('aria-label')));

test('the ribbon has its seven tabs, each with its groups in order, and the moved commands work (B17)', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [1] });
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();

    await expect(
      page.getByTestId('ribbon').getByRole('tablist', { name: 'Ribbon' }).getByRole('tab'),
    ).toHaveText(['Home', 'Insert', 'Slides', 'Design', 'Transitions', 'Animations', 'View']);

    const expected: [string, string[]][] = [
      ['Home', ['Clipboard', 'Slides', 'Font', 'Paragraph', 'Editing', 'Arrange']],
      ['Insert', ['Slide', 'Media', 'Text', 'Interactive Objects']],
      ['Slides', ['Slide', 'Quizzing', 'Record']],
      ['Design', ['Stage', 'Theme', 'Background', 'Course']],
    ];
    for (const [tab, wanted] of expected) {
      await ribbonTab(page, tab);
      expect(await groups(page)).toEqual(wanted);
    }
    await ribbonTab(page, 'View');
    expect((await groups(page))[0]).toBe('Views');

    // Home: Duplicate Slide, and Tab Order opens the slide's properties.
    const slides = page.getByTestId('slide-list').locator('.slide-item');
    await ribbonTab(page, 'Home');
    await page.getByRole('button', { name: 'Duplicate Slide', exact: true }).click();
    await expect(slides).toHaveCount(2);
    // (An empty slide has no Tab order to set, so the slide's properties are what shows.)
    await page.getByRole('button', { name: 'Tab Order', exact: true }).click();
    await expect(page.getByTestId('right-lower').getByTestId('slide-properties')).toBeVisible();

    // Insert → Slide Layer: a new layer, being edited.
    await ribbonTab(page, 'Insert');
    await page.getByRole('button', { name: 'Slide Layer', exact: true }).click();
    await expect(page.getByTestId('layer-row')).toHaveCount(2);
    await expect(page.getByTestId('stage-layer').locator('option:checked')).toHaveText('Layer 1');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByTestId('layer-row')).toHaveCount(1);

    // Slides: a question slide, and a question bank.
    await ribbonTab(page, 'Slides');
    await page.getByRole('button', { name: 'Question', exact: true }).click();
    await page.getByRole('menuitem', { name: 'True or False', exact: true }).click();
    await expect(slides).toHaveCount(3);

    // View → Feedback Master opens it in Master View.
    await ribbonTab(page, 'View');
    await page.getByRole('button', { name: 'Feedback Master', exact: true }).click();
    await expect(page.getByTestId('project-status')).toContainText('Master View');
  } finally {
    await app.close();
  }
});

test('the ribbon never runs off the side: narrow, groups go to icons; narrower still, they fold into drop-downs that still work (B17)', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [1] });
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    const resize = (width: number) =>
      app.evaluate(
        ({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0]!.setSize(w, 800),
        width,
      );
    const zoom = (factor: number) =>
      app.evaluate(
        ({ BrowserWindow }, f) => BrowserWindow.getAllWindows()[0]!.webContents.setZoomFactor(f),
        factor,
      );
    const commands = page.getByTestId('ribbon').getByRole('tabpanel');
    const overflow = () => commands.evaluate((row) => row.scrollWidth - row.clientWidth);
    const tight = page.getByTestId('ribbon').locator('.ribbon-group-tight');
    const folded = page.getByTestId('ribbon').locator('.ribbon-group-folded');
    const tabs = ['Home', 'Insert', 'Slides', 'Design', 'Transitions', 'Animations', 'View'];

    // The narrowest the window goes: every tab fits, nothing folds; groups that must, show
    // their small commands as icons, each still there by name.
    await resize(960);
    for (const tab of tabs) {
      await ribbonTab(page, tab);
      await expect.poll(overflow).toBeLessThanOrEqual(0);
      await expect(folded).toHaveCount(0);
    }
    await ribbonTab(page, 'Insert');
    await expect(tight).not.toHaveCount(0);
    const hotspot = page.getByRole('button', { name: 'Hotspot', exact: true });
    await expect(hotspot).toHaveAttribute('title', 'Hotspot');
    await hotspot.click();
    await expect(page.getByTestId('selection-name')).toHaveText('Hotspot');

    // Narrower still (the page zoomed in): groups fold into drop-downs, and their commands work.
    await zoom(2);
    await expect.poll(overflow).toBeLessThanOrEqual(0);
    await expect(folded).not.toHaveCount(0);
    const group = folded.last();
    expect(await group.getAttribute('aria-label')).toBe('Interactive Objects');
    await group.getByRole('button', { name: /Interactive Objects/ }).click();
    await page
      .getByRole('group', { name: 'Interactive Objects' })
      .getByRole('button', { name: 'Button', exact: true })
      .last()
      .click();
    await expect(page.getByTestId('selection-name')).toHaveText('Button');

    // Wide again: everything opens out.
    await zoom(1);
    await resize(1600);
    for (const tab of tabs) {
      await ribbonTab(page, tab);
      await expect(folded).toHaveCount(0);
      await expect(tight).toHaveCount(0);
      expect(await overflow()).toBeLessThanOrEqual(0);
    }
  } finally {
    await app.close();
  }
});

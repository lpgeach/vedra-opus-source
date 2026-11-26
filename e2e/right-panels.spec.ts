import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { answerDialogs, launchApp } from './launch';

/**
 * The right of the window (docs/briefs/B17-ribbon-and-panels.md, part 2): two panels, one above
 * the other. Triggers, Format and Check above; Slide Layers and Slide Properties below, split by a
 * divider that is remembered and put back by Reset Layout.
 */

const upper = (page: Page) => page.getByTestId('right-upper');
const lower = (page: Page) => page.getByTestId('right-lower');
const divider = (page: Page) => page.getByTestId('splitter-rightSplit');

async function height(locator: Locator): Promise<number> {
  const bounds = await locator.boundingBox();
  if (!bounds) throw new Error('element is not visible');
  return bounds.height;
}

async function newProject(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  await expect(page.getByTestId('editor')).toBeVisible();
}

test('the right of the window has two panels, Slide Properties on its own tab, and a divider that is remembered (B17)', async () => {
  const first = await launchApp();
  let { app, page } = first;
  try {
    await newProject(page);

    // Both panels at once, each with its own tabs.
    const tabsOf = (part: Locator) =>
      part.getByRole('tab').evaluateAll((tabs) => tabs.map((tab) => tab.textContent));
    expect(await tabsOf(upper(page))).toEqual(['Triggers', 'Format', 'Check']);
    expect(await tabsOf(lower(page))).toEqual(['Slide Layers', 'Slide Properties']);
    await expect(upper(page).getByTestId('triggers')).toBeVisible();
    await expect(lower(page).getByTestId('slide-layers')).toContainText('Base Layer');
    const upperBox = (await upper(page).boundingBox())!;
    const lowerBox = (await lower(page).boundingBox())!;
    expect(lowerBox.y).toBeGreaterThanOrEqual(upperBox.y + upperBox.height);
    expect(await height(lower(page))).toBe(260);

    // Slide Properties has a tab of its own, with the triggers still in view above it; the
    // Format tab no longer carries it.
    await lower(page).getByRole('tab', { name: 'Slide Properties', exact: true }).click();
    await expect(lower(page).getByTestId('slide-properties')).toBeVisible();
    await expect(upper(page).getByTestId('triggers')).toBeVisible();
    await lower(page).getByLabel('When revisited').selectOption('resume');
    await upper(page).getByRole('tab', { name: 'Format', exact: true }).click();
    await expect(upper(page).getByTestId('slide-properties')).toHaveCount(0);
    await expect(lower(page).getByLabel('When revisited')).toHaveValue('resume');

    // The divider: dragged up, the lower panel grows by as much; the keyboard moves it too.
    const handle = (await divider(page).boundingBox())!;
    const from = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y - 40);
    await page.mouse.move(from.x, from.y - 80);
    await page.mouse.up();
    expect(await height(lower(page))).toBe(340);
    await divider(page).focus();
    await page.keyboard.press('ArrowDown');
    expect(await height(lower(page))).toBe(332);
    // Neither panel goes below its smallest.
    await page.keyboard.press('Home');
    expect(await height(lower(page))).toBe(100);
    await page.keyboard.press('End');
    expect(await height(upper(page))).toBeGreaterThanOrEqual(100);
    await page.keyboard.press('Home');
    for (let i = 0; i < 29; i++) await page.keyboard.press('ArrowUp');
    expect(await height(lower(page))).toBe(332);
    // The project was changed above: close without saving it.
    await answerDialogs(app, { message: [1] });
    await app.close();

    // Remembered after a restart.
    expect(
      (
        JSON.parse(readFileSync(join(first.userDataDir, 'settings.json'), 'utf8')) as {
          layout: { rightSplit: number };
        }
      ).layout.rightSplit,
    ).toBe(332);
    ({ app, page } = await launchApp({ userDataDir: first.userDataDir }));
    await newProject(page);
    expect(await height(lower(page))).toBe(332);

    // Reset Layout puts it back.
    await page.getByTestId('ribbon').getByRole('tab', { name: 'View', exact: true }).click();
    await page.getByRole('button', { name: 'Reset Layout' }).click();
    expect(await height(lower(page))).toBe(260);
  } finally {
    await app.close();
  }
});

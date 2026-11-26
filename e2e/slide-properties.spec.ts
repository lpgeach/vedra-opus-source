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

const props = (page: Page) => page.getByTestId('slide-properties');
const showProperties = (page: Page) =>
  page.getByRole('tab', { name: 'Slide Properties', exact: true }).click();
const slideItems = (page: Page) => page.getByTestId('slide-list').locator('.slide-item');

test('slide properties: moving on, revisiting and the player buttons, shown in preview', async () => {
  const { app, page } = await start();
  try {
    await page.getByRole('button', { name: 'New Slide' }).click();
    await slideItems(page).first().click();
    await showProperties(page);
    await expect(props(page)).toBeVisible();
    await expect(props(page).getByLabel('Moves on')).toHaveValue('user');
    await props(page).getByLabel('When revisited').selectOption('resume');
    await props(page).getByLabel('Next').uncheck();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(props(page).getByLabel('Next')).toBeChecked();
    await props(page).getByLabel('Next').uncheck();
    await expect(props(page).getByLabel('When revisited')).toHaveValue('resume');

    await page.getByTestId('ribbon').getByRole('tab', { name: 'Home', exact: true }).click();
    const [preview] = await Promise.all([
      app.waitForEvent('window'),
      previewFrom(page, 'Entire Project'),
    ]);
    await expect(preview.locator('.vo-player-position')).toHaveText('Slide 1 of 2');
    await expect(preview.getByRole('button', { name: 'Next' })).toBeHidden();
    await preview.locator('.vo-player').focus();
    await preview.keyboard.press('ArrowRight');
    await expect(preview.locator('.vo-player-position')).toHaveText('Slide 1 of 2');
    await preview.close();
  } finally {
    await app.close();
  }
});

test('Overview draws an arrow for a jump and flags a slide nothing reaches', async () => {
  const { app, page } = await start();
  try {
    await page.getByRole('button', { name: 'New Slide' }).click();
    await page.getByRole('button', { name: 'New Slide' }).click();
    await expect(slideItems(page)).toHaveCount(3);
    // No player buttons on any slide: only triggers move the learner on.
    for (const index of [0, 1, 2]) {
      await slideItems(page).nth(index).click();
      await showProperties(page);
      await props(page).getByLabel('Previous').uncheck();
      await props(page).getByLabel('Next').uncheck();
    }
    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    const unreachable = page.getByTestId('overview').locator('.overview-unreachable');
    // Nothing leads from slide 1 any more, so slides 2 and 3 cannot be reached.
    await expect(unreachable).toHaveCount(2);

    // A jump from slide 1 to slide 3.
    await page.getByRole('button', { name: 'Slide View', exact: true }).click();
    await slideItems(page).first().click();
    await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
    await page.getByRole('button', { name: 'New trigger' }).click();
    const wizard = page.getByTestId('trigger-wizard');
    await wizard.getByLabel('Event', { exact: true }).selectOption('keyPress');
    await wizard.getByLabel('Action slide').selectOption({ index: 4 });
    await expect(page.getByTestId('trigger-sentence')).toContainText('Jump to');
    await wizard.getByRole('button', { name: 'Add trigger' }).click();

    // Slide 3 is reached by the jump; slide 2 still is not.
    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    await expect(unreachable).toHaveCount(1);
    await expect(page.getByTestId('overview').locator('[data-unreachable="true"]')).toContainText(
      'Untitled Slide',
    );
    await expect(page.getByTestId('overview-links').locator('path[data-link]')).toHaveCount(1);
    if (process.env['VEDRAOPUS_SHOT']) {
      await page.getByTestId('overview').screenshot({ path: process.env['VEDRAOPUS_SHOT'] });
    }
    // The arrow can be hidden.
    await page.getByLabel('Show links between slides').uncheck();
    await expect(page.getByTestId('overview-links')).toHaveCount(0);
  } finally {
    await app.close();
  }
});

import { expect, test } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import { answerDialogs, launchApp } from './launch';

/**
 * The demo course (docs/briefs/B4-demo-course.md): it ships with the app, opens from the
 * Welcome screen and from Help → Open Demo Course as a new, unsaved copy, and its media
 * are credited in the Third-Party Notices.
 */

const DONT_SAVE = 1;

const chooseMenuItem = (app: ElectronApplication, id: string) =>
  app.evaluate(({ Menu }, itemId) => {
    Menu.getApplicationMenu()!.getMenuItemById(itemId)!.click();
  }, id);

test('the demo course opens from the Welcome screen and the Help menu, as an unsaved copy', async () => {
  test.setTimeout(120_000);
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [DONT_SAVE, DONT_SAVE] });
    await page.getByRole('button', { name: 'Explore the Demo Course', exact: true }).click();
    await expect(page.getByTestId('project-title')).toHaveValue('The UK Space Industry in 2026', {
      timeout: 60_000,
    });
    // A copy: unsaved, with no file of its own, so the one that ships is never written.
    await expect(page.getByTestId('project-status')).toContainText('Unsaved');
    const slides = page.getByTestId('slide-list').locator('.slide-item');
    // 23 course slides and the bank's 3 questions.
    await expect(slides).toHaveCount(26);
    await expect(slides.first()).toContainText('The UK Space Industry in 2026');

    // Again from the Help menu, over the open copy (which asks first; Don't Save). The open
    // copy's title is changed first, so the original title coming back shows the new copy has
    // loaded. Without that, the test could close the app mid-load and hang there (session 115).
    await page.getByTestId('project-title').fill('Changed copy');
    await expect(page.getByTestId('project-title')).toHaveValue('Changed copy');
    await chooseMenuItem(app, 'help.demo');
    await expect(page.getByTestId('project-title')).toHaveValue('The UK Space Industry in 2026', {
      timeout: 60_000,
    });
    await expect(page.getByTestId('project-status')).toContainText('Unsaved');

    // Its media are credited.
    await chooseMenuItem(app, 'help.thirdPartyNotices');
    const notices = page.getByRole('dialog', { name: 'Third-Party Notices' });
    await expect(notices).toContainText('Demo course media');
    await expect(notices).toContainText('CC-BY-4.0; public domain');
  } finally {
    await app.close();
  }
});

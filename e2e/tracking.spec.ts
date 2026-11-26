import { expect, test } from '@playwright/test';
import { answerDialogs, launchApp, previewFrom } from './launch';

test('tracking settings, and a Complete the course trigger completing the course in preview', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    const ribbon = (name: string) =>
      page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();

    // The defaults, then other choices, applied and still there when reopened.
    await ribbon('Design');
    await page.getByRole('button', { name: 'Tracking', exact: true }).click();
    const dialog = page.getByTestId('tracking-dialog');
    await expect(dialog.getByLabel('Every slide has been seen')).toBeChecked();
    await expect(dialog.getByLabel('Tell the LMS the course is')).toHaveValue(
      'completed-incomplete',
    );
    await expect(dialog.getByLabel('When a learner comes back')).toHaveValue('prompt');
    await dialog.getByLabel('Only when a trigger completes it').check();
    await dialog.getByLabel('Tell the LMS the course is').selectOption('passed-failed');
    await dialog.getByLabel('When a learner comes back').selectOption('never');
    await dialog.getByRole('button', { name: 'Apply' }).click();
    await page.getByRole('button', { name: 'Tracking', exact: true }).click();
    await expect(dialog.getByLabel('Only when a trigger completes it')).toBeChecked();
    await expect(dialog.getByLabel('Tell the LMS the course is')).toHaveValue('passed-failed');
    await dialog.getByLabel('This many slides have been seen:').check();
    await dialog.getByLabel('Slides to see').fill('1');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    // Cancel changed nothing; undo takes the applied settings back.
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.getByRole('button', { name: 'Tracking', exact: true }).click();
    await expect(dialog.getByLabel('Every slide has been seen')).toBeChecked();
    await dialog.getByLabel('Only when a trigger completes it').check();
    await dialog.getByRole('button', { name: 'Apply' }).click();

    // A button that completes the course.
    await ribbon('Insert');
    await page.getByRole('button', { name: 'Button', exact: true }).click();
    await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
    await page.getByRole('button', { name: 'New trigger' }).click();
    const wizard = page.getByTestId('trigger-wizard');
    await wizard.getByLabel('Action', { exact: true }).selectOption('completeCourse');
    await expect(page.getByTestId('trigger-sentence')).toHaveText(
      'Complete the course when the learner clicks Button',
    );
    await wizard.getByRole('button', { name: 'Add trigger' }).click();

    await ribbon('Home');
    const [preview] = await Promise.all([
      app.waitForEvent('window'),
      previewFrom(page, 'Entire Project'),
    ]);
    const complete = () =>
      preview.evaluate(
        () =>
          (
            window as unknown as {
              VEDRAOPUS_PLAYER: { engine: { getTracking(): { complete: boolean } } };
            }
          ).VEDRAOPUS_PLAYER.engine.getTracking().complete,
      );
    await expect(preview.locator('[data-object-type="button"]')).toBeVisible();
    // One slide, every slide seen: but this course completes only by trigger.
    expect(await complete()).toBe(false);
    await preview.locator('[data-object-type="button"]').click();
    await expect.poll(complete).toBe(true);
    await preview.close();
  } finally {
    await app.close();
  }
});

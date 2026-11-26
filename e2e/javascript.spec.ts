import { expect, test } from '@playwright/test';
import { answerDialogs, launchApp } from './launch';

test('a Run JavaScript trigger made in the wizard runs in preview, not in the editor', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();

    await page.getByTestId('ribbon').getByRole('tab', { name: 'Insert', exact: true }).click();
    await page.getByRole('button', { name: 'Variables', exact: true }).click();
    const variables = page.getByTestId('variables-dialog');
    await variables.getByRole('button', { name: 'Add variable' }).click();
    await variables.getByLabel('Variable name').fill('Clicks');
    await variables.getByLabel('Variable name').press('Enter');
    await variables.getByLabel('Variable type').selectOption('number');
    await variables.getByRole('button', { name: 'Close' }).click();

    // A text box showing the variable, and a button.
    await page.getByRole('button', { name: 'Text Box', exact: true }).click();
    const box = page.locator('.stage-slide > [data-object-type="text"]');
    const bounds = (await box.boundingBox())!;
    await box.dblclick({ position: { x: bounds.width / 4, y: bounds.height / 2 } });
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Clicks: %Clicks%');
    await page.keyboard.press('Escape');
    await page.getByTestId('ribbon').getByRole('tab', { name: 'Insert', exact: true }).click();
    await page.getByRole('button', { name: 'Button', exact: true }).click();

    await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
    await page.getByRole('button', { name: 'New trigger' }).click();
    const wizard = page.getByTestId('trigger-wizard');
    await wizard.getByLabel('Action', { exact: true }).selectOption('executeJavaScript');
    const code = wizard.getByLabel('Action code');
    await code.fill("player.setVar('Clicks', player.getVar('clicks') + 1);");
    await code.blur();
    await expect(page.getByTestId('trigger-sentence')).toContainText(
      "Run JavaScript (player.setVar('Clicks', player.getVar('c…) when the learner clicks Button",
    );
    await wizard.getByRole('button', { name: 'Add trigger' }).click();

    // The editor shows the reference; nothing has run.
    await expect(box).toContainText('Clicks: %Clicks%');

    await page.getByTestId('ribbon').getByRole('tab', { name: 'Home', exact: true }).click();
    const [preview] = await Promise.all([
      app.waitForEvent('window'),
      page.getByRole('button', { name: 'This Slide', exact: true }).click(),
    ]);
    const errors: string[] = [];
    preview.on('pageerror', (error) => errors.push(error.message));
    preview.on('console', (message) => {
      // Electron's own notice about the preview's 'unsafe-eval', which this
      // trigger needs. Unpackaged builds print it (seen on Windows); the
      // packaged app never does. Anything else is still a failure.
      if (message.text().startsWith('Electron Security Warning (Insecure Content-Security-Policy)'))
        return;
      if (message.type() === 'warning' || message.type() === 'error') errors.push(message.text());
    });
    const text = preview.locator('[data-object-type="text"]');
    await expect(text).toContainText('Clicks: 0');
    await preview.locator('[data-object-type="button"]').click();
    await preview.locator('[data-object-type="button"]').click();
    await expect(text).toContainText('Clicks: 2');
    expect(errors).toEqual([]);
    await preview.close();
  } finally {
    await app.close();
  }
});

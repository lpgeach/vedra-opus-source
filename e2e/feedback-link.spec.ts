import { expect, test } from '@playwright/test';
import { answerDialogs, launchApp } from './launch';

/**
 * Help → Send Feedback… (docs/briefs/B6-feedback-link.md) and Feedback in the title bar
 * (docs/briefs/B29-feedback-button.md) open the feedback site in the author's browser with the
 * version and computer filled in. The browser is stubbed here, so nothing opens on the desktop.
 */
test('Help → Send Feedback… and the title bar open the feedback site with the version and computer', async () => {
  const { app, page } = await launchApp();
  try {
    await app.evaluate(({ shell }) => {
      const opened: string[] = [];
      (globalThis as unknown as { voOpened: string[] }).voOpened = opened;
      shell.openExternal = (url: string) => {
        opened.push(url);
        return Promise.resolve();
      };
    });

    const item = await app.evaluate(({ Menu }) => {
      const found = Menu.getApplicationMenu()!.getMenuItemById('help.sendFeedback')!;
      return { label: found.label, enabled: found.enabled };
    });
    expect(item).toEqual({ label: 'Send Feedback…', enabled: true });

    await app.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()!.getMenuItemById('help.sendFeedback')!.click();
    });
    const opened = await app.evaluate(
      () => (globalThis as unknown as { voOpened: string[] }).voOpened,
    );
    const version = await app.evaluate(({ app: electronApp }) => electronApp.getVersion());

    expect(opened).toHaveLength(1);
    const url = new URL(opened[0]!);
    expect(`${url.origin}${url.pathname}`).toBe('https://vedra-opus-feedback.vercel.app/');
    expect(url.searchParams.get('v')).toBe(version);
    expect(url.searchParams.get('os')).toMatch(/^(Windows 1[01]|macOS( [\d.]+)?|Linux)$/);

    // The title bar's button opens the same address, on the Welcome screen and in the editor.
    const addresses = () =>
      app.evaluate(() => (globalThis as unknown as { voOpened: string[] }).voOpened);
    const button = page
      .getByTestId('title-bar')
      .getByRole('button', { name: 'Feedback', exact: true });
    await expect(button).toBeVisible();
    await button.click();
    await expect.poll(addresses).toEqual([opened[0], opened[0]]);

    await answerDialogs(app, { message: [1] });
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await expect(button).toBeVisible();
    await button.click();
    await expect.poll(addresses).toEqual([opened[0], opened[0], opened[0]]);

    // It sits just before Donate, within the bar's one row.
    const bar = (await page.getByTestId('title-bar').boundingBox())!;
    const feedback = (await button.boundingBox())!;
    const donate = (await page.getByTestId('donate').boundingBox())!;
    expect(feedback.x + feedback.width).toBeLessThanOrEqual(donate.x);
    expect(feedback.y).toBeGreaterThanOrEqual(bar.y);
    expect(feedback.y + feedback.height).toBeLessThanOrEqual(bar.y + bar.height);
  } finally {
    await app.close();
  }
});

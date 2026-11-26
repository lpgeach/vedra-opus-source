import { expect, test } from '@playwright/test';
import { answerDialogs, launchApp } from './launch';

/**
 * Donate (docs/briefs/B9-donate.md): a button in the title bar, on the Welcome screen and in the
 * editor, and Help → Donate…, each opening the Ko-fi page in the browser. The browser is
 * stubbed here, so nothing opens on the desktop.
 */
test('Donate opens the Ko-fi page, from the Welcome screen, the editor and the Help menu', async () => {
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
    const opened = () =>
      app.evaluate(() => (globalThis as unknown as { voOpened: string[] }).voOpened);
    const donate = page
      .getByTestId('title-bar')
      .getByRole('button', { name: 'Donate', exact: true });

    // On the Welcome screen.
    await expect(donate).toBeVisible();
    await donate.click();
    await expect.poll(opened).toEqual(['https://ko-fi.com/lukegeach']);

    // In the editor.
    await answerDialogs(app, { message: [1] });
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await expect(donate).toBeVisible();
    await donate.click();
    await expect.poll(opened).toHaveLength(2);

    // Help → Donate….
    const label = await app.evaluate(({ Menu }) => {
      const item = Menu.getApplicationMenu()!.getMenuItemById('help.donate')!;
      item.click();
      return item.label;
    });
    expect(label).toBe('Donate…');
    await expect
      .poll(opened)
      .toEqual([
        'https://ko-fi.com/lukegeach',
        'https://ko-fi.com/lukegeach',
        'https://ko-fi.com/lukegeach',
      ]);
  } finally {
    await app.close();
  }
});

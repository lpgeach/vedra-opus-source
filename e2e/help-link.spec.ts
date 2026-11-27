import { expect, test } from '@playwright/test';
import { launchApp } from './launch';

/**
 * Help → Vedra Opus Help (docs/briefs/B30-help-link.md) opens the published guide in the
 * author's browser. The browser is stubbed here, so nothing opens on the desktop.
 */
test('Help → Vedra Opus Help is first in the Help menu and opens the guide', async () => {
  const { app } = await launchApp();
  try {
    await app.evaluate(({ shell }) => {
      const opened: string[] = [];
      (globalThis as unknown as { voOpened: string[] }).voOpened = opened;
      shell.openExternal = (url: string) => {
        opened.push(url);
        return Promise.resolve();
      };
    });

    const first = await app.evaluate(({ Menu }) => {
      const help = Menu.getApplicationMenu()!.items.find((item) =>
        item.submenu?.getMenuItemById('help.guide'),
      )!;
      const item = help.submenu!.items[0]!;
      item.click();
      return { id: item.id, label: item.label };
    });

    expect(first).toEqual({ id: 'help.guide', label: 'Vedra Opus Help' });
    await expect
      .poll(() => app.evaluate(() => (globalThis as unknown as { voOpened: string[] }).voOpened))
      .toEqual(['https://github.com/lpgeach/vedra-opus-releases/blob/main/help/README.md']);
  } finally {
    await app.close();
  }
});

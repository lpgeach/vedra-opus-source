import { expect, test } from '@playwright/test';
import { launchApp } from './launch';

/**
 * Help → Send Feedback… (docs/briefs/B6-feedback-link.md) opens the feedback site in the
 * author's browser with the version and computer filled in. The browser is stubbed here, so
 * nothing opens on the desktop.
 */
test('Help → Send Feedback… opens the feedback site with the version and computer', async () => {
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
  } finally {
    await app.close();
  }
});

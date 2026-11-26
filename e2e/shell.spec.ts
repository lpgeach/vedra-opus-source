import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp, windowsHidden } from './launch';

const { version } = JSON.parse(
  readFileSync(join(import.meta.dirname, '../apps/desktop/package.json'), 'utf8'),
) as { version: string };

test('launches and reads app info through typed IPC', async () => {
  const { app, page } = await launchApp();
  try {
    await expect(page).toHaveTitle('Vedra Opus');
    await expect(page.getByTestId('app-info')).toContainText(`Version ${version}`);

    const info = await page.evaluate(() => window.vedraopus.app.getInfo());
    expect(info.version).toBe(version);
    expect(info.platform).toBe(process.platform);
  } finally {
    await app.close();
  }
});

// contextBridge only works with context isolation on, so a working bridge plus
// no Node globals shows sandbox, isolation and nodeIntegration are all as intended.
test('renderer is sandboxed from Node', async () => {
  const { app, page } = await launchApp();
  try {
    const exposure = await page.evaluate(() => ({
      require: typeof (globalThis as Record<string, unknown>)['require'],
      process: typeof (globalThis as Record<string, unknown>)['process'],
      bridgeKeys: Object.keys(window.vedraopus),
    }));
    // The bridge is the renderer's entire reach into the OS; growing it should be deliberate.
    expect(exposure).toEqual({
      require: 'undefined',
      process: 'undefined',
      // `speech` (P6.8): the system's voices, and making a sound from text.
      // `screen` (P9.11): the screens and windows that can be recorded, and the author's choice.
      // `template` (P11.2): listing, saving, opening and deleting templates.
      bridgeKeys: [
        'app',
        'project',
        'template',
        'publish',
        'screen',
        'speech',
        'preview',
        'settings',
        'clipboard',
        'events',
      ],
    });
  } finally {
    await app.close();
  }
});

test('restores window size after restart', async () => {
  // The off-screen surface has no real screen to place windows on. This runs in
  // CI on all three systems, and locally with VEDRAOPUS_E2E_SHOW=1.
  test.skip(windowsHidden, 'windows are hidden; run with VEDRAOPUS_E2E_SHOW=1');
  // Small enough to fit a 1024×768 CI display; the OS clamps new windows to the screen.
  const wanted = [1000, 650];

  const first = await launchApp();
  const applied = await first.app.evaluate(async ({ BrowserWindow }, [width, height]) => {
    const [win] = BrowserWindow.getAllWindows();
    win!.unmaximize();
    win!.setSize(width!, height!);
    // Give the window manager a moment to accept or override the request.
    await new Promise((resolve) => setTimeout(resolve, 500));
    return win!.getSize();
  }, wanted);
  await first.app.close();

  // A placement is always saved on close, whatever the window manager did.
  const saved = JSON.parse(readFileSync(join(first.userDataDir, 'window-state.json'), 'utf8')) as {
    bounds: { width: number; height: number };
  };
  expect(saved.bounds.width).toBeGreaterThan(0);
  expect(saved.bounds.height).toBeGreaterThan(0);

  // Tiling window managers size windows themselves, so the exact round trip can
  // only be checked where the requested size was honoured in the first place.
  test.skip(
    applied[0] !== wanted[0] || applied[1] !== wanted[1],
    'window manager does not honour requested window sizes',
  );
  expect([saved.bounds.width, saved.bounds.height]).toEqual(wanted);

  const second = await launchApp({ userDataDir: first.userDataDir });
  try {
    const size = await second.app.evaluate(({ BrowserWindow }) => {
      const [win] = BrowserWindow.getAllWindows();
      return win!.getSize();
    });
    expect(size).toEqual(wanted);
  } finally {
    await second.app.close();
  }
});

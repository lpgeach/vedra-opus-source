import { expect, test } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import { answerDialogs, launchApp, windowsHidden } from './launch';

const DONT_SAVE = 1;

/**
 * One title bar (docs/briefs/B1-title-bar.md): the menu behind a hamburger, the
 * common commands as icons, the title, Publish and the views, and the window's
 * own buttons at the end of the same row.
 */

/** Record the application menu's pop-ups instead of showing them on the desktop. */
async function recordMenuPopups(app: ElectronApplication) {
  await app.evaluate(({ Menu }) => {
    const shown: { x?: number; y?: number; window: boolean }[] = [];
    (globalThis as unknown as { voPopups: typeof shown }).voPopups = shown;
    const menu = Menu.getApplicationMenu()!;
    menu.popup = (options) => {
      shown.push({ x: options?.x, y: options?.y, window: Boolean(options?.window) });
    };
  });
}
const popups = (app: ElectronApplication) =>
  app.evaluate(() => (globalThis as unknown as { voPopups: unknown[] }).voPopups);

test('the bar holds the menu, the commands, the title, Publish and the views, on one row with the window’s buttons', async () => {
  const { app, page } = await launchApp();
  try {
    // The new slide below leaves changes: closing asks, and Don't Save answers (unanswered, a
    // real dialog would hold the app open until the test timed out).
    await answerDialogs(app, { message: [DONT_SAVE] });
    const bar = page.getByTestId('title-bar');
    await expect(bar).toBeVisible();
    // Before a project: the menu alone.
    await expect(bar.getByRole('button', { name: 'Menu', exact: true })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);

    // The hamburger opens the whole application menu, just below itself.
    await recordMenuPopups(app);
    const menuButton = bar.getByRole('button', { name: 'Menu', exact: true });
    await menuButton.click();
    const at = (await menuButton.boundingBox())!;
    await expect
      .poll(() => popups(app))
      .toEqual([{ x: Math.round(at.x), y: Math.round(at.y + at.height), window: true }]);

    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    for (const name of ['Menu', 'Save', 'Undo', 'Redo', 'Preview', 'Publish']) {
      await expect(bar.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await expect(bar.getByTestId('project-title')).toHaveValue('Untitled Project');
    const views = bar.getByRole('group', { name: 'View', exact: true });
    await expect(views.getByRole('button')).toHaveText(['Overview', 'Slide View', 'Master View']);

    // One row: everything in the bar sits within its 40 pixels.
    const box = (await bar.boundingBox())!;
    expect(box.y).toBe(0);
    expect(box.height).toBe(40);
    for (const name of ['Menu', 'Publish']) {
      const button = (await bar.getByRole('button', { name, exact: true }).boundingBox())!;
      expect(button.y).toBeGreaterThanOrEqual(0);
      expect(button.y + button.height).toBeLessThanOrEqual(40);
    }

    // The window's own buttons: drawn by the system at the end of the bar (Windows and Linux),
    // or the traffic lights at its start (macOS); either way the overlay is on, and the bar
    // keeps clear of it.
    const overlay = await page.evaluate(() => {
      const controls = (navigator as unknown as { windowControlsOverlay?: { visible: boolean } })
        .windowControlsOverlay;
      return { visible: controls?.visible ?? false, width: innerWidth };
    });
    // With no screen at all (Linux, run headless here) there is no frame and so no overlay;
    // under a real display, CI's included, it is there.
    expect(overlay.visible).toBe(!windowsHidden);
    const publish = (await bar
      .getByRole('button', { name: 'Publish', exact: true })
      .boundingBox())!;
    const masterView = (await views.getByRole('button', { name: 'Master View' }).boundingBox())!;
    expect(publish.x).toBeLessThan(masterView.x);
    if (process.platform !== 'darwin' && !windowsHidden) {
      // The system's buttons take the right end: the views stop short of it.
      expect(masterView.x + masterView.width).toBeLessThan(overlay.width - 100);
    }

    // Preview from the bar.
    const [preview] = await Promise.all([
      app.waitForEvent('window'),
      bar.getByRole('button', { name: 'Preview', exact: true }).click(),
    ]);
    await expect(preview.locator('.vo-player')).toBeVisible();
    await preview.close();

    // The menu's keyboard shortcuts still work with no menu bar (Windows and Linux): Ctrl+M,
    // a new slide. On macOS the system's menu bar takes real key presses as always, and an
    // injected key never reaches it.
    if (process.platform !== 'darwin') {
      const slides = page.getByTestId('slide-list').locator('.slide-item');
      await expect(slides).toHaveCount(1);
      await page.getByTestId('stage-canvas').click({ position: { x: 5, y: 5 } });
      // Through Electron's own input path (Playwright's key presses never reach the menu).
      await app.evaluate(({ BrowserWindow }) => {
        const contents = BrowserWindow.getAllWindows()[0]!.webContents;
        contents.sendInputEvent({ type: 'keyDown', keyCode: 'M', modifiers: ['control'] });
        contents.sendInputEvent({ type: 'keyUp', keyCode: 'M', modifiers: ['control'] });
      });
      await expect(slides).toHaveCount(2);
    }
  } finally {
    await app.close();
  }
});

test('the window’s buttons take the bar’s colours when the theme changes (Windows and Linux)', async () => {
  test.skip(process.platform === 'darwin', 'macOS has its traffic lights');
  test.skip(windowsHidden, 'no screen, so no window buttons to colour (Linux, run headless)');
  const { app, page } = await launchApp();
  try {
    await expect(page.getByTestId('title-bar')).toBeVisible();
    await app.evaluate(({ BrowserWindow }) => {
      const seen: unknown[] = [];
      (globalThis as unknown as { voOverlay: unknown[] }).voOverlay = seen;
      const window = BrowserWindow.getAllWindows()[0]!;
      const original = window.setTitleBarOverlay.bind(window);
      window.setTitleBarOverlay = (options) => {
        seen.push(options);
        original(options);
      };
    });
    for (const [theme, color, symbolColor] of [
      ['dark', '#1f2227', '#e7e9ee'],
      ['light', '#f7f8fa', '#1d2026'],
    ] as const) {
      await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
      await expect
        .poll(() =>
          app.evaluate(() => (globalThis as unknown as { voOverlay: unknown[] }).voOverlay.at(-1)),
        )
        .toEqual({ color, symbolColor, height: 40 });
    }
  } finally {
    await app.close();
  }
});

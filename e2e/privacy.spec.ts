import { expect, test } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packTwoSlides } from './fixture';
import { answerDialogs, launchApp, leavingRequests, previewFrom } from './launch';

/**
 * Crash reports and telemetry (docs/briefs/P11.5-hardening.md, part C): crash
 * reports are kept only when the author asks, on this machine; and the app
 * makes no request that leaves the machine.
 */

async function clickMenuItem(app: ElectronApplication, id: string): Promise<void> {
  await app.evaluate(({ Menu }, menuId) => {
    Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click();
  }, id);
}

const menuChecked = (app: ElectronApplication, id: string) =>
  app.evaluate(
    ({ Menu }, menuId) => Menu.getApplicationMenu()!.getMenuItemById(menuId)!.checked,
    id,
  );

/** Crash the editor's window on purpose, and wait a moment for any report to be written. */
async function crashWindow(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.webContents.forcefullyCrashRenderer();
  });
  await new Promise((resolve) => setTimeout(resolve, 3000));
}

/** The crash reports written so far (not uploaded: their ids are empty). */
const reports = (app: ElectronApplication) =>
  app.evaluate(({ crashReporter }) => crashReporter.getUploadedReports().length);

test('crash reports are off until asked for, then kept on this machine from the next start', async () => {
  test.setTimeout(120_000);
  const userDataDir = mkdtempSync(join(tmpdir(), 'vo-e2e-crash-'));
  let launched = await launchApp({ userDataDir });
  try {
    expect(await menuChecked(launched.app, 'help.keepCrashReports')).toBe(false);
    await answerDialogs(launched.app, { message: [0] });
    await clickMenuItem(launched.app, 'help.keepCrashReports');
    await expect.poll(() => menuChecked(launched.app, 'help.keepCrashReports')).toBe(true);
    const settings = JSON.parse(readFileSync(join(userDataDir, 'settings.json'), 'utf8')) as {
      keepCrashReports: boolean;
    };
    expect(settings.keepCrashReports).toBe(true);
    // Not kept yet this time: a crash now leaves no report.
    await crashWindow(launched.app);
    expect(await reports(launched.app)).toBe(0);
  } finally {
    await launched.app.close();
  }

  // Next start: the reporter runs, and a crash leaves a report on this machine, unsent.
  launched = await launchApp({ userDataDir });
  try {
    expect(await menuChecked(launched.app, 'help.keepCrashReports')).toBe(true);
    const reporter = await launched.app.evaluate(({ app, crashReporter }) => ({
      folder: app.getPath('crashDumps'),
      upload: crashReporter.getUploadToServer(),
    }));
    expect(reporter.upload).toBe(false);

    // Show Crash Reports opens that folder (stubbed here, so no window opens on the desktop).
    await launched.app.evaluate(({ shell }) => {
      const opened: string[] = [];
      (globalThis as unknown as { voOpened: string[] }).voOpened = opened;
      shell.openPath = (path: string) => {
        opened.push(path);
        return Promise.resolve('');
      };
    });
    await clickMenuItem(launched.app, 'help.showCrashReports');
    const opened = await launched.app.evaluate(
      () => (globalThis as unknown as { voOpened: string[] }).voOpened,
    );
    expect(opened).toEqual([reporter.folder]);

    await crashWindow(launched.app);
    await expect.poll(() => reports(launched.app), { timeout: 15_000 }).toBeGreaterThan(0);
    expect(existsSync(reporter.folder)).toBe(true);
  } finally {
    await launched.app.close();
  }
});

test('a session of editing, previewing and publishing makes no request that leaves the machine', async () => {
  test.setTimeout(120_000);
  const work = mkdtempSync(join(tmpdir(), 'vo-e2e-privacy-'));
  const projectFile = await packTwoSlides(work);
  const out = join(work, 'out');
  const { app, page } = await launchApp({ args: [projectFile] });
  try {
    // Every request any of the app's sessions makes, from now on.
    await app.evaluate(({ session }) => {
      const urls: string[] = [];
      (globalThis as unknown as { voRequests: string[] }).voRequests = urls;
      for (const each of [session.defaultSession, session.fromPartition('vedraopus-preview')]) {
        each.webRequest.onBeforeRequest((details, callback) => {
          urls.push(details.url);
          callback({});
        });
      }
    });
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await answerDialogs(app, { open: [[out]], message: [1] });

    // Edit: a new text box on the slide.
    const texts = page.getByTestId('stage-canvas').locator('[data-object-type="text"]');
    const before = await texts.count();
    await clickMenuItem(app, 'insert.textBox');
    await expect(texts).toHaveCount(before + 1);

    // Preview the project, then close it.
    const [preview] = await Promise.all([
      app.waitForEvent('window'),
      previewFrom(page, 'Entire Project'),
    ]);
    await expect(preview.locator('.vo-player-position')).toBeVisible();
    await preview.close();

    // Publish to a folder.
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const dialog = page.getByTestId('publish-dialog');
    await dialog.getByRole('button', { name: 'Choose folder…' }).click();
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-result')).toContainText('Published');
    await dialog.getByRole('button', { name: 'Close' }).click();

    const requests = await app.evaluate(
      () => (globalThis as unknown as { voRequests: string[] }).voRequests,
    );
    // The session did use the app's own schemes, so requests were being seen.
    expect(requests.some((url) => url.startsWith('vedraopus-asset:'))).toBe(true);
    expect(requests.some((url) => url.startsWith('vedraopus-preview:'))).toBe(true);
    expect(leavingRequests(requests)).toEqual([]);
  } finally {
    await app.close();
  }
});

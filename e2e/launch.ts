import { _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const appDir = join(import.meta.dirname, '../apps/desktop');

/**
 * On a Linux desktop, the app draws to an off-screen surface so test runs do
 * not pop windows up over whatever the developer is doing. CI already has a
 * virtual display, and VEDRAOPUS_E2E_SHOW=1 brings the windows back for
 * debugging. Tests about real window geometry cannot run while hidden.
 */
export const windowsHidden =
  process.platform === 'linux' && !process.env['CI'] && !process.env['VEDRAOPUS_E2E_SHOW'];

/**
 * Windows and macOS have no off-screen surface, so there the windows are real
 * but transparent, click-through, out of the taskbar and never focused, and
 * each app has a clipboard of its own (`transparent-windows.cjs`). Window
 * geometry still works; two apps cannot share a copy.
 */
export const windowsTransparent =
  process.platform !== 'linux' && !process.env['CI'] && !process.env['VEDRAOPUS_E2E_SHOW'];

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
  userDataDir: string;
}

/**
 * Launch the app with an isolated user-data directory. Pass `userDataDir` to
 * relaunch against the same settings, e.g. to test persistence.
 *
 * By default this runs the build in apps/desktop/out (`npm run e2e` builds it
 * first). Set VEDRAOPUS_E2E_EXECUTABLE to a packaged binary to run the same
 * tests against an installer's output instead.
 */
export async function launchApp(
  options: { userDataDir?: string; args?: string[]; env?: Record<string, string> } = {},
): Promise<LaunchedApp> {
  const userDataDir = options.userDataDir ?? mkdtempSync(join(tmpdir(), 'vedraopus-e2e-'));

  // Editors built on Electron (VS Code and friends) export ELECTRON_RUN_AS_NODE
  // into their terminals, which would make our app start as plain Node.
  const env = {
    ...process.env,
    ...options.env,
    VEDRAOPUS_USER_DATA: userDataDir,
  } as Record<string, string>;
  delete env['ELECTRON_RUN_AS_NODE'];

  const flags = windowsHidden ? ['--ozone-platform=headless'] : [];
  // A Node option, so it goes before the app's folder. Electron takes `-r`
  // (CommonJS), as Playwright's own hook does, but not `--import`.
  const preload = windowsTransparent
    ? ['-r', join(import.meta.dirname, 'transparent-windows.cjs')]
    : [];

  const executablePath = process.env['VEDRAOPUS_E2E_EXECUTABLE'];
  const app = await electron.launch(
    executablePath
      ? { executablePath, args: [...preload, ...flags, ...(options.args ?? [])], env }
      : { args: [...preload, appDir, ...flags, ...(options.args ?? [])], env },
  );
  // Every window acts as the focused one, as Playwright does for browser pages:
  // transparent windows never get the system's focus, and a page without it
  // sends no focus events, which the text editor relies on.
  app.on('window', (window) => {
    // A window that closes at once (a preview the test is done with) is fine.
    emulateFocus(window).catch(() => undefined);
  });
  const page = await app.firstWindow();
  await emulateFocus(page);
  return { app, page, userDataDir };
}

/**
 * The requests among `urls` that would leave the machine: http(s), ws(s) or ftp.
 * When the tests run against the dev renderer (`ELECTRON_RENDERER_URL`), its own
 * Vite server on this machine serves the editor, and only that host is let through.
 */
export function leavingRequests(urls: readonly string[]): string[] {
  const dev = process.env['ELECTRON_RENDERER_URL'];
  const devHost = dev ? new URL(dev).host : null;
  return urls.filter(
    (url) => /^(https?|wss?|ftp):/i.test(url) && !(devHost && new URL(url).host === devHost),
  );
}

const focusEmulated = new WeakSet<Page>();

async function emulateFocus(page: Page): Promise<void> {
  if (focusEmulated.has(page)) return;
  focusEmulated.add(page);
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true });
}

/**
 * Native dialogs cannot be driven from a test, so replace them in the main
 * process with canned answers. Each call consumes the next answer in its list;
 * a dialog with no answer left fails the test loudly instead of hanging.
 */
export async function answerDialogs(
  app: ElectronApplication,
  answers: {
    /** Files "chosen" in successive open dialogs. */
    open?: string[][];
    /** Paths "chosen" in successive save dialogs. */
    save?: string[];
    /** Button indexes "clicked" in successive message boxes. */
    message?: number[];
  },
): Promise<void> {
  await app.evaluate(({ dialog }, { open = [], save = [], message = [] }) => {
    const next = <T>(queue: T[], what: string): T => {
      if (queue.length === 0) throw new Error(`Unexpected ${what} dialog during a test`);
      return queue.shift() as T;
    };
    dialog.showOpenDialog = () =>
      Promise.resolve({ canceled: false, filePaths: next(open, 'open') });
    dialog.showSaveDialog = () =>
      Promise.resolve({ canceled: false, filePath: next(save, 'save') });
    dialog.showMessageBox = () =>
      Promise.resolve({ response: next(message, 'message'), checkboxChecked: false });
  }, answers);
}

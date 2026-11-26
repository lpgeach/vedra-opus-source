import { expect, test } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { launchApp } from './launch';

/**
 * Updates (docs/briefs/P11.4-signing-and-updates.md, part B): off until the
 * author asks; a development build checks nothing; with a feed (here one served
 * on this machine), Check for Updates… offers a newer version and downloads
 * nothing unless asked.
 */

const clickMenuItem = (app: ElectronApplication, id: string) =>
  app.evaluate(({ Menu }, menuId) => {
    Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click();
  }, id);

const menuChecked = (app: ElectronApplication, id: string) =>
  app.evaluate(
    ({ Menu }, menuId) => Menu.getApplicationMenu()!.getMenuItemById(menuId)!.checked,
    id,
  );

/** Record every message box's words, and answer each with `answer`. */
async function recordMessages(app: ElectronApplication, answer: number): Promise<void> {
  await app.evaluate(({ dialog }, response) => {
    const seen: string[] = [];
    (globalThis as unknown as { voMessages: string[] }).voMessages = seen;
    dialog.showMessageBox = ((...args: unknown[]) => {
      const options = args.find((arg) => arg && typeof arg === 'object' && 'message' in arg) as {
        message: string;
      };
      seen.push(options.message);
      return Promise.resolve({ response, checkboxChecked: false });
    }) as typeof dialog.showMessageBox;
  }, answer);
}

const messages = (app: ElectronApplication) =>
  app.evaluate(() => (globalThis as unknown as { voMessages: string[] }).voMessages);

test('updates are off by default, and a development build says it checks nothing', async () => {
  const { app } = await launchApp();
  try {
    expect(await menuChecked(app, 'help.updatesAutomatic')).toBe(false);
    expect(await menuChecked(app, 'help.channel.stable')).toBe(true);
    await recordMessages(app, 0);
    await clickMenuItem(app, 'help.checkForUpdates');
    await expect
      .poll(() => messages(app))
      .toEqual(['Updates are checked in installed copies of Vedra Opus.']);

    // The channel is remembered.
    await clickMenuItem(app, 'help.channel.beta');
    await expect.poll(() => menuChecked(app, 'help.channel.beta')).toBe(true);
  } finally {
    await app.close();
  }
});

test('Check for Updates… offers a newer version from the feed, and Later downloads nothing', async () => {
  const requested: string[] = [];
  const server = createServer((request, response) => {
    // electron-updater adds a query to keep caches out of the way; the path is what counts.
    const path = (request.url ?? '').split('?')[0]!;
    requested.push(path);
    if (/^\/latest(-linux|-mac)?\.yml$/.test(path)) {
      response.writeHead(200, { 'content-type': 'text/yaml' });
      response.end(
        [
          'version: 9.9.9',
          'files:',
          '  - url: Vedra-Opus-9.9.9.exe',
          '    sha512: AAAA',
          '    size: 1',
          'path: Vedra-Opus-9.9.9.exe',
          'sha512: AAAA',
          "releaseDate: '2026-11-22T00:00:00.000Z'",
          '',
        ].join('\n'),
      );
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const { app } = await launchApp({ env: { VEDRAOPUS_UPDATE_FEED: `http://127.0.0.1:${port}/` } });
  try {
    // Nothing is asked of the feed until the author checks.
    expect(requested).toEqual([]);
    await recordMessages(app, 1);
    await clickMenuItem(app, 'help.checkForUpdates');
    await expect.poll(() => messages(app)).toEqual(['Vedra Opus 9.9.9 is available.']);
    expect(requested.some((url) => /^\/latest(-linux|-mac)?\.yml$/.test(url))).toBe(true);
    // Later: nothing downloaded.
    expect(requested.some((url) => url.includes('9.9.9.'))).toBe(false);
  } finally {
    await app.close();
    server.close();
  }
});

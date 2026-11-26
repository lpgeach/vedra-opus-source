import { expect, test } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { packTwoSlides } from './fixture';
import { answerDialogs, launchApp } from './launch';

/**
 * Third-party notices and the source offer (docs/briefs/R2-notices-and-sources.md):
 * Help → Third-Party Notices… names what Vedra Opus ships and the libraries built
 * into it, with their licences, and a published course carries its player's.
 */

async function chooseMenuItem(app: ElectronApplication, id: string): Promise<void> {
  await app.evaluate(({ Menu }, menuId) => {
    Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click();
  }, id);
}

const os = { linux: 'linux', win32: 'win', darwin: 'mac' }[process.platform as string];
const vendor = (name: string) =>
  existsSync(resolve(import.meta.dirname, '..', 'vendor', name, `${os}-${process.arch}`));

test('Help → Third-Party Notices… shows the source offer, what ships, and the libraries with their licences', async () => {
  const { app, page } = await launchApp();
  try {
    await expect(page.getByRole('button', { name: 'New Project', exact: true })).toBeVisible();
    // Opening a large notice file goes to the system; stubbed, so nothing opens on the desktop.
    await app.evaluate(({ shell }) => {
      const opened: string[] = [];
      (globalThis as unknown as { voOpened: string[] }).voOpened = opened;
      shell.openPath = (path: string) => {
        opened.push(path);
        return Promise.resolve('');
      };
    });
    await chooseMenuItem(app, 'help.thirdPartyNotices');
    const dialog = page.getByTestId('notices-dialog');
    await expect(dialog.getByTestId('source-offer')).toContainText(
      'Their complete source code, exactly as built for this version, with the scripts that build them, is published with each release of Vedra Opus at https://github.com/lpgeach/vedra-opus-releases/releases',
    );

    const components = dialog.getByTestId('notice-components').getByTestId('notice');
    await expect(components.filter({ hasText: 'Electron, with Chromium' })).toContainText('MIT');
    if (vendor('ffmpeg')) {
      await expect(components.filter({ hasText: 'FFmpeg 8.1.3' })).toContainText(
        'LGPL-2.1-or-later',
      );
    }
    if (vendor('libreoffice')) {
      await expect(components.filter({ hasText: 'LibreOffice 26.8.3' })).toContainText('MPL-2.0');
    }
    await expect(components.filter({ hasText: 'SCORM schema files' })).toContainText('CC-BY-3.0');

    // Chromium's notices open outside the app.
    await components
      .filter({ hasText: 'Electron, with Chromium' })
      .getByRole('button', { name: 'Open full notices' })
      .click();
    await expect
      .poll(() => app.evaluate(() => (globalThis as unknown as { voOpened: string[] }).voOpened))
      .toEqual([expect.stringMatching(/LICENSES\.chromium\.html$/)]);

    // The libraries, each with its licence text on request.
    const packages = dialog.getByTestId('notice-packages').getByTestId('notice');
    const react = packages.filter({ hasText: /^react \d/ });
    await expect(react).toContainText('In the editor.');
    await react.getByRole('button', { name: 'Show licence' }).click();
    await expect(react.locator('pre')).toContainText('Permission is hereby granted');
    await expect(packages.filter({ hasText: /^zod \d/ })).toContainText(
      'In the editor and in the course player.',
    );
    await expect(packages.filter({ hasText: '@fontsource/inter' })).toContainText('OFL-1.1');

    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('a published course carries the notices of the libraries built into its player', async () => {
  const work = mkdtempSync(join(tmpdir(), 'vo-e2e-notices-'));
  const project = await packTwoSlides(work);
  const out = join(work, 'out');
  const { app, page } = await launchApp({ args: [project] });
  try {
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await answerDialogs(app, { open: [[out]] });
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const publish = page.getByTestId('publish-dialog');
    await publish.getByRole('button', { name: 'Choose folder…' }).click();
    await publish.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-result')).toContainText('Published');
  } finally {
    await app.close();
  }
  const [folder] = readdirSync(out);
  const text = readFileSync(join(out, folder!, 'THIRD-PARTY-NOTICES.txt'), 'utf8');
  expect(text).toContain('The course player (player/player.js) includes the following libraries.');
  expect(text).toMatch(/zod \d+\.\d+\.\d+ \(MIT\)/);
  expect(text).toContain('Permission is hereby granted');
});

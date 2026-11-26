import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveFolder } from '../packages/publish/browser/serve';
import { answerDialogs, launchApp, previewFrom } from './launch';

/**
 * Web objects (docs/briefs/P9.6-web-objects.md), made in the app: one from a
 * folder whose page runs a script, and one from an address shown in a new
 * window. They survive a save and a fresh start; in the published course the
 * folder's page runs and the button opens the address.
 */

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const webFormat = (page: Page) => page.getByTestId('web-format');

async function insert(page: Page, from: 'From a Folder…' | 'From a Web Address') {
  await ribbon(page, 'Insert');
  await page.getByRole('button', { name: 'Web Object', exact: true }).click();
  await page.getByRole('menuitem', { name: from, exact: true }).click();
}

test('web objects made in the app survive saving and work in the published course', async () => {
  test.setTimeout(150_000);
  const work = mkdtempSync(join(tmpdir(), 'vo-e2e-web-'));
  const site = join(work, 'quiz-game');
  mkdirSync(join(site, 'js'), { recursive: true });
  writeFileSync(
    join(site, 'index.html'),
    '<!doctype html><html><body><p id="out">waiting</p><script src="js/game.js"></script></body></html>',
  );
  writeFileSync(
    join(site, 'js', 'game.js'),
    "document.getElementById('out').textContent = 'game on';",
  );
  const file = join(work, 'web.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { open: [[site]], save: [file] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();

    await insert(page, 'From a Folder…');
    await page.getByRole('tab', { name: 'Format', exact: true }).click();
    await expect(webFormat(page).getByLabel('Web object title', { exact: true })).toHaveValue(
      'quiz-game',
    );
    await expect(webFormat(page).getByLabel('Web object start page', { exact: true })).toHaveValue(
      'index.html',
    );
    await expect(webFormat(page)).toContainText('2 files from a folder');

    await insert(page, 'From a Web Address');
    const address = webFormat(page).getByLabel('Web address', { exact: true });
    await address.fill('https://example.com/help');
    await address.press('Enter');
    const title = webFormat(page).getByLabel('Web object title', { exact: true });
    await title.fill('Help site');
    await title.press('Enter');
    await webFormat(page).getByLabel('Web object shown', { exact: true }).selectOption('window');

    await ribbon(page, 'Home');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('project-status')).toContainText('Saved');
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ args: [file] });
  try {
    const { app, page } = second;
    await answerDialogs(app, { open: [[out]], message: [1] });
    // Preview runs the folder's page from the project's copy, and does not load the address.
    await ribbon(page, 'Home');
    const [preview] = await Promise.all([
      app.waitForEvent('window'),
      previewFrom(page, 'Entire Project'),
    ]);
    await expect(preview.frameLocator('.vo-player-stage iframe.vo-web').locator('#out')).toHaveText(
      'game on',
    );
    await expect(preview.locator('.vo-player-stage iframe')).toHaveCount(1);
    await expect(
      preview.getByRole('button', { name: 'Open in browser', exact: true }),
    ).toBeVisible();
    await preview.close();
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const publish = page.getByTestId('publish-dialog');
    await publish.getByRole('button', { name: 'Choose folder…' }).click();
    await publish.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-result')).toBeVisible();
  } finally {
    await second.app.close();
  }

  // Served from this machine (127.0.0.1), as an LMS or web server would: opened straight from
  // disk, browsers do not let a sandboxed page load its own other files (pitfall #124).
  const served = await serveFolder(
    join(out, 'untitled-project'),
    '<!doctype html><title>LMS</title>',
  );
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    // Nothing goes off the machine: web addresses are refused; window.open is recorded.
    await page.route('**/*', (route) =>
      new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
    );
    await page.addInitScript(() => {
      const opened: string[] = [];
      (window as unknown as { opened: string[] }).opened = opened;
      window.open = (url?: string | URL) => {
        opened.push(String(url));
        return null;
      };
    });
    await page.goto(`${served.base}course/index.html`);
    // The folder's page, with its script beside it, runs in its frame.
    const game = page.frameLocator('.vo-player-stage iframe.vo-web');
    await expect(game.locator('#out')).toHaveText('game on');
    await page.getByRole('button', { name: 'Help site', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { opened: string[] }).opened))
      .toEqual(['https://example.com/help']);
  } finally {
    await browser.close();
    served.close();
  }
});

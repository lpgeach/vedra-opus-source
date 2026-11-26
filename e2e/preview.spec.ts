import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packTwoSlides } from './fixture';
import { answerDialogs, launchApp, previewFrom } from './launch';

async function start(): Promise<{ app: ElectronApplication; page: Page }> {
  const file = await packTwoSlides(mkdtempSync(join(tmpdir(), 'vedraopus-e2e-preview-')));
  const { app, page } = await launchApp({ args: [file] });
  await expect(page.getByTestId('stage-canvas')).toBeVisible();
  await answerDialogs(app, { message: [1] });
  return { app, page };
}

/** Click a Preview command and return the preview window's page. */
async function openPreview(
  app: ElectronApplication,
  page: Page,
  name: 'This Slide' | 'This Scene' | 'Entire Project',
): Promise<Page> {
  const [preview] = await Promise.all([app.waitForEvent('window'), previewFrom(page, name)]);
  await expect(preview.locator('.vo-player-position')).toBeVisible();
  return preview;
}

const position = (preview: Page) => preview.locator('.vo-player-position');

test('previews the whole project in a sandboxed window; Replay, Edit and Close work', async () => {
  const { app, page } = await start();
  try {
    const preview = await openPreview(app, page, 'Entire Project');
    expect(preview.url()).toMatch(/^vedraopus-preview:\/\/[0-9a-f]{32}\/index\.html$/);
    await expect(position(preview)).toHaveText('Slide 1 of 2');
    // The same player as a published course, with its picture loading.
    await expect(preview.locator('[data-object-type="image"]')).toBeVisible({ timeout: 5000 });

    // No bridge to the editor or the OS.
    const reach = await preview.evaluate(() => ({
      bridge: typeof (window as unknown as Record<string, unknown>)['vedraopus'],
      require: typeof (window as unknown as Record<string, unknown>)['require'],
    }));
    expect(reach).toEqual({ bridge: 'undefined', require: 'undefined' });

    await preview.getByRole('button', { name: 'Next' }).click();
    await expect(position(preview)).toHaveText('Slide 2 of 2');
    await preview.getByRole('button', { name: 'Replay' }).click();
    await expect(position(preview)).toHaveText('Slide 1 of 2');

    // Edit returns to the slide being previewed.
    await preview.getByRole('button', { name: 'Next' }).click();
    await expect(position(preview)).toHaveText('Slide 2 of 2');
    await Promise.all([
      preview.waitForEvent('close'),
      preview.getByRole('button', { name: 'Edit' }).click(),
    ]);
    await expect(page.getByTestId('project-status')).toContainText('Slide 2 of 2');
    expect(app.windows()).toHaveLength(1);
  } finally {
    await app.close();
  }
});

test('previews just this slide or this scene, and Close closes the window', async () => {
  const { app, page } = await start();
  try {
    await page.getByTestId('slide-list').getByRole('button').nth(1).click();
    await expect(page.getByTestId('project-status')).toContainText('Slide 2 of 2');

    const slide = await openPreview(app, page, 'This Slide');
    await expect(position(slide)).toHaveText('Slide 1 of 1');
    // The second slide's content (a group, which has no box of its own to be "visible").
    await expect(slide.locator('[data-object-type="group"]')).toHaveCount(1);
    await Promise.all([
      slide.waitForEvent('close'),
      slide.getByRole('button', { name: 'Close' }).click(),
    ]);
    expect(app.windows()).toHaveLength(1);

    const scene = await openPreview(app, page, 'This Scene');
    await expect(position(scene)).toHaveText('Slide 1 of 2');
    // Unsaved edits are previewed too: the preview uses the document as it is now.
    await scene.close();
  } finally {
    await app.close();
  }
});

test('the previewed page cannot navigate away from its own address', async () => {
  const { app, page } = await start();
  try {
    const preview = await openPreview(app, page, 'Entire Project');
    await preview.evaluate(() => {
      setTimeout(() => {
        location.href = 'https://example.com/';
      }, 50);
    });
    await page.waitForTimeout(1000);
    // Playwright's own view of a page stalls after a refused navigation, so ask the app.
    const state = await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find((each) =>
        each.webContents.getURL().startsWith('vedraopus-preview://'),
      );
      return window
        ? {
            url: window.webContents.getURL(),
            position: (await window.webContents.executeJavaScript(
              'document.querySelector(".vo-player-position").textContent',
            )) as string,
          }
        : null;
    });
    expect(state?.url).toMatch(/^vedraopus-preview:\/\/[0-9a-f]{32}\/index\.html$/);
    expect(state?.position).toBe('Slide 1 of 2');
  } finally {
    await app.close();
  }
});

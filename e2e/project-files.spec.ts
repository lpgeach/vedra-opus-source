import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { answerDialogs, launchApp } from './launch';

const fixtureAssets = join(import.meta.dirname, '../fixtures/projects/two-slides/assets');
const imagePath = join(fixtureAssets, readdirSync(fixtureAssets)[0]!);
const SAVE = 0;
const DONT_SAVE = 1;
const CANCEL = 2;

const scratch = () => mkdtempSync(join(tmpdir(), 'vedraopus-e2e-files-'));
const title = (page: Page) => page.getByTestId('project-title');
const status = (page: Page) => page.getByTestId('project-status');
const thumbnails = (page: Page) => page.getByTestId('assets').locator('img');

async function chooseMenuItem(app: ElectronApplication, id: string): Promise<void> {
  await app.evaluate(({ Menu }, menuId) => {
    Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click();
  }, id);
}

/** Import Media lives on the ribbon's Insert tab; the files it brings in are listed in the left panel. */
async function importMedia(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Insert' }).click();
  await page.getByRole('button', { name: 'Import Media…' }).click();
}

/** The image element has actually decoded pixels, i.e. the asset URL was served. */
async function expectImageLoaded(page: Page): Promise<void> {
  await expect
    .poll(() =>
      thumbnails(page)
        .first()
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBe(64);
}

/**
 * End the app the way a crash or power cut would: no chance to clean up. On
 * Windows the helper processes must go too, or they keep the profile locked
 * and the next launch exits at once as a "second instance".
 */
function crash(pid: number): void {
  if (process.platform === 'win32') {
    execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    process.kill(pid, 'SIGKILL');
  }
}

/** The working copies currently on disk for a user-data directory. */
function workspaces(userDataDir: string): string[] {
  const root = join(userDataDir, 'workspaces');
  return existsSync(root) ? readdirSync(root).map((id) => join(root, id)) : [];
}

test('create, import an image, save, quit, reopen: the image is still there', async () => {
  const dir = scratch();
  const savedPath = join(dir, 'fire-safety.vedraopus');

  const first = await launchApp();
  await answerDialogs(first.app, { open: [[imagePath]], save: [savedPath] });
  await first.page.getByRole('button', { name: 'New Project' }).click();
  await title(first.page).fill('Fire Safety');
  await importMedia(first.page);
  await expect(thumbnails(first.page)).toHaveCount(1);
  await expectImageLoaded(first.page);
  await expect(status(first.page)).toContainText('Unsaved changes');

  await first.page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(status(first.page)).toContainText('Saved');
  await expect(status(first.page)).toContainText(savedPath);
  expect(existsSync(savedPath)).toBe(true);
  await expect
    .poll(() =>
      first.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getTitle()),
    )
    .toBe('Fire Safety — Vedra Opus');
  await first.app.close();

  // A clean close leaves no working copy behind, so nothing is offered for recovery.
  expect(workspaces(first.userDataDir)).toEqual([]);

  const second = await launchApp({ userDataDir: first.userDataDir });
  try {
    await expect(second.page.getByTestId('recovery')).toHaveCount(0);
    await second.page.getByTestId('recent').getByRole('button', { name: 'fire-safety' }).click();
    await expect(title(second.page)).toHaveValue('Fire Safety');
    await expect(status(second.page)).toContainText('Saved');
    await expect(thumbnails(second.page)).toHaveCount(1);
    await expectImageLoaded(second.page);
  } finally {
    await second.app.close();
  }
});

test('after a crash mid-edit, relaunching offers the unsaved work back', async () => {
  const first = await launchApp();
  await first.page.getByRole('button', { name: 'New Project' }).click();
  await title(first.page).fill('Unsaved Masterpiece');

  // Wait until the edit has reached the working copy on disk, then kill the app outright.
  await expect
    .poll(() => {
      const [workspace] = workspaces(first.userDataDir);
      const file = workspace && join(workspace, 'project.json');
      return file && existsSync(file) ? readFileSync(file, 'utf8') : '';
    })
    .toContain('Unsaved Masterpiece');
  const exited = new Promise((resolve) => first.app.process().once('exit', resolve));
  crash(first.app.process().pid!);
  await exited;

  // The profile lock can take a moment to clear after a kill; until it does a
  // new instance exits at once.
  let second: Awaited<ReturnType<typeof launchApp>> | undefined;
  await expect(async () => {
    second = await launchApp({ userDataDir: first.userDataDir });
  }).toPass({ intervals: [500, 1000, 2000], timeout: 20_000 });
  if (!second) throw new Error('relaunch failed');

  try {
    const recovery = second.page.getByTestId('recovery');
    await expect(recovery).toContainText('Unsaved Masterpiece');
    await recovery.getByRole('button', { name: 'Recover' }).click();
    await expect(title(second.page)).toHaveValue('Unsaved Masterpiece');
    await expect(status(second.page)).toContainText('Unsaved changes');

    // Closing without saving is the author's decision; after it, nothing is left to recover.
    await answerDialogs(second.app, { message: [DONT_SAVE] });
  } finally {
    await second.app.close();
  }
  expect(workspaces(first.userDataDir)).toEqual([]);

  const third = await launchApp({ userDataDir: first.userDataDir });
  try {
    await expect(third.page.getByRole('button', { name: 'New Project' })).toBeVisible();
    await expect(third.page.getByTestId('recovery')).toHaveCount(0);
  } finally {
    await third.app.close();
  }
});

test('importing the same file twice stores it once', async () => {
  const dir = scratch();
  const renamedCopy = join(dir, 'same-picture-different-name.png');
  copyFileSync(imagePath, renamedCopy);

  const { app, page, userDataDir } = await launchApp();
  try {
    await answerDialogs(app, { open: [[imagePath], [renamedCopy]], message: [DONT_SAVE] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await importMedia(page);
    await expect(thumbnails(page)).toHaveCount(1);
    // The import is the only change, and it counts as one.
    await expect(status(page)).toContainText('Unsaved changes');
    await importMedia(page);
    // The second import is a no-op for the document, so there is no change to wait for.
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(thumbnails(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(thumbnails(page)).toHaveCount(1);

    const [workspace] = workspaces(userDataDir);
    expect(readdirSync(join(workspace!, 'assets'))).toHaveLength(1);
  } finally {
    await app.close();
  }
});

test('a file that is not a project is refused with an explanation', async () => {
  const dir = scratch();
  const bogus = join(dir, 'notes.vedraopus');
  copyFileSync(imagePath, bogus);

  const { app, page, userDataDir } = await launchApp();
  try {
    await answerDialogs(app, { open: [[bogus]] });
    await page.getByRole('button', { name: 'Open…' }).click();
    await expect(page.getByTestId('error')).toContainText('not an Vedra Opus project');
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible();
    expect(workspaces(userDataDir)).toEqual([]);
  } finally {
    await app.close();
  }
});

test('opens a project file passed on the command line', async () => {
  const dir = scratch();
  const savedPath = join(dir, 'handed-over.vedraopus');

  const author = await launchApp();
  await answerDialogs(author.app, { save: [savedPath] });
  await author.page.getByRole('button', { name: 'New Project' }).click();
  await title(author.page).fill('Handed Over');
  await author.page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(status(author.page)).toContainText('Saved');
  await author.app.close();

  const opened = await launchApp({ args: [savedPath] });
  try {
    await expect(title(opened.page)).toHaveValue('Handed Over');
  } finally {
    await opened.app.close();
  }
});

test('closing with unsaved changes asks first: cancel keeps the project, save writes it', async () => {
  const dir = scratch();
  const savedPath = join(dir, 'kept.vedraopus');
  const { app, page } = await launchApp();
  const requestClose = () =>
    app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());

  await page.getByRole('button', { name: 'New Project' }).click();
  await title(page).fill('Nearly Lost');
  await expect(status(page)).toContainText('Unsaved changes');

  await answerDialogs(app, { message: [CANCEL] });
  await requestClose();
  // Still open, still editable, nothing saved.
  await title(page).fill('Nearly Lost, Then Kept');
  await expect(title(page)).toHaveValue('Nearly Lost, Then Kept');
  expect(existsSync(savedPath)).toBe(false);

  await answerDialogs(app, { message: [SAVE], save: [savedPath] });
  await requestClose();
  await expect.poll(() => existsSync(savedPath)).toBe(true);
  // The window is gone. On macOS the app itself stays running without one, so
  // shut it down explicitly; elsewhere it has already quit, which is fine too.
  await app.close().catch(() => undefined);

  const reopened = await launchApp({ args: [savedPath] });
  try {
    await expect(title(reopened.page)).toHaveValue('Nearly Lost, Then Kept');
  } finally {
    await reopened.app.close();
  }
});

test('opens a legacy .eloquent project and saves new work with the current extension', async () => {
  const dir = scratch();
  const modernPath = join(dir, 'legacy.vedraopus');
  const legacyPath = join(dir, 'legacy.eloquent');

  const author = await launchApp();
  await answerDialogs(author.app, { save: [modernPath] });
  await author.page.getByRole('button', { name: 'New Project' }).click();
  await title(author.page).fill('Legacy Project');
  await author.page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(status(author.page)).toContainText('Saved');
  await author.app.close();
  // Produce an old-style file, as an existing project on disk would be.
  renameSync(modernPath, legacyPath);

  const opened = await launchApp({ args: [legacyPath] });
  try {
    await expect(title(opened.page)).toHaveValue('Legacy Project');
    // Choosing the old path on Save As still writes the new extension.
    await answerDialogs(opened.app, { save: [legacyPath] });
    await title(opened.page).fill('Modern Project');
    await chooseMenuItem(opened.app, 'file.saveAs');
    await expect.poll(() => existsSync(modernPath)).toBe(true);
    await expect(status(opened.page)).toContainText(modernPath);
  } finally {
    await opened.app.close();
  }

  const reopened = await launchApp({ args: [modernPath] });
  try {
    await expect(title(reopened.page)).toHaveValue('Modern Project');
  } finally {
    await reopened.app.close();
  }
});

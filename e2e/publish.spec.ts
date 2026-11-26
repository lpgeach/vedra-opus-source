import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  createReadStream,
  mkdirSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import yauzl from 'yauzl';
import { packTwoSlides } from './fixture';
import { answerDialogs, launchApp } from './launch';

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
};

/** A static file server for a folder, so a published course is also tried over HTTP. */
function serve(root: string): Promise<{ server: Server; url: string }> {
  const server = createServer((request, response) => {
    const path = decodeURIComponent((request.url ?? '/').split('?')[0]!);
    const file = join(root, path === '/' ? 'index.html' : path);
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(response);
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    }),
  );
}

/** Play the course in a page: slide 1, its timing, Next to slide 2, and back. */
async function playCourse(page: Page, address: string): Promise<void> {
  const failed: string[] = [];
  page.on('requestfailed', (request) => failed.push(request.url()));
  page.on('pageerror', (error) => failed.push(error.message));
  await page.goto(address);
  await expect(page).toHaveTitle('Two Slides');
  await expect(page.locator('.vo-player-position')).toHaveText('Slide 1 of 2');
  // The title text is on stage from the start; the picture comes in at one second.
  await expect(page.locator('[data-object-type="text"]').first()).toBeVisible();
  await expect(page.locator('[data-object-type="image"]')).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.vo-player-position')).toHaveText('Slide 2 of 2');
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(page.locator('.vo-player-position')).toHaveText('Slide 1 of 2');
  expect(failed).toEqual([]);
}

test('publishes the two-slides fixture; the course plays over HTTP and from file://', async () => {
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-publish-'));
  const out = join(work, 'out');
  const projectFile = await packTwoSlides(work);
  const { app, page } = await launchApp({ args: [projectFile] });
  try {
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await answerDialogs(app, { open: [[out]], message: [1] });
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const dialog = page.getByTestId('publish-dialog');
    await expect(dialog.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Choose folder…' }).click();
    await expect(page.getByTestId('publish-folder')).toHaveText(out);
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
    // The page, the player's two files, the data, the picture, and the player's notices (R2).
    await expect(page.getByTestId('publish-result')).toContainText('Published 6 files');
    await expect(dialog.getByRole('button', { name: 'View published course' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toHaveCount(0);
  } finally {
    await app.close();
  }

  const course = join(out, 'two-slides');
  expect(existsSync(join(course, 'index.html'))).toBe(true);
  expect(existsSync(join(course, 'content', 'data.js'))).toBe(true);
  expect(readdirSync(join(course, 'content', 'assets'))).toHaveLength(1);
  // The staging folder is gone: only the course itself is in the output folder.
  expect(readdirSync(out)).toEqual(['two-slides']);

  const browser = await chromium.launch();
  const { server, url } = await serve(course);
  try {
    await playCourse(await browser.newPage(), url);
    await playCourse(await browser.newPage(), pathToFileURL(join(course, 'index.html')).href);
  } finally {
    server.close();
    await browser.close();
  }
});

test('cancelling the dialog or an unusable folder leaves the author in control', async () => {
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-publish-'));
  const projectFile = await packTwoSlides(work);
  const { app, page } = await launchApp({ args: [projectFile] });
  try {
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    // A folder that already holds someone's files under the course's name is not overwritten.
    const out = join(work, 'out');
    const clash = join(out, 'two-slides');
    mkdirSync(clash, { recursive: true });
    writeFileSync(join(clash, 'mine.txt'), 'keep');
    await answerDialogs(app, { open: [[out]], message: [1] });
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const dialog = page.getByTestId('publish-dialog');
    await dialog.getByRole('button', { name: 'Choose folder…' }).click();
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-error')).toContainText('not a published course');
    expect(readdirSync(clash)).toEqual(['mine.txt']);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  } finally {
    await app.close();
  }
});

/** The names and text of a zip's entries. */
function zipEntries(file: string): Promise<Map<string, string>> {
  return new Promise((done, fail) => {
    yauzl.open(file, { lazyEntries: true }, (error, zip) => {
      if (error) return fail(error);
      const entries = new Map<string, string>();
      zip.on('entry', (entry: yauzl.Entry) => {
        zip.openReadStream(entry, (err, stream) => {
          if (err) return fail(err);
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('end', () => {
            entries.set(entry.fileName, Buffer.concat(chunks).toString('utf8'));
            zip.readEntry();
          });
        });
      });
      zip.on('end', () => done(entries));
      zip.on('error', fail);
      zip.readEntry();
    });
  });
}

test('publishes a SCORM 1.2 zip, refuses a bad identifier, and remembers the settings', async () => {
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-publish-'));
  const out = join(work, 'out');
  mkdirSync(out);
  const projectFile = await packTwoSlides(work);
  const first = await launchApp({ args: [projectFile] });
  try {
    const { app, page } = first;
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await answerDialogs(app, { open: [[out]], message: [1, 1] });
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const dialog = page.getByTestId('publish-dialog');
    await dialog.getByLabel('Publish to').selectOption({ label: 'SCORM 1.2' });
    // An LMS takes a zip, so the output switches to one.
    await expect(dialog.getByRole('radio', { name: 'Zip file' })).toBeChecked();
    await dialog.getByRole('button', { name: 'Choose folder…' }).click();
    await expect(page.getByTestId('publish-folder')).toHaveText(out);

    const identifier = dialog.getByLabel('Identifier');
    await identifier.fill('1 course');
    await expect(dialog.getByRole('alert')).toContainText('Start with a letter');
    await expect(dialog.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();
    await identifier.fill('two-slides-course');
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await dialog.getByLabel('Version').fill('2.0');
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-result')).toContainText(
      // With THIRD-PARTY-NOTICES.txt, which every course now carries (R2).
      `Published 11 files into ${join(out, 'two-slides.zip')}`,
    );
    await expect(dialog.getByRole('button', { name: 'Show zip file' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    // The settings are part of the project now, not yet saved: save it.
    await expect(page.getByTestId('project-status')).toContainText('Unsaved changes');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('project-status')).toContainText('Saved');
  } finally {
    await first.app.close();
  }

  expect(readdirSync(out)).toEqual(['two-slides.zip']);
  const entries = await zipEntries(join(out, 'two-slides.zip'));
  expect([...entries.keys()]).toEqual(
    expect.arrayContaining([
      'imsmanifest.xml',
      'index.html',
      'content/data.js',
      'imscp_rootv1p1p2.xsd',
    ]),
  );
  expect(entries.get('imsmanifest.xml')).toContain(
    '<manifest identifier="two-slides-course" version="2.0"',
  );
  expect(entries.get('index.html')).toContain("lms: 'scorm12'");

  // A fresh start, same computer: the dialog opens as it was left, folder included.
  const second = await launchApp({ args: [projectFile], userDataDir: first.userDataDir });
  try {
    const { page } = second;
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const dialog = page.getByTestId('publish-dialog');
    await expect(dialog.getByLabel('Publish to')).toHaveValue('scorm12');
    await expect(dialog.getByLabel('Identifier')).toHaveValue('two-slides-course');
    await expect(dialog.getByLabel('Version')).toHaveValue('2.0');
    await expect(dialog.getByRole('radio', { name: 'Zip file' })).toBeChecked();
    await expect(page.getByTestId('publish-folder')).toHaveText(out);
    await expect(dialog.getByRole('button', { name: 'Publish', exact: true })).toBeEnabled();
  } finally {
    await second.app.close();
  }
});

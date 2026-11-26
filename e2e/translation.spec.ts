import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createWriteStream, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import yauzl from 'yauzl';
import { ZipFile } from 'yazl';
import { answerDialogs, launchApp } from './launch';

/**
 * Translation (docs/briefs/P10.3-translation.md, part A): the course's words go
 * out as XLIFF, come back translated, and show on the slide and in the
 * published course's player; undo puts the source back.
 */

const DONT_SAVE = 1;
const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const dialog = (page: Page) => page.getByTestId('translation-dialog');

async function openTranslation(page: Page) {
  await ribbon(page, 'Design');
  await page.getByRole('button', { name: 'Translation…', exact: true }).click();
  await expect(dialog(page)).toBeVisible();
}

test('a course exported as XLIFF and imported translated shows the translation, in the editor and the course', async () => {
  test.setTimeout(150_000);
  const work = mkdtempSync(join(tmpdir(), 'vo-e2e-translation-'));
  const xlf = join(work, 'course-fr.xlf');
  const out = join(work, 'out');
  mkdirSync(out);
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { save: [xlf], open: [[xlf], [out]], message: [DONT_SAVE] });
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await page.getByTestId('project-title').fill('Safety');
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Button', exact: true }).click();
    const stage = page.getByTestId('stage-canvas');
    await expect(stage).toContainText('Button');

    // Out: the course's own language is English; French is asked for.
    await openTranslation(page);
    await expect(dialog(page)).toContainText('Course language: en');
    const into = dialog(page).getByLabel('Translate into', { exact: true });
    await into.fill('en');
    await expect(dialog(page).getByRole('alert')).toContainText('the course’s own language');
    await into.fill('fr');
    await dialog(page).getByRole('button', { name: 'Export XLIFF…', exact: true }).click();
    await expect(dialog(page).getByTestId('translation-result')).toContainText(`to ${xlf}`);

    // A translator fills every target: "FR " before each source.
    const exported = readFileSync(xlf, 'utf8');
    expect(exported).toContain('target-language="fr"');
    expect(exported).toContain('<source>Button</source>');
    expect(exported).toContain('<source>Next</source>');
    const translated = exported.replace(
      /<source>(.*?)<\/source>\n(\s*)<target><\/target>/g,
      (_whole, source: string, indent: string) =>
        `<source>${source}</source>\n${indent}<target>FR ${source}</target>`,
    );
    writeFileSync(xlf, translated);

    // Back: every piece is translated, as one step.
    await dialog(page).getByRole('button', { name: 'Import translation…', exact: true }).click();
    const result = dialog(page).getByTestId('translation-result');
    await expect(result).toContainText('into fr');
    await expect(result).toContainText(/Translated (\d+) of \1 pieces of text\.$/);
    await dialog(page).getByRole('button', { name: 'Close', exact: true }).click();
    await expect(stage).toContainText('FR Button');
    await expect(page.getByTestId('project-title')).toHaveValue('FR Safety');

    // Published, the player speaks French: its words and its language.
    await ribbon(page, 'Home');
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const publish = page.getByTestId('publish-dialog');
    await publish.getByRole('button', { name: 'Choose folder…' }).click();
    await publish.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-result')).toBeVisible();
    await publish.getByRole('button', { name: 'Close', exact: true }).click();

    // Undo brings the English back.
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(stage).toContainText('Button');
    await expect(stage).not.toContainText('FR Button');
  } finally {
    await app.close();
  }

  const browser = await chromium.launch();
  try {
    const course = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await course.goto(pathToFileURL(join(out, 'fr-safety', 'index.html')).href);
    await expect(course.locator('.vo-player')).toHaveAttribute('lang', 'fr');
    await expect(course.getByRole('button', { name: 'FR Next', exact: true })).toBeVisible();
    await expect(course.locator('.vo-player-stage')).toContainText('FR Button');
  } finally {
    await browser.close();
  }
});

/** Every entry of a zip, by name. */
function unzip(file: string): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      const entries = new Map<string, Buffer>();
      zip.on('entry', (entry: yauzl.Entry) => {
        zip.openReadStream(entry, (err, stream) => {
          if (err) return reject(err);
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('end', () => {
            entries.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.on('end', () => resolve(entries));
      zip.readEntry();
    });
  });
}

async function rezip(file: string, entries: Map<string, Buffer>): Promise<void> {
  const zip = new ZipFile();
  for (const [name, data] of entries) zip.addBuffer(data, name);
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(file));
}

test('a course exported as a Word document, its third column filled, comes back translated (part B)', async () => {
  test.setTimeout(120_000);
  const work = mkdtempSync(join(tmpdir(), 'vo-e2e-translation-doc-'));
  const docx = join(work, 'course-de.docx');
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { save: [docx], open: [[docx]], message: [DONT_SAVE] });
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Button', exact: true }).click();
    await openTranslation(page);
    await dialog(page).getByLabel('Translate into', { exact: true }).fill('de');
    await dialog(page).getByRole('button', { name: 'Export Word document…', exact: true }).click();
    await expect(dialog(page).getByTestId('translation-result')).toContainText(`to ${docx}`);

    // A translator types into each empty third cell: "DE " before the source.
    const entries = await unzip(docx);
    const xml = entries.get('word/document.xml')!.toString('utf8');
    expect(xml).toContain('<w:t xml:space="preserve">de</w:t>');
    const source =
      /(<w:tc>(?:(?!<w:tc>).)*?<w:t xml:space="preserve">([^<]*)<\/w:t><\/w:r><\/w:p><\/w:tc>)(<w:tc><w:tcPr>(?:(?!<w:tc>).)*?<\/w:tcPr>)<w:p\/><\/w:tc>/g;
    const filled = xml.replace(
      source,
      (_whole, sourceCell: string, words: string, targetStart: string) =>
        `${sourceCell}${targetStart}<w:p><w:r><w:t xml:space="preserve">DE ${words}</w:t></w:r></w:p></w:tc>`,
    );
    expect(filled).not.toBe(xml);
    entries.set('word/document.xml', Buffer.from(filled));
    await rezip(docx, entries);

    await dialog(page).getByRole('button', { name: 'Import translation…', exact: true }).click();
    const result = dialog(page).getByTestId('translation-result');
    await expect(result).toContainText('into de');
    await expect(result).toContainText(/Translated (\d+) of \1 pieces of text\.$/);
    await dialog(page).getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByTestId('stage-canvas')).toContainText('DE Button');
  } finally {
    await app.close();
  }
});

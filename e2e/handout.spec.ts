import { expect, test } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yauzl from 'yauzl';
import { packTwoSlides } from './fixture';
import { answerDialogs, launchApp } from './launch';

/**
 * The handout as PDF (docs/briefs/P11.3-video-and-handout.md, part A): File →
 * Export Handout… prints the project's slides and notes to a PDF, one a page
 * or three a page with lines.
 */

async function chooseMenuItem(app: ElectronApplication, id: string): Promise<void> {
  await app.evaluate(({ Menu }, menuId) => {
    Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click();
  }, id);
}

/** The pages a PDF says it has: each page object is `/Type /Page`, the tree `/Type /Pages`. */
const pageCount = (file: string) =>
  (
    readFileSync(file)
      .toString('latin1')
      .match(/\/Type\s*\/Page(?!s)/g) ?? []
  ).length;

test('a handout of each slide and its notes is printed to a PDF', async () => {
  test.setTimeout(120_000);
  const dir = mkdtempSync(join(tmpdir(), 'vo-e2e-handout-'));
  const project = await packTwoSlides(dir);
  const notesPdf = join(dir, 'notes.pdf');
  const linesPdf = join(dir, 'lines.pdf');
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { open: [[project]], save: [notesPdf, linesPdf] });
    await page.getByRole('button', { name: 'Open…', exact: true }).click();
    await expect(page.getByTestId('slide-list').locator('.slide-item')).toHaveCount(2);

    await chooseMenuItem(app, 'file.exportHandout');
    const dialog = page.getByTestId('handout-dialog');
    // The handout is drawn in the page, hidden until printed.
    const handout = page.getByTestId('handout');
    await expect(handout).toBeHidden();
    await expect(handout.getByTestId('handout-slide')).toHaveCount(2);
    await expect(handout.locator('.handout-slide-title')).toHaveText(['1. Welcome', '2. The End']);
    await expect(handout.getByTestId('handout-notes')).toHaveCount(2);

    await dialog.getByRole('button', { name: 'Export PDF…' }).click();
    await expect(dialog.getByRole('status')).toHaveText(`Saved to ${notesPdf}`);
    expect(readFileSync(notesPdf).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pageCount(notesPdf)).toBe(2);

    // Three a page, with lines: one page.
    await dialog.getByRole('radio', { name: 'Three slides a page, with lines for notes' }).check();
    await expect(handout).toHaveAttribute('data-layout', 'lines');
    await dialog.getByRole('button', { name: 'Export PDF…' }).click();
    await expect(dialog.getByRole('status')).toHaveText(`Saved to ${linesPdf}`);
    expect(pageCount(linesPdf)).toBe(1);

    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(handout).toHaveCount(0);
  } finally {
    await app.close();
  }
});

/** Every entry of a zip file, by name. */
function readZip(file: string): Promise<Map<string, Buffer>> {
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

test('the handout as a Word document has a picture of each slide, drawn offscreen', async () => {
  test.setTimeout(120_000);
  const dir = mkdtempSync(join(tmpdir(), 'vo-e2e-handout-word-'));
  const project = await packTwoSlides(dir);
  const docx = join(dir, 'handout.docx');
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { open: [[project]], save: [docx] });
    await page.getByRole('button', { name: 'Open…', exact: true }).click();
    await expect(page.getByTestId('slide-list').locator('.slide-item')).toHaveCount(2);
    await chooseMenuItem(app, 'file.exportHandout');
    const dialog = page.getByTestId('handout-dialog');
    await dialog.getByRole('button', { name: 'Export Word…' }).click();
    await expect(dialog.getByRole('status')).toHaveText(`Saved to ${docx}`, { timeout: 30_000 });

    const parts = await readZip(docx);
    const document = parts.get('word/document.xml')!.toString('utf8');
    expect(document).toContain('1. Welcome');
    expect(document).toContain('2. The End');
    for (const name of ['word/media/slide1.png', 'word/media/slide2.png']) {
      const png = parts.get(name)!;
      expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
      // The fixture's stage is 1280 × 720: the picture keeps its shape, as large as the
      // screen allows the hidden window to be, up to twice the size.
      const [width, height] = [png.readUInt32BE(16), png.readUInt32BE(20)];
      expect(width).toBeGreaterThanOrEqual(1000);
      expect(width).toBeLessThanOrEqual(2560);
      expect(Math.abs(height - (width * 720) / 1280)).toBeLessThanOrEqual(1);
    }
    // The first slide's picture has its blue panel: the slide was drawn, not left blank.
    expect(parts.get('word/media/slide1.png')!.length).toBeGreaterThan(5000);
  } finally {
    await app.close();
  }
});

import { expect, test } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import { createWriteStream, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ZipFile } from 'yazl';
import {
  findLibreOffice,
  libreOfficeVendorFolder,
} from '../apps/desktop/src/main/import/libreoffice';
import {
  buildDeck,
  chartContent,
  para,
  PIXEL_PNG,
  smartArtContent,
  spShape,
} from '../apps/desktop/src/main/import/pptx/test-deck';
import { answerDialogs, launchApp } from './launch';

/**
 * PowerPoint import (docs/briefs/P11.1-pptx-import.md, part A): a deck made in
 * the shape PowerPoint writes, imported through File → Import PowerPoint…,
 * opens as a new unsaved project with its slides, text, picture, table and
 * notes, and a report of what did not come across as it was.
 */

const EMU = 9525;
const box = (x: number, y: number, w: number, h: number) => ({
  x: x * EMU,
  y: y * EMU,
  cx: w * EMU,
  cy: h * EMU,
});

async function writeDeck(path: string): Promise<void> {
  const title = (words: string) =>
    spShape({
      id: 2,
      name: 'Title 1',
      box: box(0, 0, 0, 0),
      ph: '<p:ph type="title"/>',
      paragraphs: para(words),
    }).replace(/<a:xfrm><a:off[^]*?<\/a:xfrm>/, '');
  const picture = `<p:pic><p:nvPicPr><p:cNvPr id="3" name="Logo" descr="The company logo"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId5"/><a:stretch/></p:blipFill><p:spPr><a:xfrm><a:off x="${900 * EMU}" y="${500 * EMU}"/><a:ext cx="${100 * EMU}" cy="${100 * EMU}"/></a:xfrm></p:spPr></p:pic>`;
  const cell = (words: string) =>
    `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${para(words)}</a:txBody><a:tcPr/></a:tc>`;
  const table = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="4" name="Exits"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${100 * EMU}" y="${300 * EMU}"/><a:ext cx="${400 * EMU}" cy="${80 * EMU}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1"/><a:tblGrid><a:gridCol w="${200 * EMU}"/><a:gridCol w="${200 * EMU}"/></a:tblGrid><a:tr h="${40 * EMU}">${cell('Exit')}${cell('Floor')}</a:tr><a:tr h="${40 * EMU}">${cell('North')}${cell('1')}</a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
  const chart = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="5" name="Drill times"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${600 * EMU}" y="${200 * EMU}"/><a:ext cx="${300 * EMU}" cy="${200 * EMU}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"/></a:graphic></p:graphicFrame>`;
  const parts = buildDeck({
    title: 'Fire safety',
    slides: [
      {
        shapes:
          title('Welcome') +
          spShape({
            id: 6,
            name: 'Intro',
            box: box(100, 160, 600, 80),
            textBox: true,
            paragraphs: para('Read this first', '<a:rPr lang="en-GB" b="1"/>'),
          }) +
          picture,
        rels: { rId5: '../media/image1.png' },
        notes: 'Say hello to the group',
      },
      { shapes: title('Where to go') + table + chart },
    ],
    media: { 'ppt/media/image1.png': PIXEL_PNG },
  });
  const zip = new ZipFile();
  for (const [name, bytes] of parts) zip.addBuffer(Buffer.from(bytes), name);
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(path));
}

async function chooseMenuItem(app: ElectronApplication, id: string): Promise<void> {
  await app.evaluate(({ Menu }, menuId) => {
    Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click();
  }, id);
}

test('a PowerPoint deck imported through the File menu opens as a new project, with a report', async () => {
  test.setTimeout(120_000);
  const deck = join(mkdtempSync(join(tmpdir(), 'vo-e2e-pptx-')), 'Fire safety.pptx');
  await writeDeck(deck);
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { open: [[deck]], message: [1] });
    // The window listens for menu commands once it has drawn.
    await expect(page.getByRole('button', { name: 'New Project', exact: true })).toBeVisible();
    await chooseMenuItem(app, 'file.importPowerPoint');

    // The report: the chart could not come across, and stays as a labelled placeholder. Its
    // part is missing, so LibreOffice, where it is fetched, has nothing to draw either.
    // Where LibreOffice is fetched, it runs first: a run takes seconds to start (about 7 on WSL).
    const report = page.getByTestId('import-report');
    await expect(report).toBeVisible({ timeout: 60_000 });
    await expect(report.getByRole('status')).toHaveText(
      'One thing could not come across exactly as it was:',
    );
    await expect(report.getByTestId('import-report-item')).toContainText([
      'Slide 2Placeholder“Drill times” is a chart; ',
    ]);
    await report.getByRole('button', { name: 'Close', exact: true }).click();

    // A new, unsaved project with the deck's title and slides.
    await expect(page.getByTestId('project-title')).toHaveValue('Fire safety');
    await expect(page.getByTestId('project-status')).toContainText('Unsaved');
    const slides = page.getByTestId('slide-list').locator('.slide-item');
    await expect(slides).toHaveCount(2);
    await expect(slides).toContainText(['Welcome', 'Where to go']);

    // Slide 1: the title, the bold words, the picture with its alt text, and the notes.
    const canvas = page.getByTestId('stage-canvas');
    await expect(canvas).toContainText('Welcome');
    await expect(canvas.locator('strong')).toContainText('Read this first');
    const logo = canvas.locator('[data-object-type="image"]');
    await expect(logo).toHaveCount(1);
    await logo.click();
    await page
      .getByRole('tablist', { name: 'Right panel' })
      .getByRole('tab', { name: 'Format', exact: true })
      .click();
    await expect(
      page.getByTestId('format-a11y').getByLabel('Alt text', { exact: true }),
    ).toHaveValue('The company logo');
    await page.getByRole('tab', { name: 'Notes', exact: true }).click();
    await expect(page.getByTestId('slide-notes')).toContainText('Say hello to the group');

    // Slide 2: the table, and the chart's placeholder.
    await slides.nth(1).click();
    await expect(canvas.locator('[data-object-type="table"]')).toContainText('North');
    await expect(canvas).toContainText('[Chart]');

    // Part B: the deck's master and layout, in Master View.
    await page.getByRole('button', { name: 'Master View', exact: true }).click();
    const masters = page.getByTestId('master-list');
    await expect(masters).toContainText('Office Theme');
    await expect(masters).toContainText('Title and Content');
  } finally {
    await app.close();
  }
});

// Part D: what only a picture can show, drawn by the LibreOffice `npm run fetch:libreoffice` fetched.
const soffice = findLibreOffice([libreOfficeVendorFolder(resolve(import.meta.dirname, '..'))]);

test('a deck’s chart and SmartArt come across as pictures, drawn by LibreOffice', async () => {
  test.skip(!soffice, 'LibreOffice is not fetched (npm run fetch:libreoffice)');
  test.setTimeout(120_000);
  const chart = chartContent(7, box(80, 120, 500, 360));
  const smartArt = smartArtContent(8, box(640, 200, 600, 160));
  const parts = buildDeck({
    slides: [{ shapes: chart.shapes + smartArt.shapes, rels: { ...chart.rels, ...smartArt.rels } }],
    media: { ...chart.parts, ...smartArt.parts },
  });
  const deck = join(mkdtempSync(join(tmpdir(), 'vo-e2e-pptx-chart-')), 'Drill times.pptx');
  const zip = new ZipFile();
  for (const [name, bytes] of parts) zip.addBuffer(Buffer.from(bytes), name);
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(deck));
  const { app, page } = await launchApp();
  try {
    // The new project is unsaved: closing the app asks, and is told not to save.
    await answerDialogs(app, { open: [[deck]], message: [1] });
    await page.getByRole('button', { name: 'Import PowerPoint…', exact: true }).click();
    const report = page.getByTestId('import-report');
    await expect(report.getByTestId('import-report-item')).toContainText(
      ['“Chart 7” is a chart, drawn as a picture.', '“Diagram 8” is SmartArt, drawn as a picture.'],
      { timeout: 60_000 },
    );
    await report.getByRole('button', { name: 'Close', exact: true }).click();
    // Both are pictures on the slide now, and the pictures load.
    const pictures = page.getByTestId('stage-canvas').locator('[data-object-type="image"]');
    await expect(pictures).toHaveCount(2);
    for (const picture of await pictures.locator('img').all()) {
      await expect
        .poll(() => picture.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
        .toBeGreaterThan(0);
    }
  } finally {
    await app.close();
  }
});

test('a file that is not a presentation is refused, saying why', async () => {
  const notDeck = join(mkdtempSync(join(tmpdir(), 'vo-e2e-pptx-bad-')), 'notes.pptx');
  const zip = new ZipFile();
  zip.addBuffer(Buffer.from('hello'), 'readme.txt');
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(notDeck));
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { open: [[notDeck]] });
    await page.getByRole('button', { name: 'Import PowerPoint…', exact: true }).click();
    await expect(page.getByTestId('error')).toContainText('not a PowerPoint presentation');
  } finally {
    await app.close();
  }
});

/**
 * The handout (docs/briefs/P11.3-video-and-handout.md): as PDF (part A), the
 * editor's window printed, which shows only the handout when printed; as a
 * Word document (part B), with pictures of the slides drawn offscreen.
 */
import { BrowserWindow, dialog } from 'electron';
import type { NativeImage } from 'electron';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { t } from '../shared/strings';
import { writeHandoutDocument } from './handout-document';

/** Page numbers at the foot of each page, in the page's own small type. */
const FOOTER =
  '<div style="font-size:8px;width:100%;text-align:center;color:#555"><span class="pageNumber"></span> / <span class="totalPages"></span></div>';

/** A title made safe to suggest as a file name. */
const safeName = (title: string) =>
  [...title]
    .map((char) => ('<>:"/\\|?*'.includes(char) || char.charCodeAt(0) < 32 ? ' ' : char))
    .join('')
    .trim()
    .slice(0, 100) || 'Handout';

/** Ask where to save, and print the window there as A4; the path, or null when cancelled. */
export async function exportHandout(
  window: BrowserWindow | undefined,
  defaultName: string,
): Promise<string | null> {
  if (!window) return null;
  const chosen = await dialog.showSaveDialog(window, {
    title: t('handout.title'),
    defaultPath: `${t('dialog.handout.fileName', { title: safeName(defaultName) })}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (chosen.canceled || !chosen.filePath) return null;
  const target =
    extname(chosen.filePath).toLowerCase() === '.pdf' ? chosen.filePath : `${chosen.filePath}.pdf`;
  const pdf = await window.webContents.printToPDF({
    pageSize: 'A4',
    printBackground: true,
    margins: { top: 0.5, bottom: 0.6, left: 0.5, right: 0.5 },
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: FOOTER,
    generateTaggedPDF: true,
  });
  await writeFile(target, pdf);
  return target;
}

/** What the editor's page gives rich text, so a slide drawn alone looks as it does there. */
const SLIDE_PAGE_STYLE = [
  'html,body{margin:0;background:#fff;overflow:hidden}',
  'body{font-family:Inter,system-ui,sans-serif}',
  '.vo-rich-text{white-space:pre-wrap;overflow-wrap:break-word}',
  '.vo-rich-text p{margin:0}',
  '.vo-rich-text ul,.vo-rich-text ol{margin:0;padding-left:1.4em}',
  '.vo-rich-text ul{list-style-type:disc}',
  '.vo-rich-text ol{list-style-type:decimal}',
  '.vo-rich-text li{margin:0}',
].join('');

/** The next frame an offscreen window paints, or null after a few seconds. */
function nextPaint(window: BrowserWindow, timeoutMs = 5000): Promise<NativeImage | null> {
  return new Promise((resolve) => {
    const done = (image: NativeImage | null) => {
      clearTimeout(timer);
      window.webContents.off('paint', onPaint);
      resolve(image);
    };
    const onPaint = (_event: unknown, _dirty: unknown, image: NativeImage) => {
      // A frame painted before the page loaded is blank; the first after load counts.
      if (!window.webContents.isLoading()) done(image);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    window.webContents.on('paint', onPaint);
  });
}

/**
 * Pictures of slides (part B): each slide's markup drawn alone in a hidden,
 * offscreen window with scripts off, and captured. The window is never shown.
 * It cannot be larger than the screen, so each slide is drawn as large as
 * fits, up to twice its size, keeping its shape.
 */
export async function pictureSlides(
  markups: readonly string[],
  stage: { width: number; height: number },
): Promise<{ png: Uint8Array; width: number; height: number }[]> {
  const scale = 2;
  const work = await mkdtemp(join(tmpdir(), 'vedraopus-handout-'));
  const window = new BrowserWindow({
    show: false,
    width: stage.width * scale,
    height: stage.height * scale,
    useContentSize: true,
    webPreferences: { offscreen: true, javascript: false, sandbox: true },
  });
  try {
    // Held to the screen where there is one. With no screen (headless Linux) a window
    // never shown stays 1 × 1 until it is given a size, so it is given one here.
    window.setContentSize(stage.width * scale, stage.height * scale);
    const [givenWidth, givenHeight] = window.getContentSize() as [number, number];
    const [width, height] =
      givenWidth < 16 || givenHeight < 16
        ? [stage.width * scale, stage.height * scale]
        : [givenWidth, givenHeight];
    const zoom = Math.min(scale, width / stage.width, height / stage.height);
    const area = {
      x: 0,
      y: 0,
      width: Math.max(1, Math.floor(stage.width * zoom)),
      height: Math.max(1, Math.floor(stage.height * zoom)),
    };
    const pictures: { png: Uint8Array; width: number; height: number }[] = [];
    for (const [index, markup] of markups.entries()) {
      const page = join(work, `slide-${index + 1}.html`);
      await writeFile(
        page,
        `<!doctype html><html><head><meta charset="utf-8"><style>${SLIDE_PAGE_STYLE}body{zoom:${zoom}}</style></head><body>${markup}</body></html>`,
      );
      // An offscreen window hands over each frame it paints; the frame after the page
      // has loaded is the slide. (Capturing the page instead gave an empty picture on
      // headless Linux.) The capture stays as a fallback.
      const painted = nextPaint(window);
      await window.loadFile(page);
      window.webContents.invalidate();
      const frame = await painted;
      const image =
        frame && !frame.isEmpty() ? frame.crop(area) : await window.webContents.capturePage(area);
      pictures.push({ png: image.toPNG(), ...image.getSize() });
    }
    return pictures;
  } finally {
    window.destroy();
    await rm(work, { recursive: true, force: true });
  }
}

/** Ask where to save, draw each slide, and write the handout as a Word document; the path, or null. */
export async function exportHandoutDocument(
  window: BrowserWindow | undefined,
  request: {
    defaultName: string;
    title: string;
    language: string;
    layout: 'notes' | 'lines';
    stage: { width: number; height: number };
    slides: { number: number; title: string; notes: string[]; markup: string }[];
  },
): Promise<string | null> {
  if (!window) return null;
  const chosen = await dialog.showSaveDialog(window, {
    title: t('handout.title'),
    defaultPath: `${t('dialog.handout.fileName', { title: safeName(request.defaultName) })}.docx`,
    filters: [{ name: t('dialog.handout.wordFilter'), extensions: ['docx'] }],
  });
  if (chosen.canceled || !chosen.filePath) return null;
  const target =
    extname(chosen.filePath).toLowerCase() === '.docx'
      ? chosen.filePath
      : `${chosen.filePath}.docx`;
  const pictures = await pictureSlides(
    request.slides.map((slide) => slide.markup),
    request.stage,
  );
  await writeHandoutDocument(target, {
    title: request.title,
    language: request.language,
    layout: request.layout,
    slides: request.slides.map((slide, index) => ({
      number: slide.number,
      title: slide.title,
      notes: slide.notes,
      ...pictures[index]!,
    })),
  });
  return target;
}

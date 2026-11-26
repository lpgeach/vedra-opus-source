import { chromium, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import yauzl from 'yauzl';
import { ZipFile } from 'yazl';
import {
  buildDeck,
  para,
  PIXEL_PNG,
  spShape,
} from '../apps/desktop/src/main/import/pptx/test-deck';
import { answerDialogs, launchApp, leavingRequests } from './launch';

/**
 * The Phase 11 review: a course made with the whole phase, through the UI as an
 * author would. It survives a save and a fresh start, prints as a handout, plays
 * into a video, plays in Preview and published, and nothing leaves the machine.
 *
 * - A starter template, saved as the author's own template (P11.2 parts A and C).
 * - A PowerPoint deck imported, with its notes and picture (P11.1).
 * - Two slides imported from the saved template, a question among them (P11.2 part B).
 * - The course in Arabic (P10.3): the handout reads right to left (found in this review).
 * - The handout as PDF and Word, and the course as a WebM video (P11.3).
 * - Updates are checked only when asked; crash reports are off (P11.4, P11.5).
 */

const DONT_SAVE = 1;
const NOTES = 'رحّب بالمجموعة'; // "Welcome the group", in Arabic.

const os = { linux: 'linux', win32: 'win', darwin: 'mac' }[process.platform as string];
const tools = resolve(
  import.meta.dirname,
  '..',
  'vendor',
  'ffmpeg',
  `${os}-${process.arch}`,
  'bin',
);
const ffprobe = join(tools, `ffprobe${process.platform === 'win32' ? '.exe' : ''}`);

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const slideItems = (page: Page) => page.getByTestId('slide-list').locator('.slide-item');

async function chooseMenuItem(app: ElectronApplication, id: string): Promise<void> {
  await app.evaluate(({ Menu }, menuId) => {
    Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click();
  }, id);
}

/** A two-slide deck in the shape PowerPoint writes: a title, words, a picture and notes. */
async function writeDeck(path: string): Promise<void> {
  const EMU = 9525;
  const box = (x: number, y: number, w: number, h: number) => ({
    x: x * EMU,
    y: y * EMU,
    cx: w * EMU,
    cy: h * EMU,
  });
  const title = (words: string) =>
    spShape({
      id: 2,
      name: 'Title 1',
      box: box(0, 0, 0, 0),
      ph: '<p:ph type="title"/>',
      paragraphs: para(words),
    }).replace(/<a:xfrm><a:off[^]*?<\/a:xfrm>/, '');
  const picture = `<p:pic><p:nvPicPr><p:cNvPr id="3" name="Logo" descr="The company logo"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId5"/><a:stretch/></p:blipFill><p:spPr><a:xfrm><a:off x="${900 * EMU}" y="${500 * EMU}"/><a:ext cx="${100 * EMU}" cy="${100 * EMU}"/></a:xfrm></p:spPr></p:pic>`;
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
            paragraphs: para('Read this first'),
          }) +
          picture,
        rels: { rId5: '../media/image1.png' },
        notes: NOTES,
      },
      { shapes: title('Where to go') },
    ],
    media: { 'ppt/media/image1.png': PIXEL_PNG },
  });
  const zip = new ZipFile();
  for (const [name, bytes] of parts) zip.addBuffer(Buffer.from(bytes), name);
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(path));
}

/** Every entry of a zip file, by name. */
function readZip(file: string): Promise<Map<string, Buffer>> {
  return new Promise((done, fail) => {
    yauzl.open(file, { lazyEntries: true }, (error, zip) => {
      if (error) return fail(error);
      const entries = new Map<string, Buffer>();
      zip.on('entry', (entry: yauzl.Entry) => {
        zip.openReadStream(entry, (err, stream) => {
          if (err) return fail(err);
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('end', () => {
            entries.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.on('end', () => done(entries));
      zip.readEntry();
    });
  });
}

/** The pages a PDF says it has. */
const pageCount = (file: string) =>
  (
    readFileSync(file)
      .toString('latin1')
      .match(/\/Type\s*\/Page(?!s)/g) ?? []
  ).length;

test('a course using all of Phase 11 survives saving, prints, becomes a video, plays in Preview and published', async () => {
  test.setTimeout(420_000);
  const work = mkdtempSync(join(tmpdir(), 'vo-e2e-phase11-'));
  const deck = join(work, 'Fire safety.pptx');
  await writeDeck(deck);
  const file = join(work, 'phase11.vedraopus');
  const pdf = join(work, 'handout.pdf');
  const docx = join(work, 'handout.docx');
  const video = join(work, 'course.webm');
  const out = join(work, 'out');
  mkdirSync(out);

  // An update feed on this machine that nothing answers: the check behaves the same in the
  // development app and a packaged one, and never reaches the network.
  const first = await launchApp({ env: { VEDRAOPUS_UPDATE_FEED: 'http://127.0.0.1:9/' } });
  try {
    const { app, page } = first;
    await expect(page.getByRole('button', { name: 'New Project', exact: true })).toBeVisible();
    // Crash reports are off, and updates are checked only when asked.
    expect(
      await app.evaluate(
        ({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('help.keepCrashReports')!.checked,
      ),
    ).toBe(false);

    // A starter template, then saved as the author's own.
    await chooseMenuItem(app, 'file.newFromTemplate');
    const chooser = page.getByTestId('template-chooser');
    await chooser.getByRole('button', { name: 'Use Short course' }).click();
    await expect(chooser).toBeHidden();
    await expect(slideItems(page)).toHaveCount(7);
    await chooseMenuItem(app, 'file.saveAsTemplate');
    const save = page.getByTestId('save-template');
    await save.getByLabel('Template name').fill('Our short course');
    await save.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(save.getByRole('status')).toHaveText('Saved as the template “Our short course”.');
    await save.getByRole('button', { name: 'Close', exact: true }).click();
    const templates = join(first.userDataDir, 'Templates');
    const template = join(templates, readdirSync(templates)[0]!);

    // A PowerPoint deck, which starts the course (the starter is left unsaved).
    await answerDialogs(app, { open: [[deck], [template]], message: [DONT_SAVE] });
    await chooseMenuItem(app, 'file.importPowerPoint');
    const report = page.getByTestId('import-report');
    await expect(report).toBeVisible({ timeout: 60_000 });
    await expect(report.getByRole('status')).toHaveText(
      'Everything in the presentation came across.',
    );
    await report.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByTestId('project-title')).toHaveValue('Fire safety');
    await expect(slideItems(page)).toHaveCount(2);

    // Two slides of the template, a question among them.
    await chooseMenuItem(app, 'file.importSlides');
    const imports = page.getByTestId('import-slides');
    await imports.getByRole('checkbox', { name: '3. The first idea' }).check();
    await imports.getByRole('checkbox', { name: '5. Check: the first idea' }).check();
    await imports.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(imports.getByRole('status')).toHaveText('Imported 2 slides.');
    await imports.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(slideItems(page)).toHaveCount(4);

    // The course in Arabic.
    await ribbon(page, 'Design');
    await page.getByRole('button', { name: 'Player…', exact: true }).click();
    const language = page
      .getByTestId('player-dialog')
      .getByLabel('Course language', { exact: true });
    await language.fill('ar');
    await language.press('Enter');
    await page
      .getByTestId('player-dialog')
      .getByRole('button', { name: 'Close', exact: true })
      .click();

    await answerDialogs(app, { save: [file] });
    await ribbon(page, 'Home');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('project-status')).toContainText('Saved');

    // Check for Updates… checks only when asked, and says what happened.
    await app.evaluate(({ dialog }) => {
      const seen: string[] = [];
      (globalThis as unknown as { voMessages: string[] }).voMessages = seen;
      dialog.showMessageBox = ((...args: unknown[]) => {
        const options = args[args.length - 1] as { message: string };
        seen.push(options.message);
        return Promise.resolve({ response: 0, checkboxChecked: false });
      }) as typeof dialog.showMessageBox;
    });
    await chooseMenuItem(app, 'help.checkForUpdates');
    await expect
      .poll(() =>
        app.evaluate(() => (globalThis as unknown as { voMessages: string[] }).voMessages),
      )
      .toEqual(['Vedra Opus could not check for updates.']);
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ args: [file] });
  try {
    const { app, page } = second;
    // Every request any of the app's sessions makes, from here on: the handout's hidden
    // window uses the default session, and the video's the preview one.
    await app.evaluate(({ session }) => {
      const urls: string[] = [];
      (globalThis as unknown as { voRequests: string[] }).voRequests = urls;
      for (const each of [session.defaultSession, session.fromPartition('vedraopus-preview')]) {
        each.webRequest.onBeforeRequest((details, callback) => {
          urls.push(details.url);
          callback({});
        });
      }
    });
    await answerDialogs(app, { save: [pdf, docx, video], open: [[out]], message: [DONT_SAVE] });
    await expect(page.getByTestId('stage-canvas')).toBeVisible();

    // Everything came back: the slides, the deck's notes and picture, the question, Arabic.
    // The template's slides came in after the slide that was current, the deck's first.
    await expect(slideItems(page)).toHaveCount(4);
    await expect(slideItems(page)).toContainText([
      'Welcome',
      'The first idea',
      'Check: the first idea',
      'Where to go',
    ]);
    await slideItems(page).first().click();
    await expect(
      page.getByTestId('stage-canvas').locator('[data-object-type="image"]'),
    ).toHaveCount(1);
    await page.getByRole('tab', { name: 'Notes', exact: true }).click();
    await expect(page.getByTestId('slide-notes')).toContainText(NOTES);

    // The handout: right to left, as the course is; the slides themselves drawn as they are.
    await chooseMenuItem(app, 'file.exportHandout');
    const handoutDialog = page.getByTestId('handout-dialog');
    const handout = page.getByTestId('handout');
    await expect(handout).toHaveAttribute('dir', 'rtl');
    await expect(handout).toHaveAttribute('lang', 'ar');
    await expect(handout.getByTestId('handout-slide')).toHaveCount(4);
    await expect(handout.locator('.handout-picture').first()).toHaveAttribute('dir', 'ltr');
    await expect(handout.getByTestId('handout-notes').first()).toContainText(NOTES);
    await handoutDialog.getByRole('button', { name: 'Export PDF…' }).click();
    await expect(handoutDialog.getByRole('status')).toHaveText(`Saved to ${pdf}`);
    expect(pageCount(pdf)).toBe(4);
    await handoutDialog.getByRole('button', { name: 'Export Word…' }).click();
    await expect(handoutDialog.getByRole('status')).toHaveText(`Saved to ${docx}`, {
      timeout: 60_000,
    });
    const word = await readZip(docx);
    expect(word.get('word/styles.xml')!.toString('utf8')).toContain('<w:bidi/>');
    expect(word.get('word/document.xml')!.toString('utf8')).toContain(NOTES);
    expect([...word.keys()].filter((name) => name.startsWith('word/media/'))).toHaveLength(4);
    await handoutDialog.getByRole('button', { name: 'Close', exact: true }).click();

    // The course as a video, where ffmpeg is fetched.
    if (existsSync(ffprobe)) {
      await chooseMenuItem(app, 'file.exportVideo');
      const videoDialog = page.getByTestId('video-dialog');
      await videoDialog.getByRole('button', { name: 'Export WebM…' }).click();
      await expect(videoDialog.getByTestId('video-saved')).toHaveText(`Saved to ${video}`, {
        timeout: 240_000,
      });
      await videoDialog.getByRole('button', { name: 'Close', exact: true }).click();
      const probe = spawnSync(ffprobe, [
        '-v',
        'error',
        '-show_entries',
        'format=format_name,duration:stream=codec_name',
        '-of',
        'json',
        video,
      ]);
      expect(probe.status).toBe(0);
      const info = JSON.parse(probe.stdout.toString()) as {
        format: { format_name: string; duration: string };
        streams: { codec_name: string }[];
      };
      expect(info.format.format_name).toContain('webm');
      expect(info.streams.map((stream) => stream.codec_name)).toContain('vp9');
      expect(Number(info.format.duration)).toBeGreaterThan(4);
    }

    // Preview: right to left, the deck's words.
    const [preview] = await Promise.all([
      app.waitForEvent('window'),
      page.getByRole('button', { name: 'Entire Project', exact: true }).click(),
    ]);
    await expect(preview.locator('.vo-player')).toHaveAttribute('dir', 'rtl');
    await expect(preview.locator('.vo-player-stage')).toContainText('Read this first');
    await preview.close();

    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const publish = page.getByTestId('publish-dialog');
    await publish.getByRole('button', { name: 'Choose folder…' }).click();
    await publish.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-result')).toContainText('Published');
    await publish.getByRole('button', { name: 'Close' }).click();

    // Nothing in all that left the machine.
    const requests = await app.evaluate(
      () => (globalThis as unknown as { voRequests: string[] }).voRequests,
    );
    expect(requests.some((url) => url.startsWith('vedraopus-asset:'))).toBe(true);
    expect(leavingRequests(requests)).toEqual([]);
  } finally {
    await second.app.close();
  }

  // Published: in Arabic, right to left, the deck's slide first and its picture described.
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await page.route(/^https?:\/\//, (route) => route.abort());
    const [folder] = readdirSync(out);
    await page.goto(pathToFileURL(join(out, folder!, 'index.html')).href);
    const root = page.locator('.vo-player');
    await expect(root).toHaveAttribute('lang', 'ar');
    await expect(root).toHaveAttribute('dir', 'rtl');
    const stage = page.locator('.vo-player-stage');
    await expect(stage).toContainText('Read this first');
    await expect(stage.getByRole('img', { name: 'The company logo' })).toBeVisible();
    await expect(page.locator('.vo-player-position')).toContainText('4');
  } finally {
    await browser.close();
  }
});

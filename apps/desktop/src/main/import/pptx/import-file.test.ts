import type { AudioObject, ImageObject, SceneObject, VideoObject } from '@vedraopus/model';
import { spawnSync } from 'node:child_process';
import { createWriteStream, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { afterAll, describe, expect, it } from 'vitest';
import { ZipFile } from 'yazl';
import { findMediaTools, vendorFolder } from '../../media/ffmpeg';
import { findLibreOffice, libreOfficeVendorFolder } from '../libreoffice';
import type { ImportStep } from '../progress';
import { importPowerPointFile } from './import-file';
import { buildDeck, chartContent, PIXEL_PNG, smartArtContent } from './test-deck';

/** Sound and video from a deck, through the media pipeline (docs/briefs/P11.1-pptx-import.md, part C). */

const EMU = 9525;
const temp = mkdtempSync(join(tmpdir(), 'vo-pptx-media-test-'));
afterAll(() => rmSync(temp, { recursive: true, force: true }));

const tools = findMediaTools([
  process.env['VEDRAOPUS_FFMPEG_DIR'],
  vendorFolder(resolve(import.meta.dirname, '../../../../../..')),
]);

/** A picture-frame media object, as PowerPoint 2010 and later write one. */
const mediaPic = (id: number, name: string, kind: 'videoFile' | 'audioFile', x: number) =>
  `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${name}"/><p:cNvPicPr/><p:nvPr><a:${kind} r:link="rId${id}1"/><p:extLst><p:ext uri="{DAA4B4D4-6D71-4841-9C94-3DA1C1D0FE3B}"><p14:media xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" r:embed="rId${id}2"/></p:ext></p:extLst></p:nvPr></p:nvPicPr><p:blipFill><a:blip r:embed="rIdPoster"/><a:stretch/></p:blipFill><p:spPr><a:xfrm><a:off x="${x * EMU}" y="0"/><a:ext cx="${320 * EMU}" cy="${180 * EMU}"/></a:xfrm></p:spPr></p:pic>`;

async function writeDeck(path: string, media: Record<string, Uint8Array>): Promise<void> {
  const parts = buildDeck({
    slides: [
      {
        shapes: mediaPic(4, 'Clip', 'videoFile', 0) + mediaPic(5, 'Narration', 'audioFile', 400),
        rels: {
          rId41: '../media/media1.webm',
          rId42: '../media/media1.webm',
          rId51: '../media/media2.wav',
          rId52: '../media/media2.wav',
          rIdPoster: '../media/image1.png',
        },
      },
    ],
    media: { ...media, 'ppt/media/image1.png': PIXEL_PNG },
  });
  const zip = new ZipFile();
  for (const [name, bytes] of parts) zip.addBuffer(Buffer.from(bytes), name);
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(path));
}

describe('an import’s progress (B7)', () => {
  it('reports its stages, and each media file as it comes in', async () => {
    const deck = join(temp, 'progress.pptx');
    await writeDeck(deck, {
      'ppt/media/media1.webm': new Uint8Array([1, 2, 3]),
      'ppt/media/media2.wav': new Uint8Array([4, 5, 6]),
    });
    const steps: ImportStep[] = [];
    await importPowerPointFile(deck, join(temp, 'ws-progress'), undefined, null, (step) =>
      steps.push(step),
    );
    // No charts to draw, so no drawing stage; two media objects, the video then the sound.
    expect(steps).toEqual([
      { stage: 'reading', done: 0, total: 0 },
      { stage: 'slides', done: 0, total: 0 },
      { stage: 'media', done: 0, total: 2, file: 'Clip', fraction: 0 },
      { stage: 'media', done: 1, total: 2, file: 'Narration', fraction: 0 },
    ]);
  });
});

describe('sound and video in a deck', () => {
  it('stay as reported placeholders when the media tools are not there', async () => {
    const deck = join(temp, 'no-tools.pptx');
    await writeDeck(deck, {
      'ppt/media/media1.webm': new Uint8Array([1, 2, 3]),
      'ppt/media/media2.wav': new Uint8Array([4, 5, 6]),
    });
    const { project, report } = await importPowerPointFile(deck, join(temp, 'ws-none'));
    const objects = project.scenes[0]!.slides[0]!.baseLayer.objects;
    expect(objects.map((object) => object.type)).toEqual(['shape', 'shape']);
    expect(JSON.stringify(objects[0])).toContain('[Video]');
    expect(report).toEqual([
      {
        slide: 1,
        outcome: 'placeholder',
        what: '“Clip” could not be imported: the media tools are not installed',
      },
      {
        slide: 1,
        outcome: 'placeholder',
        what: '“Narration” could not be imported: the media tools are not installed',
      },
    ]);
  });

  it.skipIf(!tools)('come through the media pipeline into the stand-ins’ places', async () => {
    const make = (name: string, args: string[]) => {
      const out = join(temp, name);
      const run = spawnSync(
        tools!.ffmpeg,
        ['-hide_banner', '-loglevel', 'error', '-y', ...args, out],
        {
          stdio: 'inherit',
        },
      );
      expect(run.status).toBe(0);
      return new Uint8Array(readFileSync(out));
    };
    const webm = make('clip.webm', [
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=320x180:rate=25:duration=2',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=2',
      '-c:v',
      'libvpx-vp9',
      '-c:a',
      'libopus',
      '-shortest',
    ]);
    const wav = make('voice.wav', ['-f', 'lavfi', '-i', 'sine=frequency=330:duration=1']);
    const deck = join(temp, 'with-media.pptx');
    await writeDeck(deck, { 'ppt/media/media1.webm': webm, 'ppt/media/media2.wav': wav });
    const { project, report } = await importPowerPointFile(deck, join(temp, 'ws-media'), {
      tools: tools!,
    });
    const [video, audio] = project.scenes[0]!.slides[0]!.baseLayer.objects as [
      VideoObject,
      AudioObject,
    ];
    expect(video.type).toBe('video');
    expect(video.name).toBe('Clip');
    expect(video.frame).toMatchObject({ x: 0, y: 0, width: 320, height: 180 });
    expect(video.props.length).toBeCloseTo(2, 0);
    expect(project.assets[video.props.asset]).toMatchObject({ kind: 'video', ext: 'webm' });
    expect(audio.type).toBe('audio');
    expect(project.assets[audio.props.asset]).toMatchObject({ kind: 'audio', ext: 'mp3' });
    expect(report).toEqual([]);
  });
});

/** Charts and SmartArt, drawn by LibreOffice (part D). */
const soffice = findLibreOffice([
  process.env['VEDRAOPUS_LIBREOFFICE_DIR'],
  libreOfficeVendorFolder(resolve(import.meta.dirname, '../../../../../..')),
]);

async function writeParts(path: string, parts: Map<string, Uint8Array>): Promise<void> {
  const zip = new ZipFile();
  for (const [name, bytes] of parts) zip.addBuffer(Buffer.from(bytes), name);
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(path));
}

/** A chart, SmartArt, and a chart whose part is missing, which nothing can draw. */
async function writeChartDeck(path: string): Promise<void> {
  const box = (x: number, y: number, w: number, h: number) => ({
    x: x * EMU,
    y: y * EMU,
    cx: w * EMU,
    cy: h * EMU,
  });
  const chart = chartContent(7, box(40, 40, 500, 360));
  const smartArt = smartArtContent(8, box(600, 40, 600, 160));
  const empty = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="9" name="Lost chart" descr="Drill times by month"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${600 * EMU}" y="${400 * EMU}"/><a:ext cx="${300 * EMU}" cy="${200 * EMU}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"/></a:graphic></p:graphicFrame>`;
  await writeParts(
    path,
    buildDeck({
      slides: [
        {
          shapes: chart.shapes + smartArt.shapes + empty,
          rels: { ...chart.rels, ...smartArt.rels },
        },
      ],
      media: { ...chart.parts, ...smartArt.parts },
    }),
  );
}

describe('charts and SmartArt in a deck', () => {
  it('stay as reported placeholders when LibreOffice is not there', async () => {
    const deck = join(temp, 'charts-none.pptx');
    await writeChartDeck(deck);
    const { project, report } = await importPowerPointFile(deck, join(temp, 'ws-charts-none'));
    const objects = project.scenes[0]!.slides[0]!.baseLayer.objects;
    expect(objects.map((object) => object.type)).toEqual(['shape', 'shape', 'shape']);
    expect(report.map((item) => item.what)).toEqual([
      '“Chart 7” is a chart; it could not be drawn as a picture, as LibreOffice is not installed',
      '“Diagram 8” is SmartArt; it could not be drawn as a picture, as LibreOffice is not installed',
      '“Lost chart” is a chart; it could not be drawn as a picture, as LibreOffice is not installed',
    ]);
  });

  it('stay as reported placeholders when LibreOffice cannot be started', async () => {
    const deck = join(temp, 'charts-broken.pptx');
    await writeChartDeck(deck);
    const { report } = await importPowerPointFile(
      deck,
      join(temp, 'ws-charts-broken'),
      undefined,
      join(temp, 'no-such-folder', 'soffice'),
    );
    expect(report).toHaveLength(3);
    expect(report.every((item) => item.slide === 1 && item.outcome === 'placeholder')).toBe(true);
    // In the order they were drawn: one run for each group of about the same width.
    const chartItem = report.find((item) => item.what.startsWith('“Chart 7”'))!;
    expect(chartItem.what).toMatch(
      /^“Chart 7” is a chart; it could not be drawn: LibreOffice could not be started/,
    );
  });

  it.skipIf(!soffice)(
    'become pictures in their places, drawn by LibreOffice; what it cannot draw stays',
    async () => {
      const deck = join(temp, 'charts.pptx');
      await writeChartDeck(deck);
      const plain = await importPowerPointFile(deck, join(temp, 'ws-charts-plain'));
      const standIns = plain.project.scenes[0]!.slides[0]!.baseLayer.objects;
      const { project, report } = await importPowerPointFile(
        deck,
        join(temp, 'ws-charts'),
        undefined,
        soffice,
      );
      const [chart, smartArt, lost] = project.scenes[0]!.slides[0]!.baseLayer.objects as [
        ImageObject,
        ImageObject,
        SceneObject,
      ];
      expect(chart.type).toBe('image');
      expect(chart.name).toBe('Chart 7');
      expect(chart.frame).toMatchObject({ x: 40, y: 40, width: 500, height: 360 });
      // Drawn at two to three times the size, for sharp edges on high-density screens,
      // whatever this machine's screen is: 1024 wide for 500 (the group up to 512 wide).
      expect(project.assets[chart.props.asset]).toMatchObject({
        kind: 'image',
        ext: 'png',
        width: 1024,
      });
      const drawnShape = (asset: string, frame: { width: number; height: number }) => {
        const { width, height } = project.assets[asset] as { width: number; height: number };
        return Math.abs(height / width - frame.height / frame.width) < 0.01;
      };
      expect(drawnShape(chart.props.asset, chart.frame)).toBe(true);
      expect(smartArt.type).toBe('image');
      expect(project.assets[smartArt.props.asset]).toMatchObject({ width: 1448 });
      expect(drawnShape(smartArt.props.asset, smartArt.frame)).toBe(true);
      expect(chart.props.asset).not.toBe(smartArt.props.asset);
      // The stand-in's place is kept, with its description.
      expect(lost.type).toBe('shape');
      expect(lost.a11y.altText).toBe('Drill times by month');
      expect(standIns.map((object) => object.frame)).toEqual(
        project.scenes[0]!.slides[0]!.baseLayer.objects.map((object) => object.frame),
      );
      expect(report).toEqual([
        { slide: 1, outcome: 'approximated', what: '“Chart 7” is a chart, drawn as a picture' },
        { slide: 1, outcome: 'approximated', what: '“Diagram 8” is SmartArt, drawn as a picture' },
        {
          slide: 1,
          outcome: 'placeholder',
          what: '“Lost chart” is a chart; LibreOffice could not draw it',
        },
      ]);
    },
    120_000,
  );
});

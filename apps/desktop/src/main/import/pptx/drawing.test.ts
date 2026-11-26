import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convertPptx } from './convert';
import { drawingDeck } from './drawing';
import { readZipParts } from './import-file';
import {
  buildDeck,
  chartContent,
  PIXEL_PNG,
  smartArtContent,
  smokeDeck,
  spShape,
} from './test-deck';
import { all, attr, one, path, readPart, relationships } from './xml';

/** Content only a picture can show, alone on a deck of its own (docs/briefs/P11.1-pptx-import.md, part D). */

const EMU = 9525;
const box = (x: number, y: number, w: number, h: number) => ({
  x: x * EMU,
  y: y * EMU,
  cx: w * EMU,
  cy: h * EMU,
});
const decoder = new TextDecoder();

function deckWithEverything() {
  const chart = chartContent(7, box(100, 300, 400, 300));
  const smartArt = smartArtContent(8, box(600, 300, 500, 200));
  const emf = `<p:pic><p:nvPicPr><p:cNvPr id="9" name="Logo" descr="Our logo"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdEmf"/><a:stretch/></p:blipFill><p:spPr><a:xfrm rot="5400000"><a:off x="${20 * EMU}" y="${20 * EMU}"/><a:ext cx="${64 * EMU}" cy="${32 * EMU}"/></a:xfrm></p:spPr></p:pic>`;
  return buildDeck({
    slides: [
      {
        shapes:
          spShape({ id: 2, name: 'Title words', box: box(0, 0, 400, 80), textBox: true }) +
          chart.shapes +
          smartArt.shapes +
          emf,
        rels: { ...chart.rels, ...smartArt.rels, rIdEmf: '../media/image2.emf' },
      },
      {
        shapes: `<p:pic><p:nvPicPr><p:cNvPr id="3" name="Photo"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdPhoto"/></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${EMU}" cy="${EMU}"/></a:xfrm></p:spPr></p:pic>`,
        rels: { rIdPhoto: '../media/image1.png' },
      },
    ],
    media: {
      ...chart.parts,
      ...smartArt.parts,
      'ppt/media/image1.png': PIXEL_PNG,
      'ppt/media/image2.emf': new Uint8Array([1, 0, 0, 0]),
    },
    masterShapes: spShape({
      id: 50,
      name: 'Master logo',
      box: box(0, 600, 100, 100),
      paragraphs: '<a:p><a:r><a:t>Footer words</a:t></a:r></a:p>',
    }),
  });
}

const convert = (parts: Map<string, Uint8Array>) =>
  convertPptx(parts, { fileName: 'Deck', storePicture: () => ({ hash: 'a'.repeat(64) }) });

describe('content to draw', () => {
  it('charts, SmartArt and pictures in formats courses do not use wait for LibreOffice, in stand-ins', () => {
    const result = convert(deckWithEverything());
    expect(result.drawings.map((d) => d.what)).toEqual([
      '“Chart 7” is a chart',
      '“Diagram 8” is SmartArt',
      '“Logo” is a EMF picture',
    ]);
    // The report is the importer's to write, once it knows whether they were drawn.
    expect(result.report.filter((item) => item.outcome === 'placeholder')).toEqual([]);
    const objects = result.project.scenes[0]!.slides[0]!.baseLayer.objects;
    const logo = objects.find((object) => object.id === result.drawings[2]!.objectId)!;
    expect(logo.frame).toMatchObject({ x: 20, y: 20, width: 64, height: 32, rotation: 90 });
    expect(logo.a11y.altText).toBe('Our logo');
    expect(result.drawings[0]!.frame).toMatchObject({ x: 100, y: 300, width: 400, height: 300 });
    expect(result.presentationPart).toBe('ppt/presentation.xml');
  });
});

describe('a drawing’s own deck', () => {
  const parts = deckWithEverything();
  const result = convert(parts);

  it('has one slide, the size of the content, with the content alone at its top left', () => {
    const deck = drawingDeck(parts, result.presentationPart, result.drawings[0]!);
    const presentation = readPart(deck, 'ppt/presentation.xml');
    expect(all(one(presentation, 'sldIdLst'), 'sldId')).toHaveLength(1);
    expect(one(presentation, 'sldSz')!.attrs).toEqual({
      cx: String(400 * EMU),
      cy: String(300 * EMU),
    });
    const slide = readPart(deck, 'ppt/slides/slide1.xml');
    const tree = path(slide, 'cSld', 'spTree')!;
    const frames = all(tree, 'graphicFrame');
    expect(frames).toHaveLength(1);
    expect(all(tree, 'sp')).toHaveLength(0);
    expect(all(tree, 'pic')).toHaveLength(0);
    const xfrm = one(frames[0], 'xfrm')!;
    // A graphic frame's transform is PresentationML; its offset and size are DrawingML.
    expect([xfrm.name, one(xfrm, 'off')!.name, one(xfrm, 'ext')!.name]).toEqual([
      'p:xfrm',
      'a:off',
      'a:ext',
    ]);
    expect(one(xfrm, 'off')!.attrs).toEqual({ x: '0', y: '0' });
    expect(one(xfrm, 'ext')!.attrs).toEqual({ cx: String(400 * EMU), cy: String(300 * EMU) });
    // No background of its own, and nothing of the layout's or master's.
    expect(path(slide, 'cSld', 'bg', 'bgPr', 'noFill')).toBeDefined();
    expect(attr(slide, 'showMasterSp')).toBe('0');
    const master = readPart(deck, 'ppt/slideMasters/slideMaster1.xml');
    expect(all(path(master, 'cSld', 'spTree'), 'sp')).toHaveLength(0);
    expect(path(master, 'txStyles')).toBeDefined();
  });

  it('holds only the parts its content reaches', () => {
    const deck = drawingDeck(parts, result.presentationPart, result.drawings[0]!);
    expect([...deck.keys()].sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'ppt/_rels/presentation.xml.rels',
      'ppt/charts/chart7.xml',
      'ppt/presentation.xml',
      'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
      'ppt/slideLayouts/slideLayout1.xml',
      'ppt/slideMasters/_rels/slideMaster1.xml.rels',
      'ppt/slideMasters/slideMaster1.xml',
      'ppt/slides/_rels/slide1.xml.rels',
      'ppt/slides/slide1.xml',
      'ppt/theme/theme1.xml',
    ]);
    const types = decoder.decode(deck.get('[Content_Types].xml'));
    expect(types).not.toContain('slide2.xml');
    expect(types).toContain('/ppt/slides/slide1.xml');
    expect([...relationships(deck, 'ppt/slides/slide1.xml').keys()].sort()).toEqual([
      'rId1',
      'rIdChart7',
    ]);
  });

  it('keeps SmartArt’s drawing, which its data names through the slide', () => {
    const deck = drawingDeck(parts, result.presentationPart, result.drawings[1]!);
    expect(deck.has('ppt/diagrams/data8.xml')).toBe(true);
    expect(deck.has('ppt/diagrams/drawing8.xml')).toBe(true);
    expect(deck.has('ppt/charts/chart7.xml')).toBe(false);
  });

  it('puts a picture at the top left unturned (the picture object keeps the turn)', () => {
    const deck = drawingDeck(parts, result.presentationPart, result.drawings[2]!);
    const pic = one(path(readPart(deck, 'ppt/slides/slide1.xml'), 'cSld', 'spTree'), 'pic')!;
    const xfrm = path(pic, 'spPr', 'xfrm')!;
    expect(attr(xfrm, 'rot')).toBeUndefined();
    expect(one(xfrm, 'ext')!.attrs).toEqual({ cx: String(64 * EMU), cy: String(32 * EMU) });
    expect(deck.has('ppt/media/image2.emf')).toBe(true);
    expect(deck.has('ppt/media/image1.png')).toBe(false);
  });

  it('is a deck the importer itself reads back', () => {
    const deck = drawingDeck(parts, result.presentationPart, result.drawings[0]!);
    const again = convert(deck);
    expect(again.project.stage).toEqual({ width: 400, height: 300 });
    expect(again.project.scenes[0]!.slides).toHaveLength(1);
    expect(again.drawings).toHaveLength(1);
    expect(again.drawings[0]!.frame).toMatchObject({ x: 0, y: 0, width: 400, height: 300 });
  });
});

describe('the smoke deck', () => {
  it('in fixtures/libreoffice is the one the test builder makes', async () => {
    const fixture = await readZipParts(
      resolve(import.meta.dirname, '../../../../../../fixtures/libreoffice/smoke.pptx'),
    );
    const built = smokeDeck();
    expect([...fixture.keys()].sort()).toEqual([...built.keys()].sort());
    // Placeholder shape ids count up across the builder's calls; they do not change the drawing.
    const words = (bytes: Uint8Array | undefined) =>
      decoder.decode(bytes).replace(/<p:cNvPr id="\d+" name="(Title|Text) Placeholder/g, '<ph $1');
    for (const [name, bytes] of built) {
      expect(words(fixture.get(name)), name).toBe(words(bytes));
    }
  });
});

import { parseXml } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { handoutDocumentParts } from './handout-document';
import type { HandoutDocument } from './handout-document';

/** The handout as a Word document (docs/briefs/P11.3-video-and-handout.md, part B). */

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const slide = (number: number, notes: string[] = []) => ({
  number,
  title: `Slide <${number}> & more`,
  notes,
  png: PNG,
  width: 1280,
  height: 720,
});
const text = (parts: Map<string, Uint8Array>, name: string) =>
  new TextDecoder().decode(parts.get(name));

describe('the Word handout', () => {
  const handout: HandoutDocument = {
    title: 'Fire safety',
    language: 'en',
    layout: 'notes',
    slides: [slide(1, ['Say hello.', '• Exits']), slide(2)],
  };
  const parts = handoutDocumentParts(handout);

  it('has the parts Word needs, each XML part well formed', () => {
    expect([...parts.keys()].sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'word/_rels/document.xml.rels',
      'word/document.xml',
      'word/media/slide1.png',
      'word/media/slide2.png',
      'word/styles.xml',
    ]);
    for (const [name] of parts) {
      if (name.endsWith('.xml') || name.endsWith('.rels'))
        expect(() => parseXml(text(parts, name)), name).not.toThrow();
    }
    expect(text(parts, '[Content_Types].xml')).toContain('Extension="png" ContentType="image/png"');
  });

  it('puts each slide’s picture, described, with its number and title, then its notes', () => {
    const document = text(parts, 'word/document.xml');
    expect(document).toContain('Fire safety');
    expect(document).toContain('1. Slide &lt;1&gt; &amp; more');
    expect(document).toContain('descr="1. Slide &lt;1&gt; &amp; more"');
    expect(document).toContain('r:embed="rIdSlide2"');
    expect(document).toContain('Say hello.');
    expect(document).toContain('• Exits');
    // A page each: one break between two slides.
    expect(document.match(/w:type="page"/g)).toHaveLength(1);
    const rels = text(parts, 'word/_rels/document.xml.rels');
    expect(rels).toContain('Id="rIdSlide1"');
    expect(rels).toContain('Target="media/slide2.png"');
    expect(parts.get('word/media/slide1.png')).toEqual(PNG);
    // The picture keeps the slide's shape: 6.3 inches wide, 16:9.
    expect(document).toContain(
      `cx="${Math.round(6.3 * 914_400)}" cy="${Math.round((Math.round(6.3 * 914_400) * 720) / 1280)}"`,
    );
  });

  it('three a page with lines: a table each, and a break after every third', () => {
    const lines = handoutDocumentParts({
      title: 'Fire safety',
      language: 'en',
      layout: 'lines',
      slides: [1, 2, 3, 4].map((n) => slide(n, ['ignored here'])),
    });
    const document = text(lines, 'word/document.xml');
    expect(document.match(/<w:tbl>/g)).toHaveLength(4);
    expect(document.match(/w:type="page"/g)).toHaveLength(1);
    expect(document).not.toContain('ignored here');
  });

  it('is in the course’s language, and right to left for an Arabic course (Phase 11 review)', () => {
    const english = text(parts, 'word/styles.xml');
    expect(english).toContain('<w:lang w:val="en"/>');
    expect(english).not.toContain('<w:bidi/>');
    expect(text(parts, 'word/document.xml')).not.toContain('bidiVisual');

    const arabic = handoutDocumentParts({
      title: 'السلامة من الحرائق',
      language: 'ar',
      layout: 'lines',
      slides: [slide(1)],
    });
    const styles = text(arabic, 'word/styles.xml');
    expect(() => parseXml(styles)).not.toThrow();
    expect(styles).toContain('<w:lang w:val="ar" w:bidi="ar"/>');
    // Every paragraph right to left, and the table's columns mirrored: the slide on the right.
    expect(styles).toContain('<w:pPrDefault><w:pPr><w:bidi/></w:pPr></w:pPrDefault>');
    const document = text(arabic, 'word/document.xml');
    expect(() => parseXml(document)).not.toThrow();
    expect(document).toContain('<w:tblPr><w:bidiVisual/><w:tblW');
    expect(document).toContain('السلامة من الحرائق');
  });
});

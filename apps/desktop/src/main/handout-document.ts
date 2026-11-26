/**
 * The handout as a Word document (docs/briefs/P11.3-video-and-handout.md,
 * part B): each slide as a picture with its number and title, and its notes,
 * or three slides a page with lines beside them. Our own small .docx writer.
 */
import { isRightToLeft } from '@vedraopus/model';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { ZipFile } from 'yazl';

export interface HandoutDocumentSlide {
  number: number;
  title: string;
  /** The notes' paragraphs, as plain text; a list item starts with "• ". */
  notes: string[];
  /** A picture of the slide, and its size in pixels. */
  png: Uint8Array;
  width: number;
  height: number;
}

export interface HandoutDocument {
  title: string;
  /** The course's language tag: the document's language, and right to left for Arabic and the like. */
  language: string;
  layout: 'notes' | 'lines';
  slides: HandoutDocumentSlide[];
}

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const NS = [
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
].join(' ');

const run = (text: string, props = '') =>
  `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${escape(text)}</w:t></w:r>`;
const paragraph = (runs: string, props = '') =>
  `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${runs}</w:p>`;
const pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

/** 914 400 EMU an inch; a picture's width on the page in inches. */
const EMU_PER_INCH = 914_400;
const PICTURE_INCHES = { notes: 6.3, lines: 3.2 };

/** A slide's picture, inline, `inches` wide, described for screen readers. */
function picture(slide: HandoutDocumentSlide, index: number, inches: number): string {
  const cx = Math.round(inches * EMU_PER_INCH);
  const cy = Math.round((cx * slide.height) / Math.max(1, slide.width));
  const id = index + 1;
  const name = `Slide ${slide.number}`;
  // Read out in the course's language: its number and title, no English word.
  const descr = escape(`${slide.number}. ${slide.title}`);
  return (
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="${name}" descr="${descr}"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="slide${id}.png" descr="${descr}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="rIdSlide${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `<a:ln w="9525"><a:solidFill><a:srgbClr val="999999"/></a:solidFill></a:ln></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
  );
}

const heading = (slide: HandoutDocumentSlide) =>
  paragraph(run(`${slide.number}. ${slide.title}`), '<w:pStyle w:val="Heading2"/>');

const lines = Array.from(
  { length: 8 },
  () =>
    `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="AAAAAA"/></w:pBdr><w:spacing w:before="160"/></w:pPr></w:p>`,
).join('');

/** The document.xml. */
export function handoutDocumentXml(handout: HandoutDocument): string {
  // Right to left, the table's columns are mirrored too: the slide on the right.
  const tableDirection = isRightToLeft(handout.language) ? '<w:bidiVisual/>' : '';
  const body: string[] = [paragraph(run(handout.title), '<w:pStyle w:val="Title"/>')];
  handout.slides.forEach((slide, index) => {
    if (handout.layout === 'notes') {
      if (index > 0) body.push(pageBreak);
      body.push(heading(slide), paragraph(picture(slide, index, PICTURE_INCHES.notes)));
      for (const note of slide.notes) body.push(paragraph(run(note)));
    } else {
      if (index > 0 && index % 3 === 0) body.push(pageBreak);
      body.push(
        `<w:tbl><w:tblPr>${tableDirection}<w:tblW w:w="9600" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr>` +
          `<w:tblGrid><w:gridCol w:w="4800"/><w:gridCol w:w="4800"/></w:tblGrid><w:tr>` +
          `<w:tc><w:tcPr><w:tcW w:w="4800" w:type="dxa"/></w:tcPr>${heading(slide)}${paragraph(picture(slide, index, PICTURE_INCHES.lines))}</w:tc>` +
          `<w:tc><w:tcPr><w:tcW w:w="4800" w:type="dxa"/></w:tcPr>${lines}</w:tc>` +
          `</w:tr></w:tbl>`,
        paragraph(''),
      );
    }
  });
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<w:document ${NS}><w:body>`,
    ...body,
    // A4 portrait, with margins of about 0.7 inch.
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000" w:header="500" w:footer="500" w:gutter="0"/></w:sectPr>',
    '</w:body></w:document>',
  ].join('');
}

/**
 * Title and heading styles, so the document has an outline. The defaults carry the
 * course's language, and every paragraph runs right to left in a right-to-left one.
 */
const styles = (language: string) => {
  const rtl = isRightToLeft(language);
  const lang = escape(language);
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/>' +
    `<w:lang w:val="${lang}"${rtl ? ` w:bidi="${lang}"` : ''}/></w:rPr></w:rPrDefault>` +
    (rtl ? '<w:pPrDefault><w:pPr><w:bidi/></w:pPr></w:pPrDefault>' : '') +
    '</w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="120" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>' +
    '</w:styles>'
  );
};

/** Every part of the .docx, by name. */
export function handoutDocumentParts(handout: HandoutDocument): Map<string, Uint8Array> {
  const parts = new Map<string, Uint8Array>();
  const text = (name: string, xml: string) => parts.set(name, new TextEncoder().encode(xml));
  text(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="png" ContentType="image/png"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '</Types>',
  );
  text(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>',
  );
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  text(
    'word/_rels/document.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      `<Relationship Id="rIdStyles" Type="${REL}/styles" Target="styles.xml"/>` +
      handout.slides
        .map(
          (_, index) =>
            `<Relationship Id="rIdSlide${index + 1}" Type="${REL}/image" Target="media/slide${index + 1}.png"/>`,
        )
        .join('') +
      '</Relationships>',
  );
  text('word/styles.xml', styles(handout.language));
  text('word/document.xml', handoutDocumentXml(handout));
  handout.slides.forEach((slide, index) =>
    parts.set(`word/media/slide${index + 1}.png`, slide.png),
  );
  return parts;
}

/** Write the handout as a .docx at `path`. */
export async function writeHandoutDocument(path: string, handout: HandoutDocument): Promise<void> {
  const zip = new ZipFile();
  for (const [name, bytes] of handoutDocumentParts(handout))
    zip.addBuffer(Buffer.from(bytes), name);
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(path));
}

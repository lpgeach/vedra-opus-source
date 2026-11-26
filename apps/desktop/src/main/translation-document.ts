/**
 * The two-column translation document (docs/briefs/P10.3-translation.md, part B):
 * a Word document (.docx) with a table of each piece of text's id, its source
 * and a column for the translation, and reading the translations back. Written
 * with yazl and read with yauzl, as projects are; the XML is read by the
 * model's reader.
 */
import { parseXml } from '@vedraopus/model';
import type { XmlElement, XmlNode } from '@vedraopus/model';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import type { Entry, ZipFile as ZipReader } from 'yauzl';
import { ZipFile } from 'yazl';

export interface DocumentRow {
  id: string;
  /** The words with bracket tags (`[1]…[/1]`, `[br]`). */
  source: string;
  note: string;
}

export interface TranslationDocument {
  sourceLanguage: string;
  targetLanguage: string;
  rows: { id: string; source: string; target: string }[];
}

export class TranslationDocumentError extends Error {}

const MAX_DOCUMENT_XML = 50 * 1024 * 1024;

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** A run of text, with spaces kept. */
const run = (text: string, props = '') =>
  `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${escape(text)}</w:t></w:r>`;
const paragraph = (runs: string) => `<w:p>${runs}</w:p>`;
const cell = (width: number, paragraphs: string) =>
  `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${paragraphs || '<w:p/>'}</w:tc>`;

const COLUMNS = [2600, 5900, 5900];

/** The document.xml of a translation document. */
export function documentXml(options: {
  title: string;
  sourceLanguage: string;
  targetLanguage: string;
  rows: readonly DocumentRow[];
}): string {
  const grey = '<w:color w:val="666666"/><w:sz w:val="16"/>';
  const bold = '<w:b/>';
  const header = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${[
    'Id',
    options.sourceLanguage,
    options.targetLanguage,
  ]
    .map((text, index) => cell(COLUMNS[index]!, paragraph(run(text, bold))))
    .join('')}</w:tr>`;
  const rows = options.rows
    .map(
      (row) =>
        `<w:tr>${cell(COLUMNS[0]!, paragraph(run(row.id, grey)) + paragraph(run(row.note, grey)))}${cell(
          COLUMNS[1]!,
          paragraph(run(row.source)),
        )}${cell(COLUMNS[2]!, '')}</w:tr>`,
    )
    .join('');
  const border = (side: string) =>
    `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`;
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<w:document xmlns:w="${W}"><w:body>`,
    paragraph(run(options.title, '<w:b/><w:sz w:val="32"/>')),
    paragraph(
      run(
        `Translate from ${options.sourceLanguage} into ${options.targetLanguage}: write each translation in the third column. ` +
          'Keep tags such as [1] and [/1] round the words they mark, and [br] where a line breaks. ' +
          'Leave the first two columns as they are.',
      ),
    ),
    `<w:tbl><w:tblPr><w:tblW w:w="${COLUMNS.reduce((a, b) => a + b)}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${[
      'top',
      'left',
      'bottom',
      'right',
      'insideH',
      'insideV',
    ]
      .map(border)
      .join(
        '',
      )}</w:tblBorders></w:tblPr><w:tblGrid>${COLUMNS.map((width) => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>${header}${rows}</w:tbl>`,
    // Landscape A4, so the columns have room.
    '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000" w:header="500" w:footer="500" w:gutter="0"/></w:sectPr>',
    '</w:body></w:document>',
  ].join('');
}

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '</Types>';
const RELATIONSHIPS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '</Relationships>';

/** Write a translation document to `path`. */
export async function writeTranslationDocument(
  path: string,
  options: Parameters<typeof documentXml>[0],
): Promise<void> {
  const zip = new ZipFile();
  zip.addBuffer(Buffer.from(CONTENT_TYPES), '[Content_Types].xml');
  zip.addBuffer(Buffer.from(RELATIONSHIPS), '_rels/.rels');
  zip.addBuffer(Buffer.from(documentXml(options)), 'word/document.xml');
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(path));
}

// ------------------------------------------------------------------ reading

function openZip(path: string): Promise<ZipReader> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true, autoClose: true }, (error, zip) => {
      if (error) reject(new TranslationDocumentError('This is not a Word document (.docx).'));
      else resolve(zip);
    });
  });
}

/** The text of one entry, or null when the document has none by that name. */
function readEntry(zip: ZipReader, name: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    let found = false;
    zip.on('entry', (entry: Entry) => {
      if (entry.fileName !== name) {
        zip.readEntry();
        return;
      }
      found = true;
      if (entry.uncompressedSize > MAX_DOCUMENT_XML) {
        reject(new TranslationDocumentError('This document is too large to read.'));
        return;
      }
      zip.openReadStream(entry, (error, stream) => {
        if (error) return reject(error);
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        stream.on('error', reject);
      });
    });
    zip.on('end', () => {
      if (!found) resolve(null);
    });
    zip.on('error', reject);
    zip.readEntry();
  });
}

const local = (name: string) => name.slice(name.indexOf(':') + 1);
const elements = (node: XmlElement, name: string) =>
  node.children.filter(
    (child): child is XmlElement => typeof child !== 'string' && local(child.name) === name,
  );

/**
 * A paragraph's words as Word keeps them: every `w:t` (inserted text
 * included, deleted text left out), tabs and breaks, however Word split the runs.
 */
function paragraphText(p: XmlElement): string {
  let text = '';
  const visit = (node: XmlNode) => {
    if (typeof node === 'string') return;
    const name = local(node.name);
    if (name === 't') {
      text += node.children.filter((child): child is string => typeof child === 'string').join('');
      return;
    }
    if (name === 'tab') text += '\t';
    else if (name === 'br' || name === 'cr') text += '\n';
    // Deleted text is `w:delText` inside `w:del`: not ours to read.
    if (name === 'del') return;
    node.children.forEach(visit);
  };
  p.children.forEach(visit);
  return text;
}

/** A cell's paragraphs, one a line. */
function cellText(tc: XmlElement): string {
  return elements(tc, 'p').map(paragraphText).join('\n');
}

/** The table's rows: each row's cells as text. Cells merged by Word are read as they are. */
function rowsOf(table: XmlElement): string[][] {
  return elements(table, 'tr').map((tr) => elements(tr, 'tc').map(cellText));
}

/** Read the translations out of a translation document. */
export async function readTranslationDocument(path: string): Promise<TranslationDocument> {
  const zip = await openZip(path);
  const xml = await readEntry(zip, 'word/document.xml');
  if (xml === null) throw new TranslationDocumentError('This is not a Word document (.docx).');
  let document: XmlElement;
  try {
    document = parseXml(xml);
  } catch {
    throw new TranslationDocumentError('This Word document is damaged: its text cannot be read.');
  }
  const body = elements(document, 'body')[0];
  const table = body ? elements(body, 'tbl')[0] : undefined;
  if (!table) {
    throw new TranslationDocumentError('This document has no table of translations in it.');
  }
  const [header, ...rows] = rowsOf(table);
  if (!header || header.length < 3 || header[0]!.trim() !== 'Id') {
    throw new TranslationDocumentError(
      'This is not a translation document: its table does not start with Id and two languages.',
    );
  }
  const sourceLanguage = header[1]!.trim();
  const targetLanguage = header[2]!.trim();
  return {
    sourceLanguage,
    targetLanguage,
    rows: rows
      .filter((cells) => cells.length >= 3 && cells[0]!.trim())
      .map((cells) => ({
        // The id is the cell's first line; the note under it is for the translator.
        id: cells[0]!.split('\n')[0]!.trim(),
        source: cells[1]!,
        target: cells[2]!,
      })),
  };
}

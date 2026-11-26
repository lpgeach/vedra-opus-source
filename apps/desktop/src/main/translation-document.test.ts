import { createWriteStream } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { describe, expect, it } from 'vitest';
import { ZipFile } from 'yazl';
import {
  readTranslationDocument,
  TranslationDocumentError,
  writeTranslationDocument,
} from './translation-document';

/** The two-column translation document (docs/briefs/P10.3-translation.md, part B). */

const folder = () => mkdtemp(join(tmpdir(), 'vo-translation-doc-'));

/** A .docx holding this document.xml. */
async function docx(path: string, documentXml: string): Promise<void> {
  const zip = new ZipFile();
  zip.addBuffer(Buffer.from('<Types/>'), '[Content_Types].xml');
  zip.addBuffer(Buffer.from(documentXml), 'word/document.xml');
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(path));
}

describe('the translation document', () => {
  it('is written with a header of languages and a row per unit, and read back with empty translations', async () => {
    const path = join(await folder(), 'course-fr.docx');
    await writeTranslationDocument(path, {
      title: 'Safety & work',
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      rows: [
        { id: 'slide/s1/title', source: 'Welcome', note: 'Slide 1 (title)' },
        {
          id: 'object/o1/text/0',
          source: 'Read the [1]safety[/1] notes[br]now <today>',
          note: 'Slide 1 · Text Box',
        },
      ],
    });
    const read = await readTranslationDocument(path);
    expect(read).toEqual({
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      rows: [
        { id: 'slide/s1/title', source: 'Welcome', target: '' },
        {
          id: 'object/o1/text/0',
          source: 'Read the [1]safety[/1] notes[br]now <today>',
          target: '',
        },
      ],
    });
  });

  it('reads a document as Word saves one: split runs, proofing marks, revisions, tracked changes, more namespaces', async () => {
    // Made by hand in Word's shape (no copy of Word was run): Word splits runs
    // at spelling marks and revisions, adds rsid attributes and bookmarks, and
    // keeps tracked insertions (read) and deletions (not read).
    const w = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${w} xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" mc:Ignorable="w14">
<w:body>
<w:p w14:paraId="1A2B3C4D" w:rsidR="00AB12CD"><w:r><w:t>Title</w:t></w:r></w:p>
<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>
<w:tr w:rsidR="00112233"><w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Id</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>en</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>fr</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:bookmarkStart w:id="0" w:name="_GoBack"/><w:r><w:t>slide/s1/</w:t></w:r><w:r w:rsidR="00445566"><w:t>title</w:t></w:r><w:bookmarkEnd w:id="0"/></w:p><w:p><w:r><w:t>Slide 1 (title)</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>Welcome</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:proofErr w:type="spellStart"/><w:r w:rsidRPr="00778899"><w:rPr><w:lang w:val="fr-FR"/></w:rPr><w:t xml:space="preserve">Bien</w:t></w:r><w:r><w:t>venue</w:t></w:r><w:proofErr w:type="spellEnd"/><w:del w:id="1" w:author="T"><w:r><w:delText> à tous</w:delText></w:r></w:del><w:ins w:id="2" w:author="T"><w:r><w:t xml:space="preserve"> !</w:t></w:r></w:ins></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>object/o1/text/0</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>A[br]B</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>Un</w:t></w:r></w:p><w:p><w:r><w:t>Deux</w:t><w:tab/><w:t>[1]trois[/1] &amp; quatre</w:t></w:r></w:p></w:tc></w:tr>
</w:tbl><w:sectPr/></w:body></w:document>`;
    const path = join(await folder(), 'word.docx');
    await docx(path, xml);
    expect(await readTranslationDocument(path)).toEqual({
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      rows: [
        { id: 'slide/s1/title', source: 'Welcome', target: 'Bienvenue !' },
        { id: 'object/o1/text/0', source: 'A[br]B', target: 'Un\nDeux\t[1]trois[/1] & quatre' },
      ],
    });
  });

  it('refuses what is not a translation document, saying why', async () => {
    const dir = await folder();
    const refused = async (path: string) => {
      try {
        await readTranslationDocument(path);
        return '';
      } catch (error) {
        if (error instanceof TranslationDocumentError) return error.message;
        throw error;
      }
    };
    const text = join(dir, 'plain.docx');
    await writeFile(text, 'not a zip');
    expect(await refused(text)).toMatch(/not a Word document/);
    const noTable = join(dir, 'no-table.docx');
    await docx(noTable, '<w:document xmlns:w="w"><w:body><w:p/></w:body></w:document>');
    expect(await refused(noTable)).toMatch(/no table/);
    const otherTable = join(dir, 'other.docx');
    await docx(
      otherTable,
      '<w:document xmlns:w="w"><w:body><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Name</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>',
    );
    expect(await refused(otherTable)).toMatch(/not a translation document/);
  });
});

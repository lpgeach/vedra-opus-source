/**
 * XLIFF 1.2 for translation (docs/briefs/P10.3-translation.md, part A): written
 * from translation units, and read back, with a small XML reader of its own
 * (the model has no DOM).
 */
import type { Inline, TranslatedUnit, TranslationUnit } from './translation';

export const XLIFF_NAMESPACE = 'urn:oasis:names:tc:xliff:document:1.2';

export class TranslationFileError extends Error {}

const escapeText = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (text: string) => escapeText(text).replace(/"/g, '&quot;');

function inlineXml(inlines: readonly Inline[]): string {
  return inlines
    .map((each) =>
      'text' in each
        ? escapeText(each.text)
        : 'open' in each
          ? `<g id="${each.open}">`
          : 'close' in each
            ? '</g>'
            : '<x id="br"/>',
    )
    .join('');
}

export interface XliffDocument {
  sourceLanguage: string;
  targetLanguage: string;
  /** What the file was made from: the course's title. */
  original: string;
  units: TranslatedUnit[];
}

/** An XLIFF 1.2 file of the units, the targets empty (or filled, when given). */
export function writeXliff(
  units: readonly TranslationUnit[],
  options: {
    sourceLanguage: string;
    targetLanguage: string;
    original: string;
    targets?: ReadonlyMap<string, Inline[]>;
  },
): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<xliff version="1.2" xmlns="${XLIFF_NAMESPACE}">`,
    `  <file original="${escapeAttr(options.original)}" source-language="${escapeAttr(options.sourceLanguage)}" target-language="${escapeAttr(options.targetLanguage)}" datatype="plaintext">`,
    '    <body>',
  ];
  for (const unit of units) {
    const target = options.targets?.get(unit.id);
    lines.push(
      `      <trans-unit id="${escapeAttr(unit.id)}" xml:space="preserve">`,
      `        <source>${inlineXml(unit.source)}</source>`,
      `        <target>${target ? inlineXml(target) : ''}</target>`,
      `        <note>${escapeText(unit.note)}</note>`,
      '      </trans-unit>',
    );
  }
  lines.push('    </body>', '  </file>', '</xliff>', '');
  return lines.join('\n');
}

// ------------------------------------------------------------- reading XML

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}
export type XmlNode = XmlElement | string;

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, code: string) => {
    if (code.startsWith('#x')) return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (code.startsWith('#')) return String.fromCodePoint(parseInt(code.slice(1), 10));
    const named = ENTITIES[code];
    if (named === undefined)
      throw new TranslationFileError(`The file uses an unknown entity, ${whole}.`);
    return named;
  });
}

/** The local part of a name: `x:g` → `g`. */
const local = (name: string) => name.slice(name.indexOf(':') + 1);

/** A small, strict XML reader: elements, attributes, text, CDATA; comments and declarations skipped. */
export function parseXml(text: string): XmlElement {
  let at = 0;
  const root: XmlElement = { name: '#root', attrs: {}, children: [] };
  const stack: XmlElement[] = [root];
  const fail = (why: string): never => {
    throw new TranslationFileError(`The file is not well-formed XML: ${why}.`);
  };
  while (at < text.length) {
    const lt = text.indexOf('<', at);
    if (lt < 0) {
      stack[stack.length - 1]!.children.push(decode(text.slice(at)));
      break;
    }
    if (lt > at) stack[stack.length - 1]!.children.push(decode(text.slice(at, lt)));
    if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt);
      if (end < 0) fail('a comment is not closed');
      at = end + 3;
    } else if (text.startsWith('<![CDATA[', lt)) {
      const end = text.indexOf(']]>', lt);
      if (end < 0) fail('a CDATA section is not closed');
      stack[stack.length - 1]!.children.push(text.slice(lt + 9, end));
      at = end + 3;
    } else if (text.startsWith('<?', lt)) {
      const end = text.indexOf('?>', lt);
      if (end < 0) fail('a declaration is not closed');
      at = end + 2;
    } else if (text.startsWith('<!', lt)) {
      const end = text.indexOf('>', lt);
      if (end < 0) fail('a declaration is not closed');
      at = end + 1;
    } else if (text.startsWith('</', lt)) {
      const end = text.indexOf('>', lt);
      if (end < 0) fail('a closing tag is not finished');
      const name = text.slice(lt + 2, end).trim();
      const open = stack.pop();
      if (!open || open === root || open.name !== name) fail(`</${name}> closes nothing open`);
      at = end + 1;
    } else {
      const match =
        /^<([A-Za-z_][\w.:-]*)((?:\s+[A-Za-z_][\w.:-]*\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/.exec(
          text.slice(lt),
        );
      if (!match) fail(`a tag at character ${lt} cannot be read`);
      const [whole, name, attrText, selfClosing] = match!;
      const attrs: Record<string, string> = {};
      for (const attr of attrText!.matchAll(/([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        attrs[attr[1]!] = decode(attr[2] ?? attr[3] ?? '');
      }
      const element: XmlElement = { name: name!, attrs, children: [] };
      stack[stack.length - 1]!.children.push(element);
      if (!selfClosing) stack.push(element);
      at = lt + whole!.length;
    }
  }
  if (stack.length > 1) fail(`<${stack[stack.length - 1]!.name}> is not closed`);
  const top = root.children.filter((child): child is XmlElement => typeof child !== 'string');
  if (top.length !== 1) fail('it must have exactly one top element');
  return top[0]!;
}

const childElements = (element: XmlElement, name: string) =>
  element.children.filter(
    (child): child is XmlElement => typeof child !== 'string' && local(child.name) === name,
  );

/** A `<source>` or `<target>`'s words: text, `<g>` tags by number, and `<x id="br"/>`. */
function readInline(element: XmlElement, unitId: string): Inline[] {
  const out: Inline[] = [];
  const visit = (node: XmlNode) => {
    if (typeof node === 'string') {
      if (node) out.push({ text: node });
      return;
    }
    const name = local(node.name);
    if (name === 'g') {
      const n = Number(node.attrs['id']);
      if (!Number.isInteger(n) || n < 1) {
        throw new TranslationFileError(`Unit ${unitId} has a <g> tag without a number.`);
      }
      out.push({ open: n });
      node.children.forEach(visit);
      out.push({ close: n });
    } else if (name === 'x' && node.attrs['id'] === 'br') {
      out.push({ br: true });
    } else if (name === 'mrk') {
      // A tool's own marking: its words are what count.
      node.children.forEach(visit);
    } else {
      throw new TranslationFileError(
        `Unit ${unitId} has a <${name}> tag this course does not use.`,
      );
    }
  };
  element.children.forEach(visit);
  return out;
}

/** Read an XLIFF 1.2 file; anything else is refused with a reason. */
export function readXliff(text: string): XliffDocument {
  const root = parseXml(text);
  if (local(root.name) !== 'xliff') {
    throw new TranslationFileError('This is not an XLIFF file: its top element is not <xliff>.');
  }
  if (root.attrs['version'] !== '1.2') {
    throw new TranslationFileError(
      `This is XLIFF ${root.attrs['version'] ?? 'of no version'}; only XLIFF 1.2 can be read.`,
    );
  }
  const files = childElements(root, 'file');
  if (files.length !== 1) throw new TranslationFileError('The file must hold exactly one <file>.');
  const file = files[0]!;
  const sourceLanguage = file.attrs['source-language'];
  const targetLanguage = file.attrs['target-language'];
  if (!sourceLanguage || !targetLanguage) {
    throw new TranslationFileError('The <file> must say its source-language and target-language.');
  }
  const body = childElements(file, 'body')[0];
  if (!body) throw new TranslationFileError('The <file> has no <body>.');
  const units: TranslatedUnit[] = [];
  // In the file's order; tools may put units in groups.
  const walk = (element: XmlElement) => {
    for (const child of element.children) {
      if (typeof child === 'string') continue;
      if (local(child.name) === 'group') {
        walk(child);
        continue;
      }
      if (local(child.name) !== 'trans-unit') continue;
      const unit = child;
      const id = unit.attrs['id'];
      const source = childElements(unit, 'source')[0];
      if (!id || !source)
        throw new TranslationFileError('A <trans-unit> has no id or no <source>.');
      const target = childElements(unit, 'target')[0];
      units.push({
        id,
        source: readInline(source, id),
        target: target ? readInline(target, id) : null,
      });
    }
  };
  walk(body);
  return { sourceLanguage, targetLanguage, original: file.attrs['original'] ?? '', units };
}

/**
 * A `.story` object's text (docs/briefs/B5-storyline-import.md): an escaped XML
 * document, `<Document><Content><Block><Style …/><Span Text="…"><Style …/></Span>…`.
 * Blocks become paragraphs (or list items), spans runs with their marks.
 */
import { parseXml, plainRichText } from '@vedraopus/model';
import type { Color, RichText, RichTextNode, XmlElement } from '@vedraopus/model';
import { readTextColour } from './colour';
import type { Palette } from './colour';

/** A byte-order mark at the start of a part, which some tools write. */
const LEADING_BOM = new RegExp('^\ufeff');

const kids = (element: XmlElement | undefined, name?: string): XmlElement[] =>
  (element?.children ?? []).filter(
    (child): child is XmlElement => typeof child !== 'string' && (!name || child.name === name),
  );

const LINE_BREAK = new RegExp('\\r\\n|[\\r\\n\\v\\u2028]');

/** Points to stage pixels, to the half pixel. */
const px = (points: number) => Math.round(points * (4 / 3) * 2) / 2;

const ALIGN: Record<string, string> = {
  Left: 'left',
  Center: 'center',
  Centre: 'center',
  Right: 'right',
  Justify: 'justify',
  Justified: 'justify',
};

export interface TextOptions {
  palette: Palette;
  /** The colour of text that sets none: the object's default font colour. */
  colour?: Color | null;
}

function runs(span: XmlElement, options: TextOptions): RichTextNode[] {
  const words = span.attrs['Text'] ?? '';
  if (words === '') return [];
  const style = kids(span, 'Style')[0]?.attrs ?? {};
  const marks: NonNullable<RichTextNode['marks']> = [];
  if (style['FontIsBold'] === 'True') marks.push({ type: 'bold' });
  if (style['FontIsItalic'] === 'True') marks.push({ type: 'italic' });
  if (style['FontIsUnderline'] === 'True') marks.push({ type: 'underline' });
  if (style['FontIsStrikeout'] === 'True') marks.push({ type: 'strike' });
  const attrs: Record<string, unknown> = {};
  const size = Number(style['FontSize']);
  if (Number.isFinite(size) && size > 0) attrs['fontSize'] = px(size);
  const family = style['FontFamily'];
  // `+minor` and `+major` are the theme's fonts: left to ours.
  if (family && !family.startsWith('+')) attrs['fontFamily'] = family;
  const colour = readTextColour(style['ForegroundColor'], options.palette) ?? options.colour;
  if (colour) attrs['color'] = colour;
  if (Object.keys(attrs).length > 0) marks.push({ type: 'textStyle', attrs });
  // A line break inside a block is a hard break.
  return words.split(LINE_BREAK).flatMap((line, index) => {
    const parts: RichTextNode[] = index > 0 ? [{ type: 'hardBreak' }] : [];
    if (line !== '')
      parts.push(marks.length ? { type: 'text', text: line, marks } : { type: 'text', text: line });
    return parts;
  });
}

type ListKind = 'bulletList' | 'orderedList' | null;

function listKind(block: XmlElement): ListKind {
  const list = kids(kids(block, 'Style')[0], 'ListStyle')[0];
  const type = list?.attrs['ListType'] ?? 'None';
  if (type === 'None' || type === '') return null;
  return /number|arabic|roman|alpha/i.test(type) ? 'orderedList' : 'bulletList';
}

function paragraph(block: XmlElement, options: TextOptions): RichTextNode {
  const style = kids(block, 'Style')[0]?.attrs ?? {};
  const node: RichTextNode = {
    type: 'paragraph',
    content: kids(block, 'Span').flatMap((span) => runs(span, options)),
  };
  const attrs: Record<string, unknown> = {};
  const align = ALIGN[style['Justification'] ?? ''];
  if (align && align !== 'left') attrs['textAlign'] = align;
  const before = Number(style['SpacingBefore']);
  if (Number.isFinite(before) && before > 0) attrs['spaceBefore'] = px(before);
  const after = Number(style['SpacingAfter']);
  if (Number.isFinite(after) && after > 0) attrs['spaceAfter'] = px(after);
  if (Object.keys(attrs).length > 0) node.attrs = attrs;
  return node;
}

/**
 * The text an object's `<text>` holds, as rich text; `plain` (the object's own
 * plain copy of its words) when the document cannot be read.
 */
export function storylineText(document: string, plain: string, options: TextOptions): RichText {
  let root: XmlElement;
  try {
    root = parseXml(document.replace(LEADING_BOM, ''));
  } catch {
    return plainRichText(plain);
  }
  const blocks = kids(kids(root, 'Content')[0], 'Block');
  if (blocks.length === 0) return plainRichText(plain);
  const content: RichTextNode[] = [];
  let list: { kind: Exclude<ListKind, null>; node: RichTextNode } | null = null;
  for (const block of blocks) {
    const kind = listKind(block);
    const para = paragraph(block, options);
    if (!kind) {
      list = null;
      content.push(para);
      continue;
    }
    if (!list || list.kind !== kind) {
      list = { kind, node: { type: kind, content: [] } };
      content.push(list.node);
    }
    list.node.content!.push({ type: 'listItem', content: [para] });
  }
  return { type: 'doc', content };
}

/** Whether rich text holds any words. */
export function hasWords(text: RichText): boolean {
  const walk = (node: RichTextNode): boolean =>
    (node.type === 'text' && (node.text ?? '').trim() !== '') || (node.content ?? []).some(walk);
  return text.content.some(walk);
}

/**
 * A shape's text (`p:txBody`) as our rich text (docs/briefs/P11.1-pptx-import.md):
 * paragraphs, runs and breaks, lists, bold, italic, underline and strike,
 * size, colour, font and alignment.
 */
import type { Color, RichText, RichTextNode } from '@vedraopus/model';
import { readColour } from './style';
import type { Palette } from './style';
import { all, attr, elements, localName, numberAttr, one, text } from './xml';
import type { XmlElement } from './xml';

/** What text looks like where the slide does not say: from the master, by placeholder kind. */
export interface TextDefaults {
  /** Points. */
  size: number;
  colour: Color | null;
  /** Each list level's bullet, from level 1: a character, numbers, or none. */
  bullets: ('char' | 'number' | null)[];
}

export const PLAIN_TEXT: TextDefaults = { size: 18, colour: null, bullets: [] };

/** Points to our pixels. */
const toPx = (points: number) => Math.round(((points * 4) / 3) * 100) / 100;

const ALIGN: Record<string, string> = {
  l: 'left',
  ctr: 'center',
  r: 'right',
  just: 'justify',
  dist: 'justify',
};

/** A run's marks, from its `a:rPr`. */
function marksOf(rPr: XmlElement | undefined, palette: Palette, defaults: TextDefaults) {
  const marks: { type: string; attrs?: Record<string, unknown> }[] = [];
  if (attr(rPr, 'b') === '1' || attr(rPr, 'b') === 'true') marks.push({ type: 'bold' });
  if (attr(rPr, 'i') === '1' || attr(rPr, 'i') === 'true') marks.push({ type: 'italic' });
  const u = attr(rPr, 'u');
  if (u && u !== 'none') marks.push({ type: 'underline' });
  const strike = attr(rPr, 'strike');
  if (strike && strike !== 'noStrike') marks.push({ type: 'strike' });
  const style: Record<string, unknown> = {};
  const size = numberAttr(rPr, 'sz', 0);
  style['fontSize'] = toPx(size > 0 ? size / 100 : defaults.size);
  const colour = readColour(one(rPr, 'solidFill'), palette) ?? defaults.colour;
  if (colour) style['color'] = colour;
  const face = attr(one(rPr, 'latin'), 'typeface');
  if (face) {
    style['fontFamily'] = face.startsWith('+mj')
      ? 'heading'
      : face.startsWith('+mn')
        ? 'body'
        : face;
  }
  marks.push({ type: 'textStyle', attrs: style });
  return marks;
}

/** A paragraph's words: runs, fields and breaks. */
function paragraphContent(p: XmlElement, palette: Palette, defaults: TextDefaults): RichTextNode[] {
  const content: RichTextNode[] = [];
  for (const child of elements(p)) {
    const name = localName(child.name);
    if (name === 'br') {
      content.push({ type: 'hardBreak' });
    } else if (name === 'r' || name === 'fld') {
      const words = text(one(child, 't'));
      if (words)
        content.push({
          type: 'text',
          text: words,
          marks: marksOf(one(child, 'rPr'), palette, defaults),
        });
    }
  }
  return content;
}

/** Whether a paragraph is a list item, and of which kind. */
function bulletOf(
  pPr: XmlElement | undefined,
  level: number,
  defaults: TextDefaults,
): 'char' | 'number' | null {
  if (one(pPr, 'buNone')) return null;
  if (one(pPr, 'buAutoNum')) return 'number';
  if (one(pPr, 'buChar')) return 'char';
  return defaults.bullets[level] ?? null;
}

/** The text body as rich text; empty paragraphs are kept, as blank lines. */
export function readTextBody(
  txBody: XmlElement | undefined,
  palette: Palette,
  defaults: TextDefaults,
): RichText {
  const blocks: RichTextNode[] = [];
  /** The open lists, outermost first: their kind and node. */
  let open: { kind: 'char' | 'number'; node: RichTextNode }[] = [];
  for (const p of all(txBody, 'p')) {
    const pPr = one(p, 'pPr');
    const level = Math.min(8, numberAttr(pPr, 'lvl', 0));
    const align = ALIGN[attr(pPr, 'algn') ?? ''];
    const paragraph: RichTextNode = {
      type: 'paragraph',
      ...(align && align !== 'left' ? { attrs: { textAlign: align } } : {}),
      content: paragraphContent(p, palette, defaults),
    };
    const bullet = paragraph.content!.length > 0 ? bulletOf(pPr, level, defaults) : null;
    if (!bullet) {
      open = [];
      blocks.push(paragraph);
      continue;
    }
    // A list item at `level`: close deeper lists, and open lists down to it.
    open = open.slice(0, level + 1);
    if (open.length === level + 1 && open[level]!.kind !== bullet) open = open.slice(0, level);
    while (open.length <= level) {
      const node: RichTextNode = {
        type: bullet === 'number' ? 'orderedList' : 'bulletList',
        content: [],
      };
      const parent = open[open.length - 1];
      if (parent) {
        const lastItem = parent.node.content![parent.node.content!.length - 1];
        if (lastItem) lastItem.content!.push(node);
        else parent.node.content!.push({ type: 'listItem', content: [node] });
      } else {
        blocks.push(node);
      }
      open.push({ kind: bullet, node });
    }
    open[level]!.node.content!.push({ type: 'listItem', content: [paragraph] });
  }
  return { type: 'doc', content: blocks.length > 0 ? blocks : [{ type: 'paragraph' }] } as RichText;
}

/** The plain words of a text body, paragraphs joined by spaces: a slide title. */
export function plainWords(txBody: XmlElement | undefined): string {
  return all(txBody, 'p')
    .map((p) =>
      all(p, 'r')
        .map((r) => text(one(r, 't')))
        .join(''),
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The defaults a list style gives (`a:lvl1pPr`…): size, colour and bullets by level. */
export function defaultsFrom(
  listStyle: XmlElement | undefined,
  palette: Palette,
  base: TextDefaults,
): TextDefaults {
  if (!listStyle) return base;
  const bullets = [...base.bullets];
  let { size, colour } = base;
  for (let level = 0; level < 9; level++) {
    const pPr = one(listStyle, `lvl${level + 1}pPr`);
    if (!pPr) continue;
    if (one(pPr, 'buNone')) bullets[level] = null;
    else if (one(pPr, 'buAutoNum')) bullets[level] = 'number';
    else if (one(pPr, 'buChar')) bullets[level] = 'char';
    if (level === 0) {
      const defRPr = one(pPr, 'defRPr');
      const sz = numberAttr(defRPr, 'sz', 0);
      if (sz > 0) size = sz / 100;
      colour = readColour(one(defRPr, 'solidFill'), palette) ?? colour;
    }
  }
  return { size, colour, bullets };
}

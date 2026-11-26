/**
 * Rich text serializer: turns a ProseMirror/TipTap-style JSON document into
 * the same markup in the editor, in preview and in published courses. Pure and
 * framework-agnostic — the editor may add an interactive TipTap view on top,
 * but the pixels must match this output. See docs/briefs/P2.4-text.md.
 */
import { replaceVariableReferences } from '@vedraopus/model';
import type { RichText, RichTextNode } from '@vedraopus/model';
import { resolveColor } from './context';
import type { RenderContext } from './context';
import { h, num, px } from './node';
import type { RenderChild, RenderNode } from './node';

/** CSS class prefix used for rich text content so editor and static output share styles. */
export const TEXT_CLASS = 'vo-rich-text';

type Style = Record<string, string | number | false | undefined | null>;

function cleanStyle(style: Style): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(style)) {
    if (v === false || v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return out;
}

function fontFamily(name: unknown, context: RenderContext): string | undefined {
  if (typeof name !== 'string' || name === '') return undefined;
  const resolved =
    name === 'body'
      ? context.theme.fonts.body
      : name === 'heading'
        ? context.theme.fonts.heading
        : name;
  const safe = resolved.replace(/['\\]/g, '');
  return `'${safe}', sans-serif`;
}

function colorValue(value: unknown, context: RenderContext): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value && 'theme' in value) {
    try {
      return resolveColor(value as never, context);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function textStyleAttrs(attrs: Record<string, unknown> | undefined, context: RenderContext): Style {
  const style: Style = {};
  const ff = fontFamily(attrs?.['fontFamily'], context);
  if (ff) style['font-family'] = ff;
  const size = attrs?.['fontSize'];
  if (typeof size === 'string' || typeof size === 'number') {
    style['font-size'] = typeof size === 'number' ? px(size) : String(size);
  }
  const color = colorValue(attrs?.['color'], context);
  if (color) style['color'] = color;
  const lh = attrs?.['lineHeight'];
  if (typeof lh === 'string' || typeof lh === 'number') style['line-height'] = String(lh);
  return style;
}

function renderInline(node: RichTextNode, context: RenderContext): RenderChild[] {
  if (node.type === 'text') {
    const written = node.text ?? '';
    const text = context.variables
      ? replaceVariableReferences(written, context.variables)
      : written;
    if (text === '') return [];
    let content: RenderChild = text;
    for (const mark of node.marks ?? []) {
      switch (mark.type) {
        case 'bold':
        case 'strong':
          content = h('strong', {}, [content]);
          break;
        case 'italic':
        case 'em':
          content = h('em', {}, [content]);
          break;
        case 'underline':
          content = h('u', {}, [content]);
          break;
        case 'strike':
          content = h('s', {}, [content]);
          break;
        case 'code':
          content = h('code', {}, [content]);
          break;
        case 'textStyle': {
          const st = cleanStyle(textStyleAttrs(mark.attrs, context));
          content = Object.keys(st).length ? h('span', { style: st }, [content]) : content;
          break;
        }
        case 'link': {
          const href = typeof mark.attrs?.['href'] === 'string' ? mark.attrs['href'] : '';
          const target =
            typeof mark.attrs?.['target'] === 'string' ? mark.attrs['target'] : '_blank';
          content = h('a', { attrs: { href, target, rel: 'noopener noreferrer' } }, [content]);
          break;
        }
        default:
          break;
      }
    }
    return [content];
  }
  if (node.type === 'hardBreak') return [h('br')];
  if (node.content) return node.content.flatMap((child) => renderInline(child, context));
  return [];
}
function paragraphStyle(node: RichTextNode): Style {
  const attrs = node.attrs ?? {};
  const style: Style = { margin: '0' };
  if (typeof attrs['textAlign'] === 'string') style['text-align'] = attrs['textAlign'];
  const lh = attrs['lineHeight'];
  if (typeof lh === 'string' || typeof lh === 'number') style['line-height'] = String(lh);
  const before = attrs['spaceBefore'];
  if (typeof before === 'number') style['margin-top'] = px(before);
  const after = attrs['spaceAfter'];
  if (typeof after === 'number') style['margin-bottom'] = px(after);
  return style;
}

function renderBlock(node: RichTextNode, context: RenderContext): RenderNode | null {
  switch (node.type) {
    case 'paragraph': {
      const children = (node.content ?? []).flatMap((child) => renderInline(child, context));
      // Keep empty paragraphs heightful (blank lines).
      const content: RenderChild[] = children.length > 0 ? children : ['\u00a0'];
      // Each paragraph takes the direction of its own words (P10.3, part C): Arabic in an
      // English course runs right to left, English in an Arabic one left to right.
      return h('p', { attrs: { dir: 'auto' }, style: cleanStyle(paragraphStyle(node)) }, content);
    }
    case 'bulletList':
      return h(
        'ul',
        { style: { margin: '0', 'padding-left': '1.4em', 'list-style-type': 'disc' } },
        (node.content ?? [])
          .map((child) => renderBlock(child, context))
          .filter(Boolean) as RenderNode[],
      );
    case 'orderedList': {
      const start = typeof node.attrs?.['start'] === 'number' ? node.attrs['start'] : undefined;
      return h(
        'ol',
        {
          attrs: start && start !== 1 ? { start: String(start) } : {},
          style: { margin: '0', 'padding-left': '1.4em' },
        },
        (node.content ?? [])
          .map((child) => renderBlock(child, context))
          .filter(Boolean) as RenderNode[],
      );
    }
    case 'listItem':
      return h(
        'li',
        { attrs: { dir: 'auto' }, style: { margin: '0' } },
        (node.content ?? [])
          .map((child) => renderBlock(child, context))
          .filter(Boolean) as RenderNode[],
      );
    case 'hardBreak':
      return h('p', { style: { margin: '0' } }, [h('br')]);
    default: {
      // Unknown block: try to render children as blocks, else as a paragraph of inlines.
      if (
        node.content &&
        node.content.some((c) =>
          ['paragraph', 'bulletList', 'orderedList', 'listItem'].includes(c.type),
        )
      ) {
        const kids = node.content
          .map((c) => renderBlock(c, context))
          .filter(Boolean) as RenderNode[];
        return kids.length === 1 ? kids[0]! : h('div', {}, kids);
      }
      if (node.content) {
        const inline = node.content.flatMap((c) => renderInline(c, context));
        return h('p', { style: { margin: '0' } }, inline.length ? inline : ['\u00a0']);
      }
      return null;
    }
  }
}

function hasVisibleText(node: RichTextNode): boolean {
  if (node.type === 'text') return (node.text ?? '').length > 0;
  if (node.type === 'hardBreak') return true;
  return (node.content ?? []).some(hasVisibleText);
}

function docIsEmpty(doc: RichText): boolean {
  return !doc.content.some(hasVisibleText);
}

/** The document's text, one string per top-level block (plain text). */
export function plainParagraphs(doc: RichText): string[] {
  const textOf = (node: RichTextNode): string => {
    if (node.type === 'hardBreak') return '\n';
    if (node.type === 'text') return node.text ?? '';
    return (node.content ?? []).map(textOf).join('');
  };
  return doc.content.map(textOf);
}

export interface TextBlockOptions {
  /** Space kept clear inside the box, in pixels. */
  padding: number;
  /** Centred both ways (shapes, buttons) or from the top-left (text boxes). */
  align: 'center' | 'start';
  /** Scale factor applied to the whole text block (for shrinkText autofit). */
  scale?: number;
  /** Autofit mode hint for browser post-processing (e.g. shrinkText). */
  autofit?: 'none' | 'shrinkText' | 'growShape';
  /** Extra class names on the content container. */
  className?: string;
  /** Text colour where the text sets none; the theme's text colour by default (a table's header, P9.9). */
  color?: string;
}

/** A box-filling rich text layer, or nothing if the document has no text at all. */
export function renderTextBlock(
  doc: RichText,
  context: RenderContext,
  { padding, align, scale = 1, autofit = 'none', className, color }: TextBlockOptions,
): RenderNode | null {
  if (docIsEmpty(doc)) return null;
  const blocks = doc.content
    .map((node) => renderBlock(node, context))
    .filter(Boolean) as RenderNode[];
  const contentChildren =
    blocks.length > 0 ? blocks : [h('p', { style: { margin: '0' } }, ['\u00a0'])];
  const contentStyle: Record<string, string | number> = {
    width: '100%',
    'font-family': `'${context.theme.fonts.body.replace(/['\\]/g, '')}', sans-serif`,
    'font-size': '18px',
    'line-height': '1.3',
    color: color ?? context.theme.colors.text,
    'white-space': 'pre-wrap',
    'overflow-wrap': 'break-word',
  };
  if (scale !== 1) {
    contentStyle['transform'] = `scale(${num(scale)})`;
    contentStyle['transform-origin'] = align === 'center' ? 'center center' : 'top left';
  }
  return h(
    'div',
    {
      attrs: {
        class: ['vo-text', className].filter(Boolean).join(' '),
        'data-autofit': autofit !== 'none' ? autofit : false,
        'data-align': align,
      },
      style: {
        position: 'absolute',
        inset: '0',
        'box-sizing': 'border-box',
        padding: px(padding),
        display: 'flex',
        'flex-direction': 'column',
        'justify-content': align === 'center' ? 'center' : 'flex-start',
        overflow: 'hidden',
      },
    },
    [
      h(
        'div',
        {
          attrs: { class: TEXT_CLASS },
          style: contentStyle,
        },
        contentChildren,
      ),
    ],
  );
}

/** Render the rich text document content (blocks only), without the positioning wrapper. */
export function renderRichText(doc: RichText, context: RenderContext): RenderNode[] {
  return doc.content.map((node) => renderBlock(node, context)).filter(Boolean) as RenderNode[];
}

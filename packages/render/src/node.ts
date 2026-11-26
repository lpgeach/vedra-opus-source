/**
 * What a renderer produces: a plain description of markup. Nothing here
 * touches a document, so renderers run anywhere and their output can be
 * inspected in ordinary unit tests. `toMarkup` and `toDom` turn a description
 * into something a browser shows; the editor maps it to React elements itself.
 */

export interface RenderNode {
  /** Element name. `svg` and everything inside it is SVG; the rest is HTML. */
  tag: string;
  attrs: Record<string, string>;
  /** CSS declarations, with property names as written in CSS (`stroke-width`). */
  style: Record<string, string>;
  children: RenderChild[];
}
export type RenderChild = RenderNode | string;

type Value = string | number | null | undefined | false;

/** Numbers in markup are rounded so output is stable and short. */
export function num(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** Pixels for CSS. */
export const px = (value: number): string => `${num(value)}px`;

function clean(values: Record<string, Value> | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(values ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    result[key] = typeof value === 'number' ? num(value) : value;
  }
  return result;
}

/**
 * Build a node. Attributes and styles that are null, undefined or false are
 * left out, so callers can write `opacity: opacity < 1 && opacity`.
 */
export function h(
  tag: string,
  props: { attrs?: Record<string, Value>; style?: Record<string, Value> } = {},
  children: (RenderChild | null | undefined | false)[] = [],
): RenderNode {
  return {
    tag,
    attrs: clean(props.attrs),
    style: clean(props.style),
    children: children.filter(
      (child): child is RenderChild => child !== null && child !== undefined && child !== false,
    ),
  };
}

const VOID_TAGS = new Set(['img', 'br', 'hr', 'input', 'col']);
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

const escapeText = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (text: string) => escapeText(text).replace(/"/g, '&quot;');

export function styleText(style: Record<string, string>): string {
  return Object.entries(style)
    .map(([property, value]) => `${property}:${value}`)
    .join(';');
}

/** The node as an HTML string. All text and attribute values are escaped. */
export function toMarkup(node: RenderChild): string {
  if (typeof node === 'string') return escapeText(node);
  let open = `<${node.tag}`;
  for (const [name, value] of Object.entries(node.attrs)) {
    open += ` ${name}="${escapeAttr(value)}"`;
  }
  const style = styleText(node.style);
  if (style) open += ` style="${escapeAttr(style)}"`;
  if (VOID_TAGS.has(node.tag)) return `${open}>`;
  return `${open}>${node.children.map(toMarkup).join('')}</${node.tag}>`;
}

/**
 * The node as DOM, created in the given document. Styles are set through the
 * style object rather than a `style` attribute, so this works on pages whose
 * content security policy forbids inline style attributes.
 */
export function toDom(node: RenderNode, document: Document): Element {
  return build(node, document, false);
}

function build(node: RenderNode, document: Document, insideSvg: boolean): Element {
  const svg = insideSvg || node.tag === 'svg';
  const element = svg
    ? document.createElementNS(SVG_NAMESPACE, node.tag)
    : document.createElement(node.tag);
  for (const [name, value] of Object.entries(node.attrs)) element.setAttribute(name, value);
  const { style } = element as HTMLElement | SVGElement;
  for (const [property, value] of Object.entries(node.style)) style.setProperty(property, value);
  for (const child of node.children) {
    element.append(typeof child === 'string' ? child : build(child, document, svg));
  }
  return element;
}

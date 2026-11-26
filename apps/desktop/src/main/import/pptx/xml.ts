/**
 * Reading a PowerPoint part's XML (docs/briefs/P11.1-pptx-import.md): elements
 * by their local name, so `p:sp` and `a:p` are found whatever prefix a file
 * uses. Built on the model's XML reader.
 */
import { parseXml } from '@vedraopus/model';
import type { XmlElement } from '@vedraopus/model';

export type { XmlElement };

/** A file the importer cannot read, with a reason for the author. */
export class PptxError extends Error {}

export const localName = (name: string) => name.slice(name.indexOf(':') + 1);

/** The element children named `name`. */
export function all(element: XmlElement | undefined, name: string): XmlElement[] {
  if (!element) return [];
  return element.children.filter(
    (child): child is XmlElement => typeof child !== 'string' && localName(child.name) === name,
  );
}

/** The first child named `name`. */
export function one(element: XmlElement | undefined, name: string): XmlElement | undefined {
  return all(element, name)[0];
}

/** Down a path of child names: `path(sp, 'spPr', 'xfrm', 'off')`. */
export function path(element: XmlElement | undefined, ...names: string[]): XmlElement | undefined {
  let at = element;
  for (const name of names) at = one(at, name);
  return at;
}

/** Every element child, in order. */
export function elements(element: XmlElement | undefined): XmlElement[] {
  if (!element) return [];
  return element.children.filter((child): child is XmlElement => typeof child !== 'string');
}

/** An attribute by its local name (`r:embed` as `embed`). */
export function attr(element: XmlElement | undefined, name: string): string | undefined {
  if (!element) return undefined;
  for (const [key, value] of Object.entries(element.attrs)) {
    if (localName(key) === name) return value;
  }
  return undefined;
}

/** A relationship attribute (`r:id`), not a plain one of the same local name (`id`). */
export function relAttr(element: XmlElement | undefined, name: string): string | undefined {
  if (!element) return undefined;
  for (const [key, value] of Object.entries(element.attrs)) {
    if (key.includes(':') && localName(key) === name) return value;
  }
  return undefined;
}

/** A whole-number attribute, or `fallback`. */
export function numberAttr(element: XmlElement | undefined, name: string, fallback = 0): number {
  const value = Number(attr(element, name));
  return Number.isFinite(value) ? value : fallback;
}

/** The text an element holds directly. */
export function text(element: XmlElement | undefined): string {
  if (!element) return '';
  return element.children.filter((child): child is string => typeof child === 'string').join('');
}

/** A part's XML, or an error naming it. */
export function readPart(parts: ReadonlyMap<string, Uint8Array>, name: string): XmlElement {
  const bytes = parts.get(name);
  if (!bytes) throw new PptxError(`The presentation is missing its part ${name}.`);
  try {
    return parseXml(new TextDecoder().decode(bytes));
  } catch {
    throw new PptxError(`The presentation's part ${name} cannot be read.`);
  }
}

/** A part's relationships, by id: their type's last word and their target part's full name. */
export function relationships(
  parts: ReadonlyMap<string, Uint8Array>,
  partName: string,
): Map<string, { type: string; target: string; external: boolean }> {
  // The package's own relationships (`''`) are `_rels/.rels`, at the root.
  const slash = partName.lastIndexOf('/');
  const folder = partName === '' ? '' : partName.slice(0, slash);
  const relsName =
    partName === '' ? '_rels/.rels' : `${folder}/_rels/${partName.slice(slash + 1)}.rels`;
  const found = new Map<string, { type: string; target: string; external: boolean }>();
  if (!parts.has(relsName)) return found;
  for (const rel of all(readPart(parts, relsName), 'Relationship')) {
    const id = attr(rel, 'Id');
    const target = attr(rel, 'Target');
    if (!id || !target) continue;
    const external = attr(rel, 'TargetMode') === 'External';
    found.set(id, {
      type: (attr(rel, 'Type') ?? '').split('/').pop() ?? '',
      target: external ? target : resolvePart(folder, target),
      external,
    });
  }
  return found;
}

/** A relative target (`../media/image1.png`) as a part name (`ppt/media/image1.png`). */
export function resolvePart(folder: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = folder.split('/').filter(Boolean);
  for (const piece of target.split('/')) {
    if (piece === '..') parts.pop();
    else if (piece !== '.' && piece !== '') parts.push(piece);
  }
  return parts.join('/');
}

const escapeXml = (value: string) =>
  value.replace(
    /[<>&"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c] ?? c,
  );

/** An element back as XML text, with its namespace declarations as they were (part D). */
export function writeXml(element: XmlElement): string {
  const attrs = Object.entries(element.attrs)
    .map(([key, value]) => ` ${key}="${escapeXml(value)}"`)
    .join('');
  if (element.children.length === 0) return `<${element.name}${attrs}/>`;
  const inner = element.children
    .map((child) => (typeof child === 'string' ? escapeXml(child) : writeXml(child)))
    .join('');
  return `<${element.name}${attrs}>${inner}</${element.name}>`;
}

/** 9525 EMU to a pixel (914 400 an inch, at 96 pixels an inch). */
export const EMU_PER_PIXEL = 9525;
export const px = (emu: number) => Math.round((emu / EMU_PER_PIXEL) * 100) / 100;

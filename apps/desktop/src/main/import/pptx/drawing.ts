/**
 * Content only a picture can show (docs/briefs/P11.1-pptx-import.md, part D):
 * charts, SmartArt, embedded objects and pictures in formats courses do not
 * use. Each is put alone on a one-slide copy of the deck, the size of its
 * frame, for LibreOffice to draw. Pure: the caller zips the parts and runs
 * LibreOffice.
 */
import type { Frame } from '@vedraopus/model';
import {
  attr,
  elements,
  EMU_PER_PIXEL,
  localName,
  one,
  readPart,
  relationships,
  relAttr,
  writeXml,
} from './xml';
import type { XmlElement } from './xml';

/** A list entry's relationship id (`r:id`), not its own number (`id`). */
const relIdOf = (entry: XmlElement) => relAttr(entry, 'id') ?? '';

/** Something on a slide that the importer asks LibreOffice to draw. */
export interface PendingDrawing {
  /** The stand-in object to replace with the picture. */
  objectId: string;
  slide: number | null;
  /** The slide part the content is on. */
  slidePart: string;
  /** The content's own element: a graphic frame or a picture. */
  node: XmlElement;
  frame: Frame;
  /** What it is, for the report: “Chart 1” is a chart. */
  what: string;
}

const RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const OFFICE_DOCUMENT =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument';
const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';

const encode = (xml: string) =>
  new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${xml}`);

const relsNameOf = (partName: string) => {
  const slash = partName.lastIndexOf('/');
  return `${partName.slice(0, slash)}/_rels/${partName.slice(slash + 1)}.rels`;
};

function clone(element: XmlElement): XmlElement {
  return {
    name: element.name,
    attrs: { ...element.attrs },
    children: element.children.map((child) => (typeof child === 'string' ? child : clone(child))),
  };
}

const prefixOf = (element: XmlElement) =>
  element.name.includes(':') ? element.name.slice(0, element.name.indexOf(':') + 1) : '';

/** A part's relationships file with only the relationships `keep` accepts. */
function filterRels(
  parts: ReadonlyMap<string, Uint8Array>,
  partName: string,
  keep: (id: string, rel: { type: string; target: string }) => boolean,
): [string, Uint8Array] | null {
  const relsName = relsNameOf(partName);
  if (!parts.has(relsName)) return null;
  const known = relationships(parts, partName);
  const root = readPart(parts, relsName);
  root.children = elements(root).filter((rel) => {
    const id = attr(rel, 'Id') ?? '';
    const found = known.get(id);
    return found ? keep(id, found) : false;
  });
  return [relsName, encode(writeXml(root))];
}

/** Every relationship id an element's attributes name (`r:embed`, `r:id`, `r:dm` and the like). */
function relIdsIn(node: XmlElement, known: ReadonlyMap<string, unknown>, into: Set<string>) {
  for (const value of Object.values(node.attrs)) if (known.has(value)) into.add(value);
  for (const child of elements(node)) relIdsIn(child, known, into);
}

/** A shape tree holding only its group properties. */
function emptyTree(tree: XmlElement | undefined): XmlElement[] {
  return elements(tree).filter((child) => ['nvGrpSpPr', 'grpSpPr'].includes(localName(child.name)));
}

/** The content, at the top left, its frame's size, without rotation or a placeholder of its own. */
function placed(node: XmlElement, cx: number, cy: number): XmlElement {
  const copy = clone(node);
  /**
   * A new transform in the place of `old`: named as it was (`p:xfrm` on a
   * graphic frame, `a:xfrm` on a picture), its offset and size in DrawingML.
   */
  const xfrm = (name: string, old: XmlElement | undefined): XmlElement => {
    const inner = elements(old)[0];
    const [prefix, ns] = inner ? [prefixOf(inner), {}] : ['', { xmlns: DRAWING_NS }];
    return {
      name,
      attrs: name === 'xfrm' ? { xmlns: DRAWING_NS } : {},
      children: [
        { name: `${prefix}off`, attrs: { ...ns, x: '0', y: '0' }, children: [] },
        { name: `${prefix}ext`, attrs: { ...ns, cx: String(cx), cy: String(cy) }, children: [] },
      ],
    };
  };
  const isXfrm = (child: XmlElement | string) =>
    typeof child !== 'string' && localName(child.name) === 'xfrm';
  if (localName(copy.name) === 'graphicFrame') {
    // A graphic frame's own transform, after its non-visual properties.
    const at = copy.children.findIndex(isXfrm);
    const old = at >= 0 ? (copy.children[at] as XmlElement) : undefined;
    const made = xfrm(old?.name ?? `${prefixOf(copy)}xfrm`, old);
    if (at >= 0) copy.children[at] = made;
    else copy.children.splice(1, 0, made);
  } else {
    // A picture's, inside its shape properties.
    const spPr = one(copy, 'spPr');
    if (spPr) {
      const at = spPr.children.findIndex(isXfrm);
      const old = at >= 0 ? (spPr.children[at] as XmlElement) : undefined;
      const made = xfrm(old?.name ?? 'xfrm', old);
      if (at >= 0) spPr.children[at] = made;
      else spPr.children.unshift(made);
    }
  }
  // Its own placeholder link would place it where the layout says.
  for (const nv of elements(copy).filter((child) => localName(child.name).startsWith('nv'))) {
    const nvPr = one(nv, 'nvPr');
    if (nvPr)
      nvPr.children = nvPr.children.filter(
        (c) => typeof c === 'string' || localName(c.name) !== 'ph',
      );
  }
  return copy;
}

/**
 * The deck's parts for drawing `pending` alone: one slide, the size of its
 * frame, with an empty layout and master (their theme and text styles kept),
 * and only the parts that content reaches.
 */
export function drawingDeck(
  parts: ReadonlyMap<string, Uint8Array>,
  presentationPart: string,
  pending: PendingDrawing,
): Map<string, Uint8Array> {
  const cx = Math.max(1, Math.round(pending.frame.width * EMU_PER_PIXEL));
  const cy = Math.max(1, Math.round(pending.frame.height * EMU_PER_PIXEL));
  const rewritten = new Map<string, Uint8Array>();

  // The slide: its background none, and nothing on it but the content.
  const slide = readPart(parts, pending.slidePart);
  const p = prefixOf(slide);
  const cSld = one(slide, 'cSld');
  const tree = one(cSld, 'spTree');
  const newTree: XmlElement = {
    name: tree?.name ?? `${p}spTree`,
    attrs: {},
    children: [...emptyTree(tree), placed(pending.node, cx, cy)],
  };
  const background: XmlElement = {
    name: `${p}bg`,
    attrs: {},
    children: [
      {
        name: `${p}bgPr`,
        attrs: {},
        children: [
          { name: 'noFill', attrs: { xmlns: DRAWING_NS }, children: [] },
          { name: 'effectLst', attrs: { xmlns: DRAWING_NS }, children: [] },
        ],
      },
    ],
  };
  slide.attrs['showMasterSp'] = '0';
  slide.children = [
    { name: cSld?.name ?? `${p}cSld`, attrs: {}, children: [background, newTree] },
    ...elements(slide).filter((child) => localName(child.name) === 'clrMapOvr'),
  ];
  rewritten.set(pending.slidePart, encode(writeXml(slide)));
  const slideRels = relationships(parts, pending.slidePart);
  const used = new Set<string>();
  relIdsIn(pending.node, slideRels, used);
  // SmartArt's data names its drawing by one of the slide's relationships too.
  for (const id of [...used]) {
    const rel = slideRels.get(id);
    if (rel?.type === 'diagramData' && parts.has(rel.target)) {
      relIdsIn(readPart(parts, rel.target), slideRels, used);
    }
  }
  const slideRelsPart = filterRels(
    parts,
    pending.slidePart,
    (id, rel) => used.has(id) || rel.type === 'slideLayout',
  );
  if (slideRelsPart) rewritten.set(...slideRelsPart);

  // Its layout and master, emptied: what they draw is not part of the content.
  const layoutPart = [...slideRels.values()].find((rel) => rel.type === 'slideLayout')?.target;
  const masterPart = layoutPart
    ? [...relationships(parts, layoutPart).values()].find((rel) => rel.type === 'slideMaster')
        ?.target
    : undefined;
  for (const part of [layoutPart, masterPart]) {
    if (!part || !parts.has(part)) continue;
    const xml = readPart(parts, part);
    xml.attrs['showMasterSp'] = '0';
    const sld = one(xml, 'cSld');
    if (sld) {
      sld.children = elements(sld)
        .filter((child) => localName(child.name) === 'spTree')
        .map((child) => ({ ...child, children: emptyTree(child) }));
    }
    if (part === masterPart) {
      const list = one(xml, 'sldLayoutIdLst');
      const masterRels = relationships(parts, part);
      if (list) {
        list.children = elements(list).filter(
          (entry) => masterRels.get(relIdOf(entry))?.target === layoutPart,
        );
      }
      const relsPart = filterRels(
        parts,
        part,
        (_, rel) => rel.type === 'theme' || rel.target === layoutPart,
      );
      if (relsPart) rewritten.set(...relsPart);
    } else {
      const relsPart = filterRels(parts, part, (_, rel) => rel.type === 'slideMaster');
      if (relsPart) rewritten.set(...relsPart);
    }
    rewritten.set(part, encode(writeXml(xml)));
  }

  // The presentation: this slide alone, the size of the content.
  const presentation = readPart(parts, presentationPart);
  const presRels = relationships(parts, presentationPart);
  const slideId = [...presRels].find(([, rel]) => rel.target === pending.slidePart)?.[0];
  presentation.children = presentation.children.filter(
    (child) =>
      typeof child === 'string' || !['custShowLst', 'extLst'].includes(localName(child.name)),
  );
  const ids = one(presentation, 'sldIdLst');
  if (ids) ids.children = elements(ids).filter((entry) => relIdOf(entry) === slideId);
  const size = one(presentation, 'sldSz');
  if (size) {
    size.attrs = { cx: String(cx), cy: String(cy) };
  }
  const masterIds = one(presentation, 'sldMasterIdLst');
  if (masterIds) {
    masterIds.children = elements(masterIds).filter(
      (entry) => presRels.get(relIdOf(entry))?.target === masterPart,
    );
  }
  rewritten.set(presentationPart, encode(writeXml(presentation)));
  const presRelsPart = filterRels(
    parts,
    presentationPart,
    (id, rel) =>
      id === slideId ||
      (rel.type !== 'slide' && (rel.type !== 'slideMaster' || rel.target === masterPart)),
  );
  if (presRelsPart) rewritten.set(...presRelsPart);
  rewritten.set(
    '_rels/.rels',
    encode(
      `<Relationships xmlns="${RELS_NS}"><Relationship Id="rId1" Type="${OFFICE_DOCUMENT}" Target="/${presentationPart}"/></Relationships>`,
    ),
  );

  // Only the parts the presentation reaches, and their relationships.
  const view = new Map(parts);
  for (const [name, bytes] of rewritten) view.set(name, bytes);
  const out = new Map<string, Uint8Array>([['_rels/.rels', rewritten.get('_rels/.rels')!]]);
  const queue = [presentationPart];
  while (queue.length > 0) {
    const part = queue.shift()!;
    if (out.has(part) || !view.has(part)) continue;
    out.set(part, view.get(part)!);
    const relsName = relsNameOf(part);
    if (view.has(relsName)) out.set(relsName, view.get(relsName)!);
    for (const rel of relationships(view, part).values()) {
      if (!rel.external) queue.push(rel.target);
    }
  }

  // Content types: the defaults, and the overrides of the parts kept.
  const types = readPart(parts, '[Content_Types].xml');
  types.children = elements(types).filter(
    (entry) =>
      localName(entry.name) !== 'Override' ||
      out.has((attr(entry, 'PartName') ?? '').replace(/^\//, '')),
  );
  out.set('[Content_Types].xml', encode(writeXml(types)));
  return out;
}

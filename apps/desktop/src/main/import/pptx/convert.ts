/**
 * A PowerPoint deck's parts as a new project (docs/briefs/P11.1-pptx-import.md).
 * Part A: slides, text, shapes, pictures, tables, groups and notes. Part B:
 * masters, layouts and backgrounds. Pure: the caller reads the zip and stores
 * the pictures.
 */
import {
  createEmptyProject,
  createId,
  createLayer,
  createPlaceholder,
  createSlide,
} from '@vedraopus/model';
import type {
  Frame,
  Project,
  SceneObject,
  Slide,
  SlideLayout,
  SlideMaster,
} from '@vedraopus/model';
import type { PendingDrawing } from './drawing';
import { applyAnimations, readTransition } from './motion';
import {
  placeholderBox,
  placeholderKind,
  readBackground,
  readTree,
  withoutPlaceholders,
} from './shapes';
import type { PlaceholderKey, ReportItem, ShapeContext } from './shapes';
import { readTheme } from './style';
import type { Palette } from './style';
import { defaultsFrom, PLAIN_TEXT, plainWords, readTextBody } from './text';
import type { TextDefaults } from './text';
import {
  all,
  attr,
  localName,
  numberAttr,
  one,
  path,
  PptxError,
  px,
  readPart,
  relationships,
  relAttr,
  text,
} from './xml';
import type { XmlElement } from './xml';

/** Picture types a course shows; anything else is drawn by LibreOffice (part D), or reported. */
const PICTURE_TYPES = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);

export interface ConvertOptions {
  /** The file's name without its extension: the course title when the deck has none. */
  fileName: string;
  /** Store a picture's bytes in the project's media, returning its asset hash. */
  storePicture(picture: { name: string; ext: string; bytes: Uint8Array }): { hash: string };
}

/** A sound or video the importer runs through the media pipeline after converting (part C). */
export interface PendingMedia {
  /** The stand-in object to replace. */
  objectId: string;
  /** The deck part holding the file. */
  partName: string;
  video: boolean;
  slide: number | null;
}

export interface ConvertResult {
  project: Project;
  report: ReportItem[];
  media: PendingMedia[];
  /** Content for LibreOffice to draw as pictures (part D). */
  drawings: PendingDrawing[];
  /** The presentation's part name, which a drawing's one-slide deck starts from. */
  presentationPart: string;
}

const TITLE_TYPES = new Set(['title', 'ctrTitle']);

interface Placeholder {
  key: PlaceholderKey;
  xfrm: XmlElement | undefined;
  lstStyle: XmlElement | undefined;
}

/** The placeholders of a layout or master, with their positions and list styles. */
function placeholdersOf(root: XmlElement | undefined): Placeholder[] {
  const found: Placeholder[] = [];
  for (const sp of all(path(root, 'cSld', 'spTree'), 'sp')) {
    const ph = path(sp, 'nvSpPr', 'nvPr', 'ph');
    if (!ph) continue;
    found.push({
      key: { type: attr(ph, 'type') ?? 'body', idx: attr(ph, 'idx') ?? null },
      xfrm: path(sp, 'spPr', 'xfrm'),
      lstStyle: path(sp, 'txBody', 'lstStyle'),
    });
  }
  return found;
}

/** The placeholder a placeholder takes after: by index, else by kind (titles match titles). */
function matching<T extends { key: PlaceholderKey }>(
  candidates: T[],
  key: PlaceholderKey,
): T | undefined {
  const sameKind = (a: string, b: string) => a === b || (TITLE_TYPES.has(a) && TITLE_TYPES.has(b));
  return (
    (key.idx !== null ? candidates.find((each) => each.key.idx === key.idx) : undefined) ??
    candidates.find((each) => sameKind(each.key.type, key.type))
  );
}

function frameOf(xfrm: XmlElement | undefined): Frame | undefined {
  if (!xfrm) return undefined;
  const off = one(xfrm, 'off');
  const ext = one(xfrm, 'ext');
  return {
    x: px(numberAttr(off, 'x')),
    y: px(numberAttr(off, 'y')),
    width: px(numberAttr(ext, 'cx')),
    height: px(numberAttr(ext, 'cy')),
    rotation: numberAttr(xfrm, 'rot') / 60000,
  };
}

/** What every part of the deck is read with. */
interface Deck {
  parts: ReadonlyMap<string, Uint8Array>;
  palette: Palette;
  deckDefaults: TextDefaults;
  report: ReportItem[];
  options: ConvertOptions;
  stage: { width: number; height: number };
  media: PendingMedia[];
  drawings: PendingDrawing[];
}

/**
 * The context for reading one part's shapes: a slide, a layout or a master.
 * `inherits` is the layout and master its placeholders take after, nearest
 * first; `master` gives the text styles.
 */
function contextFor(
  deck: Deck,
  partName: string,
  inherits: (XmlElement | undefined)[],
  master: XmlElement | undefined,
  slide: number | null,
): ShapeContext {
  const rels = relationships(deck.parts, partName);
  const sources = inherits.map(placeholdersOf);
  const styles = one(master, 'txStyles');
  return {
    palette: deck.palette,
    slide,
    inheritedFrame: (key) => {
      for (const source of sources) {
        const frame = frameOf(matching(source, key)?.xfrm);
        if (frame) return frame;
      }
      return undefined;
    },
    textDefaults: (key) => {
      if (!key) return defaultsFrom(one(styles, 'otherStyle'), deck.palette, deck.deckDefaults);
      const style = TITLE_TYPES.has(key.type)
        ? 'titleStyle'
        : ['body', 'obj', 'subTitle'].includes(key.type) || key.idx
          ? 'bodyStyle'
          : 'otherStyle';
      let defaults = defaultsFrom(one(styles, style), deck.palette, deck.deckDefaults);
      // A subtitle or a title has no bullets, whatever the body style says.
      if (key.type === 'subTitle' || TITLE_TYPES.has(key.type))
        defaults = { ...defaults, bullets: [] };
      // Furthest first, so the nearest list style wins.
      for (const source of [...sources].reverse()) {
        defaults = defaultsFrom(matching(source, key)?.lstStyle, deck.palette, defaults);
      }
      return defaults;
    },
    picture: (relId) => {
      const rel = rels.get(relId);
      if (!rel || rel.external) return null;
      const bytes = deck.parts.get(rel.target);
      if (!bytes) return null;
      const name = rel.target.split('/').pop()!;
      const ext = (name.split('.').pop() ?? '').toLowerCase();
      if (!PICTURE_TYPES.has(ext)) return { unsupported: ext.toUpperCase() || 'unknown' };
      return deck.options.storePicture({ name, ext: ext === 'jpeg' ? 'jpg' : ext, bytes });
    },
    report: (item) => deck.report.push({ ...item, slide }),
    media: ({ relId, video, frame, name }) => {
      const rel = rels.get(relId);
      if (!rel || rel.external || !deck.parts.has(rel.target)) return undefined;
      const standIn = placeholderBox(frame, video ? 'Video' : 'Sound', name);
      deck.media.push({ objectId: standIn.id, partName: rel.target, video, slide });
      return standIn;
    },
    // Only a slide's content is drawn: a master's or layout's stays a reported placeholder.
    drawing:
      slide === null
        ? undefined
        : ({ node, frame, label, name, what }) => {
            const standIn = placeholderBox(frame, label, name);
            deck.drawings.push({
              objectId: standIn.id,
              slide,
              slidePart: partName,
              node,
              frame,
              what,
            });
            return standIn;
          },
  };
}

export function convertPptx(
  parts: ReadonlyMap<string, Uint8Array>,
  options: ConvertOptions,
): ConvertResult {
  if (!parts.has('[Content_Types].xml')) {
    throw new PptxError('This is not a PowerPoint presentation (.pptx).');
  }
  const rootRels = relationships(parts, '');
  const main = [...rootRels.values()].find((rel) => rel.type === 'officeDocument');
  if (!main || !parts.has(main.target)) throw new PptxError('This file has no presentation in it.');
  const presentation = readPart(parts, main.target);
  if (localName(presentation.name) !== 'presentation') {
    throw new PptxError(
      'This is an Office file, but not a presentation: open it in its own program.',
    );
  }
  const presRels = relationships(parts, main.target);

  // The course: its title, stage and theme.
  const project = createEmptyProject(options.fileName);
  const core = parts.has('docProps/core.xml') ? readPart(parts, 'docProps/core.xml') : undefined;
  const title = text(one(core, 'title')).trim();
  if (title) project.title = title;
  const size = one(presentation, 'sldSz');
  project.stage = {
    width: Math.max(1, Math.round(px(numberAttr(size, 'cx', 12192000)))),
    height: Math.max(1, Math.round(px(numberAttr(size, 'cy', 6858000)))),
  };
  const themeRel = [...presRels.values()].find((rel) => rel.type === 'theme');
  const { palette, theme } = readTheme(
    themeRel ? readPart(parts, themeRel.target) : undefined,
    project.theme,
  );
  project.theme = theme;
  const deck: Deck = {
    parts,
    palette,
    deckDefaults: defaultsFrom(one(presentation, 'defaultTextStyle'), palette, PLAIN_TEXT),
    report: [],
    options,
    stage: project.stage,
    media: [],
    drawings: [],
  };

  // Masters and their layouts (part B), before the feedback master.
  const layoutIds = new Map<string, string>();
  const masters: SlideMaster[] = [];
  all(one(presentation, 'sldMasterIdLst'), 'sldMasterId').forEach((entry, index) => {
    const rel = presRels.get(relAttr(entry, 'id') ?? '');
    if (!rel || !parts.has(rel.target)) return;
    masters.push(readMaster(deck, rel.target, index + 1, layoutIds));
  });
  project.masters = [...masters, ...project.masters];

  const slides: Slide[] = [];
  all(one(presentation, 'sldIdLst'), 'sldId').forEach((sldId, index) => {
    const number = index + 1;
    const rel = presRels.get(relAttr(sldId, 'id') ?? '');
    if (!rel || !parts.has(rel.target)) {
      deck.report.push({
        slide: number,
        outcome: 'skipped',
        what: 'The slide is missing from the file',
      });
      return;
    }
    slides.push(readSlide(deck, rel.target, number, layoutIds));
  });
  if (slides.length === 0) throw new PptxError('This presentation has no slides.');
  project.scenes[0]!.slides = slides;
  return {
    project,
    report: deck.report,
    media: deck.media,
    drawings: deck.drawings,
    presentationPart: main.target,
  };
}

/** A master: its background on its own layer; its shapes go into each layout that shows them. */
function readMaster(
  deck: Deck,
  partName: string,
  number: number,
  layoutIds: Map<string, string>,
): SlideMaster {
  const xml = readPart(deck.parts, partName);
  const name = attr(one(xml, 'cSld'), 'name') || `Master ${number}`;
  const ctx = contextFor(deck, partName, [xml], xml, null);
  const layer = createLayer(`${name} Layer`);
  const background = readBackground(one(xml, 'cSld'), ctx, deck.stage);
  if (background) layer.objects.push(background);
  const masterRels = relationships(deck.parts, partName);
  const layouts: SlideLayout[] = [];
  all(one(xml, 'sldLayoutIdLst'), 'sldLayoutId').forEach((entry, index) => {
    const rel = masterRels.get(relAttr(entry, 'id') ?? '');
    if (!rel || !deck.parts.has(rel.target)) return;
    const layout = readLayout(deck, rel.target, xml, partName, index + 1);
    layoutIds.set(rel.target, layout.id);
    layouts.push(layout);
  });
  return { id: createId('master'), name, kind: 'slide', layer, layouts };
}

function readLayout(
  deck: Deck,
  partName: string,
  master: XmlElement,
  masterPart: string,
  number: number,
): SlideLayout {
  const xml = readPart(deck.parts, partName);
  const name = attr(one(xml, 'cSld'), 'name') || `Layout ${number}`;
  const ctx = contextFor(deck, partName, [xml, master], master, null);
  const layer = createLayer(name);
  const objects: SceneObject[] = [];
  const background = readBackground(one(xml, 'cSld'), ctx, deck.stage);
  if (background) objects.push(background);
  // The master's own shapes, unless the layout hides them; read afresh, so each layout has its own copies.
  if (attr(xml, 'showMasterSp') !== '0') {
    const masterCtx = contextFor(deck, masterPart, [master], master, null);
    objects.push(...readTree(withoutPlaceholders(path(master, 'cSld', 'spTree')), masterCtx));
  }
  objects.push(...readTree(withoutPlaceholders(path(xml, 'cSld', 'spTree')), ctx));
  // Its title and content placeholders, where the layout (or the master) puts them.
  const masterPlaceholders = placeholdersOf(master);
  for (const placeholder of placeholdersOf(xml)) {
    const kind = placeholderKind(placeholder.key);
    if (!kind) continue;
    const frame =
      frameOf(placeholder.xfrm) ?? frameOf(matching(masterPlaceholders, placeholder.key)?.xfrm);
    if (frame) objects.push(createPlaceholder(kind, frame));
  }
  layer.objects = objects;
  return { id: createId('layout'), name, layer, role: null };
}

function readSlide(
  deck: Deck,
  partName: string,
  number: number,
  layoutIds: Map<string, string>,
): Slide {
  const xml = readPart(deck.parts, partName);
  const rels = relationships(deck.parts, partName);
  const layoutRel = [...rels.values()].find((rel) => rel.type === 'slideLayout');
  const layout =
    layoutRel && deck.parts.has(layoutRel.target)
      ? readPart(deck.parts, layoutRel.target)
      : undefined;
  const masterRel = layoutRel
    ? [...relationships(deck.parts, layoutRel.target).values()].find(
        (rel) => rel.type === 'slideMaster',
      )
    : undefined;
  const master =
    masterRel && deck.parts.has(masterRel.target)
      ? readPart(deck.parts, masterRel.target)
      : undefined;
  const ctx = contextFor(deck, partName, [layout, master], master, number);
  const byShapeId = new Map<string, SceneObject>();
  ctx.register = (shapeId, object) => byShapeId.set(shapeId, object);

  const tree = path(xml, 'cSld', 'spTree');
  const objects = readTree(tree, ctx);
  const background = readBackground(one(xml, 'cSld'), ctx, deck.stage);
  const titleShape = all(tree, 'sp').find((sp) =>
    TITLE_TYPES.has(attr(path(sp, 'nvSpPr', 'nvPr', 'ph'), 'type') ?? ''),
  );
  const slide = createSlide(plainWords(one(titleShape, 'txBody')) || `Slide ${number}`);
  slide.baseLayer.objects = background ? [background, ...objects] : objects;
  slide.layoutId = (layoutRel && layoutIds.get(layoutRel.target)) ?? null;
  // Its transition and animations (part C): the timeline lasts at least as long as they do.
  slide.properties.transition = readTransition(xml, ctx.report);
  const animated = applyAnimations(xml, byShapeId, deck.stage, ctx.report);
  if (animated > slide.baseLayer.timeline.duration) {
    slide.baseLayer.timeline.duration = Math.ceil(animated * 10) / 10;
  }
  if (attr(xml, 'show') === '0') {
    deck.report.push({
      slide: number,
      outcome: 'approximated',
      what: 'The slide is hidden in PowerPoint; it is shown here',
    });
  }
  if (attr(xml, 'showMasterSp') === '0' && slide.layoutId) {
    deck.report.push({
      slide: number,
      outcome: 'approximated',
      what: 'The slide hides its master’s shapes; here they show, from its layout',
    });
  }

  // Its notes: the notes slide's body placeholder.
  const notesRel = [...rels.values()].find((rel) => rel.type === 'notesSlide');
  if (notesRel && deck.parts.has(notesRel.target)) {
    const notes = readPart(deck.parts, notesRel.target);
    const body = all(path(notes, 'cSld', 'spTree'), 'sp').find(
      (sp) => attr(path(sp, 'nvSpPr', 'nvPr', 'ph'), 'type') === 'body',
    );
    const words = one(body, 'txBody');
    if (plainWords(words))
      slide.notes = readTextBody(words, deck.palette, { ...PLAIN_TEXT, bullets: [] });
  }
  return slide;
}

/**
 * Translation (docs/briefs/P10.3-translation.md): every piece of text a learner
 * can meet, as units with stable ids, and putting translated units back.
 * Formats (XLIFF, the two-column document) read and write these units.
 */
import { DEFAULT_LABELS, LABEL_KEYS, labelText } from './labels';
import type { LabelKey } from './labels';
import type { Layer, Project, RichText, RichTextNode, SceneObject, Slide } from './schema';
import { forEachObject } from './traverse';

/** A unit's words: text, numbered formatting tags round some of it, and line breaks. */
export type Inline = { text: string } | { open: number } | { close: number } | { br: true };

export interface TranslationUnit {
  id: string;
  source: Inline[];
  /** Where it is, for the translator. */
  note: string;
  /** Plain text takes no formatting tags; and its length limits. */
  plain: boolean;
  min: number;
  max: number;
}

/** A unit as it comes back: the source it was made from, and the translation. */
export interface TranslatedUnit {
  id: string;
  source: Inline[];
  /** Null or empty: not translated. */
  target: Inline[] | null;
}

export interface TranslationResult {
  translated: number;
  /** The project's words changed after the file was made. */
  changed: number;
  /** The project no longer has it. */
  missing: number;
  /** Left untranslated in the file. */
  untranslated: number;
  /** Tags the source did not have, or words too long or empty where they may not be. */
  invalid: number;
}

/** Equal words: the same text, tags and breaks, adjacent text joined. */
export function sameInline(a: readonly Inline[], b: readonly Inline[]): boolean {
  return JSON.stringify(joined(a)) === JSON.stringify(joined(b));
}

function joined(inlines: readonly Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const each of inlines) {
    const last = out[out.length - 1];
    if ('text' in each && last && 'text' in last) {
      out[out.length - 1] = { text: last.text + each.text };
    } else if (!('text' in each) || each.text !== '') {
      out.push({ ...each });
    }
  }
  return out;
}

/** The plain words of inlines, tags left out and breaks as new lines. */
export function inlineText(inlines: readonly Inline[]): string {
  return inlines.map((each) => ('text' in each ? each.text : 'br' in each ? '\n' : '')).join('');
}

// ------------------------------------------------------------------ slots

type Marks = NonNullable<RichTextNode['marks']>;

/** Where one unit lives: how to read it, and how to write it into a (draft) project. */
interface Slot {
  id: string;
  note: string;
  plain: boolean;
  min: number;
  max: number;
  get(): Inline[];
  /** False when `inlines` cannot go here (a tag it does not know). */
  set(inlines: Inline[]): boolean;
}

/** Plain text as inlines: its lines, with a break between each. */
const plainInline = (text: string): Inline[] =>
  joined(
    text
      .split('\n')
      .flatMap((line, index): Inline[] => [
        ...(index === 0 ? [] : [{ br: true as const }]),
        ...(line ? [{ text: line }] : []),
      ]),
  );

function plainSlot(
  id: string,
  note: string,
  get: () => string,
  put: (text: string) => void,
  limits: { min?: number; max?: number } = {},
): Slot {
  return {
    id,
    note,
    plain: true,
    min: limits.min ?? 0,
    max: limits.max ?? 100_000,
    get: () => plainInline(get()),
    set: (inlines) => {
      if (inlines.some((each) => 'open' in each || 'close' in each)) return false;
      put(inlineText(inlines));
      return true;
    },
  };
}

/** A paragraph's runs: text with its marks, and breaks. */
function paragraphInline(node: RichTextNode): { inlines: Inline[]; sets: Marks[] } {
  const sets: Marks[] = [];
  const keys: string[] = [];
  const inlines: Inline[] = [];
  for (const child of node.content ?? []) {
    if (child.type === 'hardBreak') {
      inlines.push({ br: true });
      continue;
    }
    if (child.type !== 'text' || !child.text) continue;
    const marks = child.marks ?? [];
    if (marks.length === 0) {
      inlines.push({ text: child.text });
      continue;
    }
    const key = JSON.stringify(marks);
    let n = keys.indexOf(key);
    if (n < 0) {
      keys.push(key);
      sets.push(marks);
      n = keys.length - 1;
    }
    inlines.push({ open: n + 1 }, { text: child.text }, { close: n + 1 });
  }
  return { inlines: joinedTags(inlines), sets };
}

/** Adjacent runs with the same marks as one tag: `{1}a{/1}{1}b{/1}` → `{1}ab{/1}`. */
function joinedTags(inlines: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const each of inlines) {
    const last = out[out.length - 1];
    if ('open' in each && last && 'close' in last && last.close === each.open) {
      out.pop();
      continue;
    }
    out.push(each);
  }
  return joined(out);
}

/** Paragraph content from inlines, the numbered tags given the marks they stood for. */
function paragraphContent(inlines: Inline[], sets: Marks[]): RichTextNode[] | null {
  const open: number[] = [];
  const content: RichTextNode[] = [];
  for (const each of inlines) {
    if ('open' in each) {
      if (!sets[each.open - 1]) return null;
      open.push(each.open);
    } else if ('close' in each) {
      const at = open.lastIndexOf(each.close);
      if (at < 0) return null;
      open.splice(at, 1);
    } else if ('br' in each) {
      content.push({ type: 'hardBreak' });
    } else if (each.text) {
      const marks = open.flatMap((n) => sets[n - 1]!);
      const unique = marks.filter(
        (mark, index) => marks.findIndex((other) => other.type === mark.type) === index,
      );
      content.push(
        unique.length > 0
          ? { type: 'text', text: each.text, marks: unique }
          : { type: 'text', text: each.text },
      );
    }
  }
  return open.length === 0 ? content : null;
}

/** One slot per non-empty paragraph or list item of a rich text, by its path in the document. */
function richSlots(prefix: string, note: string, doc: RichText): Slot[] {
  const slots: Slot[] = [];
  const visit = (node: RichTextNode, path: number[]) => {
    if (node.type === 'paragraph') {
      const { inlines, sets } = paragraphInline(node);
      if (!inlines.some((each) => 'text' in each && each.text.trim())) return;
      slots.push({
        id: `${prefix}/${path.join('.')}`,
        note,
        plain: false,
        min: 0,
        max: 100_000,
        get: () => paragraphInline(node).inlines,
        set: (next) => {
          const content = paragraphContent(next, sets);
          if (!content) return false;
          node.content = content;
          return true;
        },
      });
      return;
    }
    (node.content ?? []).forEach((child, index) => visit(child, [...path, index]));
  };
  doc.content.forEach((node, index) => visit(node, [index]));
  return slots;
}

function objectSlots(object: SceneObject, where: string): Slot[] {
  const at = `object/${object.id}`;
  const note = `${where} · ${object.name}`;
  const slots: Slot[] = [];
  if (object.type !== 'group' && 'text' in object.props && object.props.text) {
    slots.push(...richSlots(`${at}/text`, note, object.props.text));
  }
  for (const state of object.states) {
    if (state.overrides.text) {
      slots.push(
        ...richSlots(`${at}/state/${state.id}`, `${note} (${state.name})`, state.overrides.text),
      );
    }
  }
  const a11y = object.a11y;
  if (a11y.altText.trim()) {
    slots.push(
      plainSlot(
        `${at}/alt`,
        `${note} (alt text)`,
        () => a11y.altText,
        (text) => (a11y.altText = text),
      ),
    );
  }
  switch (object.type) {
    case 'table':
      object.props.rows.forEach((row, r) =>
        row.cells.forEach((cell, c) =>
          slots.push(
            ...richSlots(
              `${at}/cell/${r}.${c}`,
              `${note} (row ${r + 1}, column ${c + 1})`,
              cell.text,
            ),
          ),
        ),
      );
      break;
    case 'textEntry': {
      const props = object.props;
      if (props.placeholder.trim()) {
        slots.push(
          plainSlot(
            `${at}/placeholder`,
            `${note} (placeholder)`,
            () => props.placeholder,
            (text) => (props.placeholder = text),
            { max: 200 },
          ),
        );
      }
      break;
    }
    case 'dropdown': {
      const options = object.props.options;
      options.forEach((_, index) =>
        slots.push(
          plainSlot(
            `${at}/option/${index}`,
            `${note} (option ${index + 1})`,
            () => options[index]!,
            (text) => (options[index] = text),
            { min: 1, max: 200 },
          ),
        ),
      );
      break;
    }
    case 'marker': {
      const props = object.props;
      if (props.title.trim()) {
        slots.push(
          plainSlot(
            `${at}/title`,
            `${note} (title)`,
            () => props.title,
            (text) => (props.title = text),
            { max: 200 },
          ),
        );
      }
      if (props.body.trim()) {
        slots.push(
          plainSlot(
            `${at}/body`,
            `${note} (label)`,
            () => props.body,
            (text) => (props.body = text),
            { max: 5000 },
          ),
        );
      }
      break;
    }
    case 'web': {
      const props = object.props;
      slots.push(
        plainSlot(
          `${at}/title`,
          `${note} (title)`,
          () => props.title,
          (text) => (props.title = text),
          { min: 1, max: 200 },
        ),
      );
      break;
    }
    case 'panorama':
      for (const spot of object.props.spots) {
        const spotAt = `${at}/spot/${spot.id}`;
        const spotNote = `${note} (spot ${spot.name})`;
        slots.push(
          plainSlot(
            `${spotAt}/name`,
            spotNote,
            () => spot.name,
            (text) => (spot.name = text),
            { min: 1, max: 100 },
          ),
        );
        if (spot.title.trim()) {
          slots.push(
            plainSlot(
              `${spotAt}/title`,
              spotNote,
              () => spot.title,
              (text) => (spot.title = text),
              { max: 200 },
            ),
          );
        }
        if (spot.body.trim()) {
          slots.push(
            plainSlot(
              `${spotAt}/body`,
              spotNote,
              () => spot.body,
              (text) => (spot.body = text),
              { max: 5000 },
            ),
          );
        }
      }
      break;
    case 'audio':
    case 'video':
      for (const cue of object.props.captions) {
        if (!cue.text.trim()) continue;
        slots.push(
          plainSlot(
            `${at}/caption/${cue.id}`,
            `${note} (caption)`,
            () => cue.text,
            (text) => (cue.text = text),
          ),
        );
      }
      break;
    default:
      break;
  }
  return slots;
}

function layerSlots(layer: Layer, where: string, named: boolean): Slot[] {
  const slots: Slot[] = [];
  if (named) {
    slots.push(
      plainSlot(
        `layer/${layer.id}/name`,
        `${where} (layer name)`,
        () => layer.name,
        (text) => (layer.name = text),
        { min: 1 },
      ),
    );
  }
  forEachObject(layer.objects, (object) => {
    slots.push(...objectSlots(object, where));
  });
  return slots;
}

function slideSlots(slide: Slide, where: string): Slot[] {
  return [
    plainSlot(
      `slide/${slide.id}/title`,
      `${where} (title)`,
      () => slide.title,
      (text) => (slide.title = text),
    ),
    ...layerSlots(slide.baseLayer, where, false),
    ...slide.layers.flatMap((layer) => layerSlots(layer, `${where} · ${layer.name}`, true)),
    ...richSlots(`slide/${slide.id}/notes`, `${where} (notes)`, slide.notes),
  ];
}

/** Every slot of the project, in course order, then masters, then the player. */
function slotsOf(project: Project): Slot[] {
  const slots: Slot[] = [
    plainSlot(
      'project/title',
      'Course title',
      () => project.title,
      (text) => (project.title = text),
    ),
  ];
  let number = 0;
  for (const scene of project.scenes) {
    slots.push(
      plainSlot(
        `scene/${scene.id}/title`,
        `Scene “${scene.title}” (title)`,
        () => scene.title,
        (text) => (scene.title = text),
      ),
    );
    for (const slide of scene.slides) {
      number += 1;
      slots.push(...slideSlots(slide, `Slide ${number}`));
    }
  }
  for (const bank of project.banks) {
    slots.push(
      plainSlot(
        `scene/${bank.id}/title`,
        `Question bank “${bank.title}” (title)`,
        () => bank.title,
        (text) => (bank.title = text),
      ),
    );
    bank.slides.forEach((slide, index) =>
      slots.push(...slideSlots(slide, `Question bank “${bank.title}”, slide ${index + 1}`)),
    );
  }
  for (const master of project.masters) {
    slots.push(...layerSlots(master.layer, `Master “${master.name}”`, false));
    for (const layout of master.layouts) {
      slots.push(...layerSlots(layout.layer, `Layout “${layout.name}”`, false));
    }
  }

  const { player } = project;
  for (const [slideId, entry] of Object.entries(player.menu.entries)) {
    if (entry.title === null || !entry.title.trim()) continue;
    slots.push(
      plainSlot(
        `menu/${slideId}/title`,
        'Player menu entry',
        () => entry.title ?? '',
        (text) => (entry.title = text),
        { max: 200 },
      ),
    );
  }
  for (const item of player.tabs.resources.items) {
    slots.push(
      plainSlot(
        `resource/${item.id}/title`,
        'Resources tab',
        () => item.title,
        (text) => (item.title = text),
        { min: 1, max: 200 },
      ),
    );
  }
  for (const term of player.tabs.glossary.terms) {
    slots.push(
      plainSlot(
        `glossary/${term.id}/term`,
        'Glossary term',
        () => term.term,
        (text) => (term.term = text),
        { min: 1, max: 200 },
      ),
    );
    if (term.definition.trim()) {
      slots.push(
        plainSlot(
          `glossary/${term.id}/definition`,
          `Glossary: ${term.term}`,
          () => term.definition,
          (text) => (term.definition = text),
          { max: 5000 },
        ),
      );
    }
  }
  for (const tab of player.tabs.custom) {
    slots.push(
      plainSlot(
        `tab/${tab.id}/label`,
        'Player tab',
        () => tab.label,
        (text) => (tab.label = text),
        { min: 1, max: 40 },
      ),
    );
  }
  for (const key of LABEL_KEYS) {
    slots.push(
      plainSlot(
        `label/${key}`,
        `Player word (${key})`,
        () => labelText(player.labels, key),
        // Written for the target language by `applyTranslation`, never the source's.
        () => undefined,
        { min: 1, max: 300 },
      ),
    );
  }
  return slots;
}

// ------------------------------------------------------------- the units

/** Every piece of text a learner can meet, in course order. */
export function translationUnits(project: Project): TranslationUnit[] {
  return slotsOf(project).map(({ id, note, plain, min, max, get }) => ({
    id,
    source: get(),
    note,
    plain,
    min,
    max,
  }));
}

/**
 * Put translated units into `draft` (a copy the caller may change), and make
 * `language` the course's. Units whose source has changed, that the project
 * no longer has, or whose target cannot go there are skipped and counted.
 */
export function applyTranslation(
  draft: Project,
  units: readonly TranslatedUnit[],
  language: string,
): TranslationResult {
  const result: TranslationResult = {
    translated: 0,
    changed: 0,
    missing: 0,
    untranslated: 0,
    invalid: 0,
  };
  const slots = new Map(slotsOf(draft).map((slot) => [slot.id, slot]));
  const labels = draft.player.labels;
  const words: Partial<Record<LabelKey, string>> = { ...(labels.words[language] ?? {}) };
  for (const unit of units) {
    const slot = slots.get(unit.id);
    if (!slot) {
      result.missing += 1;
      continue;
    }
    if (!sameInline(slot.get(), unit.source)) {
      result.changed += 1;
      continue;
    }
    if (!unit.target || !inlineText(unit.target).trim()) {
      result.untranslated += 1;
      continue;
    }
    const text = inlineText(unit.target);
    if (slot.plain && (text.length < slot.min || text.length > slot.max)) {
      result.invalid += 1;
      continue;
    }
    if (unit.id.startsWith('label/')) {
      if (unit.target.some((each) => 'open' in each || 'close' in each)) {
        result.invalid += 1;
        continue;
      }
      const key = unit.id.slice('label/'.length) as LabelKey;
      if (text === DEFAULT_LABELS[key] && language === 'en') delete words[key];
      else words[key] = text;
      result.translated += 1;
      continue;
    }
    if (!slot.set(unit.target)) {
      result.invalid += 1;
      continue;
    }
    result.translated += 1;
  }
  labels.language = language;
  if (Object.keys(words).length > 0) labels.words[language] = words;
  else delete labels.words[language];
  return result;
}

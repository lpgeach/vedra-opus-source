import type { EngineView, ObjectPart } from '@vedraopus/engine';
import { byLayout, replaceVariableReferences, resolveObjectState } from '@vedraopus/model';
import type { RichText, SceneObject, Slide } from '@vedraopus/model';

/**
 * The text view (docs/briefs/P10.1-accessibility.md, part C): the slide's text
 * in reading order, for a learner to read at the size they choose. It is a
 * copy to read; the slide itself stays the place to act.
 */

export type TextBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'picture'; text: string }
  | { kind: 'table'; rows: string[][]; headerRow: boolean; headerColumn: boolean }
  | { kind: 'field'; label: string; value: string }
  | { kind: 'choice'; text: string; checked: boolean };

interface RichNode {
  type?: string;
  text?: string;
  content?: RichNode[];
  attrs?: Record<string, unknown>;
}

/** A node's words, a hard break as a space. */
function inline(node: RichNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return ' ';
  return (node.content ?? []).map(inline).join('');
}

/** A list's items, a nested list's items following its parent's. */
function listItems(list: RichNode, words: (text: string) => string): string[] {
  const items: string[] = [];
  for (const item of list.content ?? []) {
    const own = (item.content ?? [])
      .filter((child) => child.type !== 'bulletList' && child.type !== 'orderedList')
      .map(inline)
      .join(' ');
    const text = words(own);
    if (text) items.push(text);
    for (const child of item.content ?? []) {
      if (child.type === 'bulletList' || child.type === 'orderedList') {
        items.push(...listItems(child, words));
      }
    }
  }
  return items;
}

/** Rich text as paragraphs and lists; blank paragraphs are left out. */
export function richTextBlocks(doc: RichText, words: (text: string) => string): TextBlock[] {
  const blocks: TextBlock[] = [];
  for (const node of (doc as RichNode).content ?? []) {
    if (node.type === 'bulletList' || node.type === 'orderedList') {
      const items = listItems(node, words);
      if (items.length > 0)
        blocks.push({ kind: 'list', ordered: node.type === 'orderedList', items });
      continue;
    }
    const text = words(inline(node));
    if (text) blocks.push({ kind: 'paragraph', text });
  }
  return blocks;
}

export interface TextViewOptions {
  /** `%Name%` as the course shows it now; undefined leaves the name as written. */
  variable?: (name: string) => string | undefined;
  /** Objects read even when marked decorative: a question's answers, and draggable tiles. */
  alwaysRead?: ReadonlySet<string>;
}

/**
 * The slide's text as the learner sees it now: its title, then each shown layer
 * (base first), each layer's objects in reading order (the author's Tab order
 * first, then by layout; a group's parts by layout), each in its current state.
 * Hidden objects and decoration give nothing.
 */
export function slideTextBlocks(
  slide: Slide,
  view: EngineView,
  title: string,
  options: TextViewOptions = {},
): TextBlock[] {
  const words = (text: string) => {
    const filled = options.variable ? replaceVariableReferences(text, options.variable) : text;
    return filled.replace(/\s+/g, ' ').trim();
  };
  const listed = slide.properties.focusOrder ?? [];
  const inOrder = (objects: readonly SceneObject[]) => {
    const first = listed
      .map((id) => objects.find((object) => object.id === id))
      .filter((object) => object !== undefined);
    return [...first, ...byLayout(objects.filter((object) => !listed.includes(object.id)))];
  };

  const blocks: TextBlock[] = [{ kind: 'heading', text: title }];
  const read = (
    object: SceneObject,
    state: string,
    value: string | undefined,
    parts: Record<string, ObjectPart> | undefined,
    replaced?: string,
  ) => {
    const shown = resolveObjectState(object, state);
    const alt = words(shown.a11y.altText);
    const decorative = !shown.a11y.visibleToAssistiveTech && !options.alwaysRead?.has(object.id);
    if (shown.type === 'group') {
      if (decorative) return;
      const inside = (child: SceneObject) => parts?.[child.id];
      for (const child of byLayout(shown.children)) {
        const part = inside(child);
        if (part && !part.visible) continue;
        read(child, part?.state ?? 'normal', part?.value, parts);
      }
      return;
    }
    switch (shown.type) {
      case 'choice': {
        const text = richTextBlocks(shown.props.text, words)
          .map((block) => ('text' in block ? block.text : ''))
          .join(' ')
          .trim();
        if (text) blocks.push({ kind: 'choice', text, checked: state === 'selected' });
        return;
      }
      case 'textEntry':
        blocks.push({
          kind: 'field',
          // Named as the course names its input (render's `aria-label`).
          label: alt || shown.name,
          value: value ?? '',
        });
        return;
      case 'dropdown':
        blocks.push({ kind: 'field', label: alt || shown.name, value: value ?? '' });
        return;
      case 'table': {
        if (decorative) return;
        const rows = shown.props.rows.map((row) =>
          row.cells.map((cell) =>
            richTextBlocks(cell.text, words)
              .map((block) =>
                block.kind === 'list' ? block.items.join(', ') : 'text' in block ? block.text : '',
              )
              .join(' '),
          ),
        );
        blocks.push({
          kind: 'table',
          rows,
          headerRow: shown.props.headerRow,
          headerColumn: shown.props.headerColumn,
        });
        return;
      }
      default:
        break;
    }
    if (decorative) return;
    // Words the engine put in place of the object's own (a feedback message, P7.5).
    if (replaced !== undefined) {
      for (const line of replaced.split('\n')) {
        const text = words(line);
        if (text) blocks.push({ kind: 'paragraph', text });
      }
      return;
    }
    const text = 'text' in shown.props && shown.props.text ? shown.props.text : null;
    const own = text ? richTextBlocks(text, words) : [];
    if (own.length > 0) {
      blocks.push(...own);
      return;
    }
    // Wordless: a picture, or anything else the author described.
    if (alt) blocks.push({ kind: 'picture', text: alt });
  };

  for (const layer of view.layers) {
    if (!layer.isBase && !layer.shown) continue;
    const model = [slide.baseLayer, ...slide.layers].find((each) => each.id === layer.id);
    if (!model) continue;
    const views = new Map(layer.objects.map((object) => [object.id, object]));
    for (const object of inOrder(model.objects)) {
      const seen = views.get(object.id);
      if (!seen?.visible) continue;
      read(object, seen.state, seen.value, seen.parts, seen.text);
    }
  }
  return blocks;
}

/** The words the text view needs, in the course's language. */
export type TextViewWords = (
  key: 'textPicture' | 'textField' | 'textEmpty' | 'textChosen',
  values: Record<string, string>,
) => string;

/** The blocks as elements: a heading, paragraphs, lists and a table, for reading. */
export function drawTextBlocks(
  document: Document,
  blocks: readonly TextBlock[],
  say: TextViewWords,
): HTMLElement[] {
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
    const element = document.createElement(tag);
    if (text !== undefined) {
      element.textContent = text;
      // Words run their own way, as on the slide (P10.3): English in an Arabic course too
      // (the Phase 10 review).
      element.dir = 'auto';
    }
    return element;
  };
  return blocks.map((block) => {
    switch (block.kind) {
      case 'heading':
        return make('h2', block.text);
      case 'paragraph':
        return make('p', block.text);
      case 'list': {
        const list = make(block.ordered ? 'ol' : 'ul');
        list.append(...block.items.map((item) => make('li', item)));
        return list;
      }
      case 'picture':
        return make('p', say('textPicture', { text: block.text }));
      case 'field':
        return make(
          'p',
          say('textField', { label: block.label, value: block.value || say('textEmpty', {}) }),
        );
      case 'choice':
        return make('p', block.checked ? say('textChosen', { text: block.text }) : block.text);
      case 'table': {
        const table = make('table');
        const body = make('tbody');
        block.rows.forEach((row, r) => {
          const line = make('tr');
          row.forEach((cell, c) => {
            const header = (block.headerRow && r === 0) || (block.headerColumn && c === 0);
            const element = make(header ? 'th' : 'td', cell);
            if (header) element.setAttribute('scope', r === 0 && block.headerRow ? 'col' : 'row');
            line.append(element);
          });
          body.append(line);
        });
        table.append(body);
        return table;
      }
    }
  });
}

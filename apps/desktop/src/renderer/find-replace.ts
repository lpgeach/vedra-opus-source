/**
 * Find and Replace across a project's text (docs/briefs/B17-ribbon-and-panels.md): the text of
 * text boxes, shapes and buttons on every slide and layer, question banks included. Pure
 * functions: the dialog shows the matches and applies the replacements through history.
 *
 * Text is matched within each run of identically formatted characters, so a word half bold and
 * half not is not found as one word.
 */
import { everySlide, forEachObject, slideLayers } from '@vedraopus/model';
import type { Project, RichText, SceneObject } from '@vedraopus/model';

export interface TextMatch {
  slideId: string;
  slideTitle: string;
  /** The overlay layer it is on, or null for the base layer. */
  layerId: string | null;
  objectId: string;
  objectName: string;
  /** How many times the object's text holds the words. */
  count: number;
  /** The object's text, to show which it is. */
  text: string;
}

interface TextNode {
  type?: string;
  text?: string;
  content?: TextNode[];
}

/** The rich text an object carries, if any. */
export function objectText(object: SceneObject): RichText | null {
  if (object.type !== 'text' && object.type !== 'shape' && object.type !== 'button') return null;
  return (object.props.text as RichText | null) ?? null;
}

function escape(words: string): string {
  return words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pattern(words: string, matchCase: boolean): RegExp {
  return new RegExp(escape(words), matchCase ? 'g' : 'gi');
}

/** The text of a document, paragraphs joined by spaces. */
export function plainText(doc: RichText): string {
  const parts: string[] = [];
  const visit = (node: TextNode) => {
    if (typeof node.text === 'string') parts.push(node.text);
    node.content?.forEach((child, index) => {
      if (index > 0 && child.type === 'paragraph') parts.push(' ');
      visit(child);
    });
  };
  visit(doc as TextNode);
  return parts.join('');
}

/** How many times each text run holds the words, added up. */
export function countIn(doc: RichText, words: string, matchCase: boolean): number {
  if (words === '') return 0;
  let count = 0;
  const visit = (node: TextNode) => {
    if (typeof node.text === 'string')
      count += node.text.match(pattern(words, matchCase))?.length ?? 0;
    node.content?.forEach(visit);
  };
  visit(doc as TextNode);
  return count;
}

/** The document with every match replaced, and how many were. The input is not changed. */
export function replaceIn(
  doc: RichText,
  words: string,
  replacement: string,
  matchCase: boolean,
): { doc: RichText; count: number } {
  let count = 0;
  const visit = (node: TextNode): TextNode => {
    const next: TextNode = { ...node };
    if (typeof node.text === 'string' && words !== '') {
      next.text = node.text.replace(pattern(words, matchCase), () => {
        count += 1;
        return replacement;
      });
    }
    if (node.content) next.content = node.content.map(visit);
    return next;
  };
  const result = visit(doc as TextNode) as RichText;
  return { doc: result, count };
}

/** Every object whose text holds the words, slide by slide, in the order the course has them. */
export function findInProject(project: Project, words: string, matchCase: boolean): TextMatch[] {
  if (words === '') return [];
  const matches: TextMatch[] = [];
  for (const { slide } of everySlide(project)) {
    for (const { layer, path } of slideLayers(slide)) {
      const layerId = path[0] === 'baseLayer' ? null : layer.id;
      forEachObject(layer.objects, (object) => {
        const doc = objectText(object);
        if (!doc) return;
        const count = countIn(doc, words, matchCase);
        if (count === 0) return;
        matches.push({
          slideId: slide.id,
          slideTitle: slide.title,
          layerId,
          objectId: object.id,
          objectName: object.name,
          count,
          text: plainText(doc),
        });
      });
    }
  }
  return matches;
}

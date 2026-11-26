/**
 * The authoring-side accessibility checker (docs/briefs/P10.2-accessibility-checker.md):
 * what a learner using a screen reader, the keyboard or captions would miss,
 * by the same rules the course uses (P10.1).
 */
import { contrastRatio } from './player-look';
import { questionObjects } from './questions';
import type { Color, Project, RichText, RichTextNode, SceneObject, Slide, Theme } from './schema';
import { byLayout, tabbableObjects } from './tab-order';
import { forEachObject } from './traverse';

export type A11yIssueKind = 'altText' | 'focusOrder' | 'contrast' | 'captions';

export interface A11yIssue {
  kind: A11yIssueKind;
  slideId: string;
  /** The object it is about; null for the slide as a whole. */
  objectId: string | null;
  /** Plain words for the author, naming the object. */
  message: string;
}

/** WCAG 1.4.3: normal text, and large text (24 px, or 18.66 px bold). */
export const TEXT_CONTRAST = 4.5;
export const LARGE_TEXT_CONTRAST = 3;
const DEFAULT_FONT_SIZE = 18;

const wordsOf = (doc: RichText | null | undefined): string => {
  const words = (node: RichTextNode): string =>
    node.type === 'text' ? (node.text ?? '') : (node.content ?? []).map(words).join(' ');
  return doc ? doc.content.map(words).join(' ').replace(/\s+/g, ' ').trim() : '';
};

const textOf = (object: SceneObject): RichText | null =>
  object.type !== 'group' && 'text' in object.props && object.props.text
    ? (object.props.text as RichText)
    : null;

/** The name the course gives an object: its alt text, its words, or its object name. */
export function courseName(object: SceneObject): string {
  return object.a11y.altText.trim() || wordsOf(textOf(object)) || object.name;
}

// ---------------------------------------------------------------- colours

type Rgba = [number, number, number, number];

function rgba(color: Color, theme: Theme): Rgba {
  const hex = typeof color === 'string' ? color : theme.colors[color.theme];
  const at = (offset: number) => parseInt(hex.slice(offset, offset + 2), 16);
  return [at(1), at(3), at(5), hex.length === 9 ? at(7) / 255 : 1];
}

const toHex = ([r, g, b]: Rgba) =>
  `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`;

/** `top` laid over the opaque `under`. */
const over = (top: Rgba, under: Rgba): Rgba => {
  const a = top[3];
  return [
    top[0] * a + under[0] * (1 - a),
    top[1] * a + under[1] * (1 - a),
    top[2] * a + under[2] * (1 - a),
    1,
  ];
};

/** A run of text: its colour (if it sets one), size and weight. */
interface Run {
  color: Color | null;
  size: number;
  bold: boolean;
}

function runsOf(doc: RichText): Run[] {
  const runs: Run[] = [];
  const visit = (node: RichTextNode) => {
    if (node.type === 'text') {
      if (!(node.text ?? '').trim()) return;
      let color: Color | null = null;
      let size = DEFAULT_FONT_SIZE;
      let bold = false;
      for (const mark of node.marks ?? []) {
        if (mark.type === 'bold' || mark.type === 'strong') bold = true;
        if (mark.type === 'textStyle') {
          const value = mark.attrs?.['color'];
          if (typeof value === 'string' && /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(value)) {
            color = value;
          } else if (value && typeof value === 'object' && 'theme' in value) {
            color = value as Color;
          }
          const fontSize = mark.attrs?.['fontSize'];
          if (typeof fontSize === 'number') size = fontSize;
          else if (typeof fontSize === 'string' && Number.isFinite(parseFloat(fontSize))) {
            size = parseFloat(fontSize);
          }
        }
      }
      runs.push({ color, size, bold });
      return;
    }
    for (const child of node.content ?? []) visit(child);
  };
  for (const node of doc.content) visit(node);
  return runs;
}

const isLarge = (run: Run) => run.size >= 24 || (run.bold && run.size >= 18.66);

// ---------------------------------------------------------------- the check

/** Every problem the checker finds in the course, in course order. */
export function accessibilityIssues(project: Project): A11yIssue[] {
  const issues: A11yIssue[] = [];
  const slides = [...project.scenes, ...project.banks].flatMap((scene) => scene.slides);
  for (const slide of slides) issues.push(...slideIssues(project, slide));
  return issues;
}

function slideIssues(project: Project, slide: Slide): A11yIssue[] {
  const issues: A11yIssue[] = [];
  const add = (kind: A11yIssueKind, objectId: string | null, message: string) =>
    issues.push({ kind, slideId: slide.id, objectId, message });
  const { theme } = project;
  const background = rgba(theme.colors.background, theme);

  const answering = new Set(
    (slide.question ? questionObjects(slide.question) : [])
      .filter((part) => part.role !== 'prompt' && part.role !== 'submit button')
      .map((part) => part.id),
  );
  const clicked = new Set<string>();
  for (const { event } of slide.triggers) {
    if (event.type === 'click' || event.type === 'doubleClick' || event.type === 'rightClick') {
      clicked.add(event.object);
    }
  }

  for (const layer of [slide.baseLayer, ...slide.layers]) {
    const all: SceneObject[] = [];
    forEachObject(layer.objects, (object) => {
      all.push(object);
    });
    for (const object of byLayout(all)) {
      const read = object.a11y.visibleToAssistiveTech && !answering.has(object.id);
      const alt = object.a11y.altText.trim();
      const words = wordsOf(textOf(object));
      const named = `“${object.name}”`;

      // Alt text.
      if (read && !alt) {
        if (object.type === 'image')
          add('altText', object.id, `The picture ${named} has no alt text.`);
        if (object.type === 'graphic')
          add('altText', object.id, `The graphic ${named} has no alt text.`);
        if (object.type === 'panorama') {
          add('altText', object.id, `The 360° image ${named} has no alt text.`);
        }
        // A wordless shape without alt text reads as nothing, as decoration does: most
        // are backgrounds and panels, so it is not listed (P10.2's brief).
      }
      if (
        !answering.has(object.id) &&
        !alt &&
        !words &&
        (object.type === 'button' || (clicked.has(object.id) && object.type !== 'group'))
      ) {
        add(
          'altText',
          object.id,
          `${named} can be pressed but has no words or alt text, so it is read only by its object name.`,
        );
      }

      // Captions.
      if (object.type === 'video' && object.props.captions.length === 0) {
        add('captions', object.id, `The video ${named} has no captions.`);
      }
      if (object.type === 'audio' && object.props.captions.length === 0) {
        add(
          'captions',
          object.id,
          object.props.speech
            ? `The sound ${named}, made from text, has no captions.`
            : `The sound ${named} has no captions.`,
        );
      }

      // Contrast.
      const lowest = lowestContrast(object, layer.objects, theme, background);
      if (lowest) {
        add(
          'contrast',
          object.id,
          `The text of ${named} has a contrast of ${lowest.ratio.toFixed(1)} : 1; it needs ${lowest.needed} : 1.`,
        );
      }
    }
  }

  // The Tab order.
  const tabbable = tabbableObjects(slide);
  // Names clash only where the learner meets them together: within the base layer,
  // or within an overlay and the base beneath it. Two feedback layers never show at once.
  const layerOf = new Map<string, string>();
  for (const layer of [slide.baseLayer, ...slide.layers]) {
    forEachObject(layer.objects, (object) => {
      layerOf.set(object.id, layer.id);
    });
  }
  const reported = new Set<string>();
  for (const layer of [slide.baseLayer, ...slide.layers]) {
    const together = tabbable.filter((object) => {
      const on = layerOf.get(object.id);
      return on === layer.id || on === slide.baseLayer.id;
    });
    const byName = new Map<string, SceneObject[]>();
    for (const object of together) {
      const name = courseName(object).toLowerCase();
      byName.set(name, [...(byName.get(name) ?? []), object]);
    }
    for (const same of byName.values()) {
      const key = same.map((object) => object.id).join(' ');
      if (same.length < 2 || reported.has(key)) continue;
      reported.add(key);
      add(
        'focusOrder',
        same[0]!.id,
        `${same.length} objects reached with Tab are all called “${courseName(same[0]!)}”: give each its own words or alt text.`,
      );
    }
  }
  for (const object of tabbable) {
    const { x, y, width, height } = object.frame;
    if (
      x + width <= 0 ||
      y + height <= 0 ||
      x >= project.stage.width ||
      y >= project.stage.height
    ) {
      add(
        'focusOrder',
        object.id,
        `“${object.name}” is reached with Tab but lies outside the slide, where nobody sees it.`,
      );
    }
  }
  const listed = slide.properties.focusOrder;
  if (listed) {
    const left = tabbable.filter((object) => !listed.includes(object.id));
    if (left.length > 0) {
      add(
        'focusOrder',
        null,
        `The slide’s own Tab order leaves out ${left.map((object) => `“${object.name}”`).join(', ')}: Tab reaches ${left.length === 1 ? 'it' : 'them'} last, by layout.`,
      );
    }
  }
  return issues;
}

/**
 * The lowest contrast of an object's text against what is behind it, when it
 * is below what that text needs; null when it is enough, or cannot be judged.
 */
function lowestContrast(
  object: SceneObject,
  siblings: readonly SceneObject[],
  theme: Theme,
  background: Rgba,
): { ratio: number; needed: number } | null {
  /** What is behind the text: a solid colour, or null when it cannot be judged. */
  const behind = (): Rgba | null => {
    if (object.type === 'shape' || object.type === 'button') {
      const { fill } = object.props.appearance;
      if (fill.kind === 'solid') return over(rgba(fill.color, theme), background);
      if (fill.kind !== 'none') return null;
    }
    if (object.type === 'shape' || object.type === 'button' || object.type === 'text') {
      // The topmost solid shape beneath it on its layer that holds its middle.
      const index = siblings.indexOf(object);
      const middle = {
        x: object.frame.x + object.frame.width / 2,
        y: object.frame.y + object.frame.height / 2,
      };
      for (let i = index - 1; i >= 0; i--) {
        const under = siblings[i]!;
        const { x, y, width, height } = under.frame;
        if (middle.x < x || middle.x > x + width || middle.y < y || middle.y > y + height) continue;
        if (under.type !== 'shape' && under.type !== 'button') return null;
        const { fill } = under.props.appearance;
        if (fill.kind === 'none') continue;
        return fill.kind === 'solid' ? over(rgba(fill.color, theme), background) : null;
      }
    }
    return background;
  };

  const docs: { doc: RichText; under: Rgba | null; base: Color }[] = [];
  if (object.type === 'table') {
    const { rows, headerRow, headerColumn, headerFill, headerText, bandFill } = object.props;
    rows.forEach((row, r) =>
      row.cells.forEach((cell, c) => {
        const header = (headerRow && r === 0) || (headerColumn && c === 0);
        const banded = !header && bandFill !== null && (r - (headerRow ? 1 : 0)) % 2 === 1;
        const fill = cell.fill ?? (header ? headerFill : banded ? bandFill : null);
        docs.push({
          doc: cell.text,
          under: fill ? over(rgba(fill, theme), background) : background,
          base: header ? headerText : { theme: 'text' },
        });
      }),
    );
  } else {
    const doc = textOf(object);
    if (!doc) return null;
    docs.push({ doc, under: behind(), base: { theme: 'text' } });
  }

  let worst: { ratio: number; needed: number } | null = null;
  for (const { doc, under, base } of docs) {
    if (!under) continue;
    for (const run of runsOf(doc)) {
      const text = over(rgba(run.color ?? base, theme), under);
      const ratio = contrastRatio(toHex(text), toHex(under));
      const needed = isLarge(run) ? LARGE_TEXT_CONTRAST : TEXT_CONTRAST;
      if (ratio < needed && (!worst || ratio < worst.ratio)) worst = { ratio, needed };
    }
  }
  return worst;
}

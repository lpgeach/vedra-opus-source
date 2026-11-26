import { forEachObject, questionObjects } from '@vedraopus/model';
import type { SceneObject, Slide } from '@vedraopus/model';

/**
 * What a slide's objects are to screen readers and the keyboard in a course
 * (docs/briefs/P10.1-accessibility.md, part A). Render draws them; this says
 * which are buttons, which are pictures with names, which are hidden as
 * decoration. Choices, fields, controls, hotspots and markers, web objects,
 * graphics, tables and 360° images have their own semantics already.
 */

/** The words of rich text, paragraphs joined by spaces. */
export function richTextWords(doc: { content?: unknown[] }): string {
  const words = (node: unknown): string => {
    const record = node as { type?: string; text?: string; content?: unknown[] };
    return record.type === 'text'
      ? (record.text ?? '')
      : (record.content ?? []).map(words).join('');
  };
  return (doc.content ?? []).map(words).join(' ').trim();
}

export interface Semantics {
  /** An ARIA role to set; undefined leaves the element as it is. */
  role?: 'button' | 'img' | 'group';
  /** Its accessible name. */
  label?: string;
  /** Hidden from screen readers (decoration). */
  hidden?: boolean;
  /** Reached with Tab and pressed with Space or Enter. */
  pressable?: boolean;
}

/** Types whose own drawing or player module gives them their semantics. */
const OWN = new Set<SceneObject['type']>([
  'choice',
  'textEntry',
  'dropdown',
  'slider',
  'dial',
  'hotspot',
  'marker',
  'web',
  'graphic',
  'table',
  'panorama',
  'audio',
  'video',
  'zoomRegion',
]);

const wordsOf = (object: SceneObject): string =>
  object.type !== 'group' && 'text' in object.props && object.props.text
    ? richTextWords(object.props.text).trim()
    : '';

/**
 * The objects of a slide a learner can click to make something happen: those a
 * click, double-click or right-click trigger names, and every button.
 */
export function clickableObjects(slide: Slide): Set<string> {
  const clickable = new Set<string>();
  for (const { event } of slide.triggers) {
    if (event.type === 'click' || event.type === 'doubleClick' || event.type === 'rightClick') {
      clickable.add(event.object);
    }
  }
  for (const layer of [slide.baseLayer, ...slide.layers]) {
    forEachObject(layer.objects, (object) => {
      if (object.type === 'button') clickable.add(object.id);
    });
  }
  return clickable;
}

/** What one object is, given whether a learner can click it. */
export function semanticsOf(object: SceneObject, clickable: boolean): Semantics {
  if (OWN.has(object.type)) return {};
  const alt = object.a11y.altText.trim();
  const words = wordsOf(object);
  if (clickable) {
    // A button, named by its alt text, its words or, failing those, its name.
    return { role: 'button', label: alt || words || object.name, pressable: true };
  }
  if (!object.a11y.visibleToAssistiveTech) return { hidden: true };
  if (object.type === 'group') return alt ? { role: 'group', label: alt } : {};
  if (object.type === 'image') return {};
  // A shape or text box: its words are read as they are; a wordless shape with alt text is a picture.
  if (!words && alt) return { role: 'img', label: alt };
  return {};
}

/**
 * Apply the semantics to a drawn slide. Redrawing replaces an object's element,
 * so this runs after every draw. `shown` says whether an object is on stage
 * and visible; a hidden one is taken out of the Tab order.
 */
export function applySemantics(
  slide: Slide,
  elementOf: (id: string) => HTMLElement | undefined,
  shown: (id: string) => boolean,
  disabled: (id: string) => boolean,
): void {
  const clickable = clickableObjects(slide);
  // A question's choices, tiles, targets and spots have the question's own
  // semantics (P7); its prompt and Submit button are ordinary.
  const answering = new Set(
    (slide.question ? questionObjects(slide.question) : [])
      .filter((part) => part.role !== 'prompt' && part.role !== 'submit button')
      .map((part) => part.id),
  );
  for (const layer of [slide.baseLayer, ...slide.layers]) {
    forEachObject(layer.objects, (object) => {
      const element = elementOf(object.id);
      if (!element || answering.has(object.id)) return;
      // A choice or a draggable object is marked by its own code (P7, P9.3, P9.7).
      if (element.dataset['choice'] === 'true' || element.dataset['draggable'] === 'true') return;
      const semantics = semanticsOf(object, clickable.has(object.id));
      if (semantics.role) element.setAttribute('role', semantics.role);
      if (semantics.label !== undefined) element.setAttribute('aria-label', semantics.label);
      if (semantics.hidden) element.setAttribute('aria-hidden', 'true');
      if (semantics.pressable) {
        element.dataset['press'] = 'true';
        const off = !shown(object.id) || disabled(object.id);
        element.tabIndex = off ? -1 : 0;
        if (disabled(object.id)) element.setAttribute('aria-disabled', 'true');
        else element.removeAttribute('aria-disabled');
      }
    });
  }
}

/**
 * The objects a learner reaches with Tab on a slide in a course, and the order
 * they come in (docs/briefs/P10.1-accessibility.md, part B). The player works
 * from what it draws; the editor's Tab order panel uses these.
 */
import type { SceneObject, Slide } from './schema';
import { forEachObject } from './traverse';

/** Types a learner always reaches with Tab: controls, buttons and the like. */
const TABBABLE = new Set<SceneObject['type']>([
  'button',
  'choice',
  'textEntry',
  'dropdown',
  'slider',
  'dial',
  'hotspot',
  'marker',
  'web',
  'panorama',
]);

/** The slide's objects a learner can reach with Tab, on any layer, in groups too. */
export function tabbableObjects(slide: Slide): SceneObject[] {
  const clicked = new Set<string>();
  for (const { event } of slide.triggers) {
    if (event.type === 'click' || event.type === 'doubleClick' || event.type === 'rightClick') {
      clicked.add(event.object);
    }
  }
  const found: SceneObject[] = [];
  for (const layer of [slide.baseLayer, ...slide.layers]) {
    forEachObject(layer.objects, (object) => {
      if (TABBABLE.has(object.type) || clicked.has(object.id) || object.drag !== null) {
        found.push(object);
      }
    });
  }
  return found;
}

/** By place: top to bottom, then left to right, tops within 4 stage pixels being one row. */
export function byLayout(objects: readonly SceneObject[]): SceneObject[] {
  return [...objects].sort((a, b) =>
    Math.abs(a.frame.y - b.frame.y) > 4 ? a.frame.y - b.frame.y : a.frame.x - b.frame.x,
  );
}

/** The order Tab reaches them: the author's listed objects first, then the rest by layout. */
export function tabOrder(slide: Slide): SceneObject[] {
  const objects = tabbableObjects(slide);
  const listed = slide.properties.focusOrder ?? [];
  const byId = new Map(objects.map((object) => [object.id, object]));
  const first = listed.map((id) => byId.get(id)).filter((object) => object !== undefined);
  const rest = byLayout(objects.filter((object) => !listed.includes(object.id)));
  return [...first, ...rest];
}

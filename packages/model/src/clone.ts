import { createId } from './ids';
import type { IdPrefix } from './ids';
import type { Layer, Scene, SceneObject, Slide, Trigger } from './schema';
import { renewPartIds } from './questions';
import { forEachObject, slideLayers } from './traverse';

/** Replace every string equal to a key of `ids`, anywhere inside `value`. */
function remap(value: unknown, ids: ReadonlyMap<string, string>): unknown {
  if (typeof value === 'string') return ids.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => remap(item, ids));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remap(v, ids)]));
  }
  return value;
}

/**
 * Give `objects` (copies, changed in place) new ids at any depth: the objects,
 * their captions and their motion paths. Each old id's new one goes in `ids`,
 * so triggers copied with them can follow.
 */
export function renewObjectIds(
  objects: SceneObject[],
  ids: Map<string, string> = new Map(),
): Map<string, string> {
  const fresh = (old: string, prefix: IdPrefix) => {
    const id = createId(prefix);
    ids.set(old, id);
    return id;
  };
  forEachObject(objects, (object) => {
    object.id = fresh(object.id, 'obj');
    if (object.type === 'audio' || object.type === 'video') {
      for (const cue of object.props.captions) cue.id = fresh(cue.id, 'caption');
    }
    for (const motion of object.animations.motionPaths) motion.id = fresh(motion.id, 'path');
    if (object.type === 'panorama') {
      for (const spot of object.props.spots) spot.id = fresh(spot.id, 'spot');
    }
  });
  return ids;
}

/**
 * Copies of `slides` with new ids everywhere: slides, layers, objects (with
 * their captions and motion paths), cue points and triggers. Triggers inside the copies that pointed at something
 * that was copied now point at its copy (a duplicated slide's button targets
 * the duplicated slide's own objects); references to anything else are kept.
 * The input is not changed.
 */
export function cloneSlides(slides: readonly Slide[], titleSuffix = ''): Slide[] {
  const ids = new Map<string, string>();
  const fresh = (old: string, prefix: IdPrefix) => {
    const id = createId(prefix);
    ids.set(old, id);
    return id;
  };
  const copies = JSON.parse(JSON.stringify(slides)) as Slide[];
  for (const slide of copies) {
    slide.id = fresh(slide.id, 'slide');
    if (titleSuffix) slide.title += titleSuffix;
    for (const { layer } of slideLayers(slide)) {
      layer.id = fresh(layer.id, 'layer');
      for (const cue of layer.timeline.cuePoints) cue.id = fresh(cue.id, 'cue');
      renewObjectIds(layer.objects, ids);
    }
  }
  return copies.map((copy) => {
    // Everything inside a copy that named something copied names the copy: its
    // triggers, its question, a result's Passed and Failed layers, the Tab order.
    const slide = remap(copy, ids) as Slide;
    // The question names the copies of its objects, with new choice ids.
    if (slide.question) slide.question = renewPartIds(slide.question);
    slide.triggers = slide.triggers.map((trigger) => ({ ...trigger, id: createId('trigger') }));
    return slide;
  });
}

export function cloneSlide(slide: Slide, titleSuffix = ' copy'): Slide {
  return cloneSlides([slide], titleSuffix)[0]!;
}

export function cloneScene(scene: Scene, titleSuffix = ' copy'): Scene {
  return {
    id: createId('scene'),
    title: scene.title + titleSuffix,
    slides: cloneSlides(scene.slides),
  };
}

/**
 * A copy of one of a slide's overlay layers, with new ids for the layer, its
 * objects and cue points, and copies of the triggers that belong to it or its
 * objects (pointing at the copies). The slide is not changed.
 */
export function cloneLayer(
  slide: Slide,
  layerId: string,
  name?: string,
): { layer: Layer; triggers: Trigger[] } {
  const source = slide.layers.find((layer) => layer.id === layerId);
  if (!source) throw new Error(`No overlay layer "${layerId}" on slide "${slide.id}"`);
  const ids = new Map<string, string>();
  const fresh = (old: string, prefix: IdPrefix) => {
    const id = createId(prefix);
    ids.set(old, id);
    return id;
  };
  const layer = JSON.parse(JSON.stringify(source)) as Layer;
  layer.id = fresh(layer.id, 'layer');
  layer.name = name ?? `${source.name} copy`;
  for (const cue of layer.timeline.cuePoints) cue.id = fresh(cue.id, 'cue');
  renewObjectIds(layer.objects, ids);
  const triggers = slide.triggers
    .filter((trigger) => ids.has(trigger.owner.id))
    .map((trigger) => ({ ...(remap(trigger, ids) as Trigger), id: createId('trigger') }));
  return { layer, triggers };
}

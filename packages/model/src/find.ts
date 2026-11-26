/**
 * Lookups by id. These work on a Project or on an Immer draft of one (the
 * shapes are the same), and return the containing array and index so callers
 * can splice.
 */
import type { Layer, Project, Scene, SceneObject, Slide, Trigger } from './schema';
import { questionPartIds } from './questions';
import { everySlide, forEachObject, slideLayers } from './traverse';

export interface SceneLocation {
  scene: Scene;
  index: number;
  /** A question bank (P7.6), shaped like a scene; `index` is then in `project.banks`. */
  bank?: true;
}

export interface SlideLocation {
  slide: Slide;
  scene: Scene;
  /** Position within `scene.slides`. */
  index: number;
}

export interface LayerLocation {
  layer: Layer;
  /** The slide the layer belongs to, or null for a master or layout layer. */
  slide: Slide | null;
}

export interface ObjectLocation {
  object: SceneObject;
  /** The array holding the object: a layer's `objects` or a group's `children`. */
  siblings: SceneObject[];
  index: number;
  layer: Layer;
  slide: Slide | null;
}

export function findScene(project: Project, sceneId: string): SceneLocation | undefined {
  const index = project.scenes.findIndex((scene) => scene.id === sceneId);
  const scene = project.scenes[index];
  if (scene) return { scene, index };
  const bankIndex = project.banks.findIndex((bank) => bank.id === sceneId);
  const bank = project.banks[bankIndex];
  return bank ? { scene: bank, index: bankIndex, bank: true } : undefined;
}

/** A slide in a scene, or in a question bank (P7.6). */
export function findSlide(project: Project, slideId: string): SlideLocation | undefined {
  for (const scene of [...project.scenes, ...project.banks]) {
    const index = scene.slides.findIndex((slide) => slide.id === slideId);
    const slide = scene.slides[index];
    if (slide) return { slide, scene, index };
  }
  return undefined;
}

/** Every layer in the project: slide layers first, then master and layout layers. */
export function allLayers(project: Project): LayerLocation[] {
  const found: LayerLocation[] = [];
  for (const scene of [...project.scenes, ...project.banks]) {
    for (const slide of scene.slides) {
      for (const { layer } of slideLayers(slide)) found.push({ layer, slide });
    }
  }
  for (const master of project.masters) {
    found.push({ layer: master.layer, slide: null });
    for (const layout of master.layouts) found.push({ layer: layout.layer, slide: null });
  }
  return found;
}

export function findLayer(project: Project, layerId: string): LayerLocation | undefined {
  return allLayers(project).find(({ layer }) => layer.id === layerId);
}

function findInList(
  siblings: SceneObject[],
  objectId: string,
): Pick<ObjectLocation, 'object' | 'siblings' | 'index'> | undefined {
  for (let index = 0; index < siblings.length; index++) {
    const object = siblings[index]!;
    if (object.id === objectId) return { object, siblings, index };
    if (object.type === 'group') {
      const nested = findInList(object.children, objectId);
      if (nested) return nested;
    }
  }
  return undefined;
}

export function findObject(project: Project, objectId: string): ObjectLocation | undefined {
  for (const { layer, slide } of allLayers(project)) {
    const found = findInList(layer.objects, objectId);
    if (found) return { ...found, layer, slide };
  }
  return undefined;
}

// ----------------------------------------------------------------- id sets

/**
 * Ids of an object and everything inside it: group children, captions and
 * motion paths (not state ids, which are local to their object).
 */
/**
 * The assets an object uses itself (not its group's children): a picture's,
 * sound's or 360° image's file, a video and its poster, a web folder's files.
 */
export function assetsOfObject(object: SceneObject): string[] {
  switch (object.type) {
    case 'image':
    case 'audio':
    case 'panorama':
      return [object.props.asset];
    case 'video':
      return object.props.poster === null
        ? [object.props.asset]
        : [object.props.asset, object.props.poster];
    case 'web':
      return object.props.source.kind === 'folder' ? Object.values(object.props.source.files) : [];
    case 'dial':
      return object.props.look?.face ? [object.props.look.face.asset] : [];
    default:
      return [];
  }
}

/** Take objects no longer on the slide out of its Tab order (P10.1). */
export function pruneFocusOrder(slide: Slide): void {
  const order = slide.properties.focusOrder;
  if (!order) return;
  const here = new Set<string>();
  for (const layer of [slide.baseLayer, ...slide.layers]) {
    forEachObject(layer.objects, (object) => here.add(object.id));
  }
  const kept = order.filter((id) => here.has(id));
  if (kept.length !== order.length) slide.properties.focusOrder = kept;
}

export function idsInObject(object: SceneObject): string[] {
  const ids: string[] = [];
  forEachObject([object], (each) => {
    ids.push(each.id);
    if (each.type === 'audio' || each.type === 'video') {
      for (const cue of each.props.captions) ids.push(cue.id);
    }
    for (const motion of each.animations.motionPaths) ids.push(motion.id);
    if (each.type === 'panorama') for (const spot of each.props.spots) ids.push(spot.id);
  });
  return ids;
}

export function idsInLayer(layer: Layer): string[] {
  return [
    layer.id,
    ...layer.timeline.cuePoints.map((cue) => cue.id),
    ...layer.objects.flatMap(idsInObject),
  ];
}

export function idsInSlide(slide: Slide): string[] {
  return [
    slide.id,
    ...slideLayers(slide).flatMap(({ layer }) => idsInLayer(layer)),
    ...slide.triggers.map((trigger) => trigger.id),
    ...(slide.question ? questionPartIds(slide.question) : []),
  ];
}

export function idsInScene(scene: Scene): string[] {
  return [scene.id, ...scene.slides.flatMap(idsInSlide)];
}

/** Every id in use anywhere in the project. */
export function idsInProject(project: Project): Set<string> {
  return new Set([
    project.id,
    ...project.scenes.flatMap(idsInScene),
    ...project.banks.flatMap(idsInScene),
    ...project.variables.map((variable) => variable.id),
    ...project.masters.flatMap((master) => [
      master.id,
      ...idsInLayer(master.layer),
      ...master.layouts.flatMap((layout) => [layout.id, ...idsInLayer(layout.layer)]),
    ]),
  ]);
}

// ------------------------------------------------------- trigger references

/** Every id a trigger depends on: its owner and everything its event, actions and conditions name. */
export function triggerReferences(trigger: Trigger): Set<string> {
  const ids = new Set<string>([trigger.owner.id]);

  const { event } = trigger;
  if ('object' in event) ids.add(event.object);
  if ('target' in event) ids.add(event.target);
  if ('other' in event) ids.add(event.other);
  if ('spot' in event) ids.add(event.spot);
  if ('layer' in event) ids.add(event.layer);
  if ('cuePoint' in event) ids.add(event.cuePoint);
  if ('variable' in event) ids.add(event.variable);
  if (event.type === 'playerTab') ids.add(event.tab);
  if (event.type === 'animationCompletes' && event.animation.kind === 'path') {
    ids.add(event.animation.path);
  }

  for (const action of [trigger.action, trigger.otherwise]) {
    if (!action) continue;
    if ('object' in action) ids.add(action.object);
    if ('layer' in action) ids.add(action.layer);
    if ('variable' in action) ids.add(action.variable);
    if (action.type === 'moveAlongPath') ids.add(action.path);
    if (action.type === 'setVariable' && action.operand.kind === 'variable') {
      ids.add(action.operand.variable);
    }
    if (action.type === 'jumpToSlide' && action.target.kind === 'slide') {
      ids.add(action.target.slide);
    }
    if (action.type === 'openLightbox') ids.add(action.slide);
  }

  for (const condition of trigger.conditions?.items ?? []) {
    if (condition.subject === 'variable') {
      ids.add(condition.variable);
      if (condition.value.kind === 'variable') ids.add(condition.value.variable);
    } else {
      ids.add(condition.object);
    }
  }
  return ids;
}

/** Whether a trigger or a custom tab opens the slide as a lightbox (P8.4). */
export function opensAsLightbox(project: Project, slideId: string): boolean {
  if (project.player.tabs.custom.some((tab) => tab.lightbox?.slide === slideId)) return true;
  return everySlide(project).some(({ slide }) =>
    slide.triggers.some((trigger) =>
      [trigger.action, trigger.otherwise].some(
        (action) => action?.type === 'openLightbox' && action.slide === slideId,
      ),
    ),
  );
}

/** True if the trigger depends on any of the given ids and so cannot outlive them. */
export function triggerReferencesAny(trigger: Trigger, ids: ReadonlySet<string>): boolean {
  for (const id of triggerReferences(trigger)) if (ids.has(id)) return true;
  return false;
}

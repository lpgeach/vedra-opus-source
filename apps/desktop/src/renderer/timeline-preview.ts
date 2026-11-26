import { createEngine } from '@vedraopus/engine';
import type { ObjectView } from '@vedraopus/engine';
import type { Project } from '@vedraopus/model';

/** What the engine shows on a layer at a time: which objects, and how each is animated. */
export interface PreviewAt {
  visible: Set<string>;
  /** Each object's entrance or exit time and motion offset, as the engine reports them. */
  motion: Map<string, Pick<ObjectView, 'effect' | 'offset'>>;
}

/**
 * What the engine shows on one of a slide's layers with that layer's
 * playhead at `seconds` (the base layer unless `layerId` names an overlay).
 * This asks the real engine, so the stage while scrubbing matches preview and
 * published courses by construction. Null when the slide or layer is not in
 * the project.
 */
export function previewAt(
  project: Project,
  slideId: string,
  seconds: number,
  layerId?: string,
): PreviewAt | null {
  const engine = createEngine(project);
  try {
    engine.jumpToSlide(slideId);
    if (layerId) engine.showLayer(layerId);
  } catch {
    return null;
  }
  const wanted = (layers: ReturnType<typeof engine.getView>['layers']) =>
    layerId ? layers.find((layer) => layer.id === layerId) : layers[0];
  const layer = wanted(engine.getView().layers);
  if (!layer) return null;
  // Seeking forward counts as time going by for motion paths, so they are where they would be.
  engine.seek(layer.id, seconds);
  const after = wanted(engine.getView().layers)!;
  return {
    visible: new Set(after.objects.filter((object) => object.visible).map((object) => object.id)),
    motion: new Map(
      after.objects.map((object) => [
        object.id,
        {
          ...(object.effect ? { effect: object.effect } : {}),
          ...(object.offset ? { offset: object.offset } : {}),
        },
      ]),
    ),
  };
}

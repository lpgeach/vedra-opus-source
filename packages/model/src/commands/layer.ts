import { withoutLayer, withoutObjects } from '../questions';
import { allLayers, idsInLayer, pruneFocusOrder, triggerReferencesAny } from '../find';
import { cuePointSchema, layerSchema, triggerSchema } from '../schema';
import type { Project } from '../schema';
import { CommandError } from './types';
import type { CommandHandlers } from './types';
import { assertIdsAreNew, assertValid, insertionIndex, moveWithin, requireSlide } from './util';

function requireLayer(project: Project, layerId: string) {
  const found = allLayers(project).find(({ layer }) => layer.id === layerId);
  if (!found) throw new CommandError(`No layer with id "${layerId}"`);
  return found;
}

function requireCuePoint(project: Project, cuePointId: string) {
  for (const location of allLayers(project)) {
    const index = location.layer.timeline.cuePoints.findIndex((cue) => cue.id === cuePointId);
    if (index >= 0) return { ...location, index, cue: location.layer.timeline.cuePoints[index]! };
  }
  throw new CommandError(`No cue point with id "${cuePointId}"`);
}

function assertTime(time: number, duration: number): void {
  if (!Number.isFinite(time) || time < 0 || time > duration) {
    throw new CommandError(`A cue point must lie within the timeline (0–${duration} s)`);
  }
}

/** An overlay layer and the slide it is on. The base layer is not one of these. */
function requireOverlay(project: Project, layerId: string) {
  const { layer, slide } = requireLayer(project, layerId);
  const index = slide ? slide.layers.indexOf(layer) : -1;
  if (!slide || index < 0) throw new CommandError("Only a slide's overlay layers can do this");
  return { layer, slide, index };
}

export const layerCommands: Pick<
  CommandHandlers,
  | 'layer.setDuration'
  | 'cuePoint.add'
  | 'cuePoint.update'
  | 'cuePoint.remove'
  | 'layer.add'
  | 'layer.remove'
  | 'layer.rename'
  | 'layer.move'
  | 'layer.setProperties'
> = {
  'layer.add': (draft, { slideId, layer, index, triggers = [] }) => {
    const { slide } = requireSlide(draft, slideId);
    assertValid(layerSchema, layer, 'layer');
    for (const trigger of triggers) assertValid(triggerSchema, trigger, 'trigger');
    assertIdsAreNew(draft, [...idsInLayer(layer), ...triggers.map((trigger) => trigger.id)]);
    slide.layers.splice(insertionIndex(index, slide.layers.length), 0, layer);
    slide.triggers.push(...triggers);
  },

  'layer.remove': (draft, { layerId }) => {
    const { layer, slide, index } = requireOverlay(draft, layerId);
    const gone = new Set(idsInLayer(layer));
    slide.layers.splice(index, 1);
    // A question loses the feedback layer, and anything of its on it (P7.5).
    if (slide.question)
      slide.question = withoutLayer(withoutObjects(slide.question, gone), layerId);
    // A result slide loses its Passed or Failed layer (P7.7).
    if (slide.result) {
      const { passed, failed } = slide.result.layers;
      slide.result.layers = {
        passed: passed === layerId ? null : passed,
        failed: failed === layerId ? null : failed,
      };
    }
    // Triggers it owned, and triggers elsewhere that show it or use its objects, go with it.
    slide.triggers = slide.triggers.filter(
      (trigger) => !gone.has(trigger.owner.id) && !triggerReferencesAny(trigger, gone),
    );
    // Its objects leave the Tab order (P10.1).
    pruneFocusOrder(slide);
  },

  'layer.rename': (draft, { layerId, name }) => {
    if (name.trim().length === 0) throw new CommandError('A layer name cannot be empty');
    requireLayer(draft, layerId).layer.name = name;
  },

  'layer.move': (draft, { layerId, index }) => {
    const { slide, index: from } = requireOverlay(draft, layerId);
    moveWithin(slide.layers, from, index);
  },

  'layer.setProperties': (draft, { layerId, properties }) => {
    const { layer } = requireOverlay(draft, layerId);
    Object.assign(layer.properties, properties);
    assertValid(layerSchema, layer, `layer "${layer.name}"`);
  },

  'layer.setDuration': (draft, { layerId, duration }) => {
    const { layer } = requireLayer(draft, layerId);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new CommandError('A timeline must be longer than zero seconds');
    }
    layer.timeline.duration = duration;
    // Cue points cannot sit beyond the end; they move back to it.
    for (const cue of layer.timeline.cuePoints) cue.time = Math.min(cue.time, duration);
  },

  'cuePoint.add': (draft, { layerId, cuePoint }) => {
    const { layer } = requireLayer(draft, layerId);
    assertValid(cuePointSchema, cuePoint, 'cue point');
    assertIdsAreNew(draft, [cuePoint.id]);
    assertTime(cuePoint.time, layer.timeline.duration);
    layer.timeline.cuePoints.push(cuePoint);
  },

  'cuePoint.update': (draft, { cuePointId, changes }) => {
    const { cue, layer } = requireCuePoint(draft, cuePointId);
    if (changes.name !== undefined) {
      if (changes.name.length === 0) throw new CommandError('A cue point name cannot be empty');
      cue.name = changes.name;
    }
    if (changes.time !== undefined) {
      assertTime(changes.time, layer.timeline.duration);
      cue.time = changes.time;
    }
  },

  'cuePoint.remove': (draft, { cuePointId }) => {
    const { layer, slide, index } = requireCuePoint(draft, cuePointId);
    layer.timeline.cuePoints.splice(index, 1);
    if (slide) {
      const gone = new Set([cuePointId]);
      slide.triggers = slide.triggers.filter((trigger) => !triggerReferencesAny(trigger, gone));
    }
  },
};

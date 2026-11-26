import {
  createEmptyProject,
  createId,
  createPanoramaObject,
  createPanoramaSpot,
  createScene,
  createSlide,
} from '@vedraopus/model';
import type { TriggerEvent } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { createEngine } from './index';
import type { EngineEvent, SessionState } from './index';

/** 360° images (docs/briefs/P9.10-panoramas.md). */

const PICTURE = 'a'.repeat(64);

/** A slide (and a second) with a 360° image of two spots; each trigger adds 1 to Hits. */
function setup(events: (spots: { image: string; door: string; window: string }) => TriggerEvent[]) {
  const project = createEmptyProject();
  project.assets[PICTURE] = {
    kind: 'image',
    fileName: 'room.jpg',
    ext: 'jpg',
    mimeType: 'image/jpeg',
    byteLength: 1,
  };
  project.variables.push({ id: createId('var'), name: 'Hits', type: 'number', default: 0 });
  const slide = createSlide('One');
  slide.properties.onRevisit = 'resume';
  const image = createPanoramaObject(PICTURE);
  const door = createPanoramaSpot('Door', 90, 0);
  const window = createPanoramaSpot('Window', -90, 0, 'hotspot');
  image.props.spots = [door, window];
  slide.baseLayer.objects.push(image);
  for (const event of events({ image: image.id, door: door.id, window: window.id })) {
    slide.triggers.push({
      id: createId('trigger'),
      owner: { kind: 'slide', id: slide.id },
      event,
      action: {
        type: 'setVariable',
        variable: project.variables[0]!.id,
        operator: 'add',
        operand: { kind: 'literal', value: 1 },
      },
      conditions: null,
      otherwise: null,
      enabled: true,
    });
  }
  project.scenes = [{ ...createScene(), slides: [slide, createSlide('Two')] }];
  const make = (restore?: SessionState) => {
    const engine = createEngine(project, restore ? { restore } : {});
    const seen: EngineEvent[] = [];
    engine.on((event) => seen.push(event));
    engine.tick(0);
    const visited = () =>
      engine
        .getView()
        .layers.flatMap((layer) => layer.objects)
        .find((each) => each.id === image.id)?.visitedSpots;
    return { engine, seen, visited, hits: () => engine.getVariable('Hits') };
  };
  return { image, door, window, make };
}

describe('360° images in the engine', () => {
  it('a spot opened runs its trigger, not the other spot’s, and is marked visited', () => {
    const { image, door, window, make } = setup((ids) => [
      { type: 'spotClicked', object: ids.image, spot: ids.door },
    ]);
    const { engine, visited, hits, seen } = make();
    expect(visited()).toEqual([]);
    expect(engine.openSpot(image.id, window.id)).toBe(true);
    expect(hits()).toBe(0);
    expect(engine.openSpot(image.id, door.id)).toBe(true);
    expect(hits()).toBe(1);
    expect(visited()).toEqual([window.id, door.id]);
    expect(seen.filter((event) => event.type === 'spotClicked')).toHaveLength(2);
    // Opened again: its trigger runs again.
    engine.openSpot(image.id, door.id);
    expect(hits()).toBe(2);
    // No such spot, or not a 360° image.
    expect(engine.openSpot(image.id, 'spot_missing')).toBe(false);
    expect(engine.openSpot('obj_missing', door.id)).toBe(false);
  });

  it('“all visited” fires once, when the last unvisited spot is opened', () => {
    const { image, door, window, make } = setup((ids) => [
      { type: 'panoramaVisited', object: ids.image },
    ]);
    const { engine, hits } = make();
    engine.openSpot(image.id, door.id);
    engine.openSpot(image.id, door.id);
    expect(hits()).toBe(0);
    engine.openSpot(image.id, window.id);
    expect(hits()).toBe(1);
    engine.openSpot(image.id, window.id);
    engine.openSpot(image.id, door.id);
    expect(hits()).toBe(1);
  });

  it('visited spots are kept with the slide and resumed, and do not fire again', () => {
    const { image, door, window, make } = setup((ids) => [
      { type: 'panoramaVisited', object: ids.image },
    ]);
    const first = make();
    first.engine.openSpot(image.id, door.id);
    first.engine.next();
    first.engine.previous();
    expect(first.visited()).toEqual([door.id]);
    const again = make(first.engine.getState());
    expect(again.visited()).toEqual([door.id]);
    again.engine.openSpot(image.id, window.id);
    expect(again.hits()).toBe(1);
  });

  it('a hidden 360° image takes no clicks', () => {
    const { image, door, make } = setup(() => []);
    image.states.push({ id: 'hidden', name: 'Hidden', overrides: {} });
    const { engine } = make();
    engine.setObjectState(image.id, 'hidden');
    expect(engine.openSpot(image.id, door.id)).toBe(false);
  });
});

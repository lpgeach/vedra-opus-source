import {
  createEmptyProject,
  createId,
  createMotionPath,
  createScene,
  createShapeObject,
  createSlide,
} from '@vedraopus/model';
import type { MotionPath, SceneObject, TriggerEvent } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { createEngine } from './index';
import type { EngineEvent, SessionState } from './index';

/** Dragging objects, and intersections (docs/briefs/P9.7-drag-intersections.md). */

const box = (x: number, y = 0, name = 'Box') =>
  createShapeObject({ kind: 'rect' }, { x, y, width: 100, height: 100 }, name);

/**
 * A 10 s slide (and a second one) with a draggable Card at 0,0 (middle 50,50),
 * a Bin at 300,0 (middle 350,50) with a Drag Over state, and a Wall at 600,0.
 * Each trigger listed sets Hits to Hits + 1, so how often it ran shows.
 */
function setup(events: TriggerEvent[], change?: (objects: Record<string, SceneObject>) => void) {
  const project = createEmptyProject();
  project.variables.push({ id: createId('var'), name: 'Hits', type: 'number', default: 0 });
  const slide = createSlide('One');
  slide.properties.onRevisit = 'resume';
  slide.baseLayer.timeline.duration = 10;
  const card = box(0, 0, 'Card');
  card.drag = { returnToStart: false };
  const bin = box(300, 0, 'Bin');
  bin.states.push({ id: 'dragOver', name: 'Drag Over', overrides: {} });
  for (const each of [card, bin]) each.states.push({ id: 'hidden', name: 'Hidden', overrides: {} });
  const wall = box(600, 0, 'Wall');
  slide.baseLayer.objects.push(card, bin, wall);
  change?.({ card, bin, wall });
  const ids: Record<string, string> = { card: card.id, bin: bin.id, wall: wall.id };
  for (const event of events) {
    const named = Object.fromEntries(
      Object.entries(event).map(([key, value]) => [
        key,
        key === 'type' ? value : (ids[value] ?? value),
      ]),
    ) as TriggerEvent;
    slide.triggers.push({
      id: createId('trigger'),
      owner: { kind: 'slide', id: slide.id },
      event: named,
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
    let now = 0;
    engine.tick(now);
    const at = (seconds: number) => {
      now += seconds * 1000;
      engine.tick(now);
    };
    const view = (id: string) =>
      engine
        .getView()
        .layers.flatMap((layer) => layer.objects)
        .find((each) => each.id === id)!;
    const hits = () => engine.getVariable('Hits');
    const kinds = () =>
      seen
        .filter((event) =>
          ['draggedOver', 'droppedOn', 'objectsIntersect', 'objectsSeparate'].includes(event.type),
        )
        .map((event) => event.type);
    return { engine, seen, at, view, hits, kinds };
  };
  return { project, slide, card, bin, wall, make };
}

describe('dragging an object outside a question', () => {
  it('is offered to the player only for objects made draggable', () => {
    const { card, bin, make } = setup([]);
    const { view } = make();
    expect(view(card.id).draggable).toBe(true);
    expect(view(bin.id).draggable).toBeUndefined();
  });

  it('stays where it is dropped, and is remembered when the slide resumes', () => {
    const { card, make } = setup([]);
    const { engine, view } = make();
    // Its middle let go at 200, 150: it moved 150 across and 100 down.
    expect(engine.drop(card.id, 200, 150)).toBe(true);
    expect(view(card.id).offset).toEqual({ x: 150, y: 100 });
    // Dragged again from there.
    engine.drop(card.id, 250, 150);
    expect(view(card.id).offset).toEqual({ x: 200, y: 100 });
    engine.next();
    engine.previous();
    expect(view(card.id).offset).toEqual({ x: 200, y: 100 });
    const again = make(engine.getState());
    expect(again.view(card.id).offset).toEqual({ x: 200, y: 100 });
  });

  it('goes back after it is dropped when it returns to start, and its "dropped on" still runs', () => {
    const { card, make } = setup([{ type: 'droppedOn', object: 'card', target: 'bin' }], (o) => {
      o.card!.drag = { returnToStart: true };
    });
    const { engine, view, hits } = make();
    engine.carry(card.id, 350, 50);
    engine.drop(card.id, 350, 50);
    expect(view(card.id).offset).toBeUndefined();
    expect(hits()).toBe(1);
  });

  it('fires "dragged over" and "dropped on" for the target under its middle only, showing Drag Over', () => {
    const { card, bin, make } = setup([
      { type: 'draggedOver', object: 'card', target: 'bin' },
      { type: 'droppedOn', object: 'card', target: 'bin' },
      { type: 'droppedOn', object: 'card', target: 'wall' },
    ]);
    const { engine, view, hits, kinds } = make();
    // Over nothing, then over the Bin's edge: its middle is inside the Bin's box.
    expect(engine.carry(card.id, 200, 50)).toBe(false);
    expect(engine.carry(card.id, 301, 50)).toBe(true);
    expect(view(bin.id).state).toBe('dragOver');
    expect(hits()).toBe(1);
    // Still over it: no new event.
    engine.carry(card.id, 340, 60);
    expect(hits()).toBe(1);
    // Off it and back on: "dragged over" again.
    engine.carry(card.id, 450, 50);
    expect(view(bin.id).state).toBe('normal');
    engine.carry(card.id, 350, 50);
    expect(hits()).toBe(2);
    engine.drop(card.id, 350, 50);
    expect(view(bin.id).state).toBe('normal');
    // The Bin's "dropped on" ran, the Wall's did not.
    expect(hits()).toBe(3);
    expect(kinds()).toEqual(['draggedOver', 'draggedOver', 'droppedOn']);
    // Dropped on empty stage: nothing.
    engine.drop(card.id, 200, 300);
    expect(hits()).toBe(3);
  });

  it('counts only the targets its triggers name, so an object above one does not catch the drop', () => {
    // A Cover over the Bin, drawn above it, that no trigger names (Luke, session 76).
    const { card, bin, slide, make } = setup([
      { type: 'droppedOn', object: 'card', target: 'bin' },
    ]);
    const cover = box(300, 0, 'Cover');
    cover.states.push({ id: 'dragOver', name: 'Drag Over', overrides: {} });
    slide.baseLayer.objects.push(cover);
    const { engine, view, hits } = make();
    engine.carry(card.id, 350, 50);
    expect(view(bin.id).state).toBe('dragOver');
    expect(view(cover.id).state).toBe('normal');
    engine.drop(card.id, 350, 50);
    expect(hits()).toBe(1);
  });

  it('shows no Drag Over and fires nothing when no trigger names a target', () => {
    const { card, bin, make } = setup([]);
    const { engine, view, kinds } = make();
    expect(engine.carry(card.id, 350, 50)).toBe(false);
    expect(view(bin.id).state).toBe('normal');
    engine.drop(card.id, 350, 50);
    expect(kinds()).toEqual([]);
  });

  it('offers the keyboard the shown targets its triggers name, once each, in trigger order', () => {
    // docs/briefs/P10.1-accessibility.md, part B: the arrow keys go from target to target.
    const { card, bin, wall, make } = setup([
      { type: 'droppedOn', object: 'card', target: 'wall' },
      { type: 'draggedOver', object: 'card', target: 'bin' },
      { type: 'droppedOn', object: 'card', target: 'bin' },
    ]);
    const { engine } = make();
    expect(engine.dropTargets(card.id)).toEqual([wall.id, bin.id]);
    // A hidden target is not offered; an object that is not draggable has none.
    engine.setObjectState(bin.id, 'hidden');
    expect(engine.dropTargets(card.id)).toEqual([wall.id]);
    expect(engine.dropTargets(wall.id)).toEqual([]);
    expect(setup([]).make().engine.dropTargets(card.id)).toEqual([]);
  });

  it('cannot be dragged while hidden, or when its layer is not shown', () => {
    const { card, make } = setup([]);
    const { engine, view } = make();
    engine.setObjectState(card.id, 'hidden');
    expect(view(card.id).draggable).toBeUndefined();
    expect(engine.drop(card.id, 200, 150)).toBe(false);
    expect(view(card.id).offset).toBeUndefined();
  });
});

describe('intersections', () => {
  const line = (x: number, duration = 2): MotionPath => ({
    ...createMotionPath('line', 'Line', [
      { x: 0, y: 0 },
      { x, y: 0 },
    ]),
    duration,
    easing: 'linear',
    relativeStart: false,
  });

  it('fire when two boxes begin and stop overlapping while one is carried, either way round', () => {
    const { card, make } = setup([
      { type: 'intersects', object: 'card', other: 'bin' },
      { type: 'stopsIntersecting', object: 'bin', other: 'card' },
    ]);
    const { engine, hits, kinds } = make();
    // The Card's box is 0..100 across; its middle at 240 puts its right edge at 290.
    engine.carry(card.id, 240, 50);
    expect(hits()).toBe(0);
    engine.carry(card.id, 260, 50); // right edge 310: overlapping
    expect(hits()).toBe(1);
    engine.carry(card.id, 280, 50); // still overlapping
    expect(hits()).toBe(1);
    // Let go away from the Bin: it stops.
    engine.drop(card.id, 100, 300);
    expect(hits()).toBe(2);
    expect(kinds()).toEqual(['objectsIntersect', 'objectsSeparate']);
  });

  it('do not fire for objects that already overlap when the slide starts', () => {
    const { card, make } = setup([{ type: 'intersects', object: 'card', other: 'bin' }], (o) => {
      o.card!.frame.x = 250;
    });
    const { engine, at, hits } = make();
    at(1);
    expect(hits()).toBe(0);
    // Taken off and put back: now it "came to overlap".
    engine.drop(card.id, 100, 300);
    engine.drop(card.id, 340, 50);
    expect(hits()).toBe(1);
  });

  it('fire when a motion path moves one object into another', () => {
    const path = line(400);
    const { slide, make } = setup([{ type: 'intersects', object: 'wall', other: 'bin' }], (o) => {
      o.bin!.animations.motionPaths = [path];
    });
    slide.triggers.push({
      id: createId('trigger'),
      owner: { kind: 'slide', id: slide.id },
      event: { type: 'timelineStart', layer: slide.baseLayer.id },
      action: { type: 'moveAlongPath', object: slide.baseLayer.objects[1]!.id, path: path.id },
      conditions: null,
      otherwise: null,
      enabled: true,
    });
    const { at, hits } = make();
    // The Bin moves 200 a second from 300: its right edge passes 600 after 1 s.
    at(0.9);
    expect(hits()).toBe(0);
    at(0.2);
    expect(hits()).toBe(1);
    at(3);
    expect(hits()).toBe(1);
  });

  it('count only objects that are on stage and shown', () => {
    const { card, bin, make } = setup([{ type: 'intersects', object: 'card', other: 'bin' }]);
    const { engine, hits } = make();
    engine.setObjectState(bin.id, 'hidden');
    engine.drop(card.id, 340, 50);
    expect(hits()).toBe(0);
    // Shown again where it overlaps: they came to overlap.
    engine.setObjectState(bin.id, 'normal');
    engine.tick(1);
    expect(hits()).toBe(1);
  });
});

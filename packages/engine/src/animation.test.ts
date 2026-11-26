import {
  createEffect,
  createEmptyProject,
  createId,
  createLayer,
  createMotionPath,
  createScene,
  createShapeObject,
  createSlide,
  createTextObject,
} from '@vedraopus/model';
import type { MotionPath, SceneObject, Trigger, TriggerEvent } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { ease, paragraphCount, pathPolyline, pointAlong } from './animation';
import { createEngine } from './index';
import type { EngineEvent } from './types';

const trigger = (event: TriggerEvent, object: SceneObject, path: MotionPath): Trigger => ({
  id: createId('trigger'),
  owner: { kind: 'object', id: object.id },
  event,
  action: { type: 'moveAlongPath', object: object.id, path: path.id },
  conditions: null,
  otherwise: null,
  enabled: true,
});

/** Slides of 10 s with `objects` on the first; `at(s)` moves the clock on. */
function setup(objects: SceneObject[], extraSlides = 0) {
  const project = createEmptyProject('Animations');
  const slides = [createSlide('One'), ...Array.from({ length: extraSlides }, () => createSlide())];
  for (const slide of slides) slide.baseLayer.timeline.duration = 10;
  slides[0]!.baseLayer.objects.push(...objects);
  project.scenes = [{ ...createScene(), slides }];
  const slide = slides[0]!;
  const make = () => {
    const engine = createEngine(project);
    const events: EngineEvent[] = [];
    engine.on((event) => events.push(event));
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
        .find((each) => each.id === id);
    return { engine, events, at, view };
  };
  return { project, slide, slides, make };
}

describe('entrance and exit timing', () => {
  it('plays the entrance from the object’s start, and the exit to finish at its end', () => {
    const box = createShapeObject({ kind: 'rect' });
    box.timing = { start: 1, duration: 'untilEnd' };
    box.animations.entrance = createEffect('fade', 0.5);
    box.animations.exit = { ...createEffect('fly', 1), direction: 'right' };
    const { make, slide } = setup([box]);
    const { engine, at, view } = make();
    at(0.5);
    // Not on stage before 1 s.
    expect(view(box.id)!.effect).toBeUndefined();
    at(0.7); // 1.2 s: 0.2 s into the 0.5 s fade
    expect(view(box.id)!.effect!.phase).toBe('entrance');
    expect(view(box.id)!.effect!.time).toBeCloseTo(0.2);
    at(0.4); // 1.6 s: the fade is over
    expect(view(box.id)!.effect).toBeUndefined();
    // It lasts until the end (10 s), so its 1 s exit runs from 9 s.
    at(7.65); // 9.25 s
    expect(view(box.id)!.effect!.phase).toBe('exit');
    expect(view(box.id)!.effect!.time).toBeCloseTo(0.25);
    expect(engine.pointer('click', box.id)).toBe(true);
    at(1); // the timeline's end: the exit has played out
    expect(view(box.id)!.effect).toEqual({ phase: 'exit', time: 1 });
    // Gone, though still on stage: it takes no input.
    expect(view(box.id)!.onStage).toBe(true);
    expect(engine.pointer('click', box.id)).toBe(false);
    expect(slide.baseLayer.timeline.duration).toBe(10);
  });

  it('lets the exit win where the two overlap, and follows the playhead when paused or seeked', () => {
    const box = createShapeObject({ kind: 'rect' });
    box.timing = { start: 0, duration: 1 };
    box.animations.entrance = createEffect('grow', 0.8);
    box.animations.exit = createEffect('fade', 0.5);
    const { make, slide } = setup([box]);
    const { engine, at, view } = make();
    at(0.4);
    expect(view(box.id)!.effect!.phase).toBe('entrance');
    expect(view(box.id)!.effect!.time).toBeCloseTo(0.4);
    // 0.6 s: the exit started at 1 − 0.5 = 0.5 s, so it is 0.1 s in.
    at(0.2);
    expect(view(box.id)!.effect!.phase).toBe('exit');
    expect(view(box.id)!.effect!.time).toBeCloseTo(0.1);
    engine.setPaused(slide.baseLayer.id, true);
    at(5);
    expect(view(box.id)!.effect!.time).toBeCloseTo(0.1);
    engine.seek(slide.baseLayer.id, 0.25);
    expect(view(box.id)!.effect).toEqual({ phase: 'entrance', time: 0.25 });
  });

  it('by paragraph, takes the duration once for each paragraph and list item', () => {
    const text = createTextObject('First\nSecond\nThird');
    text.animations.entrance = { ...createEffect('fade', 0.5), byParagraph: true };
    expect(paragraphCount(text)).toBe(3);
    const listed = createTextObject('Intro');
    listed.props.text.content.push({
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [] }] },
      ],
    });
    // One paragraph and a list of two.
    expect(paragraphCount(listed)).toBe(3);
    expect(paragraphCount(createShapeObject({ kind: 'rect' }))).toBe(1);

    const { make } = setup([text]);
    const { at, view } = make();
    at(1.2); // 3 × 0.5 = 1.5 s in all
    expect(view(text.id)!.effect!.time).toBeCloseTo(1.2);
    at(0.4); // 1.6 s
    expect(view(text.id)!.effect).toBeUndefined();
  });

  it('announces an entrance finishing, and an exit finishing just before its object leaves', () => {
    const box = createShapeObject({ kind: 'rect' });
    box.timing = { start: 0, duration: 2 };
    box.animations.entrance = createEffect('fade', 0.5);
    box.animations.exit = createEffect('fade', 0.5);
    const { make } = setup([box]);
    const { at, events } = make();
    const seen = () =>
      events
        .filter((event) => event.type === 'animationComplete' || event.type === 'objectLeave')
        .map((event) => (event.type === 'animationComplete' ? `${event.animation} done` : 'leave'));
    at(0.6);
    expect(seen()).toEqual(['entrance done']);
    at(1.5); // 2.1 s
    expect(seen()).toEqual(['entrance done', 'exit done', 'leave']);
  });
});

describe('motion paths', () => {
  const line = (x: number, duration = 2, relativeStart = false): MotionPath => ({
    ...createMotionPath('line', 'Line', [
      { x: 0, y: 0 },
      { x, y: 0 },
    ]),
    duration,
    easing: 'linear',
    relativeStart,
  });

  it('measure lines, arcs and freeform paths by their length, and ease', () => {
    expect(ease('linear', 0.3)).toBeCloseTo(0.3);
    expect(ease('easeIn', 0.5)).toBeCloseTo(0.25);
    expect(ease('easeOut', 0.5)).toBeCloseTo(0.75);
    // 2 × 0.25² = 0.125, and 1 − 2 × 0.25² = 0.875.
    expect(ease('easeInOut', 0.25)).toBeCloseTo(0.125);
    expect(ease('easeInOut', 0.75)).toBeCloseTo(0.875);
    // The arc passes through its middle point, halfway along by symmetry.
    const arc = createMotionPath('arc', 'Arc', [
      { x: 0, y: 0 },
      { x: 100, y: -80 },
      { x: 200, y: 0 },
    ]);
    const middle = pointAlong(pathPolyline(arc), 0.5);
    expect(middle.x).toBeCloseTo(100);
    expect(middle.y).toBeCloseTo(-80);
    // 100 across then 100 down: three quarters of 200 is 50 down the second leg.
    const corner = createMotionPath('freeform', 'Free', [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
    expect(pointAlong(pathPolyline(corner), 0.75)).toEqual({ x: 100, y: 50 });
  });

  it('moves the object along a path started when the timeline starts, and leaves it at the end', () => {
    const box = createShapeObject({ kind: 'rect' });
    const path = line(200);
    box.animations.motionPaths = [path];
    const { make, slide } = setup([box]);
    slide.triggers.push(trigger({ type: 'timelineStart', layer: slide.baseLayer.id }, box, path));
    const { at, view, events } = make();
    expect(view(box.id)!.offset).toBeUndefined();
    at(1); // half of 2 s along 200
    expect(view(box.id)!.offset).toEqual({ x: 100, y: 0 });
    at(1.5);
    expect(view(box.id)!.offset).toEqual({ x: 200, y: 0 });
    expect(
      events.filter((event) => event.type === 'animationComplete' && event.path === path.id),
    ).toHaveLength(1);
    at(3);
    expect(view(box.id)!.offset).toEqual({ x: 200, y: 0 });
  });

  it('pauses with its timeline, and carries on after the timeline has ended', () => {
    const box = createShapeObject({ kind: 'rect' });
    const path = line(200);
    box.animations.motionPaths = [path];
    const { make, slide } = setup([box]);
    slide.baseLayer.timeline.duration = 1;
    slide.triggers.push(trigger({ type: 'timelineStart', layer: slide.baseLayer.id }, box, path));
    const { engine, at, view } = make();
    at(0.5); // 50
    engine.setPaused(slide.baseLayer.id, true);
    at(2);
    expect(view(box.id)!.offset).toEqual({ x: 50, y: 0 });
    engine.setPaused(slide.baseLayer.id, false);
    // 1 s more: the 1 s timeline has ended at 0.5 + 0.5, the path is at 1.5 s of 2.
    at(1);
    expect(engine.getView().layers[0]!.ended).toBe(true);
    expect(view(box.id)!.offset).toEqual({ x: 150, y: 0 });
  });

  it('with a relative start goes on from where it is; without, starts from its own place again', () => {
    const box = createShapeObject({ kind: 'rect' });
    const relative = line(100, 1, true);
    const absolute = line(100, 1, false);
    box.animations.motionPaths = [relative, absolute];
    const { make, slide } = setup([box]);
    slide.triggers.push(
      trigger({ type: 'keyPress', key: 'r' }, box, relative),
      trigger({ type: 'keyPress', key: 'a' }, box, absolute),
    );
    const { engine, at, view } = make();
    engine.key('r');
    at(1.5);
    expect(view(box.id)!.offset).toEqual({ x: 100, y: 0 });
    engine.key('r');
    at(1.5);
    expect(view(box.id)!.offset).toEqual({ x: 200, y: 0 });
    // The absolute path starts at its first point (the object's own place) and replaces nothing.
    engine.key('a');
    at(0.5);
    expect(view(box.id)!.offset).toEqual({ x: 50, y: 0 });
    // Started again part way, a run replaces the one under way.
    engine.key('r'); // from 50: 0.5 s of 1 s along 100 more
    at(0.5);
    expect(view(box.id)!.offset).toEqual({ x: 100, y: 0 });
  });

  it('stops while its layer is hidden', () => {
    const box = createShapeObject({ kind: 'rect' });
    const path = line(200);
    box.animations.motionPaths = [path];
    const { make, slide } = setup([]);
    const overlay = createLayer('Pop-up');
    overlay.timeline.duration = 10;
    overlay.properties.onRevisit = 'resume';
    overlay.objects.push(box);
    slide.layers.push(overlay);
    slide.triggers.push(trigger({ type: 'timelineStart', layer: overlay.id }, box, path));
    const { engine, at, view } = make();
    engine.showLayer(overlay.id);
    at(0.5);
    expect(view(box.id)!.offset).toEqual({ x: 50, y: 0 });
    engine.hideLayer(overlay.id);
    at(1);
    engine.showLayer(overlay.id);
    expect(view(box.id)!.offset).toEqual({ x: 50, y: 0 });
    at(0.5);
    expect(view(box.id)!.offset).toEqual({ x: 100, y: 0 });
  });

  it('counts seeking forward as time going by, and stays put when seeking back', () => {
    const box = createShapeObject({ kind: 'rect' });
    const fromStart = line(200);
    const other = createShapeObject({ kind: 'ellipse' });
    const fromOne = line(200);
    box.animations.motionPaths = [fromStart];
    other.animations.motionPaths = [fromOne];
    const { make, slide } = setup([box, other]);
    slide.triggers.push(
      trigger({ type: 'timelineStart', layer: slide.baseLayer.id }, box, fromStart),
      trigger({ type: 'timelineReaches', layer: slide.baseLayer.id, time: 1 }, other, fromOne),
    );
    const { engine, view } = make();
    engine.seek(slide.baseLayer.id, 1.5);
    // Started at 0 s: 1.5 s of 2 along 200. Started at 1 s: 0.5 s of 2.
    expect(view(box.id)!.offset).toEqual({ x: 150, y: 0 });
    expect(view(other.id)!.offset).toEqual({ x: 50, y: 0 });
    engine.seek(slide.baseLayer.id, 0.5);
    expect(view(box.id)!.offset).toEqual({ x: 150, y: 0 });
  });

  it('is remembered on a slide that resumes, and forgotten on one that resets', () => {
    for (const onRevisit of ['resume', 'reset'] as const) {
      const box = createShapeObject({ kind: 'rect' });
      const path = line(200, 1);
      box.animations.motionPaths = [path];
      const { make, slide } = setup([box], 1);
      slide.properties.onRevisit = onRevisit;
      slide.triggers.push(trigger({ type: 'keyPress', key: 'm' }, box, path));
      const { engine, at, view } = make();
      engine.key('m');
      at(2);
      engine.next();
      if (onRevisit === 'resume') {
        expect(engine.getState().sv?.[slide.id]?.m).toEqual({ [box.id]: [200, 0] });
      }
      engine.previous();
      expect(view(box.id)!.offset).toEqual(onRevisit === 'resume' ? { x: 200, y: 0 } : undefined);
    }
  });

  it('runs an "animation completes" trigger when a path finishes', () => {
    const box = createShapeObject({ kind: 'rect' });
    const first = line(100, 1);
    const second = {
      ...line(0, 1),
      points: [
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
    };
    box.animations.motionPaths = [first, second];
    const { make, slide } = setup([box]);
    slide.triggers.push(
      trigger({ type: 'timelineStart', layer: slide.baseLayer.id }, box, first),
      trigger(
        { type: 'animationCompletes', object: box.id, animation: { kind: 'path', path: first.id } },
        box,
        second,
      ),
    );
    const { at, view } = make();
    at(1.5); // the first ends at 1 s; the second has run 0.5 s since: 50 down from (100, 0)
    expect(view(box.id)!.offset).toEqual({ x: 100, y: 50 });
  });
});

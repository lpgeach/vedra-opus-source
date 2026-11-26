import {
  createEffect,
  createEmptyProject,
  createGroupObject,
  createId,
  createMotionPath,
  createScene,
  createShapeObject,
  createSlide,
} from '@vedraopus/model';
import type { SceneObject, Trigger } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { createEngine } from './index';
import type { EngineEvent } from './types';

/**
 * A group's members with their own timing and animations
 * (docs/briefs/B8-group-member-animations.md).
 */

/** One slide of 10 s with `objects` and `triggers`; `at(s)` moves the clock on. */
function setup(
  objects: SceneObject[],
  triggers: (slide: ReturnType<typeof createSlide>) => Trigger[] = () => [],
) {
  const project = createEmptyProject('Members');
  const slide = createSlide('One');
  slide.baseLayer.timeline.duration = 10;
  slide.baseLayer.objects.push(...objects);
  slide.triggers.push(...triggers(slide));
  project.scenes = [{ ...createScene(), slides: [slide] }];
  const engine = createEngine(project);
  const events: EngineEvent[] = [];
  engine.on((event) => events.push(event));
  let now = 0;
  engine.tick(now);
  const at = (seconds: number) => {
    now += seconds * 1000;
    engine.tick(now);
  };
  const group = (id: string) =>
    engine
      .getView()
      .layers.flatMap((layer) => layer.objects)
      .find((each) => each.id === id)!;
  return { engine, events, at, group };
}

/** A group of two boxes, the first from 2 s for 3 s, the second the whole time. */
function pair() {
  const timed = createShapeObject({ kind: 'rect' });
  timed.timing = { start: 2, duration: 3 };
  const always = createShapeObject({ kind: 'ellipse' });
  const group = createGroupObject([timed, always]);
  return { timed, always, group };
}

describe('a group’s members (B8)', () => {
  it('show by their own time, inside their group’s', () => {
    const { timed, always, group } = pair();
    const { at, group: view } = setup([group]);
    at(1);
    expect(view(group.id).parts![timed.id]).toMatchObject({ onStage: false, visible: false });
    expect(view(group.id).parts![always.id]).toMatchObject({ onStage: true, visible: true });
    at(2); // 3 s
    expect(view(group.id).parts![timed.id]).toMatchObject({ onStage: true, visible: true });
    at(3); // 6 s: its 3 s are over
    expect(view(group.id).parts![timed.id]).toMatchObject({ onStage: false, visible: false });
  });

  it('are off stage while their group is, whatever their own time', () => {
    const { timed, group } = pair();
    group.timing = { start: 4, duration: 'untilEnd' };
    const { at, group: view } = setup([group]);
    at(3); // 3 s: the member's own time has begun, its group's has not
    expect(view(group.id).onStage).toBe(false);
    expect(view(group.id).parts![timed.id]).toMatchObject({ onStage: false, visible: false });
    at(1.5); // 4.5 s
    expect(view(group.id).parts![timed.id]).toMatchObject({ onStage: true, visible: true });
  });

  it('play their own entrance and exit, and announce them', () => {
    const { timed, group } = pair();
    timed.animations.entrance = createEffect('fade', 0.5);
    timed.animations.exit = createEffect('fade', 1);
    const { at, group: view, events } = setup([group]);
    at(2.2); // 0.2 s into the entrance
    expect(view(group.id).parts![timed.id]!.effect!.phase).toBe('entrance');
    expect(view(group.id).parts![timed.id]!.effect!.time).toBeCloseTo(0.2);
    at(2.3); // 4.5 s: the exit runs over the last 1 s of 2–5 s, from 4 s
    expect(view(group.id).parts![timed.id]!.effect!.phase).toBe('exit');
    expect(view(group.id).parts![timed.id]!.effect!.time).toBeCloseTo(0.5);
    at(1); // 5.5 s
    const finished = events
      .filter((event) => event.type === 'animationComplete' && event.objectId === timed.id)
      .map((event) => (event.type === 'animationComplete' ? event.animation : null));
    expect(finished).toEqual(['entrance', 'exit']);
    // It came on and went off as objects do.
    expect(
      events
        .filter((event) => 'objectId' in event && event.objectId === timed.id)
        .map((event) => event.type),
    ).toEqual(['objectEnter', 'animationComplete', 'animationComplete', 'objectLeave']);
  });

  it('run their own paths, inside a group that moves on its own', () => {
    const { always, group } = pair();
    const own = createMotionPath('line', 'Down', [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
    ]);
    own.duration = 1;
    own.easing = 'linear';
    always.animations.motionPaths = [own];
    const groupPath = createMotionPath('line', 'Across', [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
    ]);
    groupPath.duration = 1;
    groupPath.easing = 'linear';
    group.animations.motionPaths = [groupPath];
    // At 1 s the slide starts both runs.
    const start = (slide: ReturnType<typeof createSlide>, object: SceneObject, path: string) =>
      ({
        id: createId('trigger'),
        owner: { kind: 'slide', id: slide.id },
        event: { type: 'timelineReaches', layer: slide.baseLayer.id, time: 1 },
        action: { type: 'moveAlongPath', object: object.id, path },
        conditions: null,
        otherwise: null,
        enabled: true,
      }) satisfies Trigger;
    const {
      at,
      group: view,
      events,
    } = setup([group], (slide) => [
      start(slide, always, own.id),
      start(slide, group, groupPath.id),
    ]);
    at(1.5); // half-way along both
    expect(view(group.id).offset).toEqual({ x: 25, y: 0 });
    expect(view(group.id).parts![always.id]!.offset).toEqual({ x: 0, y: 50 });
    at(1); // both done
    expect(view(group.id).parts![always.id]!.offset).toEqual({ x: 0, y: 100 });
    expect(
      events.some(
        (event) =>
          event.type === 'animationComplete' &&
          event.objectId === always.id &&
          event.animation === 'path',
      ),
    ).toBe(true);
  });

  it('take clicks only while they are on stage', () => {
    const { timed, group } = pair();
    const { engine, at } = setup([group]);
    at(1);
    expect(engine.pointer('click', timed.id)).toBe(false);
    at(2); // 3 s
    expect(engine.pointer('click', timed.id)).toBe(true);
    at(3); // 6 s
    expect(engine.pointer('click', timed.id)).toBe(false);
  });
});

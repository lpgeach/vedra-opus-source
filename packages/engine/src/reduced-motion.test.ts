import {
  createEmptyProject,
  createId,
  createMotionPath,
  createScene,
  createShapeObject,
  createSlide,
  createZoomRegion,
} from '@vedraopus/model';
import type { MotionPath, SceneObject } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { createEngine } from './index';
import type { EngineEvent } from './types';

/** A 10 s slide whose box runs a 2 s line of 200 across from the start, and a zoom region from 1 s to 4 s. */
function setup(reducedMotion: boolean) {
  const project = createEmptyProject('Calm');
  project.stage = { width: 960, height: 540 };
  const slide = createSlide('One');
  slide.baseLayer.timeline.duration = 10;
  const box = createShapeObject({ kind: 'rect' });
  const path: MotionPath = {
    ...createMotionPath('line', 'Across', [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ]),
    easing: 'linear',
  };
  box.animations.motionPaths = [path];
  const region: SceneObject = {
    ...createZoomRegion(project.stage, { x: 240, y: 135, width: 480, height: 270 }),
    timing: { start: 1, duration: 3 },
  };
  slide.baseLayer.objects.push(box, region);
  slide.triggers.push({
    id: createId('trigger'),
    owner: { kind: 'object', id: box.id },
    event: { type: 'timelineStart', layer: slide.baseLayer.id },
    action: { type: 'moveAlongPath', object: box.id, path: path.id },
    conditions: null,
    otherwise: null,
    enabled: true,
  });
  project.scenes = [{ ...createScene(), slides: [slide] }];
  const engine = createEngine(project, { reducedMotion });
  const events: EngineEvent[] = [];
  engine.on((event) => events.push(event));
  let now = 0;
  engine.tick(now);
  const at = (seconds: number) => {
    now += seconds * 1000;
    engine.tick(now);
  };
  const offset = () => engine.getView().layers[0]!.objects.find((o) => o.id === box.id)!.offset;
  const done = () => events.some((event) => event.type === 'animationComplete');
  return { engine, at, offset, done };
}

describe('reduced motion', () => {
  it('shows a path’s object at its end at once, but runs and saves it as it really is', () => {
    const calm = setup(true);
    expect(calm.offset()).toEqual({ x: 200, y: 0 });
    calm.at(1);
    expect(calm.offset()).toEqual({ x: 200, y: 0 });
    // Saved for resuming where it really is, halfway along.
    const saved = Object.values(calm.engine.getState().sv ?? {})[0];
    expect(Object.values(saved?.m ?? {})).toEqual([[100, 0]]);
    expect(calm.done()).toBe(false);
    calm.at(1.1);
    expect(calm.done()).toBe(true);
    expect(calm.offset()).toEqual({ x: 200, y: 0 });
  });

  it('cuts to a zoom region as it starts and back as it ends', () => {
    const calm = setup(true);
    calm.at(0.9);
    expect(calm.engine.getView().camera).toBeUndefined();
    calm.at(0.2); // 1.1 s: normally a fifth of the way in
    expect(calm.engine.getView().camera).toEqual({ x: 240, y: 135, width: 480, height: 270 });
    calm.at(2.8); // 3.9 s: normally most of the way out
    expect(calm.engine.getView().camera).toEqual({ x: 240, y: 135, width: 480, height: 270 });
    calm.at(0.2); // 4.1 s
    expect(calm.engine.getView().camera).toBeUndefined();
  });

  it('changes nothing without the option', () => {
    const moving = setup(false);
    moving.at(1);
    expect(moving.offset()).toEqual({ x: 100, y: 0 });
    moving.at(0.1); // 1.1 s
    expect(moving.engine.getView().camera!.width).toBeGreaterThan(480);
  });
});

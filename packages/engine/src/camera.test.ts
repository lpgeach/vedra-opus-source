import {
  createEmptyProject,
  createLayer,
  createScene,
  createSlide,
  createZoomRegion,
} from '@vedraopus/model';
import type { Frame, SceneObject } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { fitView } from './camera';
import { createEngine } from './index';

const stage = { width: 960, height: 540 };
const region = (frame: Partial<Frame>, start: number, duration: number): SceneObject => ({
  ...createZoomRegion(stage, frame),
  timing: { start, duration },
});

/** A 10 s slide with `objects`, and `overlay` as a layer if given. */
function setup(objects: SceneObject[], overlay: SceneObject[] = []) {
  const project = createEmptyProject('Zoom');
  // The numbers below are worked out for this stage, not the default (1280 × 720).
  project.stage = { ...stage };
  const slide = createSlide('One');
  slide.baseLayer.timeline.duration = 10;
  slide.baseLayer.objects.push(...objects);
  const layer = createLayer('Close-up');
  layer.timeline.duration = 10;
  layer.objects.push(...overlay);
  slide.layers.push(layer);
  project.scenes = [{ ...createScene(), slides: [slide] }];
  const engine = createEngine(project);
  let now = 0;
  engine.tick(now);
  const at = (seconds: number) => {
    now += seconds * 1000;
    engine.tick(now);
  };
  const camera = () => engine.getView().camera;
  return { engine, at, camera, slide, layer };
}

describe('zoom regions', () => {
  it('fit a region whole, in the stage’s shape, about its middle', () => {
    expect(fitView({ x: 240, y: 135, width: 480, height: 270 }, stage)).toEqual({
      x: 240,
      y: 135,
      width: 480,
      height: 270,
    });
    // A 200 square: scaled min(960 / 200, 540 / 200) = 2.7, so 960 / 2.7 = 355.6 wide and
    // 540 / 2.7 = 200 high, about its middle (200, 200).
    const square = fitView({ x: 100, y: 100, width: 200, height: 200 }, stage);
    expect(square.width).toBeCloseTo(355.556, 2);
    expect(square.height).toBeCloseTo(200);
    expect(square.x).toBeCloseTo(200 - 355.556 / 2, 2);
    expect(square.y).toBeCloseTo(100);
  });

  it('zoom in over the first half second of the bar, hold, and out over the last', () => {
    // The middle half of the stage, on from 1 s to 5 s.
    const { at, camera } = setup([region({ x: 240, y: 135, width: 480, height: 270 }, 1, 4)]);
    at(0.5);
    expect(camera()).toBeUndefined();
    // 1.25 s: halfway in, and halfway eased is halfway: from 960 wide to 480, 720.
    at(0.75);
    expect(camera()).toEqual({ x: 120, y: 67.5, width: 720, height: 405 });
    at(1.75); // 3 s
    expect(camera()).toEqual({ x: 240, y: 135, width: 480, height: 270 });
    at(1.75); // 4.75 s: halfway out
    expect(camera()).toEqual({ x: 120, y: 67.5, width: 720, height: 405 });
    at(0.25); // 5 s: its bar has ended
    expect(camera()).toBeUndefined();
  });

  it('hand over from one region to a later one and back', () => {
    // The top-left quarter from 0 to 6 s; the bottom-right quarter from 2 to 4 s.
    const { engine, camera, slide } = setup([
      region({ x: 0, y: 0, width: 480, height: 270 }, 0, 6),
      region({ x: 480, y: 270, width: 480, height: 270 }, 2, 2),
    ]);
    const base = slide.baseLayer.id;
    engine.seek(base, 1);
    expect(camera()).toEqual({ x: 0, y: 0, width: 480, height: 270 });
    // 2.25 s: halfway from the top-left quarter to the bottom-right.
    engine.seek(base, 2.25);
    expect(camera()).toEqual({ x: 240, y: 135, width: 480, height: 270 });
    engine.seek(base, 3);
    expect(camera()).toEqual({ x: 480, y: 270, width: 480, height: 270 });
    // 3.75 s: halfway back.
    engine.seek(base, 3.75);
    expect(camera()).toEqual({ x: 240, y: 135, width: 480, height: 270 });
    engine.seek(base, 4.5);
    expect(camera()).toEqual({ x: 0, y: 0, width: 480, height: 270 });
  });

  it('follow the playhead when paused, and take a shown layer’s region over the base’s', () => {
    const { engine, at, camera, slide, layer } = setup(
      [region({ x: 0, y: 0, width: 480, height: 270 }, 0, 10)],
      [region({ x: 480, y: 0, width: 480, height: 270 }, 0, 10)],
    );
    at(1);
    expect(camera()).toEqual({ x: 0, y: 0, width: 480, height: 270 });
    engine.setPaused(slide.baseLayer.id, true);
    engine.seek(slide.baseLayer.id, 0.25);
    at(2);
    // Paused a quarter second in: halfway between the whole stage and the region.
    expect(camera()).toEqual({ x: 0, y: 0, width: 720, height: 405 });
    engine.showLayer(layer.id);
    at(1);
    expect(camera()).toEqual({ x: 480, y: 0, width: 480, height: 270 });
  });

  it('spend half a short region going in and half coming out', () => {
    // 0.6 s long with a 0.5 s speed: 0.3 s each way, so 0.15 s in is halfway.
    const { engine, camera, slide } = setup([
      region({ x: 240, y: 135, width: 480, height: 270 }, 0, 0.6),
    ]);
    engine.seek(slide.baseLayer.id, 0.15);
    expect(camera()).toEqual({ x: 120, y: 67.5, width: 720, height: 405 });
  });
});

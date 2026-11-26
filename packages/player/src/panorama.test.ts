import { describe, expect, it } from 'vitest';
import { dragged, keyed, projectFlat, projectSpot, verticalFov, wrapYaw } from './panorama';

/** The 360° view's maths (docs/briefs/P9.10-panoramas.md). */

const size = { width: 800, height: 400 };
const ahead = { yaw: 0, pitch: 0, fov: 90 };

describe('360° view maths', () => {
  it('puts a spot straight ahead in the middle, and hides one behind', () => {
    expect(projectSpot({ yaw: 0, pitch: 0 }, ahead, size)).toEqual({ x: 400, y: 200 });
    expect(projectSpot({ yaw: 180, pitch: 0 }, ahead, size)).toBeNull();
    expect(projectSpot({ yaw: 100, pitch: 0 }, ahead, size)).toBeNull();
    // Turned to face it, it is in the middle.
    const at = projectSpot({ yaw: 120, pitch: 20 }, { yaw: 120, pitch: 20, fov: 60 }, size)!;
    expect(at.x).toBeCloseTo(400);
    expect(at.y).toBeCloseTo(200);
  });

  it('puts the edge of a 90° view at the edge of the canvas, and up above the middle', () => {
    const right = projectSpot({ yaw: 44.9, pitch: 0 }, ahead, size)!;
    expect(right.x).toBeGreaterThan(795);
    expect(right.y).toBeCloseTo(200);
    const up = projectSpot({ yaw: 0, pitch: 10 }, ahead, size)!;
    expect(up.x).toBeCloseTo(400);
    expect(up.y).toBeLessThan(200);
    // Across the back seam: looking at 170°, a spot at −170° is to the right.
    const seam = projectSpot({ yaw: -170, pitch: 0 }, { yaw: 170, pitch: 0, fov: 90 }, size)!;
    expect(seam.x).toBeGreaterThan(400);
  });

  it('pans flat evenly, across the seam too', () => {
    expect(projectFlat({ yaw: 0, pitch: 0 }, ahead, size)).toEqual({ x: 400, y: 200 });
    // A quarter of the 90° view to the right is a quarter of the width.
    expect(projectFlat({ yaw: 22.5, pitch: 0 }, ahead, size)!.x).toBeCloseTo(600);
    expect(
      projectFlat({ yaw: -170, pitch: 0 }, { yaw: 170, pitch: 0, fov: 90 }, size)!.x,
    ).toBeCloseTo(400 + (20 / 90) * 800);
    expect(projectFlat({ yaw: 90, pitch: 0 }, ahead, size)).toBeNull();
    expect(verticalFov(90, 800, 400)).toBeCloseTo(53.13, 1);
  });

  it('turns by drags and keys, wrapping round and stopping at straight up and down', () => {
    expect(wrapYaw(190)).toBe(-170);
    expect(wrapYaw(-190)).toBe(170);
    // Dragging left by a whole view's width turns right by the view's angle.
    expect(dragged(ahead, -800, 0, 800).yaw).toBeCloseTo(90);
    expect(dragged(ahead, 0, 10_000, 800).pitch).toBe(90);
    expect(keyed(ahead, 'ArrowRight')!.yaw).toBe(5);
    expect(keyed({ ...ahead, yaw: 178 }, 'ArrowRight')!.yaw).toBe(-177);
    expect(keyed(ahead, 'ArrowDown')!.pitch).toBe(-5);
    expect(keyed(ahead, '+')!.fov).toBe(85);
    expect(keyed({ ...ahead, fov: 100 }, '-')!.fov).toBe(100);
    expect(keyed(ahead, 'Enter')).toBeNull();
  });
});

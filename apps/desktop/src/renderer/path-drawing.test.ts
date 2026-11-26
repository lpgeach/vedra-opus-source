import { createShapeObject } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { defaultPathPoints, MAX_DRAWN_POINTS, strokeToPath } from './path-drawing';

describe('drawn paths', () => {
  it('start at the object, drop points too close together, and keep the end', () => {
    // Drawn from (500, 300): every point is taken relative to it.
    const stroke = [
      { x: 500, y: 300 },
      { x: 501, y: 300 }, // 1 from the last kept: dropped
      { x: 510, y: 300 },
      { x: 520, y: 310 },
      { x: 521.4, y: 310.6 }, // the end, 1.5 from (20, 10): it takes that point's place
    ];
    expect(strokeToPath(stroke)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 21, y: 11 },
    ]);
  });

  it('refuses a click or a scribble too short to follow', () => {
    expect(strokeToPath([])).toBeNull();
    expect(strokeToPath([{ x: 5, y: 5 }])).toBeNull();
    expect(
      strokeToPath([
        { x: 5, y: 5 },
        { x: 9, y: 7 },
      ]),
    ).toBeNull();
  });

  it('keeps at most the limit, evenly picked, first and last included', () => {
    const stroke = Array.from({ length: 400 }, (_, i) => ({ x: i * 5, y: 0 }));
    const points = strokeToPath(stroke)!;
    expect(points).toHaveLength(MAX_DRAWN_POINTS);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    // The last point drawn is 399 × 5 = 1995 along.
    expect(points.at(-1)).toEqual({ x: 1995, y: 0 });
  });

  it('puts a new line or arc to the right, or to the left with no room on the right', () => {
    const left = createShapeObject({ kind: 'rect' }, { x: 100, y: 100, width: 100, height: 50 });
    expect(defaultPathPoints('line', left, 960)).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ]);
    // Its middle is at 850: 850 + 200 is past 960.
    const right = createShapeObject({ kind: 'rect' }, { x: 800, y: 100, width: 100, height: 50 });
    expect(defaultPathPoints('arc', right, 960)).toEqual([
      { x: 0, y: 0 },
      { x: -100, y: -80 },
      { x: -200, y: 0 },
    ]);
  });
});

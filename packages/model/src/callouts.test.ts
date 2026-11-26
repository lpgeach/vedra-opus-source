import { describe, expect, it } from 'vitest';
import { CALLOUT_KINDS, calloutGeometry } from './callouts';
import { isPathData, parsePathData } from './path-data';
import { shapeGeometrySchema } from './schema';

describe('callouts (B17)', () => {
  it('makes each kind as a valid path shape, its tail reaching below the box', () => {
    for (const kind of CALLOUT_KINDS) {
      const geometry = calloutGeometry(kind, 240, 120);
      expect(shapeGeometrySchema.parse(geometry)).toEqual(geometry);
      if (geometry.kind !== 'path') throw new Error('not a path shape');
      for (const path of geometry.paths) expect(isPathData(path.d)).toBe(true);
      // The points each outline passes through (not curves' control points, which may lie
      // outside what is drawn) are in the 0–1 box, but for the tail, which points below it.
      const ys = geometry.paths.flatMap((path) =>
        (parsePathData(path.d) ?? []).flatMap((command) => command.values.slice(-1)),
      );
      expect(Math.max(...ys)).toBeGreaterThan(1);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(-0.001);
    }
  });

  it('gives the cloud its bubbles, and the others one outline', () => {
    const count = (kind: (typeof CALLOUT_KINDS)[number]) => {
      const geometry = calloutGeometry(kind, 240, 120);
      return geometry.kind === 'path' ? geometry.paths.length : 0;
    };
    expect(count('rounded')).toBe(1);
    expect(count('square')).toBe(1);
    expect(count('oval')).toBe(1);
    expect(count('cloud')).toBe(4);
  });
});

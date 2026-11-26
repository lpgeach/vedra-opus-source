import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  createShapeObject,
  isPathData,
  parsePathData,
  parseProject,
  writePathData,
} from './index';

/** Path shapes' outlines (docs/briefs/B13-path-shapes.md). */

describe('path data', () => {
  it('reads absolute moves, lines, curves and closes, with points outside the box', () => {
    expect(parsePathData('M0 0L1,0 C 1 0.5 0.5 1.25 -0.2 1e-1Z')).toEqual([
      { op: 'M', values: [0, 0] },
      { op: 'L', values: [1, 0] },
      { op: 'C', values: [1, 0.5, 0.5, 1.25, -0.2, 0.1] },
      { op: 'Z', values: [] },
    ]);
  });

  it('refuses anything else', () => {
    for (const d of [
      '',
      'L0 0',
      'm0 0l1 1',
      'M0 0A1 1 0 0 1 1 1',
      'M0 0L1',
      'M0 0C1 1 1 1',
      'M0 0L1 1 2',
      'M0 0H1',
      'M0 0L1 x',
    ]) {
      expect(isPathData(d), d).toBe(false);
    }
  });

  it('writes commands back, rounded to four places', () => {
    expect(
      writePathData([
        { op: 'M', values: [0.123456, -0.00001] },
        { op: 'L', values: [1, 0.5] },
        { op: 'Z', values: [] },
      ]),
    ).toBe('M0.1235 0L1 0.5Z');
  });

  it('is a shape geometry that validates, and refuses bad data', () => {
    const project = createEmptyProject();
    const geometry = {
      kind: 'path' as const,
      paths: [{ d: 'M0 0L1 0L1 1Z', fill: true, stroke: false }],
    };
    project.scenes[0]!.slides[0]!.baseLayer.objects.push(
      createShapeObject(geometry, { x: 0, y: 0, width: 10, height: 10 }),
    );
    expect(() => parseProject(JSON.parse(JSON.stringify(project)))).not.toThrow();
    geometry.paths[0]!.d = 'M0 0A1 1 0 0 1 1 1';
    expect(() => parseProject(JSON.parse(JSON.stringify(project)))).toThrow(
      /only absolute M, L, C and Z/,
    );
  });
});

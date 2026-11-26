import { describe, expect, it } from 'vitest';
import { PEAK_STEP, peaksOf, waveformPath } from './audio-analysis';

describe('waveforms', () => {
  it('takes the loudest sample of each step, across channels, as 0–255', () => {
    const left = new Float32Array([0, 0.5, -1, 0.25, 0, 0]);
    const right = new Float32Array([0.1, 0, 0, -0.75, 0, 0.2]);
    // Steps of two samples: [0, .5 | .1, 0] → .5; [-1, .25 | 0, -.75] → 1; [0, 0 | 0, .2] → .2.
    expect([...peaksOf([left, right], 2)]).toEqual([128, 255, 51]);
    // A part-filled last step counts what it has.
    expect([...peaksOf([new Float32Array([0.5, 0.5, 1])], 2)]).toEqual([128, 255]);
    expect([...peaksOf([], 2)]).toEqual([]);
  });

  it('draws the part of the sound asked for, symmetrical about the middle', () => {
    const peaks = new Uint8Array([0, 255, 51, 102]);
    // From the second point (10 ms in), for 20 ms: two points, full height then a fifth.
    const { d, points } = waveformPath(peaks, PEAK_STEP, 2 * PEAK_STEP);
    expect(points).toBe(1);
    expect(d).toBe('M0 0.0L1 40.0L1 60.0L0 100.0Z');
    expect(waveformPath(peaks, 1, 1)).toEqual({ d: '', points: 1 });
  });
});

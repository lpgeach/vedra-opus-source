import { describe, expect, it } from 'vitest';
import { dialValue, keyedValue, lookedDialValue } from './controls';

/** Sliders and dials (docs/briefs/P9.4-sliders-dials.md). */

const range = { min: 0, max: 100, step: 5 };

describe('dials and keys', () => {
  it('read a dial’s value from the pointer’s angle, clockwise from straight up', () => {
    // Straight up is the middle of the 270° sweep: 50.
    expect(dialValue(range, 0, -10)).toBeCloseTo(50);
    // Straight right is +90°: (90 + 135) / 270 = 0.8333 of the range.
    expect(dialValue(range, 10, 0)).toBeCloseTo(83.333, 2);
    // Straight left is -90°: 45 / 270 = 0.1667.
    expect(dialValue(range, -10, 0)).toBeCloseTo(16.667, 2);
    // The gap at the bottom goes to the nearer end: just right of bottom is the greatest.
    expect(dialValue(range, 1, 10)).toBe(100);
    expect(dialValue(range, -1, 10)).toBe(0);
  });

  it('read a dial drawn its own way from its pointer’s turn, between its two angles (B16)', () => {
    // Sample B's dial: -122 to 121, turning from -50.4° to 46.8°.
    const sample = { min: -122, max: 121, look: { from: -50.4, to: 46.8 } };
    expect(lookedDialValue(sample, 0)).toBeCloseTo(4, 5);
    expect(lookedDialValue(sample, -50.4)).toBeCloseTo(-122);
    expect(lookedDialValue(sample, 46.8)).toBeCloseTo(121);
    // Past an end, the nearer end; the same direction a whole turn round is the same.
    expect(lookedDialValue(sample, 90)).toBeCloseTo(121);
    expect(lookedDialValue(sample, -170)).toBeCloseTo(-122);
    expect(lookedDialValue(sample, 360)).toBeCloseTo(4, 5);
  });

  it('move a value a step, ten steps or to an end by key, and ignore other keys', () => {
    expect(keyedValue(range, 50, 'ArrowRight')).toBe(55);
    expect(keyedValue(range, 50, 'ArrowUp')).toBe(55);
    expect(keyedValue(range, 50, 'ArrowLeft')).toBe(45);
    expect(keyedValue(range, 50, 'PageUp')).toBe(100);
    expect(keyedValue(range, 50, 'PageDown')).toBe(0);
    expect(keyedValue(range, 50, 'Home')).toBe(0);
    expect(keyedValue(range, 50, 'End')).toBe(100);
    expect(keyedValue(range, 50, 'a')).toBeNull();
  });
});

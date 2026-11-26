import { describe, expect, it } from 'vitest';
import { tickStep } from './Rulers';

describe('tickStep', () => {
  it('keeps labels apart at every zoom, using the smallest round step', () => {
    for (const zoom of [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 4, 8]) {
      const step = tickStep(zoom);
      expect(step * zoom).toBeGreaterThanOrEqual(48);
    }
  });

  it('shows smaller steps as the stage gets bigger on screen', () => {
    expect(tickStep(0.1)).toBe(500);
    expect(tickStep(0.5)).toBe(100);
    expect(tickStep(1)).toBe(50);
    expect(tickStep(8)).toBe(10);
  });
});

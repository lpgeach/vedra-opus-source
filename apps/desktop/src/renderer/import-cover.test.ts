import { describe, expect, it } from 'vitest';
import type { ImportProgress } from '../shared/ipc';
import { overallFraction } from './components/ImportCover';

/** The cover's overall bar (B7, docs/briefs/B7-import-progress.md). */

const at = (
  source: ImportProgress['source'],
  stage: ImportProgress['stage'],
  done = 0,
  total = 0,
  fraction?: number,
): ImportProgress => ({
  source,
  name: 'x',
  stage,
  done,
  total,
  ...(fraction !== undefined ? { fraction } : {}),
});

describe('the overall bar', () => {
  it('only goes forward through a Storyline import, in its order of stages', () => {
    const steps = [
      at('storyline', 'reading'),
      at('storyline', 'media', 0, 4),
      at('storyline', 'media', 0, 4, 0.5),
      at('storyline', 'media', 1, 4),
      at('storyline', 'media', 3, 4, 0.9),
      at('storyline', 'slides'),
      at('storyline', 'checking'),
    ];
    const values = steps.map(overallFraction);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    // Media run from 5% to 90%: half of the first of four files is 5% + 85% × 0.5 / 4.
    expect(values[2]).toBeCloseTo(0.05 + 0.85 * (0.5 / 4));
    expect(values[6]).toBe(0.97);
  });

  it('only goes forward through a PowerPoint import, whose stages come in another order', () => {
    const steps = [
      at('powerpoint', 'reading'),
      at('powerpoint', 'slides'),
      at('powerpoint', 'drawing'),
      at('powerpoint', 'media', 0, 2),
      at('powerpoint', 'media', 1, 2, 0.5),
    ];
    const values = steps.map(overallFraction);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    // Media from 35% to 100%: one and a half of two files is 35% + 65% × 0.75.
    expect(values[4]).toBeCloseTo(0.35 + 0.65 * 0.75);
  });

  it('never passes the whole, even if a file reports more than all of it', () => {
    expect(overallFraction(at('storyline', 'media', 4, 4, 1))).toBeCloseTo(0.9);
  });
});

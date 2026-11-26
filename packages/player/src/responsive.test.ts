import { describe, expect, it } from 'vitest';
import { COMPACT_BELOW, isCompact, swipeOf, wantsRotation } from './responsive';

/** The player on small screens and touch (docs/briefs/P8.5-responsive.md). */

describe('responsive player', () => {
  it('is compact below 640 pixels, and not when it has no size yet', () => {
    expect(COMPACT_BELOW).toBe(640);
    expect(isCompact(375)).toBe(true);
    expect(isCompact(639)).toBe(true);
    expect(isCompact(640)).toBe(false);
    expect(isCompact(0)).toBe(false);
  });

  it('reads a swipe: far enough, mostly sideways, and quick', () => {
    // Left goes on; right goes back.
    expect(swipeOf(-80, 10, 200)).toBe('next');
    expect(swipeOf(80, -10, 200)).toBe('previous');
    // Too short (59 < 60), too slow (601 > 600 ms).
    expect(swipeOf(-59, 0, 100)).toBeNull();
    expect(swipeOf(-200, 0, 601)).toBeNull();
    // Not sideways enough: 80 across against 40 down is exactly twice, which is not more than twice.
    expect(swipeOf(-80, 40, 200)).toBeNull();
    expect(swipeOf(-81, 40, 200)).toBe('next');
  });

  it('suggests turning only a landscape course in a portrait compact player', () => {
    const wide = { width: 1280, height: 720 };
    const tall = { width: 720, height: 1280 };
    const portrait = { width: 375, height: 600 };
    const landscape = { width: 600, height: 375 };
    expect(wantsRotation(wide, portrait, true)).toBe(true);
    expect(wantsRotation(wide, portrait, false)).toBe(false);
    expect(wantsRotation(wide, landscape, true)).toBe(false);
    expect(wantsRotation(tall, portrait, true)).toBe(false);
  });
});

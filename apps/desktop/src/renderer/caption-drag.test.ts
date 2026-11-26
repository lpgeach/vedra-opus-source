import type { CaptionCue } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { dragCue, gripAt } from './caption-drag';

const cue = (id: string, start: number, end: number): CaptionCue => ({ id, start, end, text: id });

describe('gripAt', () => {
  const cues = [cue('a', 1, 2), cue('b', 2, 3), cue('c', 5, 5.1)];

  it('takes the edge near the press, or the whole caption inside, or nothing between', () => {
    expect(gripAt(cues, 1.02, 0.05, null)).toEqual({ id: 'a', grip: 'start' });
    expect(gripAt(cues, 1.5, 0.05, null)).toEqual({ id: 'a', grip: 'move' });
    expect(gripAt(cues, 2.97, 0.05, null)).toEqual({ id: 'b', grip: 'end' });
    expect(gripAt(cues, 4, 0.05, null)).toBeNull();
  });

  it('where one caption ends as the next starts, goes by the side pressed', () => {
    // 1.99 is inside a (1–2): a's end. 2.01 is inside b (2–3): b's start.
    expect(gripAt(cues, 1.99, 0.05, null)).toEqual({ id: 'a', grip: 'end' });
    expect(gripAt(cues, 2.01, 0.05, null)).toEqual({ id: 'b', grip: 'start' });
    // Still so when the other caption is the chosen one.
    expect(gripAt(cues, 2.01, 0.05, 'a')).toEqual({ id: 'b', grip: 'start' });
    expect(gripAt(cues, 1.99, 0.05, 'b')).toEqual({ id: 'a', grip: 'end' });
  });

  it('stretches a caption shorter than the reach by its nearer edge', () => {
    // c is 5–5.1 and the reach 0.1: 5.03 is 0.03 from the start and 0.07 from the end.
    expect(gripAt(cues, 5.03, 0.1, null)).toEqual({ id: 'c', grip: 'start' });
    expect(gripAt(cues, 5.08, 0.1, null)).toEqual({ id: 'c', grip: 'end' });
  });

  it('inside overlapping captions, takes the chosen one, by its edge or its body', () => {
    const overlapping = [cue('x', 0, 4), cue('y', 1, 3)];
    expect(gripAt(overlapping, 2, 0.05, null)).toEqual({ id: 'x', grip: 'move' });
    expect(gripAt(overlapping, 2, 0.05, 'y')).toEqual({ id: 'y', grip: 'move' });
    // x 0–2 and y 1.98–3: 1.99 is inside both and 0.01 from x's end and y's start.
    const edges = [cue('x', 0, 2), cue('y', 1.98, 3)];
    expect(gripAt(edges, 1.99, 0.05, 'x')).toEqual({ id: 'x', grip: 'end' });
    expect(gripAt(edges, 1.99, 0.05, 'y')).toEqual({ id: 'y', grip: 'start' });
  });
});

describe('dragCue', () => {
  const one = cue('a', 1, 2);

  it('moves a start or an end alone, never past the other or out of the file', () => {
    expect(dragCue(one, 'start', -0.5, 4)).toMatchObject({ start: 0.5, end: 2 });
    expect(dragCue(one, 'start', -3, 4)).toMatchObject({ start: 0, end: 2 });
    // 2 − 0.05 = 1.95 is as late as the start can go.
    expect(dragCue(one, 'start', 5, 4)).toMatchObject({ start: 1.95, end: 2 });
    expect(dragCue(one, 'end', 0.333, 4)).toMatchObject({ start: 1, end: 2.33 });
    expect(dragCue(one, 'end', -5, 4)).toMatchObject({ start: 1, end: 1.05 });
    expect(dragCue(one, 'end', 5, 4)).toMatchObject({ start: 1, end: 4 });
  });

  it('moves the whole caption keeping its length, stopping at either end of the file', () => {
    expect(dragCue(one, 'move', 1.25, 4)).toMatchObject({ start: 2.25, end: 3.25 });
    expect(dragCue(one, 'move', -2, 4)).toMatchObject({ start: 0, end: 1 });
    // 4 − 1 = 3 is as late as a 1 s caption can start.
    expect(dragCue(one, 'move', 9, 4)).toMatchObject({ start: 3, end: 4 });
    expect(dragCue(one, 'move', 0.5, 4).text).toBe('a');
  });
});

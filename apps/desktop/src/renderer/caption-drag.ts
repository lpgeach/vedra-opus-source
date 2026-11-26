import type { CaptionCue } from '@vedraopus/model';

/** The shortest a caption can be made by editing or dragging its times. */
export const SHORTEST = 0.05;
export const hundredth = (seconds: number) => Math.round(seconds * 100) / 100;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** What a press on the waveform takes hold of: a caption's start, its end, or the whole caption. */
export type CueGrip = 'start' | 'end' | 'move';

/**
 * The caption and grip under `at` seconds on the waveform, if any.
 *
 * An edge within `reach` seconds wins over a body, so a short caption can
 * still be stretched. Among edges, a caption the press landed inside comes
 * first: where one caption ends as the next starts, the press goes to the
 * side it landed on. Then the chosen caption's edge (for overlaps), then the
 * nearest. Otherwise a press inside a caption takes the whole caption (the
 * chosen one when they overlap).
 */
export function gripAt(
  cues: readonly CaptionCue[],
  at: number,
  reach: number,
  chosen: string | null,
): { id: string; grip: CueGrip } | null {
  const inside = (cue: CaptionCue) => cue.start <= at && at < cue.end;
  const edges = cues.flatMap((cue) =>
    (
      [
        ['start', Math.abs(at - cue.start)],
        ['end', Math.abs(at - cue.end)],
      ] as const
    )
      .filter(([, distance]) => distance <= reach)
      .map(([grip, distance]) => ({ cue, grip, distance })),
  );
  edges.sort(
    (a, b) =>
      Number(inside(b.cue)) - Number(inside(a.cue)) ||
      Number(b.cue.id === chosen) - Number(a.cue.id === chosen) ||
      a.distance - b.distance,
  );
  const edge = edges[0];
  if (edge) return { id: edge.cue.id, grip: edge.grip };
  const under = cues.filter(inside);
  const body = under.find((cue) => cue.id === chosen) ?? under[0];
  return body ? { id: body.id, grip: 'move' } : null;
}

/**
 * `original` dragged by `delta` seconds from where the drag began, kept inside
 * a file `length` seconds long, at least `SHORTEST` long, and in hundredths.
 * A start or an end moves alone; a move keeps the caption's length.
 */
export function dragCue(
  original: CaptionCue,
  grip: CueGrip,
  delta: number,
  length: number,
): CaptionCue {
  if (grip === 'start')
    return {
      ...original,
      start: hundredth(clamp(original.start + delta, 0, original.end - SHORTEST)),
    };
  if (grip === 'end')
    return {
      ...original,
      end: hundredth(clamp(original.end + delta, original.start + SHORTEST, length)),
    };
  const span = original.end - original.start;
  const start = hundredth(clamp(original.start + delta, 0, Math.max(0, length - span)));
  return { ...original, start, end: hundredth(Math.min(length, start + span)) };
}

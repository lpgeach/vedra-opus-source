import type { Frame } from '@vedraopus/model';
import { ease } from './animation';

/**
 * Where the learner's view of a slide is, given its zoom regions
 * (docs/briefs/P6.7-zoom-and-cues.md). Pure: the player draws it.
 */

export interface View {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Region {
  /** Seconds on its layer's timeline. */
  start: number;
  end: number;
  /** Seconds the zoom in and the zoom out each take. */
  speed: number;
  frame: Pick<Frame, 'x' | 'y' | 'width' | 'height'>;
}

/**
 * The part of the stage that shows `frame` whole, centred on it, in the
 * stage's own shape (so the view is only ever scaled, never stretched).
 */
export function fitView(frame: Region['frame'], stage: { width: number; height: number }): View {
  const scale = Math.min(
    stage.width / Math.max(frame.width, 1),
    stage.height / Math.max(frame.height, 1),
  );
  const width = stage.width / scale;
  const height = stage.height / scale;
  return {
    x: frame.x + frame.width / 2 - width / 2,
    y: frame.y + frame.height / 2 - height / 2,
    width,
    height,
  };
}

const between = (a: View, b: View, f: number): View => ({
  x: a.x + (b.x - a.x) * f,
  y: a.y + (b.y - a.y) * f,
  width: a.width + (b.width - a.width) * f,
  height: a.height + (b.height - a.height) * f,
});

/**
 * The view with the playhead at `t`. The region on stage that started last
 * decides it: it zooms in over its first `speed` seconds, from wherever the
 * view was as it started, and back out over its last, to wherever the view
 * goes as it ends. With none on stage, the whole stage shows.
 */
export function viewAt(
  regions: readonly Region[],
  t: number,
  stage: { width: number; height: number },
): View {
  const whole = { x: 0, y: 0, width: stage.width, height: stage.height };
  let deciding: Region | undefined;
  for (const region of regions) {
    if (region.start <= t && t < region.end && (!deciding || region.start >= deciding.start)) {
      deciding = region;
    }
  }
  if (!deciding) return whole;
  const others = regions.filter((region) => region !== deciding);
  const target = fitView(deciding.frame, stage);
  // A short region spends half its time going in and half coming out.
  const speed = Math.min(deciding.speed, (deciding.end - deciding.start) / 2);
  if (speed > 0 && t - deciding.start < speed) {
    const from = viewAt(others, deciding.start, stage);
    return between(from, target, ease('easeInOut', (t - deciding.start) / speed));
  }
  if (speed > 0 && deciding.end - t < speed) {
    const to = viewAt(others, deciding.end, stage);
    return between(to, target, ease('easeInOut', (deciding.end - t) / speed));
  }
  return target;
}

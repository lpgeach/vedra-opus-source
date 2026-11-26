import type { PointerEvent as ReactPointerEvent } from 'react';

/** Thickness of the ruler strips, in screen pixels. */
export const RULER = 20;

/** Tick spacings that read well, in stage units. */
const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000];
/** Labels are at least this far apart on screen, in pixels. */
const LABEL_GAP = 48;

/** The smallest round step whose labels will not crowd at this zoom. */
export function tickStep(zoom: number): number {
  return STEPS.find((step) => step * zoom >= LABEL_GAP) ?? STEPS[STEPS.length - 1]!;
}

interface RulersProps {
  stage: { width: number; height: number };
  zoom: number;
  /** How far the viewport is scrolled, in screen pixels. */
  scroll: { left: number; top: number };
  /** Where the stage's top-left corner sits in the scrolled content, in screen pixels. */
  offset: { x: number; y: number };
  /** A press on a ruler starts dragging a new guide of that axis. */
  onStart: (axis: 'x' | 'y', event: ReactPointerEvent<HTMLDivElement>) => void;
}

/**
 * Strips along the top and left of the stage area, marked in stage units and
 * moving with the slide as it scrolls or zooms. Purely a guide for the eye:
 * the pointer handling lives with the stage.
 */
export function Rulers({ stage, zoom, scroll, offset, onStart }: RulersProps) {
  const step = tickStep(zoom);
  const marks = (length: number) => {
    const values: number[] = [];
    for (let at = 0; at <= length; at += step) values.push(at);
    return values;
  };

  return (
    <>
      <div className="ruler-corner" aria-hidden="true">
        0
      </div>
      <div
        className="ruler ruler-top"
        data-testid="ruler-top"
        data-ruler="y"
        aria-hidden="true"
        onPointerDown={(event) => onStart('y', event)}
      >
        <svg width="100%" height={RULER}>
          {marks(stage.width).map((at) => {
            const x = offset.x - scroll.left + at * zoom;
            return (
              <g key={at}>
                <line className="ruler-tick" x1={x} y1={RULER - 5} x2={x} y2={RULER} />
                <text className="ruler-label" x={x + 3} y={10}>
                  {at}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div
        className="ruler ruler-left"
        data-testid="ruler-left"
        data-ruler="x"
        aria-hidden="true"
        onPointerDown={(event) => onStart('x', event)}
      >
        <svg width={RULER} height="100%">
          {marks(stage.height).map((at) => {
            const y = offset.y - scroll.top + at * zoom;
            return (
              <g key={at}>
                <line className="ruler-tick" x1={RULER - 5} y1={y} x2={RULER} y2={y} />
                <text className="ruler-label" x={-3} y={y} transform={`rotate(-90 4 ${y})`}>
                  {at}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </>
  );
}

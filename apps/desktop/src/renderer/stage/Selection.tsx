import type { Frame } from '@vedraopus/model';
import { cornersOf, handlePoint, HANDLES, rotatePoint } from './geometry';
import type { Handle, Point, Rect, SnapLine } from './geometry';

/** Side of a resize handle, in screen pixels. */
const HANDLE_SIZE = 9;
/** How far above the frame the rotate handle floats, in screen pixels. */
const ROTATE_STEM = 24;

const CURSORS: Record<Handle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
};

interface SelectionProps {
  /** The frame the handles go round, in stage units; null when nothing is selected. */
  box: Frame | null;
  /** Which resize handles to offer. A line has only its two ends. */
  handles: readonly Handle[];
  /** The rectangle being dragged out to select with, in stage units. */
  marquee: Rect | null;
  /** Lines the object being dragged has snapped to, in stage units. */
  snapLines: readonly SnapLine[];
  zoom: number;
}

/**
 * The selection outline, its handles and the marquee. Drawn above the stage
 * in screen pixels, so they are the same size at every zoom. Handles carry
 * `data-handle`; the stage's pointer handler looks for it.
 */
export function Selection({ box, handles, marquee, snapLines, zoom }: SelectionProps) {
  const toScreen = (point: Point): Point => ({ x: point.x * zoom, y: point.y * zoom });

  let outline = null;
  if (box) {
    const corners = cornersOf(box).map(toScreen);
    const top = toScreen(handlePoint(box, 'n'));
    // "Up" for this frame, turned with it.
    const up = rotatePoint({ x: 0, y: -ROTATE_STEM }, { x: 0, y: 0 }, box.rotation);
    const knob = { x: top.x + up.x, y: top.y + up.y };
    outline = (
      <g data-testid="selection">
        <polygon
          className="selection-outline"
          points={corners.map((corner) => `${corner.x},${corner.y}`).join(' ')}
        />
        <line className="selection-outline" x1={top.x} y1={top.y} x2={knob.x} y2={knob.y} />
        <circle
          className="selection-handle"
          data-handle="rotate"
          cx={knob.x}
          cy={knob.y}
          r={HANDLE_SIZE / 2 + 0.5}
          style={{ cursor: 'grab' }}
        />
        {(HANDLES.filter((handle) => handles.includes(handle)) as Handle[]).map((handle) => {
          const at = toScreen(handlePoint(box, handle));
          return (
            <rect
              key={handle}
              className="selection-handle"
              data-handle={handle}
              x={at.x - HANDLE_SIZE / 2}
              y={at.y - HANDLE_SIZE / 2}
              width={HANDLE_SIZE}
              height={HANDLE_SIZE}
              style={{ cursor: CURSORS[handle] }}
            />
          );
        })}
      </g>
    );
  }

  return (
    <svg className="stage-overlay" aria-hidden="true">
      {snapLines.map((line, index) =>
        line.axis === 'x' ? (
          <line
            key={`x-${index}`}
            className="snap-line"
            x1={line.at * zoom}
            y1="0"
            x2={line.at * zoom}
            y2="100%"
          />
        ) : (
          <line
            key={`y-${index}`}
            className="snap-line"
            x1="0"
            y1={line.at * zoom}
            x2="100%"
            y2={line.at * zoom}
          />
        ),
      )}
      {outline}
      {marquee && (
        <rect
          className="marquee"
          data-testid="marquee"
          x={marquee.x * zoom}
          y={marquee.y * zoom}
          width={marquee.width * zoom}
          height={marquee.height * zoom}
        />
      )}
    </svg>
  );
}

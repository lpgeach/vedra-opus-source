import { useRef } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import type { PanelName } from '../../shared/settings';

const STEP = 8;
const BIG_STEP = 40;

/** What a divider resizes: a panel, or the lower of the right side's two panels (B17). */
export type SplitterName = PanelName | 'rightSplit';

/** Which way along its axis each panel grows: the left panel grows as the divider moves right, and so on. */
const GROWS: Record<SplitterName, { axis: 'x' | 'y'; sign: 1 | -1; more: string; less: string }> = {
  left: { axis: 'x', sign: 1, more: 'ArrowRight', less: 'ArrowLeft' },
  right: { axis: 'x', sign: -1, more: 'ArrowLeft', less: 'ArrowRight' },
  bottom: { axis: 'y', sign: -1, more: 'ArrowUp', less: 'ArrowDown' },
  rightSplit: { axis: 'y', sign: -1, more: 'ArrowUp', less: 'ArrowDown' },
};

interface SplitterProps {
  panel: SplitterName;
  /** What the divider resizes, for screen readers: "Resize slides panel". */
  label: string;
  size: number;
  min: number;
  max: number;
  /** Asked for on every pointer move or key press; the owner clamps it. */
  onResize: (size: number) => void;
  /** The author has finished: a drag ended or a key was pressed. */
  onCommit: () => void;
}

/**
 * The divider on a panel's inner edge. Drag it, or focus it and use the arrow
 * keys (Shift for bigger steps, Home and End for the limits).
 */
export function Splitter({ panel, label, size, min, max, onResize, onCommit }: SplitterProps) {
  const { axis, sign, more, less } = GROWS[panel];
  const drag = useRef<{ from: number; size: number } | null>(null);
  const position = (event: PointerEvent) => (axis === 'x' ? event.clientX : event.clientY);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { from: position(event), size };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    onResize(drag.current.size + sign * (position(event) - drag.current.from));
  };
  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    onCommit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? BIG_STEP : STEP;
    let wanted: number;
    if (event.key === more) wanted = size + step;
    else if (event.key === less) wanted = size - step;
    else if (event.key === 'Home') wanted = min;
    else if (event.key === 'End') wanted = max;
    else return;
    event.preventDefault();
    onResize(wanted);
    onCommit();
  };

  return (
    <div
      className={`splitter splitter-${axis}`}
      data-testid={`splitter-${panel}`}
      role="separator"
      tabIndex={0}
      aria-label={label}
      // The separator's own orientation is across the axis it moves along.
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-valuenow={size}
      aria-valuemin={min}
      aria-valuemax={max}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onKeyDown={onKeyDown}
    />
  );
}

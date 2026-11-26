/**
 * Panel sizing rules for the editor layout. Pure functions, no DOM: the
 * components measure and draw, this decides what sizes are allowed.
 *
 *   ┌──────┬─┬───────────────┬─┬───────┐
 *   │ left │s│     stage     │s│ right │   s = splitter
 *   │      │ ├───────────────┤ │       │
 *   │      │ │    bottom     │ │       │
 *   └──────┴─┴───────────────┴─┴───────┘
 */
import type { PanelName, PanelState } from '../shared/settings';

export type PanelLayout = Record<PanelName, PanelState>;

export interface Size {
  width: number;
  height: number;
}

/** Smallest useful size of each panel when expanded. */
export const PANEL_MIN: Record<PanelName, number> = { left: 160, right: 200, bottom: 120 };
/** The stage is the point of the window; panels may never squeeze it below this. */
export const STAGE_MIN: Size = { width: 320, height: 200 };
/** Thickness of the strip a collapsed panel leaves behind. */
export const RAIL = 28;
/** Thickness of the draggable divider beside an expanded panel. */
export const SPLITTER = 5;

/** Space a panel takes along its resize axis, divider included. */
function footprint(state: PanelState, size = state.size): number {
  return state.collapsed ? RAIL : size + SPLITTER;
}

/**
 * The largest a panel may be in a workspace of the given size, with the other
 * panels as they are. Never less than the panel's minimum: in a window too
 * small for everything, panels keep their minimum and the stage gives way.
 */
export function maxPanelSize(panel: PanelName, layout: PanelLayout, workspace: Size): number {
  const available =
    panel === 'bottom'
      ? workspace.height - STAGE_MIN.height - SPLITTER
      : workspace.width -
        STAGE_MIN.width -
        SPLITTER -
        footprint(layout[panel === 'left' ? 'right' : 'left']);
  return Math.max(PANEL_MIN[panel], Math.floor(available));
}

/** Smallest useful height of each of the right side's two panels (B17). */
export const RIGHT_PART_MIN = 100;

/**
 * The height to draw the lower right panel at, in a right side `height` tall: as asked, but
 * leaving each of the two panels at least its minimum. Like the panels' sizes, the remembered
 * height is kept and only shrunk for display.
 */
export function clampRightSplit(wanted: number, height: number): number {
  const max = Math.max(RIGHT_PART_MIN, Math.floor(height - RIGHT_PART_MIN - SPLITTER));
  if (!Number.isFinite(wanted)) return Math.min(max, RIGHT_PART_MIN);
  return Math.min(max, Math.max(RIGHT_PART_MIN, Math.round(wanted)));
}

/** The nearest allowed size to the one asked for. */
export function clampPanelSize(
  panel: PanelName,
  wanted: number,
  layout: PanelLayout,
  workspace: Size,
): number {
  const max = maxPanelSize(panel, layout, workspace);
  if (!Number.isFinite(wanted)) return PANEL_MIN[panel];
  return Math.min(max, Math.max(PANEL_MIN[panel], Math.round(wanted)));
}

/**
 * The sizes to draw the panels at. Remembered sizes are kept as the author set
 * them and only shrunk for display, so making the window small and then large
 * again gives the panels back their sizes. The right panel gives way first.
 */
export function fitLayout(layout: PanelLayout, workspace: Size): Record<PanelName, number> {
  const fitted: PanelLayout = {
    left: { ...layout.left },
    right: { ...layout.right },
    bottom: { ...layout.bottom },
  };
  // Size the left panel as if the right one were already at its smallest, then
  // give the right panel whatever that leaves.
  fitted.left.size = clampPanelSize(
    'left',
    layout.left.size,
    { ...fitted, right: { ...fitted.right, size: PANEL_MIN.right } },
    workspace,
  );
  fitted.right.size = clampPanelSize('right', layout.right.size, fitted, workspace);
  fitted.bottom.size = clampPanelSize('bottom', layout.bottom.size, fitted, workspace);
  return { left: fitted.left.size, right: fitted.right.size, bottom: fitted.bottom.size };
}

import { describe, expect, it } from 'vitest';
import type { PanelLayout } from './layout';
import {
  clampPanelSize,
  clampRightSplit,
  RIGHT_PART_MIN,
  fitLayout,
  maxPanelSize,
  PANEL_MIN,
  RAIL,
  SPLITTER,
  STAGE_MIN,
} from './layout';

const layout = (left = 220, right = 280, bottom = 220): PanelLayout => ({
  left: { size: left, collapsed: false },
  right: { size: right, collapsed: false },
  bottom: { size: bottom, collapsed: false },
});
const workspace = { width: 1400, height: 800 };

/** Width left for the stage once both side panels and their dividers are drawn. */
const stageWidth = (sizes: { left: number; right: number }, width: number) =>
  width - sizes.left - sizes.right - 2 * SPLITTER;

describe('clampPanelSize', () => {
  it('leaves a size within the limits alone, rounded to whole pixels', () => {
    expect(clampPanelSize('left', 300.4, layout(), workspace)).toBe(300);
  });

  it('does not go below the panel minimum', () => {
    expect(clampPanelSize('left', 10, layout(), workspace)).toBe(PANEL_MIN.left);
    expect(clampPanelSize('right', -50, layout(), workspace)).toBe(PANEL_MIN.right);
    expect(clampPanelSize('bottom', 0, layout(), workspace)).toBe(PANEL_MIN.bottom);
  });

  it('stops a side panel where the stage would drop below its minimum width', () => {
    const size = clampPanelSize('left', 5000, layout(), workspace);
    expect(stageWidth({ left: size, right: 280 }, workspace.width)).toBe(STAGE_MIN.width);
  });

  it('gives a side panel more room when the opposite panel is collapsed', () => {
    const open = maxPanelSize('left', layout(), workspace);
    const collapsed = layout();
    collapsed.right.collapsed = true;
    expect(maxPanelSize('left', collapsed, workspace)).toBe(open + 280 + SPLITTER - RAIL);
  });

  it('stops the bottom panel where the stage would drop below its minimum height', () => {
    const size = clampPanelSize('bottom', 5000, layout(), workspace);
    expect(workspace.height - size - SPLITTER).toBe(STAGE_MIN.height);
  });

  it('is not affected by the side panels when sizing the bottom panel', () => {
    expect(maxPanelSize('bottom', layout(160, 200), workspace)).toBe(
      maxPanelSize('bottom', layout(600, 600), workspace),
    );
  });

  it('keeps the minimum even when the workspace is too small for it', () => {
    expect(clampPanelSize('left', 400, layout(), { width: 300, height: 100 })).toBe(PANEL_MIN.left);
    expect(clampPanelSize('bottom', 400, layout(), { width: 300, height: 100 })).toBe(
      PANEL_MIN.bottom,
    );
  });

  it('treats a size that is not a number as the minimum', () => {
    expect(clampPanelSize('left', Number.NaN, layout(), workspace)).toBe(PANEL_MIN.left);
  });
});

describe('fitLayout', () => {
  it('draws panels at their remembered sizes when there is room', () => {
    expect(fitLayout(layout(240, 300, 180), workspace)).toEqual({
      left: 240,
      right: 300,
      bottom: 180,
    });
  });

  it('shrinks the right panel before the left when the window narrows', () => {
    const fitted = fitLayout(layout(300, 400), { width: 900, height: 800 });
    expect(fitted.left).toBe(300);
    expect(fitted.right).toBeLessThan(400);
    expect(fitted.right).toBeGreaterThanOrEqual(PANEL_MIN.right);
    expect(stageWidth(fitted, 900)).toBe(STAGE_MIN.width);
  });

  it('shrinks the left panel too once the right is at its minimum', () => {
    const fitted = fitLayout(layout(400, 400), { width: 800, height: 800 });
    expect(fitted.right).toBe(PANEL_MIN.right);
    expect(fitted.left).toBeLessThan(400);
    expect(stageWidth(fitted, 800)).toBe(STAGE_MIN.width);
  });

  it('never squeezes the stage below its minimum in a window the panels fit in', () => {
    for (const width of [960, 1100, 1280, 1920]) {
      for (const height of [500, 600, 900]) {
        const fitted = fitLayout(layout(900, 900, 900), { width, height });
        expect(stageWidth(fitted, width)).toBeGreaterThanOrEqual(STAGE_MIN.width);
        expect(height - fitted.bottom - SPLITTER).toBeGreaterThanOrEqual(STAGE_MIN.height);
      }
    }
  });

  it('does not change the layout it was given', () => {
    const remembered = layout(900, 900, 900);
    fitLayout(remembered, { width: 960, height: 500 });
    expect(remembered).toEqual(layout(900, 900, 900));
  });
});

describe('clampRightSplit (B17)', () => {
  it('keeps the height asked for when both right panels have room', () => {
    expect(clampRightSplit(260, 800)).toBe(260);
    expect(clampRightSplit(260.4, 800)).toBe(260);
  });

  it('leaves each of the two panels at least its minimum', () => {
    expect(clampRightSplit(10, 800)).toBe(RIGHT_PART_MIN);
    expect(clampRightSplit(5000, 800)).toBe(800 - RIGHT_PART_MIN - SPLITTER);
  });

  it('gives the lower panel its minimum in a right side too short for both, and for nonsense', () => {
    expect(clampRightSplit(260, 150)).toBe(RIGHT_PART_MIN);
    expect(clampRightSplit(Number.NaN, 800)).toBe(RIGHT_PART_MIN);
  });
});

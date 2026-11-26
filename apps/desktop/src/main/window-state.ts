import { app, screen } from 'electron';
import type { BrowserWindow, Rectangle } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const stateSchema = z.object({
  bounds: z.object({
    x: z.number().int(),
    y: z.number().int(),
    width: z.number().int().min(400),
    height: z.number().int().min(300),
  }),
  maximized: z.boolean(),
});
export type WindowState = z.infer<typeof stateSchema>;

const DEFAULT_SIZE = { width: 1440, height: 900 };

function stateFile(): string {
  return join(app.getPath('userData'), 'window-state.json');
}

function isOnSomeDisplay(bounds: Rectangle): boolean {
  return screen.getAllDisplays().some(({ workArea }) => {
    const overlapX =
      Math.min(bounds.x + bounds.width, workArea.x + workArea.width) -
      Math.max(bounds.x, workArea.x);
    const overlapY =
      Math.min(bounds.y + bounds.height, workArea.y + workArea.height) -
      Math.max(bounds.y, workArea.y);
    return overlapX > 100 && overlapY > 100;
  });
}

/** Saved window placement, or defaults if there is none or it is off-screen. */
export function loadWindowState(): Partial<Rectangle> & { maximized: boolean } {
  try {
    const state = stateSchema.parse(JSON.parse(readFileSync(stateFile(), 'utf8')));
    if (isOnSomeDisplay(state.bounds)) return { ...state.bounds, maximized: state.maximized };
  } catch {
    // Missing or corrupt state file: fall through to defaults.
  }
  return { ...DEFAULT_SIZE, maximized: false };
}

/** Persist placement whenever the window closes. */
export function trackWindowState(window: BrowserWindow): void {
  window.on('close', () => {
    const state: WindowState = {
      bounds: window.getNormalBounds(),
      maximized: window.isMaximized(),
    };
    try {
      writeFileSync(stateFile(), JSON.stringify(state));
    } catch {
      // Losing window placement is not worth interrupting shutdown for.
    }
  });
}

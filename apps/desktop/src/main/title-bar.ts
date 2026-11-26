/**
 * The window's frame (docs/briefs/B1-title-bar.md): no title bar of its own. Our
 * bar holds the menu, the commands and the title, and the system's own buttons
 * sit at its end: drawn over its right end on Windows and Linux (the window
 * controls overlay), the traffic lights at its left on macOS.
 */
import type { BrowserWindowConstructorOptions } from 'electron';

/** The bar's height, in CSS pixels; the renderer's `.title-bar` is the same. */
export const TITLE_BAR_HEIGHT = 40;

/** The editor's chrome colours (`--chrome` and `--fg` in index.css), for the buttons before the page says. */
const COLOURS = {
  light: { color: '#f7f8fa', symbolColor: '#1d2026' },
  dark: { color: '#1f2227', symbolColor: '#e7e9ee' },
};

/**
 * Whether the system draws the window's buttons over our bar. Not with no screen
 * at all (`--ozone-platform=headless`, how the e2e runs on Linux): there is no
 * frame to draw, and Electron 45 crashes making a window with the overlay there.
 */
export function drawsOverlay(platform: NodeJS.Platform, ozonePlatform: string): boolean {
  return platform === 'darwin' || ozonePlatform !== 'headless';
}

/** The frame options for the main window on `platform`. */
export function windowFrame(
  platform: NodeJS.Platform,
  dark: boolean,
  ozonePlatform = '',
): Pick<
  BrowserWindowConstructorOptions,
  'titleBarStyle' | 'titleBarOverlay' | 'trafficLightPosition'
> {
  if (platform === 'darwin') {
    // The traffic lights in our bar, centred in its height; the overlay's CSS variables say where.
    return {
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 14, y: 13 },
      titleBarOverlay: true,
    };
  }
  if (!drawsOverlay(platform, ozonePlatform)) return { titleBarStyle: 'hidden' };
  return {
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...COLOURS[dark ? 'dark' : 'light'], height: TITLE_BAR_HEIGHT },
  };
}

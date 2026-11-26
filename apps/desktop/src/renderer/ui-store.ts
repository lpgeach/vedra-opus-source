/**
 * How the author has arranged the editor: panel sizes, collapsed panels,
 * active panel tabs and the theme. Loaded from main once at start-up and
 * written back whenever a change is finished (see docs/briefs/P2.1).
 */
import { useSyncExternalStore } from 'react';
import type { PlayerPreset } from '@vedraopus/model';
import { DEFAULT_SETTINGS } from '../shared/settings';
import type {
  BottomTab,
  LeftTab,
  PanelName,
  Settings,
  ThemeChoice,
  ViewSettings,
} from '../shared/settings';

let settings: Settings = DEFAULT_SETTINGS;
const listeners = new Set<() => void>();

function set(next: Settings): void {
  settings = next;
  // The stylesheet picks its colours from this; see the top of index.css.
  document.documentElement.dataset['theme'] = next.theme;
  for (const listener of listeners) listener();
}

function setLayout(changes: Partial<Settings['layout']>): void {
  set({ ...settings, layout: { ...settings.layout, ...changes } });
}

function setViewState(changes: Partial<ViewSettings>): void {
  set({ ...settings, view: { ...settings.view, ...changes } });
}

/** Guides are kept in order and without duplicates, so drawing and lookup are simple. */
function tidyGuides(lines: readonly number[]): number[] {
  return [...new Set(lines)].sort((a, b) => a - b);
}

function persist(): void {
  void window.vedraopus.settings.save(settings);
}

/** Fetch the stored settings. Call once, before the first render. */
export async function loadSettings(): Promise<void> {
  set(await window.vedraopus.settings.load());
}

export const ui = {
  /**
   * Set a panel's size while it is being dragged. Nothing is written to disk
   * until `commitLayout`, so a drag is one write, not hundreds.
   */
  resizePanel(panel: PanelName, size: number): void {
    if (settings.layout[panel].size === size) return;
    setLayout({ [panel]: { ...settings.layout[panel], size } });
  },

  commitLayout: persist,

  setCollapsed(panel: PanelName, collapsed: boolean): void {
    if (settings.layout[panel].collapsed === collapsed) return;
    setLayout({ [panel]: { ...settings.layout[panel], collapsed } });
    persist();
  },

  togglePanel(panel: PanelName): void {
    ui.setCollapsed(panel, !settings.layout[panel].collapsed);
  },

  /** Show a tab of the left panel, opening the panel if it is collapsed. */
  showLeftTab(leftTab: LeftTab): void {
    setLayout({ leftTab, left: { ...settings.layout.left, collapsed: false } });
    persist();
  },

  showBottomTab(bottomTab: BottomTab): void {
    setLayout({ bottomTab, bottom: { ...settings.layout.bottom, collapsed: false } });
    persist();
  },

  resetLayout(): void {
    set({ ...settings, layout: DEFAULT_SETTINGS.layout });
    persist();
  },

  /** Keep a player preset (P8.3), replacing one of the same name. */
  savePlayerPreset(preset: PlayerPreset): void {
    const others = settings.playerPresets.filter((each) => each.name !== preset.name);
    set({ ...settings, playerPresets: [...others, preset].slice(-50) });
    persist();
  },

  deletePlayerPreset(id: string): void {
    set({ ...settings, playerPresets: settings.playerPresets.filter((each) => each.id !== id) });
    persist();
  },

  setTheme(theme: ThemeChoice): void {
    set({ ...settings, theme });
    persist();
  },

  /** Turn rulers, grid, guides or snapping on or off. */
  setView(changes: Partial<ViewSettings>): void {
    setViewState(changes);
    persist();
  },

  /**
   * Show a guide where it is being dragged to. Nothing is written to disk
   * until `commitView`, so one drag is one write, not hundreds.
   */
  previewGuideLine(axis: 'x' | 'y', lines: readonly number[]): void {
    const tidy = tidyGuides(lines);
    setViewState(axis === 'x' ? { guideX: tidy } : { guideY: tidy });
  },

  commitView: persist,
};

export function useSettings(): Settings {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => settings,
  );
}

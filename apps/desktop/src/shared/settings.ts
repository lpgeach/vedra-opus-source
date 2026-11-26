/**
 * Application settings: how the author has arranged the editor, and the
 * theme. They belong to the installation, not to a project, so they live in
 * `settings.json` in the user-data folder and never in a `.vedraopus` file.
 */
import { playerPresetSchema } from '@vedraopus/model';
import type { PlayerPreset } from '@vedraopus/model';
import { z } from 'zod';

export const PANELS = ['left', 'right', 'bottom'] as const;
export type PanelName = (typeof PANELS)[number];

export const LEFT_TABS = ['slides', 'media'] as const;
export type LeftTab = (typeof LEFT_TABS)[number];

export const BOTTOM_TABS = ['timeline', 'states', 'notes', 'captions'] as const;
export type BottomTab = (typeof BOTTOM_TABS)[number];

export const THEMES = ['system', 'light', 'dark'] as const;
export type ThemeChoice = (typeof THEMES)[number];

export interface PanelState {
  /** Width (side panels) or height (bottom panel) in CSS pixels when expanded. */
  size: number;
  collapsed: boolean;
}

/**
 * What the editor shows of objects past the slide's edges (B2): all of them, as
 * the course will not; dimmed to half (the default); or hidden, as in the course.
 */
export const OFF_SLIDE = ['show', 'dim', 'hide'] as const;
export type OffSlide = (typeof OFF_SLIDE)[number];

/**
 * How the stage is drawn: what is on, and where the author put guides. These
 * belong to the installation rather than to one project, so guides are the
 * same in every project (asked and decided in P2.2).
 */
export interface ViewSettings {
  rulers: boolean;
  grid: boolean;
  guides: boolean;
  snap: boolean;
  /** Distance between grid lines, in stage units. */
  gridSize: number;
  /** Vertical guides, by stage x. */
  guideX: number[];
  /** Horizontal guides, by stage y. */
  guideY: number[];
  /** Objects past the slide's edges: shown, dimmed or hidden (B2). */
  offSlide: OffSlide;
}

export interface Settings {
  theme: ThemeChoice;
  layout: Record<PanelName, PanelState> & { leftTab: LeftTab; bottomTab: BottomTab };
  view: ViewSettings;
  /** Saved looks for the course player (P8.3), for any project on this machine. */
  playerPresets: PlayerPreset[];
  /** Keep crash reports on this machine (P11.5): off until the author asks; never uploaded. */
  keepCrashReports: boolean;
  /** Updates (P11.4): checked only when asked, or automatically once the author turns it on. */
  updates: { automatic: boolean; channel: UpdateChannel };
}

export const UPDATE_CHANNELS = ['stable', 'beta'] as const;
export type UpdateChannel = (typeof UPDATE_CHANNELS)[number];

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  layout: {
    left: { size: 220, collapsed: false },
    right: { size: 280, collapsed: false },
    bottom: { size: 220, collapsed: false },
    leftTab: 'slides',
    bottomTab: 'timeline',
  },
  view: {
    rulers: false,
    grid: false,
    guides: true,
    snap: true,
    gridSize: 20,
    guideX: [],
    guideY: [],
    // Dimmed unless the author chooses otherwise (Luke, 2026-11-23).
    offSlide: 'dim',
  },
  playerPresets: [],
  keepCrashReports: false,
  updates: { automatic: false, channel: 'stable' },
};

const panel = z.object({ size: z.number().int().min(0).max(10_000), collapsed: z.boolean() });
const guides = z.array(z.number().finite().min(0).max(100_000));

/** Exact shape, for values crossing IPC: anything else is a bug and is rejected. */
export const settingsSchema: z.ZodType<Settings> = z.object({
  theme: z.enum(THEMES),
  layout: z.object({
    left: panel,
    right: panel,
    bottom: panel,
    leftTab: z.enum(LEFT_TABS),
    bottomTab: z.enum(BOTTOM_TABS),
  }),
  view: z.object({
    rulers: z.boolean(),
    grid: z.boolean(),
    guides: z.boolean(),
    snap: z.boolean(),
    gridSize: z.number().int().min(1).max(1000),
    guideX: guides,
    guideY: guides,
    offSlide: z.enum(OFF_SLIDE),
  }),
  playerPresets: z.array(playerPresetSchema).max(50),
  keepCrashReports: z.boolean(),
  updates: z.object({ automatic: z.boolean(), channel: z.enum(UPDATE_CHANNELS) }),
});

const defaults = DEFAULT_SETTINGS.layout;
const viewDefaults = DEFAULT_SETTINGS.view;
const lenientView = z.object({
  rulers: z.boolean().catch(viewDefaults.rulers),
  grid: z.boolean().catch(viewDefaults.grid),
  guides: z.boolean().catch(viewDefaults.guides),
  snap: z.boolean().catch(viewDefaults.snap),
  gridSize: z.number().int().min(1).max(1000).catch(viewDefaults.gridSize),
  guideX: guides.catch(viewDefaults.guideX),
  guideY: guides.catch(viewDefaults.guideY),
  offSlide: z.enum(OFF_SLIDE).catch(viewDefaults.offSlide),
});
const lenientSchema = z.object({
  theme: z.enum(THEMES).catch(DEFAULT_SETTINGS.theme),
  layout: z
    .object({
      left: panel.catch(defaults.left),
      right: panel.catch(defaults.right),
      bottom: panel.catch(defaults.bottom),
      leftTab: z.enum(LEFT_TABS).catch(defaults.leftTab),
      bottomTab: z.enum(BOTTOM_TABS).catch(defaults.bottomTab),
    })
    .catch(defaults),
  view: lenientView.catch(viewDefaults),
  // Each preset on its own: a damaged one is dropped, and the others kept.
  playerPresets: z
    .array(z.unknown())
    .catch([])
    .transform((list) =>
      list.flatMap((each) => {
        const preset = playerPresetSchema.safeParse(each);
        return preset.success ? [preset.data] : [];
      }),
    )
    .catch([]),
  keepCrashReports: z.boolean().catch(DEFAULT_SETTINGS.keepCrashReports),
  updates: z
    .object({
      automatic: z.boolean().catch(false),
      channel: z.enum(UPDATE_CHANNELS).catch('stable'),
    })
    .catch({ ...DEFAULT_SETTINGS.updates }),
});

/**
 * Read settings from whatever was on disk. A settings file may be missing,
 * hand-edited, damaged, or written by another version, and none of that should
 * stop the app starting: each part that cannot be used falls back to its
 * default on its own, so one bad value does not throw the rest away.
 */
export function parseSettings(raw: unknown): Settings {
  const result = lenientSchema.safeParse(raw);
  return result.success ? result.data : structuredDefaults();
}

function structuredDefaults(): Settings {
  const { left, right, bottom, leftTab, bottomTab } = defaults;
  const { guideX, guideY } = viewDefaults;
  return {
    theme: DEFAULT_SETTINGS.theme,
    layout: { left: { ...left }, right: { ...right }, bottom: { ...bottom }, leftTab, bottomTab },
    view: { ...viewDefaults, guideX: [...guideX], guideY: [...guideY] },
    playerPresets: [],
    keepCrashReports: DEFAULT_SETTINGS.keepCrashReports,
    updates: { ...DEFAULT_SETTINGS.updates },
  };
}

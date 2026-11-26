/**
 * Ready-made themes (docs/briefs/B17-ribbon-and-panels.md): colour-and-font sets of our own,
 * one click on the Design tab. Fonts are the ones course text can use everywhere.
 */
import { DEFAULT_THEME } from '@vedraopus/model';
import type { Theme } from '@vedraopus/model';

export interface ThemePreset {
  name: string;
  theme: Theme;
}

export const THEME_PRESETS: readonly ThemePreset[] = [
  { name: 'Default', theme: DEFAULT_THEME },
  {
    name: 'Harbour',
    theme: {
      colors: {
        background: '#ffffff',
        text: '#14213d',
        accent1: '#1d4e89',
        accent2: '#00a6a6',
        accent3: '#f4a259',
        accent4: '#bc4b51',
        accent5: '#5b8e7d',
        accent6: '#6c757d',
      },
      fonts: { heading: 'Georgia', body: 'Arial' },
    },
  },
  {
    name: 'Meadow',
    theme: {
      colors: {
        background: '#fbfaf5',
        text: '#1f2a1f',
        accent1: '#2e7d32',
        accent2: '#81b29a',
        accent3: '#f2cc8f',
        accent4: '#e07a5f',
        accent5: '#3d405b',
        accent6: '#7a7a7a',
      },
      fonts: { heading: 'Inter', body: 'Inter' },
    },
  },
  {
    name: 'Ember',
    theme: {
      colors: {
        background: '#fffaf5',
        text: '#2b1d16',
        accent1: '#d1495b',
        accent2: '#edae49',
        accent3: '#00798c',
        accent4: '#30638e',
        accent5: '#003d5b',
        accent6: '#6b5e57',
      },
      fonts: { heading: 'Georgia', body: 'Georgia' },
    },
  },
  {
    name: 'Slate',
    theme: {
      colors: {
        background: '#1e2329',
        text: '#f1f3f5',
        accent1: '#4dabf7',
        accent2: '#63e6be',
        accent3: '#ffd43b',
        accent4: '#ff8787',
        accent5: '#b197fc',
        accent6: '#adb5bd',
      },
      fonts: { heading: 'Arial', body: 'Arial' },
    },
  },
];

/** Whether a project's theme is this preset's. */
export function isPreset(theme: Theme, preset: ThemePreset): boolean {
  return (
    Object.entries(preset.theme.colors).every(
      ([slot, color]) => theme.colors[slot as keyof Theme['colors']] === color,
    ) &&
    theme.fonts.heading === preset.theme.fonts.heading &&
    theme.fonts.body === preset.theme.fonts.body
  );
}

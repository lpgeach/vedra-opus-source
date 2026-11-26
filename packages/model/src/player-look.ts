import { createId } from './ids';
import type { PlayerLabels, PlayerLook, PlayerPreset, PlayerSettings } from './schema';

/** How a new course's player looks (P8.3): as courses looked before it. */
export function defaultLook(): PlayerLook {
  return {
    scheme: 'dark',
    accent: '#2f6fed',
    font: 'system',
    controlsAt: 'bottom',
    menuSide: 'left',
  };
}

export function defaultLabels(): PlayerLabels {
  return { language: 'en', words: {} };
}

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** A preset of the player's look (P8.3): never the course's own content. */
export function presetOf(player: PlayerSettings, name: string): PlayerPreset {
  return {
    id: createId('preset'),
    name,
    look: copy(player.look),
    labels: copy(player.labels),
    title: player.title,
    controls: copy(player.controls),
    menu: { show: player.menu.show, navigation: player.menu.navigation },
  };
}

/**
 * The settings `project.setPlayer` needs to give a course a preset: its look,
 * words, controls and menu settings. Menu entries, tabs and the logo are the
 * course's and are left as they are.
 */
export function withPreset(
  player: PlayerSettings,
  preset: PlayerPreset,
): Pick<PlayerSettings, 'look' | 'labels' | 'title' | 'controls' | 'menu'> {
  return {
    look: copy(preset.look),
    labels: copy(preset.labels),
    title: preset.title,
    controls: copy(preset.controls),
    menu: { ...player.menu, show: preset.menu.show, navigation: preset.menu.navigation },
  };
}

/** Relative luminance of a `#rrggbb` colour (WCAG 2). */
function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG 2's contrast ratio of two `#rrggbb` colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** The colours of a player scheme: `player.css` defines the same (a test checks). */
export interface PlayerSchemeColours {
  /** Behind the course. */
  bg: string;
  /** The frame's text. */
  fg: string;
  /** The bar and the footer. */
  chrome: string;
  /** A button or field in the frame. */
  control: string;
  /** A control's edge. */
  border: string;
  /** The menu, the tabs' panels and the accessibility panel. */
  sheetBg: string;
  sheetFg: string;
  /** Links, and the focus ring in sheets. */
  link: string;
}

/** The player's two schemes (P8.3); `auto` uses one or the other (docs/briefs/P10.1-accessibility.md, part C). */
export const PLAYER_SCHEMES: Readonly<Record<'dark' | 'light', Readonly<PlayerSchemeColours>>> = {
  dark: {
    bg: '#1c2024',
    fg: '#f0f0f3',
    chrome: '#11181c',
    control: '#2b3138',
    border: '#6e7780',
    sheetBg: '#262c33',
    sheetFg: '#f0f0f3',
    link: '#8ab4ff',
  },
  light: {
    bg: '#eef1f4',
    fg: '#1c2024',
    chrome: '#ffffff',
    control: '#e4e8ec',
    border: '#808a93',
    sheetBg: '#ffffff',
    sheetFg: '#1c2024',
    link: '#1d4ed8',
  },
};

/** The contrast a focus ring, a pressed control or the current menu entry needs (WCAG 1.4.11). */
export const UI_CONTRAST = 3;

/**
 * The accent as a course shows it in `scheme`: the author's own when it
 * reaches 3:1 against the scheme's background, chrome and sheets; otherwise
 * mixed toward the scheme's text colour, a twentieth at a time, until it does.
 */
export function accentFor(accent: string, scheme: 'dark' | 'light'): string {
  const colours = PLAYER_SCHEMES[scheme];
  const around = [colours.bg, colours.chrome, colours.sheetBg];
  const channels = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  const [from, to] = [channels(accent.toLowerCase()), channels(colours.fg)];
  for (let step = 0; step <= 20; step++) {
    const t = step / 20;
    const shade = `#${from
      .map((value, i) =>
        Math.round(value + (to[i]! - value) * t)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')}`;
    if (around.every((colour) => contrastRatio(shade, colour) >= UI_CONTRAST)) return shade;
  }
  return colours.fg;
}

/**
 * The text colour on `accent` (`#rrggbb`): white when it reaches WCAG AA's
 * 4.5:1 there, else whichever of black and white has more contrast.
 */
export function textOnAccent(accent: string): '#000000' | '#ffffff' {
  const l = luminance(accent);
  // Contrast with white is 1.05 / (l + 0.05); with black, (l + 0.05) / 0.05.
  const white = 1.05 / (l + 0.05);
  const black = (l + 0.05) / 0.05;
  return white >= 4.5 || white >= black ? '#ffffff' : '#000000';
}

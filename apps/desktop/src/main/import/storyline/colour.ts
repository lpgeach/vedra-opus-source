/**
 * Colours in a `.story` file (docs/briefs/B5-storyline-import.md): a slide master's
 * scheme (`clrLst`: dk1, lt1, dk2, lt2, accent1–6, …), and colours written as
 * `srgbClr` or `schemeClr`, adjusted by `shade`, `tint`, `lumMod`, `lumOff` and `alpha`.
 */
import type { Color, Theme, XmlElement } from '@vedraopus/model';

export type Palette = Record<string, string>;

const elementsOf = (element: XmlElement | undefined): XmlElement[] =>
  (element?.children ?? []).filter((child): child is XmlElement => typeof child !== 'string');

const HEX = /^[0-9a-fA-F]{6}$/;

/** A master's scheme, as `#rrggbb` by slot name. */
export function readPalette(clrLst: XmlElement | undefined): Palette {
  const palette: Palette = {};
  for (const slot of elementsOf(clrLst)) {
    const value = elementsOf(slot).find((each) => each.name === 'srgbClr')?.attrs['val'];
    if (value && HEX.test(value)) palette[slot.name] = `#${value.toLowerCase()}`;
  }
  return palette;
}

/** The project's theme colours from a palette: text is dk1, the background lt1. */
export function themeColours(palette: Palette, fallback: Theme['colors']): Theme['colors'] {
  const pick = (slot: string, current: string) => palette[slot] ?? current;
  return {
    background: pick('lt1', fallback.background),
    text: pick('dk1', fallback.text),
    accent1: pick('accent1', fallback.accent1),
    accent2: pick('accent2', fallback.accent2),
    accent3: pick('accent3', fallback.accent3),
    accent4: pick('accent4', fallback.accent4),
    accent5: pick('accent5', fallback.accent5),
    accent6: pick('accent6', fallback.accent6),
  };
}

/** Scheme slots that are theme colours of ours. */
const THEME_SLOTS: Record<string, Exclude<Color, string>['theme']> = {
  dk1: 'text',
  tx1: 'text',
  lt1: 'background',
  bg1: 'background',
  accent1: 'accent1',
  accent2: 'accent2',
  accent3: 'accent3',
  accent4: 'accent4',
  accent5: 'accent5',
  accent6: 'accent6',
};

const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
const toHex = (rgb: number[], alpha = 1) =>
  `#${rgb.map((each) => channel(each).toString(16).padStart(2, '0')).join('')}${
    alpha < 1
      ? channel(alpha * 255)
          .toString(16)
          .padStart(2, '0')
      : ''
  }`;

/**
 * A colour element's colour (`<clr>` or any element holding `srgbClr`/`schemeClr`),
 * or null when it names none. A plain scheme colour that is one of our theme slots
 * stays a theme reference, so it follows the theme.
 */
export function readColour(holder: XmlElement | undefined, palette: Palette): Color | null {
  const inner = elementsOf(holder);
  const base = inner.find((each) => each.name === 'srgbClr' || each.name === 'schemeClr');
  if (!base) return null;
  const value = base.attrs['val'] ?? '';
  const adjustments = [...elementsOf(base), ...inner.filter((each) => each !== base)];
  let hex: string | undefined;
  if (base.name === 'srgbClr') hex = HEX.test(value) ? `#${value.toLowerCase()}` : undefined;
  else {
    if (adjustments.length === 0 && THEME_SLOTS[value]) return { theme: THEME_SLOTS[value]! };
    hex =
      palette[value] ?? palette[{ tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' }[value] ?? ''];
  }
  if (!hex) return null;
  let rgb = [1, 3, 5].map((at) => parseInt(hex!.slice(at, at + 2), 16));
  let alpha = 1;
  for (const each of adjustments) {
    const amount = Number(each.attrs['val'] ?? 100000) / 100000;
    if (!Number.isFinite(amount)) continue;
    switch (each.name) {
      case 'shade':
        rgb = rgb.map((c) => c * amount);
        break;
      case 'tint':
        rgb = rgb.map((c) => c + (255 - c) * (1 - amount));
        break;
      case 'lumMod':
        rgb = rgb.map((c) => c * amount);
        break;
      case 'lumOff':
        rgb = rgb.map((c) => c + 255 * amount);
        break;
      case 'alpha':
        alpha = amount;
        break;
      default:
        break;
    }
  }
  return toHex(rgb, alpha);
}

/**
 * A rich-text span's colour: `#RRGGBB`, or a scheme name with a tint after a comma
 * (`lt1,00`), which is read as the plain scheme colour.
 */
export function readTextColour(value: string | undefined, palette: Palette): Color | null {
  if (!value) return null;
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
  const slot = value.split(',')[0]!.trim();
  if (THEME_SLOTS[slot]) return { theme: THEME_SLOTS[slot]! };
  return palette[slot] ?? null;
}

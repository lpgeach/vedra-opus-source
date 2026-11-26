/**
 * A deck's theme and colours (docs/briefs/P11.1-pptx-import.md): the colour
 * scheme and fonts, and an OOXML colour as one of ours.
 */
import type { Color, Theme, ThemeColorSlot } from '@vedraopus/model';
import { all, attr, elements, localName, numberAttr, one, path } from './xml';
import type { XmlElement } from './xml';

/** The deck's scheme colours by OOXML name (`dk1`, `accent1`, `hlink`…), as `#rrggbb`. */
export type Palette = Record<string, string>;

/** Ours for each OOXML name we have a slot for; the rest become literal colours. */
const SLOTS: Record<string, ThemeColorSlot> = {
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
/** The names a slide may use for the scheme's own. */
const ALIASES: Record<string, string> = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' };

export interface DeckTheme {
  palette: Palette;
  theme: Theme;
}

/** The theme part's colours and Latin fonts, over `fallback` for anything it lacks. */
export function readTheme(themeXml: XmlElement | undefined, fallback: Theme): DeckTheme {
  const palette: Palette = {};
  const scheme = path(themeXml, 'themeElements', 'clrScheme');
  for (const entry of elements(scheme)) {
    const colour = one(entry, 'srgbClr') ?? one(entry, 'sysClr');
    const value = attr(colour, 'val');
    const last = attr(colour, 'lastClr');
    const hex = colour && localName(colour.name) === 'sysClr' ? last : value;
    if (hex && /^[0-9a-fA-F]{6}$/.test(hex))
      palette[localName(entry.name)] = `#${hex.toLowerCase()}`;
  }
  const fonts = path(themeXml, 'themeElements', 'fontScheme');
  const heading = attr(path(fonts, 'majorFont', 'latin'), 'typeface');
  const body = attr(path(fonts, 'minorFont', 'latin'), 'typeface');
  const colors = { ...fallback.colors };
  for (const [name, slot] of Object.entries(SLOTS)) {
    const hex = palette[ALIASES[name] ?? name];
    if (hex && !ALIASES[name]) colors[slot] = hex;
  }
  return {
    palette,
    theme: {
      colors,
      fonts: {
        heading: heading && !heading.startsWith('+') ? heading : fallback.fonts.heading,
        body: body && !body.startsWith('+') ? body : fallback.fonts.body,
      },
    },
  };
}

const channels = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
const toHex = (rgb: number[]) =>
  `#${rgb
    .map((value) =>
      Math.max(0, Math.min(255, Math.round(value)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

/** Lighten or darken by OOXML's `lumMod` and `lumOff` (in thousandths of a per cent), in HSL. */
function adjustLuminance(hex: string, mod: number, off: number): string {
  const [r, g, b] = channels(hex).map((value) => value / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  l = Math.max(0, Math.min(1, l * mod + off));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return toHex([(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255]);
}

/**
 * The colour an OOXML colour element holds (`a:srgbClr`, `a:schemeClr`,
 * `a:sysClr`, `a:prstClr`), as a theme reference where it is one of ours
 * unchanged, else as `#rrggbb` (`#rrggbbaa` with transparency). Null when
 * there is none.
 */
export function readColour(parent: XmlElement | undefined, palette: Palette): Color | null {
  const colour = elements(parent).find((child) =>
    ['srgbClr', 'schemeClr', 'sysClr', 'prstClr', 'scrgbClr', 'hslClr'].includes(
      localName(child.name),
    ),
  );
  if (!colour) return null;
  const kind = localName(colour.name);
  const val = attr(colour, 'val') ?? '';
  let hex: string | undefined;
  let slot: ThemeColorSlot | undefined;
  if (kind === 'srgbClr' && /^[0-9a-fA-F]{6}$/.test(val)) hex = `#${val.toLowerCase()}`;
  else if (kind === 'sysClr') hex = `#${(attr(colour, 'lastClr') ?? '000000').toLowerCase()}`;
  else if (kind === 'prstClr') hex = PRESET_COLOURS[val];
  else if (kind === 'schemeClr') {
    hex = palette[ALIASES[val] ?? val];
    slot = SLOTS[val];
  }
  if (!hex) return null;
  const mods = elements(colour);
  if (mods.length === 0 && slot) return { theme: slot };
  const mod = numberAttr(one(colour, 'lumMod'), 'val', 100_000) / 100_000;
  const off = numberAttr(one(colour, 'lumOff'), 'val', 0) / 100_000;
  let result = mod !== 1 || off !== 0 ? adjustLuminance(hex, mod, off) : hex;
  for (const tint of all(colour, 'tint')) {
    const t = numberAttr(tint, 'val', 100_000) / 100_000;
    result = toHex(channels(result).map((value) => value * t + 255 * (1 - t)));
  }
  for (const shade of all(colour, 'shade')) {
    const t = numberAttr(shade, 'val', 100_000) / 100_000;
    result = toHex(channels(result).map((value) => value * t));
  }
  const alpha = one(colour, 'alpha');
  if (alpha) {
    const a = Math.max(
      0,
      Math.min(255, Math.round((numberAttr(alpha, 'val', 100_000) / 100_000) * 255)),
    );
    result += a.toString(16).padStart(2, '0');
  }
  if (slot && result === hex && !alpha) return { theme: slot };
  return result;
}

/** The handful of preset colour names decks use. */
const PRESET_COLOURS: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  gray: '#808080',
  grey: '#808080',
};

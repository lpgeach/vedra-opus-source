import { describe, expect, it } from 'vitest';
import { accentFor, contrastRatio, defaultLook, PLAYER_SCHEMES, textOnAccent } from './index';

/** The player's own colours (docs/briefs/P10.1-accessibility.md, part C). */

const TEXT = 4.5;
const UI = 3;

describe('contrast', () => {
  it('is WCAG 2’s ratio, either way round', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
    // A known pair: #767676 on white is 4.54.
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });
});

describe('the player’s schemes', () => {
  for (const [name, colours] of Object.entries(PLAYER_SCHEMES)) {
    it(`${name}: text reaches 4.5:1 on everything it sits on`, () => {
      for (const surface of [colours.bg, colours.chrome, colours.control]) {
        expect(contrastRatio(colours.fg, surface)).toBeGreaterThanOrEqual(TEXT);
      }
      expect(contrastRatio(colours.sheetFg, colours.sheetBg)).toBeGreaterThanOrEqual(TEXT);
      expect(contrastRatio(colours.link, colours.sheetBg)).toBeGreaterThanOrEqual(TEXT);
      expect(contrastRatio(colours.link, colours.chrome)).toBeGreaterThanOrEqual(TEXT);
    });

    it(`${name}: control edges and focus rings reach 3:1 where they are drawn`, () => {
      for (const surface of [colours.bg, colours.chrome, colours.sheetBg]) {
        expect(contrastRatio(colours.border, surface)).toBeGreaterThanOrEqual(UI);
      }
      // The ring in sheets is the link colour.
      expect(contrastRatio(colours.link, colours.sheetBg)).toBeGreaterThanOrEqual(UI);
    });
  }

  it('keeps the default accent as it is, in both schemes', () => {
    const { accent } = defaultLook();
    expect(accentFor(accent, 'dark')).toBe(accent);
    expect(accentFor(accent, 'light')).toBe(accent);
  });
});

describe('the accent as a course shows it', () => {
  // Every 51st value of each channel: 216 accents, from black to white.
  const sweep: string[] = [];
  for (const r of [0, 51, 102, 153, 204, 255]) {
    for (const g of [0, 51, 102, 153, 204, 255]) {
      for (const b of [0, 51, 102, 153, 204, 255]) {
        sweep.push(`#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`);
      }
    }
  }

  it('reaches 3:1 against the background, chrome and sheets, with 4.5:1 text on it', () => {
    for (const scheme of ['dark', 'light'] as const) {
      const colours = PLAYER_SCHEMES[scheme];
      for (const accent of sweep) {
        const shown = accentFor(accent, scheme);
        for (const surface of [colours.bg, colours.chrome, colours.sheetBg]) {
          expect(contrastRatio(shown, surface), `${accent} in ${scheme}`).toBeGreaterThanOrEqual(
            UI,
          );
        }
        expect(contrastRatio(textOnAccent(shown), shown)).toBeGreaterThanOrEqual(TEXT);
      }
    }
  });

  it('keeps an accent that is strong enough, and strengthens a faint one toward the text colour', () => {
    // Pale yellow is lost on the light scheme and kept on the dark one.
    expect(accentFor('#ffee88', 'dark')).toBe('#ffee88');
    const light = accentFor('#ffee88', 'light');
    expect(light).not.toBe('#ffee88');
    // Darker than the author's, so nearer the light scheme's text colour.
    expect(contrastRatio(light, PLAYER_SCHEMES.light.fg)).toBeLessThan(
      contrastRatio('#ffee88', PLAYER_SCHEMES.light.fg),
    );
    // Upper case is the same colour.
    expect(accentFor('#FFEE88', 'dark')).toBe('#ffee88');
  });
});

import { accentFor, isRightToLeft, textOnAccent } from '@vedraopus/model';
import type { Project } from '@vedraopus/model';

/**
 * Give a player element the course's look (docs/briefs/P8.3-player-appearance.md):
 * the scheme, where the controls and menu go, the accent and its text colour,
 * the font, and the course's language. The stylesheet does the rest.
 *
 * The accent is set once for each scheme, as `accentFor` shows it there
 * (docs/briefs/P10.1-accessibility.md, part C), and the stylesheet picks the
 * one for the scheme in use, so `auto` follows the learner's system.
 */
export function applyLook(element: HTMLElement, project: Project): void {
  const { look, labels } = project.player;
  element.dataset['scheme'] = look.scheme;
  element.dataset['controls'] = look.controlsAt;
  element.dataset['menuSide'] = look.menuSide;
  for (const scheme of ['dark', 'light'] as const) {
    const accent = accentFor(look.accent, scheme);
    element.style.setProperty(`--vo-accent-${scheme}`, accent);
    element.style.setProperty(`--vo-accent-text-${scheme}`, textOnAccent(accent));
  }
  element.style.setProperty('--vo-font', fontStack(project));
  element.lang = labels.language;
  // A right-to-left language runs the frame right to left (P10.3, part C); the slide is not mirrored.
  element.dir = isRightToLeft(labels.language) ? 'rtl' : 'ltr';
}

/** The CSS font list for the frame: the theme's font first, if chosen, then the system's. */
export function fontStack(project: Project): string {
  const { font } = project.player.look;
  const system = 'system-ui, sans-serif';
  if (font === 'system') return system;
  const name = project.theme.fonts[font].replace(/["\\]/g, '');
  return `"${name}", ${system}`;
}

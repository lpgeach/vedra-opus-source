/**
 * The editor's words (docs/briefs/P10.4-ui-strings.md): one catalogue of keys
 * to English, read with `t()`, by the application menu in main and by the
 * renderer alike. Plain TypeScript: no Node, no DOM.
 *
 * New or changed editor text goes through `t()` (docs/development.md,
 * "Adding words to the editor"). The course's own words are not here: they
 * are the player's (`labelText` in the model).
 */
import { en } from './en';

export { en };
export type StringKey = keyof typeof en;
export type Catalogue = Partial<Record<StringKey, string>>;

/** The pseudo-locale, made from English, that shows what is not in the catalogue yet. */
export const PSEUDO_LOCALE = 'qps-ploc';

const ACCENTS: Record<string, string> = {
  a: 'ä',
  e: 'é',
  i: 'ï',
  o: 'ö',
  u: 'ü',
  A: 'Ä',
  E: 'É',
  I: 'Ï',
  O: 'Ö',
  U: 'Ü',
};

/**
 * Pseudo-localised words: accented vowels, a third longer, inside ⟦…⟧.
 * Placeholders (`{name}`) and a menu's access-key `&` are left as they are.
 */
export function pseudo(words: string): string {
  const parts = words.split(/(\{\w+\}|&&|&)/);
  const accented = parts
    .map((part, index) =>
      index % 2 === 1 ? part : part.replace(/[aeiouAEIOU]/g, (c) => ACCENTS[c]!),
    )
    .join('');
  const plain = words.replace(/\{\w+\}|&/g, '');
  const padding = ' ·'.repeat(Math.max(1, Math.round(plain.length / 6)));
  return `⟦${accented}${padding}⟧`;
}

const catalogues: Record<string, Catalogue> = { en };

let current = 'en';

/** The language the editor's words are in. */
export function locale(): string {
  return current;
}

/** Use this language; one without a catalogue falls back to English. */
export function setLocale(tag: string): void {
  current = tag;
}

/** The words for `key` in the current language, with `{name}` filled from `values`. */
export function t(key: StringKey, values: Readonly<Record<string, string | number>> = {}): string {
  const english = en[key];
  const words =
    current === PSEUDO_LOCALE ? pseudo(english) : (catalogues[current]?.[key] ?? english);
  return words.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

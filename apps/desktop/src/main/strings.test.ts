import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { en, locale, pseudo, PSEUDO_LOCALE, setLocale, t } from '../shared/strings';
import type { StringKey } from '../shared/strings';

/** The editor's string catalogue (docs/briefs/P10.4-ui-strings.md). */

afterEach(() => setLocale('en'));

/** Every .ts and .tsx file under the desktop sources, tests left out. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('the catalogue', () => {
  it('gives English, filling placeholders, and falls back to English for a language it lacks', () => {
    expect(locale()).toBe('en');
    expect(t('menu.file.save')).toBe('Save');
    expect(t('welcome.version', { version: '1.2.0', platform: 'linux' })).toBe(
      'Version 1.2.0 · linux',
    );
    // A placeholder with no value is left to show.
    expect(t('welcome.version', { version: '1' })).toBe('Version 1 · {platform}');
    setLocale('fr');
    expect(t('menu.file.save')).toBe('Save');
  });

  it('makes pseudo words: wrapped, accented, longer, with placeholders and access keys kept', () => {
    expect(pseudo('Save')).toBe('⟦Sävé ·⟧');
    expect(pseudo('&File')).toBe('⟦&Fïlé ·⟧');
    const long = pseudo('Version {version} · {platform}');
    expect(long.startsWith('⟦Vérsïön {version} · {platform}')).toBe(true);
    expect(long.length).toBeGreaterThan('Version {version} · {platform}'.length);
    setLocale(PSEUDO_LOCALE);
    expect(t('welcome.version', { version: '2', platform: 'win32' })).toMatch(
      /^⟦Vérsïön 2 · win32 ·+/,
    );
  });

  it('has every key the sources use, and uses every key it has', () => {
    const root = join(import.meta.dirname, '..');
    const used = new Set<string>();
    const prefixes: string[] = [];
    for (const file of sources(root)) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/\bt\(\s*'([\w.]+)'/g)) used.add(match[1]!);
      // A key made from a template, such as `ribbon.tab.${id}`: its fixed start.
      for (const match of text.matchAll(/\bt\(\s*`([\w.]+)\$\{/g)) prefixes.push(match[1]!);
    }
    const keys = Object.keys(en) as StringKey[];
    expect(
      [...used].filter((key) => !(key in en)),
      'keys used but not in the catalogue',
    ).toEqual([]);
    expect(
      keys.filter((key) => !used.has(key) && !prefixes.some((prefix) => key.startsWith(prefix))),
      'keys in the catalogue that nothing uses',
    ).toEqual([]);
  });
});

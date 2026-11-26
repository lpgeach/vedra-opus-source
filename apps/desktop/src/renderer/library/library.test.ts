import { createGraphicObject, sceneObjectSchema } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import lucideLicence from '../../../resources/licences/lucide.txt?raw';
import doodlesLicence from '../../../resources/licences/open-doodles.txt?raw';
import { parseLibrary, searchLibrary } from './library';
import lucideText from './lucide.json?raw';
import doodlesText from './open-doodles.json?raw';

/** The icons and illustrations library (docs/briefs/P9.8-icons-library.md). */

const icons = parseLibrary(lucideText);
const illustrations = parseLibrary(doodlesText);

describe('the library', () => {
  it('holds Lucide’s icons and the Open Doodles, each with a name and a drawing', () => {
    expect(icons).toHaveLength(2098);
    expect(illustrations).toHaveLength(33);
    for (const item of [...icons, ...illustrations]) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.nodes.length).toBeGreaterThan(0);
    }
    expect(new Set(icons.map((item) => item.key)).size).toBe(icons.length);
    expect(icons[0]).toMatchObject({ library: 'lucide', strokeWidth: 2, viewBox: { width: 24 } });
    expect(illustrations[0]).toMatchObject({ library: 'openDoodles', strokeWidth: null });
  });

  it('makes graphics the saved format accepts, every one', () => {
    const refused: string[] = [];
    for (const item of [...icons, ...illustrations]) {
      if (!sceneObjectSchema.safeParse(createGraphicObject(item)).success) refused.push(item.key);
    }
    expect(refused).toEqual([]);
  });

  it('finds by the start of a name’s words, then by tags; every word must match', () => {
    const heart = searchLibrary(icons, 'heart');
    expect(heart[0]!.key).toBe('heart');
    expect(heart.map((item) => item.key)).toContain('heart-crack');
    // "love" is one of the heart's tags, not its name.
    expect(searchLibrary(icons, 'love').map((item) => item.key)).toContain('heart');
    // Both words must match: "arrow" alone is not enough.
    const both = searchLibrary(icons, 'arrow down');
    expect(both[0]!.key).toBe('arrow-down');
    expect(both.map((item) => item.key)).not.toContain('arrow-up');
    expect(searchLibrary(icons, 'zzzz-nothing')).toEqual([]);
    expect(searchLibrary(illustrations, 'read').map((item) => item.key)).toEqual([
      'reading',
      'reading-side',
      'sitting-reading',
    ]);
    expect(searchLibrary(illustrations, '  ')).toHaveLength(33);
  });

  it('ships both licences', () => {
    expect(lucideLicence).toMatch(/ISC License/);
    expect(doodlesLicence).toMatch(/CC0 1\.0/);
  });
});

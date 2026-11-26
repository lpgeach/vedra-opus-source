import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNotices } from './notices';

/** The library's licence notices that published courses carry (P9.8, Luke, session 76). */

describe('readNotices', () => {
  it('reads both notices from the first folder that has them', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'vo-notices-'));
    const found = mkdtempSync(join(tmpdir(), 'vo-notices-'));
    writeFileSync(join(found, 'lucide.txt'), 'LUCIDE');
    writeFileSync(join(found, 'open-doodles.txt'), 'DOODLES');
    expect(await readNotices([undefined, empty, found])).toEqual({
      lucide: 'LUCIDE',
      openDoodles: 'DOODLES',
    });
    expect(await readNotices([empty])).toEqual({});
  });

  it('finds the repository’s own notices, as development does', async () => {
    const notices = await readNotices([resolve(import.meta.dirname, '../../resources/licences')]);
    expect(notices.lucide).toMatch(/ISC License/);
    expect(notices.openDoodles).toMatch(/CC0 1\.0/);
  });
});

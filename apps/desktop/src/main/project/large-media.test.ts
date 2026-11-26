import { closeSync, ftruncateSync, mkdtempSync, openSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { importAsset } from './assets';
import { assetPath } from './paths';

/** Large media (docs/briefs/P11.5-hardening.md, part B): imported as streams, never held whole. */

const temp = mkdtempSync(join(tmpdir(), 'vo-large-media-test-'));
afterAll(() => rmSync(temp, { recursive: true, force: true }));

const SIZE = 512 * 1024 * 1024;

describe('a large file', () => {
  it('is hashed and copied in as streams: memory grows by far less than its size', async () => {
    // Half a gigabyte, made without writing it (sparse where the system allows).
    const file = join(temp, 'handbook.pdf');
    const fd = openSync(file, 'w');
    ftruncateSync(fd, SIZE);
    closeSync(fd);

    const before = process.memoryUsage().rss;
    let peak = before;
    const watch = setInterval(() => {
      peak = Math.max(peak, process.memoryUsage().rss);
    }, 20);
    try {
      const { hash, meta } = await importAsset(join(temp, 'ws'), file, undefined, 'resource');
      expect(meta.byteLength).toBe(SIZE);
      expect(statSync(assetPath(join(temp, 'ws'), hash, 'pdf')).size).toBe(SIZE);
    } finally {
      clearInterval(watch);
    }
    // Streams hold a few chunks at a time; holding the file would add 512 MB.
    expect(peak - before).toBeLessThan(128 * 1024 * 1024);
  }, 120_000);
});

import { rename as fsRename } from 'node:fs/promises';

/**
 * Rename, retrying while Windows briefly refuses (docs/briefs/B10-rename-retries.md).
 *
 * Antivirus and the search indexer open new files for a moment to look at them; a rename of
 * such a file, or of a folder holding one, fails with EPERM, EACCES or EBUSY meanwhile. Each
 * retry waits a little longer, about four seconds in all. Any other error, or a refusal that
 * lasts, is thrown as it was.
 */
const BUSY = new Set(['EPERM', 'EACCES', 'EBUSY']);
const WAITS_MS = [50, 100, 200, 400, 800, 1200, 1500];

export async function renameWithRetry(
  from: string,
  to: string,
  rename: (from: string, to: string) => Promise<void> = fsRename,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((done) => setTimeout(done, ms)),
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? '';
      if (!BUSY.has(code) || attempt >= WAITS_MS.length) throw error;
      await wait(WAITS_MS[attempt]!);
    }
  }
}

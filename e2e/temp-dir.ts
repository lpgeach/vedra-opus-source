import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * One temporary folder per test run, removed when the run ends (pitfall #37).
 * Tests make their folders with `os.tmpdir()`, and the apps and browsers they
 * launch inherit the environment, so pointing TMPDIR (and Windows's TMP and
 * TEMP) here before any worker starts keeps every leftover inside it.
 * Without this, a full e2e run left about 1.3 GB in a 3.9 GB /tmp.
 */
const KEY = 'VEDRAOPUS_TEST_RUN_DIR';

export function globalSetup(): void {
  const dir = mkdtempSync(join(tmpdir(), 'vedraopus-test-run-'));
  process.env[KEY] = dir;
  for (const name of ['TMPDIR', 'TMP', 'TEMP']) process.env[name] = dir;
}

export function globalTeardown(): void {
  const dir = process.env[KEY];
  if (dir) rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
}

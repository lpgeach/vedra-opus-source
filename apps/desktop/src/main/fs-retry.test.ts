import { describe, expect, it } from 'vitest';
import { renameWithRetry } from './fs-retry';

/** A rename that fails with `codes`, one per call, then succeeds. */
function flaky(...codes: string[]) {
  const calls: string[] = [];
  const rename = async (from: string, to: string) => {
    calls.push(`${from}->${to}`);
    const code = codes.shift();
    if (code) throw Object.assign(new Error(code), { code });
  };
  return { rename, calls };
}
const waited: number[] = [];
const wait = async (ms: number) => {
  waited.push(ms);
};

describe('renameWithRetry (B10)', () => {
  it('retries while Windows refuses with EPERM, EACCES or EBUSY, then succeeds', async () => {
    waited.length = 0;
    const { rename, calls } = flaky('EPERM', 'EBUSY', 'EACCES');
    await renameWithRetry('a', 'b', rename, wait);
    expect(calls).toHaveLength(4);
    expect(waited).toEqual([50, 100, 200]);
  });

  it('throws any other error at once', async () => {
    waited.length = 0;
    const { rename, calls } = flaky('ENOENT');
    await expect(renameWithRetry('a', 'b', rename, wait)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(calls).toHaveLength(1);
    expect(waited).toEqual([]);
  });

  it('gives up after about four seconds of refusals, with the last error', async () => {
    waited.length = 0;
    const { rename, calls } = flaky(...Array.from({ length: 20 }, () => 'EPERM'));
    await expect(renameWithRetry('a', 'b', rename, wait)).rejects.toMatchObject({ code: 'EPERM' });
    // Eight tries: the first, and seven retries after waits that add up to 4.25 s.
    expect(calls).toHaveLength(8);
    expect(waited.reduce((sum, ms) => sum + ms, 0)).toBe(4250);
  });
});

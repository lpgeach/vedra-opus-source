import { describe, expect, it, vi } from 'vitest';
import { isNewer, Updates } from './updates';
import type { Updater, UpdatesOptions } from './updates';

/** Updates (docs/briefs/P11.4-signing-and-updates.md, part B), with a fake updater. */

function fake(latest: string | null, fails = false) {
  const updater: Updater & { checks: number; downloads: number; installs: number } = {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowPrerelease: true,
    allowDowngrade: true,
    checks: 0,
    downloads: 0,
    installs: 0,
    checkForUpdates() {
      this.checks += 1;
      if (fails) return Promise.reject(new Error('The feed could not be reached.'));
      return Promise.resolve(latest ? { updateInfo: { version: latest } } : null);
    },
    downloadUpdate() {
      this.downloads += 1;
      return Promise.resolve();
    },
    quitAndInstall() {
      this.installs += 1;
    },
  };
  return updater;
}

function make(
  updater: Updater,
  answers: number[],
  overrides: Partial<UpdatesOptions> = {},
): { updates: Updates; asked: string[]; opened: number } {
  const asked: string[] = [];
  const result = { updates: undefined as unknown as Updates, asked, opened: 0 };
  result.updates = new Updates({
    updater,
    version: '1.2.0',
    active: true,
    manualOnly: false,
    settings: () => ({ automatic: false, channel: 'stable' }),
    ask: (message) => {
      asked.push(message);
      return Promise.resolve(answers.shift() ?? 1);
    },
    openDownloads: () => {
      result.opened += 1;
    },
    ...overrides,
  });
  return result;
}

describe('versions', () => {
  it('compare by their numbers, a release above its prereleases', () => {
    expect(isNewer('1.10.0', '1.9.3')).toBe(true);
    expect(isNewer('1.2.0', '1.2.0')).toBe(false);
    expect(isNewer('1.1.9', '1.2.0')).toBe(false);
    expect(isNewer('v2.0.0', '1.9.9')).toBe(true);
    expect(isNewer('1.3.0', '1.3.0-beta.2')).toBe(true);
    expect(isNewer('1.3.0-beta.3', '1.3.0-beta.2')).toBe(true);
    expect(isNewer('1.3.0-beta.1', '1.3.0')).toBe(false);
  });
});

describe('an update check', () => {
  it('downloads and installs nothing unasked', () => {
    const updater = fake('2.0.0');
    make(updater, []);
    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(updater.allowDowngrade).toBe(false);
  });

  it('in a development build checks nothing, and says why when asked', async () => {
    const updater = fake('2.0.0');
    const { updates, asked } = make(updater, [0], { active: false });
    expect(await updates.check(true)).toBe('inactive');
    expect(await updates.check(false)).toBe('inactive');
    expect(updater.checks).toBe(0);
    expect(asked).toEqual(['Updates are checked in installed copies of Vedra Opus.']);
  });

  it('when asked, says it is up to date; automatically, says nothing', async () => {
    const asked = make(fake('1.2.0'), [0]);
    expect(await asked.updates.check(true)).toBe('none');
    expect(asked.asked).toEqual(['Vedra Opus is up to date.']);
    const quiet = make(fake('1.2.0'), []);
    expect(await quiet.updates.check(false)).toBe('none');
    expect(quiet.asked).toEqual([]);
  });

  it('offers a newer version; Later leaves it', async () => {
    const updater = fake('1.3.0');
    const { updates, asked } = make(updater, [1]);
    expect(await updates.check(false)).toBe('declined');
    expect(asked).toEqual(['Vedra Opus 1.3.0 is available.']);
    expect(updater.downloads).toBe(0);
  });

  it('downloads when chosen, then installs now or on quitting', async () => {
    const now = fake('1.3.0');
    const first = make(now, [0, 0]);
    expect(await first.updates.check(true)).toBe('installing');
    expect([now.downloads, now.installs]).toEqual([1, 1]);

    const later = fake('1.3.0');
    const second = make(later, [0, 1]);
    expect(await second.updates.check(true)).toBe('downloaded');
    expect([later.downloads, later.installs, later.autoInstallOnAppQuit]).toEqual([1, 0, true]);
  });

  it('on the Beta channel accepts prereleases; on Stable it does not', async () => {
    const updater = fake(null);
    const channel = { value: 'beta' as 'beta' | 'stable' };
    const { updates } = make(updater, [], {
      settings: () => ({ automatic: false, channel: channel.value }),
    });
    await updates.check(false);
    expect(updater.allowPrerelease).toBe(true);
    channel.value = 'stable';
    await updates.check(false);
    expect(updater.allowPrerelease).toBe(false);
  });

  it('tells a deb install where to download, instead of updating itself', async () => {
    const updater = fake('1.3.0');
    const result = make(updater, [0], { manualOnly: true });
    expect(await result.updates.check(true)).toBe('manual');
    expect(result.opened).toBe(1);
    expect(updater.downloads).toBe(0);
  });

  it('says when the check failed, only when asked', async () => {
    const asked = make(fake(null, true), [0]);
    expect(await asked.updates.check(true)).toBe('failed');
    expect(asked.asked).toEqual(['Vedra Opus could not check for updates.']);
    const quiet = make(fake(null, true), []);
    expect(await quiet.updates.check(false)).toBe('failed');
    expect(quiet.asked).toEqual([]);
  });

  it('checks automatically only when turned on: at start, then daily', () => {
    const updater = fake(null);
    const on = { value: false };
    const { updates } = make(updater, [], {
      settings: () => ({ automatic: on.value, channel: 'stable' }),
    });
    const schedule = vi.fn();
    updates.startAutomatic(schedule);
    expect(updater.checks).toBe(0);
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 24 * 60 * 60 * 1000);
    on.value = true;
    (schedule.mock.calls[0]![0] as () => void)();
    expect(updater.checks).toBe(1);
  });
});

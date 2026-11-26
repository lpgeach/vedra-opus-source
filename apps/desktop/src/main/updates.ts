/**
 * Updates (docs/briefs/P11.4-signing-and-updates.md, part B): checked only
 * when the author asks, or automatically once they turn that on; never in a
 * development build. Off by default because a check contacts a server, and
 * Vedra Opus sends nothing anywhere unless the author asks.
 */
import type { UpdateChannel } from '../shared/settings';
import { t } from '../shared/strings';

/** The part of electron-updater's `autoUpdater` this uses, so tests can give a fake. */
export interface Updater {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  allowDowngrade: boolean;
  checkForUpdates(): Promise<{
    updateInfo: { version: string };
    isUpdateAvailable?: boolean;
  } | null>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(): void;
}

/** What the author is asked or told: the index of the button they chose. */
export type Ask = (message: string, detail: string, buttons: string[]) => Promise<number>;

export interface UpdatesOptions {
  updater: Updater;
  /** The running version, as in `app.getVersion()`. */
  version: string;
  /** False for a development build (not packaged) with no test feed: nothing is checked. */
  active: boolean;
  /** A Linux install that cannot update itself (a deb): told where to download instead. */
  manualOnly: boolean;
  settings(): { automatic: boolean; channel: UpdateChannel };
  ask: Ask;
  openDownloads(): void;
}

/** Newer by the numbers: 1.10.0 is newer than 1.9.3. Prerelease tags count as older than the release. */
export function isNewer(candidate: string, current: string): boolean {
  const parse = (version: string) => {
    const [main = '', pre] = version.replace(/^v/, '').split('-', 2);
    return { parts: main.split('.').map((part) => Number(part) || 0), pre: pre ?? null };
  };
  const a = parse(candidate);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.parts.length, b.parts.length); i++) {
    const diff = (a.parts[i] ?? 0) - (b.parts[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  if (a.pre === b.pre) return false;
  if (a.pre === null) return true;
  if (b.pre === null) return false;
  return a.pre > b.pre;
}

export class Updates {
  private checking = false;

  constructor(private readonly options: UpdatesOptions) {
    const { updater } = options;
    // The author decides each step: nothing is downloaded or installed unasked.
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowDowngrade = false;
  }

  /**
   * Check once. `asked` is true when the author chose Check for Updates…:
   * then they are told the outcome either way; an automatic check speaks only
   * when there is an update. Returns what happened, for tests and the log.
   */
  async check(
    asked: boolean,
  ): Promise<'inactive' | 'none' | 'declined' | 'downloaded' | 'installing' | 'manual' | 'failed'> {
    const { updater, ask, version } = this.options;
    if (!this.options.active) {
      if (asked) {
        await ask(t('updates.inactive'), t('updates.inactiveDetail'), [t('dialog.ok')]);
      }
      return 'inactive';
    }
    if (this.checking) return 'none';
    this.checking = true;
    try {
      updater.allowPrerelease = this.options.settings().channel === 'beta';
      let found: Awaited<ReturnType<Updater['checkForUpdates']>>;
      try {
        found = await updater.checkForUpdates();
      } catch (error) {
        if (asked) {
          await ask(t('updates.failed'), error instanceof Error ? error.message : String(error), [
            t('dialog.ok'),
          ]);
        }
        return 'failed';
      }
      const latest = found?.updateInfo.version;
      if (!latest || !isNewer(latest, version)) {
        if (asked) {
          await ask(t('updates.upToDate'), t('updates.version', { version }), [t('dialog.ok')]);
        }
        return 'none';
      }
      if (this.options.manualOnly) {
        const open = await ask(
          t('updates.available', { version: latest }),
          t('updates.manualDetail', { version }),
          [t('updates.openDownloads'), t('updates.later')],
        );
        if (open === 0) this.options.openDownloads();
        return 'manual';
      }
      const download = await ask(
        t('updates.available', { version: latest }),
        t('updates.downloadDetail', { version }),
        [t('updates.download'), t('updates.later')],
      );
      if (download !== 0) return 'declined';
      await updater.downloadUpdate();
      const now = await ask(t('updates.ready', { version: latest }), t('updates.readyDetail'), [
        t('updates.restartNow'),
        t('updates.whenIQuit'),
      ]);
      if (now === 0) {
        updater.quitAndInstall();
        return 'installing';
      }
      updater.autoInstallOnAppQuit = true;
      return 'downloaded';
    } finally {
      this.checking = false;
    }
  }

  /** At start, and then each day, if the author turned automatic checks on. */
  startAutomatic(schedule: (run: () => void, everyMs: number) => void): void {
    const run = () => {
      if (this.options.settings().automatic) void this.check(false);
    };
    run();
    schedule(run, 24 * 60 * 60 * 1000);
  }
}

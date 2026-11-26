import { nativeTheme } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseSettings } from '../shared/settings';
import type { Settings } from '../shared/settings';

/**
 * Application settings on disk. Reads never fail: a missing or damaged file
 * gives defaults. Writes are small and synchronous, so a setting changed just
 * before the window closes is not lost.
 */
export class SettingsStore {
  private settings: Settings;

  constructor(private readonly file: string) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      // No settings yet, or an unreadable file: start from defaults.
    }
    this.settings = parseSettings(raw);
    this.applyTheme();
  }

  get current(): Settings {
    return this.settings;
  }

  save(settings: Settings): void {
    this.settings = settings;
    this.applyTheme();
    try {
      writeFileSync(this.file, JSON.stringify(settings, null, 2));
    } catch (error) {
      // The arrangement still applies for this run; it just will not be remembered.
      console.error('Could not write settings:', error);
    }
  }

  /** Native menus and dialogs follow this. The page applies the same choice itself (ui-store). */
  private applyTheme(): void {
    nativeTheme.themeSource = this.settings.theme;
  }
}

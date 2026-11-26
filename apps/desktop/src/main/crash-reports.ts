/**
 * Crash reports (docs/briefs/P11.5-hardening.md, part C): kept on this
 * machine when the author asks for them, and never sent anywhere. Whether to
 * send them to a server is Luke's decision.
 */
import { app, crashReporter } from 'electron';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSettings } from '../shared/settings';

/** Whether the author asked for crash reports, read from settings before the app is ready. */
export function keepCrashReportsSetting(): boolean {
  try {
    const raw: unknown = JSON.parse(
      readFileSync(join(app.getPath('userData'), 'settings.json'), 'utf8'),
    );
    return parseSettings(raw).keepCrashReports;
  } catch {
    return false;
  }
}

/** Start keeping crash reports, if asked: written to the crash folder, uploaded nowhere. */
export function startCrashReports(keep: boolean): boolean {
  if (!keep) return false;
  crashReporter.start({ productName: 'Vedra Opus', uploadToServer: false, compress: true });
  return true;
}

/** Where crash reports are written. */
export const crashReportsFolder = () => app.getPath('crashDumps');

/**
 * Help → Send Feedback… (B6): opens the feedback site in the author's browser with the app's
 * version and the computer filled in. The app itself sends nothing; the author chooses what
 * to send from the page. The site's code is in the separate `lpgeach/vedra-opus-feedback`
 * repository.
 */

export const FEEDBACK_URL = 'https://vedra-opus-feedback.vercel.app/';

/** Luke's Ko-fi page, for Donate in the title bar and Help → Donate… (B9). */
export const DONATE_URL = 'https://ko-fi.com/lukegeach';

/**
 * The computer, as the form's "Computer" field shows it. `systemVersion` is Electron's
 * `process.getSystemVersion()`: "10.0.26100" on Windows, "15.2.0" on macOS.
 */
export function describeSystem(platform: NodeJS.Platform, systemVersion: string): string {
  if (platform === 'win32') {
    // Windows 11 still reports 10.0; its builds start at 22000.
    const build = Number(systemVersion.split('.')[2]);
    if (!Number.isFinite(build)) return 'Windows';
    return build >= 22000 ? 'Windows 11' : 'Windows 10';
  }
  if (platform === 'darwin') return systemVersion ? `macOS ${systemVersion}` : 'macOS';
  if (platform === 'linux') return 'Linux';
  return platform;
}

export function feedbackUrl(version: string, system: string): string {
  const url = new URL(FEEDBACK_URL);
  url.searchParams.set('v', version);
  url.searchParams.set('os', system);
  return url.toString();
}

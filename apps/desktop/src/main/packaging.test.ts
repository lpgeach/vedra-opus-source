import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Signing-ready packaging (docs/briefs/P11.4-signing-and-updates.md, part A):
 * the builder config signs when the certificate variables are set, and holds
 * no secret itself. Read as text: the file is small and its shape is fixed.
 */

const desktop = resolve(import.meta.dirname, '../..');
const config = readFileSync(resolve(desktop, 'electron-builder.yml'), 'utf8');

describe('the builder config', () => {
  it('signs Windows builds with SHA-256 only, with a timestamp for real releases', () => {
    expect(config).toMatch(/signtoolOptions:\s*\n\s+publisherName: Vedra Opus contributors/);
    expect(config).toMatch(/signingHashAlgorithms:\s*\n\s+- sha256\s*\n/);
    expect(config).not.toMatch(/signingHashAlgorithms:\s*\n\s+- sha1/);
    expect(config).toContain('rfc3161TimeStampServer: http://timestamp.digicert.com');
  });

  it('signs macOS builds with the hardened runtime and our entitlements', () => {
    expect(config).toContain('hardenedRuntime: true');
    const entitlements = config.match(/entitlements: (\S+)/)?.[1];
    expect(entitlements).toBe('signing/entitlements.mac.plist');
    const plist = readFileSync(resolve(desktop, entitlements!), 'utf8');
    for (const key of [
      'com.apple.security.cs.allow-jit',
      'com.apple.security.cs.allow-unsigned-executable-memory',
      'com.apple.security.cs.disable-library-validation',
      'com.apple.security.device.audio-input',
    ]) {
      expect(plist).toContain(`<key>${key}</key>`);
    }
    // Nothing more than it needs: no camera, no network server, no files outside the sandbox's.
    expect(plist.match(/<key>/g)).toHaveLength(4);
  });

  it('names the public downloads repository’s releases as the update feed (alpha 4), with no token', () => {
    expect(config).toMatch(
      /publish:\s*\n\s+provider: github\s*\n\s+owner: lpgeach\s*\n\s+repo: vedra-opus-releases/,
    );
    expect(config).not.toMatch(/token/i);
  });

  it('holds no certificate, password or account: those come from the environment', () => {
    // The comments name the variables; the settings themselves must not hold their values.
    const settings = config
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n');
    expect(settings).not.toMatch(/password|CSC_LINK|certificateFile|APPLE_|appleId|teamId/i);
    expect(existsSync(resolve(desktop, 'signing'))).toBe(true);
  });
});

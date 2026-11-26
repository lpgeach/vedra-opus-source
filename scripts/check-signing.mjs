#!/usr/bin/env node
/**
 * Prove the signing wiring (docs/briefs/P11.4-signing-and-updates.md, part A)
 * without a real certificate: make a throwaway code-signing certificate,
 * package the app with it (offline: no timestamp server is contacted), check
 * the app's executable is signed by it, and remove the certificate.
 *
 * Windows only for now; macOS is checked in the headless VM (docs/releasing.md).
 *
 *   node scripts/check-signing.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const SUBJECT = 'Vedra Opus Test Signing';

if (process.platform !== 'win32') {
  console.log(
    'The signing check runs on Windows; macOS is checked in the headless VM (docs/releasing.md).',
  );
  process.exit(0);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', windowsHide: true, ...options });
  if (result.status !== 0) throw new Error(`${command} ${args[0] ?? ''} failed.`);
  return result;
}

/** OpenSSL from the PATH, or the one Git for Windows brings. */
function openssl() {
  const found = spawnSync('openssl', ['version'], { windowsHide: true });
  if (found.status === 0) return 'openssl';
  const git = 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe';
  if (existsSync(git)) return git;
  throw new Error(
    'OpenSSL is needed to make the test certificate (it comes with Git for Windows).',
  );
}

const work = mkdtempSync(join(tmpdir(), 'vedraopus-signing-'));
try {
  // 1. A certificate for code signing, made here and thrown away after.
  const ssl = openssl();
  const key = join(work, 'key.pem');
  const cert = join(work, 'cert.pem');
  const pfx = join(work, 'test.pfx');
  const password = 'vedraopus-test';
  run(ssl, [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-sha256',
    '-days',
    '7',
    '-nodes',
    '-keyout',
    key,
    '-out',
    cert,
    '-subj',
    `/CN=${SUBJECT}`,
    '-addext',
    'extendedKeyUsage=codeSigning',
    '-addext',
    'keyUsage=digitalSignature',
  ]);
  // Older PKCS#12 encryption, which every Windows signing tool reads.
  run(ssl, [
    'pkcs12',
    '-export',
    '-out',
    pfx,
    '-inkey',
    key,
    '-in',
    cert,
    '-passout',
    `pass:${password}`,
    '-keypbe',
    'PBE-SHA1-3DES',
    '-certpbe',
    'PBE-SHA1-3DES',
    '-macalg',
    'sha1',
  ]);

  // 2. Package the app with it, offline: no timestamp.
  console.log('Packaging the app, signed with the test certificate …');
  // npm is a script on Windows, so it runs through the shell, as one command line.
  run('npm run package:dir --workspace=vedraopus-desktop', [], {
    cwd: root,
    shell: true,
    env: {
      ...process.env,
      CSC_LINK: pfx,
      CSC_KEY_PASSWORD: password,
      ELECTRON_BUILDER_OFFLINE: 'true',
    },
  });

  // 3. The app's executable is signed by the test certificate.
  const exe = join(root, 'apps', 'desktop', 'release', 'win-unpacked', 'Vedra Opus.exe');
  if (!existsSync(exe)) throw new Error(`The packaged app is not where it should be: ${exe}`);
  const check = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `$s = Get-AuthenticodeSignature -LiteralPath '${exe.replace(/'/g, "''")}'; [pscustomobject]@{ status = [string]$s.Status; subject = $s.SignerCertificate.Subject; algorithm = $s.SignerCertificate.SignatureAlgorithm.FriendlyName } | ConvertTo-Json`,
    ],
    { encoding: 'utf8', windowsHide: true },
  );
  const signature = JSON.parse(check.stdout);
  console.log(
    `Vedra Opus.exe: ${signature.status}, signed by ${signature.subject} (${signature.algorithm})`,
  );
  // A test certificate is not trusted by Windows, so the status is not "Valid"; the signer is what counts.
  if (signature.subject !== `CN=${SUBJECT}`) {
    throw new Error('The app was not signed with the test certificate.');
  }
  console.log('Signing works: the packaged app is signed with the certificate it was given.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  // 4. Nothing of the certificate is kept.
  rmSync(work, { recursive: true, force: true });
}

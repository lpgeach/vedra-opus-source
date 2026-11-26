#!/usr/bin/env node
/**
 * Build the media pipeline's ffmpeg for this machine into
 * vendor/ffmpeg/<os>-<arch>/ (docs/briefs/R1-own-ffmpeg-builds.md): our own
 * minimal LGPL build from pinned, checksummed sources (scripts/build-ffmpeg.sh),
 * the same on every system, with no H.264 or AAC code (Luke, 2026-11-23).
 *
 * - macOS and Linux build natively (about ten minutes; the Xcode Command Line
 *   Tools, or build-essential).
 * - Windows builds through WSL, cross-compiled with mingw-w64 there.
 * - On Windows and macOS it also builds `vo-decode` (scripts/build-decoder.sh), which
 *   reads H.264 and the like through the system's own decoders (R3).
 *
 * Does nothing when they are already there; builds only the helper when only it is missing.
 *
 *   node scripts/fetch-ffmpeg.mjs [--force]
 *
 * On an Intel Mac, VEDRAOPUS_TARGET_ARCH=arm64 builds for Apple Silicon instead, cross-compiled
 * (alpha 4): it cannot be run there, so it is checked by its architecture and what it links.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const os = { linux: 'linux', win32: 'win', darwin: 'mac' }[process.platform] ?? process.platform;
// Another architecture only for macOS, where clang and swiftc build for either.
const arch = process.env['VEDRAOPUS_TARGET_ARCH'] ?? process.arch;
const target = `${os}-${arch}`;
const root = join(import.meta.dirname, '..');
const out = join(root, 'vendor', 'ffmpeg', target);
const force = process.argv.includes('--force');

// macOS and Linux build natively for this machine; Windows is cross-compiled for x64.
const supported =
  (os === 'mac' && (arch === 'x64' || arch === 'arm64')) ||
  (os === 'linux' && arch === process.arch) ||
  (os === 'win' && arch === 'x64' && process.arch === 'x64');
if (!supported) {
  console.log(`No ffmpeg build for ${target}; the media pipeline stays off here.`);
  process.exit(0);
}
const exe = os === 'win' ? '.exe' : '';
const program = join(out, 'bin', `ffmpeg${exe}`);
// vo-decode, which reads H.264 and the like through the system's own decoders (Windows, macOS; R3).
const helper = os === 'linux' ? null : join(out, 'bin', `vo-decode${exe}`);
const needFfmpeg = force || !existsSync(program);
const needHelper = helper !== null && (force || !existsSync(helper));
if (!needFfmpeg && !needHelper) {
  console.log(`ffmpeg is already in ${out}.`);
  process.exit(0);
}

/** Windows paths as WSL sees them, for building there. */
const toWsl = (path) => {
  const result = spawnSync('wsl.exe', ['-e', 'wslpath', '-a', path.replace(/\\/g, '/')], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.error(
      'Building ffmpeg on Windows needs WSL with build-essential and mingw-w64:\n' +
        '  wsl --install, then in WSL: sudo apt install build-essential mingw-w64',
    );
    process.exit(1);
  }
  return result.stdout.trim();
};

/** Run one of our build scripts for this system: natively, or through WSL on Windows. */
function runScript(name, args, env = {}) {
  const path = join(root, 'scripts', name);
  if (os === 'win') {
    const vars = Object.entries(env).map(([key, value]) => `${key}=${toWsl(value)}`);
    return spawnSync(
      'wsl.exe',
      [
        '-e',
        'env',
        ...vars,
        'bash',
        toWsl(path),
        ...args.map((arg, i) => (i === 0 ? arg : toWsl(arg))),
      ],
      {
        stdio: 'inherit',
      },
    );
  }
  // The Mac architecture to build for, as clang and the build scripts name it.
  const macArch = os === 'mac' ? { VEDRAOPUS_MAC_ARCH: arch === 'arm64' ? 'arm64' : 'x86_64' } : {};
  return spawnSync('bash', [path, ...args], {
    stdio: 'inherit',
    env: { ...process.env, ...macArch, ...env },
  });
}

if (os === 'mac' && spawnSync('xcode-select', ['-p']).status !== 0) {
  console.error(
    'Building ffmpeg on macOS needs the Xcode Command Line Tools: xcode-select --install',
  );
  process.exit(1);
}
if (needFfmpeg) {
  console.log(`Building ffmpeg for ${target} from its pinned sources (about ten minutes) …`);
  const sources = process.env['VEDRAOPUS_FFMPEG_SOURCES'];
  const built = runScript(
    'build-ffmpeg.sh',
    [os, out],
    sources ? { VEDRAOPUS_FFMPEG_SOURCES: sources } : {},
  );
  if (built.status !== 0) process.exit(built.status ?? 1);
}
if (helper) {
  console.log("Building vo-decode, which reads through the system's own decoders …");
  const built = runScript('build-decoder.sh', [os, join(out, 'bin')]);
  process.exit(built.status ?? 1);
}

#!/usr/bin/env node
/**
 * The source offer (docs/briefs/R2-notices-and-sources.md): gather the complete
 * source of the ffmpeg and LibreOffice that Vedra Opus ships, for attaching to a
 * release, where it is kept for at least three years (docs/releasing.md).
 *
 * - ffmpeg: the archives `scripts/build-ffmpeg.sh` pins (its list is the only
 *   list), and the script itself.
 * - LibreOffice: The Document Foundation's source archive for the version
 *   `scripts/fetch-libreoffice.mjs` fetches.
 *
 * Each archive is checked against its SHA-256; an archive already in the folder
 * and matching is kept. Writes `release-sources/` (git ignores it), with a README.
 *
 *   node scripts/collect-sources.mjs [--out=<folder>]
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = join(import.meta.dirname, '..');

/** The sources `build-ffmpeg.sh` pins: file, URL and SHA-256, in its own order. */
export function ffmpegSources(script) {
  const sources = [];
  for (const match of script.matchAll(
    /"([\w.+-]+\.tar\.(?:xz|gz)) (https:\/\/\S+) ([0-9a-f]{64})"/g,
  )) {
    sources.push({ file: match[1], url: match[2], sha256: match[3] });
  }
  return sources;
}

/** The LibreOffice version `fetch-libreoffice.mjs` fetches. */
export function libreOfficeVersion(script) {
  return /const VERSION = '([\d.]+)';/.exec(script)?.[1] ?? null;
}

/**
 * LibreOffice's source for the version we ship, as The Document Foundation publishes it.
 * Change it with VERSION in fetch-libreoffice.mjs (a test holds the two together).
 */
export const LIBREOFFICE_SOURCE = {
  version: '26.8.3',
  file: 'libreoffice-26.8.3.1.tar.xz',
  url: 'https://download.documentfoundation.org/libreoffice/src/26.8.3/libreoffice-26.8.3.1.tar.xz',
  sha256: '83006a81376988d04a73eaa4dcf44f6f12774a81fd763726406a831905a9de28',
};

const sha256Of = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

/** Download `url` to `path` unless a file with the right SHA-256 is there; then check it. */
async function fetchChecked({ file, url, sha256 }, folder) {
  const path = join(folder, file);
  if (existsSync(path) && sha256Of(path) === sha256) {
    console.log(`${file}: already here.`);
    return;
  }
  console.log(`Downloading ${file} …`);
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Download failed for ${file}: ${response.status} ${response.statusText}`);
  writeFileSync(path, Buffer.from(await response.arrayBuffer()));
  const got = sha256Of(path);
  if (got !== sha256)
    throw new Error(`Checksum mismatch for ${file}: expected ${sha256}, got ${got}.`);
}

/** The README that goes with the files. */
export function readme(version, ffmpeg, libreOffice) {
  const lines = [
    `The source code of the third-party programs Vedra Opus ${version} ships, for its release.`,
    '',
    'ffmpeg (LGPL 2.1 or later), built by ffmpeg/build-ffmpeg.sh from these archives:',
    ...ffmpeg.map((each) => `  ${each.file}  SHA-256 ${each.sha256}  (from ${each.url})`),
    '  The same script builds it for every system: bash build-ffmpeg.sh <mac|linux|win> <output folder>.',
    '  nasm and pkgconf are tools for the build, not part of what is shipped.',
    '',
    `LibreOffice ${libreOffice.version} (MPL 2.0), from The Document Foundation:`,
    `  ${libreOffice.file}  SHA-256 ${libreOffice.sha256}  (from ${libreOffice.url})`,
    "  Vedra Opus ships The Document Foundation's own build, with files it does not need removed",
    '  (scripts/fetch-libreoffice.mjs); none of its files is changed. Its build also downloads',
    '  further third-party archives of its own, listed in download.lst inside the archive.',
    '',
  ];
  return lines.join('\n');
}

async function main() {
  const outArg = process.argv.find((arg) => arg.startsWith('--out='));
  const out = resolve(outArg ? outArg.slice('--out='.length) : join(root, 'release-sources'));
  const buildScript = join(root, 'scripts', 'build-ffmpeg.sh');
  const ffmpeg = ffmpegSources(readFileSync(buildScript, 'utf8'));
  const shipped = libreOfficeVersion(
    readFileSync(join(root, 'scripts', 'fetch-libreoffice.mjs'), 'utf8'),
  );
  if (shipped !== LIBREOFFICE_SOURCE.version) {
    throw new Error(
      `fetch-libreoffice.mjs fetches LibreOffice ${shipped}, but the source pinned here is for ${LIBREOFFICE_SOURCE.version}.`,
    );
  }
  const { version } = JSON.parse(
    readFileSync(join(root, 'apps', 'desktop', 'package.json'), 'utf8'),
  );
  mkdirSync(join(out, 'ffmpeg'), { recursive: true });
  mkdirSync(join(out, 'libreoffice'), { recursive: true });
  for (const source of ffmpeg) await fetchChecked(source, join(out, 'ffmpeg'));
  copyFileSync(buildScript, join(out, 'ffmpeg', 'build-ffmpeg.sh'));
  await fetchChecked(LIBREOFFICE_SOURCE, join(out, 'libreoffice'));
  writeFileSync(join(out, 'README.txt'), readme(version, ffmpeg, LIBREOFFICE_SOURCE));
  console.log(`The sources are in ${out}: attach them to the release (docs/releasing.md).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

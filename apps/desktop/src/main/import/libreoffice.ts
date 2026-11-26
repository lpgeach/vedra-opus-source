/**
 * Running the bundled LibreOffice (docs/briefs/P11.1-pptx-import.md, part D):
 * a separate program, started headless as a child process to draw decks as
 * pictures. Nothing is linked into the app, and nothing leaves the machine.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Where the program is inside a LibreOffice folder, on each system. */
const PROGRAMS = [
  ['program', 'soffice.com'], // Windows: the console starter, which waits for the work to end.
  ['program', 'soffice'], // Linux
  ['LibreOffice.app', 'Contents', 'MacOS', 'soffice'], // macOS
];

/** The first of these folders that holds LibreOffice, as the path of its program; or null. */
export function findLibreOffice(folders: readonly (string | undefined)[]): string | null {
  for (const folder of folders) {
    if (!folder) continue;
    for (const parts of PROGRAMS) {
      const program = join(folder, ...parts);
      if (existsSync(program)) return program;
    }
  }
  return null;
}

/** Where `npm run fetch:libreoffice` puts the build for this machine. */
export function libreOfficeVendorFolder(repositoryRoot: string): string {
  const os =
    { linux: 'linux', win32: 'win', darwin: 'mac' }[process.platform as string] ?? process.platform;
  return join(repositoryRoot, 'vendor', 'libreoffice', `${os}-${process.arch}`);
}

/**
 * The PNG export, `pixelWidth` wide (its height follows the slide's shape),
 * with a transparent background: what the content does not cover shows the
 * slide beneath. Without a width, LibreOffice would draw at the screen's
 * density, which differs from machine to machine.
 */
export const pngExport = (pixelWidth: number) =>
  `png:impress_png_Export:${JSON.stringify({
    Translucent: { type: 'long', value: '1' },
    PixelWidth: { type: 'long', value: String(Math.round(pixelWidth)) },
  })}`;

/** The longest side a drawn picture may have, in pixels. */
export const MAX_PICTURE_SIDE = 4096;

/**
 * Drawings grouped so that each group is drawn in one run, at one width, at
 * least twice the widest drawing's and at most about 2.8 times the narrowest's:
 * each group spans widths within a factor of √2. A run costs seconds to start,
 * so a deck's drawings are not drawn one run each.
 */
export function widthGroups(
  sizes: readonly { width: number; height: number }[],
): { indexes: number[]; pixelWidth: number }[] {
  const groups = new Map<number, number[]>();
  sizes.forEach((size, index) => {
    const band = Math.floor(2 * Math.log2(Math.max(1, size.width)));
    groups.set(band, [...(groups.get(band) ?? []), index]);
  });
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([band, indexes]) => {
      const top = 2 ** ((band + 1) / 2);
      // No side longer than the cap, for the tallest drawing in the group too.
      const tallest = Math.max(...indexes.map((i) => sizes[i]!.height / sizes[i]!.width));
      const pixelWidth = Math.max(
        1,
        Math.floor(Math.min(2 * top, MAX_PICTURE_SIDE, MAX_PICTURE_SIDE / tallest)),
      );
      return { indexes, pixelWidth };
    });
}

export class LibreOfficeError extends Error {}

/**
 * Draw each deck's first slide as `<name>.png`, `pixelWidth` wide, in
 * `outDir`, in one run of LibreOffice with a profile of its own in
 * `profileDir` (so it neither uses nor changes a LibreOffice the author has).
 * Rejects if it fails to run or takes longer than `timeoutMs`; a deck it
 * could not draw just has no picture.
 */
export function drawDecks(
  soffice: string,
  decks: readonly string[],
  outDir: string,
  profileDir: string,
  pixelWidth: number,
  timeoutMs = 60_000 + decks.length * 10_000,
): Promise<void> {
  const args = [
    `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
    '--headless',
    '--norestore',
    '--nolockcheck',
    '--convert-to',
    pngExport(pixelWidth),
    '--outdir',
    outDir,
    ...decks,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(soffice, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let err = '';
    child.stdout.resume();
    child.stderr.on('data', (chunk: Buffer) => {
      if (err.length < 4000) err += chunk.toString();
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new LibreOfficeError('LibreOffice took too long to draw the content'));
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new LibreOfficeError(`LibreOffice could not be started: ${error.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else
        reject(
          new LibreOfficeError(
            `LibreOffice stopped with code ${code}${err.trim() ? `: ${err.trim().split('\n')[0]}` : ''}`,
          ),
        );
    });
  });
}

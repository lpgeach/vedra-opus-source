import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  drawDecks,
  findLibreOffice,
  LibreOfficeError,
  libreOfficeVendorFolder,
  MAX_PICTURE_SIDE,
  pngExport,
  widthGroups,
} from './libreoffice';

/** Finding and starting the bundled LibreOffice (docs/briefs/P11.1-pptx-import.md, part D). */

const temp = mkdtempSync(join(tmpdir(), 'vo-libreoffice-test-'));
afterAll(() => rmSync(temp, { recursive: true, force: true }));

function folderWith(name: string, ...program: string[]): string {
  const folder = join(temp, name);
  mkdirSync(join(folder, ...program.slice(0, -1)), { recursive: true });
  writeFileSync(join(folder, ...program), '');
  return folder;
}

describe('finding LibreOffice', () => {
  it('takes the first folder that holds it, as Windows, Linux or macOS lay it out', () => {
    const windows = folderWith('win', 'program', 'soffice.com');
    const linux = folderWith('linux', 'program', 'soffice');
    const mac = folderWith('mac', 'LibreOffice.app', 'Contents', 'MacOS', 'soffice');
    expect(findLibreOffice([undefined, join(temp, 'none'), windows, linux])).toBe(
      join(windows, 'program', 'soffice.com'),
    );
    expect(findLibreOffice([linux])).toBe(join(linux, 'program', 'soffice'));
    expect(findLibreOffice([mac])).toBe(
      join(mac, 'LibreOffice.app', 'Contents', 'MacOS', 'soffice'),
    );
    expect(findLibreOffice([join(temp, 'none'), undefined])).toBeNull();
  });

  it('looks in the repository’s vendor folder for this system', () => {
    const os = { linux: 'linux', win32: 'win', darwin: 'mac' }[process.platform as string];
    expect(libreOfficeVendorFolder('/repo')).toBe(
      join('/repo', 'vendor', 'libreoffice', `${os}-${process.arch}`),
    );
  });

  it('says so when the program cannot be started', async () => {
    await expect(
      drawDecks(join(temp, 'missing', 'soffice'), [], temp, join(temp, 'profile'), 100),
    ).rejects.toThrow(LibreOfficeError);
  });
});

describe('drawing runs', () => {
  it('group drawings of about the same width, each drawn two to three times its width', () => {
    const groups = widthGroups([
      { width: 500, height: 360 },
      { width: 64, height: 32 },
      { width: 480, height: 300 },
      { width: 600, height: 160 },
    ]);
    expect(groups).toEqual([
      { indexes: [1], pixelWidth: 181 },
      { indexes: [0, 2], pixelWidth: 1024 },
      { indexes: [3], pixelWidth: 1448 },
    ]);
    for (const { indexes, pixelWidth } of groups) {
      for (const index of indexes) {
        const width = [500, 64, 480, 600][index]!;
        expect(pixelWidth / width).toBeGreaterThanOrEqual(2);
        expect(pixelWidth / width).toBeLessThanOrEqual(2 * Math.SQRT2 + 0.01);
      }
    }
  });

  it('keep every side within the cap, tall drawings too', () => {
    expect(widthGroups([{ width: 3000, height: 1000 }])[0]!.pixelWidth).toBe(MAX_PICTURE_SIDE);
    // 300 wide and 3000 tall: drawn 409 wide, so 4090 tall.
    expect(widthGroups([{ width: 300, height: 3000 }])[0]!.pixelWidth).toBe(409);
  });

  it('ask for a set width, so the picture does not depend on the screen', () => {
    expect(JSON.parse(pngExport(1024).replace('png:impress_png_Export:', ''))).toEqual({
      Translucent: { type: 'long', value: '1' },
      PixelWidth: { type: 'long', value: '1024' },
    });
  });
});

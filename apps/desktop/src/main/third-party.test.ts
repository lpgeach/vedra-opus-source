import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  findElectronDir,
  folderWithSource,
  NOTICES_FILE,
  RELEASES_URL,
  thirdPartyNotices,
} from './third-party';

/** Help → Third-Party Notices… (docs/briefs/R2-notices-and-sources.md). */

const temp = mkdtempSync(join(tmpdir(), 'vedraopus-notices-test-'));
afterAll(() => rmSync(temp, { recursive: true, force: true }));

const put = (path: string, text: string) => {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text);
};
const list = (packages: object[]) => JSON.stringify({ packages });

/** A packaged app's layout, with everything it can ship. */
function app() {
  const dir = mkdtempSync(join(temp, 'app-'));
  put(join(dir, 'electron', 'LICENSE.electron.txt'), 'Copyright (c) Electron contributors');
  put(join(dir, 'electron', 'LICENSES.chromium.html'), '<html>Chromium</html>');
  put(join(dir, 'ffmpeg', 'bin', 'ffmpeg'), '');
  put(join(dir, 'ffmpeg', 'LICENSE.txt'), 'GNU LESSER GENERAL PUBLIC LICENSE Version 2.1');
  put(join(dir, 'ffmpeg', 'SOURCE.txt'), 'ffmpeg 8.1.3 for linux, built from source');
  put(join(dir, 'libreoffice', 'program', 'soffice'), '');
  put(join(dir, 'libreoffice', 'SOURCE.txt'), 'LibreOffice 26.8.3, LibreOffice_26.8.3.msi');
  put(join(dir, 'libreoffice', 'NOTICE'), 'This product includes software developed by TDF.');
  put(join(dir, 'libreoffice', 'LICENSE.html'), '<html>MPL</html>');
  put(join(dir, 'licences', 'lucide.txt'), 'ISC License: Lucide');
  put(join(dir, 'licences', 'open-doodles.txt'), 'CC0: Open Doodles');
  const react = { name: 'react', version: '19.3.1', licence: 'MIT', text: 'MIT: React' };
  const zod = { name: 'zod', version: '4.6.7', licence: 'MIT', text: 'MIT: Zod' };
  const tiptap = {
    name: '@tiptap/core',
    version: '2.27.3',
    licence: 'MIT',
    text: 'MIT',
    standard: true,
  };
  put(join(dir, 'out', 'main', NOTICES_FILE), list([zod]));
  put(join(dir, 'out', 'renderer', NOTICES_FILE), list([react, tiptap, zod]));
  put(join(dir, 'out', 'player', NOTICES_FILE), list([zod]));
  return dir;
}

describe('the third-party notices', () => {
  it('lists what ships beside our code, and the libraries built in, with where each is', () => {
    const dir = app();
    const { notices, files } = thirdPartyNotices({
      lists: {
        editor: ['main', 'preload', 'renderer'].map((each) => join(dir, 'out', each, NOTICES_FILE)),
        player: [join(dir, 'out', 'player', NOTICES_FILE)],
      },
      electronDir: join(dir, 'electron'),
      electronVersion: '45.3.2',
      ffmpegDir: join(dir, 'ffmpeg'),
      libreOfficeDir: folderWithSource(join(dir, 'libreoffice', 'program', 'soffice')),
      licencesDir: join(dir, 'licences'),
    });
    expect(notices.releasesUrl).toBe(RELEASES_URL);
    expect(notices.components.map((each) => [each.id, each.version, each.licence])).toEqual([
      ['electron', '45.3.2', 'MIT; Chromium: BSD-3-Clause and others'],
      ['ffmpeg', '8.1.3', 'LGPL-2.1-or-later'],
      ['libreoffice', '26.8.3', 'MPL-2.0'],
      ['lucide', null, 'ISC'],
      ['openDoodles', null, 'CC0-1.0'],
      ['scormSchemas', null, 'CC-BY-3.0'],
      ['demoCourse', null, 'CC-BY-4.0; public domain'],
    ]);
    const component = (id: string) => notices.components.find((each) => each.id === id)!;
    expect(component('electron')).toMatchObject({
      text: 'Copyright (c) Electron contributors',
      canOpen: true,
    });
    expect(component('ffmpeg').text).toContain('GNU LESSER GENERAL PUBLIC LICENSE');
    expect(component('ffmpeg').text).toContain('built from source');
    expect(component('libreoffice')).toMatchObject({ canOpen: true });
    expect(component('libreoffice').text).toContain('developed by TDF');
    expect(component('scormSchemas').text).toContain('Creative Commons Attribution 3.0');
    expect(component('demoCourse').text).toContain('Kevin MacLeod (incompetech.com)');
    expect(component('demoCourse').text).toContain('By Attribution 4.0');

    // One entry each, with where it is built in; the preload's missing list is no matter.
    expect(notices.packages.map((each) => [each.name, each.usedIn])).toEqual([
      ['@tiptap/core', ['editor']],
      ['react', ['editor']],
      ['zod', ['editor', 'player']],
    ]);
    expect(notices.packages[0]!.standard).toBe(true);

    // Only the files it listed can be opened.
    expect([...files.keys()].sort()).toEqual(['electron', 'libreoffice']);
    expect(files.get('electron')).toBe(join(dir, 'electron', 'LICENSES.chromium.html'));
  });

  it('without ffmpeg or LibreOffice, lists neither, and has nothing of theirs to open', () => {
    const { notices, files } = thirdPartyNotices({
      lists: { editor: [], player: [] },
      electronDir: null,
      electronVersion: '45.3.2',
      ffmpegDir: null,
      libreOfficeDir: null,
      licencesDir: null,
    });
    expect(notices.components.map((each) => each.id)).toEqual([
      'electron',
      'scormSchemas',
      'demoCourse',
    ]);
    expect(notices.components[0]).toMatchObject({ text: null, canOpen: false });
    expect(files.size).toBe(0);
  });

  it('finds Electron’s files beside the program, in Resources on macOS, or in development', () => {
    const dir = mkdtempSync(join(temp, 'electron-'));
    put(join(dir, 'win', 'LICENSES.chromium.html'), '');
    expect(findElectronDir(join(dir, 'win', 'Vedra Opus.exe'), join(dir, 'win', 'resources'))).toBe(
      join(dir, 'win'),
    );
    put(join(dir, 'mac', 'Contents', 'Resources', 'LICENSES.chromium.html'), '');
    expect(
      findElectronDir(
        join(dir, 'mac', 'Contents', 'MacOS', 'Vedra Opus'),
        join(dir, 'mac', 'Contents', 'Resources'),
      ),
    ).toBe(join(dir, 'mac', 'Contents', 'Resources'));
    // Development on macOS: dist/Electron.app/Contents/MacOS/Electron, the files in dist.
    put(join(dir, 'dist', 'LICENSES.chromium.html'), '');
    expect(
      findElectronDir(
        join(dir, 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron'),
        join(dir, 'dist', 'Electron.app', 'Contents', 'Resources'),
      ),
    ).toBe(join(dir, 'dist'));
    expect(findElectronDir(join(dir, 'none', 'app'), join(dir, 'none'))).toBeNull();
  });
});

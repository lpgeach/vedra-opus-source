/**
 * Help → Third-Party Notices… (docs/briefs/R2-notices-and-sources.md): what
 * Vedra Opus ships alongside its own code, with its licences, and the npm
 * packages built into the editor and the course player, from the lists the
 * build writes (`scripts/third-party-notices.mjs`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { NoticeComponent, NoticePackage, ThirdPartyNotices } from '../shared/ipc';

/** The list the build writes beside each bundle (scripts/third-party-notices.mjs). */
export const NOTICES_FILE = 'third-party-notices.json';

/**
 * The public downloads repository (Luke, 2026-11-25, alpha 4): its releases are the update feed,
 * and where each release's installers and source code are published.
 */
export const PUBLIC_REPOSITORY = 'https://github.com/lpgeach/vedra-opus-releases';

/** Where each release's source code is published, and kept for at least three years. */
export const RELEASES_URL = `${PUBLIC_REPOSITORY}/releases`;

/** The SCORM schema files' credit, as their licence (CC BY 3.0) asks. */
const SCORM_CREDIT = `The SCORM 1.2 and SCORM 2004 XML schema files that Vedra Opus writes into LMS packages come from Rustici Software's schema bundles (https://scorm.com), licensed under the Creative Commons Attribution 3.0 licence (https://creativecommons.org/licenses/by/3.0/). The schemas themselves are ADL's and IMS Global's, and their copyright notices are kept inside them.`;

/** The demo course's media (B4), credited as the music's licence (CC BY 4.0) asks. */
const DEMO_CREDIT = `The demo course, "The UK Space Industry in 2026" (Help → Open Demo Course), includes:

Music: "Floating Cities" and "Lightless Dawn" by Kevin MacLeod (incompetech.com), licensed under Creative Commons: By Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/). Excerpts, with fades.

Pictures and video: NASA, public domain (NASA images and video are not copyrighted unless noted): the British Isles at night from the ISS (ISS042-E-215971); Great Britain and Ireland, 26 March 2012 (MODIS); Tim Peake on the ISS (ISS046-E-038911) and before launch (JSC2015-E-106166, NASA/Victor Zelentsov); a deployed CubeSat (ISS066-E-135308); Gale Crater from Curiosity (PIA16026, NASA/JPL-Caltech); "Earth Views from the International Space Station" and "Artemis I Launch (Press Site)", excerpts. NASA does not endorse this course.

Narration: Windows text-to-speech, made in Vedra Opus.`;

/** One bundle's list, as the build writes it. */
interface BundleList {
  packages: {
    name: string;
    version: string;
    licence: string;
    text: string | null;
    standard?: boolean;
  }[];
}

export interface NoticeSources {
  /** The lists written beside each bundle: the editor's (main, preload, renderer) and the player's. */
  lists: { editor: string[]; player: string[] };
  /** The folder that holds Electron's `LICENSE` (or `LICENSE.electron.txt`) and `LICENSES.chromium.html`. */
  electronDir: string | null;
  electronVersion: string;
  /** ffmpeg's folder (`bin/`, `LICENSE.txt`, `SOURCE.txt`), when the app has it. */
  ffmpegDir: string | null;
  /** LibreOffice's folder (with `SOURCE.txt`), when the app has it. */
  libreOfficeDir: string | null;
  /** `resources/licences`: the icons' and illustrations' notices. */
  licencesDir: string | null;
}

const read = (path: string | null): string | null => {
  if (!path || !existsSync(path)) return null;
  return readFileSync(path, 'utf8').trim() || null;
};

const firstExisting = (paths: string[]): string | null =>
  paths.find((path) => existsSync(path)) ?? null;

/** The folder above `program` that holds `SOURCE.txt` (our fetch writes it at the top), or null. */
export function folderWithSource(program: string | null): string | null {
  let folder = program ? dirname(program) : null;
  for (let i = 0; folder && i < 6; i++) {
    if (existsSync(join(folder, 'SOURCE.txt'))) return folder;
    const up = dirname(folder);
    folder = up === folder ? null : up;
  }
  return null;
}

/** Electron's licence files: beside the program (Windows, Linux, development), or in Resources (macOS). */
export function findElectronDir(execPath: string, resourcesPath: string): string | null {
  const candidates = [dirname(execPath), resourcesPath, resolve(dirname(execPath), '../../..')];
  return candidates.find((dir) => existsSync(join(dir, 'LICENSES.chromium.html'))) ?? null;
}

/** The notices, and the files `app:openNotice` may open, by id. */
export function thirdPartyNotices(sources: NoticeSources): {
  notices: ThirdPartyNotices;
  files: Map<NoticeComponent['id'], string>;
} {
  const files = new Map<NoticeComponent['id'], string>();
  const components: NoticeComponent[] = [];

  const { electronDir } = sources;
  const chromium = electronDir ? join(electronDir, 'LICENSES.chromium.html') : null;
  if (chromium && existsSync(chromium)) files.set('electron', chromium);
  components.push({
    id: 'electron',
    name: 'Electron, with Chromium',
    version: sources.electronVersion,
    licence: 'MIT; Chromium: BSD-3-Clause and others',
    text: electronDir
      ? read(
          firstExisting([join(electronDir, 'LICENSE.electron.txt'), join(electronDir, 'LICENSE')]),
        )
      : null,
    canOpen: files.has('electron'),
  });

  if (sources.ffmpegDir) {
    const source = read(join(sources.ffmpegDir, 'SOURCE.txt'));
    const licence = read(join(sources.ffmpegDir, 'LICENSE.txt'));
    components.push({
      id: 'ffmpeg',
      name: 'FFmpeg',
      version: /ffmpeg ([\d.]+)/i.exec(source ?? '')?.[1] ?? null,
      licence: 'LGPL-2.1-or-later',
      text: [source, licence].filter(Boolean).join('\n\n') || null,
      canOpen: false,
    });
  }

  if (sources.libreOfficeDir) {
    const dir = sources.libreOfficeDir;
    const inApp = join(dir, 'LibreOffice.app', 'Contents', 'Resources');
    const source = read(join(dir, 'SOURCE.txt'));
    const licence = firstExisting([join(dir, 'LICENSE.html'), join(inApp, 'LICENSE.html')]);
    if (licence) files.set('libreoffice', licence);
    components.push({
      id: 'libreoffice',
      name: 'LibreOffice',
      version: /LibreOffice ([\d.]+)/.exec(source ?? '')?.[1] ?? null,
      licence: 'MPL-2.0',
      text:
        [source, read(firstExisting([join(dir, 'NOTICE'), join(inApp, 'NOTICE')]))]
          .filter(Boolean)
          .join('\n\n') || null,
      canOpen: Boolean(licence),
    });
  }

  if (sources.licencesDir) {
    const lucide = read(join(sources.licencesDir, 'lucide.txt'));
    if (lucide) {
      components.push({
        id: 'lucide',
        name: 'Lucide icons',
        version: null,
        licence: 'ISC',
        text: lucide,
        canOpen: false,
      });
    }
    const doodles = read(join(sources.licencesDir, 'open-doodles.txt'));
    if (doodles) {
      components.push({
        id: 'openDoodles',
        name: 'Open Doodles',
        version: null,
        licence: 'CC0-1.0',
        text: doodles,
        canOpen: false,
      });
    }
  }

  components.push({
    id: 'scormSchemas',
    name: 'SCORM schema files',
    version: null,
    licence: 'CC-BY-3.0',
    text: SCORM_CREDIT,
    canOpen: false,
  });
  components.push({
    id: 'demoCourse',
    name: 'Demo course media',
    version: null,
    licence: 'CC-BY-4.0; public domain',
    text: DEMO_CREDIT,
    canOpen: false,
  });

  // The npm packages, one entry each, with where they are built in.
  const packages = new Map<string, NoticePackage>();
  for (const [usedIn, lists] of [
    ['editor', sources.lists.editor],
    ['player', sources.lists.player],
  ] as const) {
    for (const path of lists) {
      if (!existsSync(path)) continue;
      const list = JSON.parse(readFileSync(path, 'utf8')) as BundleList;
      for (const each of list.packages) {
        const key = `${each.name}@${each.version}`;
        const known = packages.get(key);
        if (known) {
          if (!known.usedIn.includes(usedIn)) known.usedIn.push(usedIn);
          continue;
        }
        packages.set(key, {
          name: each.name,
          version: each.version,
          licence: each.licence,
          text: each.text,
          standard: each.standard ?? false,
          usedIn: [usedIn],
        });
      }
    }
  }

  return {
    notices: {
      releasesUrl: RELEASES_URL,
      components,
      packages: [...packages.values()].sort((a, b) => a.name.localeCompare(b.name)),
    },
    files,
  };
}

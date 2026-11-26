import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ffmpegSources,
  LIBREOFFICE_SOURCE,
  libreOfficeVersion,
  readme,
} from './collect-sources.mjs';

/** The source offer's collection (docs/briefs/R2-notices-and-sources.md). */

const script = (name: string) => readFileSync(join(import.meta.dirname, name), 'utf8');

describe('collecting the sources for a release', () => {
  it('takes ffmpeg’s sources from the build script itself, each with its checksum', () => {
    const sources = ffmpegSources(script('build-ffmpeg.sh'));
    expect(sources.map((each) => each.file)).toEqual([
      'ffmpeg-8.1.3.tar.xz',
      'libvpx-1.15.2.tar.gz',
      'opus-1.5.2.tar.gz',
      'lame-3.100.tar.gz',
      'zlib-1.3.1.tar.gz',
      'nasm-2.16.03.tar.xz',
      'pkgconf-2.3.0.tar.xz',
    ]);
    for (const each of sources) {
      expect(each.url).toMatch(/^https:\/\//);
      expect(each.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('offers the source of the LibreOffice version the app fetches', () => {
    expect(libreOfficeVersion(script('fetch-libreoffice.mjs'))).toBe(LIBREOFFICE_SOURCE.version);
    expect(LIBREOFFICE_SOURCE.url).toContain(`/src/${LIBREOFFICE_SOURCE.version}/`);
    expect(LIBREOFFICE_SOURCE.url.endsWith(LIBREOFFICE_SOURCE.file)).toBe(true);
  });

  it('says in the README what each file is', () => {
    const text = readme('1.2.3', ffmpegSources(script('build-ffmpeg.sh')), LIBREOFFICE_SOURCE);
    expect(text).toContain('Vedra Opus 1.2.3');
    expect(text).toContain('ffmpeg-8.1.3.tar.xz  SHA-256 7138d28c');
    expect(text).toContain(LIBREOFFICE_SOURCE.file);
    expect(text).toContain('build-ffmpeg.sh <mac|linux|win>');
  });
});

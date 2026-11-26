import {
  createButtonObject,
  createEmptyProject,
  createId,
  createScene,
  createSlide,
  createWebObject,
  createGraphicObject,
} from '@vedraopus/model';
import type { Project } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import {
  PublishCancelled,
  publishScorm12,
  SCORM12_SCHEMA_FILES,
  scorm12Manifest,
  worstCaseSuspendLength,
} from './index';

const HASH = 'c'.repeat(64);

function course(slides = 2): Project {
  const project = createEmptyProject('Safety & <Health>');
  project.id = 'project_scorm_test';
  project.scenes = [
    { ...createScene(), slides: Array.from({ length: slides }, (_, i) => createSlide(`S${i}`)) },
  ];
  project.assets[HASH] = {
    kind: 'image',
    fileName: 'a.png',
    ext: 'png',
    mimeType: 'image/png',
    byteLength: 1,
  };
  return project;
}

async function publish(
  project: Project,
  extra: Partial<Parameters<typeof publishScorm12>[1]> = {},
) {
  const written = new Map<string, string | Uint8Array>();
  const report = await publishScorm12(project, {
    player: { js: 'JS', css: 'CSS' },
    readAsset: async () => new Uint8Array([1]),
    write: async (path, data) => void written.set(path, data),
    ...extra,
  });
  return { report, written };
}

describe('SCORM 1.2 publishing', () => {
  it('writes the course, an index that starts it with the SCORM 1.2 driver, and the manifest', async () => {
    const { report, written } = await publish(course());
    expect(report.files).toContain('imsmanifest.xml');
    expect(report.files).toContain(`content/assets/${HASH}.png`);
    expect(written.get('index.html')).toContain("lms: 'scorm12'");
    expect(written.get('index.html')).toContain('VedraOpusPlayer.startCourse(');
    expect(report.warnings).toEqual([]);
  });

  it('describes a single SCO listing every file, with the title escaped', async () => {
    const { written } = await publish(course());
    const xml = written.get('imsmanifest.xml') as string;
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
    expect(xml).toContain('<schemaversion>1.2</schemaversion>');
    expect(xml).toContain('adlcp:scormtype="sco" href="index.html"');
    expect(xml).toContain('<title>Safety &amp; &lt;Health&gt;</title>');
    for (const file of [
      'index.html',
      'content/data.js',
      'player/player.js',
      `content/assets/${HASH}.png`,
    ]) {
      expect(xml).toContain(`<file href="${file}"/>`);
    }
    // One organization, one item, one resource, all pointing at each other.
    expect(xml.match(/<item /g)).toHaveLength(1);
    expect(xml.match(/<resource /g)).toHaveLength(1);
    const id = /identifierref="([^"]+)"/.exec(xml)![1];
    expect(xml).toContain(`<resource identifier="${id}"`);
    expect(xml).not.toContain('<file href="imsmanifest.xml"/>');
  });

  it('ships the schema files the manifest names, at the package root and outside the SCO', async () => {
    const { report, written } = await publish(course());
    expect(SCORM12_SCHEMA_FILES).toEqual([
      'imscp_rootv1p1p2.xsd',
      'imsmd_rootv1p2p1.xsd',
      'adlcp_rootv1p2.xsd',
      'ims_xml.xsd',
    ]);
    const xml = written.get('imsmanifest.xml') as string;
    const location = /xsi:schemaLocation="([^"]+)"/.exec(xml)![1]!.split(/\s+/);
    // Pairs of namespace and file; each namespace is declared and each file is in the package.
    expect(location).toHaveLength(6);
    for (let i = 0; i < location.length; i += 2) {
      const [namespace, file] = [location[i]!, location[i + 1]!];
      expect(report.files).toContain(file);
      expect(written.get(file)).toContain(`targetNamespace="${namespace}"`);
    }
    expect(xml).toContain('xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"');
    // ims_xml.xsd is imported by imscp_rootv1p1p2.xsd, not named in the manifest.
    expect(written.get('imscp_rootv1p1p2.xsd')).toContain('schemaLocation="ims_xml.xsd"');
    expect(written.get('ims_xml.xsd')).toContain('<xsd:attribute name="lang"');
    for (const file of SCORM12_SCHEMA_FILES) {
      expect(written.get(file)).toMatch(/^<\?xml version="1.0"/);
      expect(written.get(file)).not.toContain('\r');
      expect(xml).not.toContain(`<file href="${file}"/>`);
    }
  });

  it('stops before the schema files when cancelled', async () => {
    const written: string[] = [];
    const signal = { aborted: false };
    const result = publishScorm12(course(), {
      player: { js: 'JS', css: 'CSS' },
      readAsset: async () => new Uint8Array([1]),
      write: async (path) => {
        written.push(path);
        if (path === 'imsmanifest.xml') signal.aborted = true;
      },
      signal,
    });
    await expect(result).rejects.toBeInstanceOf(PublishCancelled);
    expect(written.at(-1)).toBe('imsmanifest.xml');
  });

  it('makes valid XML ids from any project id', () => {
    const project = course();
    project.id = 'project_9 bad/id';
    expect(scorm12Manifest(project, 'T', [])).toContain('identifier="vedraopus-project_9-bad-id"');
  });

  it('warns at publish time when a long session might not fit, and not for an ordinary course', async () => {
    const small = course(20);
    expect(worstCaseSuspendLength(small)).toBeLessThan(4096);

    // 400 slides, each with many objects that have several states: a lot to remember.
    const big = course(400);
    for (const slide of big.scenes[0]!.slides) {
      for (let i = 0; i < 12; i++) {
        const button = createButtonObject(`B${i}`);
        button.states.push({ id: createId('state'), name: 'A', overrides: {} });
        slide.baseLayer.objects.push(button);
      }
    }
    const estimate = worstCaseSuspendLength(big);
    expect(estimate).toBeGreaterThan(4096);
    const { report } = await publish(big);
    expect(report.suspendEstimate).toBe(estimate);
    expect(report.warnings).toEqual([expect.stringContaining('SCORM 1.2 keeps 4,096')]);
  });
});

describe('SCORM 1.2 and web objects (P9.6)', () => {
  it('lists a web folder’s files in the manifest', async () => {
    const project = course();
    const page = 'e'.repeat(64);
    project.assets[page] = {
      kind: 'file',
      fileName: 'index.html',
      ext: 'html',
      mimeType: 'text/html',
      byteLength: 3,
    };
    const web = createWebObject({
      kind: 'folder',
      files: { 'index.html': page },
      entry: 'index.html',
    });
    project.scenes[0]!.slides[0]!.baseLayer.objects.push(web);
    const { written } = await publish(project);
    expect(written.get('imsmanifest.xml')).toContain(
      `<file href="content/web/${web.id}/index.html"/>`,
    );
  });
});

describe('SCORM 1.2 and the library’s notices (P9.8)', () => {
  it('lists the notices file in the manifest', async () => {
    const project = course();
    project.scenes[0]!.slides[0]!.baseLayer.objects.push(
      createGraphicObject({
        library: 'lucide',
        key: 'heart',
        title: 'Heart',
        viewBox: { width: 24, height: 24 },
        strokeWidth: 2,
        nodes: [{ tag: 'circle', attrs: { r: '8' }, children: [] }],
      }),
    );
    const { written } = await publish(project, { notices: { lucide: 'ISC License' } });
    expect(written.get('imsmanifest.xml')).toContain('<file href="THIRD-PARTY-NOTICES.txt"/>');
  });
});

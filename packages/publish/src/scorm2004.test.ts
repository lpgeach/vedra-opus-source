import { createEmptyProject, createScene, createSlide } from '@vedraopus/model';
import type { Project } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import {
  indexHtml,
  PublishCancelled,
  publishScorm2004,
  scorm2004Manifest,
  scorm2004SchemaFiles,
} from './index';
import type { Scorm2004Edition } from './index';

const HASH = 'd'.repeat(64);

function course(): Project {
  const project = createEmptyProject('Safety & <Health>');
  project.id = 'project_2004_test';
  project.scenes = [{ ...createScene(), slides: [createSlide('A'), createSlide('B')] }];
  project.assets[HASH] = {
    kind: 'image',
    fileName: 'a.png',
    ext: 'png',
    mimeType: 'image/png',
    byteLength: 1,
  };
  return project;
}

async function publish(project: Project, edition?: Scorm2004Edition) {
  const written = new Map<string, string | Uint8Array>();
  const report = await publishScorm2004(project, {
    ...(edition ? { edition } : {}),
    player: { js: 'JS', css: 'CSS' },
    readAsset: async () => new Uint8Array([1]),
    write: async (path, data) => void written.set(path, data),
  });
  return { report, written };
}

describe('SCORM 2004 publishing', () => {
  it('starts the course with the SCORM 2004 driver and the edition published (4th by default)', async () => {
    const { report, written } = await publish(course());
    expect(written.get('index.html')).toContain("lms: 'scorm2004',\n  edition: 4,");
    expect(report.files).toContain('imsmanifest.xml');
    expect(report.files).toContain(`content/assets/${HASH}.png`);
    expect(report.warnings).toEqual([]);
    expect(indexHtml('x', { standard: 'scorm2004', edition: 2 })).toContain('edition: 2,');
    expect(indexHtml('x', { standard: 'scorm12' })).not.toContain('edition');
  });

  it('names each edition and describes one SCO with every course file', async () => {
    const versions = { 2: 'CAM 1.3', 3: '2004 3rd Edition', 4: '2004 4th Edition' };
    for (const edition of [2, 3, 4] as const) {
      const { written } = await publish(course(), edition);
      const xml = written.get('imsmanifest.xml') as string;
      expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
      expect(xml).toContain(`<schemaversion>${versions[edition]}</schemaversion>`);
      expect(xml).toContain('xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"');
      expect(xml).toContain('adlcp:scormType="sco" href="index.html"');
      expect(xml).toContain('<title>Safety &amp; &lt;Health&gt;</title>');
      for (const file of ['index.html', 'content/data.js', 'player/player.js']) {
        expect(xml).toContain(`<file href="${file}"/>`);
      }
      expect(xml).toContain(`<file href="content/assets/${HASH}.png"/>`);
      expect(xml.match(/<item /g)).toHaveLength(1);
      expect(xml.match(/<resource /g)).toHaveLength(1);
      const id = /identifierref="([^"]+)"/.exec(xml)![1];
      expect(xml).toContain(`<resource identifier="${id}"`);
    }
  });

  it('leaves completion to the course and hides the LMS’s own navigation', () => {
    const xml = scorm2004Manifest(course(), 'T', ['index.html']);
    expect(xml).toContain(
      '<imsss:deliveryControls completionSetByContent="true" objectiveSetByContent="true"/>',
    );
    expect(xml).toContain('<imsss:controlMode choice="true" flow="true"/>');
    expect(xml).toContain('<adlnav:hideLMSUI>previous</adlnav:hideLMSUI>');
    expect(xml).toContain('<adlnav:hideLMSUI>continue</adlnav:hideLMSUI>');
    // Item sequencing comes before presentation, both inside the item.
    const item = xml.slice(xml.indexOf('<item '), xml.indexOf('</item>'));
    expect(item.indexOf('<imsss:sequencing>')).toBeLessThan(item.indexOf('<adlnav:presentation>'));
  });

  it('ships the 2nd and 4th editions’ schema files the manifest names, outside the SCO', async () => {
    for (const edition of [2, 4] as const) {
      const { report, written } = await publish(course(), edition);
      const xml = written.get('imsmanifest.xml') as string;
      const location = /xsi:schemaLocation="([^"]+)"/.exec(xml)![1]!.split(/\s+/);
      expect(location).toHaveLength(10);
      for (let i = 0; i < location.length; i += 2) {
        const [namespace, file] = [location[i]!, location[i + 1]!];
        expect(xml).toMatch(new RegExp(`xmlns(:\\w+)?="${namespace}"`));
        expect(report.files).toContain(file);
        expect(written.get(file)).toMatch(new RegExp(`targetNamespace\\s*=\\s*"${namespace}"`));
      }
      // Everything the schemas include or import is shipped too.
      const schemas = scorm2004SchemaFiles(edition);
      for (const text of Object.values(schemas)) {
        for (const [, file] of text.matchAll(
          /<xs[d]?:(?:include|import)[^>]*schemaLocation\s*=\s*"([^"]+)"/g,
        )) {
          expect(Object.keys(schemas)).toContain(file);
        }
      }
      for (const file of Object.keys(schemas)) {
        expect(written.get(file)).toBe(schemas[file]);
        expect(written.get(file)).not.toContain('\r');
        expect(xml).not.toContain(`<file href="${file}"/>`);
      }
    }
    // The editions differ where the standard changed.
    expect(scorm2004SchemaFiles(2)['adlcp_v1p3.xsd']).not.toBe(
      scorm2004SchemaFiles(4)['adlcp_v1p3.xsd'],
    );
  });

  it('ships no schema files for the 3rd edition, and so names none', async () => {
    const { report, written } = await publish(course(), 3);
    expect(scorm2004SchemaFiles(3)).toEqual({});
    expect(report.files.filter((f) => /\.(xsd|dtd)$/.test(f))).toEqual([]);
    expect(written.get('imsmanifest.xml')).not.toContain('schemaLocation');
  });

  it('warns when a long session might not fit the 2nd edition’s 4,000 characters', async () => {
    const big = course();
    big.scenes[0]!.slides = Array.from({ length: 2000 }, (_, i) => createSlide(`S${i}`));
    const second = await publish(big, 2);
    expect(second.report.suspendEstimate).toBeGreaterThan(4000);
    expect(second.report.suspendEstimate).toBeLessThan(64000);
    expect(second.report.warnings).toEqual([expect.stringContaining('keeps 4,000')]);
    const fourth = await publish(big, 4);
    expect(fourth.report.warnings).toEqual([]);
  });

  it('stops when cancelled', async () => {
    const written: string[] = [];
    const signal = { aborted: false };
    const result = publishScorm2004(course(), {
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
});

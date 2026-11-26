import { createEmptyProject, defaultPublishSettings } from '@vedraopus/model';
import type { PublishSettings } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { checkPublishSettings, defaultIdentifier, publishCourse, settingsFields } from './index';

const project = () => {
  const p = createEmptyProject('Safety');
  p.id = 'project_1';
  return p;
};

async function publish(settings: Partial<PublishSettings>) {
  const written = new Map<string, string | Uint8Array>();
  const report = await publishCourse(
    project(),
    { ...defaultPublishSettings(), ...settings },
    {
      player: { js: 'JS', css: 'CSS' },
      readAsset: async () => new Uint8Array([1]),
      write: async (path, data) => void written.set(path, data),
    },
  );
  const text = (path: string) => written.get(path) as string;
  return { report, written, text };
}

describe('publishing for the target in the settings', () => {
  it('builds each target’s package', async () => {
    const marker: Record<PublishSettings['target'], string | null> = {
      web: null,
      scorm12: 'imsmanifest.xml',
      scorm2004: 'imsmanifest.xml',
      xapi: 'tincan.xml',
      cmi5: 'cmi5.xml',
    };
    for (const [target, file] of Object.entries(marker) as [
      PublishSettings['target'],
      string | null,
    ][]) {
      const { report, text } = await publish({ target });
      expect(report.files).toContain('index.html');
      if (file) expect(report.files).toContain(file);
      else expect(report.files.some((f) => /\.xml$/.test(f))).toBe(false);
      expect(text('index.html')).toContain(target === 'web' ? 'startCourse(' : `lms: '${target}'`);
    }
    const second = await publish({ target: 'scorm2004', scorm2004Edition: 2 });
    expect(second.text('imsmanifest.xml')).toContain('<schemaversion>CAM 1.3</schemaversion>');
  });

  it('uses the title, identifier, version and description where each target keeps them', async () => {
    const scorm = await publish({
      target: 'scorm12',
      title: 'Fire safety',
      identifier: 'fire.v2',
      version: '2.1',
    });
    expect(scorm.text('imsmanifest.xml')).toContain('<manifest identifier="fire.v2" version="2.1"');
    expect(scorm.text('imsmanifest.xml')).toContain('<title>Fire safety</title>');
    expect(scorm.text('index.html')).toContain('<title>Fire safety</title>');
    const fourth = await publish({ target: 'scorm2004', identifier: 'fire', version: '3' });
    expect(fourth.text('imsmanifest.xml')).toContain('<manifest identifier="fire" version="3"');

    const xapi = await publish({
      target: 'xapi',
      identifier: 'https://example.com/fire',
      description: 'About fire',
    });
    expect(xapi.text('tincan.xml')).toContain('<activity id="https://example.com/fire"');
    expect(xapi.text('tincan.xml')).toContain('<description lang="en-US">About fire</description>');
    expect(xapi.text('index.html')).toContain('<meta name="description" content="About fire">');

    const cmi5 = await publish({
      target: 'cmi5',
      identifier: 'https://example.com/fire',
      description: 'About fire',
    });
    expect(cmi5.text('cmi5.xml')).toContain('<au id="https://example.com/fire/au"');
    expect(cmi5.text('cmi5.xml')).toContain('<langstring lang="en-US">About fire</langstring>');

    const web = await publish({
      target: 'web',
      identifier: 'ignored',
      description: 'A <b> course',
    });
    expect(web.text('index.html')).toContain('content="A &lt;b&gt; course"');
    // SCORM has no place for a description.
    const plain = await publish({ target: 'scorm12', description: 'About fire' });
    expect(plain.text('index.html')).not.toContain('meta name="description"');
    // Empty settings mean the defaults.
    expect((await publish({ target: 'scorm12', title: '' })).text('imsmanifest.xml')).toContain(
      '<manifest identifier="vedraopus-project_1" version="1.0"',
    );
  });

  it('refuses settings with a problem before writing anything', async () => {
    const written: string[] = [];
    await expect(
      publishCourse(
        project(),
        { ...defaultPublishSettings(), target: 'xapi', identifier: 'not an iri' },
        {
          player: { js: '', css: '' },
          readAsset: async () => new Uint8Array(),
          write: async (path) => void written.push(path),
        },
      ),
    ).rejects.toThrow('IRI');
    expect(written).toEqual([]);
  });
});

describe('publish settings, field by field', () => {
  const check = (settings: Partial<PublishSettings>) =>
    checkPublishSettings({ ...defaultPublishSettings(), ...settings });

  it('wants an XML name for SCORM, an IRI for xAPI and cmi5, and a SCORM version', () => {
    expect(check({ target: 'scorm12', identifier: 'course_1.a-b' })).toEqual({});
    expect(check({ target: 'scorm12', identifier: '1course' }).identifier).toContain(
      'Start with a letter',
    );
    expect(check({ target: 'scorm2004', identifier: 'has space' }).identifier).toBeDefined();
    expect(check({ target: 'scorm2004', version: ' ' }).version).toContain('Enter a version');
    expect(check({ target: 'xapi', identifier: 'urn:x:1' })).toEqual({});
    expect(check({ target: 'cmi5', identifier: 'course' }).identifier).toContain('IRI');
    // Empty means the default; the web ignores identifiers and versions.
    expect(check({ target: 'cmi5', identifier: '' })).toEqual({});
    expect(check({ target: 'web', identifier: '1 2', version: '' })).toEqual({});
  });

  it('says which fields a target uses, and what an empty identifier means', () => {
    expect(settingsFields('web')).toEqual({
      edition: false,
      identifier: false,
      version: false,
      description: true,
      reporting: false,
    });
    expect(settingsFields('scorm2004')).toEqual({
      edition: true,
      identifier: true,
      version: true,
      description: false,
      reporting: true,
    });
    expect(settingsFields('cmi5')).toMatchObject({ version: false, description: true });
    expect(defaultIdentifier(project(), 'scorm12')).toBe('vedraopus-project_1');
    expect(defaultIdentifier(project(), 'xapi')).toBe('urn:vedraopus:course:project_1');
    expect(defaultIdentifier(project(), 'web')).toBe('');
  });
});

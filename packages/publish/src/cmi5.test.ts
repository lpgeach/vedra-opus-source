import { createEmptyProject } from '@vedraopus/model';
import type { Tracking } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { cmi5Xml, moveOnFor, publishCmi5 } from './index';

async function publish(
  courseId?: string,
  reporting: Tracking['reporting'] = 'completed-incomplete',
) {
  const project = createEmptyProject('Safety & <Health>');
  project.id = 'project_c';
  project.tracking = { ...project.tracking, reporting };
  const written = new Map<string, string | Uint8Array>();
  const report = await publishCmi5(project, {
    ...(courseId !== undefined ? { courseId } : {}),
    player: { js: 'JS', css: 'CSS' },
    readAsset: async () => new Uint8Array([1]),
    write: async (path, data) => void written.set(path, data),
  });
  return { report, written };
}

describe('cmi5 publishing', () => {
  it('writes cmi5.xml with one assignable unit launched from index.html', async () => {
    const { report, written } = await publish('https://example.com/courses/safety');
    expect(report).toMatchObject({
      courseId: 'https://example.com/courses/safety',
      auId: 'https://example.com/courses/safety/au',
      moveOn: 'Completed',
    });
    expect(report.files.at(-1)).toBe('cmi5.xml');
    const xml = written.get('cmi5.xml') as string;
    expect(xml).toContain(
      '<courseStructure xmlns="https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd">',
    );
    expect(xml).toContain('<course id="https://example.com/courses/safety">');
    expect(xml).toContain(
      '<au id="https://example.com/courses/safety/au" moveOn="Completed" launchMethod="AnyWindow">',
    );
    expect(xml).toContain('<url>index.html</url>');
    expect(
      xml.match(
        /<title><langstring lang="en-US">Safety &amp; &lt;Health&gt;<\/langstring><\/title>/g,
      ),
    ).toHaveLength(2);
    // The course reports as the unit.
    expect(written.get('index.html')).toContain(
      `lms: 'cmi5',\n  activityId: "https://example.com/courses/safety/au",`,
    );
  });

  it('turns the reporting pair into moveOn, and defaults the course id', async () => {
    expect(moveOnFor('completed-incomplete')).toBe('Completed');
    expect(moveOnFor('completed-failed')).toBe('Completed');
    expect(moveOnFor('passed-incomplete')).toBe('Passed');
    expect(moveOnFor('passed-failed')).toBe('Passed');
    const { report, written } = await publish(undefined, 'passed-failed');
    expect(report.courseId).toBe('urn:vedraopus:course:project_c');
    expect(written.get('cmi5.xml')).toContain('moveOn="Passed"');
    await expect(publish('safety course')).rejects.toThrow('must be an IRI');
  });

  it('escapes ids and text', () => {
    const xml = cmi5Xml({
      title: '"T"',
      description: 'a & b',
      courseId: 'urn:a?x=1&y=2',
      auId: 'urn:a/au',
      moveOn: 'Completed',
    });
    expect(xml).toContain('<course id="urn:a?x=1&amp;y=2">');
    expect(xml).toContain('<langstring lang="en-US">a &amp; b</langstring>');
    expect(xml).toContain('&quot;T&quot;');
  });
});

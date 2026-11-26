import { createEmptyProject } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { defaultActivityId, indexHtml, publishXapi, tincanXml } from './index';

async function publish(activityId?: string) {
  const project = createEmptyProject('Safety & <Health>');
  project.id = 'project_x 1';
  const written = new Map<string, string | Uint8Array>();
  const report = await publishXapi(project, {
    ...(activityId !== undefined ? { activityId } : {}),
    player: { js: 'JS', css: 'CSS' },
    readAsset: async () => new Uint8Array([1]),
    write: async (path, data) => void written.set(path, data),
  });
  return { project, report, written };
}

describe('xAPI publishing', () => {
  it('writes tincan.xml naming the course activity and the file to launch', async () => {
    const { report, written } = await publish();
    expect(report.activityId).toBe('urn:vedraopus:course:project_x%201');
    expect(report.files.at(-1)).toBe('tincan.xml');
    expect(written.get('tincan.xml')).toBe(`<?xml version="1.0" encoding="UTF-8"?>
<tincan xmlns="http://projecttincan.com/tincan.xsd">
  <activities>
    <activity id="urn:vedraopus:course:project_x%201" type="http://adlnet.gov/expapi/activities/course">
      <name lang="en-US">Safety &amp; &lt;Health&gt;</name>
      <description lang="en-US"></description>
      <launch lang="en-US">index.html</launch>
    </activity>
  </activities>
</tincan>
`);
  });

  it('starts the course with the xAPI driver and the same activity id', async () => {
    const { project, written } = await publish('https://example.com/courses/safety?v=1&x=2');
    const html = written.get('index.html') as string;
    expect(html).toContain(
      `lms: 'xapi',\n  activityId: "https://example.com/courses/safety?v=1&x=2",`,
    );
    expect(written.get('tincan.xml')).toContain(
      'id="https://example.com/courses/safety?v=1&amp;x=2"',
    );
    expect(defaultActivityId(project)).toBe('urn:vedraopus:course:project_x%201');
  });

  it('keeps an activity id from ending the page’s script, and refuses one that is not an IRI', async () => {
    const html = indexHtml('t', { standard: 'xapi', activityId: 'urn:a:</script><b>' });
    expect(html).not.toContain('</script><b>');
    expect(html).toContain('"urn:a:\\u003c/script>\\u003cb>"');
    await expect(publish('not an iri')).rejects.toThrow('must be an IRI');
    await expect(publish('courses/safety')).rejects.toThrow('must be an IRI');
  });

  it('escapes what tincan.xml carries', () => {
    expect(tincanXml('A "quoted" title', 'urn:x', 'Tom & Jerry')).toContain(
      '<name lang="en-US">A &quot;quoted&quot; title</name>',
    );
    expect(tincanXml('t', 'urn:x', 'Tom & Jerry')).toContain('>Tom &amp; Jerry<');
  });
});

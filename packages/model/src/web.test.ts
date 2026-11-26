import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  createWebObject,
  parseProject,
  ProjectValidationError,
  WEB_PATH,
} from './index';
import type { Project } from './index';

/** Web objects (docs/briefs/P9.6-web-objects.md). */

const issues = (project: Project): string[] => {
  try {
    parseProject(JSON.parse(JSON.stringify(project)));
    return [];
  } catch (error) {
    if (error instanceof ProjectValidationError) return error.issues.map((issue) => issue.path);
    throw error;
  }
};

const PAGE = 'a'.repeat(64);
const SCRIPT = 'b'.repeat(64);

function course() {
  const project = createEmptyProject();
  for (const [hash, name, ext] of [
    [PAGE, 'index.html', 'html'],
    [SCRIPT, 'app.js', 'js'],
  ] as const) {
    project.assets[hash] = {
      kind: 'file',
      fileName: name,
      ext,
      mimeType: 'text/plain',
      byteLength: 1,
    };
  }
  return project;
}
const at = 'scenes[0].slides[0].baseLayer.objects[0].props.source';

describe('web objects in the model', () => {
  it('load http and https addresses only', () => {
    for (const url of ['https://example.com/page', 'http://example.com']) {
      const project = course();
      project.scenes[0]!.slides[0]!.baseLayer.objects.push(createWebObject({ kind: 'url', url }));
      expect(issues(project), url).toEqual([]);
    }
    for (const url of [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'mailto:a@b.example',
      'example.com',
    ]) {
      const project = course();
      project.scenes[0]!.slides[0]!.baseLayer.objects.push(createWebObject({ kind: 'url', url }));
      expect(issues(project), url).toContain(`${at}.url`);
    }
  });

  it('hold a folder of the project’s files by safe paths, starting at one of them', () => {
    const project = course();
    const web = createWebObject({
      kind: 'folder',
      files: { 'index.html': PAGE, 'js/app.js': SCRIPT },
      entry: 'index.html',
    });
    project.scenes[0]!.slides[0]!.baseLayer.objects.push(web);
    expect(issues(project)).toEqual([]);
    if (web.props.source.kind !== 'folder') throw new Error('folder');
    web.props.source.entry = 'missing.html';
    expect(issues(project)).toContain(`${at}.entry`);
    web.props.source.entry = 'index.html';
    web.props.source.files['extra.css'] = 'c'.repeat(64);
    expect(issues(project).some((path) => path.startsWith(`${at}.files`))).toBe(true);
  });

  it('refuse paths that climb out, start at the root, or use backslashes', () => {
    for (const ok of ['index.html', 'js/app.js', 'a b/c.png', 'deep/er/x.json'])
      expect(WEB_PATH.test(ok), ok).toBe(true);
    for (const bad of [
      '../x.html',
      'a/../x',
      '/abs.html',
      'a\\b.js',
      'a//b',
      '',
      './x',
      'c:x',
      'a/.',
    ]) {
      expect(WEB_PATH.test(bad), bad).toBe(false);
    }
  });
});

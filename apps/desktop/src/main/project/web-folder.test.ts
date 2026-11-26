import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { importWebFolder, WebFolderError } from './web-folder';

/** A web object's folder copied into the project (docs/briefs/P9.6-web-objects.md). */

let temp = '';
beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'vo-web-folder-'));
});
afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

async function folder(files: Record<string, string>): Promise<string> {
  const root = join(temp, 'site');
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(root, ...path.split('/').slice(0, -1)), { recursive: true });
    await writeFile(join(root, ...path.split('/')), text);
  }
  return root;
}

describe('importWebFolder', () => {
  it('copies every file by its path, starting at index.html, kinds of file with their own extensions', async () => {
    const root = await folder({
      'index.html': '<p>Hi</p>',
      'js/app.js': 'console.log(1)',
      'css/site.css': 'p{}',
      LICENSE: 'MIT',
    });
    const workspace = join(temp, 'work');
    const imported = await importWebFolder(workspace, root);
    expect(imported.entry).toBe('index.html');
    const byPath = new Map(imported.files.map((file) => [file.path, file]));
    expect([...byPath.keys()].sort()).toEqual([
      'LICENSE',
      'css/site.css',
      'index.html',
      'js/app.js',
    ]);
    expect(byPath.get('js/app.js')!.meta).toMatchObject({
      kind: 'file',
      ext: 'js',
      fileName: 'app.js',
    });
    // A file with no extension is kept as .bin.
    expect(byPath.get('LICENSE')!.meta.ext).toBe('bin');
    expect((await readdir(join(workspace, 'assets'))).length).toBe(4);
  });

  it('starts at another page at the top when there is no index.html, and refuses a folder with none', async () => {
    const one = await folder({ 'start.html': '<p></p>', 'sub/index.html': '<p></p>' });
    expect((await importWebFolder(join(temp, 'w1'), one)).entry).toBe('start.html');
    await rm(one, { recursive: true });
    const none = await folder({ 'sub/page.html': '<p></p>', 'a.txt': 'x' });
    await expect(importWebFolder(join(temp, 'w2'), none)).rejects.toThrow(WebFolderError);
  });

  it('refuses an empty folder', async () => {
    const empty = join(temp, 'empty');
    await mkdir(empty);
    await expect(importWebFolder(join(temp, 'w'), empty)).rejects.toThrow('The folder is empty.');
  });
});

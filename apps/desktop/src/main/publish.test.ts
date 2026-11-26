import { createEmptyProject, defaultPublishSettings } from '@vedraopus/model';
import type { Project, PublishSettings } from '@vedraopus/model';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import yauzl from 'yauzl';
import { PublishFolders, REMEMBERED_FOLDERS } from './publish-folders';
import { courseFolderName, findPlayerDir, publishProject } from './publish';

const HASH = 'b'.repeat(64);
let root: string;
let workspace: string;
let out: string;
let player: string;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'vedraopus-publish-test-'));
  workspace = join(root, 'ws');
  out = join(root, 'out');
  player = join(root, 'player');
  await mkdir(join(workspace, 'assets'), { recursive: true });
  await mkdir(out, { recursive: true });
  await mkdir(player, { recursive: true });
  writeFileSync(join(workspace, 'assets', `${HASH}.png`), Buffer.from([9, 8, 7]));
  writeFileSync(join(player, 'player.js'), 'JS');
  writeFileSync(join(player, 'player.css'), 'CSS');
});
afterEach(() => rm(root, { recursive: true, force: true }));

function project(): Project {
  const p = createEmptyProject('My Course!');
  p.assets[HASH] = {
    kind: 'image',
    fileName: 'a.png',
    ext: 'png',
    mimeType: 'image/png',
    byteLength: 3,
  };
  return p;
}
const run = (
  extra: Partial<Parameters<typeof publishProject>[0]> = {},
  settings: Partial<PublishSettings> = {},
) =>
  publishProject({
    project: project(),
    workspaceDir: workspace,
    parentFolder: out,
    settings: { ...defaultPublishSettings(), ...settings },
    playerDir: player,
    ...extra,
  });

/** Each entry of a zip: its name, how it is stored (0 stored, 8 deflated), and its bytes. */
function readZip(file: string): Promise<{ name: string; method: number; data: Buffer }[]> {
  return new Promise((done, fail) => {
    yauzl.open(file, { lazyEntries: true }, (error, zip) => {
      if (error) return fail(error);
      const entries: { name: string; method: number; data: Buffer }[] = [];
      zip.on('entry', (entry: yauzl.Entry) => {
        zip.openReadStream(entry, (err, stream) => {
          if (err) return fail(err);
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('end', () => {
            entries.push({
              name: entry.fileName,
              method: entry.compressionMethod,
              data: Buffer.concat(chunks),
            });
            zip.readEntry();
          });
        });
      });
      zip.on('end', () => done(entries));
      zip.on('error', fail);
      zip.readEntry();
    });
  });
}

describe('publishProject', () => {
  it('names the course folder from the title', () => {
    expect(courseFolderName('My Course!')).toBe('my-course');
    expect(courseFolderName('  ../../Évil  ')).toBe('vil');
    expect(courseFolderName('???')).toBe('course');
  });

  it('writes the course into a folder of its own and leaves no staging folder', async () => {
    const result = await run();
    expect(result).toEqual({
      status: 'done',
      kind: 'folder',
      path: join(out, 'my-course'),
      files: 5,
      warnings: [],
    });
    expect(readdirSync(out)).toEqual(['my-course']);
    const folder = join(out, 'my-course');
    expect(readFileSync(join(folder, 'player', 'player.js'), 'utf8')).toBe('JS');
    expect([...readFileSync(join(folder, 'content', 'assets', `${HASH}.png`))]).toEqual([9, 8, 7]);
    expect(readFileSync(join(folder, 'index.html'), 'utf8')).toContain('<title>My Course!</title>');
  });

  it('replaces an earlier publish of the same course whole', async () => {
    await run();
    writeFileSync(join(out, 'my-course', 'stale.txt'), 'old');
    await run();
    expect(existsSync(join(out, 'my-course', 'stale.txt'))).toBe(false);
    expect(existsSync(join(out, 'my-course', 'index.html'))).toBe(true);
  });

  it('never touches a folder that is not an earlier publish', async () => {
    await mkdir(join(out, 'my-course'));
    writeFileSync(join(out, 'my-course', 'mine.txt'), 'keep');
    await expect(run()).rejects.toThrow(/not a published course/);
    expect(readFileSync(join(out, 'my-course', 'mine.txt'), 'utf8')).toBe('keep');
    expect(readdirSync(out)).toEqual(['my-course']);
  });

  it('leaves nothing behind when cancelled or when it fails', async () => {
    const signal = { aborted: true };
    expect(await run({ signal })).toEqual({ status: 'cancelled' });
    expect(readdirSync(out)).toEqual([]);

    await rm(join(workspace, 'assets', `${HASH}.png`));
    await expect(run()).rejects.toThrow();
    expect(readdirSync(out)).toEqual([]);
  });

  it('reports progress as files are written', async () => {
    const seen: number[] = [];
    await run({ onProgress: (done) => seen.push(done) });
    expect(seen).toEqual([1, 2, 3, 4, 5]);
  });

  it('publishes the target in the settings, named by the publish title', async () => {
    const result = await run({}, { target: 'scorm12', title: 'Fire Safety' });
    expect(result).toMatchObject({ status: 'done', path: join(out, 'fire-safety'), files: 10 });
    expect(readFileSync(join(out, 'fire-safety', 'imsmanifest.xml'), 'utf8')).toContain(
      '<title>Fire Safety</title>',
    );
  });

  it('writes a zip with the package at its root, text deflated and pictures stored', async () => {
    const result = await run({}, { target: 'scorm12', zip: true });
    expect(result).toMatchObject({
      status: 'done',
      kind: 'zip',
      path: join(out, 'my-course.zip'),
      files: 10,
    });
    expect(readdirSync(out)).toEqual(['my-course.zip']);
    const entries = await readZip(join(out, 'my-course.zip'));
    const names = entries.map((e) => e.name).sort();
    expect(names).toEqual(
      [
        'adlcp_rootv1p2.xsd',
        `content/assets/${HASH}.png`,
        'content/data.js',
        'imscp_rootv1p1p2.xsd',
        'ims_xml.xsd',
        'imsmanifest.xml',
        'imsmd_rootv1p2p1.xsd',
        'index.html',
        'player/player.css',
        'player/player.js',
      ].sort(),
    );
    const byName = new Map(entries.map((e) => [e.name, e]));
    expect(byName.get('imsmanifest.xml')!.method).toBe(8);
    expect(byName.get('imsmanifest.xml')!.data.toString('utf8')).toContain('<manifest identifier=');
    expect(byName.get(`content/assets/${HASH}.png`)!.method).toBe(0);
    expect([...byName.get(`content/assets/${HASH}.png`)!.data]).toEqual([9, 8, 7]);
  });

  it('replaces an earlier zip, but never a file that is not a zip', async () => {
    writeFileSync(join(out, 'my-course.zip'), 'my notes');
    await expect(run({}, { zip: true })).rejects.toThrow(/not a zip file/);
    expect(readFileSync(join(out, 'my-course.zip'), 'utf8')).toBe('my notes');
    expect(readdirSync(out)).toEqual(['my-course.zip']);

    await rm(join(out, 'my-course.zip'));
    await run({}, { zip: true });
    const first = readFileSync(join(out, 'my-course.zip'));
    await run({}, { zip: true, target: 'xapi' });
    expect(readFileSync(join(out, 'my-course.zip')).equals(first)).toBe(false);
    expect((await readZip(join(out, 'my-course.zip'))).map((e) => e.name)).toContain('tincan.xml');
    expect(readdirSync(out)).toEqual(['my-course.zip']);
  });

  it('leaves no zip or staging behind when a zip publish is cancelled or fails', async () => {
    expect(await run({ signal: { aborted: true } }, { zip: true })).toEqual({
      status: 'cancelled',
    });
    expect(readdirSync(out)).toEqual([]);
    await expect(run({}, { zip: true, target: 'xapi', identifier: 'not an iri' })).rejects.toThrow(
      'IRI',
    );
    expect(readdirSync(out)).toEqual([]);
  });

  it('finds the built player or says it is missing', () => {
    expect(findPlayerDir([join(root, 'nope'), player])).toBe(player);
    expect(() => findPlayerDir([join(root, 'nope')])).toThrow(/not been built/);
  });
});

describe('remembered publish folders', () => {
  it('remembers the last folder per project, across restarts', () => {
    const file = join(root, 'publish-folders.json');
    const folders = new PublishFolders(file);
    expect(folders.get('project_a')).toBeNull();
    folders.remember('project_a', '/courses/a');
    folders.remember('project_b', '/courses/b');
    folders.remember('project_a', '/courses/a2');
    const again = new PublishFolders(file);
    expect(again.get('project_a')).toBe('/courses/a2');
    expect(again.get('project_b')).toBe('/courses/b');
  });

  it('forgets the least recently published past the limit, and survives a damaged file', () => {
    const file = join(root, 'publish-folders.json');
    const folders = new PublishFolders(file);
    for (let i = 0; i <= REMEMBERED_FOLDERS; i++) folders.remember(`project_${i}`, `/f/${i}`);
    const again = new PublishFolders(file);
    expect(again.get('project_0')).toBeNull();
    expect(again.get('project_1')).toBe('/f/1');
    expect(again.get(`project_${REMEMBERED_FOLDERS}`)).toBe(`/f/${REMEMBERED_FOLDERS}`);

    writeFileSync(file, '{ not json');
    expect(new PublishFolders(file).get('project_1')).toBeNull();
    writeFileSync(file, JSON.stringify({ folders: [{ projectId: 1 }] }));
    expect(new PublishFolders(file).get('project_1')).toBeNull();
  });
});

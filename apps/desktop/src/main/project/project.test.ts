import { createEmptyProject, parseProject, ProjectValidationError } from '@vedraopus/model';
import type { Project } from '@vedraopus/model';
import { createWriteStream, existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ZipFile } from 'yazl';
import { importAsset, readImageSize, storeRecording, UnsupportedAssetError } from './assets';
import { ContainerError, packContainer, unpackContainer } from './container';
import type { ContainerMeta } from './container';
import { addRecent, readRecent } from './recent';
import {
  createWorkspace,
  findRecoverableWorkspaces,
  writeWorkspaceInfo,
  writeWorkspaceProject,
} from './workspace';

const fixtureDir = join(import.meta.dirname, '../../../../../fixtures/projects/two-slides');
const meta: ContainerMeta = {
  formatVersion: 1,
  appVersion: '0.0.0-test',
  createdAt: '2026-01-01T00:00:00.000Z',
  modifiedAt: '2026-01-01T00:00:00.000Z',
};

let temp: string;
beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'vedraopus-test-'));
});
afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

/** A workspace directory holding a copy of the two-slides fixture. */
async function fixtureWorkspace(): Promise<{ dir: string; project: Project }> {
  const dir = join(temp, 'source-workspace');
  await cp(fixtureDir, dir, { recursive: true });
  const project = parseProject(JSON.parse(await readFile(join(dir, 'project.json'), 'utf8')));
  return { dir, project };
}

/** Build a zip from in-memory entries, optionally doctoring the bytes before writing. */
async function writeZip(
  target: string,
  entries: Record<string, string>,
  doctor: (bytes: Buffer) => Buffer = (bytes) => bytes,
): Promise<void> {
  const zip = new ZipFile();
  for (const [name, content] of Object.entries(entries)) zip.addBuffer(Buffer.from(content), name);
  zip.end();
  const raw = join(temp, 'raw.zip');
  await pipeline(zip.outputStream, createWriteStream(raw));
  await writeFile(target, doctor(await readFile(raw)));
}

describe('container', () => {
  it('round-trips a project and its assets through a .vedraopus file', async () => {
    const { dir, project } = await fixtureWorkspace();
    const file = join(temp, 'course.vedraopus');
    await packContainer(project, dir, file, meta);

    const opened = join(temp, 'opened');
    expect(await unpackContainer(file, opened)).toEqual(project);
    const [hash] = Object.keys(project.assets);
    expect(await readFile(join(opened, 'assets', `${hash}.png`))).toEqual(
      await readFile(join(dir, 'assets', `${hash}.png`)),
    );
    expect(JSON.parse(await readFile(join(opened, 'meta.json'), 'utf8'))).toEqual(meta);
  });

  it('leaves no temporary files beside a saved file', async () => {
    const { dir, project } = await fixtureWorkspace();
    const out = join(temp, 'out');
    await mkdir(out);
    await packContainer(project, dir, join(out, 'course.vedraopus'), meta);
    expect(await readdir(out)).toEqual(['course.vedraopus']);
  });

  it('does not write assets the project no longer lists', async () => {
    const { dir, project } = await fixtureWorkspace();
    const orphan = `${'b'.repeat(64)}.png`;
    await writeFile(join(dir, 'assets', orphan), 'orphan');
    const file = join(temp, 'course.vedraopus');
    await packContainer(project, dir, file, meta);

    const opened = join(temp, 'opened');
    await unpackContainer(file, opened);
    expect(await readdir(join(opened, 'assets'))).not.toContain(orphan);
    expect(await readdir(join(opened, 'assets'))).toHaveLength(1);
  });

  it('leaves the existing file intact when a save fails', async () => {
    const { dir, project } = await fixtureWorkspace();
    const out = join(temp, 'out');
    await mkdir(out);
    const file = join(out, 'course.vedraopus');
    await packContainer(project, dir, file, meta);
    const good = await readFile(file);

    // The project lists an asset whose file is missing, so packing must fail part-way.
    const broken: Project = {
      ...project,
      assets: {
        ...project.assets,
        ['c'.repeat(64)]: {
          kind: 'image',
          fileName: 'gone.png',
          ext: 'png',
          mimeType: 'image/png',
          byteLength: 1,
        },
      },
    };
    await expect(packContainer(broken, dir, file, meta)).rejects.toThrow();
    expect(await readFile(file)).toEqual(good);
    expect(await readdir(out)).toEqual(['course.vedraopus']);
  });

  it('refuses entries that try to escape the workspace', async () => {
    const file = join(temp, 'evil.vedraopus');
    // yazl will not write a ".." path, so write a placeholder of the same length and patch the bytes.
    await writeZip(
      file,
      { 'project.json': JSON.stringify(createEmptyProject()), 'xx/evil.txt': 'pwned' },
      (bytes) =>
        Buffer.from(bytes.toString('latin1').replaceAll('xx/evil.txt', '../evil.txt'), 'latin1'),
    );
    expect((await readFile(file)).includes('../evil.txt')).toBe(true);

    const workspace = join(temp, 'nested', 'workspace');
    await expect(unpackContainer(file, workspace)).rejects.toThrow(ContainerError);
    expect(existsSync(join(dirname(workspace), 'evil.txt'))).toBe(false);
  });

  it('ignores entries it does not recognise instead of extracting them', async () => {
    const file = join(temp, 'extras.vedraopus');
    const project = createEmptyProject();
    await writeZip(file, {
      'project.json': JSON.stringify(project),
      'thumbs/slide.png': 'cache',
      'assets/not-a-hash.exe': 'nope',
      'assets/sub/deep.png': 'nope',
      'README.txt': 'hello',
    });
    const workspace = join(temp, 'workspace');
    expect(await unpackContainer(file, workspace)).toEqual(project);
    expect((await readdir(workspace)).sort()).toEqual(['assets', 'project.json']);
    expect(await readdir(join(workspace, 'assets'))).toEqual([]);
  });

  it('explains files that are not projects', async () => {
    const notZip = join(temp, 'not-a-zip.vedraopus');
    await writeFile(notZip, 'just some text');
    await expect(unpackContainer(notZip, join(temp, 'w1'))).rejects.toThrow(
      /not an Vedra Opus project/,
    );

    const noProject = join(temp, 'empty.vedraopus');
    await writeZip(noProject, { 'meta.json': '{}' });
    await expect(unpackContainer(noProject, join(temp, 'w2'))).rejects.toThrow(
      /does not contain an Vedra Opus project/,
    );

    const badJson = join(temp, 'bad-json.vedraopus');
    await writeZip(badJson, { 'project.json': '{ nope' });
    await expect(unpackContainer(badJson, join(temp, 'w3'))).rejects.toThrow(/damaged/);

    const invalid = join(temp, 'invalid.vedraopus');
    await writeZip(invalid, { 'project.json': JSON.stringify({ formatVersion: 1 }) });
    await expect(unpackContainer(invalid, join(temp, 'w4'))).rejects.toThrow(
      ProjectValidationError,
    );
  });
});

describe('asset import', () => {
  it('stores a file under its hash and describes it', async () => {
    const { dir, project } = await fixtureWorkspace();
    const [hash, expected] = Object.entries(project.assets)[0]!;
    const source = join(temp, 'blue-square.png');
    await cp(join(dir, 'assets', `${hash}.png`), source);

    const workspace = join(temp, 'fresh');
    const imported = await importAsset(workspace, source);
    expect(imported).toEqual({ hash, meta: expected });
    expect(await readdir(join(workspace, 'assets'))).toEqual([`${hash}.png`]);
  });

  it('stores identical bytes once, whatever the file is called', async () => {
    const workspace = join(temp, 'fresh');
    const first = join(temp, 'one.PNG');
    const second = join(temp, 'two.png');
    await writeFile(first, 'same bytes');
    await writeFile(second, 'same bytes');

    const a = await importAsset(workspace, first);
    const b = await importAsset(workspace, second);
    expect(b.hash).toBe(a.hash);
    expect(a.meta.ext).toBe('png');
    expect(await readdir(join(workspace, 'assets'))).toHaveLength(1);
  });

  it('keeps a recording as audio under its hash, once, and refuses an empty one', async () => {
    const workspace = join(temp, 'fresh');
    const bytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]);
    const at = new Date(2026, 10, 17, 14, 5, 9);
    const first = await storeRecording(workspace, bytes, at);
    expect(first.meta).toEqual({
      kind: 'audio',
      fileName: 'Recording 14:05:09.webm',
      ext: 'webm',
      mimeType: 'audio/webm',
      byteLength: 7,
    });
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    const again = await storeRecording(workspace, bytes, at);
    expect(again.hash).toBe(first.hash);
    expect(await readdir(join(workspace, 'assets'))).toEqual([`${first.hash}.webm`]);
    await expect(storeRecording(workspace, new Uint8Array(), at)).rejects.toThrow('empty');
  });

  it('takes documents and pictures as resource files, and never pages or scripts (P8.2)', async () => {
    const workspace = join(temp, 'fresh');
    const pdf = join(temp, 'Guide.PDF');
    await writeFile(pdf, '%PDF-1.4');
    // Not as media for the stage.
    await expect(importAsset(workspace, pdf)).rejects.toThrow(UnsupportedAssetError);
    const imported = await importAsset(workspace, pdf, undefined, 'resource');
    expect(imported.meta).toEqual({
      kind: 'file',
      fileName: 'Guide.PDF',
      ext: 'pdf',
      mimeType: 'application/pdf',
      byteLength: 8,
    });
    const picture = join(temp, 'chart.gif');
    await writeFile(picture, 'GIF89a');
    expect((await importAsset(workspace, picture, undefined, 'resource')).meta.kind).toBe('image');
    // SVG too: opened as a page, its scripts would run.
    for (const name of ['page.html', 'run.js', 'drawing.svg', 'tune.mp3', 'setup.exe']) {
      const source = join(temp, name);
      await writeFile(source, 'x');
      await expect(importAsset(workspace, source, undefined, 'resource')).rejects.toThrow(
        UnsupportedAssetError,
      );
    }
  });

  it('refuses file types that are not on the list', async () => {
    const source = join(temp, 'script.exe');
    await writeFile(source, 'MZ');
    await expect(importAsset(join(temp, 'fresh'), source)).rejects.toThrow(UnsupportedAssetError);
    expect(existsSync(join(temp, 'fresh'))).toBe(false);
  });

  it('reads pixel sizes from PNG, GIF and JPEG headers and gives up politely otherwise', () => {
    const png = Buffer.alloc(24);
    png.writeUInt32BE(0x89504e47, 0);
    png.write('IHDR', 12, 'latin1');
    png.writeUInt32BE(640, 16);
    png.writeUInt32BE(480, 20);
    expect(readImageSize(png)).toEqual({ width: 640, height: 480 });

    const gif = Buffer.alloc(10);
    gif.write('GIF89a', 0, 'latin1');
    gif.writeUInt16LE(320, 6);
    gif.writeUInt16LE(200, 8);
    expect(readImageSize(gif)).toEqual({ width: 320, height: 200 });

    // SOI, an APP0 segment of 16 bytes, then SOF0 carrying height 600 and width 800.
    const jpeg = Buffer.from([
      0xff,
      0xd8,
      0xff,
      0xe0,
      0x00,
      0x10,
      ...new Array<number>(14).fill(0),
      0xff,
      0xc0,
      0x00,
      0x11,
      0x08,
      0x02,
      0x58,
      0x03,
      0x20,
      0x03,
      0x00,
      0x00,
    ]);
    expect(readImageSize(jpeg)).toEqual({ width: 800, height: 600 });

    expect(readImageSize(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeUndefined();
    expect(readImageSize(Buffer.alloc(0))).toBeUndefined();
  });
});

describe('workspaces', () => {
  it('offers workspaces with unsaved changes for recovery and deletes the rest', async () => {
    const root = join(temp, 'workspaces');
    const project = createEmptyProject('Unsaved Work');

    const dirty = await createWorkspace(root);
    await writeWorkspaceProject(dirty, project);
    await writeWorkspaceInfo(dirty, {
      sourcePath: '/somewhere/course.vedraopus',
      dirty: true,
      modifiedAt: '2026-02-02T10:00:00.000Z',
    });

    const clean = await createWorkspace(root);
    await writeWorkspaceProject(clean, project);
    await writeWorkspaceInfo(clean, {
      sourcePath: null,
      dirty: false,
      modifiedAt: '2026-02-02T09:00:00.000Z',
    });

    const unreadable = await createWorkspace(root);
    await writeFile(join(unreadable.dir, 'project.json'), '{ nope');
    await writeWorkspaceInfo(unreadable, {
      sourcePath: null,
      dirty: true,
      modifiedAt: '2026-02-02T08:00:00.000Z',
    });

    // A workspace that crashed before its bookkeeping was written, and a stray folder.
    await createWorkspace(root);
    await mkdir(join(root, 'not-a-workspace'));

    const found = await findRecoverableWorkspaces(root);
    expect(found).toEqual([
      {
        id: dirty.id,
        dir: dirty.dir,
        title: 'Unsaved Work',
        sourcePath: '/somewhere/course.vedraopus',
        dirty: true,
        modifiedAt: '2026-02-02T10:00:00.000Z',
      },
    ]);
    expect(await readdir(root)).toEqual([dirty.id]);
  });

  it('returns nothing when there is no workspace folder yet', async () => {
    expect(await findRecoverableWorkspaces(join(temp, 'missing'))).toEqual([]);
  });
});

describe('recent files', () => {
  it('lists most recent first, without duplicates, capped, dropping missing files', async () => {
    const list = join(temp, 'recent.json');
    const files: string[] = [];
    for (let i = 0; i < 12; i++) {
      const file = join(temp, `course-${i}.vedraopus`);
      await writeFile(file, '');
      files.push(file);
      await addRecent(list, file);
    }
    await addRecent(list, files[5]!);

    const recent = await readRecent(list);
    expect(recent).toHaveLength(10);
    expect(recent[0]).toBe(files[5]);
    expect(recent[1]).toBe(files[11]);
    expect(new Set(recent).size).toBe(10);

    await rm(files[11]!);
    expect(await readRecent(list)).not.toContain(files[11]);
  });

  it('treats a missing or corrupt list as empty', async () => {
    expect(await readRecent(join(temp, 'none.json'))).toEqual([]);
    await writeFile(join(temp, 'bad.json'), 'not json');
    expect(await readRecent(join(temp, 'bad.json'))).toEqual([]);
  });
});

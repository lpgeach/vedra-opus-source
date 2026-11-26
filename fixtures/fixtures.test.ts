import {
  defaultPublishSettings,
  FORMAT_VERSION,
  parseProject,
  serializeProject,
} from '@vedraopus/model';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = import.meta.dirname;
const dirsIn = (folder: string) =>
  readdirSync(join(root, folder), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, dir: join(root, folder, entry.name) }));
const readJson = (dir: string): unknown =>
  JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));

describe.each(dirsIn('projects'))('fixtures/projects/$name', ({ dir }) => {
  it('is a valid current-format project', () => {
    const project = parseProject(readJson(dir));
    expect(project.formatVersion).toBe(FORMAT_VERSION);
  });

  it('round-trips through save and load unchanged', () => {
    const raw = readJson(dir);
    const project = parseProject(raw);
    expect(JSON.parse(serializeProject(project))).toEqual(raw);
  });

  it('has every asset it lists, stored under its real hash', () => {
    const project = parseProject(readJson(dir));
    for (const [hash, meta] of Object.entries(project.assets)) {
      const file = join(dir, 'assets', `${hash}.${meta.ext}`);
      expect(existsSync(file), `${file} exists`).toBe(true);
      const bytes = readFileSync(file);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(hash);
      expect(bytes.byteLength).toBe(meta.byteLength);
    }
  });
});

describe.each(dirsIn('legacy'))('fixtures/legacy/$name', ({ dir }) => {
  it('is in an older format and still loads through the migrations', () => {
    const raw = readJson(dir) as { formatVersion: number };
    expect(raw.formatVersion).toBeLessThan(FORMAT_VERSION);
    expect(parseProject(raw).formatVersion).toBe(FORMAT_VERSION);
  });
});

it('gives a v4 project the default publish settings, and keeps its tracking', () => {
  const raw = readJson(join(root, 'legacy/v4-two-slides')) as { tracking: unknown };
  const project = parseProject(raw);
  expect(project.publish).toEqual(defaultPublishSettings());
  expect(project.tracking).toEqual(raw.tracking);
});

it('migrates the v0 stage size fields into `stage`', () => {
  const project = parseProject(readJson(join(root, 'legacy/v0-minimal')));
  expect(project.stage).toEqual({ width: 960, height: 540 });
});

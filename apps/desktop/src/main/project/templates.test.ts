import { createEmptyProject, createSlide } from '@vedraopus/model';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { packContainer, readContainerProject } from './container';
import { isOwnTemplate, listTemplates, templateFileName } from './templates';

/** Templates are project files in a folder (docs/briefs/P11.2-templates.md, part A). */

const temp = mkdtempSync(join(tmpdir(), 'vo-templates-test-'));
afterAll(() => rmSync(temp, { recursive: true, force: true }));

const meta = {
  formatVersion: 0,
  appVersion: 'test',
  createdAt: '2026-11-22T00:00:00.000Z',
  modifiedAt: '2026-11-22T00:00:00.000Z',
};

async function writeProject(path: string, slides: number, title = 'A course'): Promise<void> {
  const project = createEmptyProject(title);
  project.stage = { width: 1280, height: 720 };
  for (let i = 1; i < slides; i++) project.scenes[0]!.slides.push(createSlide(`Slide ${i + 1}`));
  const workspace = join(temp, `ws-${Math.random().toString(16).slice(2)}`);
  mkdirSync(workspace);
  await packContainer(project, workspace, path, { ...meta, formatVersion: project.formatVersion });
}

describe('the template list', () => {
  it('lists the built-in templates, then the author’s own, each by name, with slides and size', async () => {
    const builtIn = join(temp, 'built-in');
    const own = join(temp, 'own');
    mkdirSync(builtIn);
    mkdirSync(own);
    await writeProject(join(builtIn, 'Quiz.vedraopus'), 3);
    await writeProject(join(builtIn, 'Blank.vedraopus'), 1);
    await writeProject(join(own, 'Onboarding.vedraopus'), 4);
    writeFileSync(join(own, 'notes.txt'), 'not a template');
    writeFileSync(join(own, 'Broken.vedraopus'), 'not a zip');

    // The starter templates (part C) come first; then the files.
    const all = await listTemplates({ own, builtIn });
    expect(all.slice(0, 4).map((each) => each.path)).toEqual([
      'builtin:blank',
      'builtin:short-course',
      'builtin:branching',
      'builtin:quiz',
    ]);
    const list = all.filter((each) => !each.path.startsWith('builtin:'));
    expect(list.map((each) => [each.name, each.builtIn, each.slides, each.stage])).toEqual([
      ['Blank', true, 1, { width: 1280, height: 720 }],
      ['Quiz', true, 3, { width: 1280, height: 720 }],
      ['Broken', false, 0, null],
      ['Onboarding', false, 4, { width: 1280, height: 720 }],
    ]);
    expect(list.find((each) => each.name === 'Broken')!.problem).toMatch(
      /not an Vedra Opus project|damaged/,
    );
    expect(list.filter((each) => each.problem === null)).toHaveLength(3);
  });

  it('has none of the author’s own, not an error, where the folder is not there yet', async () => {
    const list = await listTemplates({ own: join(temp, 'none'), builtIn: null });
    expect(list.filter((each) => !each.builtIn)).toEqual([]);
  });
});

describe('reading a template', () => {
  it('reads its project without unpacking its media', async () => {
    const path = join(temp, 'read.vedraopus');
    await writeProject(path, 2, 'Fire safety');
    const project = await readContainerProject(path);
    expect(project.title).toBe('Fire safety');
    expect(project.scenes[0]!.slides).toHaveLength(2);
  });
});

describe('template files', () => {
  it('are named from the template name, safely, with the project extension', () => {
    expect(templateFileName('Onboarding')).toBe('Onboarding.vedraopus');
    expect(templateFileName('Q1: <draft>/final?')).toBe('Q1   draft  final.vedraopus');
    expect(templateFileName('...hidden')).toBe('hidden.vedraopus');
    expect(templateFileName('   ')).toBe('Template.vedraopus');
  });

  it('can be deleted only from the author’s own folder', () => {
    const folders = { own: join(temp, 'own'), builtIn: join(temp, 'built-in') };
    expect(isOwnTemplate(folders, join(temp, 'own', 'Onboarding.vedraopus'))).toBe(true);
    expect(isOwnTemplate(folders, join(temp, 'built-in', 'Quiz.vedraopus'))).toBe(false);
    expect(isOwnTemplate(folders, join(temp, 'own', '..', 'read.vedraopus'))).toBe(false);
    expect(isOwnTemplate(folders, join(temp, 'own', 'sub', 'x.vedraopus'))).toBe(false);
    expect(isOwnTemplate(folders, join(temp, 'own', 'notes.txt'))).toBe(false);
    expect(isOwnTemplate(folders, join(temp, 'own'))).toBe(false);
  });
});

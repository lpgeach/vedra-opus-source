import { describe, expect, it } from 'vitest';
import {
  createBank,
  createEmptyProject,
  createHistory,
  migrateToCurrent,
  parseProject,
  ProjectValidationError,
} from './index';
import type { Project } from './index';

/** A slide's own background and hiding its layout's objects (B17, format 41). */

const PICTURE = 'a'.repeat(64);
const SOUND = 'b'.repeat(64);

const issues = (project: Project): readonly { path: string; message: string }[] => {
  try {
    parseProject(JSON.parse(JSON.stringify(project)));
    return [];
  } catch (error) {
    if (error instanceof ProjectValidationError) return error.issues;
    throw error;
  }
};

describe('slide backgrounds (B17)', () => {
  it('migrate from format 40 with neither, in scenes and banks alike', () => {
    const project = createEmptyProject();
    project.banks.push(createBank('Bank', project.stage, project.masters[0]!));
    const old = JSON.parse(JSON.stringify(project)) as {
      formatVersion: number;
      scenes: { slides: { properties: Record<string, unknown> }[] }[];
      banks: { slides: { properties: Record<string, unknown> }[] }[];
    };
    old.formatVersion = 40;
    for (const group of [...old.scenes, ...old.banks]) {
      for (const slide of group.slides) {
        delete slide.properties['background'];
        delete slide.properties['hideLayoutObjects'];
      }
    }
    const migrated = parseProject(migrateToCurrent(old));
    for (const group of [...migrated.scenes, ...migrated.banks]) {
      for (const slide of group.slides) {
        expect(slide.properties.background).toBeNull();
        expect(slide.properties.hideLayoutObjects).toBe(false);
      }
    }
  });

  it('are set and undone as slide properties: a colour, a gradient, a picture', () => {
    const project = createEmptyProject();
    project.assets[PICTURE] = {
      kind: 'image',
      fileName: 'sky.png',
      ext: 'png',
      mimeType: 'image/png',
      byteLength: 10,
      width: 4,
      height: 3,
    };
    const history = createHistory(project, { validate: true });
    const slideId = project.scenes[0]!.slides[0]!.id;
    const properties = () => history.project.scenes[0]!.slides[0]!.properties;
    history.execute('slide.setProperties', {
      slideId,
      properties: { background: { kind: 'solid', color: '#123456' }, hideLayoutObjects: true },
    });
    expect(properties().background).toEqual({ kind: 'solid', color: '#123456' });
    expect(properties().hideLayoutObjects).toBe(true);
    history.execute('slide.setProperties', {
      slideId,
      properties: {
        background: {
          kind: 'gradient',
          angle: 90,
          stops: [
            { offset: 0, color: '#ffffff' },
            { offset: 1, color: { theme: 'accent1' } },
          ],
        },
      },
    });
    history.execute('slide.setProperties', {
      slideId,
      properties: { background: { kind: 'image', asset: PICTURE } },
    });
    expect(issues(history.project)).toEqual([]);
    history.undo();
    history.undo();
    history.undo();
    expect(properties().background).toBeNull();
    expect(properties().hideLayoutObjects).toBe(false);
  });

  it('name a picture the project has', () => {
    const project = createEmptyProject();
    const slide = project.scenes[0]!.slides[0]!;
    slide.properties.background = { kind: 'image', asset: PICTURE };
    expect(issues(project).map((issue) => issue.path)).toEqual([
      'scenes[0].slides[0].properties.background.asset',
    ]);
    project.assets[SOUND] = {
      kind: 'audio',
      fileName: 'a.mp3',
      ext: 'mp3',
      mimeType: 'audio/mpeg',
      byteLength: 1,
    };
    slide.properties.background = { kind: 'image', asset: SOUND };
    expect(issues(project)).toEqual([
      {
        path: 'scenes[0].slides[0].properties.background.asset',
        message: 'a slide’s background must be a picture',
      },
    ]);
  });
});

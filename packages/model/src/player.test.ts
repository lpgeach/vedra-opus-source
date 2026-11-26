import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  createHistory,
  createSlide,
  migrateToCurrent,
  parseProject,
  ProjectValidationError,
} from './index';
import type { Project } from './index';

/** The player frame's settings (docs/briefs/P8.1-player-frame.md). */

const issues = (project: Project): string[] => {
  try {
    parseProject(JSON.parse(JSON.stringify(project)));
    return [];
  } catch (error) {
    if (error instanceof ProjectValidationError) return error.issues.map((issue) => issue.message);
    throw error;
  }
};

describe('player settings', () => {
  it('give a new course a title, menu, free navigation and the usual controls', () => {
    const project = createEmptyProject();
    expect(project.player).toEqual({
      title: true,
      logo: null,
      menu: { show: true, navigation: 'free', entries: {} },
      controls: {
        seekbar: 'view',
        submit: false,
        volume: true,
        captions: true,
        speed: true,
        fullscreen: true,
        accessibility: true,
      },
      tabs: {
        resources: { show: true, items: [] },
        glossary: { show: true, terms: [] },
        notes: { show: true },
        custom: [],
      },
      look: {
        scheme: 'dark',
        accent: '#2f6fed',
        font: 'system',
        controlsAt: 'bottom',
        menuSide: 'left',
      },
      labels: { language: 'en', words: {} },
    });
    expect(issues(project)).toEqual([]);
  });

  it('name only scene slides in the menu, and only a picture as the logo', () => {
    const project = createEmptyProject();
    project.player.menu.entries['slide_gone'] = { title: 'Gone', hidden: false };
    expect(issues(project)).toContain('a menu entry names no slide of the course: "slide_gone"');
    delete project.player.menu.entries['slide_gone'];
    const hash = 'a'.repeat(64);
    project.player.logo = hash;
    expect(issues(project)).toContain('the logo is a picture of the course');
    project.assets[hash] = {
      kind: 'image',
      fileName: 'logo.png',
      ext: 'png',
      mimeType: 'image/png',
      byteLength: 1,
    };
    expect(issues(project)).toEqual([]);
  });

  it('are set undoably, and a deleted slide’s entry goes with it', () => {
    const project = createEmptyProject();
    const extra = createSlide('Second');
    project.scenes[0]!.slides.push(extra);
    const history = createHistory(project);
    history.execute('project.setPlayer', {
      player: {
        menu: {
          show: true,
          navigation: 'restricted',
          entries: { [extra.id]: { title: 'Part two', hidden: false } },
        },
      },
    });
    expect(history.project.player.menu.navigation).toBe('restricted');
    history.execute('slide.remove', { slideId: extra.id });
    expect(history.project.player.menu.entries).toEqual({});
    history.undo();
    expect(history.project.player.menu.entries[extra.id]).toEqual({
      title: 'Part two',
      hidden: false,
    });
    history.undo();
    expect(history.project.player.menu.navigation).toBe('free');
  });

  it('come to an older course as a new course has them', () => {
    const project = createEmptyProject('Old');
    const v19: Record<string, unknown> = {
      ...(JSON.parse(JSON.stringify(project)) as Record<string, unknown>),
      formatVersion: 19,
    };
    delete v19['player'];
    expect(parseProject(migrateToCurrent(v19)).player).toEqual(project.player);
  });
});

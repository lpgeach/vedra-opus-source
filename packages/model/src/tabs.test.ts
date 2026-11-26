import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  createHistory,
  createId,
  createSlide,
  migrateToCurrent,
  notesFromText,
  notesText,
  parseProject,
  ProjectValidationError,
} from './index';
import type { Project, Trigger } from './index';

/** The player's tabs and slide notes (docs/briefs/P8.2-player-tabs.md). */

const issues = (project: Project): string[] => {
  try {
    parseProject(JSON.parse(JSON.stringify(project)));
    return [];
  } catch (error) {
    if (error instanceof ProjectValidationError) return error.issues.map((issue) => issue.message);
    throw error;
  }
};

const HASH = 'b'.repeat(64);

function tabTrigger(slideId: string, tab: string): Trigger {
  return {
    id: createId('trigger'),
    owner: { kind: 'slide', id: slideId },
    event: { type: 'playerTab', tab },
    action: { type: 'jumpToSlide', target: { kind: 'next' } },
    conditions: null,
    otherwise: null,
    enabled: true,
  };
}

describe('player tabs', () => {
  it('give a new course Resources, Glossary and Notes, empty, and no custom tabs', () => {
    expect(createEmptyProject().player.tabs).toEqual({
      resources: { show: true, items: [] },
      glossary: { show: true, terms: [] },
      notes: { show: true },
      custom: [],
    });
  });

  it('allow only web and email links, and files of the project', () => {
    const project = createEmptyProject();
    const items = project.player.tabs.resources.items;
    items.push({
      id: 'res_web',
      title: 'Web',
      target: { kind: 'link', url: 'https://a.example/x' },
    });
    items.push({
      id: 'res_mail',
      title: 'Mail',
      target: { kind: 'link', url: 'mailto:a@b.example' },
    });
    expect(issues(project)).toEqual([]);
    for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'example.com', 'https://a b']) {
      items[0]!.target = { kind: 'link', url };
      expect(issues(project).length, url).toBeGreaterThan(0);
    }
    items[0]!.target = { kind: 'file', asset: HASH };
    expect(issues(project)).toContain(`asset ${HASH.slice(0, 12)}… is not in the project`);
    project.assets[HASH] = {
      kind: 'file',
      fileName: 'guide.pdf',
      ext: 'pdf',
      mimeType: 'application/pdf',
      byteLength: 10,
    };
    expect(issues(project)).toEqual([]);
  });

  it('claim their ids, and a tab trigger must name a custom tab', () => {
    const project = createEmptyProject();
    const slide = project.scenes[0]!.slides[0]!;
    project.player.tabs.glossary.terms.push({ id: slide.id, term: 'Clash', definition: '' });
    expect(issues(project).some((issue) => issue.startsWith(`duplicate id "${slide.id}"`))).toBe(
      true,
    );
    project.player.tabs.glossary.terms = [];
    slide.triggers.push(tabTrigger(slide.id, 'tab_none'));
    expect(issues(project)).toContain('no custom player tab "tab_none"');
    project.player.tabs.custom.push({ id: 'tab_none', label: 'Help', lightbox: null });
    expect(issues(project)).toEqual([]);
  });

  it('take the triggers of a removed custom tab with it, on every slide, and undo brings both back', () => {
    const project = createEmptyProject();
    const second = createSlide('Two');
    project.scenes[0]!.slides.push(second);
    const first = project.scenes[0]!.slides[0]!;
    project.player.tabs.custom = [
      { id: 'tab_help', label: 'Help', lightbox: null },
      { id: 'tab_more', label: 'More', lightbox: null },
    ];
    first.triggers.push(tabTrigger(first.id, 'tab_help'), tabTrigger(first.id, 'tab_more'));
    second.triggers.push(tabTrigger(second.id, 'tab_help'));
    const history = createHistory(parseProject(JSON.parse(JSON.stringify(project))));
    const before = JSON.stringify(history.project);
    history.execute('project.setPlayer', {
      player: {
        tabs: {
          ...history.project.player.tabs,
          custom: [{ id: 'tab_more', label: 'More', lightbox: null }],
        },
      },
    });
    const [one, two] = history.project.scenes[0]!.slides;
    expect(one!.triggers.map((each) => (each.event as { tab: string }).tab)).toEqual(['tab_more']);
    expect(two!.triggers).toEqual([]);
    expect(issues(history.project)).toEqual([]);
    history.undo();
    expect(JSON.stringify(history.project)).toBe(before);
  });

  it('migrate from format 20 with the defaults', () => {
    const old = JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown>;
    old['formatVersion'] = 20;
    delete (old['player'] as Record<string, unknown>)['tabs'];
    const project = parseProject(migrateToCurrent(old));
    expect(project.player.tabs).toEqual(createEmptyProject().player.tabs);
  });
});

describe('slide notes', () => {
  it('are a paragraph a line, read back as the same text, and nothing for blank text', () => {
    const notes = notesFromText('First line\r\nSecond line\n\nAfter a gap');
    expect(notes.content).toHaveLength(4);
    expect(notesText(notes)).toBe('First line\nSecond line\n\nAfter a gap');
    expect(notesFromText('  \n ')).toEqual({ type: 'doc', content: [] });
  });

  it('are set with one undo step', () => {
    const project = createEmptyProject();
    const history = createHistory(project);
    const slideId = project.scenes[0]!.slides[0]!.id;
    history.execute('slide.setNotes', { slideId, notes: notesFromText('Say this.') });
    expect(notesText(history.project.scenes[0]!.slides[0]!.notes)).toBe('Say this.');
    history.undo();
    expect(history.project.scenes[0]!.slides[0]!.notes.content).toEqual([]);
  });
});

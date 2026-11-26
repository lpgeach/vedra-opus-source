// @vitest-environment happy-dom
import { createEmptyProject, createSlide, notesFromText } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { createTabs, notesParagraphs, sortedGlossary, visibleTabs } from './tabs';

/** The player's tabs (docs/briefs/P8.2-player-tabs.md). */

describe('player tabs', () => {
  it('show a built-in tab only when it is on and has something in it, then the custom tabs', () => {
    const project = createEmptyProject();
    project.player.tabs.custom.push({ id: 'tab_help', label: 'Help', lightbox: null });
    expect(visibleTabs(project).map((tab) => tab.id)).toEqual(['tab_help']);
    project.player.tabs.resources.items.push({
      id: 'res_a',
      title: 'Site',
      target: { kind: 'link', url: 'https://a.example' },
    });
    project.player.tabs.glossary.terms.push({ id: 'term_a', term: 'A', definition: 'a' });
    const slide = createSlide('Noted');
    slide.notes = notesFromText('Say this.');
    project.scenes[0]!.slides.push(slide);
    expect(visibleTabs(project).map((tab) => tab.label)).toEqual([
      'Resources',
      'Glossary',
      'Notes',
      'Help',
    ]);
    project.player.tabs.glossary.show = false;
    project.player.tabs.notes.show = false;
    expect(visibleTabs(project).map((tab) => tab.id)).toEqual(['resources', 'tab_help']);
  });

  it('sort the glossary by term, ignoring case', () => {
    const terms = ['beta', 'Alpha', 'gamma', 'Älter'].map((term, i) => ({
      id: `term_${i}`,
      term,
      definition: '',
    }));
    expect(sortedGlossary(terms).map((each) => each.term)).toEqual([
      'Alpha',
      'Älter',
      'beta',
      'gamma',
    ]);
    expect(terms[0]!.term).toBe('beta');
  });

  it('give notes as paragraphs, and none for notes with no words', () => {
    expect(notesParagraphs(notesFromText('One\nTwo'))).toEqual(['One', 'Two']);
    expect(notesParagraphs(notesFromText(''))).toEqual([]);
  });

  it('open one panel at a time, close it again, and fire a custom tab', () => {
    const project = createEmptyProject();
    project.player.tabs.glossary.terms.push({ id: 'term_a', term: 'Term', definition: 'Means.' });
    project.player.tabs.resources.items.push({
      id: 'res_a',
      title: 'Site',
      target: { kind: 'link', url: 'https://a.example/' },
    });
    project.player.tabs.custom.push({ id: 'tab_help', label: 'Help', lightbox: null });
    const fired: string[] = [];
    const tabs = createTabs(
      document,
      project,
      (h, e) => `assets/${h}.${e}`,
      () => undefined,
      {
        custom: (id) => fired.push(id),
      },
    );
    const [resources, glossary, help] = tabs.buttons;
    glossary!.click();
    expect(tabs.panel.hidden).toBe(false);
    expect(tabs.panel.getAttribute('aria-label')).toBe('Glossary');
    expect(tabs.panel.querySelector('dt')?.textContent).toBe('Term');
    resources!.click();
    expect(glossary!.getAttribute('aria-expanded')).toBe('false');
    expect(tabs.panel.querySelector('a')?.getAttribute('href')).toBe('https://a.example/');
    expect(tabs.panel.querySelector('a')?.rel).toBe('noopener noreferrer');
    resources!.click();
    expect(tabs.panel.hidden).toBe(true);
    help!.click();
    expect(fired).toEqual(['tab_help']);
    expect(tabs.panel.hidden).toBe(true);
    expect(tabs.close()).toBe(false);
  });
});

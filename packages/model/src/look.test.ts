import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  createHistory,
  DEFAULT_LABELS,
  LABEL_KEYS,
  labelText,
  migrateToCurrent,
  parseProject,
  playerPresetSchema,
  presetOf,
  ProjectValidationError,
  textOnAccent,
  withPreset,
} from './index';
import type { Project } from './index';

/** The player's look, words and presets (docs/briefs/P8.3-player-appearance.md). */

const issues = (project: Project): string[] => {
  try {
    parseProject(JSON.parse(JSON.stringify(project)));
    return [];
  } catch (error) {
    if (error instanceof ProjectValidationError) return error.issues.map((issue) => issue.path);
    throw error;
  }
};

describe('player look and labels', () => {
  it('validate the accent, the language tags and the label keys', () => {
    const project = createEmptyProject();
    expect(issues(project)).toEqual([]);
    project.player.look.accent = 'blue';
    expect(issues(project)).toContain('player.look.accent');
    project.player.look.accent = '#00aa55';
    project.player.labels.language = 'not a tag';
    expect(issues(project)).toContain('player.labels.language');
    project.player.labels.language = 'fr-CA';
    project.player.labels.words = { 'fr-CA': { next: 'Suivant' } };
    expect(issues(project)).toEqual([]);
    (project.player.labels.words['fr-CA'] as Record<string, string>)['nonsense'] = 'x';
    expect(issues(project).length).toBeGreaterThan(0);
    project.player.labels.words = { 'fr-CA': { next: '' } };
    expect(issues(project).length).toBeGreaterThan(0);
  });

  it('show the author’s word for the course language, else the English, with placeholders filled', () => {
    const labels = {
      language: 'fr',
      words: {
        fr: { next: 'Suivant', slideOf: 'Diapo {n} sur {total}' },
        de: { previous: 'Zurück' },
      },
    };
    expect(labelText(labels, 'next')).toBe('Suivant');
    expect(labelText(labels, 'slideOf', { n: 2, total: 5 })).toBe('Diapo 2 sur 5');
    // Not written for French: the English. German's words are for German only.
    expect(labelText(labels, 'previous')).toBe('Previous');
    expect(labelText({ ...labels, language: 'de' }, 'previous')).toBe('Zurück');
    // A placeholder with no value stays as written; one the word leaves out is not shown.
    expect(labelText(labels, 'timeLeft')).toBe('Time left {time}');
    expect(
      labelText({ language: 'en', words: { en: { slideOf: 'Slide {n}' } } }, 'slideOf', {
        n: 1,
        total: 9,
      }),
    ).toBe('Slide 1');
    expect(LABEL_KEYS).toHaveLength(Object.keys(DEFAULT_LABELS).length);
  });

  it('write white on the accent where it reaches 4.5:1, else the better of black and white', () => {
    // #2f6fed: luminance ≈ 0.2126 × 0.0284 + 0.7152 × 0.1588 + 0.0722 × 0.847 ≈ 0.181.
    // White: 1.05 / 0.231 ≈ 4.55 (AA); black: 0.231 / 0.05 ≈ 4.62. White reaches AA, so white.
    expect(textOnAccent('#2f6fed')).toBe('#ffffff');
    // #ffd23f: luminance ≈ 0.2126 + 0.7152 × 0.644 + 0.0722 × 0.0497 ≈ 0.677.
    // White: 1.05 / 0.727 ≈ 1.44; black: 0.727 / 0.05 ≈ 14.5. Black.
    expect(textOnAccent('#ffd23f')).toBe('#000000');
    expect(textOnAccent('#000000')).toBe('#ffffff');
    expect(textOnAccent('#ffffff')).toBe('#000000');
  });

  it('migrate from format 21 with the look courses had', () => {
    const old = JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown>;
    old['formatVersion'] = 21;
    const player = old['player'] as Record<string, unknown>;
    delete player['look'];
    delete player['labels'];
    const project = parseProject(migrateToCurrent(old));
    expect(project.player.look).toEqual(createEmptyProject().player.look);
    expect(project.player.labels).toEqual({ language: 'en', words: {} });
  });
});

describe('player presets', () => {
  it('carry the look, words and controls, and never the course’s content', () => {
    const source = createEmptyProject().player;
    source.look = {
      scheme: 'light',
      accent: '#aa3311',
      font: 'heading',
      controlsAt: 'top',
      menuSide: 'right',
    };
    source.labels = { language: 'es', words: { es: { next: 'Siguiente' } } };
    source.controls.speed = false;
    source.menu.navigation = 'locked';
    source.tabs.custom = [{ id: 'tab_a', label: 'Help', lightbox: null }];
    const preset = presetOf(source, 'Brand');
    expect(playerPresetSchema.parse(preset)).toEqual(preset);
    expect(JSON.stringify(preset)).not.toContain('tab_a');

    const project = createEmptyProject();
    const slideId = project.scenes[0]!.slides[0]!.id;
    project.player.menu.entries[slideId] = { title: 'Mine', hidden: false };
    project.player.tabs.glossary.terms = [{ id: 'term_a', term: 'Kept', definition: '' }];
    const history = createHistory(project);
    const before = JSON.stringify(history.project);
    history.execute('project.setPlayer', { player: withPreset(history.project.player, preset) });
    const after = history.project.player;
    expect(after.look).toEqual(source.look);
    expect(after.labels).toEqual(source.labels);
    expect(after.controls.speed).toBe(false);
    expect(after.menu.navigation).toBe('locked');
    // The course's own: unchanged.
    expect(after.menu.entries[slideId]).toEqual({ title: 'Mine', hidden: false });
    expect(after.tabs.glossary.terms[0]!.term).toBe('Kept');
    expect(after.tabs.custom).toEqual([]);
    history.undo();
    expect(JSON.stringify(history.project)).toBe(before);
  });
});

// @vitest-environment happy-dom
import { accentFor, createEmptyProject, textOnAccent } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { applyLook, fontStack } from './look';
import { resultsPage } from './player';

/** The player's look and words (docs/briefs/P8.3-player-appearance.md). */

describe('the player look', () => {
  it('puts the scheme, layout, accent, its text colour, font and language on the element', () => {
    const project = createEmptyProject();
    project.player.look = {
      scheme: 'light',
      accent: '#ffd23f',
      font: 'heading',
      controlsAt: 'top',
      menuSide: 'right',
    };
    project.theme.fonts.heading = 'Brand "Sans"';
    project.player.labels.language = 'fr-CA';
    const element = document.createElement('div');
    applyLook(element, project);
    expect(element.dataset['scheme']).toBe('light');
    expect(element.dataset['controls']).toBe('top');
    expect(element.dataset['menuSide']).toBe('right');
    // Strong enough on dark, so kept there; too faint on light, so darkened there.
    expect(element.style.getPropertyValue('--vo-accent-dark')).toBe('#ffd23f');
    expect(element.style.getPropertyValue('--vo-accent-light')).toBe(accentFor('#ffd23f', 'light'));
    expect(accentFor('#ffd23f', 'light')).not.toBe('#ffd23f');
    // Yellow is light: black text on it.
    expect(element.style.getPropertyValue('--vo-accent-text-dark')).toBe('#000000');
    expect(element.style.getPropertyValue('--vo-accent-text-light')).toBe(
      textOnAccent(accentFor('#ffd23f', 'light')),
    );
    expect(element.lang).toBe('fr-CA');
    expect(element.dir).toBe('ltr');
    // A right-to-left language runs the frame right to left (P10.3).
    project.player.labels.language = 'ar';
    applyLook(element, project);
    expect(element.dir).toBe('rtl');
    // The theme's font first, its quotes taken out so the CSS stays whole.
    expect(fontStack(project)).toBe('"Brand Sans", system-ui, sans-serif');
    project.player.look.font = 'system';
    expect(fontStack(project)).toBe('system-ui, sans-serif');
  });

  it('prints results in the course’s words, escaped', () => {
    const summary = {
      course: 'C',
      result: 'R',
      kind: 'graded' as const,
      score: 3,
      max: 4,
      percent: 75,
      passPercent: 50,
      passed: true,
      questions: [{ title: '', result: 'correct' as const, score: 3 }],
    };
    // The English, as before P8.3.
    expect(resultsPage(summary)).toContain('<p>Score: 3 of 4 (75%). Pass mark: 50%. Passed.</p>');
    expect(resultsPage(summary)).toContain('<td>Question 1</td><td>Correct</td>');
    const french = {
      language: 'fr',
      words: { fr: { resultsPassed: 'Réussi <bravo>.', resultCorrect: 'Juste' } },
    };
    const page = resultsPage(summary, french);
    expect(page).toContain('Réussi &#60;bravo&#62;.');
    expect(page).toContain('<td>Juste</td>');
  });
});

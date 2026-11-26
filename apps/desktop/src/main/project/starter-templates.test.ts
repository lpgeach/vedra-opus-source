import { accessibilityIssues, findReferenceIssues, parseProject } from '@vedraopus/model';
import type { Project } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { STARTER_TEMPLATES, starterTemplate } from './starter-templates';

/** The built-in starter templates (docs/briefs/P11.2-templates.md, part C). */

const make = (key: string): Project => starterTemplate(`builtin:${key}`)!.make();
const titles = (project: Project) =>
  project.scenes.flatMap((scene) => scene.slides.map((slide) => slide.title));

describe('the starter templates', () => {
  it('are each a valid project in the current format, with no dangling references', () => {
    for (const template of STARTER_TEMPLATES) {
      const project = template.make();
      expect(() => parseProject(JSON.parse(JSON.stringify(project))), template.key).not.toThrow();
      expect(findReferenceIssues(project), template.key).toEqual([]);
      expect(project.stage).toEqual({ width: 1280, height: 720 });
      // Our own master is first, with the band across the top; the feedback master stays last.
      expect(project.masters.map((master) => master.kind)).toEqual(['slide', 'feedback']);
    }
  });

  it('give the accessibility checker (P10.2) nothing to report', () => {
    for (const template of STARTER_TEMPLATES) {
      expect(
        accessibilityIssues(template.make()).map((issue) => `${issue.kind}: ${issue.message}`),
        template.key,
      ).toEqual([]);
    }
  });

  it('are made afresh each time, with new ids', () => {
    const first = make('short-course');
    const second = make('short-course');
    expect(first.id).not.toBe(second.id);
    expect(first.scenes[0]!.slides[0]!.id).not.toBe(second.scenes[0]!.slides[0]!.id);
  });

  it('a short course: title, three content slides, two questions and a tracked result', () => {
    const project = make('short-course');
    expect(titles(project)).toEqual([
      'Title',
      'What you will learn',
      'The first idea',
      'The second idea',
      'Check: the first idea',
      'Check: the second idea',
      'Your results',
    ]);
    const results = project.scenes[0]!.slides.at(-1)!;
    expect(project.tracking.completion).toEqual({ kind: 'result', slide: results.id });
  });

  it('a branching scenario: each choice goes to its consequence, and each goes on to the summary', () => {
    const project = make('branching');
    const [situation, ...rest] = project.scenes[0]!.slides;
    const summary = rest.at(-1)!;
    const consequences = rest.slice(0, 3);
    const jumps = (slide: (typeof rest)[number]) =>
      slide.triggers.map((trigger) =>
        trigger.action.type === 'jumpToSlide' && trigger.action.target.kind === 'slide'
          ? trigger.action.target.slide
          : null,
      );
    expect(jumps(situation!)).toEqual(consequences.map((slide) => slide.id));
    for (const consequence of consequences) expect(jumps(consequence)).toEqual([summary.id]);
  });

  it('a quiz: six questions of different kinds drawn at random from a bank, and a tracked result', () => {
    const project = make('quiz');
    const bank = project.banks[0]!;
    expect(new Set(bank.slides.map((slide) => slide.question!.kind)).size).toBe(6);
    const draw = project.scenes[0]!.slides.find((slide) => slide.draw)!;
    expect(draw.draw).toMatchObject({ bank: bank.id, count: 6, order: 'random' });
    const results = project.scenes[0]!.slides.at(-1)!;
    expect(project.tracking.completion).toEqual({ kind: 'result', slide: results.id });
  });

  it('are found only by their own paths', () => {
    expect(starterTemplate('builtin:quiz')?.name).toBe('Quiz');
    expect(starterTemplate('builtin:nope')).toBeUndefined();
    expect(starterTemplate('/home/someone/quiz')).toBeUndefined();
  });
});

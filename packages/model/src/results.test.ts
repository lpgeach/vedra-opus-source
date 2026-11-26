import { describe, expect, it } from 'vitest';
import {
  CommandError,
  createBank,
  createEmptyProject,
  createHistory,
  createQuestionSlide,
  createResultSlide,
  findSlide,
  migrateToCurrent,
  parseProject,
  ProjectValidationError,
} from './index';
import type { Project } from './index';

/** Result slides (docs/briefs/P7.7-result-slides.md). */

const issues = (project: Project): string[] => {
  try {
    parseProject(JSON.parse(JSON.stringify(project)));
    return [];
  } catch (error) {
    if (error instanceof ProjectValidationError) return error.issues.map((issue) => issue.message);
    throw error;
  }
};

function quiz() {
  const project = createEmptyProject('Quiz');
  const q1 = createQuestionSlide('multipleChoice', project.stage);
  const q2 = createQuestionSlide('trueFalse', project.stage);
  const result = createResultSlide(project.stage);
  project.scenes[0]!.slides.push(q1, q2, result);
  return { project, q1, q2, result };
}

describe('result slides in the saved format', () => {
  it('makes a graded result of every question, with Passed and Failed layers and three buttons', () => {
    const { project, result } = quiz();
    expect(issues(project)).toEqual([]);
    expect(result.result).toMatchObject({
      kind: 'graded',
      include: { kind: 'all' },
      passPercent: 80,
      timer: null,
    });
    expect(result.layers.map((layer) => layer.name)).toEqual(['Passed', 'Failed']);
    expect(result.triggers.map((trigger) => trigger.action.type)).toEqual([
      'reviewQuiz',
      'retryQuiz',
      'printResults',
    ]);
    expect(JSON.stringify(result.baseLayer)).toContain('%ResultPercent%');
  });

  it('checks what it includes, refuses itself and cycles, and one role a slide', () => {
    const { project, q1, result } = quiz();
    const other = createResultSlide(project.stage, 'Section result');
    project.scenes[0]!.slides.push(other);
    result.result!.include = { kind: 'chosen', slides: [q1.id, other.id] };
    expect(issues(project)).toEqual([]);
    result.result!.include = { kind: 'chosen', slides: [result.id] };
    expect(issues(project)).toContain('a result cannot include itself');
    result.result!.include = { kind: 'chosen', slides: [other.id] };
    other.result!.include = { kind: 'chosen', slides: [result.id] };
    expect(issues(project)).toContain('result slides include each other');
    other.result!.include = { kind: 'chosen', slides: [project.scenes[0]!.slides[0]!.id] };
    expect(issues(project).join(' ')).toContain('is not a question, draw or result slide');
    other.result!.include = { kind: 'all' };
    q1.result = other.result;
    expect(issues(project)).toContain('a slide is at most one of a question, a draw and a result');
  });

  it('lets tracking pass or fail by a graded result slide only', () => {
    const { project, q1, result } = quiz();
    project.tracking.completion = { kind: 'result', slide: result.id };
    expect(issues(project)).toEqual([]);
    project.tracking.completion = { kind: 'result', slide: q1.id };
    expect(issues(project)).toContain('completion by result names a graded result slide');
    project.tracking.completion = { kind: 'result', slide: result.id };
    result.result!.kind = 'survey';
    expect(issues(project)).toContain('completion by result names a graded result slide');
  });
});

describe('result commands', () => {
  it('sets and clears a result, never on a question', () => {
    const { project, q1, result } = quiz();
    const history = createHistory(project);
    const plain = project.scenes[0]!.slides[0]!;
    history.execute('slide.setResult', { slideId: plain.id, result: result.result });
    expect(findSlide(history.project, plain.id)!.slide.result).toEqual(result.result);
    expect(() =>
      history.execute('slide.setResult', { slideId: q1.id, result: result.result }),
    ).toThrow(CommandError);
    expect(() =>
      history.execute('slide.setQuestion', { slideId: result.id, question: q1.question }),
    ).toThrow(CommandError);
    history.execute('slide.setResult', { slideId: plain.id, result: null });
    expect(findSlide(history.project, plain.id)!.slide.result).toBeNull();
  });

  it('forgets deleted slides it included, and its own deleted layers; tracking falls back', () => {
    const { project, q1, q2, result } = quiz();
    result.result!.include = { kind: 'chosen', slides: [q1.id, q2.id] };
    project.tracking.completion = { kind: 'result', slide: result.id };
    const history = createHistory(project);
    history.execute('slide.remove', { slideId: q1.id });
    expect(findSlide(history.project, result.id)!.slide.result!.include).toEqual({
      kind: 'chosen',
      slides: [q2.id],
    });
    history.execute('layer.remove', { layerId: result.result!.layers.failed! });
    expect(findSlide(history.project, result.id)!.slide.result!.layers.failed).toBeNull();
    history.execute('slide.remove', { slideId: result.id });
    expect(history.project.tracking.completion).toEqual({ kind: 'trigger' });
    expect(issues(history.project)).toEqual([]);
    history.undo();
    expect(history.project.tracking.completion).toEqual({ kind: 'result', slide: result.id });
  });
});

describe('format 19', () => {
  it('gives every slide of an older project no result', () => {
    const project = createEmptyProject('Old');
    const v18 = JSON.parse(JSON.stringify(project)) as Record<string, unknown> & {
      scenes: { slides: Record<string, unknown>[] }[];
    };
    v18['formatVersion'] = 18;
    for (const slide of v18.scenes[0]!.slides) delete slide['result'];
    const migrated = parseProject(migrateToCurrent(v18));
    expect(migrated.scenes[0]!.slides.every((slide) => slide.result === null)).toBe(true);
  });
});

describe('question branches (the Phase 7 review)', () => {
  it('must go to a slide of the course, and go on to the next slide once theirs is deleted', () => {
    const { project, q1, q2 } = quiz();
    const bank = createBank('Bank', project.stage);
    project.banks = [bank];
    const graded = q1.question as { branch: { correct: unknown; incorrect: unknown } };
    graded.branch.correct = { kind: 'slide', slide: bank.slides[0]!.id };
    expect(issues(project)).toContain(
      `a branch goes to no slide of the course: "${bank.slides[0]!.id}"`,
    );
    graded.branch.correct = { kind: 'slide', slide: q2.id };
    expect(issues(project)).toEqual([]);
    const history = createHistory(project);
    history.execute('slide.remove', { slideId: q2.id });
    const now = findSlide(history.project, q1.id)!.slide.question as unknown as typeof graded;
    expect(now.branch.correct).toBeNull();
    expect(issues(history.project)).toEqual([]);
    history.undo();
    expect(
      (findSlide(history.project, q1.id)!.slide.question as unknown as typeof graded).branch
        .correct,
    ).toEqual({ kind: 'slide', slide: q2.id });
  });
});

describe('drag and retry options (format 37, docs/briefs/B11-drag-and-retry-options.md)', () => {
  it('migrates a v36 project: its drag questions and results keep behaving as before', () => {
    const project = createEmptyProject('Older');
    const drag = createQuestionSlide('freeDrag', project.stage);
    const result = createResultSlide(project.stage);
    project.scenes[0]!.slides = [drag, result];
    const raw = JSON.parse(JSON.stringify(project));
    raw.formatVersion = 36;
    delete raw.scenes[0].slides[0].question.onePerTarget;
    delete raw.scenes[0].slides[0].question.dropStatesAfterSubmit;
    delete raw.scenes[0].slides[1].result.retryIncorrectOnly;
    const loaded = parseProject(raw);
    const question = loaded.scenes[0]!.slides[0]!.question;
    expect(question).toMatchObject({ onePerTarget: false, dropStatesAfterSubmit: false });
    expect(loaded.scenes[0]!.slides[1]!.result!.retryIncorrectOnly).toBe(false);
  });

  it('gives a new drag question and result none of them', () => {
    const project = createEmptyProject('New');
    expect(createQuestionSlide('freeDrag', project.stage).question).toMatchObject({
      onePerTarget: false,
      dropStatesAfterSubmit: false,
    });
    expect(createResultSlide(project.stage).result!.retryIncorrectOnly).toBe(false);
  });
});

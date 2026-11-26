import { describe, expect, it } from 'vitest';
import {
  cloneSlide,
  createButtonObject,
  createEmptyProject,
  createHistory,
  createQuestionSlide,
  migrateToCurrent,
  parseProject,
  ProjectValidationError,
} from './index';
import type { ChoiceQuestion, Project } from './index';

const issues = (project: Project): string[] => {
  try {
    parseProject(JSON.parse(JSON.stringify(project)));
    return [];
  } catch (error) {
    if (error instanceof ProjectValidationError) return error.issues.map((issue) => issue.message);
    throw error;
  }
};

/** A project whose only slide is a new multiple-choice question. */
function quizProject() {
  const project = createEmptyProject('Quiz');
  const slide = createQuestionSlide('multipleChoice', project.stage);
  project.scenes[0]!.slides = [slide];
  return { project, slide, question: slide.question as ChoiceQuestion };
}

describe('questions in the saved format', () => {
  it('makes a whole question slide: prompt, three choices (the first right), Submit and its trigger', () => {
    const { project, slide, question } = quizProject();
    expect(issues(project)).toEqual([]);
    expect(question.choices.map((choice) => choice.correct)).toEqual([true, false, false]);
    const types = slide.baseLayer.objects.map((object) => object.type);
    expect(types).toEqual(['text', 'choice', 'choice', 'choice', 'button']);
    // Multiple choice: one button set, so picking one unpicks the others.
    const sets = new Set(
      slide.baseLayer.objects.filter((o) => o.type === 'choice').map((o) => o.buttonSet),
    );
    expect(sets.size).toBe(1);
    expect([...sets][0]).not.toBeNull();
    expect(slide.triggers[0]!.action).toEqual({ type: 'submitInteraction' });
    const response = createQuestionSlide('multipleResponse', project.stage);
    expect(
      response.baseLayer.objects
        .filter((o) => o.type === 'choice')
        .every((o) => o.buttonSet === null),
    ).toBe(true);
  });

  it('checks the parts: their types, that they are on the slide, used once, and one right answer for multiple choice', () => {
    const { project, slide, question } = quizProject();
    question.choices[1]!.correct = true;
    expect(issues(project)).toEqual(['a multiple-choice question has at most one correct answer']);
    question.choices[1]!.correct = false;
    question.prompt = question.submit;
    expect(issues(project)).toContain('the prompt must be a text object');
    question.prompt = 'obj_missing';
    expect(issues(project)).toEqual([`no prompt with id "obj_missing" on the slide's base layer`]);
    question.prompt = null;
    question.choices[2]!.object = question.choices[1]!.object;
    expect(issues(project).join()).toContain('used twice');
    question.choices[2]!.object = slide.baseLayer.objects[3]!.id;
    question.choices[2]!.id = question.choices[1]!.id;
    expect(issues(project).join()).toContain('duplicate id');
  });

  it('gives every slide of an older project no question', () => {
    const v12 = { formatVersion: 12, scenes: [{ slides: [{}, {}] }], masters: [] };
    const migrated = migrateToCurrent(v12) as typeof v12 & { formatVersion: number };
    expect(migrated.formatVersion).toBeGreaterThanOrEqual(13);
    expect(JSON.stringify(migrated).match(/"question":null/g)).toHaveLength(2);
  });
});

describe('question commands', () => {
  it('sets and removes a question, undoably', () => {
    const { project, slide, question } = quizProject();
    const history = createHistory(parseProject(project), { validate: true });
    history.execute('slide.setQuestion', {
      slideId: slide.id,
      question: { ...question, attempts: null, shuffle: true },
    });
    expect(history.project.scenes[0]!.slides[0]!.question).toMatchObject({
      attempts: null,
      shuffle: true,
    });
    history.execute('slide.setQuestion', { slideId: slide.id, question: null });
    expect(history.project.scenes[0]!.slides[0]!.question).toBeNull();
    history.undo();
    history.undo();
    expect(history.project.scenes[0]!.slides[0]!.question).toEqual(question);
    // Linking a button as a choice is refused.
    expect(() =>
      history.execute('slide.setQuestion', {
        slideId: slide.id,
        question: { ...question, choices: [{ ...question.choices[0]!, object: question.submit! }] },
      }),
    ).toThrow();
  });

  it('takes a deleted object out of its question', () => {
    const { project, slide, question } = quizProject();
    const history = createHistory(parseProject(project), { validate: true });
    history.execute('object.remove', {
      objectIds: [question.choices[1]!.object, question.prompt!],
    });
    const after = history.project.scenes[0]!.slides[0]!.question as ChoiceQuestion;
    expect(after.choices.map((choice) => choice.id)).toEqual([
      question.choices[0]!.id,
      question.choices[2]!.id,
    ]);
    expect(after.prompt).toBeNull();
    expect(after.submit).toBe(question.submit);
    // Another button deleted changes nothing.
    const extra = createButtonObject('Extra');
    history.execute('object.add', { layerId: slide.baseLayer.id, object: extra });
    history.execute('object.remove', { objectIds: [extra.id] });
    expect((history.project.scenes[0]!.slides[0]!.question as ChoiceQuestion).choices).toHaveLength(
      2,
    );
  });

  it('makes a true/false question with a choice deleted multiple choice, and undo brings it back', () => {
    // Found by the random undo/redo test: the deletion left an invalid true/false.
    const project = createEmptyProject('Quiz');
    const slide = createQuestionSlide('trueFalse', project.stage);
    project.scenes[0]!.slides = [slide];
    const question = slide.question as ChoiceQuestion;
    const history = createHistory(parseProject(project), { validate: true });
    history.execute('object.remove', { objectIds: [question.choices[1]!.object] });
    const after = history.project.scenes[0]!.slides[0]!.question as ChoiceQuestion;
    expect(after.kind).toBe('multipleChoice');
    expect(after.choices).toEqual([question.choices[0]]);
    history.undo();
    expect(history.project.scenes[0]!.slides[0]!.question).toEqual(question);
  });

  it('gives a copied question new choice ids, naming the copied objects', () => {
    const { project, slide, question } = quizProject();
    const copy = cloneSlide(slide);
    const copied = copy.question as ChoiceQuestion;
    expect(copied.choices.map((choice) => choice.id)).not.toContain(question.choices[0]!.id);
    expect(copied.choices.map((choice) => choice.object)).toEqual(
      copy.baseLayer.objects
        .filter((object) => object.type === 'choice')
        .map((object) => object.id),
    );
    expect(copied.submit).toBe(copy.baseLayer.objects.at(-1)!.id);
    project.scenes[0]!.slides.push(copy);
    expect(issues(project)).toEqual([]);
  });
});

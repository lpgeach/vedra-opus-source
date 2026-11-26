import {
  createEmptyProject,
  createQuestionSlide,
  createScene,
  createSlide,
} from '@vedraopus/model';
import type { ChoiceQuestion, Question, Slide } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { createEngine } from './index';
import { markAnswer, shuffled } from './quiz';
import type { EngineEvent, SessionState } from './types';

/**
 * A question slide whose Submit takes its branch at once: feedback none, so
 * no feedback layer waits for the learner (feedback.test.ts tests those, P7.5).
 */
const quizSlide = (...args: Parameters<typeof createQuestionSlide>) => {
  const slide = createQuestionSlide(...args);
  slide.question!.feedback.by = 'none';
  return slide;
};

/** A question slide (changed by `edit`), then two ordinary slides. */
function setup(
  kind: Question['kind'],
  edit: (question: ChoiceQuestion, slide: Slide) => void = () => undefined,
  options: { random?: () => number; restore?: SessionState } = {},
) {
  const project = createEmptyProject('Quiz');
  const quiz = quizSlide(kind, project.stage);
  edit(quiz.question as ChoiceQuestion, quiz);
  const after = createSlide('After');
  const end = createSlide('End');
  project.scenes = [{ ...createScene(), slides: [quiz, after, end] }];
  const make = (restore?: SessionState) => {
    const engine = createEngine(project, { ...options, ...(restore ? { restore } : {}) });
    const events: EngineEvent[] = [];
    engine.on((event) => events.push(event));
    engine.tick(0);
    const choice = (n: number) => (quiz.question as ChoiceQuestion).choices[n]!.object;
    const pick = (...n: number[]) => n.forEach((each) => engine.pointer('click', choice(each)));
    const submit = () => engine.pointer('click', quiz.question!.submit!);
    const submits = () =>
      events.flatMap((event) => (event.type === 'questionSubmit' ? [event] : []));
    const slideTitle = () =>
      project.scenes[0]!.slides.find((slide) => slide.id === engine.getView().slideId)!.title;
    const shownState = (n: number) =>
      engine.getView().layers[0]!.objects.find((object) => object.id === choice(n))!.state;
    return { engine, events, choice, pick, submit, submits, slideTitle, shownState };
  };
  return { project, quiz, after, end, make: make, first: make(options.restore) };
}

describe('marking', () => {
  it('marks multiple choice and multiple response, by question and by choice', () => {
    const { quiz } = setup('multipleResponse', (question) => {
      question.choices[2]!.correct = true;
    });
    const question = quiz.question as ChoiceQuestion;
    const [a, b, c] = question.choices.map((choice) => choice.id);
    expect(markAnswer(question, { chosen: [a!, c!], values: [] })).toEqual({
      answered: true,
      correct: true,
      score: 10,
    });
    expect(markAnswer(question, { chosen: [a!], values: [] })).toEqual({
      answered: true,
      correct: false,
      score: 0,
    });
    expect(markAnswer(question, { chosen: [a!, b!, c!], values: [] })).toEqual({
      answered: true,
      correct: false,
      score: 0,
    });
    // By choice: 5 − 3 + 4 = 6 for all three, and −3 alone is floored at 0.
    const byChoice: ChoiceQuestion = {
      ...question,
      scoring: { by: 'choice' },
      choices: question.choices.map((choice, i) => ({ ...choice, points: [5, -3, 4][i]! })),
    };
    expect(markAnswer(byChoice, { chosen: [a!, b!, c!], values: [] }).score).toBe(6);
    expect(markAnswer(byChoice, { chosen: [b!], values: [] }).score).toBe(0);
    // Multiple choice takes one answer only.
    const single = setup('multipleChoice').quiz.question as ChoiceQuestion;
    expect(markAnswer(single, { chosen: [single.choices[0]!.id], values: [] }).correct).toBe(true);
    const all = single.choices.map((choice) => choice.id);
    expect(markAnswer(single, { chosen: all, values: [] }).correct).toBe(false);
  });

  it('shuffles by Fisher–Yates', () => {
    // With random always 0: i = 2 swaps with 0 → [2, 1, 0]; i = 1 swaps with 0 → [1, 2, 0].
    expect(shuffled(3, () => 0)).toEqual([1, 2, 0]);
    expect(shuffled(1, () => 0.5)).toEqual([0]);
  });
});

describe('answering a question', () => {
  it('takes a right answer to the next slide, with its score, and locks it', () => {
    const { first } = setup('multipleChoice');
    const { engine, pick, submit, submits, slideTitle, shownState } = first;
    // Required: Next waits for the answer.
    expect(engine.getView().canNext).toBe(false);
    expect(engine.next()).toBe(false);
    pick(1);
    pick(0); // multiple choice: picking another unpicks the first
    expect(shownState(0)).toBe('selected');
    expect(shownState(1)).toBe('normal');
    submit();
    expect(submits()).toEqual([
      expect.objectContaining({ result: 'correct', score: 10, attempt: 1 }),
    ]);
    expect(slideTitle()).toBe('After');
    // Back on it: finished, showing the answer, and closed to changes.
    engine.previous();
    expect(shownState(0)).toBe('selected');
    expect(engine.pointer('click', first.choice(1))).toBe(false);
    expect(engine.getView().canNext).toBe(true);
    expect(engine.getState().q).toEqual({
      [engine.getView().slideId!]: { a: 1, r: 'c', s: 10, c: [0] },
    });
  });

  it('gives tries while attempts remain, then finishes incorrect and takes that branch', () => {
    const { first } = setup('multipleResponse', (question, slide) => {
      question.attempts = 2;
      question.choices[2]!.correct = true;
      question.branch.incorrect = { kind: 'slide', slide: slide.id };
    });
    const { pick, submit, submits, slideTitle } = first;
    pick(0);
    submit();
    expect(submits().at(-1)).toMatchObject({ result: 'tryAgain', attempt: 1 });
    expect(slideTitle()).toBe('Multiple Response');
    pick(1); // now 0 and 1: still wrong (0 and 2 are right)
    submit();
    expect(submits().at(-1)).toMatchObject({ result: 'incorrect', score: 0, attempt: 2 });
    // Its incorrect branch goes back to the question itself, now finished.
    expect(slideTitle()).toBe('Multiple Response');
    submit();
    expect(submits()).toHaveLength(2);
  });

  it('ignores Submit with nothing chosen, using no attempt', () => {
    const { first } = setup('multipleChoice');
    first.submit();
    expect(first.events.some((event) => event.type === 'questionUnanswered')).toBe(true);
    expect(first.submits()).toEqual([]);
    expect(first.engine.getState().q).toBeUndefined();
  });

  it('starts an unfinished question again on a fresh visit, but not a resumed one', () => {
    const { first, make } = setup('multipleChoice', (question, slide) => {
      question.attempts = 3;
      question.required = false;
      slide.properties.onRevisit = 'reset';
    });
    first.pick(1);
    first.submit();
    expect(first.engine.getState().q).toEqual({ [first.engine.getView().slideId!]: { a: 1 } });
    // Resumed in a new session: the attempt is kept.
    const resumed = make(first.engine.getState());
    expect(resumed.engine.getState().q).toEqual(first.engine.getState().q);
    // Left and come back to afresh: it starts again.
    first.engine.next();
    first.engine.previous();
    expect(first.engine.getState().q).toBeUndefined();
  });

  it('shuffles the choices into each other’s places, and keeps the order when resumed', () => {
    const { first, make } = setup(
      'multipleChoice',
      (question) => {
        question.shuffle = true;
      },
      { random: () => 0 },
    );
    // Order [1, 2, 0]: choice 0 sits in slot 2 (two rows of 60 down), 1 and 2 move up a row.
    const offsets = (engine: typeof first.engine) =>
      [0, 1, 2].map(
        (n) =>
          engine.getView().layers[0]!.objects.find((object) => object.id === first.choice(n))!
            .offset,
      );
    expect(offsets(first.engine)).toEqual([
      { x: 0, y: 120 },
      { x: 0, y: -60 },
      { x: 0, y: -60 },
    ]);
    const resumed = make(first.engine.getState());
    expect(offsets(resumed.engine)).toEqual(offsets(first.engine));
  });
});

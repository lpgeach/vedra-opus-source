import {
  createEmptyProject,
  createQuestionSlide,
  createScene,
  createSlide,
} from '@vedraopus/model';
import type { Question, SurveyQuestion } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { createEngine } from './index';
import { bestScore, markAnswer } from './quiz';
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

/** Survey question types in the engine (docs/briefs/P7.3-survey-types.md). */

const stage = { width: 1280, height: 720 };
const question = <K extends SurveyQuestion['kind']>(kind: K) =>
  quizSlide(kind, stage).question as Extract<Question, { kind: K }>;
const typed = (...values: string[]) => ({ chosen: [], values });
const nothing = { answered: false, correct: false, score: 0 };
const given = { answered: true, correct: false, score: 0 };

describe('marking the survey kinds: answered or not, never right, never scored', () => {
  it('pick one and pick many are answered by any choice', () => {
    for (const kind of ['pickOne', 'pickMany'] as const) {
      const q = question(kind);
      expect(markAnswer(q, { chosen: [], values: [] })).toEqual(nothing);
      expect(markAnswer(q, { chosen: [q.choices[1]!.id], values: [] })).toEqual(given);
      expect(bestScore(q)).toBe(0);
    }
    const many = question('pickMany');
    expect(
      markAnswer(many, { chosen: many.choices.map((choice) => choice.id), values: [] }),
    ).toEqual(given);
  });

  it('short answer and essay are answered by anything but spaces', () => {
    for (const kind of ['shortAnswer', 'essay'] as const) {
      const q = question(kind);
      expect(markAnswer(q, typed(''))).toEqual(nothing);
      expect(markAnswer(q, typed('  \n\t '))).toEqual(nothing);
      expect(markAnswer(q, typed('Mostly yes.\nSometimes no.'))).toEqual(given);
    }
  });

  it('how many is answered only by a number', () => {
    const q = question('howMany');
    expect(markAnswer(q, typed(''))).toEqual(nothing);
    expect(markAnswer(q, typed('a few'))).toEqual(nothing);
    expect(markAnswer(q, typed(' 3 '))).toEqual(given);
    expect(markAnswer(q, typed('2,5'))).toEqual(given);
    expect(markAnswer(q, typed('-1'))).toEqual(given);
  });
});

describe('marking which word and ranking', () => {
  it('which word is answered by any word in the blank; ranking by any order', () => {
    const word = question('whichWord');
    expect(markAnswer(word, typed(''))).toEqual(nothing);
    expect(markAnswer(word, typed(word.words[2]!.object))).toEqual(given);
    const ranking = question('ranking');
    const ids = ranking.items.map((item) => item.object);
    expect(markAnswer(ranking, typed(...ids))).toEqual(given);
    expect(markAnswer(ranking, typed(...[...ids].reverse()))).toEqual(given);
    expect(markAnswer({ ...ranking, items: [] }, typed())).toEqual(nothing);
  });
});

describe('marking Likert', () => {
  it('is answered only when every statement is rated', () => {
    const q = question('likert');
    expect(markAnswer(q, typed('', '', ''))).toEqual(nothing);
    expect(markAnswer(q, typed('0', '', '4'))).toEqual(nothing);
    expect(markAnswer(q, typed('0', '2', '4'))).toEqual(given);
    expect(markAnswer({ ...q, statements: [] }, typed())).toEqual(nothing);
  });
});

function course(kind: Question['kind'], options: { random?: () => number } = {}) {
  const project = createEmptyProject('Survey');
  const quiz = quizSlide(kind, project.stage);
  const end = createSlide('End');
  project.scenes = [{ ...createScene(), slides: [quiz, createSlide('After'), end] }];
  const start = (restore?: SessionState) => {
    const engine = createEngine(project, { ...options, ...(restore ? { restore } : {}) });
    const events: EngineEvent[] = [];
    engine.on((event) => events.push(event));
    engine.tick(0);
    const view = (id: string) =>
      engine.getView().layers[0]?.objects.find((object) => object.id === id);
    return { engine, events, view };
  };
  return { project, quiz, end, start };
}

describe('answering the survey kinds', () => {
  it('finishes pick many on its first answered Submit: answered, no score, and the next slide', () => {
    const { quiz, start } = course('pickMany');
    const q = quiz.question as Extract<Question, { kind: 'pickMany' }>;
    const { engine, events, view } = start();
    engine.pointer('click', q.submit!);
    expect(events.filter((event) => event.type === 'questionUnanswered')).toHaveLength(1);
    expect(engine.getView().slideIndex).toBe(0);
    engine.pointer('click', q.choices[0]!.object);
    engine.pointer('click', q.choices[2]!.object);
    engine.pointer('click', q.submit!);
    expect(events.filter((event) => event.type === 'questionSubmit')).toEqual([
      { type: 'questionSubmit', slideId: quiz.id, result: 'answered', score: 0, attempt: 1 },
    ]);
    expect(engine.getView().slideIndex).toBe(1);
    expect(engine.getState().q).toEqual({ [quiz.id]: { a: 1, r: 'a', c: [0, 2] } });

    // Back on it: the picks are shown, and cannot be changed.
    engine.previous();
    expect(view(q.choices[0]!.object)!.state).toBe('selected');
    expect(view(q.choices[1]!.object)!.state).toBe('normal');
    expect(view(q.choices[2]!.object)!.state).toBe('selected');
    engine.pointer('click', q.choices[1]!.object);
    expect(view(q.choices[1]!.object)!.state).toBe('normal');
    engine.pointer('click', q.submit!);
    expect(events.filter((event) => event.type === 'questionSubmit')).toHaveLength(1);

    // And so on resume.
    const resumed = start(engine.getState());
    resumed.engine.jumpToSlide(quiz.id);
    expect(resumed.view(q.choices[2]!.object)!.state).toBe('selected');
    expect(resumed.view(q.choices[1]!.object)!.state).toBe('normal');
  });

  it('lets pick one have one choice at a time', () => {
    const { quiz, start } = course('pickOne');
    const q = quiz.question as Extract<Question, { kind: 'pickOne' }>;
    const { engine, view } = start();
    engine.pointer('click', q.choices[0]!.object);
    engine.pointer('click', q.choices[1]!.object);
    expect(q.choices.map((choice) => view(choice.object)!.state)).toEqual([
      'normal',
      'selected',
      'normal',
    ]);
    engine.pointer('click', q.submit!);
    expect(engine.getState().q![quiz.id]).toEqual({ a: 1, r: 'a', c: [1] });
  });

  it('takes the branch set for after answering', () => {
    const { quiz, end, start } = course('shortAnswer');
    const q = quiz.question as Extract<Question, { kind: 'shortAnswer' }>;
    q.branch = { answered: { kind: 'slide', slide: end.id } };
    const { engine } = start();
    engine.input(q.entry!, 'Because.');
    engine.pointer('click', q.submit!);
    expect(engine.getView().slideId).toBe(end.id);
  });

  it('keeps an essay over several lines, locks it once answered, and keeps it on resume', () => {
    const { quiz, start } = course('essay');
    const q = quiz.question as Extract<Question, { kind: 'essay' }>;
    const { engine, view } = start();
    const words = 'First line.\nSecond line.';
    expect(engine.input(q.entry!, words)).toBe(true);
    // Unfinished: kept on resume, and still open.
    const midway = start(engine.getState());
    expect(midway.view(q.entry!)).toMatchObject({ value: words });
    expect(midway.view(q.entry!)!.locked).toBeUndefined();
    engine.pointer('click', q.submit!);
    expect(engine.getState().q![quiz.id]).toEqual({ a: 1, r: 'a', v: [words] });
    engine.previous();
    expect(view(q.entry!)).toMatchObject({ value: words, locked: true });
    expect(engine.input(q.entry!, 'changed')).toBe(false);
    const resumed = start(engine.getState());
    resumed.engine.jumpToSlide(quiz.id);
    expect(resumed.view(q.entry!)).toMatchObject({ value: words, locked: true });
  });

  it('keeps 4000 characters of an essay and 1000 of a one-line entry', () => {
    const long = 'x'.repeat(5000);
    const essay = course('essay');
    const e = essay.quiz.question as Extract<Question, { kind: 'essay' }>;
    const first = essay.start();
    first.engine.input(e.entry!, long);
    expect(first.view(e.entry!)!.value).toHaveLength(4000);
    const short = course('shortAnswer');
    const s = short.quiz.question as Extract<Question, { kind: 'shortAnswer' }>;
    const second = short.start();
    second.engine.input(s.entry!, long);
    expect(second.view(s.entry!)!.value).toHaveLength(1000);
  });

  it('does not finish how many on words, and finishes it on a number', () => {
    const { quiz, start } = course('howMany');
    const q = quiz.question as Extract<Question, { kind: 'howMany' }>;
    const { engine, events } = start();
    engine.input(q.entry!, 'lots');
    engine.pointer('click', q.submit!);
    expect(events.filter((event) => event.type === 'questionUnanswered')).toHaveLength(1);
    expect(engine.getView().slideIndex).toBe(0);
    engine.input(q.entry!, '12');
    engine.pointer('click', q.submit!);
    expect(engine.getView().slideIndex).toBe(1);
  });

  it('holds Next on a required survey until it is answered', () => {
    const { quiz, start } = course('pickOne');
    const q = quiz.question as Extract<Question, { kind: 'pickOne' }>;
    const { engine } = start();
    expect(engine.next()).toBe(false);
    engine.pointer('click', q.choices[0]!.object);
    engine.pointer('click', q.submit!);
    engine.previous();
    expect(engine.next()).toBe(true);
  });

  /** The middle of an object as the slide places it, in stage units. */
  const middleIn = (
    slide: {
      baseLayer: {
        objects: readonly {
          id: string;
          frame: { x: number; y: number; width: number; height: number };
        }[];
      };
    },
    id: string,
  ) => {
    const { frame } = slide.baseLayer.objects.find((object) => object.id === id)!;
    return [frame.x + frame.width / 2, frame.y + frame.height / 2] as const;
  };

  it('takes a word dropped in the blank as which word’s answer, then fixes it', () => {
    const { quiz, start } = course('whichWord');
    const q = quiz.question as Extract<Question, { kind: 'whichWord' }>;
    const [w0, w1] = q.words.map((word) => word.object);
    const { engine, events, view } = start();
    // Not in the blank yet: no answer.
    engine.pointer('click', q.submit!);
    expect(events.filter((event) => event.type === 'questionUnanswered')).toHaveLength(1);
    // Dropped elsewhere: back home, still no answer.
    expect(engine.drop(w0!, 1, 1)).toBe(true);
    expect(view(w0!)!.offset).toBeUndefined();
    expect(engine.drop(w1!, ...middleIn(quiz, q.blank!))).toBe(true);
    expect(view(w1!)!.offset).toBeDefined();
    engine.pointer('click', q.submit!);
    expect(engine.getState().q![quiz.id]).toEqual({ a: 1, r: 'a', v: [w1] });
    expect(engine.getView().slideIndex).toBe(1);
    // Back on it: the word is still in the blank, and cannot be moved.
    engine.previous();
    expect(view(w1!)!.offset).toBeDefined();
    expect(engine.drop(w0!, ...middleIn(quiz, q.blank!))).toBe(false);
    const resumed = start(engine.getState());
    resumed.engine.jumpToSlide(quiz.id);
    expect(resumed.view(w1!)!.offset).toEqual(view(w1!)!.offset);
  });

  it('starts ranking in the author’s order, swaps on a drop, and takes the order left', () => {
    const { quiz, start } = course('ranking', { random: () => 0 });
    const q = quiz.question as Extract<Question, { kind: 'ranking' }>;
    const [i0, i1, i2] = q.items.map((item) => item.object);
    const { engine, events, view } = start();
    // Not shuffled, even with a random that would shuffle: nothing has moved.
    expect([i0, i1, i2].map((id) => view(id!)!.offset)).toEqual([undefined, undefined, undefined]);
    expect(engine.getState().q).toBeUndefined();
    // Item 2 dropped on place 0 (where item 0 stands): they swap, giving [i2, i1, i0].
    // Places stand 64 apart: item 2 in place 0 is (0 − 2) × 64 = −128 from its own;
    // item 0 in place 2 is (2 − 0) × 64 = 128.
    engine.drop(i2!, ...middleIn(quiz, i0!));
    expect(view(i2!)!.offset).toEqual({ x: 0, y: -128 });
    expect(view(i0!)!.offset).toEqual({ x: 0, y: 128 });
    // Kept on resume before it is answered.
    const midway = start(engine.getState());
    expect(midway.view(i2!)!.offset).toEqual({ x: 0, y: -128 });
    engine.pointer('click', q.submit!);
    expect(events.filter((event) => event.type === 'questionSubmit')).toEqual([
      expect.objectContaining({ result: 'answered', score: 0 }),
    ]);
    expect(engine.getState().q![quiz.id]).toEqual({ a: 1, r: 'a', v: [i2, i1, i0] });
    engine.previous();
    expect(engine.drop(i1!, ...middleIn(quiz, i2!))).toBe(false);
    expect(view(i0!)!.offset).toEqual({ x: 0, y: 128 });
  });

  it('takes ranking unmoved as an answer: the author’s order', () => {
    const { quiz, start } = course('ranking');
    const q = quiz.question as Extract<Question, { kind: 'ranking' }>;
    const { engine } = start();
    engine.pointer('click', q.submit!);
    expect(engine.getState().q![quiz.id]).toEqual({
      a: 1,
      r: 'a',
      v: q.items.map((item) => item.object),
    });
  });

  it('rates Likert statements one point each, rows apart, and keeps the ratings', () => {
    const { quiz, start } = course('likert');
    const q = quiz.question as Extract<Question, { kind: 'likert' }>;
    const [r0, r1, r2] = q.statements.map((statement) => statement.points);
    const { engine, events, view } = start();
    // A row's points exclude each other; other rows are untouched.
    engine.pointer('click', r0![1]!);
    engine.pointer('click', r0![3]!);
    engine.pointer('click', r1![0]!);
    expect(r0!.map((id) => view(id)!.state)).toEqual([
      'normal',
      'normal',
      'normal',
      'selected',
      'normal',
    ]);
    expect(view(r1![0]!)!.state).toBe('selected');
    // Two of three rated: not an answer.
    engine.pointer('click', q.submit!);
    expect(events.filter((event) => event.type === 'questionUnanswered')).toHaveLength(1);
    expect(engine.getView().slideIndex).toBe(0);
    engine.pointer('click', r2![4]!);
    engine.pointer('click', q.submit!);
    expect(engine.getView().slideIndex).toBe(1);
    // Kept by position over the whole grid: row 0 point 3 is 3, row 1 point 0 is
    // 5 + 0 = 5, row 2 point 4 is 10 + 4 = 14.
    expect(engine.getState().q![quiz.id]).toEqual({ a: 1, r: 'a', c: [3, 5, 14] });
    engine.previous();
    expect(view(r2![4]!)!.state).toBe('selected');
    engine.pointer('click', r2![0]!);
    expect(view(r2![0]!)!.state).toBe('normal');
    const resumed = start(engine.getState());
    resumed.engine.jumpToSlide(quiz.id);
    expect(resumed.view(r0![3]!)!.state).toBe('selected');
    expect(resumed.view(r1![0]!)!.state).toBe('selected');
  });

  it('shuffles pick one’s choices when asked, keeping the order in the session', () => {
    // With random always 0 the order of three is [1, 2, 0] (see graded.test.ts).
    const { quiz, start } = course('pickOne', { random: () => 0 });
    const q = quiz.question as Extract<Question, { kind: 'pickOne' }>;
    q.shuffle = true;
    const { engine } = start();
    engine.pointer('click', q.choices[0]!.object);
    expect(engine.getState().q![quiz.id]!.o).toEqual([1, 2, 0]);
  });
});

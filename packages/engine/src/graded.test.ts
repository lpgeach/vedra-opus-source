import {
  createEmptyProject,
  createQuestionSlide,
  createScene,
  createSlide,
} from '@vedraopus/model';
import type { Question, SceneObject } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { createEngine } from './index';
import { markAnswer, readNumber } from './quiz';
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

const stage = { width: 1280, height: 720 };
const question = <K extends Question['kind']>(kind: K) =>
  quizSlide(kind, stage).question as Extract<Question, { kind: K }>;
const typed = (...values: string[]) => ({ chosen: [], values });

describe('marking the graded kinds', () => {
  it('marks true or false as one choice of two', () => {
    const q = question('trueFalse');
    expect(q.choices).toHaveLength(2);
    expect(markAnswer(q, { chosen: [q.choices[0]!.id], values: [] })).toMatchObject({
      correct: true,
    });
    expect(markAnswer(q, { chosen: [q.choices[1]!.id], values: [] })).toMatchObject({
      correct: false,
    });
  });

  it('marks fill in the blank, trimmed, ignoring case unless asked not to', () => {
    const q = { ...question('fillInBlank'), answers: ['Paris', 'Lutetia'] };
    expect(markAnswer(q, typed('  paris '))).toEqual({ answered: true, correct: true, score: 10 });
    expect(markAnswer(q, typed('Lutetia'))).toMatchObject({ correct: true });
    expect(markAnswer(q, typed('Rome'))).toEqual({ answered: true, correct: false, score: 0 });
    expect(markAnswer(q, typed('   '))).toMatchObject({ answered: false });
    expect(markAnswer({ ...q, caseSensitive: true }, typed('paris'))).toMatchObject({
      correct: false,
    });
  });

  it('marks numeric answers by any condition met, between including both ends', () => {
    const base = question('numeric');
    const answer = (conditions: (typeof base)['answers'], text: string) =>
      markAnswer({ ...base, answers: conditions }, typed(text)).correct;
    expect(answer([{ op: 'equal', value: 10 }], '10')).toBe(true);
    expect(answer([{ op: 'equal', value: 10 }], '10.5')).toBe(false);
    expect(answer([{ op: 'notEqual', value: 10 }], '9')).toBe(true);
    expect(answer([{ op: 'less', value: 10 }], '10')).toBe(false);
    expect(answer([{ op: 'lessOrEqual', value: 10 }], '10')).toBe(true);
    expect(answer([{ op: 'greater', value: 10 }], '11')).toBe(true);
    expect(answer([{ op: 'greaterOrEqual', value: 10 }], '9.99')).toBe(false);
    expect(answer([{ op: 'between', from: 1, to: 5 }], '1')).toBe(true);
    expect(answer([{ op: 'between', from: 5, to: 1 }], '5')).toBe(true);
    expect(answer([{ op: 'between', from: 1, to: 5 }], '5.01')).toBe(false);
    // Either condition will do.
    expect(
      answer(
        [
          { op: 'equal', value: 3 },
          { op: 'equal', value: 7 },
        ],
        '7',
      ),
    ).toBe(true);
    // A comma as the decimal mark; something that is not a number is wrong, not unanswered.
    expect(readNumber('3,5')).toBe(3.5);
    expect(readNumber('1,000.5')).toBe(null);
    expect(markAnswer(base, typed('ten'))).toEqual({ answered: true, correct: false, score: 0 });
  });

  it('marks matching and sequence dropdowns whole: all right, or wrong; any unchosen is unanswered', () => {
    const matching = question('matchingDropdown');
    const matches = matching.pairs.map((pair) => pair.match);
    expect(markAnswer(matching, typed(...matches))).toMatchObject({
      answered: true,
      correct: true,
    });
    expect(markAnswer(matching, typed(matches[0]!, matches[2]!, matches[1]!))).toMatchObject({
      answered: true,
      correct: false,
    });
    expect(markAnswer(matching, typed(matches[0]!, '', matches[2]!))).toMatchObject({
      answered: false,
    });
    const sequence = question('sequenceDropdown');
    const steps = sequence.steps.map((step) => step.text);
    expect(markAnswer(sequence, typed(...steps))).toMatchObject({ correct: true });
    expect(markAnswer(sequence, typed(...[...steps].reverse()))).toMatchObject({ correct: false });
  });
});

describe('dragging the drag kinds', () => {
  /** The middle of an object as the slide places it, in stage units. */
  const middleIn = (slide: { baseLayer: { objects: readonly SceneObject[] } }, id: string) => {
    const { frame } = slide.baseLayer.objects.find((object) => object.id === id)!;
    return [frame.x + frame.width / 2, frame.y + frame.height / 2] as const;
  };

  it('puts a word in the blank, sends back the one there, and marks the word left in it', () => {
    const { quiz, start } = course('wordBank');
    const q = quiz.question as Extract<Question, { kind: 'wordBank' }>;
    const [right, wrong] = q.words.map((word) => word.object);
    const { engine, events, view } = start();
    expect(view(right!)!.draggable).toBe(true);
    expect(view(q.blank!)!.draggable).toBeUndefined();
    // Nothing in the blank yet.
    engine.pointer('click', q.submit!);
    expect(events.some((event) => event.type === 'questionUnanswered')).toBe(true);
    // Dropped short of the blank: it stays home.
    expect(engine.drop(wrong!, 5, 5)).toBe(true);
    expect(view(wrong!)!.offset).toBeUndefined();
    expect(engine.drop(wrong!, ...middleIn(quiz, q.blank!))).toBe(true);
    const [blankX, blankY] = middleIn(quiz, q.blank!);
    const [wrongX, wrongY] = middleIn(quiz, wrong!);
    expect(view(wrong!)!.offset).toEqual({ x: blankX - wrongX, y: blankY - wrongY });
    // The right word takes its place; the wrong one goes back.
    engine.drop(right!, ...middleIn(quiz, q.blank!));
    expect(view(wrong!)!.offset).toBeUndefined();
    expect(view(right!)!.offset).toBeDefined();
    engine.pointer('click', q.submit!);
    expect(events.filter((event) => event.type === 'questionSubmit')).toEqual([
      expect.objectContaining({ result: 'correct', score: 10 }),
    ]);
    // Finished: shown where it was left, and fixed there.
    engine.previous();
    expect(view(right!)!.offset).toBeDefined();
    expect(view(right!)!.draggable).toBeUndefined();
    expect(engine.drop(right!, 5, 5)).toBe(false);
    expect(view(right!)!.offset).toBeDefined();
  });

  it('offers the keyboard each drag kind’s targets until the question is finished', () => {
    // docs/briefs/P10.1-accessibility.md, part B: the arrow keys go from target to target.
    const words = course('wordBank');
    const bank = words.quiz.question as Extract<Question, { kind: 'wordBank' }>;
    const [word] = bank.words.map((each) => each.object);
    const answering = words.start();
    expect(answering.engine.dropTargets(word!)).toEqual([bank.blank]);
    expect(answering.engine.dropTargets(bank.blank!)).toEqual([]);
    answering.engine.drop(word!, ...middleIn(words.quiz, bank.blank!));
    answering.engine.pointer('click', bank.submit!);
    answering.engine.previous();
    expect(answering.engine.dropTargets(word!)).toEqual([]);

    const matching = course('matchingDrag');
    const pairs = (matching.quiz.question as Extract<Question, { kind: 'matchingDrag' }>).pairs;
    expect(matching.start().engine.dropTargets(pairs[0]!.item)).toEqual(
      pairs.map((pair) => pair.target),
    );

    const sequence = course('sequenceDrag');
    const steps = (sequence.quiz.question as Extract<Question, { kind: 'sequenceDrag' }>).steps;
    const [s0, s1, s2] = steps.map((step) => step.object);
    expect(sequence.start().engine.dropTargets(s1!)).toEqual([s0, s2]);
  });

  it('matches items to targets one each, from shuffled homes, and keeps them on resume', () => {
    // With random always 0 the order of three is [1, 2, 0] (see quiz.test.ts): item i
    // starts in the home of item order.indexOf(i), so item 0 starts in item 2's.
    const { quiz, start } = course('matchingDrag', { random: () => 0 });
    const q = quiz.question as Extract<Question, { kind: 'matchingDrag' }>;
    const [first, second, third] = q.pairs;
    const { engine, view } = start();
    // Items stand 76 apart (createQuestionSlide): item 2's home is 2 × 76 = 152 below item 0's.
    expect(view(first!.item)!.offset).toEqual({ x: 0, y: 152 });
    engine.drop(first!.item, ...middleIn(quiz, first!.target));
    // Margin round(1280 × 0.08) = 102, so the layout is 1280 − 2 × 102 = 1076 wide.
    // Item 200 × 48 at x; target 220 × 56 at x + 1076 / 2 = x + 538, 4 higher.
    // Middles: item (x + 100, y + 24), target (x + 538 + 110, y − 4 + 28): offset (548, 0).
    expect(view(first!.item)!.offset).toEqual({ x: 548, y: 0 });
    // A target holds one item: the second sends the first home.
    engine.drop(second!.item, ...middleIn(quiz, first!.target));
    expect(view(first!.item)!.offset).toEqual({ x: 0, y: 152 });
    expect(engine.getState().q![quiz.id]).toEqual({
      a: 0,
      o: [1, 2, 0],
      v: ['', first!.target, ''],
    });
    // Resumed as left; saved nonsense goes home.
    const resumed = start(engine.getState());
    expect(resumed.view(second!.item)!.offset).toEqual(view(second!.item)!.offset);
    const nonsense = start({
      ...engine.getState(),
      q: { [quiz.id]: { a: 0, o: [1, 2, 0], v: ['obj_none', first!.target, first!.target] } },
    });
    expect(nonsense.engine.getState().q![quiz.id]!.v).toEqual([
      'obj_none',
      first!.target,
      first!.target,
    ]);
    nonsense.engine.drop(third!.item, 5, 5);
    expect(nonsense.engine.getState().q![quiz.id]!.v).toEqual(['', first!.target, '']);
    // Each on its own: correct.
    q.pairs.forEach((pair) => engine.drop(pair.item, ...middleIn(quiz, pair.target)));
    engine.pointer('click', q.submit!);
    expect(engine.getView().slideIndex).toBe(1);
  });

  it('starts a sequence shuffled, swaps two steps on a drop, and marks the order left', () => {
    // Order [1, 2, 0]: place 0 holds step 1, place 1 holds step 2, place 2 holds step 0.
    const { quiz, start } = course('sequenceDrag', { random: () => 0 });
    const q = quiz.question as Extract<Question, { kind: 'sequenceDrag' }>;
    q.attempts = 2;
    const [s0, s1, s2] = q.steps.map((step) => step.object);
    const { engine, events, view } = start();
    expect(engine.getState().q![quiz.id]).toEqual({ a: 0, o: [1, 2, 0] });
    // Places stand 64 apart: step 1 in place 0 is (0 − 1) × 64 = −64 from its own;
    // step 0 in place 2 is (2 − 0) × 64 = 128.
    expect(view(s1!)!.offset).toEqual({ x: 0, y: -64 });
    expect(view(s0!)!.offset).toEqual({ x: 0, y: 128 });
    // Dropped on place 0 (where step 0's tile stands in the slide): steps 0 and 1
    // swap, giving [s0, s2, s1]. Step 1 is now in place 2: (2 − 1) × 64 = 64.
    engine.drop(s0!, ...middleIn(quiz, s0!));
    expect(view(s0!)!.offset).toBeUndefined();
    expect(view(s1!)!.offset).toEqual({ x: 0, y: 64 });
    expect(engine.getState().q![quiz.id]!.v).toEqual([s0, s2, s1]);
    // Wrong, with a try left.
    engine.pointer('click', q.submit!);
    expect(events.filter((event) => event.type === 'questionSubmit')).toEqual([
      expect.objectContaining({ result: 'tryAgain' }),
    ]);
    // Step 1 dropped on place 1: it swaps with step 2, giving [s0, s1, s2].
    engine.drop(s1!, ...middleIn(quiz, s1!));
    expect([s0, s1, s2].map((id) => view(id!)!.offset)).toEqual([undefined, undefined, undefined]);
    engine.pointer('click', q.submit!);
    expect(engine.getView().slideIndex).toBe(1);
  });
});

describe('answering a hotspot', () => {
  /** The middle of an object as the slide places it, in stage units. */
  const centre = (quiz: ReturnType<typeof course>['quiz'], id: string) => {
    const { frame } = quiz.baseLayer.objects.find((object) => object.id === id)!;
    return [frame.x + frame.width / 2, frame.y + frame.height / 2] as const;
  };

  it('marks the picture, submits the spot under the mark, and keeps it on resume', () => {
    const { quiz, start } = course('hotspot');
    const q = quiz.question as Extract<Question, { kind: 'hotspot' }>;
    const [right, wrong] = q.spots;
    const { engine, events, view } = start();
    engine.pointer('click', q.submit!);
    expect(events.some((event) => event.type === 'questionUnanswered')).toBe(true);
    // The author's spots are guides: the learner sees only the picture.
    expect(view(q.picture!)!.visible).toBe(true);
    expect(view(right!.object)!.visible).toBe(false);
    expect(engine.mark(1, 1)).toBe(false);
    expect(view(q.picture!)!.mark).toBeUndefined();
    const at = centre(quiz, right!.object);
    expect(engine.mark(...at)).toBe(true);
    expect(view(q.picture!)!.mark).toEqual({ x: at[0], y: at[1] });
    expect(engine.getState().q![quiz.id]!.v).toEqual([right!.id, String(at[0]), String(at[1])]);
    engine.pointer('click', q.submit!);
    expect(events.filter((event) => event.type === 'questionSubmit')).toEqual([
      expect.objectContaining({ result: 'correct', score: 10 }),
    ]);
    expect(engine.getView().slideIndex).toBe(1);
    engine.previous();
    expect(view(q.picture!)!.mark).toEqual({ x: at[0], y: at[1] });
    expect(engine.mark(...centre(quiz, wrong!.object))).toBe(false);
    const resumed = start(engine.getState());
    expect(resumed.view(q.picture!)!.mark).toEqual({ x: at[0], y: at[1] });
  });

  it('marks a wrong spot wrong, then accepts another try', () => {
    const { quiz, start } = course('hotspot');
    const q = quiz.question as Extract<Question, { kind: 'hotspot' }>;
    q.attempts = 2;
    const { engine, events } = start();
    engine.mark(...centre(quiz, q.spots[1]!.object));
    engine.pointer('click', q.submit!);
    expect(events.filter((event) => event.type === 'questionSubmit')).toEqual([
      expect.objectContaining({ result: 'tryAgain' }),
    ]);
    engine.mark(...centre(quiz, q.spots[0]!.object));
    engine.pointer('click', q.submit!);
    expect(engine.getView().slideIndex).toBe(1);
  });
});

/** A question slide of `kind`, then an ordinary slide. */
function course(kind: Question['kind'], options: { random?: () => number } = {}) {
  const project = createEmptyProject('Graded');
  const quiz = quizSlide(kind, project.stage);
  project.scenes = [{ ...createScene(), slides: [quiz, createSlide('After')] }];
  const start = (restore?: SessionState) => {
    const engine = createEngine(project, { ...options, ...(restore ? { restore } : {}) });
    const events: EngineEvent[] = [];
    engine.on((event) => events.push(event));
    engine.tick(0);
    const view = (id: string) =>
      engine.getView().layers[0]?.objects.find((object) => object.id === id);
    return { engine, events, view };
  };
  return { project, quiz, start };
}

describe('answering the graded kinds', () => {
  it('takes what is typed, marks it on Submit, then shows it and takes no more', () => {
    const { quiz, start } = course('fillInBlank');
    const q = quiz.question as Extract<Question, { kind: 'fillInBlank' }>;
    const { engine, events, view } = start();
    engine.pointer('click', q.submit!);
    expect(events.some((event) => event.type === 'questionUnanswered')).toBe(true);
    expect(engine.input(q.entry!, 'ANSWER')).toBe(true);
    expect(view(q.entry!)!.value).toBe('ANSWER');
    engine.pointer('click', q.submit!);
    expect(events.filter((event) => event.type === 'questionSubmit')).toEqual([
      expect.objectContaining({ result: 'correct', score: 10 }),
    ]);
    expect(engine.getView().slideIndex).toBe(1);
    engine.previous();
    expect(view(q.entry!)).toMatchObject({ value: 'ANSWER', locked: true });
    expect(engine.input(q.entry!, 'changed')).toBe(false);
    // Kept in the session, and so on resume.
    const resumed = start(engine.getState());
    expect(resumed.view(q.entry!)).toMatchObject({ value: 'ANSWER', locked: true });
  });

  it('keeps what was typed in an unfinished question when the session is resumed', () => {
    const { quiz, start } = course('numeric');
    const q = quiz.question as Extract<Question, { kind: 'numeric' }>;
    const { engine } = start();
    engine.input(q.entry!, '42');
    expect(engine.getState().q).toEqual({ [quiz.id]: { a: 0, v: ['42'] } });
    const resumed = start(engine.getState());
    expect(resumed.view(q.entry!)).toMatchObject({ value: '42' });
    expect(resumed.view(q.entry!)!.locked).toBeUndefined();
  });

  it('lists a matching question’s options shuffled, and always a sequence’s', () => {
    // With random always 0 the order of three is [1, 2, 0] (see quiz.test.ts).
    const matching = course('matchingDropdown', { random: () => 0 });
    const m = matching.quiz.question as Extract<Question, { kind: 'matchingDropdown' }>;
    const first = matching.start();
    expect(first.view(m.pairs[0]!.select)!.options).toEqual([
      m.pairs[1]!.match,
      m.pairs[2]!.match,
      m.pairs[0]!.match,
    ]);
    // Answered right through the dropdowns, whatever the order shown.
    m.pairs.forEach((pair) => first.engine.input(pair.select, pair.match));
    first.engine.pointer('click', m.submit!);
    expect(first.engine.getView().slideIndex).toBe(1);
    const sequence = course('sequenceDropdown', { random: () => 0 });
    const s = sequence.quiz.question as Extract<Question, { kind: 'sequenceDropdown' }>;
    expect(sequence.start().view(s.steps[0]!.select)!.options).toEqual([
      s.steps[1]!.text,
      s.steps[2]!.text,
      s.steps[0]!.text,
    ]);
  });
});

describe('marking a hotspot', () => {
  it('marks a mark in a correct spot, and a wrong or missing one as wrong', () => {
    const q = question('hotspot');
    const [right, wrong] = q.spots;
    expect(markAnswer(q, typed(right!.id, '100', '200'))).toEqual({
      answered: true,
      correct: true,
      score: 10,
    });
    expect(markAnswer(q, typed(wrong!.id, '100', '200'))).toMatchObject({
      answered: true,
      correct: false,
    });
    // Clicked the picture, but not a spot: an answer, just not the right one.
    expect(markAnswer(q, typed('', '100', '200'))).toMatchObject({
      answered: true,
      correct: false,
    });
    expect(markAnswer(q, typed())).toMatchObject({ answered: false });
  });
});

describe('marking the drag kinds', () => {
  it('marks a word bank by the word dropped in the blank', () => {
    const q = question('wordBank');
    const [right, wrong] = q.words;
    expect(markAnswer(q, typed(right!.object))).toMatchObject({ answered: true, correct: true });
    expect(markAnswer(q, typed(wrong!.object))).toMatchObject({ answered: true, correct: false });
    expect(markAnswer(q, typed(''))).toMatchObject({ answered: false });
  });

  it('marks drag matching by each item’s target, and a sequence by the order left', () => {
    const matching = question('matchingDrag');
    const targets = matching.pairs.map((pair) => pair.target);
    expect(markAnswer(matching, typed(...targets))).toMatchObject({ correct: true });
    expect(markAnswer(matching, typed(targets[1]!, targets[0]!, targets[2]!))).toMatchObject({
      answered: true,
      correct: false,
    });
    expect(markAnswer(matching, typed('', '', ''))).toMatchObject({ answered: false });
    const sequence = question('sequenceDrag');
    const objects = sequence.steps.map((step) => step.object);
    expect(markAnswer(sequence, typed(...objects))).toMatchObject({ correct: true });
    expect(markAnswer(sequence, typed(...[...objects].reverse()))).toMatchObject({
      correct: false,
    });
  });
});

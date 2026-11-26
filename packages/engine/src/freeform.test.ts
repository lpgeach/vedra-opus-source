import {
  createEmptyProject,
  createId,
  createQuestionSlide,
  createScene,
  createSlide,
} from '@vedraopus/model';
import type { Question } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { createEngine } from './index';
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

/** Freeform questions in the engine (docs/briefs/P7.4-freeform-questions.md). */

function course<K extends Question['kind']>(kind: K) {
  const project = createEmptyProject('Freeform');
  const quiz = quizSlide(kind, project.stage);
  project.scenes = [{ ...createScene(), slides: [quiz, createSlide('After')] }];
  const question = quiz.question as Extract<Question, { kind: K }>;
  const start = (restore?: SessionState) => {
    const engine = createEngine(project, restore ? { restore } : {});
    const events: EngineEvent[] = [];
    engine.on((event) => events.push(event));
    engine.tick(0);
    const view = (id: string) =>
      engine.getView().layers[0]?.objects.find((object) => object.id === id);
    const submits = () => events.filter((event) => event.type === 'questionSubmit');
    return { engine, events, view, submits };
  };
  return { project, quiz, question, start };
}

describe('freeform pick one and pick many', () => {
  it('selects one picture at a time for pick one, and marks it right', () => {
    const { question, start } = course('freePickOne');
    const [right, wrong] = question.choices.map((choice) => choice.object);
    const { engine, view, submits } = start();
    engine.pointer('click', wrong!);
    engine.pointer('click', right!);
    expect(view(right!)!.state).toBe('selected');
    expect(view(wrong!)!.state).toBe('normal');
    engine.pointer('click', question.submit!);
    expect(submits()).toEqual([expect.objectContaining({ result: 'correct', score: 10 })]);
    expect(engine.getView().slideIndex).toBe(1);
  });

  it('marks pick many right only for exactly the right pictures, with attempts', () => {
    const { quiz, question, start } = course('freePickMany');
    question.attempts = 2;
    question.choices[1]!.correct = true;
    const [a, b, c] = question.choices.map((choice) => choice.object);
    const { engine, view, submits } = start();
    // Nothing picked: no answer.
    engine.pointer('click', question.submit!);
    expect(submits()).toEqual([]);
    // Too many: wrong, a try left.
    engine.pointer('click', a!);
    engine.pointer('click', b!);
    engine.pointer('click', c!);
    engine.pointer('click', question.submit!);
    expect(submits().at(-1)).toMatchObject({ result: 'tryAgain', score: 0 });
    // Clicking a picked one again unpicks it.
    engine.pointer('click', c!);
    expect(view(c!)!.state).toBe('normal');
    engine.pointer('click', question.submit!);
    expect(submits().at(-1)).toMatchObject({ result: 'correct', score: 10 });
    expect(engine.getState().q![quiz.id]).toEqual({ a: 2, r: 'c', s: 10, c: [0, 1] });
    // Back on it: kept and fixed.
    engine.previous();
    expect([a, b, c].map((id) => view(id!)!.state)).toEqual(['selected', 'selected', 'normal']);
    engine.pointer('click', c!);
    expect(view(c!)!.state).toBe('normal');
  });
});

describe('freeform text entry', () => {
  it('is marked as fill in the blank, and kept', () => {
    const { question, start } = course('freeText');
    const { engine, view, submits } = start();
    engine.input(question.entry!, ' ANSWER ');
    engine.pointer('click', question.submit!);
    expect(submits()).toEqual([expect.objectContaining({ result: 'correct' })]);
    engine.previous();
    expect(view(question.entry!)).toMatchObject({ value: ' ANSWER ', locked: true });
  });
});

describe('freeform shortcut key', () => {
  it('takes each press as the answer, with the modifiers held, and its attempts', () => {
    // The factory's key is Ctrl+S.
    const { quiz, question, start } = course('freeKey');
    question.attempts = 3;
    const { engine, events, submits } = start();
    // Not answers: a modifier alone, and Tab.
    expect(engine.key('Control', { ctrl: true })).toBe(false);
    expect(engine.key('Tab')).toBe(false);
    expect(submits()).toEqual([]);
    // S without Ctrl is wrong; Ctrl+Shift+S too (the modifiers must match).
    expect(engine.key('s')).toBe(true);
    expect(engine.key('S', { ctrl: true, shift: true })).toBe(true);
    expect(submits().map((event) => event.type === 'questionSubmit' && event.result)).toEqual([
      'tryAgain',
      'tryAgain',
    ]);
    // An answering press is nothing else: no key-press event, and no slide change.
    expect(events.filter((event) => event.type === 'keyPress').map((e) => e)).toEqual([
      { type: 'keyPress', key: 'Control' },
      { type: 'keyPress', key: 'Tab' },
    ]);
    // The last try: wrong, so the question's incorrect branch (the next slide) is taken.
    // (The arrow keys' own slide change is the player's; it skips an answering press.)
    expect(engine.key('ArrowRight')).toBe(true);
    expect(submits().at(-1)).toMatchObject({ result: 'incorrect' });
    expect(engine.getView().slideIndex).toBe(1);
    // Finished: presses are for triggers again.
    expect(engine.getState().q![quiz.id]).toEqual({ a: 3, r: 'i', s: 0, v: ['ArrowRight'] });
  });

  it('marks the right key right, without case, and moves on', () => {
    const { question, start } = course('freeKey');
    const { engine, submits } = start();
    expect(engine.key('S', { ctrl: true })).toBe(true);
    expect(submits()).toEqual([expect.objectContaining({ result: 'correct', score: 10 })]);
    expect(engine.getView().slideIndex).toBe(1);
    engine.previous();
    expect(engine.key('s', { ctrl: true })).toBe(false);
    expect(question.key.key).toBe('s');
  });

  it('keeps a wrong press on resume, and the attempts used', () => {
    const { quiz, question, start } = course('freeKey');
    question.attempts = 2;
    const first = start();
    first.engine.key('x');
    const resumed = start(first.engine.getState());
    expect(resumed.engine.getState().q![quiz.id]).toEqual({ a: 1, v: ['X'] });
    resumed.engine.key('s', { ctrl: true });
    expect(resumed.submits()).toEqual([expect.objectContaining({ result: 'correct', attempt: 2 })]);
  });
});

describe('freeform drag and drop', () => {
  // The factory's layout on a 1280 × 720 stage: margin 102, top 216. The Fruit bin is
  // 220 × 160 at (102 + 538, 216) = (640, 216), its middle (750, 296); Vegetables at
  // x 900, middle (1010, 296). Tiles are 200 × 48 at x 102, rows 64 apart: Apple's
  // middle is (202, 240), Carrot's (202, 304), Stone's (202, 368).
  const setup = (change: (q: Extract<Question, { kind: 'freeDrag' }>) => void = () => {}) => {
    const made = course('freeDrag');
    change(made.question);
    const [fruit, veg] = made.question.targets;
    const [apple, carrot, stone] = made.question.items.map((item) => item.object);
    const objects = new Map(made.quiz.baseLayer.objects.map((object) => [object.id, object]));
    const withStates = (id: string, ...states: string[]) =>
      objects
        .get(id)!
        .states.push(...states.map((state) => ({ id: state, name: state, overrides: {} })));
    return {
      ...made,
      fruit: fruit!,
      veg: veg!,
      apple: apple!,
      carrot: carrot!,
      stone: stone!,
      withStates,
    };
  };

  it('offers the keyboard the question’s targets for each item (P10.1, part B)', () => {
    const { start, fruit, veg, apple } = setup();
    expect(start().engine.dropTargets(apple)).toEqual([fruit, veg]);
  });

  it('snaps a dropped item to the target’s middle, and sends one dropped elsewhere home', () => {
    const { quiz, fruit, apple, start } = setup();
    const { engine, view } = start();
    expect(view(apple)!.draggable).toBe(true);
    engine.drop(apple, 700, 250);
    // (750, 296) − (202, 240) = (548, 56).
    expect(view(apple)!.offset).toEqual({ x: 548, y: 56 });
    expect(engine.getState().q![quiz.id]!.v).toEqual([`${fruit}|750|296`, '', '']);
    engine.drop(apple, 50, 600);
    expect(view(apple)!.offset).toBeUndefined();
    expect(engine.getState().q![quiz.id]!.v).toEqual(['', '', '']);
  });

  it('without snapping, leaves an item where it was let go, on a target or, not returning, off', () => {
    const { quiz, fruit, apple, start } = setup((q) => {
      q.snap = false;
      q.returnToStart = false;
    });
    const { engine, view } = start();
    engine.drop(apple, 700, 250);
    // (700, 250) − (202, 240) = (498, 10).
    expect(view(apple)!.offset).toEqual({ x: 498, y: 10 });
    engine.drop(apple, 50, 600);
    // (50, 600) − (202, 240) = (−152, 360).
    expect(view(apple)!.offset).toEqual({ x: -152, y: 360 });
    expect(engine.getState().q![quiz.id]!.v).toEqual(['|50|600', '', '']);
    void fruit;
  });

  it('keeps the question’s rules for its items even when they are made draggable (P9.7)', () => {
    const { quiz, fruit, apple, start } = setup();
    for (const object of quiz.baseLayer.objects) object.drag = { returnToStart: false };
    const { engine, view } = start();
    // Snapped to the bin's middle, recorded as the answer: not left where it was let go.
    engine.drop(apple, 700, 250);
    expect(view(apple)!.offset).toEqual({ x: 548, y: 56 });
    expect(engine.getState().q![quiz.id]!.v).toEqual([`${fruit}|750|296`, '', '']);
    engine.drop(apple, 50, 600);
    expect(view(apple)!.offset).toBeUndefined();
  });

  it('draws a target in Drag Over while an item is carried over it', () => {
    const { fruit, veg, apple, withStates, start } = setup();
    withStates(fruit, 'dragOver');
    const { engine, view } = start();
    expect(engine.carry(apple, 700, 250)).toBe(true);
    expect(view(fruit)!.state).toBe('dragOver');
    // Over the other bin (it has no Drag Over state), then nowhere.
    engine.carry(apple, 1000, 300);
    expect(view(fruit)!.state).toBe('normal');
    expect(view(veg)!.state).toBe('normal');
    engine.carry(apple, 700, 250);
    // Let go: the state goes.
    engine.drop(apple, 700, 250);
    expect(view(fruit)!.state).toBe('normal');
    // Something not carried changes nothing.
    expect(engine.carry(fruit, 700, 250)).toBe(false);
  });

  it('draws an item on a target in Drop Correct or Drop Incorrect, from where it is', () => {
    const { fruit, apple, carrot, withStates, start } = setup();
    withStates(apple, 'dropCorrect', 'dropIncorrect');
    withStates(carrot, 'dropCorrect', 'dropIncorrect');
    const { engine, view } = start();
    engine.drop(apple, 750, 296);
    engine.drop(carrot, 750, 296);
    expect(view(apple)!.state).toBe('dropCorrect');
    expect(view(carrot)!.state).toBe('dropIncorrect');
    const resumed = start(engine.getState());
    expect(resumed.view(carrot)!.state).toBe('dropIncorrect');
    engine.drop(carrot, 50, 600);
    expect(view(carrot)!.state).toBe('normal');
    void fruit;
  });

  it('keeps one item on each target when asked: the one there goes home (B11)', () => {
    const { quiz, fruit, apple, carrot, start } = setup((q) => {
      q.onePerTarget = true;
    });
    const { engine, view } = start();
    engine.drop(apple, 750, 296);
    engine.drop(carrot, 750, 296);
    expect(engine.getState().q![quiz.id]!.v).toEqual(['', `${fruit}|750|296`, '']);
    expect(view(apple)!.offset).toBeUndefined();
  });

  it('holds the drop states until Submit when asked (B11)', () => {
    const { quiz, question, apple, carrot, withStates, start } = setup((q) => {
      q.dropStatesAfterSubmit = true;
      q.attempts = 2;
    });
    withStates(apple, 'dropCorrect', 'dropIncorrect');
    withStates(carrot, 'dropCorrect', 'dropIncorrect');
    const { engine, view, events } = start();
    engine.drop(apple, 750, 296);
    engine.drop(carrot, 750, 296);
    expect(view(apple)!.state).toBe('normal');
    expect(view(carrot)!.state).toBe('normal');
    engine.pointer('click', question.submit!);
    expect(view(apple)!.state).toBe('dropCorrect');
    expect(view(carrot)!.state).toBe('dropIncorrect');
    // The change is told, as any state change is.
    expect(events).toContainEqual({
      type: 'objectStateChange',
      slideId: quiz.id,
      objectId: carrot,
      state: 'dropIncorrect',
    });
    // Kept on resume: the answer was submitted.
    expect(start(engine.getState()).view(apple)!.state).toBe('dropCorrect');
  });

  it('runs a question item’s "dragged over" and "dropped on" triggers (B11)', () => {
    const { project, quiz, fruit, veg, apple, start } = setup();
    const count = { id: createId('var'), name: 'Count', type: 'number' as const, default: 0 };
    project.variables.push(count);
    const add = (value: number) => ({
      type: 'setVariable' as const,
      variable: count.id,
      operator: 'add' as const,
      operand: { kind: 'literal' as const, value },
    });
    for (const [type, value] of [
      ['draggedOver', 10],
      ['droppedOn', 1],
    ] as const) {
      quiz.triggers.push({
        id: createId('trigger'),
        owner: { kind: 'object', id: apple },
        event: { type, object: apple, target: fruit },
        action: add(value),
        conditions: null,
        otherwise: null,
        enabled: true,
      });
    }
    const { engine } = start();
    engine.carry(apple, 700, 250);
    expect(engine.getVariable('Count')).toBe(10);
    engine.drop(apple, 700, 250);
    expect(engine.getVariable('Count')).toBe(11);
    // Dropped on the other target, or nowhere: its triggers name the Fruit bin only.
    engine.drop(apple, 1010, 296);
    engine.drop(apple, 50, 600);
    expect(engine.getVariable('Count')).toBe(11);
    void veg;
  });

  it('is right only with every item where it belongs, the decoy on none', () => {
    const { fruit, veg, apple, carrot, stone, question, start } = setup((q) => {
      q.attempts = 2;
    });
    const { engine, submits } = start();
    // Nothing moved: no answer.
    engine.pointer('click', question.submit!);
    expect(submits()).toEqual([]);
    engine.drop(apple, 750, 296);
    engine.drop(carrot, 1010, 296);
    engine.drop(stone, 750, 296);
    engine.pointer('click', question.submit!);
    expect(submits().at(-1)).toMatchObject({ result: 'tryAgain' });
    engine.drop(stone, 50, 600);
    engine.pointer('click', question.submit!);
    expect(submits().at(-1)).toMatchObject({ result: 'correct', score: 10 });
    // Finished: items stay put.
    engine.previous();
    expect(engine.drop(apple, 1010, 296)).toBe(false);
    void fruit;
    void veg;
  });
});

describe('freeform hotspot', () => {
  // Regions are 240 × 160 at y 216, x 102 + i × 360: Region 1 is x 102–342, Region 2
  // x 462–702, Region 3 x 822–1062, all y 216–376. Region 1 is the right one.
  it('marks anywhere on the slide, takes the region under the mark, and keeps it', () => {
    const { quiz, question, start } = course('freeHotspot');
    question.attempts = 2;
    const [right, wrong] = question.spots;
    const { engine, submits } = start();
    // Off the stage: not a mark.
    expect(engine.mark(-5, 100)).toBe(false);
    expect(engine.mark(1300, 100)).toBe(false);
    // On no region: a mark, but wrong.
    expect(engine.mark(640, 600)).toBe(true);
    expect(engine.getView().mark).toEqual({ x: 640, y: 600 });
    engine.pointer('click', question.submit!);
    expect(submits().at(-1)).toMatchObject({ result: 'tryAgain' });
    // The wrong region, then (moved) the right one.
    engine.mark(500, 300);
    expect(engine.getState().q![quiz.id]!.v).toEqual([wrong!.id, '500', '300']);
    engine.mark(200.4, 300.6);
    engine.pointer('click', question.submit!);
    expect(submits().at(-1)).toMatchObject({ result: 'correct', score: 10 });
    expect(engine.getState().q![quiz.id]).toEqual({
      a: 2,
      r: 'c',
      s: 10,
      v: [right!.id, '200', '301'],
    });
    // Back on it: the mark is shown and fixed; and so on resume.
    engine.previous();
    expect(engine.getView().mark).toEqual({ x: 200, y: 301 });
    expect(engine.mark(900, 300)).toBe(false);
    const resumed = start(engine.getState());
    resumed.engine.jumpToSlide(quiz.id);
    expect(resumed.engine.getView().mark).toEqual({ x: 200, y: 301 });
  });

  it('leaves its regions visible: they are the author’s own objects', () => {
    const { question, start } = course('freeHotspot');
    const { view } = start();
    expect(question.spots.map((spot) => view(spot.object)!.visible)).toEqual([true, true, true]);
  });
});

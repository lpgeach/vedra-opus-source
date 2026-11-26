import {
  createBank,
  createDrawSlide,
  createEmptyProject,
  createQuestionSlide,
  createScene,
  createSlide,
} from '@vedraopus/model';
import type { Draw } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { drawAll, drawQuestions } from './draw';
import { createEngine } from './index';

/** Drawing questions from banks (docs/briefs/P7.6-banks-and-draws.md). */

const bank = ['q1', 'q2', 'q3', 'q4', 'q5'];
const none = new Set<string>();
const draw = (change: Partial<Draw> = {}): Draw => ({
  bank: 'scene_bank',
  count: 2,
  order: 'inOrder',
  locked: [],
  ...change,
});
/** A random source that gives `values` in turn, then 0. */
const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++] ?? 0;
};

describe('drawQuestions', () => {
  it('takes the first in bank order, the locked ones first in, kept in bank order', () => {
    expect(drawQuestions(draw(), bank, none, Math.random)).toEqual(['q1', 'q2']);
    // q4 locked: it and the first other one, q1, in bank order.
    expect(drawQuestions(draw({ locked: ['q4'] }), bank, none, Math.random)).toEqual(['q1', 'q4']);
  });

  it('draws every locked question even past the count, and the whole bank at most', () => {
    expect(drawQuestions(draw({ locked: ['q5', 'q2', 'q3'] }), bank, none, Math.random)).toEqual([
      'q2',
      'q3',
      'q5',
    ]);
    expect(drawQuestions(draw({ count: 9 }), bank, none, Math.random)).toEqual(bank);
  });

  it('leaves out what is already taken', () => {
    expect(drawQuestions(draw(), bank, new Set(['q1', 'q3']), Math.random)).toEqual(['q2', 'q4']);
  });

  it('picks at random, then shuffles the whole draw, locked ones included', () => {
    // With random always 0, Fisher–Yates on n items gives [1, 2, …, n−1, 0] (quiz.test.ts):
    // of the rest [q1, q2, q4, q5] the order is [q2, q4, q5, q1], so the pick is q2;
    // then [q3 (locked), q2] shuffled is [q2, q3].
    expect(drawQuestions(draw({ order: 'random', locked: ['q3'] }), bank, none, () => 0)).toEqual([
      'q2',
      'q3',
    ]);
    // Over many draws, every question turns up.
    const seen = new Set<string>();
    for (let n = 0; n < 200; n++) {
      for (const id of drawQuestions(draw({ order: 'random' }), bank, none, Math.random)) {
        seen.add(id);
      }
    }
    expect([...seen].sort()).toEqual(bank);
    expect(drawQuestions(draw({ order: 'random' }), bank, none, sequence(0.99, 0.99))).toHaveLength(
      2,
    );
  });
});

/** A course: Intro, a draw of 2 from a bank of 3 (the second locked, in order), End. */
function course(change: Partial<Draw> = {}) {
  const project = createEmptyProject('Drawn');
  const pool = createBank('Pool', project.stage);
  pool.slides.push(
    createQuestionSlide('trueFalse', project.stage),
    createQuestionSlide('numeric', project.stage),
  );
  for (const slide of pool.slides) slide.question!.feedback.by = 'none';
  project.banks = [pool];
  const drawSlide = createDrawSlide(pool.id);
  drawSlide.draw = {
    ...drawSlide.draw!,
    order: 'inOrder',
    locked: [pool.slides[1]!.id],
    ...change,
  };
  const intro = createSlide('Intro');
  const end = createSlide('End');
  project.scenes = [{ ...createScene(), slides: [intro, drawSlide, end] }];
  return { project, pool, drawSlide, intro, end };
}

describe('a course with a draw in it', () => {
  it('plays the drawn questions in the draw slide’s place, and counts them', () => {
    const { project, pool, intro, end } = course();
    const engine = createEngine(project);
    engine.tick(0);
    expect(engine.getView().slideCount).toBe(4);
    expect(engine.getView().slideId).toBe(intro.id);
    engine.next();
    // In order with the second locked: the first and the second.
    expect(engine.getView().slideId).toBe(pool.slides[0]!.id);
    expect(engine.getView().slideIndex).toBe(1);
    engine.jumpToSlide(pool.slides[1]!.id);
    expect(engine.getView().slideIndex).toBe(2);
    engine.previous();
    expect(engine.getView().slideId).toBe(pool.slides[0]!.id);
    engine.jumpToSlide(end.id);
    expect(engine.getView().slideIndex).toBe(3);
    // The third was not drawn: not in the course.
    expect(() => engine.jumpToSlide(pool.slides[2]!.id)).toThrow();
  });

  it('goes to the first drawn question on a jump to the draw slide', () => {
    const { project, pool, drawSlide, end } = course();
    const engine = createEngine(project);
    engine.tick(0);
    engine.jumpToSlide(end.id);
    engine.jumpToSlide(drawSlide.id);
    expect(engine.getView().slideId).toBe(pool.slides[0]!.id);
  });

  it('passes over a draw that drew nothing', () => {
    const { project, drawSlide, intro, end } = course();
    drawSlide.draw = { ...drawSlide.draw!, bank: null, locked: [] };
    const engine = createEngine(project);
    engine.tick(0);
    expect(engine.getView().slideCount).toBe(2);
    expect(engine.getView().slideId).toBe(intro.id);
    engine.next();
    expect(engine.getView().slideId).toBe(end.id);
    engine.jumpToSlide(drawSlide.id);
    expect(engine.getView().slideId).toBe(end.id);
  });

  it('keeps the draw in the session, and on resume plays the same questions', () => {
    const { project, drawSlide } = course({ order: 'random', locked: [] });
    const engine = createEngine(project);
    engine.tick(0);
    const drawn = engine.getState().d![drawSlide.id]!;
    expect(drawn).toHaveLength(2);
    // Resumed with a random source that would draw something else.
    const again = createEngine(project, { restore: engine.getState(), random: () => 0.99 });
    again.tick(0);
    again.next();
    expect(again.getView().slideId).toBe(drawn[0]);
    expect(again.getState().d![drawSlide.id]).toEqual(drawn);
  });

  it('draws again when its saved questions have left the bank, and keeps what is left', () => {
    const { project, pool, drawSlide } = course();
    const saved = { [drawSlide.id]: [pool.slides[2]!.id, 'slide_gone'] };
    expect(drawAll(project, saved, Math.random).get(drawSlide.id)).toEqual([pool.slides[2]!.id]);
    expect(
      drawAll(project, { [drawSlide.id]: ['slide_gone'] }, Math.random).get(drawSlide.id),
    ).toEqual([pool.slides[0]!.id, pool.slides[1]!.id]);
  });

  it('gives two draws from one bank different questions', () => {
    const { project, pool } = course({ count: 2, locked: [] });
    const second = createDrawSlide(pool.id);
    second.draw = { ...second.draw!, count: 2, order: 'inOrder' };
    project.scenes[0]!.slides.push(second);
    const draws = drawAll(project, undefined, Math.random);
    const all = [...draws.values()].flat();
    expect(all).toEqual(pool.slides.map((slide) => slide.id));
    expect(new Set(all).size).toBe(3);
  });
});

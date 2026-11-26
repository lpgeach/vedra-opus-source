import {
  createBank,
  createDrawSlide,
  createEmptyProject,
  createQuestionSlide,
  createResultSlide,
  createScene,
  createSlide,
} from '@vedraopus/model';
import type { ChoiceQuestion, Question, Slide } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { createEngine } from './index';
import type { EngineEvent, SessionState } from './types';

/** Result slides in the engine (docs/briefs/P7.7-result-slides.md). */

/** A question slide that branches at once (no feedback layers waiting). */
const quizSlide = (kind: Question['kind'], stage: { width: number; height: number }) => {
  const slide = createQuestionSlide(kind, stage);
  slide.question!.feedback.by = 'none';
  slide.question!.required = false;
  return slide;
};

/**
 * Intro; q1 (multiple choice, 10 points); a draw of 1 from a bank holding one
 * true/false (10 points); a survey pick one; the result of every graded
 * question; End.
 */
function course(change: (result: Slide) => void = () => {}) {
  const project = createEmptyProject('Results');
  const q1 = quizSlide('multipleChoice', project.stage);
  const banked = quizSlide('trueFalse', project.stage);
  const bank = createBank('Bank', project.stage);
  bank.slides = [banked];
  project.banks = [bank];
  const draw = createDrawSlide(bank.id);
  draw.draw = { ...draw.draw!, count: 1 };
  const survey = quizSlide('pickOne', project.stage);
  const result = createResultSlide(project.stage);
  change(result);
  const end = createSlide('End');
  project.scenes = [
    { ...createScene(), slides: [createSlide('Intro'), q1, draw, survey, result, end] },
  ];
  const start = (restore?: SessionState) => {
    const engine = createEngine(project, restore ? { restore } : {});
    const events: EngineEvent[] = [];
    engine.on((event) => events.push(event));
    engine.tick(0);
    return { engine, events };
  };
  return {
    project,
    q1: q1.question as ChoiceQuestion,
    banked: banked.question as ChoiceQuestion,
    survey: survey.question as Extract<Question, { kind: 'pickOne' }>,
    slides: { q1, banked, draw, survey, result, end },
    start,
  };
}

/** Answer q1 right and the drawn true/false wrong, and pick in the survey; then the result. */
function answerThrough(c: ReturnType<typeof course>, engine: ReturnType<typeof createEngine>) {
  engine.jumpToSlide(c.slides.q1.id);
  engine.pointer('click', c.q1.choices[0]!.object);
  engine.pointer('click', c.q1.submit!);
  expect(engine.getView().slideId).toBe(c.slides.banked.id);
  engine.pointer('click', c.banked.choices[1]!.object);
  engine.pointer('click', c.banked.submit!);
  engine.pointer('click', c.survey.choices[0]!.object);
  engine.pointer('click', c.survey.submit!);
  expect(engine.getView().slideId).toBe(c.slides.result.id);
}

describe('a graded result', () => {
  it('adds up every graded question, a drawn one included and the survey not, and fails at 50%', () => {
    const c = course();
    const { engine } = c.start();
    answerThrough(c, engine);
    // 10 (q1 right) + 0 (the drawn one wrong) of 10 + 10: 50%, below the pass mark of 80.
    expect(engine.getView().variables).toMatchObject({
      ResultScore: 10,
      ResultMaxScore: 20,
      ResultPercent: 50,
      ResultPassPercent: 80,
      ResultPassed: false,
    });
    const shown = engine.getView().layers.map((layer) => layer.id);
    expect(shown).toContain(c.slides.result.result!.layers.failed);
    expect(shown).not.toContain(c.slides.result.result!.layers.passed);
    expect(engine.getState().res).toEqual({ [c.slides.result.id]: { s: 10, m: 20 } });
  });

  it('passes at the mark or above, and shows the Passed layer', () => {
    const c = course((result) => {
      result.result!.passPercent = 50;
    });
    const { engine } = c.start();
    answerThrough(c, engine);
    expect(engine.getView().variables['ResultPassed']).toBe(true);
    expect(engine.getView().layers.map((layer) => layer.id)).toContain(
      c.slides.result.result!.layers.passed,
    );
  });

  it('counts only the chosen slides: a draw stands for its questions, a result for its own', () => {
    const c = course();
    c.slides.result.result!.include = { kind: 'chosen', slides: [c.slides.draw.id] };
    const second = createResultSlide(c.project.stage, 'Overall');
    second.result!.include = { kind: 'chosen', slides: [c.slides.result.id, c.slides.q1.id] };
    c.project.scenes[0]!.slides.push(second);
    const { engine } = c.start();
    answerThrough(c, engine);
    // Only the drawn true/false, answered wrong: 0 of 10.
    expect(engine.getView().variables).toMatchObject({ ResultScore: 0, ResultMaxScore: 10 });
    engine.jumpToSlide(second.id);
    // The first result's question and q1, each once: 10 of 20.
    expect(engine.getView().variables).toMatchObject({ ResultScore: 10, ResultMaxScore: 20 });
  });

  it('counts an unanswered question as 0 of its points', () => {
    const c = course();
    const { engine } = c.start();
    engine.jumpToSlide(c.slides.result.id);
    expect(engine.getView().variables).toMatchObject({
      ResultScore: 0,
      ResultMaxScore: 20,
      ResultPercent: 0,
    });
  });
});

describe('a survey result', () => {
  it('counts the survey questions answered', () => {
    const c = course((result) => {
      result.result!.kind = 'survey';
    });
    const { engine } = c.start();
    engine.jumpToSlide(c.slides.result.id);
    expect(engine.getView().variables).toMatchObject({ ResultScore: 0, ResultMaxScore: 1 });
    answerThrough(c, engine);
    expect(engine.getView().variables).toMatchObject({ ResultScore: 1, ResultMaxScore: 1 });
  });
});

describe('tracking by a result slide', () => {
  it('completes the course on reaching it, with its success and score, and keeps them on resume', () => {
    const c = course();
    c.project.tracking.completion = { kind: 'result', slide: c.slides.result.id };
    const { engine, events } = c.start();
    expect(engine.getTracking()).toMatchObject({ complete: false, success: 'unknown' });
    answerThrough(c, engine);
    expect(engine.getTracking()).toEqual({
      complete: true,
      success: 'failed',
      progress: expect.any(Number),
      score: { raw: 10, max: 20 },
    });
    expect(events.filter((event) => event.type === 'trackingChange')).toHaveLength(1);
    // Elsewhere, the built-in variables describe the tracked result.
    engine.next();
    expect(engine.getView().slideId).toBe(c.slides.end.id);
    expect(engine.getView().variables['ResultPercent']).toBe(50);
    const resumed = c.start(engine.getState());
    expect(resumed.engine.getTracking()).toMatchObject({
      complete: true,
      success: 'failed',
      score: { raw: 10, max: 20 },
    });
  });
});

/** A Review, Retry or Print button's action, run as the learner clicking it. */
const press = (
  c: ReturnType<typeof course>,
  engine: ReturnType<typeof createEngine>,
  action: string,
) => {
  const trigger = c.slides.result.triggers.find((each) => each.action.type === action)!;
  engine.pointer('click', trigger.owner.id);
};

describe('review, retry and print from a result slide', () => {
  it('reviews the result’s questions only, Next moving among them and on from the last back', () => {
    const c = course();
    const { engine } = c.start();
    answerThrough(c, engine);
    press(c, engine, 'reviewQuiz');
    expect(engine.getView().slideId).toBe(c.slides.q1.id);
    expect(engine.getView().review).toBe('correct');
    expect(engine.getView().canPrevious).toBe(false);
    engine.next();
    // The drawn question, not the survey (it is not in this graded result).
    expect(engine.getView().slideId).toBe(c.slides.banked.id);
    expect(engine.getView().review).toBe('incorrect');
    engine.previous();
    expect(engine.getView().slideId).toBe(c.slides.q1.id);
    engine.next();
    engine.next();
    // Past the last: review is over, back on the result slide.
    expect(engine.getView().slideId).toBe(c.slides.result.id);
    expect(engine.getView().review).toBeUndefined();
  });

  it('leaves review with exitReview, back to the result slide', () => {
    const c = course();
    // An exitReview button on q1, for the test.
    c.slides.q1.triggers.push({
      id: 'trigger_exit',
      owner: { kind: 'slide', id: c.slides.q1.id },
      event: { type: 'keyPress', key: 'x' },
      action: { type: 'exitReview' },
      conditions: null,
      otherwise: null,
      enabled: true,
    });
    const { engine } = c.start();
    answerThrough(c, engine);
    press(c, engine, 'reviewQuiz');
    engine.key('x');
    expect(engine.getView().slideId).toBe(c.slides.result.id);
    expect(engine.getView().review).toBeUndefined();
  });

  it('retries: the answers cleared, the draw made again, and back to the first question', () => {
    const c = course();
    // A bank of two, a draw of one: the retry may draw the other.
    const other = quizSlide('trueFalse', c.project.stage);
    c.project.banks[0]!.slides.push(other);
    const { engine } = c.start();
    // q1 answered right, then straight to the result (the draw may have drawn either).
    engine.jumpToSlide(c.slides.q1.id);
    engine.pointer('click', c.q1.choices[0]!.object);
    engine.pointer('click', c.q1.submit!);
    engine.jumpToSlide(c.slides.result.id);
    expect(engine.getState().q![c.slides.q1.id]).toMatchObject({ r: 'c' });
    press(c, engine, 'retryQuiz');
    expect(engine.getView().slideId).toBe(c.slides.q1.id);
    expect(engine.getState().q?.[c.slides.q1.id]).toBeUndefined();
    expect(engine.getState().res).toBeUndefined();
    // Still one drawn, and the course still has six slides.
    expect(Object.values(engine.getState().d!)[0]).toHaveLength(1);
    expect(engine.getView().slideCount).toBe(6);
    // q1 can be answered again.
    engine.pointer('click', c.q1.choices[1]!.object);
    engine.pointer('click', c.q1.submit!);
    expect(engine.getState().q![c.slides.q1.id]).toMatchObject({ r: 'i' });
  });

  it('retries only the wrong answers, keeping the right ones and the draw (B11)', () => {
    const c = course((result) => {
      result.result!.retryIncorrectOnly = true;
    });
    const { engine } = c.start();
    // q1 right, the drawn true/false wrong.
    answerThrough(c, engine);
    const drawn = engine.getState().d;
    press(c, engine, 'retryQuiz');
    // Back to the first question answered wrongly: the drawn one, still the same.
    expect(engine.getView().slideId).toBe(c.slides.banked.id);
    expect(engine.getState().d).toEqual(drawn);
    expect(engine.getState().q![c.slides.q1.id]).toMatchObject({ r: 'c' });
    expect(engine.getState().q?.[c.slides.banked.id]).toBeUndefined();
    expect(engine.getState().res).toBeUndefined();
    // Answered right this time, the result is the whole score.
    engine.pointer('click', c.banked.choices[0]!.object);
    engine.pointer('click', c.banked.submit!);
    engine.jumpToSlide(c.slides.result.id);
    expect(engine.getState().q![c.slides.banked.id]).toMatchObject({ r: 'c' });
    expect(engine.getVariable('ResultPercent')).toBe(100);
  });

  it('gives a printable summary of the result', () => {
    const c = course();
    const { engine, events } = c.start();
    answerThrough(c, engine);
    press(c, engine, 'printResults');
    const printed = events.find((event) => event.type === 'printResults');
    expect(printed?.type === 'printResults' && printed.summary).toEqual({
      course: 'Results',
      result: 'Results',
      kind: 'graded',
      score: 10,
      max: 20,
      percent: 50,
      passPercent: 80,
      passed: false,
      questions: [
        { title: c.slides.q1.title, result: 'correct', score: 10 },
        { title: c.slides.banked.title, result: 'incorrect', score: 0 },
      ],
    });
  });
});

describe('a result timer', () => {
  const timed = () =>
    course((result) => {
      result.result!.timer = { seconds: 30 };
    });

  it('starts at the first question, counts down, and at 0 takes the learner to the result', () => {
    const c = timed();
    const { engine } = c.start();
    // Not started on the intro.
    expect(engine.getView().timer).toBeUndefined();
    // Away from a result slide the variables describe the tracked result; none is tracked here.
    expect(engine.getView().variables['ResultTimeLeft']).toBe(0);
    engine.jumpToSlide(c.slides.q1.id);
    expect(engine.getView().timer).toEqual({ left: 30 });
    // 12.5 s later: 30 − 12.5 = 17.5, shown as 18 (rounded up).
    engine.tick(12_500);
    expect(engine.getView().timer).toEqual({ left: 18 });
    expect(engine.getView().variables['ResultTimeLeft']).toBe(18);
    // Kept on resume: the time it started at.
    const state = engine.getState();
    expect(Object.keys(state.tm ?? {})).toEqual([c.slides.result.id]);
    engine.tick(30_000);
    expect(engine.getView().slideId).toBe(c.slides.result.id);
    // On the result slide the timer has stopped.
    expect(engine.getView().timer).toBeUndefined();
    const resumed = c.start(state);
    resumed.engine.jumpToSlide(c.slides.q1.id);
    expect(resumed.engine.getView().timer!.left).toBeLessThanOrEqual(18);
  });
});

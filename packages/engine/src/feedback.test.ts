import {
  addFeedbackLayers,
  createEmptyProject,
  createFeedbackMaster,
  createQuestionSlide,
  createScene,
  createSlide,
  feedbackParts,
} from '@vedraopus/model';
import type { ChoiceQuestion, Question, Slide } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { createEngine } from './index';
import type { EngineEvent, SessionState } from './types';

/** Submit and the feedback layers (docs/briefs/P7.5-feedback.md). */

const stage = { width: 1280, height: 720 };

function course<K extends Question['kind']>(
  kind: K,
  change: (q: Extract<Question, { kind: K }>, slide: Slide) => void = () => {},
) {
  const project = createEmptyProject('Feedback');
  const quiz = createQuestionSlide(kind, project.stage);
  const question = quiz.question as Extract<Question, { kind: K }>;
  change(question, quiz);
  // Layers the change now calls for (try again, with more tries), from the master.
  addFeedbackLayers(quiz, createFeedbackMaster(stage));
  const end = createSlide('End');
  project.scenes = [{ ...createScene(), slides: [quiz, createSlide('After'), end] }];
  const start = (restore?: SessionState) => {
    const engine = createEngine(project, restore ? { restore } : {});
    const events: EngineEvent[] = [];
    engine.on((event) => events.push(event));
    engine.tick(0);
    const shown = () =>
      engine
        .getView()
        .layers.map((layer) => layer.id)
        .slice(1);
    const view = (id: string) =>
      engine
        .getView()
        .layers.flatMap((layer) => layer.objects)
        .find((object) => object.id === id);
    return { engine, events, shown, view };
  };
  return { project, quiz, question, end, start };
}

describe('Submit shows the result’s feedback layer', () => {
  it('shows Try Again and waits; its button closes it; Correct then waits for Continue', () => {
    const { question, start } = course('multipleChoice', (q) => {
      q.attempts = 2;
    });
    const { correct, tryAgain } = question.feedback;
    expect(tryAgain).not.toBeNull();
    const { engine, shown } = start();
    engine.pointer('click', question.choices[1]!.object);
    engine.pointer('click', question.submit!);
    expect(shown()).toEqual([tryAgain!.layer]);
    expect(engine.getView().slideIndex).toBe(0);
    // Try Again: the layer closes, and the learner answers again.
    engine.pointer('click', tryAgain!.button!);
    expect(shown()).toEqual([]);
    expect(engine.getView().slideIndex).toBe(0);
    engine.pointer('click', question.choices[0]!.object);
    engine.pointer('click', question.submit!);
    expect(shown()).toEqual([correct!.layer]);
    expect(engine.getView().slideIndex).toBe(0);
    // Continue: the correct branch, here the next slide.
    engine.pointer('click', correct!.button!);
    expect(engine.getView().slideIndex).toBe(1);
  });

  it('takes the incorrect branch from Incorrect’s Continue', () => {
    const { question, end, start } = course('trueFalse', (q) => {
      q.branch.incorrect = { kind: 'slide', slide: 'placeholder' };
    });
    question.branch.incorrect = { kind: 'slide', slide: end.id };
    const { engine, shown } = start();
    engine.pointer('click', question.choices[1]!.object);
    engine.pointer('click', question.submit!);
    expect(shown()).toEqual([question.feedback.incorrect!.layer]);
    engine.pointer('click', question.feedback.incorrect!.button!);
    expect(engine.getView().slideId).toBe(end.id);
  });

  it('branches at once with feedback none, or when the layer was deleted', () => {
    const none = course('multipleChoice', (q) => {
      q.feedback.by = 'none';
    });
    const first = none.start();
    first.engine.pointer('click', none.question.choices[0]!.object);
    first.engine.pointer('click', none.question.submit!);
    expect(first.engine.getView().slideIndex).toBe(1);

    // The Correct layer deleted after the slide was made.
    const gone = course('multipleChoice');
    gone.quiz.layers = gone.quiz.layers.filter(
      (layer) => layer.id !== gone.question.feedback.correct!.layer,
    );
    gone.question.feedback.correct = null;
    const second = gone.start();
    second.engine.pointer('click', gone.question.choices[0]!.object);
    second.engine.pointer('click', gone.question.submit!);
    expect(second.engine.getView().slideIndex).toBe(1);
  });

  it('shows a survey’s Thank You, whose Continue takes its branch', () => {
    const { question, end, start } = course('pickOne');
    question.branch.answered = { kind: 'slide', slide: end.id };
    const { engine, shown } = start();
    engine.pointer('click', question.choices[0]!.object);
    engine.pointer('click', question.submit!);
    expect(shown()).toEqual([question.feedback.answered!.layer]);
    engine.pointer('click', question.feedback.answered!.button!);
    expect(engine.getView().slideId).toBe(end.id);
  });

  it('keeps a feedback layer left open on resume, and Next still goes on', () => {
    const { question, start } = course('multipleChoice');
    const first = start();
    first.engine.pointer('click', question.choices[0]!.object);
    first.engine.pointer('click', question.submit!);
    const resumed = start(first.engine.getState());
    expect(resumed.engine.getView().slideIndex).toBe(0);
    expect(resumed.shown()).toEqual([question.feedback.correct!.layer]);
    // Finished, so Next is not held; it goes to the next slide as Next does.
    expect(resumed.engine.next()).toBe(true);
    expect(resumed.engine.getView().slideIndex).toBe(1);
  });

  it('does nothing with continueQuestion when no question is finished or waiting', () => {
    const { question, start } = course('multipleChoice');
    const { engine, events } = start();
    engine.pointer('click', question.feedback.correct!.button!);
    expect(engine.getView().slideIndex).toBe(0);
    expect(events.some((event) => event.type === 'warning')).toBe(false);
  });
});

describe('feedback by choice', () => {
  const byChoice = (kind: 'multipleChoice' | 'multipleResponse') =>
    course(kind, (q) => {
      const choices = (q as ChoiceQuestion).choices;
      (q as ChoiceQuestion).feedback.by = 'choice';
      choices[0]!.feedback = 'Yes: the first is right.';
      choices[1]!.feedback = 'The second is not.';
      if (kind === 'multipleResponse') choices[0]!.correct = true;
    });

  it('puts the picked choice’s words in the message', () => {
    const { question, start } = byChoice('multipleChoice');
    const q = question as ChoiceQuestion;
    const { engine, view } = start();
    engine.pointer('click', q.choices[1]!.object);
    engine.pointer('click', q.submit!);
    expect(view(q.feedback.incorrect!.message!)!.text).toBe('The second is not.');
  });

  it('puts each picked choice’s words on a line of its own for multiple response', () => {
    const { question, start } = byChoice('multipleResponse');
    const q = question as ChoiceQuestion;
    const { engine, view } = start();
    engine.pointer('click', q.choices[0]!.object);
    engine.pointer('click', q.choices[1]!.object);
    engine.pointer('click', q.choices[2]!.object);
    engine.pointer('click', q.submit!);
    // The third has no feedback of its own: it adds no line.
    expect(view(q.feedback.incorrect!.message!)!.text).toBe(
      'Yes: the first is right.\nThe second is not.',
    );
  });

  it('leaves the layer’s own words when nothing picked has feedback, or feedback is by question', () => {
    const { question, start } = byChoice('multipleChoice');
    const q = question as ChoiceQuestion;
    const { engine, view } = start();
    engine.pointer('click', q.choices[2]!.object);
    engine.pointer('click', q.submit!);
    expect(view(q.feedback.incorrect!.message!)!.text).toBeUndefined();
    const plain = course('multipleChoice');
    const second = plain.start();
    second.engine.pointer('click', plain.question.choices[1]!.object);
    second.engine.pointer('click', plain.question.submit!);
    expect(second.view(plain.question.feedback.incorrect!.message!)!.text).toBeUndefined();
  });
});

describe('review mode', () => {
  /** Three questions answered (or not), then a slide with a Review button. */
  function reviewCourse() {
    const project = createEmptyProject('Review');
    const choice = createQuestionSlide('multipleChoice', project.stage);
    const blank = createQuestionSlide('fillInBlank', project.stage);
    const hotspot = createQuestionSlide('hotspot', project.stage);
    const results = createSlide('Results');
    const button = {
      ...createQuestionSlide('multipleChoice', project.stage).baseLayer.objects.at(-1)!,
    };
    results.baseLayer.objects.push(button);
    results.triggers.push({
      id: 'trigger_review',
      owner: { kind: 'object', id: button.id },
      event: { type: 'click', object: button.id },
      action: { type: 'reviewQuiz' },
      conditions: null,
      otherwise: null,
      enabled: true,
    });
    project.scenes = [{ ...createScene(), slides: [choice, blank, hotspot, results] }];
    const engine = createEngine(project);
    const view = (id: string) =>
      engine
        .getView()
        .layers.flatMap((layer) => layer.objects)
        .find((object) => object.id === id);
    const go = () => {
      const shown = engine.getView().layers.slice(1);
      // The feedback layer showing, and its button.
      const part = [choice, blank, hotspot]
        .flatMap((slide) => feedbackParts(slide.question!))
        .find(({ part: each }) => shown.some((l) => l.id === each.layer))!.part;
      engine.pointer('click', part.button!);
    };
    engine.tick(0);
    return {
      engine,
      view,
      go,
      button,
      choice: choice.question as ChoiceQuestion,
      blank: blank.question as Extract<Question, { kind: 'fillInBlank' }>,
      hotspot: hotspot.question as Extract<Question, { kind: 'hotspot' }>,
      slides: { choice, blank, hotspot, results },
    };
  }

  it('goes to the first question, shows the answers and the right ones, and locks everything', () => {
    const { engine, view, go, button, choice, blank, hotspot, slides } = reviewCourse();
    // Multiple choice: the second (wrong) answer; then the blank typed right.
    engine.pointer('click', choice.choices[1]!.object);
    engine.pointer('click', choice.submit!);
    go();
    engine.input(blank.entry!, 'Answer');
    engine.pointer('click', blank.submit!);
    go();
    // The hotspot is left unanswered (it is required, so Next is held): on to the results.
    engine.jumpToSlide(slides.results.id);
    expect(engine.getView().slideId).toBe(slides.results.id);
    expect(engine.getView().review).toBeUndefined();
    engine.pointer('click', button.id);

    // Review: the first question, its result, the right answer and the wrong pick marked.
    expect(engine.getView().slideId).toBe(slides.choice.id);
    expect(engine.getView().review).toBe('incorrect');
    expect(engine.getView().layers).toHaveLength(1);
    expect(view(choice.choices[0]!.object)!.review).toBe('right');
    expect(view(choice.choices[1]!.object)!.review).toBe('chosen');
    expect(view(choice.choices[2]!.object)!.review).toBeUndefined();
    // Locked: a click changes nothing, Submit does nothing.
    engine.pointer('click', choice.choices[0]!.object);
    expect(view(choice.choices[0]!.object)!.state).toBe('normal');
    engine.pointer('click', choice.submit!);
    expect(engine.getView().layers).toHaveLength(1);

    engine.next();
    expect(engine.getView().review).toBe('correct');
    expect(view(blank.entry!)).toMatchObject({ value: 'Answer', locked: true, review: 'right' });

    // The unanswered hotspot: its right region shown and marked, nothing chosen; Next is not held.
    engine.next();
    expect(engine.getView().review).toBe('unanswered');
    const right = hotspot.spots.find((spot) => spot.correct)!;
    expect(view(right.object)).toMatchObject({ visible: true, review: 'right' });
    expect(engine.mark(400, 400)).toBe(false);
    expect(engine.next()).toBe(true);
  });

  it('is not kept in the session', () => {
    const { engine, button, slides } = reviewCourse();
    engine.jumpToSlide(slides.results.id);
    engine.pointer('click', button.id);
    expect(engine.getView().review).toBe('unanswered');
    expect(JSON.stringify(engine.getState())).not.toContain('review');
  });
});

describe('review marks on the drag kinds', () => {
  it('marks a word bank’s right word, and the wrong one put in the blank', () => {
    const project = createEmptyProject('Words');
    const bank = createQuestionSlide('wordBank', project.stage);
    bank.question!.feedback.by = 'none';
    const q = bank.question as Extract<Question, { kind: 'wordBank' }>;
    // A Review button on the same slide, beside Submit.
    const review = { ...bank.baseLayer.objects.find((o) => o.id === q.submit)!, id: 'obj_review' };
    bank.baseLayer.objects.push(review);
    bank.triggers.push({
      id: 'trigger_review',
      owner: { kind: 'object', id: review.id },
      event: { type: 'click', object: review.id },
      action: { type: 'reviewQuiz' },
      conditions: null,
      otherwise: null,
      enabled: true,
    });
    project.scenes = [{ ...createScene(), slides: [bank, createSlide('End')] }];
    const engine = createEngine(project);
    engine.tick(0);
    const blank = bank.baseLayer.objects.find((o) => o.id === q.blank)!.frame;
    const [right, wrong] = q.words.map((word) => word.object);
    engine.drop(wrong!, blank.x + 5, blank.y + 5);
    engine.pointer('click', review.id);
    const view = (id: string) => engine.getView().layers[0]!.objects.find((o) => o.id === id);
    expect(engine.getView().review).toBe('unanswered');
    expect(view(right!)!.review).toBe('right');
    expect(view(wrong!)!.review).toBe('chosen');
    expect(view(wrong!)!.draggable).toBeUndefined();
  });

  it('marks freeform items on the right target right, and a decoy on one chosen', () => {
    const project = createEmptyProject('Sorting');
    const sort = createQuestionSlide('freeDrag', project.stage);
    sort.question!.feedback.by = 'none';
    const q = sort.question as Extract<Question, { kind: 'freeDrag' }>;
    const results = createSlide('Results');
    const button = { ...sort.baseLayer.objects.find((o) => o.id === q.submit)!, id: 'obj_review' };
    results.baseLayer.objects.push(button);
    results.triggers.push({
      id: 'trigger_review',
      owner: { kind: 'object', id: button.id },
      event: { type: 'click', object: button.id },
      action: { type: 'reviewQuiz' },
      conditions: null,
      otherwise: null,
      enabled: true,
    });
    project.scenes = [{ ...createScene(), slides: [sort, results] }];
    const engine = createEngine(project);
    engine.tick(0);
    const [apple, , stone] = q.items.map((item) => item.object);
    // The factory's Fruit bin has its middle at (750, 296) (see freeform.test.ts).
    engine.drop(apple!, 750, 296);
    engine.drop(stone!, 750, 296);
    engine.pointer('click', q.submit!);
    expect(engine.getView().slideId).toBe(results.id);
    engine.pointer('click', button.id);
    const view = (id: string) => engine.getView().layers[0]!.objects.find((o) => o.id === id);
    expect(engine.getView().review).toBe('incorrect');
    expect(view(apple!)!.review).toBe('right');
    expect(view(stone!)!.review).toBe('chosen');
  });
});

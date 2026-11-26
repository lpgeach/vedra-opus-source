import {
  choiceMarks,
  createButtonObject,
  createDrawSlide,
  createBank,
  createEmptyProject,
  createId,
  createLayer,
  createQuestionSlide,
  createScene,
  createSlide,
} from '@vedraopus/model';
import type { Project, Trigger, TriggerAction } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { createEngine } from './index';
import type { EngineEvent } from './index';

/** The rest of plan 4.2's actions (docs/briefs/P8.6-course-actions.md). */

/**
 * Two slides. One has a button for each action under test (the action set by
 * the test) and a counter set to 5 on entry to slide Two. Slides counted as
 * complete after both are seen.
 */
function setup(action: TriggerAction, change: (project: Project) => void = () => {}) {
  const project = createEmptyProject('Actions');
  const count = { id: createId('var'), name: 'Count', type: 'number' as const, default: 0 };
  const name = { id: createId('var'), name: 'Name', type: 'text' as const, default: 'Sam' };
  project.variables.push(count, name);
  const one = createSlide('One');
  one.baseLayer.timeline.duration = 10;
  const go = createButtonObject('Go');
  go.timing = { start: 0, duration: 'untilEnd' };
  const layer = createLayer('Extra');
  layer.timeline.duration = 6;
  one.layers.push(layer);
  one.baseLayer.objects.push(go);
  const two = createSlide('Two');
  const trigger: Trigger = {
    id: createId('trigger'),
    owner: { kind: 'object', id: go.id },
    event: { type: 'click', object: go.id },
    action,
    conditions: null,
    otherwise: null,
    enabled: true,
  };
  one.triggers.push(trigger);
  two.triggers.push({
    id: createId('trigger'),
    owner: { kind: 'slide', id: two.id },
    event: { type: 'timelineStart', layer: two.baseLayer.id },
    action: {
      type: 'setVariable',
      variable: count.id,
      operator: 'assign',
      operand: { kind: 'literal', value: 5 },
    },
    conditions: null,
    otherwise: null,
    enabled: true,
  });
  project.scenes = [{ ...createScene(), slides: [one, two] }];
  project.tracking.completion = { kind: 'slidesViewed', count: null };
  change(project);
  const engine = createEngine(project);
  const events: EngineEvent[] = [];
  engine.on((event) => events.push(event));
  let now = 0;
  engine.tick(now);
  const at = (seconds: number) => {
    now += seconds * 1000;
    engine.tick(now);
  };
  const press = () => engine.pointer('click', go.id);
  return { project, engine, events, at, press, one, two, go, layer };
}

describe('course actions', () => {
  it('restart starts the session again from slide 1, keeping completion', () => {
    const { engine, events, press, one, two } = setup({ type: 'restartCourse' });
    engine.next();
    expect(engine.getVariable('Count')).toBe(5);
    expect(engine.getState().c).toBe(1);
    engine.previous();
    press();
    const view = engine.getView();
    expect(view.slideId).toBe(one.id);
    expect(engine.getVariable('Count')).toBe(0);
    const state = engine.getState();
    // Seen again from scratch: only slide 1 so far. But completion stays.
    expect(state.vis).toEqual([one.id]);
    expect(state.c).toBe(1);
    // The variable change was told, so text that shows it is drawn again.
    expect(
      events.some((e) => e.type === 'variableChange' && e.name === 'Count' && e.value === 0),
    ).toBe(true);
    // Slide 2 plays from scratch, its timeline-start trigger included.
    engine.next();
    expect(engine.getView().slideId).toBe(two.id);
    expect(engine.getVariable('Count')).toBe(5);
  });

  it('restart forgets answers and draws again, and closes a lightbox', () => {
    let quizId = '';
    let firstChoice = '';
    const { engine, one } = setup({ type: 'restartCourse' }, (project) => {
      const quiz = createQuestionSlide('trueFalse', project.stage);
      quizId = quiz.id;
      firstChoice = choiceMarks(quiz.question!)[0]!;
      const bank = createBank('Bank', project.stage);
      bank.slides.push(
        createQuestionSlide('trueFalse', project.stage),
        createQuestionSlide('trueFalse', project.stage),
      );
      project.banks.push(bank);
      const draw = createDrawSlide(bank.id);
      draw.draw!.count = 1;
      project.scenes[0]!.slides.push(quiz, draw);
    });
    engine.jumpToSlide(quizId);
    engine.pointer('click', firstChoice);
    engine.submitQuestion();
    expect(Object.keys(engine.getState().q ?? {})).toContain(quizId);
    engine.jumpToSlide(one.id);
    engine.openLightbox(quizId);
    expect(engine.getView().lightbox).toBeDefined();
    engine.restart();
    const state = engine.getState();
    expect(state.q).toBeUndefined();
    expect(engine.getView().lightbox).toBeUndefined();
    expect(engine.getView().slideId).toBe(one.id);
    // One question drawn, as the draw asks.
    expect(Object.values(state.d ?? {}).map((drawn) => drawn.length)).toEqual([1]);
  });

  it('exit, print, open file and set focus raise their events for the view', () => {
    for (const [action, expected] of [
      [{ type: 'exitCourse' }, { type: 'exitCourse' }],
      [{ type: 'printSlide' }, { type: 'print' }],
      [
        { type: 'openFile', asset: 'f'.repeat(64) },
        { type: 'openFile', asset: 'f'.repeat(64) },
      ],
    ] as [TriggerAction, EngineEvent][]) {
      const { events, press } = setup(action);
      press();
      expect(events).toContainEqual(expected);
    }
    const focus = setup({ type: 'setFocus', object: 'obj_target' });
    focus.press();
    expect(focus.events).toContainEqual({
      type: 'focus',
      slideId: focus.one.id,
      objectId: 'obj_target',
    });
  });

  it('send email opens a mailto link, its words filled in and encoded', () => {
    const { events, press } = setup({
      type: 'sendEmail',
      to: 'tutor@example.com',
      subject: 'Help from %Name% & co',
      body: 'Slide %Count%? Line two',
    });
    press();
    expect(events).toContainEqual({
      type: 'openUrl',
      url: 'mailto:tutor@example.com?subject=Help%20from%20Sam%20%26%20co&body=Slide%200%3F%20Line%20two',
    });
    // No address and no words: the bare link, for the learner to fill in.
    const bare = setup({ type: 'sendEmail', to: '', subject: '', body: '' });
    bare.press();
    expect(bare.events).toContainEqual({ type: 'openUrl', url: 'mailto:' });
  });

  it('seek timeline moves a shown layer, clamped to its length', () => {
    const { engine, at, press, one, layer } = setup(
      { type: 'seekTimeline', layer: '', time: 7 },
      (project) => {
        const slide = project.scenes[0]!.slides[0]!;
        (slide.triggers[0]!.action as { layer: string }).layer = slide.baseLayer.id;
      },
    );
    at(1);
    press();
    expect(engine.getView().layers[0]!.playhead).toBeCloseTo(7);
    void one;
    void layer;
  });

  it('seek past the end stops at the end, and a hidden layer is left alone', () => {
    const { engine, press, layer } = setup(
      { type: 'seekTimeline', layer: '', time: 60 },
      (project) => {
        const slide = project.scenes[0]!.slides[0]!;
        (slide.triggers[0]!.action as { layer: string }).layer = slide.layers[0]!.id;
      },
    );
    press();
    expect(engine.getView().layers.map((l) => l.id)).not.toContain(layer.id);
    engine.showLayer(layer.id);
    press();
    expect(engine.getView().layers.find((l) => l.id === layer.id)!.playhead).toBe(6);
  });
});

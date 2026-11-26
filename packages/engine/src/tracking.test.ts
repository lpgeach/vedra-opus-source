import {
  createButtonObject,
  createEmptyProject,
  createId,
  createScene,
  createSlide,
} from '@vedraopus/model';
import type { Project, Tracking } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { createEngine, reportStatus } from './index';
import type { EngineEvent, TrackingState } from './index';

function course(slides: number, tracking: Partial<Tracking> = {}) {
  const project: Project = createEmptyProject();
  const list = Array.from({ length: slides }, (_, i) => createSlide(`S${i + 1}`));
  project.scenes = [{ ...createScene(), slides: list }];
  Object.assign(project.tracking, tracking);
  return { project, slides: list };
}
const listen = (engine: ReturnType<typeof createEngine>) => {
  const changes: TrackingState[] = [];
  engine.on((event: EngineEvent) => {
    if (event.type === 'trackingChange') changes.push(event.tracking);
  });
  return changes;
};

describe('completion', () => {
  it('by default, once every slide has been seen', () => {
    const { project } = course(3);
    const engine = createEngine(project);
    const changes = listen(engine);
    expect(engine.getTracking()).toEqual({ complete: false, success: 'unknown', progress: 1 / 3 });
    engine.next();
    engine.previous();
    engine.next();
    expect(engine.getTracking().complete).toBe(false);
    engine.next();
    expect(engine.getTracking()).toEqual({ complete: true, success: 'unknown', progress: 1 });
    // Told once, and going back does not undo it.
    engine.previous();
    expect(changes).toHaveLength(1);
    expect(engine.getTracking().complete).toBe(true);
  });

  it('after a number of slides, counting each slide once', () => {
    const { project, slides } = course(5, { completion: { kind: 'slidesViewed', count: 3 } });
    const engine = createEngine(project);
    engine.next();
    engine.previous();
    expect(engine.getTracking().complete).toBe(false);
    engine.jumpToSlide(slides[4]!.id);
    expect(engine.getTracking().complete).toBe(true);
  });

  it('a count larger than the course means every slide', () => {
    const { project } = course(2, { completion: { kind: 'slidesViewed', count: 9 } });
    const engine = createEngine(project);
    engine.next();
    expect(engine.getTracking().complete).toBe(true);
  });

  it('a one-slide course is complete on arrival', () => {
    const { project } = course(1);
    expect(createEngine(project).getTracking().complete).toBe(true);
  });

  it('by a trigger only, or by a trigger in a slides-viewed course', () => {
    for (const completion of [
      { kind: 'trigger' as const },
      { kind: 'slidesViewed' as const, count: null },
    ]) {
      const { project, slides } = course(3, { completion });
      const button = createButtonObject('Done');
      button.timing = { start: 0, duration: 'untilEnd' };
      slides[0]!.baseLayer.objects.push(button);
      slides[0]!.triggers.push({
        id: createId('trigger'),
        owner: { kind: 'object', id: button.id },
        event: { type: 'click', object: button.id },
        action: { type: 'completeCourse' },
        conditions: null,
        otherwise: null,
        enabled: true,
      });
      const engine = createEngine(project);
      if (completion.kind === 'trigger') {
        // Seeing every slide is not enough.
        engine.next();
        engine.next();
        engine.jumpToSlide(slides[0]!.id);
        expect(engine.getTracking().complete).toBe(false);
      }
      engine.pointer('click', button.id);
      expect(engine.getTracking().complete).toBe(true);
    }
  });

  it('is kept in the saved session, so a resumed course stays complete', () => {
    const { project } = course(2);
    const engine = createEngine(project);
    engine.next();
    const state = JSON.parse(JSON.stringify(engine.getState()));
    expect(state.c).toBe(1);
    const resumed = createEngine(project, { restore: state });
    expect(resumed.getTracking().complete).toBe(true);
    expect(createEngine(project).getState().c).toBeUndefined();
  });
});

describe('what the LMS is told', () => {
  const at = (complete: boolean, success: TrackingState['success'] = 'unknown'): TrackingState => ({
    complete,
    success,
    progress: complete ? 1 : 0.5,
  });

  it('is incomplete before completion, whatever the pair', () => {
    for (const pair of [
      'completed-incomplete',
      'passed-incomplete',
      'passed-failed',
      'completed-failed',
    ] as const) {
      expect(reportStatus(pair, at(false))).toEqual({
        completion: 'incomplete',
        success: 'unknown',
        lessonStatus: 'incomplete',
      });
    }
  });

  it('once complete, the pair’s first word; without a quiz, completing is passing', () => {
    expect(reportStatus('completed-incomplete', at(true))).toEqual({
      completion: 'completed',
      success: 'unknown',
      lessonStatus: 'completed',
    });
    expect(reportStatus('completed-failed', at(true)).lessonStatus).toBe('completed');
    expect(reportStatus('passed-incomplete', at(true))).toEqual({
      completion: 'completed',
      success: 'passed',
      lessonStatus: 'passed',
    });
    expect(reportStatus('passed-failed', at(true)).lessonStatus).toBe('passed');
  });

  it('a failed result (from quizzes, later) is failed where the pair has it, else incomplete', () => {
    expect(reportStatus('passed-failed', at(true, 'failed')).lessonStatus).toBe('failed');
    expect(reportStatus('completed-failed', at(true, 'failed')).lessonStatus).toBe('failed');
    expect(reportStatus('passed-incomplete', at(true, 'failed')).lessonStatus).toBe('incomplete');
    expect(reportStatus('completed-incomplete', at(true, 'failed'))).toEqual({
      completion: 'completed',
      success: 'failed',
      lessonStatus: 'incomplete',
    });
  });
});

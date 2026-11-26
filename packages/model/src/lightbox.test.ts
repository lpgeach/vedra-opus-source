import { describe, expect, it } from 'vitest';
import {
  createBank,
  createDrawSlide,
  createEmptyProject,
  createHistory,
  createId,
  createQuestionSlide,
  createSlide,
  migrateToCurrent,
  parseProject,
  ProjectValidationError,
} from './index';
import type { Project, Trigger } from './index';

/** Lightbox slides (docs/briefs/P8.4-lightbox.md). */

const issues = (project: Project): string[] => {
  try {
    parseProject(JSON.parse(JSON.stringify(project)));
    return [];
  } catch (error) {
    if (error instanceof ProjectValidationError) return error.issues.map((issue) => issue.path);
    throw error;
  }
};

function opens(slideId: string, target: string): Trigger {
  return {
    id: createId('trigger'),
    owner: { kind: 'slide', id: slideId },
    event: { type: 'timelineEnd', layer: 'layer_x' },
    action: { type: 'openLightbox', slide: target, controls: true },
    conditions: null,
    otherwise: null,
    enabled: true,
  };
}

/** Two scene slides, a draw slide, and a bank with a question in it. */
function course() {
  const project = createEmptyProject();
  const one = project.scenes[0]!.slides[0]!;
  const two = createSlide('Two');
  const draw = createDrawSlide(null);
  const bank = createBank('Bank', project.stage);
  const banked = createQuestionSlide('trueFalse', project.stage);
  bank.slides.push(banked);
  project.banks.push(bank);
  draw.draw!.bank = bank.id;
  project.scenes[0]!.slides.push(two, draw);
  return { project, one, two, draw, banked };
}

describe('lightboxes in the model', () => {
  it('open scene slides only, never a draw slide or a bank question', () => {
    const { project, one, two, draw, banked } = course();
    const trigger = opens(one.id, two.id);
    trigger.event = { type: 'timelineEnd', layer: one.baseLayer.id };
    one.triggers.push(trigger);
    expect(issues(project)).toEqual([]);
    for (const target of [draw.id, banked.id, 'slide_gone']) {
      trigger.action = { type: 'openLightbox', slide: target, controls: false };
      expect(issues(project), target).toContain('scenes[0].slides[0].triggers[0].action.slide');
    }
    trigger.action = { type: 'closeLightbox' };
    expect(issues(project)).toEqual([]);

    project.player.tabs.custom = [
      { id: 'tab_box', label: 'Box', lightbox: { slide: draw.id, controls: false } },
    ];
    expect(issues(project)).toContain('player.tabs.custom[0].lightbox.slide');
    project.player.tabs.custom[0]!.lightbox = { slide: two.id, controls: true };
    expect(issues(project)).toEqual([]);
  });

  it('removing a slide removes the triggers that open it and frees the tab that opened it', () => {
    const { project, one, two } = course();
    const trigger = opens(one.id, two.id);
    trigger.event = { type: 'timelineEnd', layer: one.baseLayer.id };
    one.triggers.push(trigger);
    project.player.tabs.custom = [
      { id: 'tab_box', label: 'Box', lightbox: { slide: two.id, controls: false } },
    ];
    const history = createHistory(parseProject(JSON.parse(JSON.stringify(project))));
    history.execute('slide.remove', { slideId: two.id });
    expect(history.project.scenes[0]!.slides[0]!.triggers).toEqual([]);
    expect(history.project.player.tabs.custom[0]!.lightbox).toBeNull();
    expect(issues(history.project)).toEqual([]);
    history.undo();
    expect(history.project.player.tabs.custom[0]!.lightbox).toEqual({
      slide: two.id,
      controls: false,
    });
  });

  it('a slide that opens as a lightbox cannot be made a draw (found by the property test)', () => {
    const { project, two } = course();
    project.player.tabs.custom = [
      { id: 'tab_box', label: 'Box', lightbox: { slide: two.id, controls: false } },
    ];
    const history = createHistory(parseProject(JSON.parse(JSON.stringify(project))));
    const draw = { bank: null, count: 1, order: 'random' as const, locked: [] };
    expect(() => history.execute('slide.setDraw', { slideId: two.id, draw })).toThrow(
      'A slide that opens as a lightbox cannot be a draw',
    );
  });

  it('a slide moved into a question bank leaves the course: nothing in it names it (the Phase 8 review)', () => {
    const { project, one } = course();
    const quiz = createQuestionSlide('multipleChoice', project.stage);
    project.scenes[0]!.slides.push(quiz);
    const bank = project.banks[0]!;
    // Named by another slide's jump and lightbox, a branch, the menu and a tab.
    const jump = opens(one.id, quiz.id);
    jump.event = { type: 'timelineEnd', layer: one.baseLayer.id };
    const jumpTo = { ...jump, id: createId('trigger') };
    jumpTo.action = { type: 'jumpToSlide', target: { kind: 'slide', slide: quiz.id } };
    one.triggers.push(jump, jumpTo);
    const other = createQuestionSlide('trueFalse', project.stage);
    (other.question as { branch: { correct: unknown } }).branch.correct = {
      kind: 'slide',
      slide: quiz.id,
    };
    project.scenes[0]!.slides.push(other);
    project.player.menu.entries[quiz.id] = { title: 'Quiz', hidden: false };
    project.player.tabs.custom = [
      { id: 'tab_q', label: 'Quiz', lightbox: { slide: quiz.id, controls: false } },
    ];
    // Its own trigger stays with it.
    const own = {
      ...opens(quiz.id, one.id),
      event: { type: 'timelineEnd' as const, layer: quiz.baseLayer.id },
    };
    quiz.triggers.push(own);
    expect(issues(project)).toEqual([]);

    const history = createHistory(parseProject(JSON.parse(JSON.stringify(project))));
    history.execute('slide.move', { slideId: quiz.id, sceneId: bank.id, index: 0 });
    const moved = history.project;
    expect(issues(moved)).toEqual([]);
    expect(moved.scenes[0]!.slides[0]!.triggers).toEqual([]);
    expect(moved.player.menu.entries[quiz.id]).toBeUndefined();
    expect(moved.player.tabs.custom[0]!.lightbox).toBeNull();
    // A question slide has triggers of its own (Submit and the like); this one is among them.
    expect(moved.banks[0]!.slides[0]!.triggers.map((each) => each.id)).toContain(own.id);
    history.undo();
    expect(history.project.player.menu.entries[quiz.id]).toEqual({ title: 'Quiz', hidden: false });
  });

  it('migrate from format 22: existing custom tabs run triggers', () => {
    const old = JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown>;
    old['formatVersion'] = 22;
    const tabs = (old['player'] as { tabs: { custom: unknown[] } }).tabs;
    tabs.custom = [{ id: 'tab_old', label: 'Old' }];
    const project = parseProject(migrateToCurrent(old));
    expect(project.player.tabs.custom).toEqual([{ id: 'tab_old', label: 'Old', lightbox: null }]);
  });
});

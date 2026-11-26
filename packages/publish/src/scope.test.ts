import {
  createBank,
  createQuestionSlide,
  createResultSlide,
  createEmptyProject,
  parseProject,
  createId,
  createScene,
  createShapeObject,
  createSlide,
  findReferenceIssues,
} from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { scopeProject } from './index';

function course() {
  const project = createEmptyProject();
  const a = createSlide('A');
  const b = createSlide('B');
  const c = createSlide('C');
  const button = createShapeObject({ kind: 'rect' });
  a.baseLayer.objects.push(button);
  const jump = (slide: string) => ({
    id: createId('trigger'),
    owner: { kind: 'object' as const, id: button.id },
    event: { type: 'click' as const, object: button.id },
    action: { type: 'jumpToSlide' as const, target: { kind: 'slide' as const, slide } },
    conditions: null,
    otherwise: null,
    enabled: true,
  });
  a.triggers.push(jump(b.id), jump(c.id));
  project.scenes = [
    { ...createScene('One'), slides: [a, b] },
    { ...createScene('Two'), slides: [c] },
  ];
  return { project, a, b, c };
}

describe('scopeProject', () => {
  it('returns the whole project for project scope or an unknown id', () => {
    const { project } = course();
    expect(scopeProject(project, { kind: 'project' })).toBe(project);
    expect(scopeProject(project, { kind: 'slide', slideId: 'slide_nope' })).toBe(project);
  });

  it('keeps one scene and drops triggers that jump outside it', () => {
    const { project, a, b } = course();
    const scoped = scopeProject(project, { kind: 'scene', sceneId: project.scenes[0]!.id });
    expect(scoped.scenes).toHaveLength(1);
    expect(scoped.scenes[0]!.slides.map((s) => s.id)).toEqual([a.id, b.id]);
    expect(scoped.scenes[0]!.slides[0]!.triggers).toHaveLength(1);
    expect(findReferenceIssues(scoped)).toEqual([]);
  });

  it('keeps one slide, valid on its own, and leaves the original untouched', () => {
    const { project, a } = course();
    const scoped = scopeProject(project, { kind: 'slide', slideId: a.id });
    expect(scoped.scenes.flatMap((s) => s.slides).map((s) => s.id)).toEqual([a.id]);
    expect(scoped.scenes[0]!.slides[0]!.triggers).toEqual([]);
    expect(findReferenceIssues(scoped)).toEqual([]);
    expect(a.triggers).toHaveLength(2);
  });
});

describe('scopeProject and question banks (P7.6)', () => {
  it('plays a bank question on its own, as the only slide', () => {
    const project = createEmptyProject('Banked');
    const bank = createBank('Bank', project.stage);
    project.banks = [bank];
    const question = bank.slides[0]!;
    const scoped = scopeProject(project, { kind: 'slide', slideId: question.id });
    expect(scoped.banks).toEqual([]);
    expect(scoped.scenes).toHaveLength(1);
    expect(scoped.scenes[0]!.slides.map((slide) => slide.id)).toEqual([question.id]);
    expect(() => parseProject(JSON.parse(JSON.stringify(scoped)))).not.toThrow();
  });
});

describe('scopeProject keeps Phase 7 references valid (the Phase 7 review)', () => {
  it('drops tracking by a result, results’ chosen slides and branches to slides left out', () => {
    const project = createEmptyProject('Quiz');
    const question = createQuestionSlide('multipleChoice', project.stage);
    const result = createResultSlide(project.stage);
    result.result!.include = { kind: 'chosen', slides: [question.id] };
    (question.question as { branch: { correct: unknown } }).branch.correct = {
      kind: 'slide',
      slide: result.id,
    };
    project.scenes[0]!.slides.push(question, result);
    project.tracking.completion = { kind: 'result', slide: result.id };
    const bank = createBank('Bank', project.stage);
    project.banks = [bank];
    for (const slideId of [question.id, result.id, bank.slides[0]!.id]) {
      const scoped = scopeProject(project, { kind: 'slide', slideId });
      expect(() => parseProject(JSON.parse(JSON.stringify(scoped)))).not.toThrow();
    }
    const onlyQuestion = scopeProject(project, { kind: 'slide', slideId: question.id });
    expect(onlyQuestion.tracking.completion).toEqual({ kind: 'trigger' });
    const kept = onlyQuestion.scenes[0]!.slides[0]!.question as { branch: { correct: unknown } };
    expect(kept.branch.correct).toBeNull();
    const onlyResult = scopeProject(project, { kind: 'slide', slideId: result.id });
    expect(onlyResult.scenes[0]!.slides[0]!.result!.include).toEqual({
      kind: 'chosen',
      slides: [],
    });
  });
});

describe('scopeProject keeps Phase 8 references valid (the Phase 8 review)', () => {
  it('drops menu entries for slides left out, and frees a tab that opened one as a lightbox', () => {
    const { project, a, b, c } = course();
    project.player.menu.entries[b.id] = { title: 'Bee', hidden: false };
    project.player.menu.entries[a.id] = { title: 'Ay', hidden: false };
    project.player.tabs.custom = [
      { id: 'tab_box', label: 'Box', lightbox: { slide: c.id, controls: false } },
    ];
    for (const slideId of [a.id, b.id, c.id]) {
      const scoped = scopeProject(project, { kind: 'slide', slideId });
      expect(() => parseProject(JSON.parse(JSON.stringify(scoped))), slideId).not.toThrow();
    }
    const onlyA = scopeProject(project, { kind: 'slide', slideId: a.id });
    expect(Object.keys(onlyA.player.menu.entries)).toEqual([a.id]);
    expect(onlyA.player.tabs.custom[0]!.lightbox).toBeNull();
    // The whole scene that holds C keeps its lightbox tab.
    const sceneTwo = scopeProject(project, { kind: 'scene', sceneId: project.scenes[1]!.id });
    expect(sceneTwo.player.tabs.custom[0]!.lightbox).toEqual({ slide: c.id, controls: false });
    // A bank question played on its own: none of the course's slides are there.
    const bank = createBank('Bank', project.stage);
    project.banks = [bank];
    const banked = scopeProject(project, { kind: 'slide', slideId: bank.slides[0]!.id });
    expect(() => parseProject(JSON.parse(JSON.stringify(banked)))).not.toThrow();
    expect(banked.player.menu.entries).toEqual({});
    // The course itself is untouched.
    expect(Object.keys(project.player.menu.entries)).toHaveLength(2);
  });
});

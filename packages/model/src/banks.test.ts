import { describe, expect, it } from 'vitest';
import {
  CommandError,
  createBank,
  createDrawSlide,
  createEmptyProject,
  createHistory,
  createQuestionSlide,
  createSlide,
  everySlide,
  findSlide,
  migrateToCurrent,
  parseProject,
  ProjectValidationError,
} from './index';
import type { Project } from './index';

/** Question banks and draw slides (docs/briefs/P7.6-banks-and-draws.md). */

const issues = (project: Project): string[] => {
  try {
    parseProject(JSON.parse(JSON.stringify(project)));
    return [];
  } catch (error) {
    if (error instanceof ProjectValidationError) return error.issues.map((issue) => issue.message);
    throw error;
  }
};

/** A project with a bank of three questions and a draw of two from it. */
function withDraw() {
  const project = createEmptyProject('Quiz');
  const bank = createBank('Bank', project.stage);
  bank.slides.push(
    createQuestionSlide('trueFalse', project.stage),
    createQuestionSlide('fillInBlank', project.stage),
  );
  project.banks.push(bank);
  const draw = createDrawSlide(bank.id);
  draw.draw!.locked = [bank.slides[1]!.id];
  project.scenes[0]!.slides.push(draw);
  return { project, bank, draw };
}

describe('banks and draws in the saved format', () => {
  it('keeps question slides in banks, and finds them with the rest', () => {
    const { project, bank } = withDraw();
    expect(issues(project)).toEqual([]);
    expect(everySlide(project).map(({ path }) => path[0])).toEqual([
      'scenes',
      'scenes',
      'banks',
      'banks',
      'banks',
    ]);
    expect(findSlide(project, bank.slides[2]!.id)?.scene).toBe(bank);
  });

  it('refuses a slide in a bank that is not a question, and a draw slide in a bank', () => {
    const { project, bank } = withDraw();
    bank.slides.push(createSlide('Plain'));
    expect(issues(project)).toContain('a question bank holds question slides only');
    bank.slides.pop();
    const draw = createDrawSlide(bank.id);
    draw.question = createQuestionSlide('multipleChoice', project.stage).question;
    bank.slides.push(draw);
    expect(issues(project)).toContain('a draw slide belongs in a scene, not a bank');
  });

  it('checks a draw’s bank and locked questions, and keeps jumps off bank slides', () => {
    const { project, bank, draw } = withDraw();
    draw.draw!.bank = 'scene_nope';
    expect(issues(project)).toContain('no question bank with id "scene_nope"');
    draw.draw!.bank = bank.id;
    draw.draw!.locked = [project.scenes[0]!.slides[0]!.id];
    expect(issues(project)).toContain(
      `a locked question "${project.scenes[0]!.slides[0]!.id}" is not in the draw's bank`,
    );
    draw.draw!.locked = [];
    const target = bank.slides[0]!.id;
    project.scenes[0]!.slides[0]!.triggers.push({
      id: 'trigger_jump',
      owner: { kind: 'slide', id: project.scenes[0]!.slides[0]!.id },
      event: { type: 'timelineStart', layer: project.scenes[0]!.slides[0]!.baseLayer.id },
      action: { type: 'jumpToSlide', target: { kind: 'slide', slide: target } },
      conditions: null,
      otherwise: null,
      enabled: true,
    });
    expect(issues(project).join(' ')).toContain(target);
  });
});

describe('bank and draw commands', () => {
  it('adds, renames and removes a bank; its draws then draw nothing', () => {
    const { project, bank, draw } = withDraw();
    const history = createHistory(project);
    history.execute('bank.rename', { bankId: bank.id, title: 'Chapter 1' });
    expect(history.project.banks[0]!.title).toBe('Chapter 1');
    history.execute('bank.remove', { bankId: bank.id });
    expect(history.project.banks).toEqual([]);
    const now = findSlide(history.project, draw.id)!.slide;
    expect(now.draw).toEqual({ ...draw.draw, bank: null, locked: [] });
    expect(issues(history.project)).toEqual([]);
    history.undo();
    expect(findSlide(history.project, draw.id)!.slide.draw).toEqual(draw.draw);
    history.execute('bank.add', { bank: createBank('Another', project.stage) });
    expect(history.project.banks).toHaveLength(2);
  });

  it('adds question slides to a bank, and refuses others', () => {
    const { project, bank } = withDraw();
    const history = createHistory(project);
    history.execute('slide.add', {
      sceneId: bank.id,
      slide: createQuestionSlide('numeric', project.stage),
    });
    expect(history.project.banks[0]!.slides).toHaveLength(4);
    expect(() =>
      history.execute('slide.add', { sceneId: bank.id, slide: createSlide('Plain') }),
    ).toThrow(CommandError);
    expect(() =>
      history.execute('slide.setQuestion', { slideId: bank.slides[0]!.id, question: null }),
    ).toThrow(CommandError);
    expect(() =>
      history.execute('slide.move', {
        slideId: project.scenes[0]!.slides[0]!.id,
        sceneId: bank.id,
        index: 0,
      }),
    ).toThrow(CommandError);
    expect(() => history.execute('scene.remove', { sceneId: bank.id })).toThrow(CommandError);
  });

  it('takes a deleted or moved-out bank slide out of the draws that locked it', () => {
    const { project, bank, draw } = withDraw();
    const history = createHistory(project);
    history.execute('slide.remove', { slideId: bank.slides[1]!.id });
    expect(findSlide(history.project, draw.id)!.slide.draw!.locked).toEqual([]);
    expect(issues(history.project)).toEqual([]);
    history.undo();
    history.execute('slide.move', {
      slideId: bank.slides[1]!.id,
      sceneId: project.scenes[0]!.id,
      index: 0,
    });
    expect(findSlide(history.project, draw.id)!.slide.draw!.locked).toEqual([]);
    expect(issues(history.project)).toEqual([]);
  });

  it('makes and unmakes draw slides, never on a question', () => {
    const { project, bank } = withDraw();
    const history = createHistory(project);
    const plain = project.scenes[0]!.slides[0]!;
    const draw = { bank: bank.id, count: 3, order: 'inOrder' as const, locked: [] };
    history.execute('slide.setDraw', { slideId: plain.id, draw });
    expect(findSlide(history.project, plain.id)!.slide.draw).toEqual(draw);
    history.execute('slide.setDraw', { slideId: plain.id, draw: null });
    expect(findSlide(history.project, plain.id)!.slide.draw).toBeNull();
    expect(() => history.execute('slide.setDraw', { slideId: bank.slides[0]!.id, draw })).toThrow(
      CommandError,
    );
  });
});

describe('format 18', () => {
  it('gives an older project no banks and no draws', () => {
    const project = createEmptyProject('Old');
    const v17 = JSON.parse(JSON.stringify(project)) as Record<string, unknown> & {
      scenes: { slides: Record<string, unknown>[] }[];
    };
    v17['formatVersion'] = 17;
    delete v17['banks'];
    for (const slide of v17.scenes[0]!.slides) delete slide['draw'];
    const migrated = parseProject(migrateToCurrent(v17));
    expect(migrated.banks).toEqual([]);
    expect(migrated.scenes[0]!.slides.every((slide) => slide.draw === null)).toBe(true);
  });
});

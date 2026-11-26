import { describe, expect, it } from 'vitest';
import {
  createBank,
  createDrawSlide,
  createEmptyProject,
  createImageObject,
  createQuestionSlide,
  createResultSlide,
  createSlide,
  createSlideMaster,
  createTextEntryObject,
  createTextObject,
} from './factory';
import { createHistory } from './history';
import { createId } from './ids';
import { prepareSlideImport } from './import-slides';
import type { Project, Slide, Trigger, TriggerAction } from './schema';
import { parseProject } from './validate';
import { idsInProject } from './find';

/** Slides from another project (docs/briefs/P11.2-templates.md, part B). */

const HASH = 'b'.repeat(64);

const jump = (owner: string, object: string, action: TriggerAction): Trigger => ({
  id: createId('trigger'),
  owner: { kind: 'object', id: owner },
  event: { type: 'click', object },
  action,
  conditions: null,
  otherwise: null,
  enabled: true,
});

/** A source course: Intro → Middle → End, Intro with a picture and a button to Middle and to End. */
function source(): { project: Project; intro: Slide; middle: Slide; end: Slide } {
  const project = createEmptyProject('Source');
  project.assets[HASH] = {
    kind: 'image',
    fileName: 'logo.png',
    ext: 'png',
    mimeType: 'image/png',
    byteLength: 10,
  };
  const scene = project.scenes[0]!;
  const intro = scene.slides[0]!;
  intro.title = 'Intro';
  const middle = createSlide('Middle');
  const end = createSlide('End');
  scene.slides.push(middle, end);
  const picture = createImageObject(HASH, { x: 10, y: 10 }, 'Logo');
  const toMiddle = createTextObject('Next', { x: 10, y: 200 }, 'To middle');
  const toEnd = createTextObject('Skip', { x: 10, y: 300 }, 'To end');
  intro.baseLayer.objects.push(picture, toMiddle, toEnd);
  intro.triggers.push(
    jump(toMiddle.id, toMiddle.id, {
      type: 'jumpToSlide',
      target: { kind: 'slide', slide: middle.id },
    }),
    jump(toEnd.id, toEnd.id, { type: 'jumpToSlide', target: { kind: 'slide', slide: end.id } }),
  );
  return { project, intro, middle, end };
}

/** The import applied to `target` through the command, with the history. */
function apply(target: Project, from: Project, slideIds: string[]) {
  const prepared = prepareSlideImport(target, from, slideIds);
  const history = createHistory(target);
  history.execute('slides.import', {
    sceneId: target.scenes[0]!.id,
    index: target.scenes[0]!.slides.length,
    slides: prepared.slides,
    banks: prepared.banks,
    masters: prepared.masters,
    variables: prepared.variables,
    assets: prepared.assets,
  });
  return { prepared, history, project: history.project };
}

const valid = (project: Project) => parseProject(JSON.parse(JSON.stringify(project)));

describe('importing slides', () => {
  it('copies them with new ids, their media, and jumps between them pointing at the copies', () => {
    const { project: from, intro, middle } = source();
    const target = createEmptyProject('Target');
    const { prepared, project, history } = apply(target, from, [intro.id, middle.id]);

    const slides = project.scenes[0]!.slides;
    expect(slides.map((slide) => slide.title)).toEqual(['Untitled Slide', 'Intro', 'Middle']);
    const [copy, copiedMiddle] = [slides[1]!, slides[2]!];
    expect(copy.id).not.toBe(intro.id);
    expect(copy.baseLayer.objects.map((object) => object.name)).toEqual([
      'Logo',
      'To middle',
      'To end',
    ]);
    expect(copy.baseLayer.objects[0]!.id).not.toBe(intro.baseLayer.objects[0]!.id);
    expect(project.assets[HASH]).toMatchObject({ fileName: 'logo.png' });
    expect(Object.keys(prepared.assets)).toEqual([HASH]);

    // The jump to Middle came with Middle; the jump to End did not, as End did not come.
    expect(copy.triggers).toHaveLength(1);
    expect(copy.triggers[0]!.action).toEqual({
      type: 'jumpToSlide',
      target: { kind: 'slide', slide: copiedMiddle.id },
    });
    expect(prepared.dropped).toEqual([
      '“Intro”: a trigger that pointed at something that did not come',
    ]);
    expect(() => valid(project)).not.toThrow();

    // One step: Undo takes it all back.
    history.undo();
    expect(history.project.scenes[0]!.slides).toHaveLength(1);
    expect(history.project.assets).toEqual({});
  });

  it('can import the same slides twice: each import has new ids', () => {
    const { project: from, intro } = source();
    const once = apply(createEmptyProject('Target'), from, [intro.id]).project;
    const twice = apply(once, from, [intro.id]).project;
    expect(twice.scenes[0]!.slides.map((slide) => slide.title)).toEqual([
      'Untitled Slide',
      'Intro',
      'Intro',
    ]);
    expect(() => valid(twice)).not.toThrow();
  });
});

describe('masters and layouts', () => {
  it('adds the master a copy’s layout belongs to; one already here unchanged is not added again', () => {
    const { project: from, intro } = source();
    const master = createSlideMaster('Brand');
    from.masters.unshift(master);
    intro.layoutId = master.layouts[1]!.id;

    const fresh = apply(createEmptyProject('Target'), from, [intro.id]).project;
    expect(fresh.masters.map((each) => each.name)).toEqual(['Brand', 'Feedback']);
    expect(fresh.scenes[0]!.slides[1]!.layoutId).toBe(master.layouts[1]!.id);
    expect(() => valid(fresh)).not.toThrow();

    // A project made from the same template has that master already.
    const again = apply(fresh, from, [intro.id]);
    expect(again.prepared.masters).toEqual([]);
    expect(again.project.masters.filter((each) => each.name === 'Brand')).toHaveLength(1);
  });

  it('adds a master changed here as a new one, and the copy uses its layout', () => {
    const { project: from, intro } = source();
    const master = createSlideMaster('Brand');
    from.masters.unshift(master);
    intro.layoutId = master.layouts[0]!.id;
    const target = createEmptyProject('Target');
    const changed = JSON.parse(JSON.stringify(master)) as typeof master;
    changed.name = 'Brand, changed here';
    target.masters.unshift(changed);

    const { project } = apply(target, from, [intro.id]);
    // Added before the feedback master, after this project's own.
    expect(project.masters.map((each) => each.name)).toEqual([
      'Brand, changed here',
      'Brand',
      'Feedback',
    ]);
    const added = project.masters[1]!;
    expect(added.id).not.toBe(master.id);
    expect(project.scenes[0]!.slides[1]!.layoutId).toBe(added.layouts[0]!.id);
    expect(() => valid(project)).not.toThrow();
  });
});

describe('variables', () => {
  function withVariables() {
    const { project: from, intro } = source();
    from.variables.push(
      { id: createId('var'), name: 'Score', type: 'number', default: 0 },
      { id: createId('var'), name: 'Learner', type: 'text', default: '' },
      { id: createId('var'), name: 'Unused', type: 'boolean', default: false },
    );
    const [score, learner] = from.variables as [Project['variables'][0], Project['variables'][0]];
    const entry = createTextEntryObject({ x: 0, y: 400 });
    entry.props.variable = learner.id;
    intro.baseLayer.objects.push(
      entry,
      createTextObject('Well done %Learner%, you scored %Score%.'),
    );
    intro.triggers.push(
      jump(entry.id, entry.id, {
        type: 'setVariable',
        variable: score.id,
        operator: 'add',
        operand: { kind: 'literal', value: 1 },
      }),
    );
    return { from, intro, score, learner };
  }

  it('uses a variable here of the same name and type, and adds the others the copies use', () => {
    const { from, intro, score } = withVariables();
    const target = createEmptyProject('Target');
    const mine = { id: createId('var'), name: 'score', type: 'number' as const, default: 5 };
    target.variables.push(mine);

    const { project, prepared } = apply(target, from, [intro.id]);
    expect(prepared.variables.map((variable) => variable.name)).toEqual(['Learner']);
    const copy = project.scenes[0]!.slides[1]!;
    const setter = copy.triggers.find((trigger) => trigger.action.type === 'setVariable')!;
    expect(setter.action).toMatchObject({ variable: mine.id });
    expect(JSON.stringify(copy)).not.toContain(score.id);
    expect(() => valid(project)).not.toThrow();
  });

  it('renames one whose name is taken by a variable of another type, in the copies’ text too', () => {
    const { from, intro, learner } = withVariables();
    const target = createEmptyProject('Target');
    target.variables.push({ id: createId('var'), name: 'Learner', type: 'number', default: 0 });

    const { project, prepared } = apply(target, from, [intro.id]);
    expect(prepared.variables.map((variable) => variable.name).sort()).toEqual([
      'Learner2',
      'Score',
    ]);
    const copy = project.scenes[0]!.slides[1]!;
    expect(JSON.stringify(copy)).toContain('Well done %Learner2%, you scored %Score%.');
    const entry = copy.baseLayer.objects.find((object) => object.type === 'textEntry')!;
    const added = project.variables.find((variable) => variable.name === 'Learner2')!;
    expect((entry.props as { variable: string | null }).variable).toBe(added.id);
    expect(added.id).toBe(learner.id);
    expect(() => valid(project)).not.toThrow();
  });
});

describe('questions, draws and results', () => {
  it('brings a draw slide’s bank as a new bank, with its locked questions', () => {
    const from = createEmptyProject('Source');
    const bank = createBank('Fire questions', from.stage, from.masters[0]);
    from.banks.push(bank);
    const draw = createDrawSlide(bank.id);
    draw.draw!.locked = [bank.slides[0]!.id];
    from.scenes[0]!.slides.push(draw);

    const { project } = apply(createEmptyProject('Target'), from, [draw.id]);
    expect(project.banks).toHaveLength(1);
    const newBank = project.banks[0]!;
    expect(newBank.id).not.toBe(bank.id);
    expect(newBank.title).toBe('Fire questions');
    const copy = project.scenes[0]!.slides[1]!;
    expect(copy.draw).toMatchObject({ bank: newBank.id, locked: [newBank.slides[0]!.id] });
    expect(() => valid(project)).not.toThrow();
  });

  it('keeps a result slide’s included questions that came, and a branch to one that did not goes on', () => {
    const from = createEmptyProject('Source');
    const first = createQuestionSlide('multipleChoice', from.stage, 'First', from.masters[0]);
    const second = createQuestionSlide('trueFalse', from.stage, 'Second', from.masters[0]);
    const result = createResultSlide(from.stage);
    result.result!.include = { kind: 'chosen', slides: [first.id, second.id] };
    const branchKey = Object.keys(first.question!.branch)[0]!;
    (first.question!.branch as Record<string, unknown>)[branchKey] = {
      kind: 'slide',
      slide: second.id,
    };
    from.scenes[0]!.slides.push(first, second, result);

    const { project } = apply(createEmptyProject('Target'), from, [first.id, result.id]);
    const [, copiedFirst, copiedResult] = project.scenes[0]!.slides as [Slide, Slide, Slide];
    expect(copiedResult.result!.include).toEqual({ kind: 'chosen', slides: [copiedFirst.id] });
    expect((copiedFirst.question!.branch as Record<string, unknown>)[branchKey]).toBeNull();
    expect(() => valid(project)).not.toThrow();
  });

  it('leaves the target’s own ids alone', () => {
    const { project: from, intro } = source();
    const target = createEmptyProject('Target');
    const before = idsInProject(target);
    const { project } = apply(target, from, [intro.id]);
    for (const id of before) expect(idsInProject(project).has(id)).toBe(true);
  });
});

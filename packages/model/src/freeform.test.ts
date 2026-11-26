import { describe, expect, it } from 'vitest';
import {
  convertToQuestion,
  createAudioObject,
  createEmptyProject,
  createHistory,
  createQuestionSlide,
  createShapeObject,
  createSlide,
  createTextObject,
  FORMAT_VERSION,
  keyComboText,
  migrateToCurrent,
  parseProject,
  ProjectValidationError,
  withSelectedState,
} from './index';
import type { FreeformKind, Project, Question } from './index';

/** Freeform questions (docs/briefs/P7.4-freeform-questions.md). */

const issues = (project: Project): string[] => {
  try {
    parseProject(JSON.parse(JSON.stringify(project)));
    return [];
  } catch (error) {
    if (error instanceof ProjectValidationError) return error.issues.map((issue) => issue.message);
    throw error;
  }
};

/** An ordinary slide with a title, two pictures (shapes) and a sound, converted to `kind`. */
function converted(kind: FreeformKind) {
  const project = createEmptyProject('Freeform');
  const slide = createSlide('Designed');
  const title = createTextObject('Which is the cat?', {}, 'Title');
  const cat = createShapeObject({ kind: 'ellipse' }, { x: 100, y: 200 }, 'Cat');
  const dog = createShapeObject({ kind: 'rect' }, { x: 400, y: 200 }, 'Dog');
  const sound = createAudioObject('a'.repeat(64), 2, {}, 'Purr');
  project.assets['a'.repeat(64)] = {
    kind: 'audio',
    fileName: 'purr.mp3',
    ext: 'mp3',
    mimeType: 'audio/mpeg',
    byteLength: 1,
  };
  slide.baseLayer.objects.push(title, cat, dog, sound);
  project.scenes[0]!.slides = [slide];
  const { question, objects, triggers, layers } = convertToQuestion(kind, project.stage);
  slide.layers.push(...layers);
  slide.baseLayer.objects.push(...objects);
  slide.triggers.push(...triggers);
  slide.question = question;
  return { project, slide, question, title, cat, dog, sound };
}

describe('converting a slide into a freeform question', () => {
  it.each(['freePickOne', 'freePickMany', 'freeText'] as const)(
    'gives %s a Submit button with the trigger that submits, and no parts yet',
    (kind) => {
      const { project, slide, question } = converted(kind);
      expect(issues(project)).toEqual([]);
      const submit = slide.baseLayer.objects.find((object) => object.id === question.submit);
      expect(submit?.type).toBe('button');
      // Submit's trigger, then the feedback layers' buttons' (P7.5): Correct and Incorrect.
      expect(slide.triggers.map((trigger) => trigger.action.type)).toEqual([
        'submitInteraction',
        'continueQuestion',
        'continueQuestion',
      ]);
      expect(slide.triggers[0]!.event).toEqual({ type: 'click', object: submit!.id });
      expect(slide.layers.map((layer) => layer.name)).toEqual(['Correct', 'Incorrect']);
      expect(question).toMatchObject({ prompt: null, attempts: 1, scoring: { points: 10 } });
    },
  );

  it('gives a shortcut key no Submit, and no key yet', () => {
    const { project, slide, question } = converted('freeKey');
    expect(issues(project)).toEqual([]);
    expect(question.submit).toBeNull();
    // No Submit trigger: only the feedback layers' buttons continue (P7.5).
    expect(slide.triggers.map((trigger) => trigger.action.type)).toEqual([
      'continueQuestion',
      'continueQuestion',
    ]);
    expect(question.kind === 'freeKey' && keyComboText(question.key)).toBe('');
  });

  it('takes any object on the stage as a choice, but not a sound', () => {
    const { project, slide, question, title, cat, dog, sound } = converted('freePickMany');
    if (question.kind !== 'freePickMany') throw new Error('kind');
    question.prompt = title.id;
    question.choices = [
      { id: 'choice_a1', object: cat.id, correct: true },
      { id: 'choice_a2', object: dog.id, correct: false },
      { id: 'choice_a3', object: question.submit!, correct: false },
    ];
    // The Submit button is already a part: used twice.
    expect(issues(project)).toContain(`object "${question.submit}" is used twice in the question`);
    question.choices.pop();
    expect(issues(project)).toEqual([]);
    question.choices.push({ id: 'choice_a4', object: sound.id, correct: false });
    expect(issues(project)).toContain(
      'the choice must be an object the learner can see on the stage',
    );
    expect(slide.baseLayer.objects).toContain(sound);
  });

  it('lets pick one have one right answer', () => {
    const { project, question, cat, dog } = converted('freePickOne');
    if (question.kind !== 'freePickOne') throw new Error('kind');
    question.choices = [
      { id: 'choice_b1', object: cat.id, correct: true },
      { id: 'choice_b2', object: dog.id, correct: true },
    ];
    expect(issues(project)).toContain('a pick-one question has at most one correct answer');
  });

  it('takes a deleted choice out of the question, undoably', () => {
    const { project, question, cat, dog } = converted('freePickOne');
    if (question.kind !== 'freePickOne') throw new Error('kind');
    question.choices = [
      { id: 'choice_c1', object: cat.id, correct: true },
      { id: 'choice_c2', object: dog.id, correct: false },
    ];
    const history = createHistory(project);
    history.execute('object.remove', { objectIds: [cat.id] });
    const now = () => history.project.scenes[0]!.slides[0]!.question as Question;
    expect(now().kind === 'freePickOne' && now()).toMatchObject({
      choices: [{ object: dog.id }],
    });
    history.undo();
    expect(now()).toEqual(question);
  });
});

describe('freeform helpers', () => {
  it('adds a Selected state that outlines a shape, and leaves one it has', () => {
    const shape = createShapeObject({ kind: 'rect' });
    const selected = withSelectedState(shape);
    expect(selected.states.map((state) => state.id)).toEqual(['normal', 'selected']);
    expect(selected.states[1]!.overrides.appearance?.stroke).toMatchObject({ width: 4 });
    expect(withSelectedState(selected)).toBe(selected);
    expect(shape.states.map((state) => state.id)).toEqual(['normal']);
  });

  it('writes a key with its modifiers, a character in capitals, the space bar by name', () => {
    const combo = { key: 's', ctrl: true, alt: false, shift: true, meta: false };
    expect(keyComboText(combo)).toBe('Ctrl+Shift+S');
    expect(keyComboText({ ...combo, key: 'S' })).toBe('Ctrl+Shift+S');
    expect(keyComboText({ ...combo, key: ' ', ctrl: false, shift: false })).toBe('Space');
    expect(keyComboText({ ...combo, key: 'F2', alt: true, meta: true })).toBe(
      'Ctrl+Alt+Shift+Meta+F2',
    );
    expect(keyComboText({ ...combo, key: '' })).toBe('');
  });
});

describe('format 16', () => {
  it('reads a format-15 project with its slides unchanged', () => {
    const project = createEmptyProject('Old');
    // A format-15 project: no feedback master yet (format 17 adds it, P7.5).
    const v15 = {
      ...JSON.parse(JSON.stringify(project)),
      formatVersion: 15,
      masters: [],
    } as Record<string, unknown>;
    const migrated = migrateToCurrent(v15) as Record<string, unknown>;
    expect(migrated['formatVersion']).toBe(FORMAT_VERSION);
    expect(migrated['scenes']).toEqual(v15['scenes']);
    expect(() => parseProject(migrated)).not.toThrow();
  });
});

describe('freeform drag and drop (step B)', () => {
  const dragProject = () => {
    const project = createEmptyProject('Sorting');
    const slide = createQuestionSlide('freeDrag', project.stage);
    project.scenes[0]!.slides = [slide];
    const question = slide.question as Extract<Question, { kind: 'freeDrag' }>;
    return { project, slide, question };
  };

  it('makes two targets and three items, the last a decoy, snapping and returning', () => {
    const { project, question } = dragProject();
    expect(issues(project)).toEqual([]);
    expect(question.targets).toHaveLength(2);
    expect(question.items.map((item) => item.target)).toEqual([...question.targets, null]);
    expect(question).toMatchObject({ snap: true, returnToStart: true });
  });

  it('refuses an item that belongs on something that is not one of the targets', () => {
    const { project, question } = dragProject();
    question.items[2]!.target = question.items[0]!.object;
    expect(issues(project)).toContain('an item belongs on one of the question’s targets, or none');
  });

  it('makes a deleted target no item’s, and takes a deleted item out', () => {
    const { project, question } = dragProject();
    const history = createHistory(project);
    history.execute('object.remove', {
      objectIds: [question.targets[0]!, question.items[1]!.object],
    });
    const now = history.project.scenes[0]!.slides[0]!.question as typeof question;
    expect(now.targets).toEqual([question.targets[1]]);
    expect(now.items.map((item) => [item.object, item.target])).toEqual([
      [question.items[0]!.object, null],
      [question.items[2]!.object, null],
    ]);
    expect(issues(history.project)).toEqual([]);
  });
});

describe('freeform hotspot (step C)', () => {
  it('makes three regions, the first right, and takes a deleted one out', () => {
    const project = createEmptyProject('Regions');
    const slide = createQuestionSlide('freeHotspot', project.stage);
    project.scenes[0]!.slides = [slide];
    const question = slide.question as Extract<Question, { kind: 'freeHotspot' }>;
    expect(issues(project)).toEqual([]);
    expect(question.spots.map((spot) => spot.correct)).toEqual([true, false, false]);
    const history = createHistory(project);
    history.execute('object.remove', { objectIds: [question.spots[0]!.object] });
    const now = history.project.scenes[0]!.slides[0]!.question as typeof question;
    expect(now.spots.map((spot) => spot.id)).toEqual(question.spots.slice(1).map((s) => s.id));
    expect(issues(history.project)).toEqual([]);
  });
});

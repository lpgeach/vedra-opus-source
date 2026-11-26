import { describe, expect, it } from 'vitest';
import {
  choiceMarks,
  cloneSlide,
  createEmptyProject,
  createGroupObject,
  createHistory,
  createQuestionSlide,
  createTextEntryObject,
  FORMAT_VERSION,
  isChoiceQuestion,
  isSurveyQuestion,
  likertGrid,
  migrateToCurrent,
  parseProject,
  pickedFrom,
  ProjectValidationError,
  questionObjects,
} from './index';
import type { Project, Question, SurveyKind } from './index';

/** Survey question types (docs/briefs/P7.3-survey-types.md). */

const issues = (project: Project): string[] => {
  try {
    parseProject(JSON.parse(JSON.stringify(project)));
    return [];
  } catch (error) {
    if (error instanceof ProjectValidationError) return error.issues.map((issue) => issue.message);
    throw error;
  }
};

const STEP_A: SurveyKind[] = ['pickOne', 'pickMany', 'shortAnswer', 'essay', 'howMany'];
const STEP_B: SurveyKind[] = ['whichWord', 'ranking'];
const STEP_C: SurveyKind[] = ['likert'];

function surveyProject(kind: SurveyKind) {
  const project = createEmptyProject('Survey');
  const slide = createQuestionSlide(kind, project.stage);
  project.scenes[0]!.slides = [slide];
  return { project, slide, question: slide.question! };
}

describe('survey questions in the saved format', () => {
  it.each([...STEP_A, ...STEP_B, ...STEP_C])(
    'makes a valid %s slide with no score, attempts or right answer',
    (kind) => {
      const { project, slide, question } = surveyProject(kind);
      expect(issues(project)).toEqual([]);
      expect(isSurveyQuestion(question)).toBe(true);
      expect(isChoiceQuestion(question)).toBe(false);
      expect(question).not.toHaveProperty('scoring');
      expect(question).not.toHaveProperty('attempts');
      expect(question.branch).toEqual({ answered: null });
      // The thank-you is a feedback layer on the slide (P7.5), its message saying so.
      expect(question.feedback.by).toBe('question');
      if (!isSurveyQuestion(question)) throw new Error('a survey');
      const part = question.feedback.answered!;
      const layer = slide.layers.find((each) => each.id === part.layer)!;
      expect(layer.name).toBe('Thank You');
      expect(JSON.stringify(layer.objects.find((o) => o.id === part.message))).toContain(
        'Thank you.',
      );
    },
  );

  it('gives pick one its choices one button set, and pick many none', () => {
    const one = surveyProject('pickOne').slide;
    const many = surveyProject('pickMany').slide;
    const sets = (slide: typeof one) =>
      slide.baseLayer.objects.filter((o) => o.type === 'choice').map((o) => o.buttonSet);
    expect(new Set(sets(one)).size).toBe(1);
    expect(sets(one)[0]).not.toBeNull();
    expect(sets(many)).toEqual([null, null, null]);
    expect(pickedFrom(one.question!)).toHaveLength(3);
    expect(pickedFrom(surveyProject('essay').question)).toEqual([]);
  });

  it('makes an essay’s entry multiline, and the others one line (how many numeric)', () => {
    const entryOf = (kind: SurveyKind) => {
      const { slide } = surveyProject(kind);
      const entry = slide.baseLayer.objects.find((o) => o.type === 'textEntry');
      return entry?.type === 'textEntry' ? entry.props : null;
    };
    expect(entryOf('essay')).toMatchObject({ multiline: true, numeric: false });
    expect(entryOf('shortAnswer')).toMatchObject({ multiline: false, numeric: false });
    expect(entryOf('howMany')).toMatchObject({ multiline: false, numeric: true });
  });

  it('refuses graded fields on a survey question, and survey fields on a graded one', () => {
    const { project, slide } = surveyProject('pickOne');
    const graded = (slide.question as Question & Record<string, unknown>)!;
    graded['scoring'] = { by: 'question', points: 10 };
    expect(issues(project).length).toBeGreaterThan(0);
    delete graded['scoring'];
    expect(issues(project)).toEqual([]);
    (graded as Record<string, unknown>)['choices'] = [
      { id: 'c1', object: slide.baseLayer.objects[1]!.id, correct: true },
    ];
    expect(issues(project).length).toBeGreaterThan(0);

    const other = surveyProject('shortAnswer');
    (other.question as unknown as Record<string, unknown>)['branch'] = {
      correct: null,
      incorrect: null,
    };
    expect(issues(other.project).length).toBeGreaterThan(0);
  });

  it('checks the parts’ object types: a short answer’s entry must be a text entry', () => {
    const { project, slide, question } = surveyProject('shortAnswer');
    if (question.kind !== 'shortAnswer') throw new Error('kind');
    question.entry = question.prompt;
    expect(issues(project)).toContain('the text entry must be a textEntry object');
    question.entry = slide.baseLayer.objects.find((o) => o.type === 'textEntry')!.id;
    expect(issues(project)).toEqual([]);
  });

  it('takes a deleted part out of the question, and copies with new choice ids', () => {
    const { project, slide, question } = surveyProject('pickMany');
    const history = createHistory(project);
    const victim = questionObjects(question).find((part) => part.role === 'choice')!.id;
    history.execute('object.remove', { objectIds: [victim] });
    const after = history.project.scenes[0]!.slides[0]!.question!;
    expect(pickedFrom(after)).toHaveLength(2);
    history.undo();
    expect(pickedFrom(history.project.scenes[0]!.slides[0]!.question!)).toHaveLength(3);

    const copy = cloneSlide(slide);
    const ids = pickedFrom(question).map((choice) => choice.id);
    const copied = pickedFrom(copy.question!);
    expect(copied).toHaveLength(3);
    expect(copied.some((choice) => ids.includes(choice.id))).toBe(false);
    const copyObjects = new Set(copy.baseLayer.objects.map((o) => o.id));
    expect(copied.every((choice) => copyObjects.has(choice.object))).toBe(true);
  });
});

describe('which word and ranking (step B)', () => {
  it('makes which word a blank and three word tiles, and ranking three item tiles', () => {
    const word = surveyProject('whichWord');
    expect(questionObjects(word.question).map((part) => part.role)).toEqual([
      'prompt',
      'submit button',
      'blank',
      'word',
      'word',
      'word',
    ]);
    const ranking = surveyProject('ranking');
    expect(questionObjects(ranking.question).map((part) => [part.role, part.type])).toEqual([
      ['prompt', 'text'],
      ['submit button', 'button'],
      ['item', 'shape'],
      ['item', 'shape'],
      ['item', 'shape'],
    ]);
  });

  it('refuses a right answer on a which-word word, and a ranking item that is not a shape', () => {
    const { project, question } = surveyProject('whichWord');
    if (question.kind !== 'whichWord') throw new Error('kind');
    (question.words[0] as Record<string, unknown>)['correct'] = true;
    expect(issues(project).length).toBeGreaterThan(0);
    delete (question.words[0] as Record<string, unknown>)['correct'];
    expect(issues(project)).toEqual([]);

    const other = surveyProject('ranking');
    if (other.question.kind !== 'ranking') throw new Error('kind');
    other.question.items[0]!.object = other.question.prompt!;
    expect(issues(other.project)).toContain('the item must be a shape object');
  });

  it('takes a deleted tile or blank out, and copies with new ids', () => {
    const { project, slide, question } = surveyProject('whichWord');
    if (question.kind !== 'whichWord') throw new Error('kind');
    const history = createHistory(project);
    history.execute('object.remove', { objectIds: [question.blank!, question.words[1]!.object] });
    const after = history.project.scenes[0]!.slides[0]!.question!;
    expect(after).toMatchObject({ blank: null });
    expect(after.kind === 'whichWord' && after.words.length).toBe(2);
    const copy = cloneSlide(slide).question!;
    expect(copy.kind === 'whichWord' && copy.words[0]!.id).not.toBe(question.words[0]!.id);
  });
});

describe('Likert (step C)', () => {
  const likert = () => {
    const made = surveyProject('likert');
    if (made.question.kind !== 'likert') throw new Error('kind');
    return { ...made, question: made.question };
  };

  it('makes five labels and three statements, each with a point per label in its own set', () => {
    const { slide, question } = likert();
    expect(question.labels).toHaveLength(5);
    expect(question.statements).toHaveLength(3);
    const objects = new Map(slide.baseLayer.objects.map((object) => [object.id, object]));
    const sets = question.statements.map((statement) => {
      expect(statement.points).toHaveLength(5);
      const rowSets = new Set(statement.points.map((id) => objects.get(id)!.buttonSet));
      expect(rowSets.size).toBe(1);
      return [...rowSets][0];
    });
    // One set per row, so rows do not exclude each other.
    expect(new Set(sets).size).toBe(3);
    expect(sets).not.toContain(null);
    expect(choiceMarks(question)).toHaveLength(15);
    // The points have no words, and stand under their labels.
    const point = objects.get(question.statements[1]!.points[3]!)!;
    const label = objects.get(question.labels[3]!)!;
    expect(JSON.stringify(point.type === 'choice' && point.props.text)).not.toContain('"text"');
    expect(Math.abs(point.frame.x + 19 - (label.frame.x + label.frame.width / 2))).toBeLessThan(1);
  });

  it('refuses a statement with the wrong number of points', () => {
    const { project, question } = likert();
    question.statements[0]!.points.pop();
    expect(issues(project)).toContain(
      'a Likert statement has one point for each label of the scale',
    );
  });

  it('takes a deleted label’s column out, and a statement with a deleted point or text', () => {
    const { project, question } = likert();
    const history = createHistory(project);
    const now = () => history.project.scenes[0]!.slides[0]!.question as typeof question;
    history.execute('object.remove', { objectIds: [question.labels[1]!] });
    expect(now().labels).toEqual([0, 2, 3, 4].map((i) => question.labels[i]));
    expect(now().statements.map((statement) => statement.points)).toEqual(
      question.statements.map((statement) => [0, 2, 3, 4].map((i) => statement.points[i])),
    );
    expect(issues(history.project)).toEqual([]);
    history.execute('object.remove', { objectIds: [question.statements[0]!.points[4]!] });
    expect(now().statements.map((statement) => statement.id)).toEqual(
      [1, 2].map((i) => question.statements[i]!.id),
    );
    history.execute('object.remove', { objectIds: [question.statements[2]!.text] });
    expect(now().statements.map((statement) => statement.id)).toEqual([question.statements[1]!.id]);
    expect(issues(history.project)).toEqual([]);
    history.undo();
    history.undo();
    history.undo();
    expect(now()).toEqual(question);
  });

  it('lays a grid out with the statements on the left and a column per label', () => {
    // 1000 wide from x 100: the statements take 0.4 × 1000 = 400; five columns share
    // the other 600, 120 each. Column 2 starts at 100 + 400 + 2 × 120 = 740, and its
    // 38-unit point sits (120 − 38) / 2 = 41 in: x 781.
    const grid = likertGrid({ x: 100, y: 50, width: 1000 }, 5);
    expect(grid.label(2)).toEqual({ x: 740, y: 50, width: 120, height: 56 });
    // Row 0 starts under the labels: 50 + 56 + 8 = 114; the statement is 400 − 8 = 392 wide.
    expect(grid.statement(0)).toEqual({ x: 100, y: 114, width: 392, height: 44 });
    // Row 1 is 56 lower (170), and the point 3 below its row's top: 173.
    expect(grid.point(1, 2)).toEqual({ x: 781, y: 173, width: 38, height: 38 });
  });
});

describe('format 15: text entries may be multiline', () => {
  it('gives every text entry of a format-14 project `multiline: false`, inside groups too', () => {
    const project = createEmptyProject('Old');
    const slide = createQuestionSlide('fillInBlank', project.stage);
    const loose = createTextEntryObject({}, true);
    project.scenes[0]!.slides = [slide];
    // As format 14 had it: no feedback master or feedback layers, and words on the question (P7.5).
    project.masters = [];
    slide.layers = [];
    slide.triggers = slide.triggers.filter((t) => t.action.type !== 'continueQuestion');
    (slide.question as unknown as Record<string, unknown>)['feedback'] = {
      by: 'question',
      correct: 'Right',
      incorrect: 'Wrong',
      tryAgain: 'Again',
    };
    slide.layers.push({
      ...slide.baseLayer,
      id: 'layer-x',
      name: 'Layer',
      objects: [createGroupObject([loose])],
    });
    const v14 = JSON.parse(JSON.stringify(project)) as Record<string, unknown>;
    v14['formatVersion'] = 14;
    const strip = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(strip);
      else if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        if (record['type'] === 'textEntry') {
          delete (record['props'] as Record<string, unknown>)['multiline'];
        }
        Object.values(record).forEach(strip);
      }
    };
    strip(v14);
    expect(JSON.stringify(v14)).not.toContain('multiline');

    const migrated = migrateToCurrent(v14) as Record<string, unknown>;
    expect(migrated['formatVersion']).toBe(FORMAT_VERSION);
    const loaded = parseProject(migrated);
    const entries: unknown[] = [];
    const collect = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        if (record['type'] === 'textEntry') entries.push(record['props']);
        Object.values(record).forEach(collect);
      }
    };
    collect(loaded);
    expect(entries).toHaveLength(2);
    expect(entries).toEqual([
      expect.objectContaining({ multiline: false }),
      expect.objectContaining({ multiline: false, numeric: true }),
    ]);
  });
});

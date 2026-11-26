import { describe, expect, it } from 'vitest';
import {
  CommandError,
  createEmptyProject,
  createFeedbackLayer,
  createFeedbackMaster,
  createHistory,
  createQuestionSlide,
  createSlideLayout,
  createSlideMaster,
  feedbackMasterOf,
  feedbackParts,
  feedbackRolesFor,
  migrateToCurrent,
  parseProject,
  ProjectValidationError,
} from './index';
import type { ChoiceQuestion, Project, Question, Slide, SlideLayout, SlideMaster } from './index';

/** Feedback masters and feedback layers (docs/briefs/P7.5-feedback.md). */

const issues = (project: Project): string[] => {
  try {
    parseProject(JSON.parse(JSON.stringify(project)));
    return [];
  } catch (error) {
    if (error instanceof ProjectValidationError) return error.issues.map((issue) => issue.message);
    throw error;
  }
};

function quiz(attempts: number | null = 1) {
  const project = createEmptyProject('Quiz');
  const slide = createQuestionSlide('multipleChoice', project.stage);
  // Made again with the attempts set, as Form View would before making the layers.
  project.scenes[0]!.slides = [slide];
  const question = slide.question as ChoiceQuestion;
  question.attempts = attempts;
  return { project, slide, question };
}

describe('the feedback master', () => {
  it('comes with every new project: one, with a layout for each result', () => {
    const project = createEmptyProject();
    const master = feedbackMasterOf(project)!;
    expect(project.masters.filter((m) => m.kind === 'feedback')).toHaveLength(1);
    expect(master.layouts.map((layout) => [layout.name, layout.role])).toEqual([
      ['Correct', 'correct'],
      ['Incorrect', 'incorrect'],
      ['Try Again', 'tryAgain'],
      ['Thank You', 'answered'],
    ]);
    // Each layout: a panel, a heading, the message (the content placeholder) and a button.
    for (const layout of master.layouts) {
      expect(layout.layer.objects.map((o) => o.type)).toEqual(['shape', 'text', 'text', 'button']);
      const message = layout.layer.objects[2]!;
      expect(message.type === 'text' && message.props.placeholder).toBe('content');
    }
    expect(issues(project)).toEqual([]);
  });

  it('is the only one, with all four results, and slides cannot be laid out on it', () => {
    const project = createEmptyProject();
    project.masters.push(createFeedbackMaster(project.stage));
    expect(issues(project)).toContain('a project has exactly one feedback master');
    project.masters.pop();
    feedbackMasterOf(project)!.layouts.pop();
    expect(issues(project)).toContain('the feedback master has one layout for each result');
    const fresh = createEmptyProject();
    fresh.scenes[0]!.slides[0]!.layoutId = feedbackMasterOf(fresh)!.layouts[0]!.id;
    expect(issues(fresh)).toContain(`no layout with id "${fresh.scenes[0]!.slides[0]!.layoutId}"`);
    const slideMaster = createSlideMaster();
    slideMaster.layouts[0]!.role = 'correct';
    const third = createEmptyProject();
    third.masters.push(slideMaster);
    expect(issues(third)).toContain('only the feedback master’s layouts have results');
  });

  it('cannot be deleted, added to, or used by a slide, through commands', () => {
    const project = createEmptyProject();
    const history = createHistory(project);
    const master = feedbackMasterOf(project)!;
    const slideId = project.scenes[0]!.slides[0]!.id;
    expect(() => history.execute('master.remove', { masterId: master.id })).toThrow(CommandError);
    expect(() =>
      history.execute('layout.add', { masterId: master.id, layout: createSlideLayout('More') }),
    ).toThrow(CommandError);
    expect(() => history.execute('layout.remove', { layoutId: master.layouts[0]!.id })).toThrow(
      CommandError,
    );
    expect(() =>
      history.execute('slide.setLayout', { slideId, layoutId: master.layouts[0]!.id }),
    ).toThrow(CommandError);
    expect(() =>
      history.execute('master.add', { master: createFeedbackMaster(project.stage) }),
    ).toThrow(CommandError);
  });
});

describe('feedback layers', () => {
  it('copies the master’s and the layout’s objects, with new ids, the words and a button that continues', () => {
    const master: SlideMaster = createFeedbackMaster({ width: 1280, height: 720 });
    master.layer.objects.push({
      ...master.layouts[0]!.layer.objects[0]!,
      id: 'obj_backdrop',
      name: 'Backdrop',
    });
    const { layer, part, triggers } = createFeedbackLayer(
      master,
      'incorrect',
      'No.\nTry the other one.',
    );
    expect(layer.name).toBe('Incorrect');
    expect(layer.properties).toMatchObject({
      hideOtherLayers: true,
      pauseBaseTimeline: true,
      blockBaseClicks: true,
    });
    expect(layer.objects.map((o) => o.name)).toEqual([
      'Backdrop',
      'Panel',
      'Heading',
      'Message',
      'Continue',
    ]);
    const source = new Set(
      [...master.layer.objects, ...master.layouts[1]!.layer.objects].map((o) => o.id),
    );
    expect(layer.objects.some((o) => source.has(o.id))).toBe(false);
    const message = layer.objects.find((o) => o.id === part.message)!;
    expect(message.type === 'text' && message.props.placeholder).toBeNull();
    expect(JSON.stringify(message)).toContain('"text":"Try the other one."');
    expect(part.button).toBe(layer.objects[4]!.id);
    expect(triggers).toEqual([
      expect.objectContaining({
        event: { type: 'click', object: part.button },
        action: { type: 'continueQuestion' },
      }),
    ]);
  });

  it('gives a question the layers it needs: try again only with a try to spare', () => {
    expect(feedbackRolesFor(quiz(1).question)).toEqual(['correct', 'incorrect']);
    expect(feedbackRolesFor(quiz(3).question)).toEqual(['correct', 'incorrect', 'tryAgain']);
    expect(feedbackRolesFor(quiz(null).question)).toEqual(['correct', 'incorrect', 'tryAgain']);
    const survey = createQuestionSlide('essay', { width: 1280, height: 720 }).question!;
    expect(feedbackRolesFor(survey)).toEqual(['answered']);
  });

  it('makes them for a new question slide, which validates', () => {
    const { project, slide, question } = quiz();
    expect(slide.layers.map((layer) => layer.name)).toEqual(['Correct', 'Incorrect']);
    expect(feedbackParts(question).map((each) => each.role)).toEqual(['correct', 'incorrect']);
    expect(question.feedback.tryAgain).toBeNull();
    expect(issues(project)).toEqual([]);
  });

  it('checks the references: a layer of the slide, a text message and a button on it', () => {
    const { project, slide, question } = quiz();
    const correct = question.feedback.correct!;
    question.feedback.correct = { ...correct, message: correct.button };
    expect(issues(project)).toContain('the message must be a text object');
    question.feedback.correct = { ...correct, button: question.prompt };
    expect(issues(project)).toContain('the button is not on the correct feedback layer');
    question.feedback.correct = { ...correct, layer: slide.baseLayer.id };
    expect(issues(project)).toContain(
      `no overlay layer with id "${slide.baseLayer.id}" on the slide`,
    );
  });

  it('loses a deleted layer, message or button, and gets them back on undo', () => {
    const { project, question } = quiz();
    const history = createHistory(project);
    const now = () => history.project.scenes[0]!.slides[0]!.question as Question & ChoiceQuestion;
    history.execute('object.remove', { objectIds: [question.feedback.correct!.message!] });
    expect(now().feedback.correct).toMatchObject({ message: null });
    history.execute('layer.remove', { layerId: question.feedback.incorrect!.layer });
    expect(now().feedback.incorrect).toBeNull();
    // The removed layer's button trigger went with it.
    expect(
      history.project.scenes[0]!.slides[0]!.triggers.filter(
        (trigger) => trigger.action.type === 'continueQuestion',
      ),
    ).toHaveLength(1);
    expect(issues(history.project)).toEqual([]);
    history.undo();
    history.undo();
    expect(now()).toEqual(question);
  });
});

/**
 * A question slide as format 16 saved it: feedback words on the question, no
 * feedback layers, and no feedback master (masters had no kind, layouts no role).
 */
function v16Quiz(): Record<string, unknown> {
  const project = createEmptyProject('Old quiz');
  const graded = createQuestionSlide('multipleChoice', project.stage);
  const survey = createQuestionSlide('pickOne', project.stage);
  const silent = createQuestionSlide('trueFalse', project.stage);
  project.masters = [createSlideMaster('Brand')];
  project.scenes[0]!.slides = [graded, survey, silent];
  for (const master of project.masters) {
    delete (master as Partial<SlideMaster>).kind;
    for (const layout of master.layouts) delete (layout as Partial<SlideLayout>).role;
  }
  for (const slide of [graded, survey, silent]) {
    slide.layers = [];
    slide.triggers = slide.triggers.filter((t) => t.action.type !== 'continueQuestion');
  }
  (graded.question as ChoiceQuestion).attempts = 2;
  const words = (slide: Slide, feedback: Record<string, string>) => {
    (slide.question as unknown as Record<string, unknown>)['feedback'] = feedback;
  };
  words(graded, { by: 'question', correct: 'Yes!', incorrect: 'No.', tryAgain: 'Again?' });
  words(survey, { by: 'question', answered: 'Thanks for that.' });
  words(silent, { by: 'none', correct: 'a', incorrect: 'b', tryAgain: 'c' });
  return { ...(JSON.parse(JSON.stringify(project)) as Record<string, unknown>), formatVersion: 16 };
}

describe('format 17', () => {
  it('moves a question’s feedback words onto layers made from the default feedback master', () => {
    const old = v16Quiz();
    const migrated = migrateToCurrent(old);
    const project = parseProject(migrated);
    expect(project.masters.map((m) => [m.name, m.kind])).toEqual([
      ['Brand', 'slide'],
      ['Feedback', 'feedback'],
    ]);
    expect(project.masters[0]!.layouts.every((layout) => layout.role === null)).toBe(true);
    const [graded, survey, silent] = project.scenes[0]!.slides;
    // Two tries: correct, incorrect and try again, each saying the old words.
    expect(graded!.layers.map((layer) => layer.name)).toEqual([
      'Correct',
      'Incorrect',
      'Try Again',
    ]);
    for (const [role, words] of [
      ['correct', 'Yes!'],
      ['incorrect', 'No.'],
      ['tryAgain', 'Again?'],
    ] as const) {
      const part = (graded!.question as ChoiceQuestion).feedback[role]!;
      const layer = graded!.layers.find((each) => each.id === part.layer)!;
      expect(JSON.stringify(layer.objects.find((o) => o.id === part.message))).toContain(words);
    }
    expect(
      graded!.triggers.filter((trigger) => trigger.action.type === 'continueQuestion'),
    ).toHaveLength(3);
    expect(survey!.layers.map((layer) => layer.name)).toEqual(['Thank You']);
    expect(JSON.stringify(survey!.layers[0])).toContain('Thanks for that.');
    // Feedback none: no layers.
    expect(silent!.layers).toEqual([]);
    expect(silent!.question!.feedback).toEqual({
      by: 'none',
      correct: null,
      incorrect: null,
      tryAgain: null,
    });
  });

  it('lays the feedback master out for the project’s stage', () => {
    const old = v16Quiz();
    old['stage'] = { width: 640, height: 360 };
    const project = parseProject(migrateToCurrent(old));
    const panel = feedbackMasterOf(project)!.layouts[0]!.layer.objects[0]!;
    // Half of 1280 × 720: the panel at (64, 446), 1152 × 210, becomes (32, 223), 576 × 105.
    expect(panel.frame).toMatchObject({ x: 32, y: 223, width: 576, height: 105 });
  });
});

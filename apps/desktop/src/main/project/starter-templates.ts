/**
 * The built-in starter templates (docs/briefs/P11.2-templates.md, part C), of
 * our own design: our layouts, colours and words. They are made by code from
 * the model's factories when asked for, so they always match the current
 * format, and nothing needs shipping beside the app.
 */
import {
  createBank,
  createButtonObject,
  createDrawSlide,
  createEmptyProject,
  createId,
  createQuestionSlide,
  createResultSlide,
  createShapeObject,
  createSlide,
  createSlideMaster,
  createTextObject,
} from '@vedraopus/model';
import type {
  Project,
  RichText,
  RichTextNode,
  Slide,
  SlideMaster,
  Theme,
  Trigger,
} from '@vedraopus/model';

export interface StarterTemplate {
  key: string;
  name: string;
  make(): Project;
}

/** A path for a built-in template, as the chooser passes it back. */
export const STARTER_PREFIX = 'builtin:';

const STAGE = { width: 1280, height: 720 };

/**
 * Our palettes: calm blues and greens, a warm accent, all with dark text on light.
 * The first accent fills buttons, whose words are the dark text, so it is light enough
 * for 4.5 : 1 (WCAG 1.4.3); the accessibility checker test holds them to it.
 */
const THEMES: Record<string, Theme['colors']> = {
  harbour: {
    background: '#f7f9fb',
    text: '#17212b',
    accent1: '#5b9bd5',
    accent2: '#2a8c7a',
    accent3: '#e0a43a',
    accent4: '#c2453d',
    accent5: '#6a4fa3',
    accent6: '#5d6873',
  },
  meadow: {
    background: '#fbfaf5',
    text: '#1f2a1e',
    accent1: '#6aaa64',
    accent2: '#1f6f8b',
    accent3: '#d98e2b',
    accent4: '#b8463f',
    accent5: '#7a5aa6',
    accent6: '#646b5d',
  },
};

const words = (text: string, size: number, bold = false): RichTextNode => ({
  type: 'text',
  text,
  marks: [...(bold ? [{ type: 'bold' }] : []), { type: 'textStyle', attrs: { fontSize: size } }],
});
const paragraph = (text: string, size: number, bold = false): RichTextNode => ({
  type: 'paragraph',
  content: [words(text, size, bold)],
});
const heading = (text: string, size = 40): RichText => ({
  type: 'doc',
  content: [paragraph(text, size, true)],
});
const body = (...lines: string[]): RichText => ({
  type: 'doc',
  content: lines.map((line) => paragraph(line, 22)),
});
const bullets = (...items: string[]): RichText => ({
  type: 'doc',
  content: [
    {
      type: 'bulletList',
      content: items.map((item) => ({ type: 'listItem', content: [paragraph(item, 22)] })),
    },
  ],
});

/** A project with our theme, a master of our own, and no slides yet. */
function base(title: string, palette: Theme['colors']): { project: Project; master: SlideMaster } {
  const project = createEmptyProject(title);
  project.stage = { ...STAGE };
  project.theme = { colors: { ...palette }, fonts: { heading: 'Inter', body: 'Inter' } };
  const master = createSlideMaster('Starter');
  // A band across the top of every slide, in the first accent.
  master.layer.objects.push(
    Object.assign(
      createShapeObject({ kind: 'rect' }, { x: 0, y: 0, width: STAGE.width, height: 12 }, 'Band'),
      {
        locked: true,
      },
    ),
  );
  project.masters.unshift(master);
  project.scenes[0]!.slides = [];
  return { project, master };
}

/** A slide on the master's Blank layout with a title and, if given, text below it. */
function contentSlide(
  master: SlideMaster,
  title: string,
  text: RichText | null,
  slideTitle = title,
): Slide {
  const slide = createSlide(slideTitle);
  slide.layoutId = master.layouts.find((layout) => layout.name === 'Blank')!.id;
  const titleBox = createTextObject('', { x: 80, y: 56, width: 1120, height: 80 }, 'Title');
  titleBox.props.text = heading(title);
  slide.baseLayer.objects.push(titleBox);
  if (text) {
    const box = createTextObject('', { x: 80, y: 168, width: 1120, height: 440 }, 'Body');
    box.props.text = text;
    slide.baseLayer.objects.push(box);
  }
  return slide;
}

/** A trigger: clicking `button` goes to `slideId`. */
function jumpOnClick(buttonId: string, slideId: string): Trigger {
  return {
    id: createId('trigger'),
    owner: { kind: 'object', id: buttonId },
    event: { type: 'click', object: buttonId },
    action: { type: 'jumpToSlide', target: { kind: 'slide', slide: slideId } },
    conditions: null,
    otherwise: null,
    enabled: true,
  };
}

function blank(): Project {
  const { project, master } = base('Blank course', THEMES['harbour']!);
  const title = contentSlide(
    master,
    'Course title',
    body('A line about what learners will do.'),
    'Title',
  );
  project.scenes[0]!.title = 'Course';
  project.scenes[0]!.slides = [title];
  return project;
}

function shortCourse(): Project {
  const { project, master } = base('Short course', THEMES['harbour']!);
  const feedback = project.masters.find((each) => each.kind === 'feedback')!;
  const slides = [
    contentSlide(master, 'Course title', body('Who this is for, and how long it takes.'), 'Title'),
    contentSlide(
      master,
      'What you will learn',
      bullets('The first idea', 'The second idea', 'How to use them at work'),
    ),
    contentSlide(
      master,
      'The first idea',
      body('Explain it in a few short sentences.', 'Then give an example.'),
    ),
    contentSlide(master, 'The second idea', body('Explain it, and show where it fits.')),
  ];
  const first = createQuestionSlide(
    'multipleChoice',
    project.stage,
    'Check: the first idea',
    feedback,
  );
  const second = createQuestionSlide(
    'trueFalse',
    project.stage,
    'Check: the second idea',
    feedback,
  );
  const results = createResultSlide(project.stage, 'Your results');
  slides.push(first, second, results);
  project.scenes[0]!.title = 'Course';
  project.scenes[0]!.slides = slides;
  project.tracking.completion = { kind: 'result', slide: results.id };
  return project;
}

function branching(): Project {
  const { project, master } = base('Branching scenario', THEMES['meadow']!);
  const situation = contentSlide(
    master,
    'The situation',
    body('Describe what is happening, and the choice the learner has to make.'),
  );
  const summary = contentSlide(
    master,
    'What we learned',
    bullets('What the best choice was, and why', 'What the other choices led to'),
  );
  const choices = ['First choice', 'Second choice', 'Third choice'];
  const consequences = choices.map((_, index) => {
    const slide = contentSlide(
      master,
      `What happened after the ${['first', 'second', 'third'][index]} choice`,
      body('Show the result of this choice, and what the learner could notice.'),
      `Consequence ${index + 1}`,
    );
    const next = createButtonObject('Continue', { x: 1040, y: 616 }, 'Continue');
    slide.baseLayer.objects.push(next);
    slide.triggers.push(jumpOnClick(next.id, summary.id));
    return slide;
  });
  choices.forEach((choice, index) => {
    const button = createButtonObject(
      choice,
      { x: 80 + index * 400, y: 520, width: 320, height: 56 },
      choice,
    );
    situation.baseLayer.objects.push(button);
    situation.triggers.push(jumpOnClick(button.id, consequences[index]!.id));
  });
  project.scenes[0]!.title = 'Scenario';
  project.scenes[0]!.slides = [situation, ...consequences, summary];
  return project;
}

function quiz(): Project {
  const { project, master } = base('Quiz', THEMES['meadow']!);
  const feedback = project.masters.find((each) => each.kind === 'feedback')!;
  const bank = createBank('Quiz questions', project.stage, feedback);
  bank.slides = (
    [
      'multipleChoice',
      'multipleResponse',
      'trueFalse',
      'fillInBlank',
      'matchingDropdown',
      'sequenceDropdown',
    ] as const
  ).map((kind, index) =>
    createQuestionSlide(kind, project.stage, `Question ${index + 1}`, feedback),
  );
  project.banks = [bank];
  const intro = contentSlide(
    master,
    'Quiz',
    body('Six questions, in a different order each time. You need 80% to pass.'),
  );
  const draw = createDrawSlide(bank.id, 'Questions');
  draw.draw = { bank: bank.id, count: 6, order: 'random', locked: [] };
  const results = createResultSlide(project.stage, 'Your results');
  project.scenes[0]!.title = 'Quiz';
  project.scenes[0]!.slides = [intro, draw, results];
  project.tracking.completion = { kind: 'result', slide: results.id };
  return project;
}

/** The built-in templates, in the chooser's order. */
export const STARTER_TEMPLATES: readonly StarterTemplate[] = [
  { key: 'blank', name: 'Blank course', make: blank },
  { key: 'short-course', name: 'Short course', make: shortCourse },
  { key: 'branching', name: 'Branching scenario', make: branching },
  { key: 'quiz', name: 'Quiz', make: quiz },
];

/** The template a chooser path names, or undefined. */
export function starterTemplate(path: string): StarterTemplate | undefined {
  if (!path.startsWith(STARTER_PREFIX)) return undefined;
  const key = path.slice(STARTER_PREFIX.length);
  return STARTER_TEMPLATES.find((each) => each.key === key);
}

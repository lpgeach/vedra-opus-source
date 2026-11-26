import { describe, expect, it } from 'vitest';
import {
  accessibilityIssues,
  createAudioObject,
  createButtonObject,
  createEmptyProject,
  createId,
  createImageObject,
  createQuestionSlide,
  createScene,
  createShapeObject,
  createTableObject,
  createTextObject,
  createVideoObject,
} from './index';
import type { A11yIssueKind, Project, RichText, SceneObject, Slide } from './index';

/** The authoring-side accessibility checker (docs/briefs/P10.2-accessibility-checker.md). */

const HASH = 'a'.repeat(64);

function course(fill: (slide: Slide, project: Project) => void): Project {
  const project = createEmptyProject('Check');
  fill(project.scenes[0]!.slides[0]!, project);
  return project;
}

const found = (project: Project, kind?: A11yIssueKind) =>
  accessibilityIssues(project)
    .filter((issue) => !kind || issue.kind === kind)
    .map((issue) => [issue.kind, issue.objectId]);

const described = <T extends SceneObject>(object: T, altText: string, read = true): T => ({
  ...object,
  a11y: { altText, visibleToAssistiveTech: read },
});

/** Words in a colour, at a size, bold or not. */
function styled(text: string, color: string, size = 18, bold = false): RichText {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text,
            marks: [
              ...(bold ? [{ type: 'bold' }] : []),
              { type: 'textStyle', attrs: { color, fontSize: size } },
            ],
          },
        ],
      },
    ],
  };
}

/** A button whose fill and words pass, so only what a test sets is found. */
const plainButton = (label: string, frame = {}) => {
  const button = createButtonObject(label, frame);
  button.props.appearance.fill = { kind: 'solid', color: '#ffffff' };
  return button;
};

describe('missing alt text', () => {
  it('finds pictures and wordless buttons, but not decoration, described ones or plain shapes', () => {
    const picture = createImageObject(HASH, { x: 0, y: 0 });
    // A wordless shape reads as nothing, like decoration: not listed.
    const shape = createShapeObject({ kind: 'rect' }, { x: 0, y: 100 });
    const button = plainButton('', { x: 0, y: 200 });
    const project = course((slide) => {
      slide.baseLayer.objects.push(
        picture,
        shape,
        button,
        described(createImageObject(HASH, { x: 300, y: 0 }), 'A map'),
        described(createImageObject(HASH, { x: 300, y: 100 }), '', false),
        described(createShapeObject({ kind: 'rect' }, { x: 300, y: 200 }), 'A circle'),
        // A shape with words is read by its words.
        {
          ...createShapeObject({ kind: 'rect' }, { x: 300, y: 300 }),
          props: {
            ...createShapeObject({ kind: 'rect' }).props,
            text: styled('Words', '#000000'),
            appearance: {
              ...createShapeObject({ kind: 'rect' }).props.appearance,
              fill: { kind: 'none' },
            },
          },
        },
      );
    });
    expect(found(project, 'altText')).toEqual([
      ['altText', picture.id],
      ['altText', button.id],
    ]);
  });

  it('leaves a question’s answers to the question', () => {
    const project = createEmptyProject('Quiz');
    const question = createQuestionSlide('freeDrag', project.stage);
    project.scenes = [{ ...createScene(), slides: [question] }];
    expect(found(project, 'altText')).toEqual([]);
    // Each feedback layer has a Continue button; the two never show together.
    expect(found(project, 'focusOrder')).toEqual([]);
  });
});

describe('focus-order problems', () => {
  it('finds objects Tab reaches with the same name, or outside the slide', () => {
    const a = plainButton('Next', { x: 0, y: 0 });
    const b = plainButton('next', { x: 300, y: 0 });
    const away = plainButton('Hidden away', { x: 2000, y: 0 });
    const project = course((slide) =>
      slide.baseLayer.objects.push(a, b, away, plainButton('Back')),
    );
    expect(found(project, 'focusOrder')).toEqual([
      ['focusOrder', a.id],
      ['focusOrder', away.id],
    ]);
    expect(accessibilityIssues(project)[0]!.message).toContain('2 objects');
  });

  it('says once when the author’s own order leaves objects out', () => {
    const a = plainButton('One', { x: 0, y: 0 });
    const b = plainButton('Two', { x: 300, y: 0 });
    const c = plainButton('Three', { x: 600, y: 0 });
    const project = course((slide) => {
      slide.baseLayer.objects.push(a, b, c);
      slide.properties.focusOrder = [c.id];
    });
    const issues = accessibilityIssues(project).filter((issue) => issue.kind === 'focusOrder');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.objectId).toBeNull();
    expect(issues[0]!.message).toContain('“Button”, “Button”');
    project.scenes[0]!.slides[0]!.properties.focusOrder = [c.id, a.id, b.id];
    expect(found(project, 'focusOrder')).toEqual([]);
  });
});

describe('low contrast', () => {
  it('measures text against the slide, its own fill, or a shape beneath it, at 4.5 : 1 or 3 : 1 when large', () => {
    const grey = createTextObject('', { x: 0, y: 0 });
    grey.props.text = styled('Pale', '#aaaaaa');
    const large = createTextObject('', { x: 0, y: 100 });
    large.props.text = styled('Big', '#888888', 24);
    const boldish = createTextObject('', { x: 0, y: 200 });
    boldish.props.text = styled('Bold', '#888888', 19, true);
    const dark = createTextObject('', { x: 0, y: 300 });
    dark.props.text = styled('Fine', '#333333');
    // White words on a dark panel beneath them pass; the same on the slide would not.
    const panel = createShapeObject({ kind: 'rect' }, { x: 400, y: 0, width: 400, height: 400 });
    panel.props.appearance.fill = { kind: 'solid', color: '#202020' };
    const onPanel = createTextObject('', { x: 450, y: 50, width: 100, height: 50 });
    onPanel.props.text = styled('Light', '#ffffff');
    // A gradient cannot be judged.
    const fade = createShapeObject({ kind: 'rect' }, { x: 0, y: 500 });
    fade.props.appearance.fill = {
      kind: 'gradient',
      angle: 0,
      stops: [
        { offset: 0, color: '#ffffff' },
        { offset: 1, color: '#000000' },
      ],
    };
    fade.props.text = styled('Fade', '#777777');
    const project = course((slide) =>
      slide.baseLayer.objects.push(grey, large, boldish, dark, panel, onPanel, fade),
    );
    expect(found(project, 'contrast')).toEqual([['contrast', grey.id]]);
    expect(
      accessibilityIssues(project).find((issue) => issue.objectId === grey.id)!.message,
    ).toMatch(/2\.3 : 1; it needs 4\.5 : 1/);
    // #888 on white is 3.54: enough for large text, too little for 18 px.
    large.props.text = styled('Big', '#888888', 18);
    expect(found(project, 'contrast')).toEqual([
      ['contrast', grey.id],
      ['contrast', large.id],
    ]);
  });

  it('finds a default button’s words on the default accent, and uses theme colours and table headers', () => {
    const button = createButtonObject('Go', { x: 0, y: 0 });
    const table = createTableObject(2, 2, { x: 0, y: 200 });
    table.props.headerRow = true;
    table.props.headerFill = '#ffff00';
    table.props.headerText = '#ffffff';
    table.props.rows[0]!.cells[0]!.text = styled('Head', '#ffffff');
    const project = course((slide) => slide.baseLayer.objects.push(button, table));
    // Theme text #1c2024 on accent 1 #2f6fed is 3.6 : 1.
    expect(found(project, 'contrast')).toEqual([
      ['contrast', button.id],
      ['contrast', table.id],
    ]);
    project.theme.colors.accent1 = '#ffffff';
    expect(found(project, 'contrast')).toEqual([['contrast', table.id]]);
  });
});

describe('missing captions', () => {
  it('finds videos and sounds without captions, made from text or not', () => {
    const video = createVideoObject(HASH, 10, { x: 0, y: 0 });
    const sound = createAudioObject(HASH, 5, { x: 0, y: 100 });
    const spoken = createAudioObject(HASH, 5, { x: 0, y: 200 });
    spoken.props.speech = { text: 'Hello there', voice: 'espeak:en', rate: 1 };
    const captioned = createAudioObject(HASH, 5, { x: 0, y: 300 });
    captioned.props.captions = [{ id: createId('cue'), start: 0, end: 1, text: 'Hi' }];
    const project = course((slide) =>
      slide.baseLayer.objects.push(video, sound, spoken, captioned),
    );
    expect(found(project, 'captions')).toEqual([
      ['captions', video.id],
      ['captions', sound.id],
      ['captions', spoken.id],
    ]);
    expect(
      accessibilityIssues(project).find((issue) => issue.objectId === spoken.id)!.message,
    ).toContain('made from text');
  });

  it('finds nothing in a new project, and checks question bank slides too', () => {
    const project = createEmptyProject('Empty');
    expect(accessibilityIssues(project)).toEqual([]);
    const bankSlide = createQuestionSlide('multipleChoice', project.stage);
    const picture = createImageObject(HASH, { x: 0, y: 600 });
    bankSlide.baseLayer.objects.push(picture);
    project.banks = [{ ...createScene(), slides: [bankSlide] }];
    expect(found(project, 'altText')).toEqual([['altText', picture.id]]);
  });
});

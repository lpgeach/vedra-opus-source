// @vitest-environment happy-dom
import { createEngine } from '@vedraopus/engine';
import {
  createEmptyProject,
  createGroupObject,
  createId,
  createImageObject,
  createLayer,
  createQuestionSlide,
  createScene,
  createShapeObject,
  createTableObject,
  createTextEntryObject,
  createTextObject,
  plainRichText,
  withCell,
} from '@vedraopus/model';
import type { Project, RichText, Slide, TableGrid } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { drawTextBlocks, richTextBlocks, slideTextBlocks } from './text-view';
import type { TextBlock } from './text-view';

/** The text view's content and order (docs/briefs/P10.1-accessibility.md, part C). */

const asIs = (text: string) => text.trim();

/** A course of one slide, played: the blocks the text view shows now. */
function play(project: Project, act?: (engine: ReturnType<typeof createEngine>) => void) {
  const engine = createEngine(project);
  engine.tick(0);
  act?.(engine);
  const slide = project.scenes[0]!.slides[0]!;
  return (title = slide.title) =>
    slideTextBlocks(slide, engine.getView(), title, {
      variable: (name) => {
        const value = engine.getVariable(name);
        return value === undefined ? undefined : String(value);
      },
    });
}

function course(fill: (slide: Slide, project: Project) => void): Project {
  const project = createEmptyProject('Reading');
  const slide = project.scenes[0]!.slides[0]!;
  slide.title = 'Getting started';
  fill(slide, project);
  return project;
}

describe('rich text in the text view', () => {
  it('keeps paragraphs and lists, nested items after their parent, and leaves blank lines out', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First  line' }] },
        { type: 'paragraph' },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Apples' }] },
                {
                  type: 'orderedList',
                  content: [
                    {
                      type: 'listItem',
                      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Green' }] }],
                    },
                  ],
                },
              ],
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Pears' }] }],
            },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'One' },
            { type: 'hardBreak' },
            { type: 'text', text: 'two' },
          ],
        },
      ],
    } as unknown as RichText;
    expect(richTextBlocks(doc, (text) => text.replace(/\s+/g, ' ').trim())).toEqual([
      { kind: 'paragraph', text: 'First line' },
      { kind: 'list', ordered: false, items: ['Apples', 'Green', 'Pears'] },
      { kind: 'paragraph', text: 'One two' },
    ]);
    expect(richTextBlocks(plainRichText(''), asIs)).toEqual([]);
  });
});

describe('a slide in the text view', () => {
  it('gives the title, then the objects top to bottom and left to right, pictures by their alt text', () => {
    const blocks = play(
      course((slide) => {
        slide.baseLayer.objects.push(
          createTextObject('Second', { x: 400, y: 100 }),
          createTextObject('Third', { x: 0, y: 300 }),
          createTextObject('First', { x: 10, y: 102 }),
          {
            ...createImageObject('a'.repeat(64), { x: 0, y: 500 }),
            a11y: { altText: 'A map', visibleToAssistiveTech: true },
          },
          // A picture with no alt text, and decoration, say nothing.
          createImageObject('b'.repeat(64), { x: 0, y: 600 }),
          {
            ...createShapeObject({ kind: 'rect' }, { x: 0, y: 650 }),
            a11y: { altText: 'Swirl', visibleToAssistiveTech: false },
          },
          // A wordless shape the author described is a picture.
          {
            ...createShapeObject({ kind: 'ellipse' }, { x: 0, y: 700 }),
            a11y: { altText: 'A circle', visibleToAssistiveTech: true },
          },
        );
      }),
    )();
    expect(blocks).toEqual<TextBlock[]>([
      { kind: 'heading', text: 'Getting started' },
      { kind: 'paragraph', text: 'First' },
      { kind: 'paragraph', text: 'Second' },
      { kind: 'paragraph', text: 'Third' },
      { kind: 'picture', text: 'A map' },
      { kind: 'picture', text: 'A circle' },
    ]);
  });

  it('follows the author’s Tab order first, and reads a group’s parts by layout', () => {
    const blocks = play(
      course((slide) => {
        const low = createTextObject('Low', { x: 0, y: 400 });
        const high = createTextObject('High', { x: 0, y: 0 });
        const group = createGroupObject([
          createTextObject('Inside, below', { x: 0, y: 260 }),
          createTextObject('Inside, above', { x: 0, y: 200 }),
        ]);
        slide.baseLayer.objects.push(high, group, low);
        slide.properties.focusOrder = [low.id];
      }),
    )();
    expect(blocks.map((block) => ('text' in block ? block.text : block.kind))).toEqual([
      'Getting started',
      'Low',
      'High',
      'Inside, above',
      'Inside, below',
    ]);
  });

  it('follows states, hidden objects, layers shown, typed text and variables', () => {
    let overlay = '';
    let hiddenId = '';
    let entryId = '';
    const project = course((slide, project) => {
      project.variables.push({ id: createId('var'), name: 'Name', type: 'text', default: 'Sam' });
      const greeting = createTextObject('Hello, %Name%.', { x: 0, y: 0 });
      greeting.states.push({
        id: 'visited',
        name: 'Visited',
        overrides: { text: plainRichText('Welcome back.') },
      });
      const hidden = createTextObject('Not yet', { x: 0, y: 100 });
      hidden.states.push({ id: 'hidden', name: 'Hidden', overrides: {} });
      hiddenId = hidden.id;
      const entry = { ...createTextEntryObject({ x: 0, y: 200 }), name: 'Your name' };
      entryId = entry.id;
      slide.baseLayer.objects.push(greeting, hidden, entry);
      const layer = createLayer('More');
      layer.objects.push(createTextObject('On the layer'));
      slide.layers.push(layer);
      overlay = layer.id;
    });
    const before = play(project)();
    expect(before).toEqual<TextBlock[]>([
      { kind: 'heading', text: 'Getting started' },
      { kind: 'paragraph', text: 'Hello, Sam.' },
      { kind: 'paragraph', text: 'Not yet' },
      { kind: 'field', label: 'Your name', value: '' },
    ]);
    const after = play(project, (engine) => {
      engine.setObjectState(project.scenes[0]!.slides[0]!.baseLayer.objects[0]!.id, 'visited');
      engine.setObjectState(hiddenId, 'hidden');
      engine.input(entryId, 'Ana');
      engine.showLayer(overlay);
    })();
    expect(after).toEqual<TextBlock[]>([
      { kind: 'heading', text: 'Getting started' },
      { kind: 'paragraph', text: 'Welcome back.' },
      { kind: 'field', label: 'Your name', value: 'Ana' },
      { kind: 'paragraph', text: 'On the layer' },
    ]);
  });

  it('gives a table with its header row, and a question’s choices, the chosen one marked', () => {
    const tableProject = course((slide) => {
      const table = createTableObject(2, 2);
      let grid: TableGrid = { columns: table.props.columns, rows: table.props.rows };
      grid = withCell(grid, 0, 0, { text: plainRichText('Fruit') });
      grid = withCell(grid, 0, 1, { text: plainRichText('Colour') });
      grid = withCell(grid, 1, 0, { text: plainRichText('Plum') });
      grid = withCell(grid, 1, 1, { text: plainRichText('Purple') });
      table.props = { ...table.props, ...grid, headerRow: true, headerColumn: false };
      slide.baseLayer.objects.push(table);
    });
    expect(play(tableProject)().slice(1)).toEqual<TextBlock[]>([
      {
        kind: 'table',
        rows: [
          ['Fruit', 'Colour'],
          ['Plum', 'Purple'],
        ],
        headerRow: true,
        headerColumn: false,
      },
    ]);

    const quiz = createEmptyProject('Quiz');
    const question = createQuestionSlide('multipleChoice', quiz.stage);
    quiz.scenes = [{ ...createScene(), slides: [question] }];
    const choices = question.baseLayer.objects.filter((object) => object.type === 'choice');
    const blocks = play(quiz, (engine) => engine.pointer('click', choices[1]!.id))();
    const shown = blocks.filter((block) => block.kind === 'choice');
    expect(shown).toHaveLength(choices.length);
    expect(shown.map((block) => block.checked)).toEqual(choices.map((_, i) => i === 1));
  });
});

describe('drawing the text view', () => {
  it('draws a heading, paragraphs, lists, a table with headers, and fields in words', () => {
    const say = (key: string, values: Record<string, string>) =>
      ({
        textPicture: `Picture: ${values['text']}`,
        textField: `${values['label']}: ${values['value']}`,
        textEmpty: '(empty)',
        textChosen: `${values['text']} (chosen)`,
      })[key]!;
    const nodes = drawTextBlocks(
      document,
      [
        { kind: 'heading', text: 'Title' },
        { kind: 'paragraph', text: 'Words' },
        { kind: 'list', ordered: true, items: ['a', 'b'] },
        { kind: 'picture', text: 'A map' },
        { kind: 'field', label: 'Name', value: '' },
        { kind: 'choice', text: 'Yes', checked: true },
        { kind: 'table', rows: [['H'], ['c']], headerRow: true, headerColumn: false },
      ],
      say,
    );
    expect(nodes.map((node) => node.outerHTML)).toEqual([
      // Each line runs the way its own words do (P10.3; the Phase 10 review).
      '<h2 dir="auto">Title</h2>',
      '<p dir="auto">Words</p>',
      '<ol><li dir="auto">a</li><li dir="auto">b</li></ol>',
      '<p dir="auto">Picture: A map</p>',
      '<p dir="auto">Name: (empty)</p>',
      '<p dir="auto">Yes (chosen)</p>',
      '<table><tbody><tr><th dir="auto" scope="col">H</th></tr><tr><td dir="auto">c</td></tr></tbody></table>',
    ]);
  });
});

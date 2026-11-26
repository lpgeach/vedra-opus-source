import { describe, expect, it } from 'vitest';
import {
  applyTranslation,
  createButtonObject,
  createDropdownObject,
  createEmptyProject,
  createHistory,
  createId,
  createLayer,
  createMarkerObject,
  createTableObject,
  createTextEntryObject,
  createTextObject,
  inlineText,
  labelText,
  parseProject,
  readXliff,
  serializeProject,
  TranslationFileError,
  translationUnits,
  writeXliff,
} from './index';
import type { Inline, Project, RichText, TranslatedUnit } from './index';
import masters from '../../../fixtures/projects/masters/project.json';
import minimal from '../../../fixtures/projects/minimal/project.json';
import statesAndTriggers from '../../../fixtures/projects/states-and-triggers/project.json';
import twoSlides from '../../../fixtures/projects/two-slides/project.json';

/** Every fixture project (fixtures/projects). */
const FIXTURES: Record<string, unknown> = {
  masters,
  minimal,
  'states-and-triggers': statesAndTriggers,
  'two-slides': twoSlides,
};

/** Translation (docs/briefs/P10.3-translation.md, part A). */

const copy = (project: Project): Project => parseProject(JSON.parse(serializeProject(project)));

/** A course with words of many kinds, formatting included. */
function course(): Project {
  const project = createEmptyProject('Safety at work');
  const slide = project.scenes[0]!.slides[0]!;
  slide.title = 'Welcome';
  const intro = createTextObject('', { x: 0, y: 0 });
  intro.props.text = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Read the ' },
          { type: 'text', text: 'safety', marks: [{ type: 'bold' }] },
          { type: 'text', text: ' notes, %Name%.' },
        ],
      },
      { type: 'paragraph' },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Gloves' }] }],
          },
        ],
      },
    ],
  } as RichText;
  intro.a11y.altText = '';
  const button = createButtonObject('Start', { x: 0, y: 200 });
  button.states.push({
    id: 'visited',
    name: 'Visited',
    overrides: {
      text: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Again' }] }],
      },
    },
  });
  const field = createTextEntryObject({ x: 0, y: 300 });
  field.props.placeholder = 'Your name';
  const dropdown = createDropdownObject(['Yes', 'No'], { x: 0, y: 400 });
  const marker = createMarkerObject({ x: 0, y: 500 });
  marker.props.title = 'Exit';
  marker.props.body = 'Two doors\nOne each side';
  const table = createTableObject(1, 1, { x: 300, y: 0 });
  table.props.rows[0]!.cells[0]!.text = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }],
  };
  slide.baseLayer.objects.push(intro, button, field, dropdown, marker, table);
  const layer = createLayer('Hint');
  layer.objects.push(createTextObject('Look up', { x: 0, y: 0 }));
  slide.layers.push(layer);
  slide.notes = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Say hello' }] }],
  };
  project.player.tabs.glossary.terms.push({
    id: createId('term'),
    term: 'PPE',
    definition: 'Protective kit',
  });
  return project;
}

const ids = (project: Project) => translationUnits(project).map((unit) => unit.id);
const unitOf = (project: Project, suffix: string) =>
  translationUnits(project).find((unit) => unit.id.endsWith(suffix))!;

/** Every unit's target: its source with each text upper-cased. */
const shouted = (project: Project): TranslatedUnit[] =>
  translationUnits(project).map((unit) => ({
    id: unit.id,
    source: unit.source,
    target: unit.source.map((each): Inline =>
      'text' in each ? { text: each.text.toUpperCase() } : each,
    ),
  }));

describe('the translation units', () => {
  it('cover titles, words by paragraph, states, alt text, fields, options, markers, tables, layers, notes, glossary and player words', () => {
    const project = course();
    const slide = project.scenes[0]!.slides[0]!;
    const [intro, button, field, dropdown, marker, table] = slide.baseLayer.objects;
    const all = ids(project);
    for (const id of [
      'project/title',
      `scene/${project.scenes[0]!.id}/title`,
      `slide/${slide.id}/title`,
      `object/${intro!.id}/text/0`,
      `object/${intro!.id}/text/2.0.0`,
      `object/${button!.id}/text/0`,
      `object/${button!.id}/state/visited/0`,
      `object/${field!.id}/placeholder`,
      `object/${dropdown!.id}/option/1`,
      `object/${marker!.id}/title`,
      `object/${marker!.id}/body`,
      `object/${table!.id}/cell/0.0/0`,
      `layer/${slide.layers[0]!.id}/name`,
      `slide/${slide.id}/notes/0`,
      'label/next',
    ]) {
      expect(all, id).toContain(id);
    }
    // Blank paragraphs, object names and empty alt text are not units.
    expect(all).not.toContain(`object/${intro!.id}/text/1`);
    expect(all.some((id) => id.endsWith('/alt'))).toBe(false);
    expect(translationUnits(project).some((unit) => inlineText(unit.source) === 'Text Box')).toBe(
      false,
    );
  });

  it('keep formatting as numbered tags, line breaks as breaks, and %Name% as written', () => {
    const project = course();
    const intro = project.scenes[0]!.slides[0]!.baseLayer.objects[0]!;
    expect(unitOf(project, `${intro.id}/text/0`).source).toEqual([
      { text: 'Read the ' },
      { open: 1 },
      { text: 'safety' },
      { close: 1 },
      { text: ' notes, %Name%.' },
    ]);
    const marker = project.scenes[0]!.slides[0]!.baseLayer.objects[4]!;
    expect(unitOf(project, `${marker.id}/body`).source).toEqual([
      { text: 'Two doors' },
      { br: true },
      { text: 'One each side' },
    ]);
  });
});

describe('applying a translation', () => {
  it('puts every unit back, formatting on the translated words, and makes the language the course’s', () => {
    const project = copy(course());
    const result = applyTranslation(project, shouted(project), 'fr');
    expect(result).toMatchObject({ changed: 0, missing: 0, invalid: 0, untranslated: 0 });
    expect(result.translated).toBe(translationUnits(course()).length);
    const slide = project.scenes[0]!.slides[0]!;
    expect(slide.title).toBe('WELCOME');
    const intro = slide.baseLayer.objects[0]!;
    if (intro.type !== 'text') throw new Error('text');
    expect(intro.props.text.content[0]!.content).toEqual([
      { type: 'text', text: 'READ THE ' },
      { type: 'text', text: 'SAFETY', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' NOTES, %NAME%.' },
    ]);
    expect(project.player.labels.language).toBe('fr');
    expect(labelText(project.player.labels, 'next')).toBe('NEXT');
    // Still a valid project.
    expect(() => copy(project)).not.toThrow();
  });

  it('skips and counts units that changed since export, that are gone, untranslated, or carry unknown tags', () => {
    const exported = course();
    const units = shouted(exported);
    const project = copy(exported);
    const slide = project.scenes[0]!.slides[0]!;
    slide.title = 'Hello';
    const [, button, , dropdown] = slide.baseLayer.objects;
    slide.baseLayer.objects = slide.baseLayer.objects.filter((object) => object.id !== button!.id);
    const optionId = `object/${dropdown!.id}/option/0`;
    const withProblems = units.map((unit) =>
      unit.id === optionId
        ? { ...unit, target: [{ open: 7 }, { text: 'Oui' }, { close: 7 }] }
        : unit.id === 'project/title'
          ? { ...unit, target: null }
          : unit,
    );
    const result = applyTranslation(project, withProblems, 'fr');
    expect(result.changed).toBe(1);
    expect(result.missing).toBe(2);
    expect(result.untranslated).toBe(1);
    expect(result.invalid).toBe(1);
    expect(slide.title).toBe('Hello');
    expect(project.title).toBe('Safety at work');
  });

  it('is one undo step', () => {
    const history = createHistory(copy(course()));
    const before = serializeProject(history.project);
    history.execute('project.translate', { units: shouted(history.project), language: 'de' });
    expect(history.project.scenes[0]!.slides[0]!.title).toBe('WELCOME');
    history.undo();
    expect(serializeProject(history.project)).toBe(before);
    expect(() =>
      history.execute('project.translate', { units: [], language: 'not a tag' }),
    ).toThrow();
  });

  it('changes nothing when a file comes back untranslated, or with the source as the translation, for every fixture', () => {
    for (const [name, json] of Object.entries(FIXTURES)) {
      const project = parseProject(JSON.parse(JSON.stringify(json)));
      const language = project.player.labels.language;
      const xliff = writeXliff(translationUnits(project), {
        sourceLanguage: language,
        targetLanguage: language,
        original: project.title,
      });
      const read = readXliff(xliff);
      const untouched = copy(project);
      applyTranslation(untouched, read.units, language);
      expect(serializeProject(untouched), name).toBe(serializeProject(project));
      const same = copy(project);
      const result = applyTranslation(
        same,
        read.units.map((unit) => ({ ...unit, target: unit.source })),
        language,
      );
      expect(result.changed + result.missing + result.invalid, name).toBe(0);
      expect(serializeProject(same), name).toBe(serializeProject(project));
    }
  });
});

describe('XLIFF 1.2', () => {
  it('writes units with tags, notes and languages, and reads them back', () => {
    const project = course();
    const units = translationUnits(project);
    const intro = units.find((unit) => unit.id.endsWith('/text/0'))!;
    const text = writeXliff(units, {
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      original: 'Safety & work',
      targets: new Map([
        [intro.id, [{ text: 'Lisez les ' }, { open: 1 }, { text: 'consignes' }, { close: 1 }]],
      ]),
    });
    expect(text).toContain('<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">');
    expect(text).toContain('source-language="en" target-language="fr"');
    expect(text).toContain('original="Safety &amp; work"');
    expect(text).toContain('<source>Read the <g id="1">safety</g> notes, %Name%.</source>');
    expect(text).toContain('<target>Lisez les <g id="1">consignes</g></target>');
    const read = readXliff(text);
    expect(read).toMatchObject({
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      original: 'Safety & work',
    });
    expect(read.units).toHaveLength(units.length);
    expect(read.units.find((unit) => unit.id === intro.id)!.target).toEqual([
      { text: 'Lisez les ' },
      { open: 1 },
      { text: 'consignes' },
      { close: 1 },
    ]);
  });

  it('reads entities, CDATA, comments, groups and a tool’s marks, as tools write them', () => {
    const read = readXliff(`<?xml version="1.0"?>
<!-- made by a tool -->
<xliff version='1.2' xmlns='urn:oasis:names:tc:xliff:document:1.2'>
  <file original="c" source-language="en" target-language="ar" datatype="plaintext">
    <header/>
    <body>
      <group id="g1">
        <trans-unit id="a"><source>Fish &amp; chips &#233;&#x41;</source><target><![CDATA[<raw> words]]></target></trans-unit>
      </group>
      <trans-unit id="b"><source>Two<x id="br"/>lines</source><target><mrk mtype="seg">Deux</mrk><x id="br"/>lignes</target></trans-unit>
    </body>
  </file>
</xliff>`);
    expect(read.targetLanguage).toBe('ar');
    expect(read.units).toEqual([
      { id: 'a', source: [{ text: 'Fish & chips éA' }], target: [{ text: '<raw> words' }] },
      {
        id: 'b',
        source: [{ text: 'Two' }, { br: true }, { text: 'lines' }],
        target: [{ text: 'Deux' }, { br: true }, { text: 'lignes' }],
      },
    ]);
  });

  it('refuses what is not well-formed XLIFF 1.2, saying why', () => {
    const refused = (text: string) => {
      try {
        readXliff(text);
        return '';
      } catch (error) {
        if (error instanceof TranslationFileError) return error.message;
        throw error;
      }
    };
    expect(refused('<html></html>')).toMatch(/not an XLIFF file/);
    expect(refused('<xliff version="2.0"></xliff>')).toMatch(/only XLIFF 1.2/);
    expect(refused('<xliff version="1.2"><file>')).toMatch(/not well-formed/);
    expect(
      refused('<xliff version="1.2"><file source-language="en"><body/></file></xliff>'),
    ).toMatch(/target-language/);
    expect(
      refused(
        '<xliff version="1.2"><file source-language="en" target-language="fr"><body><trans-unit id="a"><source>x<bpt id="1">b</bpt></source></trans-unit></body></file></xliff>',
      ),
    ).toMatch(/<bpt> tag/);
    expect(refused('<xliff version="1.2">&nbsp;</xliff>')).toMatch(/unknown entity/);
  });
});

import { randomUUID } from 'node:crypto';
import { forEachObject, parseCaptions, parseProject, serializeProject } from '@vedraopus/model';
import type { Project, SceneObject, Slide } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { convertStoryline } from './convert';
import type { ConvertOptions } from './convert';
import { mediaItems, resolveMedia } from './media';
import { IDS, testStoryPackage, testStoryParts } from './test-story';

/** Media kinds and ties, captions, shapes and triggers (docs/briefs/B5c-storyline-media-shapes-triggers.md). */

const HASH = 'a'.repeat(64);

function convert(parts: Map<string, Buffer>, extra: Partial<ConvertOptions> = {}) {
  const result = convertStoryline(testStoryPackage(parts), {
    fileName: 'Test course',
    media: (g) => (g === IDS.picture ? { hash: HASH, kind: 'image' } : null),
    ...extra,
  });
  result.project.assets[HASH] = {
    kind: 'image',
    fileName: 'dot.png',
    ext: 'png',
    mimeType: 'image/png',
    byteLength: 70,
  };
  return result;
}

const slides = (project: Project) => project.scenes.flatMap((scene) => scene.slides);
function named(slide: Slide, name: string): SceneObject {
  let found: SceneObject | undefined;
  for (const layer of [slide.baseLayer, ...slide.layers]) {
    forEachObject(layer.objects, (object) => {
      if (object.name === name) found = object;
    });
  }
  if (!found) throw new Error(`no object ${name}`);
  return found;
}

/** The test course with `xml` added to slide 2's objects, and `triggers` to slide 2's own. */
function withOnSlide2(xml: string, triggers = '') {
  const parts = testStoryParts();
  const slide2 = parts.get('story/slides/slide2.xml')!.toString('utf8');
  parts.set(
    'story/slides/slide2.xml',
    Buffer.from(
      slide2
        .replace('</shapeLst>', `${xml}</shapeLst>`)
        .replace('<trigLst /></sld>', `<trigLst>${triggers}</trigLst></sld>`),
    ),
  );
  return parts;
}
const box = (g: string, name: string, inner = '') =>
  `<rect g="${g}" name="${name}" zOrder="30"><sldSz w="960" h="540" /><loc l="0" t="0" r="100" b="50" />${inner}</rect>`;
const trig = (event: string, action: string, inner: string, conditions = '') =>
  `<trig type="user"><data enabled="true" event="${event}" action="${action}" actSubType="spec">${inner}</data><condLst>${conditions}</condLst></trig>`;

describe('media kinds and ties (B5 part C)', () => {
  it('takes an MP4 listed among pictures as a video', () => {
    const items = mediaItems(
      '<story><media g="11111111-1111-4111-8111-111111111111" type="Mp4" displayName="a.mp4" bytes="10" />' +
        '<media g="22222222-2222-4222-8222-222222222222" type="Png" displayName="b.png" bytes="5" /></story>',
    );
    expect(items.get('11111111-1111-4111-8111-111111111111')!.kind).toBe('video');
    expect(items.get('22222222-2222-4222-8222-222222222222')!.kind).toBe('picture');
  });

  it('breaks a tie by the order the slide uses its media in, past a thumbnail', () => {
    // Two pictures recorded at sizes no stored file has (recompressed), sharing three files:
    // theirs, listed in the order they are used (the first twice), then the slide's thumbnail.
    const a = '11111111-1111-4111-8111-111111111111';
    const b = '22222222-2222-4222-8222-222222222222';
    const rel = (target: string, id: string) =>
      `<Relationship Type="media" Target="/story/media/${target}" Id="${id}" />`;
    const resolved = resolveMedia({
      xml: new Map([
        [
          'story/story.xml',
          `<story><media g="${a}" type="Jpeg" displayName="one.jpg" bytes="900" />` +
            `<media g="${b}" type="Jpeg" displayName="two.jpg" bytes="800" /></story>`,
        ],
        [
          'story/slides/slide.xml',
          `<sld><pic assetG="${a}" /><pic assetG="${a}" /><pic assetG="${b}" /></sld>`,
        ],
        [
          'story/slides/_rels/slide.xml.rels',
          `<Relationships>${rel('Rone.jpg', 'R1')}${rel('Rone.jpg', 'R2')}${rel('Rtwo.jpg', 'R3')}${rel('Rthumb.jpg', 'R4')}</Relationships>`,
        ],
      ]),
      media: new Map([
        ['story/media/Rone.jpg', 500],
        ['story/media/Rtwo.jpg', 400],
        ['story/media/Rthumb.jpg', 300],
      ]),
    });
    expect(resolved.files.get(a)).toBe('story/media/Rone.jpg');
    expect(resolved.files.get(b)).toBe('story/media/Rtwo.jpg');
    expect(resolved.guessed).toBe(0);
  });
});

describe('captions, shapes and triggers (B5 part C)', () => {
  it('puts a sound’s captions on it, from the file its ccG names', () => {
    const cc = '33333333-3333-4333-8333-333333333333';
    const sound = '44444444-4444-4444-8444-444444444444';
    const parts = withOnSlide2(
      `<sound g="55555555-5555-4555-8555-555555555555" name="Voice" zOrder="30" assetG="${sound}" ccG="${cc}">` +
        `<sldSz w="960" h="540" /><loc l="0" t="0" r="40" b="40" /></sound>`,
    );
    const vtt = [
      'WEBVTT',
      '',
      '00:00.000 --> 00:01.500',
      'Hello there',
      '',
      '00:01.500 --> 00:03.000',
      'And goodbye',
      '',
    ].join('\n');
    const { project, report } = convert(parts, {
      media: (g) =>
        g === IDS.picture
          ? { hash: HASH, kind: 'image' }
          : g === sound
            ? { hash: 'b'.repeat(64), kind: 'audio', duration: 3 }
            : null,
      captions: (g) => (g === cc ? parseCaptions(vtt) : null),
    });
    const voice = named(slides(project)[1]!, 'Voice');
    expect(voice.type).toBe('audio');
    if (voice.type !== 'audio') return;
    expect(voice.props.captions.map((cue) => [cue.start, cue.end, cue.text])).toEqual([
      [0, 1.5, 'Hello there'],
      [1.5, 3, 'And goodbye'],
    ]);
    expect(report).toEqual([]);
  });

  it('draws shapes it has polygons for by their stored proportions', () => {
    const shape = (tag: string, name: string, geometry: string) =>
      `<${tag} g="${randomUUID()}" name="${name}" zOrder="31"><sldSz w="960" h="540" />` +
      `<loc l="0" t="0" r="100" b="50" /><prstGeom>${geometry}</prstGeom></${tag}>`;
    const { project, report } = convert(
      withOnSlide2(
        shape('polygon', 'Hex', '<polygon offset="0.25" sides="6" />') +
          shape('trapezoid', 'Trap', '<trapezoid offset="0.3" />') +
          shape('chevron', 'Chev', '<chevron cx="0.6" cy="1" />') +
          shape('upArrow', 'Up', '<upArrow cx="0.5" cy="0.4" />') +
          shape('frame', 'Frame', '<frame cx="0.05" />'),
      ),
    );
    const slide = slides(project)[1]!;
    const points = (name: string) => {
      const object = named(slide, name);
      if (object.type !== 'shape') return null;
      const { geometry } = object.props;
      return geometry.kind === 'polygon'
        ? geometry.points.map(({ x, y }) => [x, y])
        : geometry.kind;
    };
    // offset 0.25: the hexagon's top and bottom corners a quarter of the way in.
    expect(points('Hex')).toEqual([
      [0.25, 0],
      [0.75, 0],
      [1, 0.5],
      [0.75, 1],
      [0.25, 1],
      [0, 0.5],
    ]);
    expect(points('Trap')).toEqual([
      [0.3, 0],
      [0.7, 0],
      [1, 1],
      [0, 1],
    ]);
    // cx 0.6: the point starts at 0.6 of the width; the notch is 1 − 0.6 = 0.4 in.
    expect(points('Chev')).toEqual([
      [0, 0],
      [0.6, 0],
      [1, 0.5],
      [0.6, 1],
      [0, 1],
      [0.4, 0.5],
    ]);
    // The shaft half the width (0.5 ± 0.25), the head 0.4 of the height.
    expect(points('Up')).toEqual([
      [0.5, 0],
      [1, 0.4],
      [0.75, 0.4],
      [0.75, 1],
      [0.25, 1],
      [0.25, 0.4],
      [0, 0.4],
    ]);
    // A frame is a path shape since B13 (convert-b13.test.ts).
    expect(points('Frame')).toBe('path');
    expect(report.map((item) => item.what)).toEqual([]);
  });

  it('brings scene jumps, state changes over several objects, “between” and file links across', () => {
    const one = '66666666-6666-4666-8666-666666666661';
    const two = '66666666-6666-4666-8666-666666666662';
    const three = '66666666-6666-4666-8666-666666666663';
    const states = (name: string) =>
      `<stateLst><state name="Normal"><shapeLst><rect name="${name}" /></shapeLst></state>` +
      `<state name="Done"><shapeLst><rect name="${name}" /></shapeLst></state></stateLst>`;
    const parts = withOnSlide2(
      box(one, 'One', states('One')) +
        box(two, 'Two', states('Two')) +
        box(
          three,
          'Three',
          '<trigLst>' +
            // To a scene whose landing slide is not known: its first slide.
            trig(
              'OnClick',
              'jumpToScene',
              `<scene jumpG="${IDS.scene}" /><slide jumpG="99999999-9999-4999-8999-999999999999" />`,
            ) +
            // Waiting for an animation the course no longer has: left out without a word.
            trig(
              'OnAnimationComplete',
              'adjustVar',
              `<other varG="${IDS.seen}" op="ass" boolVal="True" animationG="77777777-7777-4777-8777-777777777777" />`,
            ) +
            trig('OnClick', 'jumpToFileUrl', '<other open="external_files/notes.pdf" />') +
            '</trigLst>',
        ),
      // The slide's own: when both One and Two are Done, set Seen; and one with a "between".
      trig(
        'OnStateChange',
        'adjustVar',
        `<shape stateInclude="all" statesNot="are" stateName="Done"><stateLst><g>${one}</g><g>${two}</g></stateLst></shape>` +
          `<other varG="${IDS.seen}" op="ass" boolVal="True" />`,
      ) +
        trig(
          'OnStart',
          'adjustVar',
          `<other varG="${IDS.seen}" op="ass" boolVal="True" />`,
          `<trigCond op="btw" floatVal1="5" floatVal2="2" varG="${IDS.score}" dataType="value" andOr="and" />`,
        ),
    );
    const { project, report } = convert(parts);
    const slide = slides(project)[1]!;
    const first = slides(project)[0]!;
    const oneId = named(slide, 'One').id;
    const twoId = named(slide, 'Two').id;
    const score = project.variables.find((variable) => variable.name === 'Score')!.id;
    expect(slide.triggers).toContainEqual(
      expect.objectContaining({
        action: { type: 'jumpToSlide', target: { kind: 'slide', slide: first.id } },
      }),
    );
    // One trigger for each object, each also needing the other Done.
    const waits = slide.triggers.filter((t) => t.event.type === 'stateChange');
    const done = (object: string) => ({
      subject: 'objectState',
      object,
      operator: '==',
      state: waits[0]!.event.type === 'stateChange' ? waits[0]!.event.state : '',
    });
    expect(waits.map((t) => [t.event, t.conditions])).toEqual([
      [
        { type: 'stateChange', object: oneId, state: done(twoId).state },
        { combine: 'and', items: [done(twoId)] },
      ],
      [
        { type: 'stateChange', object: twoId, state: done(oneId).state },
        { combine: 'and', items: [done(oneId)] },
      ],
    ]);
    // Between 2 and 5, whichever way round they were stored.
    const between = slide.triggers.find((t) => t.event.type === 'timelineStart' && t.conditions);
    expect(between?.conditions).toEqual({
      combine: 'and',
      items: [
        {
          subject: 'variable',
          variable: score,
          operator: '>=',
          value: { kind: 'literal', value: 2 },
        },
        {
          subject: 'variable',
          variable: score,
          operator: '<=',
          value: { kind: 'literal', value: 5 },
        },
      ],
    });
    const threeId = named(slide, 'Three').id;
    expect(
      slide.triggers.some((t) => t.owner.id === threeId && t.event.type === 'animationCompletes'),
    ).toBe(false);
    expect(report.map((item) => item.what)).toEqual([
      // Opened beside the published course since B15, as Storyline did.
      'The link to “external_files/notes.pdf” opens it beside the published course, as Storyline did: put the file there, or beside the .story file before importing to bring it in',
    ]);
    expect(() => parseProject(JSON.parse(serializeProject(project)))).not.toThrow();
  });
});

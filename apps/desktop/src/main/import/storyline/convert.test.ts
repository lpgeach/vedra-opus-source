import { forEachObject, parseProject, serializeProject } from '@vedraopus/model';
import type { Project, SceneObject, Slide, XmlElement } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { convertStoryline, isoSeconds, readMotionPath } from './convert';
import type { PlacedMedia } from './convert';
import { resolveMedia } from './media';
import { IDS, testStoryPackage, testStoryParts } from './test-story';

const HASH = 'a'.repeat(64);

function convert(parts = testStoryParts()) {
  const pkg = testStoryPackage(parts);
  const media = (g: string): PlacedMedia | null =>
    g === IDS.picture ? { hash: HASH, kind: 'image' } : null;
  const result = convertStoryline(pkg, { fileName: 'Test course', media });
  result.project.assets = {
    [HASH]: {
      kind: 'image',
      fileName: 'dot.png',
      ext: 'png',
      mimeType: 'image/png',
      byteLength: 70,
    },
  };
  return result;
}

const slides = (project: Project) => project.scenes.flatMap((scene) => scene.slides);
const named = (slide: Slide, name: string): SceneObject => {
  let found: SceneObject | undefined;
  for (const layer of [slide.baseLayer, ...slide.layers]) {
    forEachObject(layer.objects, (object) => {
      if (object.name === name) found = object;
    });
  }
  if (!found) throw new Error(`no object ${name}`);
  return found;
};
const words = (object: SceneObject) =>
  JSON.stringify(object.type === 'text' || object.type === 'shape' ? object.props.text : null);

describe('converting a .story course', () => {
  it('makes a valid project: scenes, slides, stage, theme and variables', () => {
    const { project } = convert();
    expect(() => parseProject(JSON.parse(serializeProject(project)))).not.toThrow();
    expect(project.scenes.map((scene) => scene.title)).toEqual(['Getting started']);
    expect(slides(project).map((slide) => slide.title)).toEqual(['Welcome', 'Goodbye']);
    expect(project.stage).toEqual({ width: 960, height: 540 });
    // The master's scheme becomes the theme: dk1 the text, lt1 the background.
    expect(project.theme.colors).toMatchObject({
      text: '#111111',
      background: '#ffffff',
      accent1: '#ff8800',
      accent2: '#0088ff',
    });
    // User variables only, with their types and defaults.
    expect(
      project.variables.map(({ name, type, default: value }) => ({ name, type, value })),
    ).toEqual([
      { name: 'Seen', type: 'boolean', value: false },
      { name: 'Score', type: 'number', value: 0 },
    ]);
  });

  it('brings across objects: text with its marks, shapes with fills, pictures, and timing', () => {
    const { project } = convert();
    const [welcome, goodbye] = slides(project);
    const title = named(welcome!, 'Title');
    expect(title.type).toBe('text');
    expect(title.frame).toMatchObject({ x: 40, y: 30, width: 860, height: 60 });
    expect(words(title)).toContain('Welcome aboard');
    expect(words(title)).toContain('"bold"');
    // 30 points is 40 stage pixels.
    expect(words(title)).toContain('"fontSize":40');
    expect(words(title)).toContain('#ffcc00');
    expect(title.animations.entrance).toMatchObject({
      kind: 'fly',
      direction: 'bottom',
      duration: 0.75,
    });
    const button = named(welcome!, 'Next button');
    expect(button.type).toBe('shape');
    if (button.type !== 'shape') return;
    expect(button.props.appearance.fill).toEqual({ kind: 'solid', color: { theme: 'accent1' } });
    expect(button.timing).toEqual({ start: 1, duration: 'untilEnd' });
    const dot = named(welcome!, 'Dot');
    expect(dot).toMatchObject({ type: 'image', props: { asset: HASH } });
    expect(named(goodbye!, 'Back').type).toBe('shape');
  });

  it('gives each slide its background: its own, else its layout’s or master’s; and the master’s objects', () => {
    const { project } = convert();
    const [welcome, goodbye] = slides(project);
    const back = (slide: Slide) => slide.baseLayer.objects[0]!;
    expect(back(welcome!)).toMatchObject({
      name: 'Background',
      type: 'shape',
      locked: true,
      props: { appearance: { fill: { kind: 'solid', color: '#102030' } } },
    });
    expect(back(goodbye!)).toMatchObject({
      type: 'shape',
      props: { appearance: { fill: { kind: 'solid', color: { theme: 'accent2' } } } },
    });
    // The master's own text shows on every slide; text with no colour takes the master's default.
    expect(words(named(welcome!, 'Logo text'))).toContain('Our logo');
    expect(words(named(goodbye!, 'Logo text'))).toContain('Our logo');
  });

  it('keeps states, layers and the slide’s timeline', () => {
    const { project } = convert();
    const [welcome] = slides(project);
    const button = named(welcome!, 'Next button');
    expect(button.states.map((state) => state.id)).toEqual(['normal', 'hover', 'Done']);
    expect(button.states[1]!.overrides).toEqual({
      appearance: { fill: { kind: 'solid', color: { theme: 'accent2' } } },
    });
    expect(JSON.stringify(button.states[2]!.overrides.text)).toContain('Done!');
    expect(welcome!.baseLayer.timeline.duration).toBe(8);
    expect(welcome!.layers).toHaveLength(1);
    expect(welcome!.layers[0]).toMatchObject({
      name: 'More',
      timeline: { duration: 3 },
      properties: { pauseBaseTimeline: true, blockBaseClicks: true },
    });
  });

  it('turns triggers into ours, with their conditions', () => {
    const { project } = convert();
    const [welcome, goodbye] = slides(project);
    const button = named(welcome!, 'Next button');
    const dot = named(welcome!, 'Dot');
    const detail = named(welcome!, 'Detail');
    const [score, seen] = [project.variables[1]!, project.variables[0]!];
    const simple = welcome!.triggers.map(({ owner, event, action, conditions }) => ({
      owner,
      event,
      action,
      conditions,
    }));
    expect(simple).toEqual(
      expect.arrayContaining([
        {
          owner: { kind: 'object', id: button.id },
          event: { type: 'click', object: button.id },
          action: { type: 'changeState', object: button.id, state: 'Done' },
          conditions: null,
        },
        {
          owner: { kind: 'object', id: button.id },
          event: { type: 'click', object: button.id },
          action: { type: 'jumpToSlide', target: { kind: 'next' } },
          conditions: null,
        },
        {
          owner: { kind: 'object', id: dot.id },
          event: { type: 'click', object: dot.id },
          action: { type: 'showLayer', layer: welcome!.layers[0]!.id },
          conditions: null,
        },
        {
          owner: { kind: 'object', id: detail.id },
          event: { type: 'click', object: detail.id },
          action: { type: 'hideLayer', layer: welcome!.layers[0]!.id },
          conditions: null,
        },
        {
          owner: { kind: 'slide', id: welcome!.id },
          event: { type: 'timelineStart', layer: welcome!.baseLayer.id },
          action: {
            type: 'setVariable',
            variable: score.id,
            operator: 'add',
            operand: { kind: 'literal', value: 1 },
          },
          conditions: {
            combine: 'and',
            items: [
              {
                subject: 'variable',
                variable: seen.id,
                operator: '==',
                value: { kind: 'literal', value: true },
              },
            ],
          },
        },
      ]),
    );
    expect(goodbye!.triggers[0]!.action).toEqual({
      type: 'jumpToSlide',
      target: { kind: 'slide', slide: welcome!.id },
    });
    // A built-in state a trigger names but the object never defined is given to it.
    const back = named(goodbye!, 'Back');
    expect(back.states.map((state) => state.id)).toEqual(['normal', 'hidden']);
    expect(goodbye!.triggers[1]!.action).toEqual({
      type: 'changeState',
      object: back.id,
      state: 'hidden',
    });
  });

  it('keeps notes, and reports what has no counterpart yet', () => {
    const { project, report } = convert();
    expect(JSON.stringify(slides(project)[0]!.notes)).toContain('Say hello.');
    expect(JSON.stringify(slides(project)[0]!.notes)).toContain('Then go on.');
    // Sliders come across since B5 part B, so nothing on the test course is left out.
    expect(report).toEqual([]);
  });

  it('reads the format’s durations', () => {
    expect(isoSeconds('PT0.75S')).toBe(0.75);
    expect(isoSeconds('PT1M1S')).toBe(61);
    expect(isoSeconds('nonsense')).toBe(0);
  });
});

describe('finding media files', () => {
  it('matches an item to the file its parts list, of its type and recorded size; never an unlisted extra', () => {
    const resolved = resolveMedia(testStoryPackage());
    expect(resolved.files.get(IDS.picture)).toBe('story/media/R1picture.png');
    expect(resolved.guessed).toBe(0);
    expect([...resolved.files.values()]).not.toContain('story/media/R2extra.jpg');
  });

  it('takes the file of the right size among several the part lists, and settles each file on one item', () => {
    const pkg = {
      xml: new Map([
        [
          'story/story.xml',
          '<story><media g="11111111-1111-4111-8111-111111111111" type="Png" displayName="a.png" bytes="10" /><media g="22222222-2222-4222-8222-222222222222" type="Png" displayName="b.png" bytes="20" /></story>',
        ],
        [
          'story/slides/slide.xml',
          '<sld><pic assetG="11111111-1111-4111-8111-111111111111" /><pic assetG="22222222-2222-4222-8222-222222222222" /></sld>',
        ],
        [
          'story/slides/_rels/slide.xml.rels',
          '<Relationships><Relationship Type="media" Target="/story/media/Rx.png" Id="R1" /><Relationship Type="media" Target="/story/media/Ry.png" Id="R2" /></Relationships>',
        ],
      ]),
      media: new Map([
        ['story/media/Rx.png', 20],
        ['story/media/Ry.png', 10],
      ]),
    };
    const resolved = resolveMedia(pkg);
    expect(resolved.files.get('11111111-1111-4111-8111-111111111111')).toBe('story/media/Ry.png');
    expect(resolved.files.get('22222222-2222-4222-8222-222222222222')).toBe('story/media/Rx.png');
  });
});

/** A motion path element, as the reader gives it. */
const pathElement = (
  name: string,
  attrs: Record<string, string>,
  box: [number, number, number, number],
): XmlElement => ({
  name,
  attrs: { shapeG: IDS.rocket, name: name.replace('Path', ' Motion Path'), ...attrs },
  children: [
    {
      name: 'loc',
      attrs: { l: String(box[0]), t: String(box[1]), r: String(box[2]), b: String(box[3]) },
      children: [],
    },
  ],
});

describe('motion paths (B5 part B)', () => {
  it('puts the line and freeform paths on their object, not on the slide as shapes', () => {
    const { project, report } = convert();
    const slide = slides(project)[1]!;
    const rocket = named(slide, 'Rocket');
    expect(() => named(slide, 'Line Motion Path')).toThrow();
    const [line, free] = rocket.animations.motionPaths;
    // linePath: start (l, t) = (0, 0), end (r, b) = (0, -300).
    expect(line).toMatchObject({
      name: 'Line Motion Path',
      shape: 'line',
      points: [
        { x: 0, y: 0 },
        { x: 0, y: -300 },
      ],
      duration: 1.5,
      easing: 'easeInOut',
      relativeStart: false,
    });
    // customPath in the box l −100, t −50, r 0, b 0 (100 wide, 50 high):
    // (1, 1) → (−100 + 100, −50 + 50) = (0, 0); (0.5, 0) → (−50, −50); (0, 1) → (−100, 0).
    // reverse="true", so they run backwards.
    expect(free).toMatchObject({
      shape: 'freeform',
      points: [
        { x: -100, y: 0 },
        { x: -50, y: -50 },
        { x: 0, y: 0 },
      ],
      duration: 2,
      easing: 'linear',
      relativeStart: true,
    });
    const texts = report.map((item) => item.what).join('\n');
    expect(texts).not.toMatch(/Motion Path.*drawn as/);
    expect(texts).not.toMatch(/motion path is not imported/);
  });

  it('turns Move into moving along the path, and the path ending into its event', () => {
    const { project } = convert();
    const slide = slides(project)[1]!;
    const rocket = named(slide, 'Rocket');
    const line = rocket.animations.motionPaths[0]!;
    const seen = project.variables.find((variable) => variable.name === 'Seen')!;
    expect(slide.triggers).toContainEqual(
      expect.objectContaining({
        owner: { kind: 'object', id: rocket.id },
        event: { type: 'timelineStart', layer: slide.baseLayer.id },
        action: { type: 'moveAlongPath', object: rocket.id, path: line.id },
      }),
    );
    expect(slide.triggers).toContainEqual(
      expect.objectContaining({
        event: {
          type: 'animationCompletes',
          object: rocket.id,
          animation: { kind: 'path', path: line.id },
        },
        action: expect.objectContaining({ type: 'setVariable', variable: seen.id }),
      }),
    );
    expect(() => parseProject(JSON.parse(serializeProject(project)))).not.toThrow();
  });

  it('moves along a turn through the points Storyline’s published course does (B16)', () => {
    // Sample B slide 8: down then right, from (0, 0) to (33.25, 21.5). Published, the object goes
    // straight down to half the height, round the corner through its curve's two controls, and
    // straight on: (0, 10.75), (0, 16.6871), (7.4433, 21.5), (16.625, 21.5), (33.25, 21.5).
    const down = readMotionPath(pathElement('turnPath', { dir: 'dr' }, [0, 0, 33.25, 21.5]))!;
    expect(down.path.shape).toBe('freeform');
    expect(down.path.points).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 10.75 },
      { x: 0, y: 16.69 },
      { x: 7.44, y: 21.5 },
      { x: 16.63, y: 21.5 },
      { x: 33.25, y: 21.5 },
    ]);
    expect(down.approximated).toEqual([]);
    // Right then down: across first.
    const right = readMotionPath(pathElement('turnPath', { dir: 'rd' }, [0, 0, 33.25, 21.5]))!;
    expect(right.path.points.slice(0, 3)).toEqual([
      { x: 0, y: 0 },
      { x: 16.63, y: 0 },
      { x: 25.81, y: 0 },
    ]);
  });

  it('moves along an arc through Storyline’s points, turned by its rot (B16)', () => {
    // Sample B slide 14: the published course moves its picture, backwards, from (791.1, 289.6565)
    // through 7 points to (822.1111, 187.6694), measured from where it puts the picture,
    // (822, 186): the course has it at 822.1539, which the published course rounds.
    const arc = readMotionPath(
      pathElement(
        'arcPath',
        { dir: 'd', rot: '106.912872', reverse: 'true' },
        [-62.9279175, 60.4420776, 43.6698, 48.3899841],
      ),
    )!;
    expect(arc.path.shape).toBe('freeform');
    expect(arc.approximated).toEqual([]);
    const published = [
      [791.1, 289.6565],
      [807.9728, 264.9206],
      [811.647, 259.7707],
      [815.1646, 251.9425],
      [818.1364, 242.1691],
      [821.1082, 232.3957],
      [822.5438, 223.9344],
      [822.3583, 217.6108],
      [822.1111, 187.6694],
    ];
    expect(arc.path.points).toHaveLength(published.length);
    arc.path.points.forEach((point, i) => {
      expect(Math.abs(822 + point.x - published[i]![0]!)).toBeLessThan(0.05);
      expect(Math.abs(186 + point.y - published[i]![1]!)).toBeLessThan(0.05);
    });
  });

  it('reports what ours cannot do, keeps the duration in range, and leaves unknown shapes', () => {
    const odd = readMotionPath(
      pathElement(
        'linePath',
        { orientShape: 'true', autoReverse: 'true', aniDur: 'PT90S', easingDir: 'out' },
        [0, 0, 10, 10],
      ),
    )!;
    expect(odd.path.duration).toBe(60);
    expect(odd.path.easing).toBe('easeOut');
    expect(odd.approximated.join('\n')).toMatch(/turns to follow/);
    expect(odd.approximated.join('\n')).toMatch(/comes back/);
    expect(odd.approximated.join('\n')).toMatch(/60 s instead of 90 s/);
    expect(readMotionPath(pathElement('circlePath', {}, [0, 0, 10, 10]))).toBeNull();
  });
});

describe('sliders and dials (B5 part B)', () => {
  it('keeps a slider’s range, step, variable, way and track colour, and its move trigger', () => {
    const { project } = convert();
    const slide = slides(project)[1]!;
    const slider = named(slide, 'Volume slider');
    const score = project.variables.find((variable) => variable.name === 'Score')!;
    const seen = project.variables.find((variable) => variable.name === 'Seen')!;
    expect(slider.type).toBe('slider');
    if (slider.type !== 'slider') return;
    // Score's default is 0, below the range 1–5, so it starts at 1.
    expect(slider.props).toMatchObject({
      variable: score.id,
      min: 1,
      max: 5,
      step: 1,
      initial: 1,
      orientation: 'horizontal',
      trackColor: { theme: 'accent2' },
    });
    expect(slide.triggers).toContainEqual(
      expect.objectContaining({
        owner: { kind: 'object', id: slider.id },
        event: { type: 'controlMoves', object: slider.id },
        action: expect.objectContaining({ type: 'setVariable', variable: seen.id }),
      }),
    );
  });

  it('keeps a dial’s range, increment and variable, and reports its face', () => {
    const parts = testStoryParts();
    const slide2 = parts.get('story/slides/slide2.xml')!.toString('utf8');
    const dial =
      `<dial g="10000000-0000-4000-8000-000000000073" name="Speed dial" zOrder="5"><sldSz w="960" h="540" /><loc l="600" t="100" r="750" b="250" />` +
      `<dialData dialType="BuiltInDial" varG="${IDS.score}" updateAction="drag" increment="5"><values start="-50" end="50" /></dialData>` +
      `<trigLst><trig type="user"><data enabled="true" event="OnDialTurns" action="adjustVar" actSubType="next"><other varG="${IDS.seen}" op="ass" dblVal="0" boolVal="True" useVar="false" /></data><condLst /></trig></trigLst></dial>`;
    parts.set(
      'story/slides/slide2.xml',
      Buffer.from(slide2.replace('</shapeLst>', `${dial}</shapeLst>`)),
    );
    const { project, report } = convert(parts);
    const slide = slides(project)[1]!;
    const made = named(slide, 'Speed dial');
    expect(made.type).toBe('dial');
    if (made.type !== 'dial') return;
    // Score's default 0 is inside −50…50, so the dial starts there.
    expect(made.props).toMatchObject({ min: -50, max: 50, step: 5, initial: 0 });
    expect(made.props.variable).toBe(project.variables.find((v) => v.name === 'Score')!.id);
    expect(
      slide.triggers.some((t) => t.event.type === 'controlMoves' && t.event.object === made.id),
    ).toBe(true);
    expect(report).toEqual([
      {
        slide: 2,
        outcome: 'approximated',
        what: 'The dial “Speed dial” is drawn as our dial, without its own face',
      },
    ]);
    expect(() => parseProject(JSON.parse(serializeProject(project)))).not.toThrow();
  });
});

describe('tables (B5 part B)', () => {
  it('keeps the grid, each cell’s words and fill, the header row, the padding and the border', () => {
    const { project } = convert();
    const table = named(slides(project)[1]!, 'Prices');
    expect(table.type).toBe('table');
    if (table.type !== 'table') return;
    expect(table.frame).toMatchObject({ x: 500, y: 300, width: 300, height: 120 });
    // Shares as stored: columns 200 and 100, rows 40 and 80.
    expect(table.props.columns).toEqual([200, 100]);
    expect(table.props.rows.map((row) => row.height)).toEqual([40, 80]);
    expect(table.props.rows.map((row) => row.cells.map((c) => JSON.stringify(c.text)))).toEqual([
      [expect.stringContaining('Item'), expect.stringContaining('Price')],
      [expect.stringContaining('Tea'), expect.stringContaining('£2')],
    ]);
    expect(JSON.stringify(table.props.rows[0]!.cells[0]!.text)).toContain('"bold"');
    expect(table.props.rows[0]!.cells[0]!.fill).toBe('#ffcc00');
    expect(table.props.rows[1]!.cells[0]!.fill).toBeNull();
    expect(table.props).toMatchObject({
      headerRow: true,
      headerColumn: false,
      bandFill: null,
      borderColor: { theme: 'accent2' },
      borderWidth: 2,
      padding: 6,
    });
  });

  it('reports merged cells, which ours show unmerged', () => {
    const parts = testStoryParts();
    const slide2 = parts.get('story/slides/slide2.xml')!.toString('utf8');
    parts.set(
      'story/slides/slide2.xml',
      Buffer.from(slide2.replace('columnSpan="1"', 'columnSpan="2"')),
    );
    const { report } = convert(parts);
    expect(report).toEqual([
      {
        slide: 2,
        outcome: 'approximated',
        what: 'The table “Prices” has merged cells, which are shown unmerged',
      },
    ]);
  });
});

describe('a group whose parts move, and copies of one file (B5 part B)', () => {
  it('keeps a group whose parts animate whole, each with its own timing and animations (B8)', () => {
    const parts = testStoryParts();
    const slide2 = parts.get('story/slides/slide2.xml')!.toString('utf8');
    // A group that flies in, of a still shape and one that fades out on its own.
    const group =
      `<group g="20000000-0000-4000-8000-000000000001" name="Pair" zOrder="9"><sldSz w="960" h="540" /><loc l="0" t="0" r="200" b="100" />` +
      `<animEffect><entr><fly dur="PT2S" dir="b" /></entr></animEffect>` +
      `<childLst><g>20000000-0000-4000-8000-000000000002</g><g>20000000-0000-4000-8000-000000000003</g></childLst></group>` +
      `<rect g="20000000-0000-4000-8000-000000000002" parentG="20000000-0000-4000-8000-000000000001" name="Still" zOrder="10"><sldSz w="960" h="540" /><loc l="0" t="0" r="90" b="100" /></rect>` +
      `<rect g="20000000-0000-4000-8000-000000000003" parentG="20000000-0000-4000-8000-000000000001" name="Fading" zOrder="11"><tmCtxLst version="2"><tmCtx start="4000" dur="2000" untilEnd="false" /></tmCtxLst><sldSz w="960" h="540" /><loc l="110" t="0" r="200" b="100" />` +
      `<animEffect><exit><fade dur="PT1S" /></exit></animEffect></rect>`;
    parts.set(
      'story/slides/slide2.xml',
      Buffer.from(slide2.replace('</shapeLst>', `${group}</shapeLst>`)),
    );
    const { project, report } = convert(parts);
    const slide = slides(project)[1]!;
    const pair = named(slide, 'Pair');
    expect(pair.type).toBe('group');
    if (pair.type !== 'group') return;
    expect(pair.children.map((child) => child.name)).toEqual(['Still', 'Fading']);
    // The group flies in; one part fades out on its own, by its own time (4 s to 6 s).
    expect(pair.animations.entrance).toMatchObject({ kind: 'fly', duration: 2 });
    const [still, fading] = pair.children;
    expect(still!.animations.entrance).toBeNull();
    expect(fading!.animations.exit).toMatchObject({ kind: 'fade', duration: 1 });
    expect(fading!.timing).toEqual({ start: 4, duration: 2 });
    expect(report).toEqual([]);
    expect(() => parseProject(JSON.parse(serializeProject(project)))).not.toThrow();
  });

  it('counts no guess where the files that fit are copies of the same bytes', () => {
    const story =
      '<story><media g="11111111-1111-4111-8111-111111111111" type="Png" displayName="a.png" bytes="10" /></story>';
    const pkg = (crcs: Map<string, number>) => ({
      xml: new Map([
        ['story/story.xml', story],
        [
          'story/slides/slide.xml',
          '<sld><pic assetG="11111111-1111-4111-8111-111111111111" /></sld>',
        ],
        [
          'story/slides/_rels/slide.xml.rels',
          '<Relationships><Relationship Type="media" Target="/story/media/Rx.png" Id="R1" /><Relationship Type="media" Target="/story/media/Ry.png" Id="R2" /></Relationships>',
        ],
      ]),
      media: new Map([
        ['story/media/Rx.png', 10],
        ['story/media/Ry.png', 10],
      ]),
      crcs,
    });
    const same = new Map([
      ['story/media/Rx.png', 1234],
      ['story/media/Ry.png', 1234],
    ]);
    const differ = new Map([
      ['story/media/Rx.png', 1234],
      ['story/media/Ry.png', 5678],
    ]);
    expect(resolveMedia(pkg(same)).guessed).toBe(0);
    // Same-sized files that differ, with or without CRCs: since B5 part C the slide's order
    // settles it (it uses the picture once, and lists Rx first), so no guess is left.
    expect(resolveMedia(pkg(differ)).guessed).toBe(0);
    expect(resolveMedia(pkg(differ)).files.get('11111111-1111-4111-8111-111111111111')).toBe(
      'story/media/Rx.png',
    );
    expect(resolveMedia({ ...pkg(same), crcs: undefined }).guessed).toBe(0);
  });
});

describe('finding media files: ties and unknown sizes (B5 part B)', () => {
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';
  const C = '33333333-3333-4333-8333-333333333333';
  const rels = (...targets: string[]) =>
    `<Relationships>${targets.map((t, i) => `<Relationship Type="media" Target="/story/media/${t}" Id="R${i}" />`).join('')}</Relationships>`;

  it('gives n items sharing the same n same-sized files each its own, in the order the slide uses and lists them', () => {
    const pkg = {
      xml: new Map([
        [
          'story/story.xml',
          `<story><media g="${A}" type="Png" displayName="frame6.png" bytes="10" /><media g="${B}" type="Png" displayName="frame22.png" bytes="10" /></story>`,
        ],
        // The slide uses A first, then B; its relationships list Rq before Rp.
        ['story/slides/slide.xml', `<sld><pic assetG="${A}" /><pic assetG="${B}" /></sld>`],
        ['story/slides/_rels/slide.xml.rels', rels('Rq.png', 'Rp.png')],
      ]),
      media: new Map([
        ['story/media/Rp.png', 10],
        ['story/media/Rq.png', 10],
      ]),
      crcs: new Map([
        ['story/media/Rp.png', 1],
        ['story/media/Rq.png', 2],
      ]),
    };
    const resolved = resolveMedia(pkg);
    expect(resolved.files.get(A)).toBe('story/media/Rq.png');
    expect(resolved.files.get(B)).toBe('story/media/Rp.png');
    expect(resolved.guessed).toBe(0);
  });

  it('gives an item with no recorded size the one file no other item could be, and ignores thumbnails', () => {
    const pkg = {
      xml: new Map([
        [
          'story/story.xml',
          `<story><media g="${A}" type="Png" displayName="logo.png" bytes="10" /><media g="${B}" type="Jpeg" displayName="" bytes="0" /><media g="${C}" type="Jpeg" displayName="" bytes="0" /></story>`,
        ],
        // C is only the slide's thumbnail.
        [
          'story/slides/slide.xml',
          `<sld thumbG="${C}"><pic assetG="${A}" /><pic assetG="${B}" /></sld>`,
        ],
        ['story/slides/_rels/slide.xml.rels', rels('Rlogo.png', 'Rphoto.jpg')],
      ]),
      media: new Map([
        ['story/media/Rlogo.png', 10],
        ['story/media/Rphoto.jpg', 5000],
      ]),
    };
    const resolved = resolveMedia(pkg);
    expect(resolved.files.get(A)).toBe('story/media/Rlogo.png');
    expect(resolved.files.get(B)).toBe('story/media/Rphoto.jpg');
    expect(resolved.files.has(C)).toBe(false);
    expect(resolved.guessed).toBe(0);
  });
});

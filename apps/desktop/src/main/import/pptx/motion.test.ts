import { parseProject, serializeProject } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { convertPptx } from './convert';
import { buildDeck, para, spShape } from './test-deck';
import type { TestSlide } from './test-deck';

/** Transitions and animations (docs/briefs/P11.1-pptx-import.md, part C). */

const EMU = 9525;
const box = (x: number, y: number, w: number, h: number) => ({
  x: x * EMU,
  y: y * EMU,
  cx: w * EMU,
  cy: h * EMU,
});

function convert(slides: TestSlide[]) {
  return convertPptx(buildDeck({ slides }), {
    fileName: 'Deck',
    storePicture: () => ({ hash: 'c'.repeat(64) }),
  });
}

/** A slide whose XML gets `extra` after its shapes (`p:transition`, `p:timing`). */
const withExtra = (shapes: string, extra: string): TestSlide => ({
  shapes: `${shapes}</p:spTree></p:cSld>${extra}<p:cSld><p:spTree>`,
});

const shapes = [1, 2, 3]
  .map((n) =>
    spShape({
      id: 10 + n,
      name: `Box ${n}`,
      box: box(100 * n, 100, 80, 80),
      fill: '<a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>',
      paragraphs: para(`B${n}`),
    }),
  )
  .join('');

/** One effect of the main sequence, as PowerPoint nests it. */
function effect(options: {
  shape: number;
  node: 'clickEffect' | 'withEffect' | 'afterEffect';
  presetClass: string;
  presetId: number;
  subtype?: number;
  dur?: number;
  delay?: number;
  path?: string;
}): string {
  const behaviour = options.path
    ? `<p:animMotion origin="layout" path="${options.path}"><p:cBhvr><p:cTn id="99" dur="${options.dur ?? 500}"/><p:tgtEl><p:spTgt spid="${options.shape}"/></p:tgtEl></p:cBhvr></p:animMotion>`
    : `<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="99" dur="${options.dur ?? 500}"/><p:tgtEl><p:spTgt spid="${options.shape}"/></p:tgtEl></p:cBhvr></p:animEffect>`;
  return `<p:par><p:cTn id="5" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="6" presetID="${options.presetId}" presetClass="${options.presetClass}" presetSubtype="${options.subtype ?? 0}" fill="hold" nodeType="${options.node}"${options.delay ? ` delay="${options.delay}"` : ''}><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${behaviour}</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>`;
}

const timing = (effects: string) =>
  `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${effects}</p:childTnLst></p:cTn></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;

describe('slide transitions', () => {
  it('map to ours with their direction and duration, reading newer transitions’ exact length or their fallback', () => {
    const { project, report } = convert([
      withExtra('', '<p:transition spd="fast"><p:push dir="u"/></p:transition>'),
      withExtra(
        '',
        '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" Requires="p14"><p:transition spd="slow" p14:dur="1600"><p:wipe dir="r"/></p:transition></mc:Choice><mc:Fallback><p:transition spd="slow"><p:wipe dir="r"/></p:transition></mc:Fallback></mc:AlternateContent>',
      ),
      withExtra('', '<p:transition><p:split orient="vert" dir="out"/></p:transition>'),
      withExtra('', '<p:transition><p:circle/></p:transition>'),
      withExtra('', '<p:transition><p:dissolve/></p:transition>'),
      { shapes: '' },
    ]);
    expect(project.scenes[0]!.slides.map((slide) => slide.properties.transition)).toEqual([
      { kind: 'push', duration: 0.5, direction: 'bottom' },
      { kind: 'wipe', duration: 1.6, direction: 'left' },
      { kind: 'split', duration: 0.75, direction: 'vertical' },
      { kind: 'iris', duration: 0.75, direction: null },
      { kind: 'fade', duration: 0.75, direction: null },
      null,
    ]);
    expect(report).toEqual([
      { slide: 5, outcome: 'approximated', what: "The slide's “dissolve” transition is a fade" },
    ]);
  });
});

describe('animations', () => {
  it('lay the main sequence on the timeline in order: on click after the last, with, and after previous', () => {
    const { project, report } = convert([
      withExtra(
        shapes,
        timing(
          effect({ shape: 11, node: 'clickEffect', presetClass: 'entr', presetId: 10, dur: 1000 }) +
            effect({
              shape: 12,
              node: 'withEffect',
              presetClass: 'entr',
              presetId: 2,
              subtype: 8,
              dur: 500,
            }) +
            effect({
              shape: 13,
              node: 'afterEffect',
              presetClass: 'entr',
              presetId: 22,
              subtype: 4,
              dur: 2000,
              delay: 250,
            }) +
            effect({ shape: 11, node: 'clickEffect', presetClass: 'exit', presetId: 10, dur: 500 }),
        ),
      ),
    ]);
    const [first, second, third] = project.scenes[0]!.slides[0]!.baseLayer.objects;
    // Fade in at 0 for 1 s; Fly from the left with it; Wipe from the bottom after it, 0.25 s late.
    expect(first!.timing.start).toBe(0);
    expect(first!.animations.entrance).toEqual({
      kind: 'fade',
      duration: 1,
      direction: null,
      byParagraph: false,
    });
    expect(second!.timing.start).toBe(0);
    expect(second!.animations.entrance).toMatchObject({
      kind: 'fly',
      direction: 'left',
      duration: 0.5,
    });
    expect(third!.timing.start).toBe(0.75);
    expect(third!.animations.entrance).toMatchObject({
      kind: 'wipe',
      direction: 'bottom',
      duration: 2,
    });
    // The exit, on the next click: after everything so far (2.75 s), so Box 1 lasts until 3.25 s.
    expect(first!.animations.exit).toMatchObject({ kind: 'fade', duration: 0.5 });
    expect(first!.timing.duration).toBe(3.25);
    expect(project.scenes[0]!.slides[0]!.baseLayer.timeline.duration).toBeGreaterThanOrEqual(5);
    expect(report).toEqual([
      {
        slide: 1,
        outcome: 'approximated',
        what: 'Animations started by clicks play in their order on the slide’s timeline',
      },
    ]);
    expect(() => parseProject(JSON.parse(serializeProject(project)))).not.toThrow();
  });

  it('bring motion paths across as ours, and report emphasis, effects we lack, and a timeline that grows', () => {
    const { project, report } = convert([
      withExtra(
        shapes,
        timing(
          effect({
            shape: 11,
            node: 'afterEffect',
            presetClass: 'path',
            presetId: 0,
            dur: 3000,
            path: 'M 0 0 L 0.25 0.5 E',
          }) +
            effect({
              shape: 12,
              node: 'afterEffect',
              presetClass: 'path',
              presetId: 0,
              dur: 1000,
              path: 'M 0 0 C 0.1 0 0.2 0.1 0.25 0.25 L 0.5 0 E',
            }) +
            effect({ shape: 13, node: 'afterEffect', presetClass: 'emph', presetId: 8, dur: 500 }) +
            effect({
              shape: 13,
              node: 'afterEffect',
              presetClass: 'entr',
              presetId: 37,
              dur: 2000,
            }),
        ),
      ),
    ]);
    const slide = project.scenes[0]!.slides[0]!;
    const [first, second, third] = slide.baseLayer.objects;
    expect(first!.animations.motionPaths).toEqual([
      expect.objectContaining({
        shape: 'line',
        points: [
          { x: 0, y: 0 },
          { x: 320, y: 360 },
        ],
        duration: 3,
        easing: 'linear',
      }),
    ]);
    // A curve keeps its ends only.
    expect(second!.animations.motionPaths[0]).toMatchObject({
      shape: 'freeform',
      points: [
        { x: 0, y: 0 },
        { x: 320, y: 180 },
        { x: 640, y: 0 },
      ],
    });
    expect(third!.animations.entrance).toMatchObject({ kind: 'fade' });
    // 3 + 1 + 0.5 + 2 = 6.5 s: the timeline grows to hold it.
    expect(slide.baseLayer.timeline.duration).toBe(6.5);
    expect(report).toEqual([
      { slide: 1, outcome: 'skipped', what: "“Box 3”'s emphasis effect" },
      { slide: 1, outcome: 'approximated', what: "“Box 3”'s entrance is shown as fade" },
    ]);
  });
});

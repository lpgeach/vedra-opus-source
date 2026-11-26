import { parseProject, serializeProject } from '@vedraopus/model';
import type { ImageObject, ShapeObject, TextObject } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { convertPptx } from './convert';
import { buildDeck, para, PIXEL_PNG, placeholderShape, spShape } from './test-deck';
import type { TestDeck } from './test-deck';

/** Masters, layouts and backgrounds (docs/briefs/P11.1-pptx-import.md, part B). */

const EMU = 9525;
const box = (x: number, y: number, w: number, h: number) => ({
  x: x * EMU,
  y: y * EMU,
  cx: w * EMU,
  cy: h * EMU,
});

function convert(deck: TestDeck) {
  return convertPptx(buildDeck(deck), {
    fileName: 'Deck',
    storePicture: () => ({ hash: 'b'.repeat(64) }),
  });
}

const layoutPlaceholders =
  placeholderShape('title', null, box(50, 30, 860, 80), 'Title 1') +
  placeholderShape('body', '1', box(50, 140, 860, 360), 'Content Placeholder 2');
const logo = spShape({
  id: 40,
  name: 'Logo bar',
  box: box(0, 500, 960, 40),
  fill: '<a:solidFill><a:schemeClr val="accent1"/></a:solidFill>',
});

describe('masters and layouts', () => {
  it('become ours, before the feedback master, with the layout’s placeholders, and each slide uses its layout', () => {
    const { project } = convert({
      layoutShapes: layoutPlaceholders,
      masterShapes: logo,
      slides: [
        {
          shapes: spShape({
            id: 2,
            name: 'Title 1',
            box: box(0, 0, 0, 0),
            ph: '<p:ph type="title"/>',
            paragraphs: para('Hello'),
          }).replace(/<a:xfrm><a:off[^]*?<\/a:xfrm>/, ''),
        },
      ],
    });
    const [master, feedback] = project.masters;
    expect(master!).toMatchObject({ name: 'Office Theme', kind: 'slide' });
    expect(feedback!.kind).toBe('feedback');
    const [layout] = master!.layouts;
    expect(layout!.name).toBe('Title and Content');
    const slide = project.scenes[0]!.slides[0]!;
    expect(slide.layoutId).toBe(layout!.id);
    // The layout: the master's logo bar, then its title and content placeholders where it puts them.
    const objects = layout!.layer.objects;
    expect(objects.map((object) => object.name)).toEqual([
      'Logo bar',
      'Title Placeholder',
      'Content Placeholder',
    ]);
    expect((objects[1] as TextObject).props.placeholder).toBe('title');
    expect(objects[1]!.frame).toMatchObject({ x: 50, y: 30, width: 860, height: 80 });
    expect((objects[2] as TextObject).props.placeholder).toBe('content');
    // The master's own layer holds only its background (it has none here).
    expect(master!.layer.objects).toEqual([]);
    // The slide's title is its copy of the layout's title placeholder, at the layout's place.
    const title = slide.baseLayer.objects[0] as TextObject;
    expect(title.props.placeholder).toBe('title');
    expect(title.frame).toMatchObject({ x: 50, y: 30 });
    expect(() => parseProject(JSON.parse(serializeProject(project)))).not.toThrow();
  });

  it('leave the master’s shapes out of a layout that hides them', () => {
    const { project } = convert({
      layoutShapes: layoutPlaceholders,
      layoutAttrs: ' showMasterSp="0"',
      masterShapes: logo,
      slides: [{ shapes: '' }],
    });
    expect(project.masters[0]!.layouts[0]!.layer.objects.map((object) => object.name)).toEqual([
      'Title Placeholder',
      'Content Placeholder',
    ]);
  });
});

describe('backgrounds', () => {
  it('go at the bottom of the master, layout or slide: a colour, a gradient or a picture, locked and decorative', () => {
    const { project } = convert({
      masterBackground:
        '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="F2F2F2"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>',
      layoutBackground:
        '<p:bg><p:bgPr><a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="FFFFFF"/></a:gs><a:gs pos="100000"><a:schemeClr val="accent1"/></a:gs></a:gsLst><a:lin ang="5400000"/></a:gradFill></p:bgPr></p:bg>',
      slides: [
        {
          shapes: spShape({
            id: 2,
            name: 'Words',
            box: box(10, 10, 100, 50),
            textBox: true,
            paragraphs: para('Hi'),
          }),
          background:
            '<p:bg><p:bgPr><a:blipFill><a:blip r:embed="rId7"/><a:stretch/></a:blipFill></p:bgPr></p:bg>',
          rels: { rId7: '../media/image1.png' },
        },
        {
          shapes: '',
          background: '<p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>',
        },
      ],
      media: { 'ppt/media/image1.png': PIXEL_PNG },
    });
    const full = { x: 0, y: 0, width: 1280, height: 720, rotation: 0 };
    const masterBg = project.masters[0]!.layer.objects[0] as ShapeObject;
    expect(masterBg.name).toBe('Background');
    expect(masterBg.frame).toEqual(full);
    expect(masterBg.locked).toBe(true);
    expect(masterBg.a11y.visibleToAssistiveTech).toBe(false);
    expect(masterBg.props.appearance.fill).toEqual({ kind: 'solid', color: '#f2f2f2' });
    const layoutBg = project.masters[0]!.layouts[0]!.layer.objects[0] as ShapeObject;
    expect(layoutBg.props.appearance.fill.kind).toBe('gradient');
    const [first, second] = project.scenes[0]!.slides;
    const slideBg = first!.baseLayer.objects[0] as ImageObject;
    expect(slideBg.type).toBe('image');
    expect(slideBg.frame).toEqual(full);
    expect(first!.baseLayer.objects[1]!.name).toBe('Words');
    // A theme background reference: its colour.
    expect((second!.baseLayer.objects[0] as ShapeObject).props.appearance.fill).toEqual({
      kind: 'solid',
      color: { theme: 'background' },
    });
  });
});

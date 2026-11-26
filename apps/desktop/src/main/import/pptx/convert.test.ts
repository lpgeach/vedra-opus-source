import { parseProject, serializeProject } from '@vedraopus/model';
import type {
  GroupObject,
  ImageObject,
  SceneObject,
  ShapeObject,
  TableObject,
  TextObject,
} from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { convertPptx } from './convert';
import { buildDeck, para, PIXEL_PNG, spShape } from './test-deck';
import type { TestDeck } from './test-deck';
import { PptxError } from './xml';

/** The PowerPoint reader (docs/briefs/P11.1-pptx-import.md, part A). */

const EMU = 9525;
const box = (x: number, y: number, w: number, h: number) => ({
  x: x * EMU,
  y: y * EMU,
  cx: w * EMU,
  cy: h * EMU,
});

function convert(deck: TestDeck) {
  const stored: { name: string; ext: string }[] = [];
  const result = convertPptx(buildDeck(deck), {
    fileName: 'Safety deck',
    storePicture: ({ name, ext }) => {
      stored.push({ name, ext });
      return { hash: `${'a'.repeat(63)}${stored.length}` };
    },
  });
  return {
    ...result,
    stored,
    objects: (n = 0) => result.project.scenes[0]!.slides[n]!.baseLayer.objects,
  };
}

const textOf = (object: SceneObject) => JSON.stringify((object as TextObject).props.text);

describe('the deck as a course', () => {
  it('takes the slide size, theme colours and fonts, the deck title, and each slide in order', () => {
    const { project, report } = convert({
      title: 'Working safely',
      size: { cx: 9144000, cy: 6858000 },
      slides: [{ shapes: '' }, { shapes: '' }],
    });
    expect(project.title).toBe('Working safely');
    expect(project.stage).toEqual({ width: 960, height: 720 });
    expect(project.theme.colors).toMatchObject({
      text: '#000000',
      background: '#ffffff',
      accent1: '#2e75b6',
      accent6: '#538135',
    });
    expect(project.theme.fonts).toEqual({ heading: 'Georgia', body: 'Verdana' });
    expect(project.scenes[0]!.slides.map((slide) => slide.title)).toEqual(['Slide 1', 'Slide 2']);
    expect(report).toEqual([]);
    // A project the model accepts.
    expect(() => parseProject(JSON.parse(serializeProject(project)))).not.toThrow();
  });

  it('falls back to the file name, and refuses what is not a presentation, saying why', () => {
    expect(convert({ slides: [{ shapes: '' }] }).project.title).toBe('Safety deck');
    const reason = (parts: Map<string, Uint8Array>) => {
      try {
        convertPptx(parts, { fileName: 'x', storePicture: () => ({ hash: 'a'.repeat(64) }) });
        return '';
      } catch (error) {
        if (error instanceof PptxError) return error.message;
        throw error;
      }
    };
    expect(reason(new Map())).toMatch(/not a PowerPoint/);
    const empty = buildDeck({ slides: [] });
    expect(reason(empty)).toMatch(/no slides/);
  });
});

describe('text', () => {
  it('keeps runs with bold, italic, underline, strike, size, colour and font; paragraphs aligned', () => {
    const { objects } = convert({
      slides: [
        {
          shapes: spShape({
            id: 2,
            name: 'Text 1',
            box: box(100, 100, 400, 100),
            textBox: true,
            paragraphs:
              '<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-GB" b="1" i="1" sz="2400"><a:solidFill><a:schemeClr val="accent2"/></a:solidFill><a:latin typeface="+mj-lt"/></a:rPr><a:t>Stop</a:t></a:r><a:r><a:rPr lang="en-GB" u="sng" strike="sngStrike"/><a:t> now</a:t></a:r><a:br/><a:r><a:rPr lang="en-GB"/><a:t>Look</a:t></a:r></a:p>',
          }),
        },
      ],
    });
    const [text] = objects();
    expect(text!.type).toBe('text');
    expect(text!.frame).toMatchObject({ x: 100, y: 100, width: 400, height: 100 });
    const paragraph = (text as TextObject).props.text.content[0]!;
    expect(paragraph.attrs).toEqual({ textAlign: 'center' });
    expect(paragraph.content).toEqual([
      {
        type: 'text',
        text: 'Stop',
        marks: [
          { type: 'bold' },
          { type: 'italic' },
          {
            type: 'textStyle',
            attrs: { fontSize: 32, color: { theme: 'accent2' }, fontFamily: 'heading' },
          },
        ],
      },
      {
        type: 'text',
        text: ' now',
        marks: [
          { type: 'underline' },
          { type: 'strike' },
          { type: 'textStyle', attrs: { fontSize: 24 } },
        ],
      },
      { type: 'hardBreak' },
      { type: 'text', text: 'Look', marks: [{ type: 'textStyle', attrs: { fontSize: 24 } }] },
    ]);
  });

  it('gives a body placeholder its master’s bullets, nested by level, its position from the master, and the title to the slide', () => {
    const { objects, project } = convert({
      slides: [
        {
          shapes:
            spShape({
              id: 2,
              name: 'Title 1',
              box: box(0, 0, 0, 0),
              ph: '<p:ph type="title"/>',
              paragraphs: para('Fire drill'),
            }).replace(/<a:xfrm><a:off[^]*?<\/a:xfrm>/, '') +
            spShape({
              id: 3,
              name: 'Content 2',
              box: box(0, 0, 0, 0),
              ph: '<p:ph idx="1"/>',
              paragraphs:
                para('Leave') +
                para('Calmly', undefined, '<a:pPr lvl="1"/>') +
                para('Gather') +
                para('Plain', undefined, '<a:pPr><a:buNone/></a:pPr>'),
            }).replace(/<a:xfrm><a:off[^]*?<\/a:xfrm>/, ''),
        },
      ],
    });
    expect(project.scenes[0]!.slides[0]!.title).toBe('Fire drill');
    const [title, body] = objects();
    // From the master's placeholders: 838200 EMU is 88 pixels.
    expect(title!.frame).toMatchObject({ x: 88, y: 38.33 });
    expect(body!.frame).toMatchObject({ x: 88, y: 191.67 });
    // The title is 44 points (58.67 px) from the master's title style.
    expect(textOf(title!)).toContain('"fontSize":58.67');
    const content = (body as TextObject).props.text.content;
    expect(content.map((node) => node.type)).toEqual(['bulletList', 'paragraph']);
    const list = content[0]!;
    expect(list.content!.map((item) => JSON.stringify(item).match(/"text":"(\w+)"/)![1])).toEqual([
      'Leave',
      'Gather',
    ]);
    // "Calmly" is a level-2 list inside the first item.
    expect(list.content![0]!.content![1]!.type).toBe('bulletList');
    expect(JSON.stringify(list.content![0]!.content![1])).toContain('Calmly');
  });
});

describe('shapes, lines and pictures', () => {
  it('maps preset geometries, fills, gradients and lines; anything else is a rectangle, reported', () => {
    const solid = (hex: string) => `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`;
    const { objects, report } = convert({
      slides: [
        {
          shapes:
            spShape({
              id: 2,
              name: 'Box',
              box: box(0, 0, 200, 100),
              prst: 'roundRect',
              fill: solid('FF0000'),
              line: '<a:ln w="19050"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:prstDash val="dash"/></a:ln>',
            }) +
            spShape({
              id: 3,
              name: 'Oval',
              box: box(0, 0, 100, 100),
              prst: 'ellipse',
              fill: '<a:solidFill><a:schemeClr val="accent1"><a:lumMod val="50000"/></a:schemeClr></a:solidFill>',
            }) +
            spShape({
              id: 4,
              name: 'Gem',
              box: box(0, 0, 100, 100),
              prst: 'diamond',
              fill: '<a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="FFFFFF"/></a:gs><a:gs pos="100000"><a:schemeClr val="accent2"/></a:gs></a:gsLst><a:lin ang="5400000"/></a:gradFill>',
            }) +
            spShape({
              id: 5,
              name: 'Cloud 4',
              box: box(0, 0, 100, 100),
              prst: 'cloud',
              fill: solid('00FF00'),
            }) +
            spShape({
              id: 6,
              name: 'Wedge',
              box: box(0, 0, 100, 100),
              prst: 'rtTriangle',
              fill: solid('0000FF'),
              xfrmAttrs: ' flipH="1" rot="5400000"',
            }),
        },
      ],
    });
    const [rounded, oval, gem, cloud, wedge] = objects() as ShapeObject[];
    expect(rounded!.props.geometry).toEqual({ kind: 'roundRect', radius: 17 });
    expect(rounded!.props.appearance.fill).toEqual({ kind: 'solid', color: '#ff0000' });
    expect(rounded!.props.appearance.stroke).toEqual({
      color: { theme: 'text' },
      width: 2,
      dash: 'dash',
    });
    // Accent 1 at half its lightness is a literal colour, darker than accent 1.
    expect(oval!.props.appearance.fill).toEqual({ kind: 'solid', color: '#173b5b' });
    expect(gem!.props.geometry.kind).toBe('polygon');
    expect(gem!.props.appearance.fill).toEqual({
      kind: 'gradient',
      angle: 90,
      stops: [
        { offset: 0, color: '#ffffff' },
        { offset: 1, color: { theme: 'accent2' } },
      ],
    });
    expect(cloud!.props.geometry).toEqual({ kind: 'rect' });
    expect(report).toEqual([
      {
        slide: 1,
        outcome: 'approximated',
        what: '“Cloud 4” is a cloud shape, drawn as a rectangle',
      },
    ]);
    // Flipped across: the right angle moves to the other side. Turned a quarter.
    expect(wedge!.props.geometry).toEqual({
      kind: 'polygon',
      points: [
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
    });
    expect(wedge!.frame.rotation).toBe(90);
  });

  it('draws a diagonal line or connector as long as its diagonal, turned to its angle, with an arrow where it has one', () => {
    const line = `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="7" name="Arrow 6"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm><a:off x="${100 * EMU}" y="${100 * EMU}"/><a:ext cx="${300 * EMU}" cy="${400 * EMU}"/></a:xfrm><a:prstGeom prst="straightConnector1"><a:avLst/></a:prstGeom><a:ln w="28575"><a:solidFill><a:srgbClr val="C00000"/></a:solidFill><a:tailEnd type="triangle"/></a:ln></p:spPr></p:cxnSp>`;
    const [arrow] = convert({ slides: [{ shapes: line }] }).objects() as ShapeObject[];
    expect(arrow!.props.geometry).toEqual({ kind: 'arrow' });
    // A 300 × 400 diagonal is 500 long, about its middle (250, 300), at atan(400/300).
    expect(arrow!.frame.width).toBe(500);
    expect(arrow!.frame.x).toBe(0);
    expect(arrow!.frame.y).toBe(300);
    expect(arrow!.frame.rotation).toBeCloseTo(53.13, 2);
    expect(arrow!.props.appearance.stroke).toEqual({ color: '#c00000', width: 3, dash: 'solid' });
  });

  it('imports pictures with their crop, alt text and decoration; a picture we cannot show is a reported placeholder', () => {
    const pic = (id: number, relId: string, extra = '', descr = '') =>
      `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id}"${descr ? ` descr="${descr}"` : ''}>${extra}</p:cNvPr><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${relId}"/><a:srcRect l="10000" t="0" r="20000" b="50000"/><a:stretch/></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${200 * EMU}" cy="${100 * EMU}"/></a:xfrm></p:spPr></p:pic>`;
    const { objects, stored, report, drawings } = convert({
      slides: [
        {
          shapes:
            pic(2, 'rId5', '', 'A fire exit') +
            pic(
              3,
              'rId5',
              '<a:extLst><a:ext uri="{C183D7F6}"><adec:decorative xmlns:adec="http://schemas.microsoft.com/office/drawing/2017/decorative" val="1"/></a:ext></a:extLst>',
            ) +
            pic(4, 'rId6'),
          rels: { rId5: '../media/image1.png', rId6: '../media/image2.emf' },
        },
      ],
      media: {
        'ppt/media/image1.png': PIXEL_PNG,
        'ppt/media/image2.emf': new Uint8Array([1, 2, 3]),
      },
    });
    const [described, decorative, emf] = objects();
    expect(described!.type).toBe('image');
    expect((described as ImageObject).props.crop).toEqual({
      x: 0.1,
      y: 0,
      width: 0.7,
      height: 0.5,
    });
    expect(described!.a11y).toEqual({ altText: 'A fire exit', visibleToAssistiveTech: true });
    expect(decorative!.a11y.visibleToAssistiveTech).toBe(false);
    expect(stored).toEqual([
      { name: 'image1.png', ext: 'png' },
      { name: 'image1.png', ext: 'png' },
    ]);
    expect(emf!.type).toBe('shape');
    expect(textOf(emf!)).toContain('[Picture]');
    // Waiting for LibreOffice to draw it (part D); the importer reports how that went.
    expect(drawings.map((d) => [d.slide, d.what, d.objectId])).toEqual([
      [1, '“Picture 4” is a EMF picture', emf!.id],
    ]);
    expect(report).toEqual([]);
  });
});

describe('tables, groups, charts and notes', () => {
  it('reads a table: column widths, row heights, the header row, cell words and fills', () => {
    const cell = (words: string, fill = '') =>
      `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${para(words)}</a:txBody><a:tcPr>${fill}</a:tcPr></a:tc>`;
    const table = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="4" name="Table 3"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/><a:ext cx="${400 * EMU}" cy="${100 * EMU}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid><a:gridCol w="${100 * EMU}"/><a:gridCol w="${300 * EMU}"/></a:tblGrid><a:tr h="${40 * EMU}">${cell('Exit')}${cell('Where')}</a:tr><a:tr h="${60 * EMU}">${cell('A', '<a:solidFill><a:srgbClr val="FFFF00"/></a:solidFill>')}${cell('North')}</a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
    const [made] = convert({ slides: [{ shapes: table }] }).objects();
    const t = made as TableObject;
    expect(t.type).toBe('table');
    expect(t.name).toBe('Table 3');
    expect(t.props.columns).toEqual([0.25, 0.75]);
    expect(t.props.rows.map((row) => row.height)).toEqual([0.4, 0.6]);
    expect(t.props.headerRow).toBe(true);
    expect(JSON.stringify(t.props.rows[1]!.cells[1]!.text)).toContain('North');
    expect(t.props.rows[1]!.cells[0]!.fill).toBe('#ffff00');
  });

  it('places a group’s parts through its child space, and leaves a chart in a stand-in to be drawn', () => {
    const group = `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="5" name="Group 4"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${100 * EMU}" y="${100 * EMU}"/><a:ext cx="${200 * EMU}" cy="${200 * EMU}"/><a:chOff x="0" y="0"/><a:chExt cx="${100 * EMU}" cy="${100 * EMU}"/></a:xfrm></p:grpSpPr>${spShape(
      {
        id: 6,
        name: 'Inner',
        box: box(50, 50, 50, 50),
        fill: '<a:solidFill><a:srgbClr val="000000"/></a:solidFill>',
      },
    )}</p:grpSp>`;
    const chart = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="8" name="Chart 7"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="${400 * EMU}"/><a:ext cx="${300 * EMU}" cy="${200 * EMU}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId9"/></a:graphicData></a:graphic></p:graphicFrame>`;
    const { objects, report, drawings } = convert({ slides: [{ shapes: group + chart }] });
    const [made, chartBox] = objects();
    expect(made!.type).toBe('group');
    // Child (50, 50) in a 100-wide child space mapped onto 200 wide at (100, 100): (200, 200), 100 square.
    expect((made as GroupObject).children[0]!.frame).toMatchObject({
      x: 200,
      y: 200,
      width: 100,
      height: 100,
    });
    expect(chartBox!.frame).toMatchObject({ x: 0, y: 400, width: 300, height: 200 });
    expect(textOf(chartBox!)).toContain('[Chart]');
    expect(drawings.map((d) => [d.what, d.objectId])).toEqual([
      ['“Chart 7” is a chart', chartBox!.id],
    ]);
    expect(report).toEqual([]);
  });

  it('brings each slide’s notes, and says when a slide was hidden', () => {
    const { project, report } = convert({
      slides: [
        { shapes: '', notes: 'Remember the drill' },
        { shapes: '', hidden: true },
      ],
    });
    expect(JSON.stringify(project.scenes[0]!.slides[0]!.notes)).toContain('Remember the drill');
    expect(report).toEqual([
      {
        slide: 2,
        outcome: 'approximated',
        what: 'The slide is hidden in PowerPoint; it is shown here',
      },
    ]);
  });
});

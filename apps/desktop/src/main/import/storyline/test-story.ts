/**
 * A small `.story` course made by our own code, for tests (docs/briefs/B5-storyline-import.md):
 * the parts of the format the importer reads, in the shapes the sample courses use.
 * Nothing in it comes from Articulate.
 */
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { ZipFile } from 'yazl';

/** A 1 × 1 PNG. */
export const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

export const IDS = {
  scene: '10000000-0000-4000-8000-000000000001',
  slide1: '10000000-0000-4000-8000-000000000011',
  slide2: '10000000-0000-4000-8000-000000000012',
  layout: '10000000-0000-4000-8000-000000000021',
  layoutInternal: '10000000-0000-4000-8000-000000000022',
  master: '10000000-0000-4000-8000-000000000023',
  picture: '10000000-0000-4000-8000-000000000031',
  title: '10000000-0000-4000-8000-000000000041',
  button: '10000000-0000-4000-8000-000000000042',
  photo: '10000000-0000-4000-8000-000000000043',
  logo: '10000000-0000-4000-8000-000000000044',
  layer: '10000000-0000-4000-8000-000000000051',
  layerText: '10000000-0000-4000-8000-000000000052',
  seen: '10000000-0000-4000-8000-000000000061',
  score: '10000000-0000-4000-8000-000000000062',
  back: '10000000-0000-4000-8000-000000000071',
  slider: '10000000-0000-4000-8000-000000000072',
  table: '10000000-0000-4000-8000-000000000074',
  rocket: '10000000-0000-4000-8000-000000000081',
  rocketLine: '10000000-0000-4000-8000-000000000082',
  rocketFree: '10000000-0000-4000-8000-000000000083',
};

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** An object's rich text, as the escaped document the format stores. */
function richText(
  paragraphs: { text: string; bold?: boolean; size?: number; colour?: string; align?: string }[],
) {
  const blocks = paragraphs
    .map(
      (each) =>
        `<Block><Style Justification="${each.align ?? 'Left'}" SpacingBefore="0" SpacingAfter="0"><ListStyle ListType="None" /></Style>` +
        `<Span Text="${escape(each.text)}"><Style FontIsBold="${each.bold ? 'True' : 'False'}" FontIsItalic="False"${each.size ? ` FontSize="${each.size}"` : ''}${each.colour ? ` ForegroundColor="${each.colour}"` : ''} /></Span></Block>`,
    )
    .join('');
  return escape(`<Document><Content>${blocks}</Content></Document>`);
}

const timing = (start = 0, untilEnd = true) =>
  `<tmCtxLst version="1"><tmCtx start="${start}" dur="5000" untilEnd="${untilEnd}" /></tmCtxLst>`;
const loc = (l: number, t: number, r: number, b: number) =>
  `<sldSz w="960" h="540" /><loc l="${l}" t="${t}" r="${r}" b="${b}" />`;
const fill = (colour: string) =>
  `<bG><solidFill><clr><schemeClr val="${colour}" /></clr></solidFill><noLine /></bG>`;

function trigger(event: string, action: string, inner: string, conditions = '') {
  return (
    `<trig g="${randomUUID()}" type="user"><data enabled="true" event="${event}" action="${action}" actSubType="next">${inner}</data>` +
    `<condLst>${conditions}</condLst></trig>`
  );
}

/** A table cell: its rich text in `text`, and a fill in its style. */
const cell = (words: string, fillColour: string, bold = false) =>
  `<tableCell rowSpan="1" columnSpan="1" verticalMerge="false" horizontalMerge="false" text="${richText([{ text: words, bold }])}">` +
  `<style>${fillColour ? `<background><fillColor><srgbClr val="${fillColour.slice(1)}" /></fillColor></background>` : ''}` +
  `<bottomBorder dashType="Solid" weight="2"><themeColor><schemeClr val="accent2" /></themeColor></bottomBorder><margins l="6" t="0" r="6" b="0" /></style></tableCell>`;

/** Every part of the test course, by name. */
export function testStoryParts(): Map<string, Buffer> {
  const parts = new Map<string, string | Buffer>();
  parts.set('[Content_Types].xml', '<Types />');
  parts.set(
    '_rels/.rels',
    '<Relationships><Relationship Type="main" Target="/story/story.xml" Id="Rmain" /></Relationships>',
  );
  parts.set(
    'story/story.xml',
    `<story g="${randomUUID()}"><varLst>` +
      `<var g="${IDS.seen}" name="Seen" dataType="bool" val="False" type="user" />` +
      `<var g="${IDS.score}" name="Score" dataType="num" val="0" type="user" />` +
      `<var g="${randomUUID()}" name="Player.DisplayCaptions" dataType="bool" val="false" type="builtIn" />` +
      `</varLst><mediaLst><mediaLst>` +
      `<media g="${IDS.picture}" type="Png" displayName="dot.png" bytes="${PIXEL_PNG.length}" />` +
      `</mediaLst></mediaLst><sceneLst><scene g="${IDS.scene}" name="Getting started"><sldIdLst><sldId>Rs1</sldId><sldId>Rs2</sldId></sldIdLst></scene></sceneLst></story>`,
  );
  parts.set(
    'story/_rels/story.xml.rels',
    '<Relationships><Relationship Type="slide" Target="/story/slides/slide.xml" Id="Rs1" /><Relationship Type="slide" Target="/story/slides/slide2.xml" Id="Rs2" /></Relationships>',
  );
  parts.set(
    'story/slideMasters/slideMaster.xml',
    `<master g="${IDS.master}" name="Plain"><bg><solidFill><clr><srgbClr val="102030" /></clr></solidFill></bg>` +
      `<shapeLst><textBox g="${IDS.logo}" name="Logo text" zOrder="0">${timing()}${loc(20, 500, 200, 530)}` +
      `<text>${richText([{ text: 'Our logo' }])}</text><plain>Our logo</plain></textBox></shapeLst>` +
      `<clrLst><dk1><srgbClr val="111111" /></dk1><lt1><srgbClr val="FFFFFF" /></lt1><accent1><srgbClr val="FF8800" /></accent1><accent2><srgbClr val="0088FF" /></accent2></clrLst></master>`,
  );
  parts.set(
    'story/slideMasters/_rels/slideMaster.xml.rels',
    '<Relationships><Relationship Type="slideLayout" Target="/story/slideLayouts/slideLayout.xml" Id="Rl1" /></Relationships>',
  );
  parts.set(
    'story/slideLayouts/slideLayout.xml',
    `<layout g="${IDS.layout}" internalG="${IDS.layoutInternal}" name="Blank"><shapeLst /></layout>`,
  );
  // Slide 1: a title, a button with states, a picture, a layer, and triggers between them.
  parts.set(
    'story/slides/slide.xml',
    `<sld g="${IDS.slide1}" name="Welcome" layoutG="${IDS.layoutInternal}">` +
      `<tmProps min="8000" /><szCalc><currSz w="960" h="540" /></szCalc>` +
      `<shapeLst>` +
      `<textBox g="${IDS.title}" name="Title" zOrder="0">${timing()}<animEffect><entr><fly dur="PT0.75S" dir="b" /></entr></animEffect>${loc(40, 30, 900, 90)}` +
      `<text>${richText([{ text: 'Welcome aboard', bold: true, size: 30, colour: '#FFCC00' }])}</text><plain>Welcome aboard</plain></textBox>` +
      `<rect g="${IDS.button}" name="Next button" zOrder="1" initState="Normal">${timing(1000)}${fill('accent1')}${loc(700, 440, 900, 500)}` +
      `<text>${richText([{ text: 'Continue', align: 'Center' }])}</text><plain>Continue</plain>` +
      `<stateLst>` +
      `<state name="Normal"><shapeLst><rect name="Next button">${fill('accent1')}<text>${richText([{ text: 'Continue', align: 'Center' }])}</text></rect></shapeLst></state>` +
      `<state name="Hover"><shapeLst><rect name="Next button">${fill('accent2')}<text>${richText([{ text: 'Continue', align: 'Center' }])}</text></rect></shapeLst></state>` +
      `<state name="Done"><shapeLst><rect name="Next button">${fill('accent2')}<text>${richText([{ text: 'Done!', align: 'Center' }])}</text></rect></shapeLst></state>` +
      `</stateLst>` +
      `<trigLst>${trigger('OnClick', 'changeShapeState', `<shape setStateG="${IDS.button}" setStateName="Done" />`)}` +
      `${trigger('OnClick', 'jumpToSlide', '<slide />')}</trigLst></rect>` +
      `<pic g="${IDS.photo}" name="Dot" zOrder="2" assetG="${IDS.picture}">${timing()}${loc(40, 120, 240, 320)}` +
      `<trigLst>${trigger('OnClick', 'showSubSlide', `<sldLayer showG="${IDS.layer}" />`)}</trigLst></pic>` +
      `</shapeLst>` +
      `<sldLayerLst><sldLayer g="${IDS.layer}" name="More" modal="true" pause="true"><tmProps min="3000" />` +
      `<shapeLst><textBox g="${IDS.layerText}" name="Detail" zOrder="0">${timing()}${loc(300, 150, 800, 250)}` +
      `<text>${richText([{ text: 'A little more detail.' }])}</text><plain>A little more detail.</plain>` +
      `<trigLst>${trigger('OnClick', 'hideSubSlide', '<sldLayer />').replace('actSubType="next"', 'actSubType="me"')}</trigLst></textBox></shapeLst>` +
      `</sldLayer></sldLayerLst>` +
      `<trigLst>` +
      trigger(
        'OnStart',
        'adjustVar',
        `<other varG="${IDS.score}" op="add" dblVal="1" boolVal="False" useVar="false" />`,
        `<trigCond op="eq" boolVal="True" floatVal1="0" strVal1="" varG="${IDS.seen}" dataType="value" andOr="and" />`,
      ) +
      trigger(
        'OnStart',
        'adjustVar',
        `<other varG="${IDS.seen}" op="ass" dblVal="0" boolVal="True" useVar="false" />`,
      ) +
      `</trigLst></sld>`,
  );
  parts.set(
    'story/slides/_rels/slide.xml.rels',
    '<Relationships><Relationship Type="media" Target="/story/media/R1picture.png" Id="Rm1" /></Relationships>',
  );
  // Slide 2: a background of its own, and a button back to slide 1.
  parts.set(
    'story/slides/slide2.xml',
    `<sld g="${IDS.slide2}" name="Goodbye" layoutG="${IDS.layoutInternal}"><tmProps min="5000" />` +
      `<bg><solidFill><clr><schemeClr val="accent2" /></clr></solidFill></bg><shapeLst>` +
      `<oval g="${IDS.back}" name="Back" zOrder="0">${timing()}${fill('lt1')}${loc(400, 200, 560, 360)}` +
      `<trigLst>${trigger('OnClick', 'jumpToSlide', `<slide jumpG="${IDS.slide1}" />`).replace('actSubType="next"', 'actSubType="spec"')}` +
      // Hidden, a built-in state the oval never defined.
      `${trigger('OnClick', 'changeShapeState', `<shape setStateG="${IDS.back}" setStateName="Hidden" />`)}</trigLst></oval>` +
      // A slider from 1 to 5, bound to Score (0, so it starts at 1), that sets Seen when it moves.
      `<slider g="${IDS.slider}" name="Volume slider" zOrder="1" varG="${IDS.score}" defVarG="${IDS.score}" action="drag">${timing()}${loc(10, 10, 210, 40)}` +
      `<track start="1" end="5"><bg><solidFill><clr><schemeClr val="accent2" /></clr></solidFill></bg></track><ticks step="1" style="none" />` +
      `<trigLst>${trigger('OnSliderMoves', 'adjustVar', `<other varG="${IDS.seen}" op="ass" dblVal="0" boolVal="True" useVar="false" />`)}</trigLst></slider>` +
      // A table of two columns (2 : 1) and two rows (1 : 2), the first a header row; one cell
      // filled, one bold.
      `<table g="${IDS.table}" name="Prices" zOrder="5">${timing()}${loc(500, 300, 800, 420)}` +
      `<table headerRow="true" bandedRows="true"><columns><tableColumn width="200" /><tableColumn width="100" /></columns><rows>` +
      `<tableRow height="40"><cells>${cell('Item', '#FFCC00', true)}${cell('Price', '#FFCC00', true)}</cells></tableRow>` +
      `<tableRow height="80"><cells>${cell('Tea', '')}${cell('£2', '')}</cells></tableRow>` +
      `</rows></table></table>` +
      // A rocket that rises along a line when the timeline starts, and two paths of its own: the
      // line (with "when it ends" setting Seen), and a freeform hop run backwards.
      `<rect g="${IDS.rocket}" name="Rocket" zOrder="2">${timing()}${fill('accent1')}${loc(100, 400, 160, 460)}` +
      `<trigLst>${trigger('OnStart', 'Move', `<other moveG="${IDS.rocket}" motionPathG="${IDS.rocketLine}" />`)}` +
      `${trigger('OnAnimationComplete', 'adjustVar', `<other varG="${IDS.seen}" op="ass" dblVal="0" boolVal="True" useVar="false" animationG="${IDS.rocketLine}" />`)}</trigLst></rect>` +
      `<linePath g="${IDS.rocketLine}" name="Line Motion Path" zOrder="3" shapeG="${IDS.rocket}" aniDur="PT1.5S" reverse="false" autoReverse="false" relativeStart="false" orientShape="false" easingDir="inOut" easingType="cubic" dir="d">` +
      `${timing()}${loc(0, 0, 0, -300)}</linePath>` +
      `<customPath g="${IDS.rocketFree}" name="Freeform Motion Path" zOrder="4" shapeG="${IDS.rocket}" aniDur="PT2S" reverse="true" autoReverse="false" relativeStart="true" orientShape="false" easingDir="none" easingType="cubic">` +
      `${timing()}${loc(-100, -50, 0, 0)}<pts><pt x="1" y="1" /><pt x="0.5" y="0" /><pt x="0" y="1" /></pts></customPath>` +
      `</shapeLst><trigLst /></sld>`,
  );
  parts.set('story/media/R1picture.png', PIXEL_PNG);
  // A thumbnail-like extra the course does not list: never taken for an item.
  parts.set('story/media/R2extra.jpg', Buffer.from('not really a picture'));
  parts.set(
    'docProps/summary.xml',
    `<summary><scenes><scene g="${IDS.scene}"><slides><slide name="Welcome" g="${IDS.slide1}" note="${escape(
      `<Document><Content><Block><Span Text="Say hello." /></Block><Block><Span Text="Then go on." /></Block></Content></Document>`,
    )}" /></slides></scene></scenes></summary>`,
  );
  return new Map(
    [...parts].map(([name, value]) => [
      name,
      typeof value === 'string' ? Buffer.from(value) : value,
    ]),
  );
}

/** Write the test course to `path`. */
export async function writeTestStory(path: string, parts = testStoryParts()): Promise<void> {
  const zip = new ZipFile();
  for (const [name, bytes] of parts) zip.addBuffer(bytes, name);
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(path));
}

/** The test course's XML parts as a package's `xml` and `media` maps, for converting without a zip. */
export function testStoryPackage(parts = testStoryParts()) {
  const xml = new Map<string, string>();
  const media = new Map<string, number>();
  for (const [name, bytes] of parts) {
    if (/\.(xml|rels)$/.test(name)) xml.set(name, bytes.toString('utf8'));
    else media.set(name, bytes.length);
  }
  return { xml, media };
}

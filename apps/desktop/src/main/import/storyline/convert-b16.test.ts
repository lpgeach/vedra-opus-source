import { parseProject, serializeProject } from '@vedraopus/model';
import type { DialObject } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { convertStoryline } from './convert';
import { IDS, testStoryPackage, testStoryParts } from './test-story';

/** Dials drawn their own way (docs/briefs/B16-dial-looks-and-paths.md). */

const HASH = 'a'.repeat(64);
const LEVEL = '60000000-0000-4000-8000-000000000001';

/** The test course with Sample B's dial on slide 2: a needle 25.6 × 141, its face on its Normal state. */
function convert(geometry = '<dial vertexSet="false" />') {
  const parts = testStoryParts();
  const story = parts.get('story/story.xml')!.toString('utf8');
  parts.set(
    'story/story.xml',
    Buffer.from(
      story.replace(
        '</varLst>',
        `<var g="${LEVEL}" name="Dial2" dataType="num" val="4" type="user" /></varLst>`,
      ),
    ),
  );
  const copy =
    `<dial name="Dial"><loc l="0" t="0" r="25.6363525" b="141" />` +
    `<face><bg><picFill assetG="${IDS.picture}" /></bg></face>` +
    `<bG><solidFill><clr><schemeClr val="accent1" /></clr></solidFill></bG></dial>`;
  const dial =
    `<dial g="60000000-0000-4000-8000-000000000002" name="Dial" zOrder="40" rot="178">` +
    `<sldSz w="960" h="540" /><loc l="487.429871" t="277.4409" r="513.0662" b="418.4409" />` +
    `<prstGeom>${geometry}</prstGeom>` +
    `<dialData dialType="BuiltInDial" varG="${LEVEL}" increment="1" rotation="9720">` +
    `<values start="-122" end="121" /><rotationPoint xOffset="0" yOffset="33.840004" /></dialData>` +
    `<stateLst><state name="Normal"><shapeLst>${copy}</shapeLst></state></stateLst></dial>`;
  const slide2 = parts.get('story/slides/slide2.xml')!.toString('utf8');
  parts.set(
    'story/slides/slide2.xml',
    Buffer.from(slide2.replace('</shapeLst>', `${dial}</shapeLst>`)),
  );
  const result = convertStoryline(testStoryPackage(parts), {
    fileName: 'Test course',
    media: (g) => (g === IDS.picture ? { hash: HASH, kind: 'image' } : null),
  });
  result.project.assets[HASH] = {
    kind: 'image',
    fileName: 'knob.png',
    ext: 'png',
    mimeType: 'image/png',
    byteLength: 70,
  };
  const made = result.project.scenes[0]!.slides[1]!.baseLayer.objects.find(
    (object) => object.name === 'Dial',
  ) as DialObject;
  return { ...result, dial: made };
}

describe('dials drawn their own way (B16)', () => {
  it('takes a built-in dial’s pointer, pivot, turn and face, as its published course has them', () => {
    const { dial, report, project } = convert();
    expect(dial.frame.rotation).toBeCloseTo(178);
    expect(dial.props).toMatchObject({
      min: -122,
      max: 121,
      initial: 4,
      color: { theme: 'accent1' },
    });
    // The published course turns it from -50.4° to 46.8° about (12.82, 104.34) of its box:
    // 97.2° in all, 0° at its starting value of 4.
    expect(dial.props.look).toEqual({
      pointer: 'M0.5 0L0.0769 0.74L0.5 1L0.9231 0.74Z',
      pivot: { x: 0.5, y: 0.74 },
      from: -50.4,
      to: 46.8,
      face: { asset: HASH, size: 25.64 },
    });
    expect(report.filter((item) => item.slide === 2)).toEqual([]);
    expect(() => parseProject(JSON.parse(serializeProject(project)))).not.toThrow();
  });

  it('draws any other dial as ours, and says so', () => {
    const { dial, report } = convert('<ellipse />');
    expect(dial.props.look).toBeNull();
    expect(report.filter((item) => item.slide === 2).map((item) => item.what)).toEqual([
      'The dial “Dial” is drawn as our dial, without its own face',
    ]);
  });
});

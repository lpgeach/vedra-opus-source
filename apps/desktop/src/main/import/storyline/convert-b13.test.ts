import { randomUUID } from 'node:crypto';
import { parsePathData, parseProject, serializeProject } from '@vedraopus/model';
import type { SceneObject, ShapeGeometry } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { convertStoryline } from './convert';
import { testStoryPackage, testStoryParts } from './test-story';

/** Storyline shapes drawn as path shapes (docs/briefs/B13-path-shapes.md). */

type PathGeometry = Extract<ShapeGeometry, { kind: 'path' }>;

/** The test course with these shapes on slide 2, each 200 × 100. */
function convert(...shapes: [tag: string, name: string, geometry: string][]) {
  const parts = testStoryParts();
  const slide2 = parts.get('story/slides/slide2.xml')!.toString('utf8');
  const xml = shapes
    .map(
      ([tag, name, geometry]) =>
        `<${tag} g="${randomUUID()}" name="${name}" zOrder="40"><sldSz w="960" h="540" />` +
        `<loc l="100" t="100" r="300" b="200" /><prstGeom>${geometry}</prstGeom></${tag}>`,
    )
    .join('');
  parts.set(
    'story/slides/slide2.xml',
    Buffer.from(slide2.replace('</shapeLst>', `${xml}</shapeLst>`)),
  );
  return convertStoryline(testStoryPackage(parts), { fileName: 'Test course', media: () => null });
}

const geometryOf = (result: ReturnType<typeof convert>, name: string): PathGeometry => {
  const object = result.project.scenes[0]!.slides[1]!.baseLayer.objects.find(
    (each: SceneObject) => each.name === name,
  )!;
  if (object.type !== 'shape' || object.props.geometry.kind !== 'path')
    throw new Error(`${name} is not a path shape`);
  return object.props.geometry;
};
/** Every point an outline passes through or is pulled by. */
const pointsOf = (d: string): [number, number][] =>
  parsePathData(d)!.flatMap(({ values }) =>
    values.flatMap((_, i): [number, number][] =>
      i % 2 === 0 ? [[values[i]!, values[i + 1]!]] : [],
    ),
  );
/** Twice the signed area of an outline's corners (the sign says which way it winds). */
const winding = (d: string) => {
  const points = pointsOf(d);
  return points.reduce((sum, [x, y], i) => {
    const [nx, ny] = points[(i + 1) % points.length]!;
    return sum + (x * ny - nx * y);
  }, 0);
};

describe('path shapes from Storyline (B13)', () => {
  const result = convert(
    ['roundRectCallout', 'Speech', '<roundRectCallout><v x="1.2" y="0.3" /></roundRectCallout>'],
    ['rectCallout', 'Square speech', '<rectCallout><v x="0.3" y="1.5" /></rectCallout>'],
    ['ovalCallout', 'Oval', '<ovalCallout><v x="0.8" y="1.25" /></ovalCallout>'],
    ['cloudCallout', 'Cloud', '<cloudCallout><v x="1.1" y="1" /></cloudCallout>'],
    ['can', 'Can', '<can offset="0.25" />'],
    ['frame', 'Frame', '<frame cx="0.1" />'],
    [
      'lnCall1Bar',
      'Note',
      '<lnCall1AccentBar><v x="-0.2" y="1.5" /><pts><pt x="0" y="0.3" /></pts></lnCall1AccentBar>',
    ],
  );

  it('reports none of them', () => {
    expect(result.report.filter((item) => item.slide === 2)).toEqual([]);
    expect(() => parseProject(JSON.parse(serializeProject(result.project)))).not.toThrow();
  });

  it('gives a callout its wedge, out to the tip, from the side facing it', () => {
    const speech = geometryOf(result, 'Speech').paths;
    expect(speech).toHaveLength(1);
    // The tip, 1.2 across and 0.3 down; the base on the right side, 2/12 to 5/12 down.
    const points = pointsOf(speech[0]!.d);
    expect(points).toContainEqual([1.2, 0.3]);
    expect(points).toContainEqual([1, 0.1667]);
    expect(points).toContainEqual([1, 0.4167]);
    // Below, left of middle: on the bottom, 2/12 to 5/12 across.
    const square = pointsOf(geometryOf(result, 'Square speech').paths[0]!.d);
    expect(square).toContainEqual([0.3, 1.5]);
    expect(square).toContainEqual([0.1667, 1]);
    expect(square).toContainEqual([0.4167, 1]);
    expect(pointsOf(geometryOf(result, 'Oval').paths[0]!.d)).toContainEqual([0.8, 1.25]);
  });

  it('draws a cloud with three bubbles toward its tip', () => {
    const cloud = geometryOf(result, 'Cloud').paths;
    expect(cloud).toHaveLength(4);
    // The cloud fills its box: it touches each side, within its curves' pull.
    const xs = pointsOf(cloud[0]!.d).map(([x]) => x);
    expect(Math.min(...xs)).toBeLessThanOrEqual(0.05);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(0.95);
  });

  it('draws a can with its top over it, wound alike so it is no hole', () => {
    const [body, top] = geometryOf(result, 'Can').paths;
    expect([body!.fill, top!.fill]).toEqual([true, true]);
    expect(Math.sign(winding(body!.d))).toBe(Math.sign(winding(top!.d)));
  });

  it('cuts a frame’s hole by winding it the other way, its thickness by the shorter side', () => {
    const [outline] = geometryOf(result, 'Frame').paths;
    const [outer, inner] = outline!.d.split(/(?=M)/);
    expect(Math.sign(winding(outer!))).toBe(-Math.sign(winding(inner!)));
    // cx 0.1 of the 100 px side: 10 px, 0.05 of the width and 0.1 of the height.
    expect(pointsOf(inner!)[0]).toEqual([0.05, 0.1]);
  });

  it('draws a line callout’s box without an outline, and its bar and line outlined', () => {
    const [box, bar, line] = geometryOf(result, 'Note').paths;
    expect([box!.fill, box!.stroke]).toEqual([true, false]);
    expect([bar!.fill, bar!.stroke, bar!.d]).toEqual([false, true, 'M0 0L0 1']);
    expect([line!.fill, line!.stroke, line!.d]).toEqual([false, true, 'M0 0.3L-0.2 1.5']);
  });
});

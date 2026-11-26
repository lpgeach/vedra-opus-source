import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  createGraphicObject,
  MAX_GRAPHIC_NODES,
  migrateToCurrent,
  parseProject,
  ProjectValidationError,
} from './index';
import type { GraphicItem, GraphicNode, Project } from './index';

/** Icons and illustrations (docs/briefs/P9.8-icons-library.md). */

const heart: GraphicItem = {
  library: 'lucide',
  key: 'heart',
  title: 'Heart',
  viewBox: { width: 24, height: 24 },
  strokeWidth: 2,
  nodes: [
    {
      tag: 'g',
      attrs: { fill: 'none', stroke: 'ink', 'stroke-linecap': 'round' },
      children: [
        { tag: 'path', attrs: { d: 'M2 9.5a5.5 5.5 0 0 1 9.591-3.676Z' }, children: [] },
        { tag: 'circle', attrs: { cx: '12', cy: '12', r: '2', fill: 'accent' }, children: [] },
      ],
    },
  ],
};

const issues = (project: Project): string[] => {
  try {
    parseProject(JSON.parse(JSON.stringify(project)));
    return [];
  } catch (error) {
    if (error instanceof ProjectValidationError) return error.issues.map((issue) => issue.path);
    throw error;
  }
};

/** A project with one graphic whose drawing is `nodes` (as raw JSON, so anything can be tried). */
const withNodes = (nodes: unknown) => {
  const project = createEmptyProject();
  const graphic = createGraphicObject(heart);
  (graphic.props as { nodes: unknown }).nodes = nodes;
  project.scenes[0]!.slides[0]!.baseLayer.objects.push(graphic);
  return project;
};

describe('graphics in the model', () => {
  it('are made from a library item, named and sized for it, in theme colours', () => {
    const icon = createGraphicObject(heart);
    expect(icon).toMatchObject({
      type: 'graphic',
      name: 'Heart icon',
      a11y: { altText: 'Heart icon', visibleToAssistiveTech: true },
      frame: { width: 96, height: 96 },
      props: { library: 'lucide', key: 'heart', ink: { theme: 'text' }, strokeWidth: 2 },
    });
    const wide = createGraphicObject({
      ...heart,
      library: 'openDoodles',
      key: 'reading',
      title: 'Reading',
      viewBox: { width: 1024, height: 768 },
      strokeWidth: null,
    });
    expect(wide.name).toBe('Reading illustration');
    expect(wide.frame).toMatchObject({ width: 480, height: 360 });
    // A copy: changing the item later does not change the object.
    expect(icon.props.nodes).not.toBe(heart.nodes);
    expect(issues(withNodes(icon.props.nodes))).toEqual([]);
  });

  it('refuse other elements, attributes, links, scripts and styles', () => {
    const shape = (tag: string, attrs: Record<string, string>) => [{ tag, attrs, children: [] }];
    for (const bad of [
      shape('script', {}),
      shape('image', { href: 'x.png' }),
      shape('use', {}),
      shape('foreignObject', {}),
      shape('path', { d: 'M0 0', onclick: 'alert(1)' }),
      shape('path', { d: 'M0 0', style: 'fill:red' }),
      shape('path', { d: 'M0 0', href: 'javascript:alert(1)' }),
      shape('path', { d: 'M0 0', fill: 'url(#evil)' }),
      shape('path', { d: 'M0 0', fill: 'red' }),
      shape('path', { d: 'M0 0 url(x)' }),
      shape('rect', { width: '10px;' }),
      shape('g', { transform: 'translate(1 2) url(x)' }),
      shape('circle', { r: 'expression(alert(1))' }),
    ]) {
      expect(issues(withNodes(bad)).length, JSON.stringify(bad)).toBeGreaterThan(0);
    }
    expect(
      issues(
        withNodes([
          {
            tag: 'g',
            attrs: { transform: 'translate(10 20) rotate(45)', fill: '#ff0080' },
            children: shape('polygon', { points: '0,0 10,0 5,8', stroke: '#abc' }),
          },
        ]),
      ),
    ).toEqual([]);
  });

  it('hold at most 5,000 shapes, counting those inside groups', () => {
    const many = (count: number): GraphicNode[] =>
      Array.from({ length: count }, () => ({ tag: 'path', attrs: { d: 'M0 0' }, children: [] }));
    expect(
      issues(withNodes([{ tag: 'g', attrs: {}, children: many(MAX_GRAPHIC_NODES - 1) }])),
    ).toEqual([]);
    expect(
      issues(withNodes([{ tag: 'g', attrs: {}, children: many(MAX_GRAPHIC_NODES) }])),
    ).toContain('scenes[0].slides[0].baseLayer.objects[0].props.nodes');
  });

  it('keep a stroke width between 0.25 and 6, or none', () => {
    const project = withNodes(heart.nodes);
    const graphic = project.scenes[0]!.slides[0]!.baseLayer.objects[0]!;
    if (graphic.type !== 'graphic') throw new Error('graphic');
    for (const [width, ok] of [
      [null, true],
      [0.25, true],
      [6, true],
      [0.1, false],
      [7, false],
    ] as const) {
      graphic.props.strokeWidth = width;
      expect(issues(project).length === 0, String(width)).toBe(ok);
    }
  });

  it('migrate from format 31 unchanged', () => {
    const old = JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown>;
    old['formatVersion'] = 31;
    const migrated = migrateToCurrent(old) as Record<string, unknown>;
    expect({ ...migrated, formatVersion: 31 }).toEqual(old);
  });
});

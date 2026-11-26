import {
  createAudioObject,
  createButtonObject,
  createChoiceObject,
  createDropdownObject,
  createTextEntryObject,
  createEmptyProject,
  createGroupObject,
  createHistory,
  createImageObject,
  createShapeObject,
  createSlide,
  createSlideMaster,
  createTextObject,
  createVideoObject,
  createZoomRegion,
  createHotspotObject,
  createMarkerObject,
  createSliderObject,
  createWebObject,
  createGraphicObject,
  createTableObject,
  createPanoramaObject,
  createPanoramaSpot,
  plainRichText,
  withCell,
  createDialObject,
  shapePreset,
} from '@vedraopus/model';
import type { Appearance, Project, SceneObject } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import {
  closedPath,
  coverPlacement,
  createRenderContext,
  cropPlacement,
  gradientLine,
  h,
  linePath,
  panoramaDirection,
  panoramaPoint,
  renderLayer,
  renderObject,
  renderSlide,
  roundRectPath,
  scaledPath,
  toMarkup,
} from './index';
import type { RenderChild, RenderNode } from './index';

const HASH = 'a'.repeat(64);
const OTHER_HASH = 'b'.repeat(64);

function project(): Project {
  const result = createEmptyProject();
  result.assets[HASH] = {
    kind: 'image',
    fileName: 'photo.png',
    ext: 'png',
    mimeType: 'image/png',
    byteLength: 10,
  };
  return result;
}
const context = (idPrefix?: string) =>
  createRenderContext(project(), {
    assetUrl: (hash) => `asset://${hash}`,
    ...(idPrefix === undefined ? {} : { idPrefix }),
  });

/** Every element in a tree, depth first. */
function all(node: RenderChild): RenderNode[] {
  if (typeof node === 'string') return [];
  return [node, ...node.children.flatMap(all)];
}
const find = (node: RenderNode, tag: string) => all(node).filter((each) => each.tag === tag);
const only = (node: RenderNode, tag: string) => {
  const found = find(node, tag);
  expect(found, `<${tag}> elements`).toHaveLength(1);
  return found[0]!;
};

function shape(appearance: Partial<Appearance> = {}, geometry = { kind: 'rect' } as const) {
  const object = createShapeObject(geometry, { x: 10, y: 20, width: 200, height: 100 });
  Object.assign(object.props.appearance, appearance);
  return object;
}

describe('paths', () => {
  it('draws each closed geometry inside the box', () => {
    expect(closedPath({ kind: 'rect' }, 200, 100)).toBe('M0 0H200V100H0Z');
    expect(closedPath({ kind: 'triangle' }, 200, 100)).toBe('M100 0L200 100L0 100Z');
    expect(closedPath({ kind: 'ellipse' }, 200, 100)).toBe(
      'M0 50A100 50 0 1 1 200 50A100 50 0 1 1 0 50Z',
    );
    expect(closedPath(shapePreset('diamond'), 200, 100)).toBe('M100 0L200 50L100 100L0 50Z');
  });

  it('stretches a path shape’s outlines from the 0–1 box to the object’s (B13)', () => {
    expect(scaledPath('M0 0L1 0.5C0.5 1 0 1 -0.1 1.2Z', 200, 100)).toBe(
      'M0 0L200 50C100 100 0 100 -20 120Z',
    );
    expect(
      closedPath(
        {
          kind: 'path',
          paths: [
            { d: 'M0 0L1 1', fill: false, stroke: true },
            { d: 'M0 1L1 0Z', fill: true, stroke: false },
          ],
        },
        200,
        100,
      ),
    ).toBe('M0 0L200 100M0 100L200 0Z');
  });

  it('rounds corners, never by more than half the shorter side', () => {
    expect(roundRectPath(200, 100, 10)).toBe(
      'M10 0H190A10 10 0 0 1 200 10V90A10 10 0 0 1 190 100H10A10 10 0 0 1 0 90V10A10 10 0 0 1 10 0Z',
    );
    expect(roundRectPath(200, 100, 999)).toBe(roundRectPath(200, 100, 50));
    expect(roundRectPath(200, 100, 0)).toBe('M0 0H200V100H0Z');
    expect(roundRectPath(200, 100, -5)).toBe('M0 0H200V100H0Z');
  });

  it('runs a line along the middle of the box', () => {
    expect(linePath({ kind: 'line' }, 300, 40, 2)).toEqual({ line: 'M0 20H300' });
    expect(linePath({ kind: 'line' }, 300, 0, 2)).toEqual({ line: 'M0 0H300' });
  });

  it('gives an arrow a head at the right end and stops the line inside it', () => {
    const thin = linePath({ kind: 'arrow' }, 300, 0, 2);
    expect(thin.head).toBe('M300 0L290 -4L290 4Z');
    expect(thin.line).toBe('M0 0H291');
    // The head grows with the outline.
    expect(linePath({ kind: 'arrow' }, 300, 0, 10).head).toBe('M300 0L260 -15L260 15Z');
    // An arrow shorter than its head is all head.
    expect(linePath({ kind: 'arrow' }, 6, 0, 2).head).toBe('M6 0L0 -4L0 4Z');
  });
});

describe('gradientLine', () => {
  const rounded = (line: ReturnType<typeof gradientLine>) =>
    // Adding zero turns the -0 that rounding a tiny negative gives into 0.
    Object.fromEntries(Object.entries(line).map(([key, value]) => [key, Math.round(value) + 0]));

  it('runs left to right at 0° and top to bottom at 90°', () => {
    expect(rounded(gradientLine(0, 200, 100))).toEqual({ x1: 0, y1: 50, x2: 200, y2: 50 });
    expect(rounded(gradientLine(90, 200, 100))).toEqual({ x1: 100, y1: 0, x2: 100, y2: 100 });
    expect(rounded(gradientLine(180, 200, 100))).toEqual({ x1: 200, y1: 50, x2: 0, y2: 50 });
  });

  it('reaches the corners on a diagonal', () => {
    // On a square at 45° the line is the diagonal itself.
    expect(rounded(gradientLine(45, 100, 100))).toEqual({ x1: 0, y1: 0, x2: 100, y2: 100 });
  });
});

describe('coverPlacement', () => {
  it('scales to the tighter side and centres the overflow', () => {
    expect(coverPlacement(200, 100, 200, 140)).toEqual({ x: -40, y: 0, width: 280, height: 140 });
    expect(coverPlacement(100, 200, 200, 100)).toEqual({ x: 0, y: -150, width: 200, height: 400 });
    expect(coverPlacement(64, 64, 64, 64)).toEqual({ x: 0, y: 0, width: 64, height: 64 });
  });
});

describe('cropPlacement', () => {
  it('fills the frame when there is no crop', () => {
    expect(cropPlacement(null, 300, 200)).toEqual({ left: 0, top: 0, width: 300, height: 200 });
  });

  it('enlarges and shifts the image so only the cropped region shows', () => {
    // The right half of the picture, shown in a 300×200 frame.
    expect(cropPlacement({ x: 0.5, y: 0, width: 0.5, height: 1 }, 300, 200)).toEqual({
      left: -300,
      top: 0,
      width: 600,
      height: 200,
    });
    // The middle quarter.
    expect(cropPlacement({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, 300, 200)).toEqual({
      left: -150,
      top: -100,
      width: 600,
      height: 400,
    });
  });

  it('ignores a crop with no area', () => {
    expect(cropPlacement({ x: 0.2, y: 0.2, width: 0, height: 0.5 }, 300, 200)).toEqual({
      left: 0,
      top: 0,
      width: 300,
      height: 200,
    });
  });
});

describe('the object wrapper', () => {
  it('places the object at its frame and identifies it', () => {
    const object = shape();
    const node = renderObject(object, context());
    expect(node.attrs).toMatchObject({
      'data-object-id': object.id,
      'data-object-type': 'shape',
    });
    expect(node.style).toMatchObject({
      position: 'absolute',
      left: '10px',
      top: '20px',
      width: '200px',
      height: '100px',
    });
    expect(node.style).not.toHaveProperty('transform');
    expect(node.style).not.toHaveProperty('opacity');
    expect(node.style).not.toHaveProperty('filter');
  });

  it('rotates, fades and shadows through the wrapper', () => {
    const object = shape({
      opacity: 0.5,
      shadow: { color: { theme: 'text' }, offsetX: 4, offsetY: 6, blur: 8 },
    });
    object.frame.rotation = 30;
    const { style } = renderObject(object, context());
    expect(style['transform']).toBe('rotate(30deg)');
    expect(style['opacity']).toBe('0.5');
    expect(style['filter']).toBe('drop-shadow(4px 6px 8px #1c2024)');
  });
});

describe('shapes', () => {
  it('fills with a literal colour or the theme colour it refers to', () => {
    const literal = renderObject(shape({ fill: { kind: 'solid', color: '#ff000080' } }), context());
    expect(only(literal, 'path').attrs['fill']).toBe('#ff000080');
    const themed = renderObject(
      shape({ fill: { kind: 'solid', color: { theme: 'accent2' } } }),
      context(),
    );
    expect(only(themed, 'path').attrs['fill']).toBe('#12a594');
    expect(find(themed, 'defs')).toHaveLength(0);
  });

  it('draws each outline of a path shape filled, outlined or both, as it says (B13)', () => {
    const object = createShapeObject(
      {
        kind: 'path',
        paths: [
          { d: 'M0 0L1 0L1 1Z', fill: true, stroke: true },
          { d: 'M0 0L1 1', fill: false, stroke: true },
          { d: 'M0 1L1 1L0 0Z', fill: true, stroke: false },
        ],
      },
      { x: 10, y: 20, width: 200, height: 100 },
    );
    object.props.appearance.fill = { kind: 'solid', color: '#ff0000' };
    object.props.appearance.stroke = { color: '#112233', width: 2, dash: 'solid' };
    const paths = find(renderObject(object, context()), 'path').map((path) => path.attrs);
    expect(paths.map((path) => [path['d'], path['fill'], path['stroke']])).toEqual([
      ['M0 0L200 0L200 100Z', '#ff0000', '#112233'],
      ['M0 0L200 100', 'none', '#112233'],
      ['M0 100L200 100L0 0Z', '#ff0000', 'none'],
    ]);
  });

  it('draws no outline when there is none or its width is zero', () => {
    for (const stroke of [null, { color: '#000000', width: 0, dash: 'solid' } as const]) {
      const path = only(renderObject(shape({ stroke }), context()), 'path');
      expect(path.attrs['stroke']).toBe('none');
      expect(path.attrs).not.toHaveProperty('stroke-width');
    }
  });

  it('scales dashes and dots with the outline width', () => {
    const outline = (dash: 'solid' | 'dash' | 'dot') =>
      only(renderObject(shape({ stroke: { color: '#112233', width: 4, dash } }), context()), 'path')
        .attrs;
    expect(outline('solid')).toMatchObject({ stroke: '#112233', 'stroke-width': '4' });
    expect(outline('solid')).not.toHaveProperty('stroke-dasharray');
    expect(outline('dash')['stroke-dasharray']).toBe('12 8');
    expect(outline('dot')).toMatchObject({ 'stroke-dasharray': '0 8', 'stroke-linecap': 'round' });
  });

  it('defines a gradient in pixels and points the fill at it', () => {
    const object = shape({
      fill: {
        kind: 'gradient',
        angle: 90,
        stops: [
          { offset: 0, color: '#ffffff' },
          { offset: 1, color: { theme: 'accent1' } },
        ],
      },
    });
    const node = renderObject(object, context());
    const gradient = only(node, 'linearGradient');
    expect(gradient.attrs).toMatchObject({
      id: `${object.id}-fill`,
      gradientUnits: 'userSpaceOnUse',
      x1: '100',
      y1: '0',
      x2: '100',
      y2: '100',
    });
    expect(find(node, 'stop').map((stop) => stop.attrs)).toEqual([
      { offset: '0', 'stop-color': '#ffffff' },
      { offset: '1', 'stop-color': '#2f6fed' },
    ]);
    expect(only(node, 'path').attrs['fill']).toBe(`url(#${object.id}-fill)`);
  });

  it('prefixes ids so two renderings of a slide do not clash', () => {
    const object = shape({
      fill: {
        kind: 'gradient',
        angle: 0,
        stops: [
          { offset: 0, color: '#000000' },
          { offset: 1, color: '#ffffff' },
        ],
      },
    });
    const node = renderObject(object, context('thumb 1/'));
    const id = only(node, 'linearGradient').attrs['id'];
    expect(id).toBe(`thumb-1-${object.id}-fill`);
    expect(only(node, 'path').attrs['fill']).toBe(`url(#${id})`);
  });

  it('fills with an image placed to cover the shape when its size is known', () => {
    const source = project();
    // A 200×100 picture in a 200×100 shape fits exactly...
    Object.assign(source.assets[HASH]!, { width: 200, height: 100 });
    const ctx = createRenderContext(source, { assetUrl: (hash) => `asset://${hash}` });
    const exact = renderObject(shape({ fill: { kind: 'image', asset: HASH } }), ctx);
    expect(only(exact, 'pattern').attrs).toMatchObject({
      patternUnits: 'userSpaceOnUse',
      width: '200',
      height: '100',
    });
    expect(only(exact, 'image').attrs).toEqual({
      href: `asset://${HASH}`,
      x: '0',
      y: '0',
      width: '200',
      height: '100',
    });

    // ...and a square picture is enlarged and centred, overflowing top and bottom.
    Object.assign(source.assets[HASH]!, { width: 50, height: 50 });
    const square = renderObject(shape({ fill: { kind: 'image', asset: HASH } }), ctx);
    expect(only(square, 'image').attrs).toMatchObject({
      x: '0',
      y: '-50',
      width: '200',
      height: '200',
    });
  });

  it('asks the browser to cover the shape when the picture size is unknown', () => {
    const node = renderObject(shape({ fill: { kind: 'image', asset: HASH } }), context());
    expect(only(node, 'image').attrs).toMatchObject({
      href: `asset://${HASH}`,
      width: '200',
      height: '100',
      preserveAspectRatio: 'xMidYMid slice',
    });
  });

  it('falls back to a plain fill when the fill image is not in the project', () => {
    const node = renderObject(shape({ fill: { kind: 'image', asset: OTHER_HASH } }), context());
    expect(find(node, 'pattern')).toHaveLength(0);
    expect(only(node, 'path').attrs['fill']).toBe('#e3e5e8');
  });

  it('draws a line as its outline only, and nothing without one', () => {
    const line = createShapeObject({ kind: 'line' }, { width: 300 });
    const drawn = only(renderObject(line, context()), 'path');
    expect(drawn.attrs).toMatchObject({ d: 'M0 0H300', fill: 'none', 'stroke-width': '2' });

    line.props.appearance.stroke = null;
    expect(find(renderObject(line, context()), 'path')).toHaveLength(0);
  });

  it('never gives the drawing surface a zero side, which would hide a flat line', () => {
    const line = createShapeObject({ kind: 'line' }, { width: 300 });
    expect(line.frame.height).toBe(0);
    expect(only(renderObject(line, context()), 'svg').attrs).toMatchObject({
      width: '300',
      height: '1',
    });
  });

  it('fills an arrow head with the outline colour', () => {
    const arrow = createShapeObject({ kind: 'arrow' }, { width: 300 });
    arrow.props.appearance.stroke = { color: '#aa0000', width: 2, dash: 'dash' };
    const [line, head] = find(renderObject(arrow, context()), 'path');
    expect(line!.attrs).toMatchObject({ stroke: '#aa0000', 'stroke-dasharray': '6 4' });
    expect(head!.attrs).toEqual({ d: 'M300 0L290 -4L290 4Z', fill: '#aa0000' });
  });
});

describe('images', () => {
  it('fills the frame and carries the alternative text', () => {
    const object = createImageObject(HASH, { width: 300, height: 200 });
    object.a11y.altText = 'A fire door';
    const img = only(renderObject(object, context()), 'img');
    expect(img.attrs).toMatchObject({ src: `asset://${HASH}`, alt: 'A fire door' });
    expect(img.style).toMatchObject({ left: '0px', top: '0px', width: '300px', height: '200px' });
  });

  it('clips to the frame and shifts the picture when cropped', () => {
    const object = createImageObject(HASH, { width: 300, height: 200 });
    object.props.crop = { x: 0.5, y: 0, width: 0.5, height: 1 };
    object.props.opacity = 0.4;
    const node = renderObject(object, context());
    expect(node.style).toMatchObject({ overflow: 'hidden', opacity: '0.4' });
    expect(only(node, 'img').style).toMatchObject({ left: '-300px', width: '600px' });
  });

  it('draws a placeholder, not a broken image, when the file is missing', () => {
    const node = renderObject(createImageObject(OTHER_HASH), context());
    expect(find(node, 'img')).toHaveLength(0);
    expect(find(node, 'path').length).toBeGreaterThan(0);
  });

  it('treats an asset the project does not list as missing even if a URL could be made', () => {
    const made: string[] = [];
    const strict = createRenderContext(project(), {
      assetUrl: (hash) => {
        made.push(hash);
        return `asset://${hash}`;
      },
    });
    renderObject(createImageObject(OTHER_HASH), strict);
    expect(made).toEqual([]);
  });
});

describe('buttons, text and groups', () => {
  it('draws a button as a rounded rectangle with its label', () => {
    const button = createButtonObject('Continue', { width: 160, height: 48 });
    const node = renderObject(button, context());
    expect(only(node, 'path').attrs['d']).toBe(roundRectPath(160, 48, 6));
    expect(toMarkup(node)).toContain('>Continue</p>');
  });

  it('leaves out the text layer when there is no text', () => {
    const markup = toMarkup(renderObject(createButtonObject(''), context()));
    expect(markup).not.toContain('vo-text');
  });

  it('draws a text box paragraph by paragraph, keeping blank lines', () => {
    const node = renderObject(createTextObject('One\n\nThree'), context());
    expect(find(node, 'p').map((p) => p.children[0])).toEqual(['One', ' ', 'Three']);
  });

  it('lets each paragraph and list item take the direction of its own words (P10.3)', () => {
    const text = createTextObject('', { x: 0, y: 0 });
    text.props.text = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'مرحبا' }] },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One' }] }],
            },
          ],
        },
      ],
    };
    const node = renderObject(text, context());
    expect(find(node, 'p').map((p) => p.attrs['dir'])).toEqual(['auto', 'auto']);
    expect(find(node, 'li').map((li) => li.attrs['dir'])).toEqual(['auto']);
  });

  it('draws a group as a container of its children, in order', () => {
    const children = [shape(), createButtonObject()];
    const group = createGroupObject(children);
    const node = renderObject(group, context());
    expect(node.attrs['data-object-type']).toBe('group');
    expect(node.style).toMatchObject({ left: '0', top: '0', width: '0', height: '0' });
    expect(node.children.map((child) => (child as RenderNode).attrs['data-object-id'])).toEqual(
      children.map((child) => child.id),
    );
    // Children keep their own stage positions.
    expect((node.children[0] as RenderNode).style).toMatchObject({ left: '10px', top: '20px' });
  });
});

describe('layers and slides', () => {
  it('draws a layer back to front and a slide at stage size on the theme background', () => {
    const source = project();
    const slide = source.scenes[0]!.slides[0]!;
    const objects: SceneObject[] = [shape(), createButtonObject()];
    slide.baseLayer.objects.push(...objects);
    const ctx = createRenderContext(source, { assetUrl: () => undefined });

    const layer = renderLayer(slide.baseLayer, ctx);
    expect(layer.children.map((child) => (child as RenderNode).attrs['data-object-id'])).toEqual(
      objects.map((object) => object.id),
    );

    const rendered = renderSlide(slide, ctx);
    expect(rendered.style).toMatchObject({
      width: '1280px',
      height: '720px',
      overflow: 'hidden',
      background: '#ffffff',
    });
    expect(rendered.attrs['data-slide-id']).toBe(slide.id);
  });
});

describe('toMarkup', () => {
  it('escapes text and attribute values', () => {
    const node = h('div', { attrs: { title: 'a "quoted" <b> & c' } }, ['1 < 2 & "ok"']);
    expect(toMarkup(node)).toBe(
      '<div title="a &quot;quoted&quot; &lt;b&gt; &amp; c">1 &lt; 2 &amp; "ok"</div>',
    );
  });

  it('cannot be broken out of by authored text', () => {
    const hostile = '</p><script>alert(1)</script>';
    const object = createImageObject(HASH);
    object.a11y.altText = '"><img src=x onerror=alert(1)>';
    const markup =
      toMarkup(renderObject(createTextObject(hostile), context())) +
      toMarkup(renderObject(object, context()));
    expect(markup).not.toContain('<script');
    expect(markup).not.toContain('<img src=x');
    expect(markup).toContain('&lt;script&gt;');
  });

  it('writes styles inline, omits empty ones, and does not close void elements', () => {
    expect(toMarkup(h('img', { attrs: { src: 'a.png' }, style: { width: '10px' } }))).toBe(
      '<img src="a.png" style="width:10px">',
    );
    expect(toMarkup(h('p', { style: { color: false, margin: null } }))).toBe('<p></p>');
  });

  it('rounds numbers and never writes negative zero', () => {
    expect(h('i', { attrs: { a: 1 / 3, b: -0, c: 2 } }).attrs).toEqual({
      a: '0.333',
      b: '0',
      c: '2',
    });
  });
});

describe('audio', () => {
  it('draws a marker where sound sits only when asked to, and nothing a learner sees otherwise', () => {
    const project = createEmptyProject();
    const audio = createAudioObject('a'.repeat(64), 3, { x: 16, y: 20 });
    const marked = toMarkup(
      renderObject(
        audio,
        createRenderContext(project, { assetUrl: () => undefined, mediaMarkers: true }),
      ),
    );
    expect(marked).toContain('data-object-type="audio"');
    expect(marked).toContain('<svg');
    expect(marked).toContain('left:16px');
    const plain = toMarkup(
      renderObject(audio, createRenderContext(project, { assetUrl: () => undefined })),
    );
    expect(plain).toContain('data-object-type="audio"');
    expect(plain).not.toContain('<svg');
    expect(plain).toContain('pointer-events:none');
  });
});

describe('video', () => {
  const FILM = 'b'.repeat(64);
  const PICTURE = 'c'.repeat(64);
  const project = createEmptyProject();
  project.assets[FILM] = {
    kind: 'video',
    fileName: 'f.webm',
    ext: 'webm',
    mimeType: 'video/webm',
    byteLength: 1,
  };
  project.assets[PICTURE] = {
    kind: 'image',
    fileName: 'p.png',
    ext: 'png',
    mimeType: 'image/png',
    byteLength: 1,
  };
  const url = (hash: string) => `media/${hash.slice(0, 4)}`;

  it('is a still of itself in the editor: its poster or the frame at its trim start, no controls', () => {
    const video = createVideoObject(FILM, 8);
    video.props.trimStart = 1.5;
    video.props.controls = true;
    const still = toMarkup(renderObject(video, createRenderContext(project, { assetUrl: url })));
    expect(still).toContain('src="media/bbbb#t=1.5"');
    expect(still).toContain('preload="metadata"');
    expect(still).toContain('disablepictureinpicture=""');
    expect(still).toContain(`data-media-id="${video.id}"`);
    expect(still).not.toContain('controls');
    expect(still).not.toContain('poster=');
    expect(still).toContain('pointer-events:none');
    video.props.poster = PICTURE;
    expect(
      toMarkup(renderObject(video, createRenderContext(project, { assetUrl: url }))),
    ).toContain('poster="media/cccc"');
  });

  it('in a course, gets its controls when it asks and may allow picture-in-picture', () => {
    const video = createVideoObject(FILM, 8);
    const live = createRenderContext(project, { assetUrl: url, liveMedia: true });
    expect(toMarkup(renderObject(video, live))).not.toContain('controls');
    video.props.controls = true;
    video.props.pictureInPicture = true;
    const markup = toMarkup(renderObject(video, live));
    expect(markup).toContain('controls=""');
    expect(markup).toContain('preload="auto"');
    expect(markup).not.toContain('disablepictureinpicture');
    expect(markup).not.toContain('pointer-events:none');
  });
});

describe('theme edits reach the rendered output', () => {
  const themedText = (): SceneObject => {
    const text = createTextObject('', { x: 0, y: 0, width: 200, height: 40 });
    return {
      ...text,
      props: {
        ...text.props,
        text: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Hello',
                  marks: [
                    {
                      type: 'textStyle',
                      attrs: { fontFamily: 'heading', color: { theme: 'accent1' } },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    } as SceneObject;
  };

  it('re-resolves theme colours and fonts after the theme command, and undo restores them', () => {
    const history = createHistory(project());
    const render = (object: SceneObject) =>
      toMarkup(renderObject(object, createRenderContext(history.project, { assetUrl: () => '' })));
    const themedShape = shape({ fill: { kind: 'solid', color: { theme: 'accent2' } } });
    const literalShape = shape({ fill: { kind: 'solid', color: '#abcdef' } });
    const text = themedText();

    const before = render(text);
    expect(before).toContain(history.project.theme.fonts.heading);
    expect(render(themedShape)).toContain('#12a594');

    history.execute('project.updateTheme', {
      colors: { accent2: '#010203', accent1: '#0a0b0c' },
      fonts: { heading: 'Georgia' },
    });
    const after = render(text);
    expect(after).toContain('Georgia');
    expect(after).toContain('#0a0b0c');
    expect(render(themedShape)).toContain('#010203');
    expect(render(themedShape)).not.toContain('#12a594');
    // A literal colour is untouched by the theme.
    expect(render(literalShape)).toContain('#abcdef');

    history.undo();
    expect(render(text)).toBe(before);
  });
});

describe('masters and layouts', () => {
  function setup() {
    const base = project();
    const history = createHistory(base);
    const master = createSlideMaster('Brand');
    const logo = createShapeObject({ kind: 'rect' }, { x: 1, y: 2, width: 30, height: 40 }, 'Logo');
    master.layer.objects.push(logo);
    history.execute('master.add', { master });
    const [first] = history.project.scenes[0]!.slides;
    const second = createSlide('Two');
    history.execute('slide.add', { sceneId: history.project.scenes[0]!.id, slide: second });
    const layout = master.layouts[0]!;
    for (const id of [first!.id, second.id]) {
      history.execute('slide.setLayout', { slideId: id, layoutId: layout.id });
    }
    const markup = (slideId: string) => {
      const slide = history.project.scenes[0]!.slides.find((s) => s.id === slideId)!;
      return toMarkup(
        renderSlide(slide, createRenderContext(history.project, { assetUrl: () => '' })),
      );
    };
    return { history, master, logo, ids: [first!.id, second.id] as const, markup };
  }

  it('draws the master and layout beneath each slide using them, without placeholder prompts', () => {
    const { logo, ids, markup } = setup();
    for (const id of ids) {
      const html = markup(id);
      expect(html).toContain(`data-object-id="${logo.id}"`);
      expect(html).not.toContain('Click to edit the title');
    }
  });

  it('draws the master first, so slide objects sit on top of it', () => {
    const { history, logo, ids, markup } = setup();
    const own = createShapeObject({ kind: 'rect' });
    history.execute('object.add', {
      layerId: history.project.scenes[0]!.slides[0]!.baseLayer.id,
      object: own,
    });
    const html = markup(ids[0]);
    expect(html.indexOf(logo.id)).toBeLessThan(html.indexOf(own.id));
  });

  it('editing the master changes every slide that uses it; a blank slide has none', () => {
    const { history, master, logo, ids, markup } = setup();
    history.execute('object.update', { objectId: logo.id, changes: { frame: { x: 77 } } });
    for (const id of ids) expect(markup(id)).toContain('left:77px');
    history.execute('slide.setLayout', { slideId: ids[1], layoutId: null });
    expect(markup(ids[1])).not.toContain(logo.id);
    expect(markup(ids[0])).toContain(logo.id);
    expect(master.id).toBeTruthy();
  });
});

describe('variable references in text', () => {
  it('shows values for %Name% when given variables, and the reference itself when not', () => {
    const box = createTextObject('Hi %name%, you scored %Score% (%Unknown%) 100%');
    const values: Record<string, string> = { name: 'Ada', score: '7' };
    const withValues = toMarkup(
      renderObject(
        box,
        createRenderContext(project(), {
          assetUrl: () => '',
          variables: (name) => values[name.toLowerCase()],
        }),
      ),
    );
    expect(withValues).toContain('Hi Ada, you scored 7 (%Unknown%) 100%');
    const asWritten = toMarkup(renderObject(box, context()));
    expect(asWritten).toContain('Hi %name%, you scored %Score%');
  });

  it('escapes a value as text, never markup', () => {
    const box = createTextObject('%Name%');
    const markup = toMarkup(
      renderObject(
        box,
        createRenderContext(project(), { assetUrl: () => '', variables: () => '<b>x</b>' }),
      ),
    );
    expect(markup).not.toContain('<b>');
    expect(markup).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});

describe('zoom regions', () => {
  it('draw nothing in a course, and a dashed frame on the editor’s stage', () => {
    const project = createEmptyProject();
    const region = createZoomRegion(project.stage);
    const course = renderObject(
      region,
      createRenderContext(project, { assetUrl: () => undefined }),
    );
    expect(course.children).toEqual([]);
    expect(course.style['pointer-events']).toBe('none');
    const editor = renderObject(
      region,
      createRenderContext(project, { assetUrl: () => undefined, mediaMarkers: true }),
    );
    expect(editor.style['border']).toContain('dashed');
    expect(JSON.stringify(editor.children)).toContain('Zoom');
  });
});

describe('choice objects (P7.1)', () => {
  it('draw a round or square mark beside their words, filled when selected', () => {
    const project = createEmptyProject();
    const context = createRenderContext(project, { assetUrl: () => undefined });
    const radio = createChoiceObject('Paris', 'radio');
    const mark = (node: ReturnType<typeof renderObject>) =>
      node.children.find((child) => typeof child !== 'string' && child.tag === 'svg') as Exclude<
        (typeof node.children)[number],
        string
      >;
    const plain = renderObject(radio, context);
    expect(mark(plain).children.map((child) => typeof child !== 'string' && child.tag)).toEqual([
      'circle',
    ]);
    expect(mark(plain).attrs['data-selected']).toBeUndefined();
    const picked = renderObject(radio, context, 'selected');
    expect(mark(picked).children).toHaveLength(2);
    expect(mark(picked).attrs['data-selected']).toBe('true');
    expect(JSON.stringify(picked)).toContain('Paris');
    const box = renderObject(createChoiceObject('Rome', 'checkbox'), context, 'selected');
    expect(mark(box).children.map((child) => typeof child !== 'string' && child.tag)).toEqual([
      'rect',
      'path',
    ]);
  });
});

describe('text entries and dropdowns (P7.2)', () => {
  it('are real inputs in a course, and boxes in the editor', () => {
    const project = createEmptyProject();
    const course = createRenderContext(project, { assetUrl: () => undefined, liveMedia: true });
    const editor = createRenderContext(project, { assetUrl: () => undefined });
    const entry = createTextEntryObject({}, true);
    const live = toMarkup(renderObject(entry, course));
    expect(live).toContain('<input type="text" class="vo-entry" placeholder="Type a number"');
    expect(live).toContain('inputmode="decimal"');
    expect(toMarkup(renderObject(entry, editor))).not.toContain('<input');
    const dropdown = createDropdownObject(['Red', 'Green']);
    const select = toMarkup(renderObject(dropdown, course));
    expect(select).toContain('<option value="">Choose…</option><option value="Red">Red</option>');
    expect(toMarkup(renderObject(dropdown, editor))).toContain('Choose…');
    expect(toMarkup(renderObject(dropdown, editor))).not.toContain('<select');
  });

  it('draws a multiline entry as a textarea in a course, and a box from the top in the editor (P7.3)', () => {
    const project = createEmptyProject();
    const course = createRenderContext(project, { assetUrl: () => undefined, liveMedia: true });
    const editor = createRenderContext(project, { assetUrl: () => undefined });
    const essay = createTextEntryObject({ width: 600 }, false, 'Essay', true);
    expect(essay.frame.height).toBe(200);
    const live = toMarkup(renderObject(essay, course));
    expect(live).toContain('<textarea class="vo-entry" placeholder="Type your answer"');
    expect(live).not.toContain('<input');
    expect(live).toContain('resize:none');
    const box = toMarkup(renderObject(essay, editor));
    expect(box).not.toContain('<textarea');
    expect(box).toContain('Type your answer');
    // Not centred like a one-line box: the words start at the top.
    expect(box).not.toContain('align-items:center');
    // The font is a one-line (44-unit) field's, not grown with the box's height:
    // 44 × 0.45 = 19.8, inside the 12…20 clamp (200 × 0.45 = 90 would clamp to 20).
    expect(box).toContain('font:19.8px');
  });
});

describe('hotspots and markers (P9.1)', () => {
  it('a hotspot draws nothing in a course, an ellipse clipped to itself, and a dashed frame in the editor', () => {
    const project = createEmptyProject();
    const course = createRenderContext(project, { assetUrl: () => undefined });
    const editor = createRenderContext(project, { assetUrl: () => undefined, mediaMarkers: true });
    const rect = createHotspotObject();
    const ellipse = createHotspotObject({}, 'ellipse');
    expect(renderObject(rect, course).children).toEqual([]);
    expect(renderObject(rect, course).style['clip-path']).toBeUndefined();
    expect(renderObject(ellipse, course).style['clip-path']).toBe('ellipse(50% 50% at 50% 50%)');
    const drawn = renderObject(ellipse, editor);
    expect(drawn.style['border']).toContain('dashed');
    expect(drawn.style['border-radius']).toBe('50%');
    expect(JSON.stringify(drawn.children)).toContain('Hotspot');
  });

  it('a marker draws its round icon in its colour, with a glyph that reads on it, in a course too', () => {
    const project = createEmptyProject();
    const course = createRenderContext(project, { assetUrl: () => undefined });
    const marker = createMarkerObject({ x: 10, y: 20 });
    marker.props.color = '#ffd23f';
    for (const icon of ['plus', 'info', 'question', 'pin', 'star'] as const) {
      marker.props.icon = icon;
      const nodes = all(renderObject(marker, course));
      expect(nodes.find((node) => node.tag === 'circle')?.attrs['fill'], icon).toBe('#ffd23f');
      const ink = nodes.filter((node) => node.tag === 'path');
      expect(ink.length, icon).toBeGreaterThan(0);
      // Yellow is light: the glyph is black.
      for (const path of ink) {
        expect(path.attrs['stroke'] ?? path.attrs['fill'], icon).toBe('#000000');
      }
    }
    expect(renderObject(marker, course).attrs['data-pulse']).toBeUndefined();
    marker.props.pulse = true;
    expect(renderObject(marker, course).attrs['data-pulse']).toBe('true');
    expect(renderObject(marker, course).attrs['data-object-type']).toBe('marker');
  });
});

describe('sliders and dials (P9.4)', () => {
  it('a slider is a picture at its initial value outside a course, and a range input in one', () => {
    const project = createEmptyProject();
    const picture = createRenderContext(project, { assetUrl: () => undefined });
    const live = createRenderContext(project, { assetUrl: () => undefined, liveMedia: true });
    const slider = createSliderObject({ x: 0, y: 0, width: 320, height: 40 });
    Object.assign(slider.props, { min: 0, max: 10, initial: 5, color: '#123456' });
    const nodes = all(renderObject(slider, picture));
    const [track, filled] = nodes.filter((node) => node.tag === 'rect');
    // The filled part reaches halfway along the track: 5 of 0 to 10.
    expect(Number(filled!.attrs['width'])).toBeCloseTo(Number(track!.attrs['width']) / 2, 1);
    expect(nodes.find((node) => node.tag === 'circle')?.attrs['fill']).toBe('#123456');
    const input = all(renderObject(slider, live)).find((node) => node.tag === 'input')!;
    expect(input.attrs).toMatchObject({
      type: 'range',
      min: '0',
      max: '10',
      step: '1',
      value: '5',
    });
    slider.props.orientation = 'vertical';
    const upright = all(renderObject(slider, live)).find((node) => node.tag === 'input')!;
    expect(upright.attrs['aria-orientation']).toBe('vertical');
  });

  it('a dial drawn its own way turns its pointer about its pivot, over its round face (B16)', () => {
    const dial = createDialObject({ x: 0, y: 0, width: 26, height: 141 });
    Object.assign(dial.props, { min: -122, max: 121, step: 1, initial: 4 });
    dial.props.look = {
      pointer: 'M0.5 0L0.08 0.74L0.5 1L0.92 0.74Z',
      pivot: { x: 0.5, y: 0.74 },
      from: -50.4,
      to: 46.8,
      face: { asset: HASH, size: 26 },
    };
    const nodes = all(renderObject(dial, context()));
    // At 4, (4 + 122) / 243 of the way from -50.4° to 46.8°: 0°, about the pivot (13, 104.34).
    const pointer = nodes.find((node) => node.attrs['class'] === 'vo-dial-pointer')!;
    expect(pointer.attrs['transform']).toBe('rotate(0 13 104.34)');
    expect(pointer.attrs['data-pivot']).toBe('13 104.34');
    expect(find(pointer, 'path')[0]!.attrs['d']).toBe('M13 0L2.08 104.34L13 141L23.92 104.34Z');
    // The face: the picture, 26 across, centred on the pivot and clipped round.
    const image = nodes.find((node) => node.tag === 'image')!;
    expect(image.attrs).toMatchObject({ href: `asset://${HASH}`, x: '0', y: '91.34', width: '26' });
    expect(nodes.find((node) => node.tag === 'clipPath')).toBeDefined();
    expect(nodes.find((node) => node.attrs['class'] === 'vo-dial-pivot')).toBeDefined();
    // No track or value arc.
    expect(nodes.find((node) => node.attrs['class'] === 'vo-dial-value')).toBeUndefined();
  });

  it('a dial draws its arc filled to its value and a pointer, and is a slider in a course', () => {
    const project = createEmptyProject();
    const dial = createDialObject();
    Object.assign(dial.props, { min: 0, max: 100, step: 1, initial: 25 });
    const picture = all(
      renderObject(dial, createRenderContext(project, { assetUrl: () => undefined })),
    );
    // A quarter of the sweep: 25 of 100 is 25% of the arc, and the pointer at -135 + 0.25 × 270 = -67.5°.
    expect(
      picture.find((node) => node.attrs['class'] === 'vo-dial-value')?.attrs['stroke-dasharray'],
    ).toBe('25 100');
    expect(
      picture.find((node) => node.attrs['class'] === 'vo-dial-pointer')?.attrs['transform'],
    ).toBe('rotate(-67.5 50 50)');
    const live = renderObject(
      dial,
      createRenderContext(project, { assetUrl: () => undefined, liveMedia: true }),
    );
    expect(live.attrs).toMatchObject({
      role: 'slider',
      tabindex: '0',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': '25',
    });
  });
});

describe('scrolling panels (P9.5)', () => {
  /** Two shapes stacked 400 high, from (100, 50), in a group that shows its top 150. */
  function panel() {
    const top = createShapeObject({ kind: 'rect' }, { x: 100, y: 50, width: 200, height: 100 });
    const bottom = createShapeObject({ kind: 'rect' }, { x: 100, y: 350, width: 200, height: 100 });
    const group = createGroupObject([top, bottom]);
    group.scroll = { height: 150 };
    return { group, top, bottom };
  }

  it('in a course, clip to the window and scroll, a named region with the content at full height', () => {
    const { group, top } = panel();
    const live = renderObject(
      group,
      createRenderContext(createEmptyProject(), { assetUrl: () => undefined, liveMedia: true }),
    );
    expect(live.attrs).toMatchObject({ role: 'region', tabindex: '0', 'aria-label': 'Group' });
    expect(live.style).toMatchObject({
      left: '100px',
      top: '50px',
      width: '200px',
      height: '150px',
      'overflow-y': 'auto',
    });
    const content = live.children[0] as RenderNode;
    expect(content.style).toMatchObject({ height: '400px' });
    // The objects are drawn at their stage positions, inside a layer moved back by the panel's.
    const layer = content.children[0] as RenderNode;
    expect(layer.style).toMatchObject({ left: '-100px', top: '-50px' });
    expect((layer.children[0] as RenderNode).attrs['data-object-id']).toBe(top.id);
  });

  it('in a thumbnail, clip without scrolling; in the editor, draw it all with the window outlined', () => {
    const { group } = panel();
    const project = createEmptyProject();
    const thumb = renderObject(group, createRenderContext(project, { assetUrl: () => undefined }));
    expect(thumb.style['overflow-y']).toBe('hidden');
    expect(thumb.attrs['role']).toBeUndefined();
    const editor = renderObject(
      group,
      createRenderContext(project, { assetUrl: () => undefined, mediaMarkers: true }),
    );
    const outline = all(editor).find((node) => node.attrs['class'] === 'vo-scroll-window')!;
    expect(outline.style).toMatchObject({ top: '50px', height: '150px' });
    expect(JSON.stringify(outline)).toContain('Scroll window');
  });

  it('show no more than the group itself when it is made shorter than its window', () => {
    const { group } = panel();
    group.scroll = { height: 1000 };
    const live = renderObject(
      group,
      createRenderContext(createEmptyProject(), { assetUrl: () => undefined, liveMedia: true }),
    );
    expect(live.style['height']).toBe('400px');
  });
});

describe('web objects (P9.6)', () => {
  const project = createEmptyProject();
  const live = (extra: Partial<Parameters<typeof createRenderContext>[1]> = {}) =>
    createRenderContext(project, {
      assetUrl: () => undefined,
      liveMedia: true,
      webUrl: (id, path) => `content/web/${id}/${path}`,
      ...extra,
    });
  const url = () => createWebObject({ kind: 'url', url: 'https://example.com/a' }, 'Example');
  const folder = () =>
    createWebObject(
      { kind: 'folder', files: { 'index.html': 'f'.repeat(64) }, entry: 'index.html' },
      'Game',
    );

  it('in a course, a sandboxed frame from the address or the folder', () => {
    const fromUrl = all(renderObject(url(), live())).find((node) => node.tag === 'iframe')!;
    expect(fromUrl.attrs).toMatchObject({
      src: 'https://example.com/a',
      title: 'Example',
      sandbox: 'allow-scripts allow-forms allow-popups',
      referrerpolicy: 'no-referrer',
    });
    expect(fromUrl.attrs['sandbox']).not.toContain('allow-same-origin');
    const web = folder();
    const fromFolder = all(renderObject(web, live())).find((node) => node.tag === 'iframe')!;
    expect(fromFolder.attrs['src']).toBe(`content/web/${web.id}/index.html`);
  });

  it('shown in a new window: a button naming the page', () => {
    const web = url();
    web.props.display = 'window';
    const button = all(renderObject(web, live())).find((node) => node.tag === 'button')!;
    expect(button.attrs).toMatchObject({
      class: 'vo-web-open',
      'data-web-src': 'https://example.com/a',
    });
    expect(button.children).toEqual(['Example']);
  });

  it('elsewhere, and for an address in Preview, a placeholder that loads nothing', () => {
    const editor = createRenderContext(project, { assetUrl: () => undefined, mediaMarkers: true });
    for (const web of [url(), folder()]) {
      expect(all(renderObject(web, editor)).some((node) => node.tag === 'iframe')).toBe(false);
    }
    expect(JSON.stringify(renderObject(folder(), editor))).toContain('Folder: index.html');
    const preview = all(renderObject(url(), live({ remoteWeb: false })));
    expect(preview.some((node) => node.tag === 'iframe')).toBe(false);
    expect(preview.find((node) => node.tag === 'button')?.children).toEqual(['Open in browser']);
    // A folder still runs in Preview: it is the project's own copy.
    expect(
      all(renderObject(folder(), live({ remoteWeb: false }))).some((node) => node.tag === 'iframe'),
    ).toBe(true);
  });
});

describe('graphics (P9.8)', () => {
  const project = createEmptyProject();
  project.theme.colors.text = '#111111';
  project.theme.colors.accent1 = '#ff5678';
  const ctx = createRenderContext(project, { assetUrl: () => undefined });
  const icon = () =>
    createGraphicObject({
      library: 'lucide',
      key: 'heart',
      title: 'Heart',
      viewBox: { width: 24, height: 24 },
      strokeWidth: 2,
      nodes: [
        {
          tag: 'g',
          attrs: { fill: 'none', stroke: 'ink', 'stroke-linejoin': 'round' },
          children: [
            { tag: 'path', attrs: { d: 'M2 9.5L12 20Z' }, children: [] },
            { tag: 'circle', attrs: { cx: '12', cy: '8', r: '2', fill: 'accent' }, children: [] },
            {
              tag: 'rect',
              attrs: { x: '1', y: '1', width: '4', height: '4', fill: '#00ff00' },
              children: [],
            },
          ],
        },
      ],
    });

  it('draws its shapes in an SVG kept in proportion, ink and accent in the object’s colours', () => {
    const graphic = icon();
    graphic.frame.width = 200;
    graphic.frame.height = 100;
    const node = renderObject(graphic, ctx);
    const svg = only(node, 'svg');
    expect(svg.attrs).toMatchObject({
      class: 'vo-graphic',
      width: '200',
      height: '100',
      viewBox: '0 0 24 24',
      preserveAspectRatio: 'xMidYMid meet',
      'stroke-width': '2',
    });
    expect(only(node, 'g').attrs).toMatchObject({ stroke: '#111111', fill: 'none' });
    expect(only(node, 'circle').attrs['fill']).toBe('#ff5678');
    expect(only(node, 'rect').attrs['fill']).toBe('#00ff00');
    expect(only(node, 'path').attrs['d']).toBe('M2 9.5L12 20Z');
    // Fixed colours, and a line width of its own.
    graphic.props.ink = '#0000aa';
    graphic.props.strokeWidth = 1.5;
    const again = renderObject(graphic, ctx);
    expect(only(again, 'g').attrs['stroke']).toBe('#0000aa');
    expect(only(again, 'svg').attrs['stroke-width']).toBe('1.5');
    graphic.props.strokeWidth = null;
    expect(only(renderObject(graphic, ctx), 'svg').attrs['stroke-width']).toBeUndefined();
  });

  it('is named by its alt text for screen readers, or hidden from them when decorative', () => {
    const graphic = icon();
    expect(only(renderObject(graphic, ctx), 'svg').attrs).toMatchObject({
      role: 'img',
      'aria-label': 'Heart icon',
    });
    graphic.a11y.visibleToAssistiveTech = false;
    const hidden = only(renderObject(graphic, ctx), 'svg').attrs;
    expect(hidden['aria-hidden']).toBe('true');
    expect(hidden['role']).toBeUndefined();
    expect(hidden['aria-label']).toBeUndefined();
  });

  it('writes the same drawing as static markup', () => {
    const markup = toMarkup(renderObject(icon(), ctx));
    expect(markup).toContain('<svg');
    expect(markup).toContain('d="M2 9.5L12 20Z"');
    expect(markup).not.toContain('ink');
  });
});

describe('tables (P9.9)', () => {
  const project = createEmptyProject();
  project.theme.colors.accent1 = '#224488';
  project.theme.colors.background = '#ffffff';
  const ctx = createRenderContext(project, { assetUrl: () => undefined });
  const table = () => {
    const made = createTableObject(3, 3, { width: 400, height: 150 });
    made.props.columns = [1, 2, 1];
    made.props.rows = withCell(made.props, 0, 0, { text: plainRichText('Name') }).rows;
    made.props.rows = withCell(made.props, 1, 1, { text: plainRichText('Body') }).rows;
    return made;
  };

  it('is an HTML table: columns by share, rows by share, header cells as th with scope', () => {
    const node = renderObject(table(), ctx);
    const element = only(node, 'table');
    expect(element.style).toMatchObject({ 'table-layout': 'fixed', 'border-collapse': 'collapse' });
    expect(find(node, 'col').map((col) => col.style['width'])).toEqual(['100px', '200px', '100px']);
    expect(find(node, 'tr').map((row) => row.style['height'])).toEqual(['50px', '50px', '50px']);
    const headers = find(node, 'th');
    expect(headers).toHaveLength(3);
    expect(headers.every((cell) => cell.attrs['scope'] === 'col')).toBe(true);
    expect(headers[0]!.style['background']).toBe('#224488');
    expect(find(node, 'td')).toHaveLength(6);
    // Header text takes the header colour; body text the theme's.
    expect(JSON.stringify(headers[0])).toContain('Name');
    expect(JSON.stringify(headers[0])).toContain('#ffffff');
    expect(JSON.stringify(find(node, 'td')[1])).toContain('Body');
  });

  it('draws a header column, bands, its own cell fill, borders and padding', () => {
    const made = table();
    made.props.headerColumn = true;
    made.props.bandFill = '#eeeeee';
    made.props.borderWidth = 2;
    made.props.borderColor = '#ff0000';
    made.props.padding = 12;
    made.props.rows = withCell(made.props, 1, 2, { fill: '#00ff00' }).rows;
    const node = renderObject(made, ctx);
    const rows = find(node, 'tr');
    // Row 2 (the first body row) has a header cell first, scoped to the row.
    const second = rows[1]!.children as RenderNode[];
    expect(second[0]!.tag).toBe('th');
    expect(second[0]!.attrs['scope']).toBe('row');
    expect(second[2]!.style['background']).toBe('#00ff00');
    // Bands start on the second body row.
    const third = rows[2]!.children as RenderNode[];
    expect(third[1]!.style['background']).toBe('#eeeeee');
    expect(second[1]!.style['background']).toBeUndefined();
    expect(second[1]!.style['border']).toBe('2px solid #ff0000');
    made.props.borderWidth = 0;
    expect(find(renderObject(made, ctx), 'td')[0]!.style['border']).toBe('none');
  });

  it('is named by its alt text, and writes static markup with void columns', () => {
    const made = table();
    made.a11y.altText = 'Prices';
    expect(only(renderObject(made, ctx), 'table').attrs['aria-label']).toBe('Prices');
    const markup = toMarkup(renderObject(made, ctx));
    expect(markup).toContain('<col style=');
    expect(markup).not.toContain('</col>');
    expect(markup).toContain('scope="col"');
  });
});

describe('360° images (P9.10)', () => {
  const PICTURE = 'a'.repeat(64);
  const project = createEmptyProject();
  project.assets[PICTURE] = {
    kind: 'image',
    fileName: 'room.jpg',
    ext: 'jpg',
    mimeType: 'image/jpeg',
    byteLength: 1,
  };
  const panorama = () => {
    const made = createPanoramaObject(PICTURE, { width: 400, height: 200 });
    made.props.spots = [
      createPanoramaSpot('Door', 90, 0),
      createPanoramaSpot('Sky', 0, 90, 'hotspot'),
    ];
    return made;
  };
  const flat = (markers = false) =>
    createRenderContext(project, { assetUrl: (hash) => `asset://${hash}`, mediaMarkers: markers });

  it('maps directions to the flat picture and back', () => {
    expect(panoramaPoint(0, 0)).toEqual({ x: 0.5, y: 0.5 });
    expect(panoramaPoint(-180, 90)).toEqual({ x: 0, y: 0 });
    expect(panoramaPoint(90, -45)).toEqual({ x: 0.75, y: 0.75 });
    expect(panoramaDirection(0.75, 0.25)).toEqual({ yaw: 90, pitch: 45 });
    expect(panoramaDirection(-1, 2)).toEqual({ yaw: -180, pitch: -90 });
  });

  it('outside a course: the whole picture flat, a dot at each spot, numbered in the editor', () => {
    const node = renderObject(panorama(), flat());
    expect(only(node, 'img').attrs['src']).toBe(`asset://${PICTURE}`);
    const dots = all(node).filter((each) => each.attrs['class'] === 'vo-panorama-dot');
    expect(dots).toHaveLength(2);
    // Yaw 90 is three quarters across, the horizon half way down; the dot is 14 across.
    expect(dots[0]!.style).toMatchObject({ left: '293px', top: '93px' });
    expect(dots[0]!.children).toEqual([]);
    const editor = all(renderObject(panorama(), flat(true))).filter(
      (each) => each.attrs['class'] === 'vo-panorama-dot',
    );
    expect(editor.map((dot) => dot.children)).toEqual([['1'], ['2']]);
  });

  it('in a course: a focusable view with its start, and a button per spot named by it', () => {
    const live = createRenderContext(project, {
      assetUrl: (hash) => `content/${hash}`,
      liveMedia: true,
    });
    const made = panorama();
    made.props.mode = 'guided';
    made.props.start = { yaw: 30, pitch: -10, fov: 60 };
    const node = renderObject(made, live);
    const view = all(node).find((each) => each.attrs['class'] === 'vo-panorama')!;
    expect(view.attrs).toMatchObject({
      'data-panorama-src': `content/${PICTURE}`,
      'data-mode': 'guided',
      'data-yaw': '30',
      'data-pitch': '-10',
      'data-fov': '60',
      tabindex: '0',
      'aria-label': '360° Image',
    });
    expect(find(node, 'canvas')).toHaveLength(1);
    const buttons = find(node, 'button');
    expect(buttons.map((button) => button.attrs['aria-label'])).toEqual(['1: Door', '2: Sky']);
    expect(buttons[0]!.attrs['aria-haspopup']).toBe('dialog');
    expect(buttons[1]!.attrs['aria-haspopup']).toBeUndefined();
  });
});

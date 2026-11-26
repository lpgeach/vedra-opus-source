import {
  createAudioObject,
  createChoiceObject,
  createZoomRegion,
  createHotspotObject,
  createMarkerObject,
  createSliderObject,
  createDialObject,
  createGraphicObject,
  createTableObject,
  createPanoramaObject,
  createPanoramaSpot,
  withCell,
  createButtonObject,
  createEmptyProject,
  createGroupObject,
  createImageObject,
  createShapeObject,
  createVideoObject,
  shapePreset,
  shapePresetNames,
} from '@vedraopus/model';
import type {
  Appearance,
  Fill,
  GraphicNode,
  SceneObject,
  ShapeGeometry,
  ShapeObject,
} from '@vedraopus/model';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRenderContext, renderObject, toMarkup } from '../src/index';
import { expect, test } from '@playwright/test';

/**
 * One screenshot per case, each a single object (or small group) on a white
 * 320×240 canvas. No case contains text: fonts differ between systems, and
 * text gets its own snapshots with bundled fonts in P2.4.
 */

const IMAGE = 'a'.repeat(64);
const MISSING = 'b'.repeat(64);

/**
 * A 200×100 test picture drawn as SVG, so it is identical everywhere and has
 * no lossy compression: four coloured quarters with a white disc in the
 * middle. Cropping and "cover" placement are easy to tell apart on it.
 */
const TEST_PICTURE =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
      '<rect width="100" height="50" fill="#e5484d"/>' +
      '<rect x="100" width="100" height="50" fill="#2f6fed"/>' +
      '<rect y="50" width="100" height="50" fill="#f5a524"/>' +
      '<rect x="100" y="50" width="100" height="50" fill="#12a594"/>' +
      '<circle cx="100" cy="50" r="30" fill="#ffffff"/>' +
      '</svg>',
  );

const project = createEmptyProject();
project.assets[IMAGE] = {
  kind: 'image',
  fileName: 'quarters.svg',
  ext: 'svg',
  mimeType: 'image/svg+xml',
  byteLength: 400,
  width: 200,
  height: 100,
};
const context = createRenderContext(project, { assetUrl: () => TEST_PICTURE });

const FRAME = { x: 60, y: 50, width: 200, height: 140 };

function shape(
  geometry: ShapeGeometry,
  appearance: Partial<Appearance> = {},
  frame: Partial<SceneObject['frame']> = {},
): ShapeObject {
  const object = createShapeObject(geometry, { ...FRAME, ...frame });
  Object.assign(object.props.appearance, appearance);
  return object;
}

const solid = (color: string): Fill => ({ kind: 'solid', color });
const outline = (width: number, dash: 'solid' | 'dash' | 'dot' = 'solid', color = '#1c2024') => ({
  color,
  width,
  dash,
});
const gradient = (angle: number, ...colors: string[]): Fill => ({
  kind: 'gradient',
  angle,
  stops: colors.map((color, index) => ({ offset: index / (colors.length - 1), color })),
});

const cases: Record<string, () => SceneObject> = {
  // ---- geometry
  'shape-rect': () => shape({ kind: 'rect' }),
  'shape-round-rect': () => shape({ kind: 'roundRect', radius: 24 }),
  'shape-round-rect-radius-capped': () => shape({ kind: 'roundRect', radius: 500 }),
  'shape-ellipse': () => shape({ kind: 'ellipse' }),
  'shape-triangle': () => shape({ kind: 'triangle' }),
  'shape-line': () =>
    shape({ kind: 'line' }, { fill: { kind: 'none' }, stroke: outline(4) }, { y: 120, height: 0 }),
  'shape-arrow': () =>
    shape({ kind: 'arrow' }, { fill: { kind: 'none' }, stroke: outline(4) }, { y: 120, height: 0 }),
  'shape-arrow-thick-rotated': () =>
    shape(
      { kind: 'arrow' },
      { fill: { kind: 'none' }, stroke: outline(12, 'solid', '#8e4ec6') },
      { y: 120, height: 0, rotation: -35 },
    ),
  // A path shape (B13): a box with a hole and a tail past its edge, outlined; a filled band
  // with no outline; and an outlined line with no fill.
  'shape-path-hole-tail-and-line': () =>
    shape(
      {
        kind: 'path',
        paths: [
          {
            d: 'M0 0L1 0L1 1L0.6 1L0.9 1.25L0.35 1L0 1ZM0.2 0.2L0.2 0.8L0.8 0.8L0.8 0.2Z',
            fill: true,
            stroke: true,
          },
          { d: 'M0.3 0.4L0.7 0.4L0.7 0.6L0.3 0.6Z', fill: true, stroke: false },
          { d: 'M0.05 0.05C0.3 -0.2 0.7 -0.2 0.95 0.05', fill: false, stroke: true },
        ],
      },
      { fill: solid('#2f6fed'), stroke: outline(3) },
      { y: 30, height: 150 },
    ),
  ...Object.fromEntries(
    shapePresetNames.map((name) => [
      `preset-${name}`,
      () => shape(shapePreset(name), { stroke: outline(3) }),
    ]),
  ),

  // ---- fill
  'fill-none-outline-only': () =>
    shape({ kind: 'ellipse' }, { fill: { kind: 'none' }, stroke: outline(6) }),
  'fill-translucent-colour': () => shape({ kind: 'rect' }, { fill: solid('#e5484d80') }),
  'fill-gradient-0': () => shape({ kind: 'rect' }, { fill: gradient(0, '#2f6fed', '#f5a524') }),
  'fill-gradient-90': () => shape({ kind: 'rect' }, { fill: gradient(90, '#2f6fed', '#f5a524') }),
  'fill-gradient-45-three-stops': () =>
    shape({ kind: 'ellipse' }, { fill: gradient(45, '#e5484d', '#ffffff', '#12a594') }),
  'fill-image-covers-shape': () =>
    shape(shapePreset('star'), { fill: { kind: 'image', asset: IMAGE } }),
  'fill-image-missing': () =>
    shape({ kind: 'roundRect', radius: 16 }, { fill: { kind: 'image', asset: MISSING } }),

  // ---- outline
  'outline-thick': () => shape({ kind: 'triangle' }, { stroke: outline(12, 'solid', '#12a594') }),
  'outline-dash': () => shape({ kind: 'roundRect', radius: 20 }, { stroke: outline(5, 'dash') }),
  'outline-dot': () => shape({ kind: 'ellipse' }, { stroke: outline(6, 'dot') }),
  'line-dash': () =>
    shape(
      { kind: 'line' },
      { fill: { kind: 'none' }, stroke: outline(6, 'dash', '#e5484d') },
      { y: 120, height: 0, rotation: 20 },
    ),

  // ---- effects
  'effect-shadow-follows-outline': () =>
    shape(shapePreset('star'), {
      shadow: { color: '#00000080', offsetX: 8, offsetY: 10, blur: 6 },
    }),
  'effect-shadow-hard': () =>
    shape(
      { kind: 'roundRect', radius: 16 },
      { shadow: { color: '#8e4ec6', offsetX: 12, offsetY: 12, blur: 0 } },
    ),
  'effect-rotation': () =>
    shape({ kind: 'rect' }, { fill: gradient(0, '#2f6fed', '#12a594') }, { rotation: 30 }),
  'effect-opacity': () =>
    createGroupObject([
      shape(
        { kind: 'rect' },
        { fill: solid('#1c2024') },
        { x: 40, y: 40, width: 140, height: 100 },
      ),
      shape(
        { kind: 'ellipse' },
        { fill: solid('#f5a524'), opacity: 0.5 },
        { x: 110, y: 80, width: 170, height: 120 },
      ),
    ]),

  // ---- images
  'image-plain': () => createImageObject(IMAGE, { x: 60, y: 70, width: 200, height: 100 }),
  'image-stretched-to-frame': () => createImageObject(IMAGE, FRAME),
  'image-cropped-right-half': () => {
    const image = createImageObject(IMAGE, { x: 110, y: 70, width: 100, height: 100 });
    image.props.crop = { x: 0.5, y: 0, width: 0.5, height: 1 };
    return image;
  },
  'image-cropped-centre': () => {
    const image = createImageObject(IMAGE, { x: 60, y: 70, width: 200, height: 100 });
    image.props.crop = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    return image;
  },
  'image-rotated-translucent': () => {
    const image = createImageObject(IMAGE, { x: 60, y: 70, width: 200, height: 100, rotation: 15 });
    image.props.opacity = 0.6;
    return image;
  },
  'image-missing': () => createImageObject(MISSING, FRAME),

  // ---- buttons (without labels; see the note at the top)
  'button-default': () => createButtonObject('', { x: 80, y: 96, width: 160, height: 48 }),
  'button-styled': () => {
    const button = createButtonObject('', { x: 60, y: 80, width: 200, height: 80 });
    button.props.cornerRadius = 40;
    button.props.appearance = {
      fill: gradient(90, '#12a594', '#0b6b60'),
      stroke: outline(3, 'solid', '#0b6b60'),
      shadow: { color: '#00000059', offsetX: 0, offsetY: 6, blur: 8 },
      opacity: 1,
    };
    return button;
  },

  // ---- groups
  'group-overlapping-in-order': () =>
    createGroupObject([
      shape(
        { kind: 'rect' },
        { fill: solid('#2f6fed') },
        { x: 40, y: 40, width: 140, height: 100 },
      ),
      shape(
        { kind: 'ellipse' },
        { fill: solid('#f5a524') },
        { x: 110, y: 70, width: 140, height: 100 },
      ),
      shape(
        { kind: 'triangle' },
        { fill: solid('#e5484d'), stroke: outline(3) },
        { x: 170, y: 110, width: 110, height: 100 },
      ),
    ]),
};

for (const [name, make] of Object.entries(cases)) {
  test(name, async ({ page }) => {
    const markup = toMarkup(renderObject(make(), context));
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:#ffffff">${markup}</body></html>`,
    );
    // Pictures decode asynchronously; a screenshot taken too early would be blank.
    await page.evaluate(() =>
      Promise.all([...document.images].map((image) => image.decode().catch(() => undefined))),
    );
    await expect(page).toHaveScreenshot(`${name}.png`);
  });
}

test('video-poster', async ({ page }) => {
  // No playable file here: the poster shows, letterboxed on black within the frame.
  const video = createVideoObject('a'.repeat(64), 5, { x: 30, y: 40, width: 260, height: 160 });
  video.props.poster = IMAGE;
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:#ffffff">${toMarkup(renderObject(video, context))}</body></html>`,
  );
  await page.waitForTimeout(300);
  await expect(page).toHaveScreenshot('video-poster.png');
});

test('audio-marker', async ({ page }) => {
  // The editor's stage marks where sound sits; a course draws an empty box (next test).
  const audio = createAudioObject('a'.repeat(64), 3, { x: 60, y: 50, width: 48, height: 48 });
  const marked = createRenderContext(project, { assetUrl: () => undefined, mediaMarkers: true });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:#ffffff">${toMarkup(renderObject(audio, marked))}</body></html>`,
  );
  await expect(page).toHaveScreenshot('audio-marker.png');
});

test('audio draws nothing in a course', async ({ page }) => {
  const audio = createAudioObject('a'.repeat(64), 3, { x: 60, y: 50, width: 48, height: 48 });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:#ffffff">${toMarkup(renderObject(audio, context))}</body></html>`,
  );
  const box = page.locator('[data-object-type="audio"]');
  await expect(box).toHaveCount(1);
  expect(await box.evaluate((element) => element.childElementCount)).toBe(0);
});

test('choices', async ({ page }) => {
  // A question's answers (P7.1): round and square marks, picked and not. No words: this file
  // has no text (fonts differ between systems); render.test.ts checks the words.
  const choices = [
    createChoiceObject('', 'radio', { x: 20, y: 20, width: 280, height: 40 }),
    createChoiceObject('', 'radio', { x: 20, y: 70, width: 280, height: 40 }),
    createChoiceObject('', 'checkbox', { x: 20, y: 120, width: 280, height: 40 }),
    createChoiceObject('', 'checkbox', { x: 20, y: 170, width: 280, height: 40 }),
  ];
  const markup = choices
    .map((choice, i) => toMarkup(renderObject(choice, context, i % 2 ? 'selected' : 'normal')))
    .join('');
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:#ffffff">${markup}</body></html>`,
  );
  await expect(page).toHaveScreenshot('choices.png');
});

test('zoom-region-marker', async ({ page }) => {
  // The editor's stage frames a zoom region (P6.7); a course draws nothing for it.
  const region = createZoomRegion(
    { width: 960, height: 540 },
    { x: 20, y: 20, width: 240, height: 135 },
  );
  const marked = createRenderContext(project, { assetUrl: () => undefined, mediaMarkers: true });
  await page.setContent(
    // Its label is text, which this file leaves out (fonts differ between systems).
    `<!doctype html><html><head><style>.vo-zoom-label{visibility:hidden}</style></head><body style="margin:0;background:#ffffff">${toMarkup(renderObject(region, marked))}</body></html>`,
  );
  await expect(page).toHaveScreenshot('zoom-region-marker.png');
});

test('two renderings in one page with different id prefixes both paint', async ({ page }) => {
  // The first copy is hidden. If both copies shared ids, the visible one's
  // gradient would point at the hidden copy's definition and paint nothing.
  const object = shape({ kind: 'rect' }, { fill: gradient(0, '#2f6fed', '#f5a524') });
  const copy = (idPrefix: string) =>
    toMarkup(
      renderObject(object, createRenderContext(project, { assetUrl: () => undefined, idPrefix })),
    );
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:#ffffff">` +
      `<div style="display:none">${copy('hidden-')}</div>${copy('shown-')}</body></html>`,
  );
  await expect(page).toHaveScreenshot('fill-gradient-0.png');
});

test('markers', async ({ page }) => {
  // The five marker icons (P9.1), in a dark and a light colour, so both glyph inks show.
  const icons = ['plus', 'info', 'question', 'pin', 'star'] as const;
  const markers = icons.flatMap((icon, index) =>
    ['#2f6fed', '#ffd23f'].map((color, row) => {
      const marker = createMarkerObject({
        x: 20 + index * 60,
        y: 60 + row * 70,
        width: 40,
        height: 40,
      });
      marker.props.icon = icon;
      marker.props.color = color;
      return marker;
    }),
  );
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:#ffffff">${markers
      .map((marker) => toMarkup(renderObject(marker, context)))
      .join('')}</body></html>`,
  );
  await expect(page).toHaveScreenshot('markers.png');
});

test('hotspot-marked', async ({ page }) => {
  // The editor's stage shows where hotspots are (P9.1): a rectangle and an ellipse. Their
  // word is hidden here (no text in these cases); render.test.ts checks it.
  const marked = createRenderContext(project, { assetUrl: () => undefined, mediaMarkers: true });
  const rect = createHotspotObject({ x: 20, y: 40, width: 130, height: 160 });
  const ellipse = createHotspotObject({ x: 170, y: 40, width: 130, height: 160 }, 'ellipse');
  await page.setContent(
    `<!doctype html><html><head><style>.vo-hotspot-label{visibility:hidden}</style></head>` +
      `<body style="margin:0;background:#ffffff">${toMarkup(renderObject(rect, marked))}${toMarkup(renderObject(ellipse, marked))}</body></html>`,
  );
  await expect(page).toHaveScreenshot('hotspot-marked.png');
});

test('sliders-dials', async ({ page }) => {
  // Sliders across and upright and a dial (P9.4), as the editor and thumbnails draw them.
  const across = createSliderObject({ x: 20, y: 30, width: 200, height: 40 });
  Object.assign(across.props, { min: 0, max: 10, initial: 7 });
  const upright = createSliderObject({ x: 250, y: 20, width: 40, height: 200 });
  Object.assign(upright.props, { min: 0, max: 10, initial: 3, orientation: 'vertical' });
  const dial = createDialObject({ x: 40, y: 100, width: 120, height: 120 });
  Object.assign(dial.props, { min: 0, max: 100, initial: 60 });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:#ffffff">${[across, upright, dial]
      .map((object) => toMarkup(renderObject(object, context)))
      .join('')}</body></html>`,
  );
  await expect(page).toHaveScreenshot('sliders-dials.png');
});

test('dial-looked', async ({ page }) => {
  // A dial drawn its own way (B16): a needle turning about its pivot over a round face, the
  // whole dial turned, as Sample B's imported one is.
  const dial = createDialObject({ x: 140, y: 40, width: 26, height: 141, rotation: 160 });
  Object.assign(dial.props, { min: -122, max: 121, initial: 60, color: '#f5a524' });
  dial.props.look = {
    pointer: 'M0.5 0L0.0769 0.74L0.5 1L0.9231 0.74Z',
    pivot: { x: 0.5, y: 0.74 },
    from: -50.4,
    to: 46.8,
    face: { asset: IMAGE, size: 40 },
  };
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:#ffffff">${toMarkup(renderObject(dial, context))}</body></html>`,
  );
  await page.evaluate(() =>
    Promise.all([...document.images].map((image) => image.decode().catch(() => undefined))),
  );
  await expect(page).toHaveScreenshot('dial-looked.png');
});

test('graphics', async ({ page }) => {
  // Library icons and an illustration (P9.8): theme ink, a fixed colour, a thin line, and two colours.
  const library = (file: string) =>
    JSON.parse(
      readFileSync(
        join(import.meta.dirname, '../../../apps/desktop/src/renderer/library', file),
        'utf8',
      ),
    ) as {
      library: 'lucide' | 'openDoodles';
      viewBox: { width: number; height: number };
      strokeWidth: number | null;
      items: {
        key: string;
        title: string;
        viewBox?: { width: number; height: number };
        nodes: GraphicNode[];
      }[];
    };
  const item = (file: string, key: string) => {
    const data = library(file);
    const found = data.items.find((each) => each.key === key)!;
    return {
      library: data.library,
      key,
      title: found.title,
      viewBox: found.viewBox ?? data.viewBox,
      strokeWidth: data.strokeWidth,
      nodes: found.nodes,
    };
  };
  const heart = createGraphicObject(item('lucide.json', 'heart'), {
    x: 10,
    y: 10,
    width: 64,
    height: 64,
  });
  const camera = createGraphicObject(item('lucide.json', 'camera'), {
    x: 90,
    y: 10,
    width: 64,
    height: 64,
  });
  camera.props.ink = '#e5484d';
  const star = createGraphicObject(item('lucide.json', 'star'), {
    x: 170,
    y: 10,
    width: 64,
    height: 64,
  });
  star.props.strokeWidth = 1;
  // Wider than its drawing's proportions: drawn in the middle.
  const reading = createGraphicObject(item('open-doodles.json', 'reading'), {
    x: 10,
    y: 90,
    width: 300,
    height: 140,
  });
  reading.props.accent = '#30a46c';
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:#ffffff">${[heart, camera, star, reading]
      .map((object) => toMarkup(renderObject(object, context)))
      .join('')}</body></html>`,
  );
  await expect(page).toHaveScreenshot('graphics.png');
});

test('table', async ({ page }) => {
  // A table (P9.9) without text: header row and column, bands, a cell fill, shares and borders.
  const table = createTableObject(3, 5, { x: 10, y: 10, width: 300, height: 200 });
  table.props.columns = [1, 2, 1];
  table.props.headerColumn = true;
  table.props.bandFill = '#e6ebf2';
  table.props.borderColor = '#5b6470';
  table.props.borderWidth = 2;
  table.props.rows = withCell(table.props, 2, 2, { fill: '#30a46c' }).rows;
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:#ffffff">${toMarkup(renderObject(table, context))}</body></html>`,
  );
  await expect(page).toHaveScreenshot('table.png');
});

test('panorama-flat', async ({ page }) => {
  // A 360° image (P9.10) as thumbnails draw it: the whole picture, a dot at each spot (a marker, a hotspot).
  const panorama = createPanoramaObject(IMAGE, { x: 10, y: 20, width: 300, height: 150 });
  panorama.props.spots = [
    createPanoramaSpot('Door', 90, 30),
    createPanoramaSpot('Window', -120, -20, 'hotspot'),
  ];
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:#ffffff">${toMarkup(renderObject(panorama, context))}</body></html>`,
  );
  await expect(page).toHaveScreenshot('panorama-flat.png');
});

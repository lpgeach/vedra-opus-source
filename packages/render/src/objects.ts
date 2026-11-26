/**
 * Renderers for each object type. Every object gets the same wrapper — an
 * absolutely positioned box at its frame, rotated about its centre — with the
 * type's own drawing inside. See docs/briefs/P2.3-object-renderers.md.
 */
import type {
  Appearance,
  AudioObject,
  ButtonObject,
  Fill,
  GroupObject,
  ImageObject,
  Layer,
  SceneObject,
  Shadow,
  ShapeObject,
  Slide,
  Stroke,
  TextObject,
  VideoObject,
  ZoomRegionObject,
  HotspotObject,
  MarkerIcon,
  MarkerObject,
  SliderObject,
  DialObject,
  WebObject,
  GraphicObject,
  TableObject,
  PanoramaObject,
  GraphicNode,
  ChoiceObject,
  DropdownObject,
  TextEntryObject,
} from '@vedraopus/model';
import { tableLayout, textOnAccent } from '@vedraopus/model';
import { resolveColor } from './context';
import type { RenderContext } from './context';
import {
  closedPath,
  coverPlacement,
  scaledPath,
  cropPlacement,
  gradientLine,
  isOpen,
  linePath,
  roundRectPath,
} from './geometry';
import { h, num, px } from './node';
import type { RenderNode } from './node';
import { renderTextBlock } from './text';

type Value = string | number | null | undefined | false;

/** Shown where an image should be but its file cannot be loaded. */
const MISSING = { fill: '#e3e5e8', line: '#a9aeb6' };

// ------------------------------------------------------------------- wrapper

function shadowFilter(shadow: Shadow | null, context: RenderContext): string | false {
  if (!shadow) return false;
  // drop-shadow follows the drawn outline (a star casts a star-shaped shadow),
  // unlike box-shadow, which would follow the rectangular frame.
  const color = resolveColor(shadow.color, context);
  return `drop-shadow(${px(shadow.offsetX)} ${px(shadow.offsetY)} ${px(shadow.blur)} ${color})`;
}

function wrapper(
  object: SceneObject,
  style: Record<string, Value>,
  children: (RenderNode | null)[],
): RenderNode {
  const { x, y, width, height, rotation } = object.frame;
  return h(
    'div',
    {
      attrs: {
        class: 'vo-object',
        'data-object-id': object.id,
        'data-object-type': object.type,
      },
      style: {
        position: 'absolute',
        left: px(x),
        top: px(y),
        width: px(width),
        height: px(height),
        transform: rotation !== 0 && `rotate(${num(rotation)}deg)`,
        ...style,
      },
    },
    children,
  );
}

const appearanceStyle = (appearance: Appearance, context: RenderContext) => ({
  opacity: appearance.opacity < 1 && appearance.opacity,
  filter: shadowFilter(appearance.shadow, context),
});

// --------------------------------------------------------------------- paint

interface Paint {
  /** Value for the `fill` attribute. */
  fill: string;
  /** A gradient or pattern the fill refers to. */
  def?: RenderNode;
}

function paint(
  fill: Fill,
  id: string,
  width: number,
  height: number,
  context: RenderContext,
): Paint {
  switch (fill.kind) {
    case 'none':
      return { fill: 'none' };
    case 'solid':
      return { fill: resolveColor(fill.color, context) };
    case 'gradient':
      return {
        fill: `url(#${id})`,
        def: h(
          'linearGradient',
          {
            attrs: {
              id,
              gradientUnits: 'userSpaceOnUse',
              ...gradientLine(fill.angle, width, height),
            },
          },
          fill.stops.map((stop) =>
            h('stop', {
              attrs: { offset: stop.offset, 'stop-color': resolveColor(stop.color, context) },
            }),
          ),
        ),
      };
    case 'image': {
      const url = context.assetUrl(fill.asset);
      if (!url) return { fill: MISSING.fill };
      // Cover the shape, centred, cropping whatever overflows. When the
      // picture's size is known the placement is worked out here, because
      // engines disagree about `preserveAspectRatio` on a picture that is
      // itself an SVG (Chromium letterboxes it). `slice` is the fallback for
      // pictures imported without a size.
      const meta = context.assets[fill.asset];
      const placed =
        meta?.width && meta.height
          ? { ...coverPlacement(meta.width, meta.height, width, height) }
          : { x: 0, y: 0, width, height, preserveAspectRatio: 'xMidYMid slice' };
      return {
        fill: `url(#${id})`,
        def: h('pattern', { attrs: { id, patternUnits: 'userSpaceOnUse', width, height } }, [
          h('image', { attrs: { href: url, ...placed } }),
        ]),
      };
    }
  }
}

function strokeAttrs(stroke: Stroke | null, context: RenderContext): Record<string, Value> {
  if (!stroke || stroke.width <= 0) return { stroke: 'none' };
  const { width } = stroke;
  return {
    stroke: resolveColor(stroke.color, context),
    'stroke-width': width,
    // Dashes scale with the outline so thick and thin lines look alike.
    'stroke-dasharray':
      stroke.dash === 'dash'
        ? `${num(width * 3)} ${num(width * 2)}`
        : stroke.dash === 'dot'
          ? `0 ${num(width * 2)}`
          : false,
    // A zero-length dash with round ends draws a dot.
    'stroke-linecap': stroke.dash === 'dot' && 'round',
  };
}

/**
 * The SVG canvas inside an object's box. Its content may spill outside (an
 * outline is centred on the edge), so overflow is visible. An SVG with a zero
 * width or height draws nothing at all, which would hide a perfectly
 * horizontal line, so each side is at least one pixel.
 */
function canvas(
  width: number,
  height: number,
  children: (RenderNode | null | false)[],
): RenderNode {
  const [w, h_] = [Math.max(width, 1), Math.max(height, 1)];
  return h(
    'svg',
    {
      attrs: { width: w, height: h_, viewBox: `0 0 ${num(w)} ${num(h_)}`, 'aria-hidden': 'true' },
      style: { position: 'absolute', left: '0', top: '0', display: 'block', overflow: 'visible' },
    },
    children,
  );
}

/** A filled, outlined path with whatever definitions its fill needs. */
function paintedPath(
  d: string | { d: string; fill: boolean; stroke: boolean }[],
  appearance: Appearance,
  object: SceneObject,
  context: RenderContext,
): RenderNode {
  const { width, height } = object.frame;
  const { fill, def } = paint(
    appearance.fill,
    `${context.idPrefix}${object.id}-fill`,
    width,
    height,
    context,
  );
  const stroke = strokeAttrs(appearance.stroke, context);
  // A path shape's outlines (B13) are each filled, outlined or both.
  const paths =
    typeof d === 'string'
      ? [h('path', { attrs: { d, fill, ...stroke } })]
      : d.map((path) =>
          h('path', {
            attrs: {
              d: path.d,
              fill: path.fill ? fill : 'none',
              ...(path.stroke ? stroke : { stroke: 'none' }),
            },
          }),
        );
  return canvas(width, height, [def ? h('defs', {}, [def]) : null, ...paths]);
}

// --------------------------------------------------------------------- types

function renderShape(object: ShapeObject, context: RenderContext): RenderNode {
  const { geometry, appearance, text } = object.props;
  const { width, height } = object.frame;
  const label = text && renderTextBlock(text, context, { padding: 8, align: 'center' });

  if (!isOpen(geometry)) {
    const outline =
      geometry.kind === 'path'
        ? geometry.paths.map((path) => ({ ...path, d: scaledPath(path.d, width, height) }))
        : closedPath(geometry, width, height);
    return wrapper(object, appearanceStyle(appearance, context), [
      paintedPath(outline, appearance, object, context),
      label,
    ]);
  }

  // A line is its outline: with none, there is nothing to draw.
  const stroke = strokeAttrs(appearance.stroke, context);
  const drawn = stroke['stroke'] !== 'none';
  const parts = linePath(geometry, width, height, appearance.stroke?.width ?? 0);
  return wrapper(object, appearanceStyle(appearance, context), [
    canvas(width, height, [
      drawn && h('path', { attrs: { d: parts.line, fill: 'none', ...stroke } }),
      drawn && parts.head ? h('path', { attrs: { d: parts.head, fill: stroke['stroke'] } }) : null,
    ]),
    label,
  ]);
}

function renderImage(object: ImageObject, context: RenderContext): RenderNode {
  const { asset, crop, opacity } = object.props;
  const { width, height } = object.frame;
  const style = { opacity: opacity < 1 && opacity, overflow: 'hidden' };
  const url = context.assetUrl(asset);

  if (!url) {
    const [w, h_] = [num(width), num(height)];
    return wrapper(object, style, [
      canvas(width, height, [
        h('path', { attrs: { d: roundRectPath(width, height, 0), fill: MISSING.fill } }),
        h('path', {
          attrs: {
            d: `M0 0L${w} ${h_}M${w} 0L0 ${h_}`,
            fill: 'none',
            stroke: MISSING.line,
            'stroke-width': 1,
          },
        }),
      ]),
    ]);
  }

  const placed = cropPlacement(crop, width, height);
  return wrapper(object, style, [
    h('img', {
      attrs: { src: url, alt: object.a11y.altText, draggable: 'false' },
      style: {
        position: 'absolute',
        left: px(placed.left),
        top: px(placed.top),
        width: px(placed.width),
        height: px(placed.height),
        'max-width': 'none',
        display: 'block',
      },
    }),
  ]);
}

/**
 * Where a direction is on a flat equirectangular picture, as fractions of its
 * width and height: yaw −180° is the left edge, pitch 90° the top (P9.10).
 */
export function panoramaPoint(yaw: number, pitch: number): { x: number; y: number } {
  return { x: (yaw + 180) / 360, y: (90 - pitch) / 180 };
}

/** The other way: the direction at a point of the flat picture (fractions, clamped). */
export function panoramaDirection(x: number, y: number): { yaw: number; pitch: number } {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return { yaw: clamp(x) * 360 - 180, pitch: 90 - clamp(y) * 180 };
}

/**
 * A 360° image (docs/briefs/P9.10-panoramas.md). In a course: a focusable view
 * the player draws the sphere into, with each spot a real button it places over
 * it. Elsewhere (the editor, thumbnails): the whole picture flat, each spot a dot
 * where it is, numbered in the editor.
 */
function renderPanorama(object: PanoramaObject, context: RenderContext): RenderNode {
  const { props } = object;
  const { width, height } = object.frame;
  const url = context.assetUrl(props.asset);
  if (!url) {
    return wrapper(object, { overflow: 'hidden' }, [
      canvas(width, height, [
        h('path', { attrs: { d: roundRectPath(width, height, 0), fill: MISSING.fill } }),
      ]),
    ]);
  }
  if (context.liveMedia) {
    const name = object.a11y.altText.trim() || object.name;
    return wrapper(object, { overflow: 'hidden', background: '#000000' }, [
      h(
        'div',
        {
          attrs: {
            class: 'vo-panorama',
            'data-panorama-src': url,
            'data-mode': props.mode,
            'data-yaw': num(props.start.yaw),
            'data-pitch': num(props.start.pitch),
            'data-fov': num(props.start.fov),
            role: 'group',
            'aria-label': name,
            'aria-roledescription': '360°',
            tabindex: '0',
          },
          style: { position: 'absolute', inset: '0', overflow: 'hidden', cursor: 'grab' },
        },
        [
          h('canvas', {
            attrs: { class: 'vo-panorama-view', 'aria-hidden': 'true' },
            style: { position: 'absolute', inset: '0', width: '100%', height: '100%' },
          }),
          h(
            'div',
            { attrs: { class: 'vo-panorama-spots' }, style: { position: 'absolute', inset: '0' } },
            props.spots.map((spot, index) =>
              h(
                'button',
                {
                  attrs: {
                    type: 'button',
                    class: 'vo-panorama-spot',
                    'data-spot-id': spot.id,
                    'data-kind': spot.kind,
                    'data-yaw': num(spot.yaw),
                    'data-pitch': num(spot.pitch),
                    // Its name starts with the number it shows (WCAG 2.5.3, P10.1).
                    'aria-label': `${index + 1}: ${spot.name}`,
                    'aria-haspopup': spot.kind === 'marker' ? 'dialog' : null,
                  },
                  style: { position: 'absolute', left: '0', top: '0' },
                },
                [String(index + 1)],
              ),
            ),
          ),
        ],
      ),
    ]);
  }
  const numbered = context.mediaMarkers;
  return wrapper(object, { overflow: 'hidden' }, [
    h('img', {
      attrs: { src: url, alt: object.a11y.altText, draggable: 'false', class: 'vo-panorama-flat' },
      style: {
        position: 'absolute',
        left: '0',
        top: '0',
        width: px(width),
        height: px(height),
        'max-width': 'none',
        display: 'block',
      },
    }),
    ...props.spots.map((spot, index) => {
      const at = panoramaPoint(spot.yaw, spot.pitch);
      const size = numbered ? 22 : 14;
      return h(
        'div',
        {
          attrs: { class: 'vo-panorama-dot', 'data-spot-id': spot.id },
          style: {
            position: 'absolute',
            left: px(at.x * width - size / 2),
            top: px(at.y * height - size / 2),
            width: px(size),
            height: px(size),
            'border-radius': '50%',
            background: spot.kind === 'marker' ? '#ffffff' : 'rgba(255, 255, 255, 0.35)',
            border: '2px solid #1c2024',
            'box-sizing': 'border-box',
            color: '#1c2024',
            'font-size': '11px',
            'line-height': px(size - 4),
            'text-align': 'center',
            'font-family': 'sans-serif',
          },
        },
        numbered ? [String(index + 1)] : [],
      );
    }),
  ]);
}

/**
 * A table (docs/briefs/P9.9-tables.md): a real HTML table filling the frame, its
 * columns and rows sized by their shares, headers as `th` with `scope`, each
 * cell's rich text drawn as a text box's is, from its top left.
 */
function renderTable(object: TableObject, context: RenderContext): RenderNode {
  const { props } = object;
  const layout = tableLayout(props, object.frame.width, object.frame.height);
  const border =
    props.borderWidth > 0
      ? `${num(props.borderWidth)}px solid ${resolveColor(props.borderColor, context)}`
      : 'none';
  const headerFill = resolveColor(props.headerFill, context);
  const headerText = resolveColor(props.headerText, context);
  const band = props.bandFill === null ? null : resolveColor(props.bandFill, context);
  const firstBody = props.headerRow ? 1 : 0;
  const rows = props.rows.map((row, r) =>
    h(
      'tr',
      { style: { height: px(layout.rows[r]!.height) } },
      row.cells.map((cell, c) => {
        const header = (props.headerRow && r === 0) || (props.headerColumn && c === 0);
        const banded = band !== null && r >= firstBody && (r - firstBody) % 2 === 1;
        const fill =
          cell.fill !== null
            ? resolveColor(cell.fill, context)
            : header
              ? headerFill
              : banded
                ? band
                : null;
        return h(
          header ? 'th' : 'td',
          {
            attrs: {
              scope: header ? (props.headerRow && r === 0 ? 'col' : 'row') : null,
              'data-cell': `${r}:${c}`,
            },
            style: {
              position: 'relative',
              padding: '0',
              border,
              background: fill,
              'vertical-align': 'top',
              'font-weight': 'normal',
              'text-align': 'left',
              overflow: 'hidden',
            },
          },
          [
            renderTextBlock(cell.text, context, {
              padding: props.padding,
              align: 'start',
              ...(header ? { color: headerText } : {}),
            }),
          ],
        );
      }),
    ),
  );
  const named = object.a11y.visibleToAssistiveTech && object.a11y.altText.trim() !== '';
  return wrapper(object, {}, [
    h(
      'table',
      {
        attrs: {
          class: 'vo-table',
          'aria-label': named ? object.a11y.altText : null,
          'aria-hidden': object.a11y.visibleToAssistiveTech ? null : 'true',
        },
        style: {
          position: 'absolute',
          left: '0',
          top: '0',
          width: px(object.frame.width),
          height: px(object.frame.height),
          'table-layout': 'fixed',
          'border-collapse': 'collapse',
          'border-spacing': '0',
        },
      },
      [
        h(
          'colgroup',
          {},
          layout.columns.map((column) => h('col', { style: { width: px(column.width) } })),
        ),
        h('tbody', {}, rows),
      ],
    ),
  ]);
}

/**
 * An icon or illustration (docs/briefs/P9.8-icons-library.md): its own drawing as
 * an inline SVG, kept in proportion inside the frame, with the paints `ink` and
 * `accent` in the object's colours. Its name for screen readers is its alt text;
 * a decorative one is hidden from them.
 */
function renderGraphic(object: GraphicObject, context: RenderContext): RenderNode {
  const { props, a11y } = object;
  const ink = resolveColor(props.ink, context);
  const accent = resolveColor(props.accent, context);
  const paint = (value: string) => (value === 'ink' ? ink : value === 'accent' ? accent : value);
  const draw = (node: GraphicNode): RenderNode => {
    const attrs: Record<string, string> = {};
    for (const [key, value] of Object.entries(node.attrs)) {
      if (value === undefined) continue;
      attrs[key] = key === 'fill' || key === 'stroke' ? paint(value) : value;
    }
    return h(node.tag, { attrs }, node.children.map(draw));
  };
  const named = a11y.visibleToAssistiveTech && a11y.altText.trim() !== '';
  return wrapper(object, {}, [
    h(
      'svg',
      {
        attrs: {
          class: 'vo-graphic',
          width: num(Math.max(object.frame.width, 1)),
          height: num(Math.max(object.frame.height, 1)),
          viewBox: `0 0 ${num(props.viewBox.width)} ${num(props.viewBox.height)}`,
          preserveAspectRatio: 'xMidYMid meet',
          'stroke-width': props.strokeWidth === null ? null : num(props.strokeWidth),
          role: named ? 'img' : null,
          'aria-label': named ? a11y.altText : null,
          'aria-hidden': named ? null : 'true',
          focusable: 'false',
        },
        style: { position: 'absolute', left: '0', top: '0', display: 'block', overflow: 'visible' },
      },
      props.nodes.map(draw),
    ),
  ]);
}

function renderButton(object: ButtonObject, context: RenderContext): RenderNode {
  const { appearance, cornerRadius, text } = object.props;
  const { width, height } = object.frame;
  return wrapper(object, appearanceStyle(appearance, context), [
    paintedPath(roundRectPath(width, height, cornerRadius), appearance, object, context),
    renderTextBlock(text, context, { padding: 8, align: 'center' }),
  ]);
}

/**
 * A question's answer (docs/briefs/P7.1-question-model.md): a round or square
 * mark, filled when the choice is drawn selected, beside its words.
 */
function renderChoice(object: ChoiceObject, context: RenderContext, selected: boolean): RenderNode {
  const { text, mark, padding } = object.props;
  const { height } = object.frame;
  const size = Math.max(10, Math.min(22, height - 2 * padding));
  const line = context.theme.colors.text;
  const fill = context.theme.colors.accent1;
  const top = (height - size) / 2;
  const half = size / 2;
  const shape =
    mark === 'radio'
      ? [
          h('circle', {
            attrs: {
              cx: half,
              cy: half,
              r: half - 1,
              fill: 'none',
              stroke: line,
              'stroke-width': 2,
            },
          }),
          selected && h('circle', { attrs: { cx: half, cy: half, r: half * 0.5, fill } }),
        ]
      : [
          h('rect', {
            attrs: {
              x: 1,
              y: 1,
              width: size - 2,
              height: size - 2,
              rx: 3,
              fill: selected ? fill : 'none',
              stroke: selected ? fill : line,
              'stroke-width': 2,
            },
          }),
          selected &&
            h('path', {
              attrs: {
                d: `M${num(size * 0.25)} ${num(size * 0.52)} L${num(size * 0.43)} ${num(size * 0.7)} L${num(size * 0.76)} ${num(size * 0.32)}`,
                fill: 'none',
                stroke: '#ffffff',
                'stroke-width': 2.5,
                'stroke-linecap': 'round',
                'stroke-linejoin': 'round',
              },
            }),
        ];
  return wrapper(object, { cursor: 'pointer' }, [
    h(
      'svg',
      {
        attrs: {
          class: 'vo-choice-mark',
          'data-selected': selected ? 'true' : false,
          width: size,
          height: size,
          viewBox: `0 0 ${num(size)} ${num(size)}`,
          'aria-hidden': 'true',
        },
        style: { position: 'absolute', left: px(padding), top: px(top), overflow: 'visible' },
      },
      shape,
    ),
    h(
      'div',
      {
        style: {
          position: 'absolute',
          left: px(padding + size),
          top: '0',
          right: '0',
          bottom: '0',
        },
      },
      [renderTextBlock(text, context, { padding, align: 'center' })],
    ),
  ]);
}

/** How the learner's input fields look, in the editor and in a course. */
const fieldStyle = (context: RenderContext, height: number): Record<string, string> => ({
  position: 'absolute',
  inset: '0',
  width: '100%',
  height: '100%',
  'box-sizing': 'border-box',
  margin: '0',
  padding: `0 ${px(Math.min(12, height / 3))}`,
  border: `2px solid ${context.theme.colors.text}`,
  'border-radius': '6px',
  background: context.theme.colors.background,
  color: context.theme.colors.text,
  font: `${px(Math.max(12, Math.min(20, height * 0.45)))} '${context.theme.fonts.body.replace(/['\\]/g, '')}', sans-serif`,
});

/**
 * Where the learner types an answer (docs/briefs/P7.2-graded-types.md): an
 * input in a course, a box showing its placeholder elsewhere.
 */
function renderTextEntry(object: TextEntryObject, context: RenderContext): RenderNode {
  const { placeholder, numeric, multiline } = object.props;
  const style = fieldStyle(context, multiline ? 44 : object.frame.height);
  if (multiline) {
    // An essay (docs/briefs/P7.3-survey-types.md): several lines, the words from the top.
    const lines = { ...style, padding: px(Math.min(12, object.frame.height / 3)) };
    if (context.liveMedia) {
      return wrapper(object, {}, [
        h('textarea', {
          attrs: {
            class: 'vo-entry',
            placeholder,
            autocomplete: 'off',
            spellcheck: 'true',
            'aria-label': object.a11y.altText || object.name,
          },
          style: { ...lines, resize: 'none' },
        }),
      ]);
    }
    return wrapper(object, {}, [
      h('div', { style: { ...lines, opacity: '0.85' } }, [
        h('span', { style: { opacity: '0.6' } }, [placeholder || ' ']),
      ]),
    ]);
  }
  if (context.liveMedia) {
    return wrapper(object, {}, [
      h('input', {
        attrs: {
          type: 'text',
          class: 'vo-entry',
          placeholder,
          inputmode: numeric ? 'decimal' : false,
          autocomplete: 'off',
          'aria-label': object.a11y.altText || object.name,
        },
        style,
      }),
    ]);
  }
  return wrapper(object, {}, [
    h('div', { style: { ...style, display: 'flex', 'align-items': 'center', opacity: '0.85' } }, [
      h('span', { style: { opacity: '0.6' } }, [placeholder || ' ']),
    ]),
  ]);
}

/** Where the learner chooses one of its options: a select in a course, a box elsewhere. */
function renderDropdown(object: DropdownObject, context: RenderContext): RenderNode {
  const style = fieldStyle(context, object.frame.height);
  if (context.liveMedia) {
    return wrapper(object, {}, [
      h(
        'select',
        {
          attrs: { class: 'vo-dropdown', 'aria-label': object.a11y.altText || object.name },
          style,
        },
        [
          h('option', { attrs: { value: '' } }, ['Choose…']),
          ...object.props.options.map((option) =>
            h('option', { attrs: { value: option } }, [option]),
          ),
        ],
      ),
    ]);
  }
  return wrapper(object, {}, [
    h(
      'div',
      {
        style: {
          ...style,
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'space-between',
        },
      },
      [h('span', {}, ['Choose…']), h('span', { attrs: { 'aria-hidden': 'true' } }, ['▾'])],
    ),
  ]);
}

function renderText(object: TextObject, context: RenderContext): RenderNode {
  const { text, padding, autofit } = object.props;
  return wrapper(object, {}, [
    renderTextBlock(text, context, { padding, align: 'start', autofit }),
  ]);
}

/**
 * A group is only a container. Its children carry frames in stage units, so
 * the group sits at the stage origin with no size and applies no rotation of
 * its own.
 */
/** The editor's marker for sound: a speaker in a rounded square. A course draws an empty box. */
const MARKER = { fill: '#eef1f6', line: '#56637a' };

function renderAudio(object: AudioObject, context: RenderContext): RenderNode {
  if (!context.mediaMarkers) return wrapper(object, { 'pointer-events': 'none' }, []);
  const { width, height } = object.frame;
  const size = Math.min(width, height);
  const s = size / 24;
  const ox = (width - size) / 2;
  const oy = (height - size) / 2;
  const at = (x: number, y: number) => `${num(ox + x * s)} ${num(oy + y * s)}`;
  return wrapper(object, {}, [
    canvas(width, height, [
      h('path', {
        attrs: {
          d: roundRectPath(width, height, Math.min(6, size / 4)),
          fill: MARKER.fill,
          stroke: MARKER.line,
          'stroke-width': 1,
        },
      }),
      // Speaker: a box and a cone.
      h('path', {
        attrs: {
          d: `M${at(5, 9.5)}L${at(8.5, 9.5)}L${at(12.5, 6)}L${at(12.5, 18)}L${at(8.5, 14.5)}L${at(5, 14.5)}Z`,
          fill: MARKER.line,
        },
      }),
      // Two sound waves.
      h('path', {
        attrs: {
          d: `M${at(15, 9.5)}Q${at(16.5, 12)} ${at(15, 14.5)}M${at(17.5, 7.5)}Q${at(20.5, 12)} ${at(17.5, 16.5)}`,
          fill: 'none',
          stroke: MARKER.line,
          'stroke-width': Math.max(1, 1.6 * s),
          'stroke-linecap': 'round',
        },
      }),
    ]),
  ]);
}

/**
 * A video fills its frame, letterboxed on black. Before it plays it shows its
 * poster, or (no poster) the frame at its trim start: the address ends in a
 * media fragment and only the metadata is loaded. In a course it is the very
 * element that plays.
 */
function renderVideo(object: VideoObject, context: RenderContext): RenderNode {
  const { asset, trimStart, poster, controls, pictureInPicture } = object.props;
  const url = context.assetUrl(asset);
  const posterUrl = poster ? context.assetUrl(poster) : undefined;
  const live = context.liveMedia;
  if (!url) {
    return wrapper(object, { background: MISSING.fill }, []);
  }
  return wrapper(object, { background: '#000', overflow: 'hidden' }, [
    h('video', {
      attrs: {
        src: `${url}#t=${num(trimStart)}`,
        poster: posterUrl,
        preload: live ? 'auto' : 'metadata',
        muted: '',
        playsinline: '',
        disablepictureinpicture: pictureInPicture ? undefined : '',
        controls: live && controls ? '' : undefined,
        'data-media-id': object.id,
        'aria-label': object.a11y.altText || object.name,
      },
      style: {
        position: 'absolute',
        left: '0',
        top: '0',
        width: '100%',
        height: '100%',
        'object-fit': 'contain',
        'pointer-events': live ? undefined : 'none',
      },
    }),
  ]);
}

/**
 * A zoom region (docs/briefs/P6.7-zoom-and-cues.md) has no look: a course
 * draws nothing, and the editor's stage a dashed frame to pick it up by.
 */
function renderZoomRegion(object: ZoomRegionObject, context: RenderContext): RenderNode {
  if (!context.mediaMarkers) return wrapper(object, { 'pointer-events': 'none' }, []);
  return wrapper(
    object,
    {
      border: `2px dashed ${MARKER.line}`,
      'box-sizing': 'border-box',
      background: 'rgba(86, 99, 122, 0.08)',
    },
    [
      h(
        'span',
        {
          attrs: { class: 'vo-zoom-label' },
          style: {
            position: 'absolute',
            left: '6px',
            top: '4px',
            font: '600 13px sans-serif',
            color: MARKER.line,
          },
        },
        ['Zoom'],
      ),
    ],
  );
}

/**
 * A hotspot (docs/briefs/P9.1-hotspots-markers.md): nothing to see in a course,
 * where an ellipse is clickable only inside itself; a dashed outline and its
 * word in the editor.
 */
function renderHotspot(object: HotspotObject, context: RenderContext): RenderNode {
  const ellipse = object.props.shape === 'ellipse';
  if (!context.mediaMarkers) {
    return wrapper(object, { 'clip-path': ellipse && 'ellipse(50% 50% at 50% 50%)' }, []);
  }
  return wrapper(
    object,
    {
      border: `2px dashed ${MARKER.line}`,
      'border-radius': ellipse && '50%',
      'box-sizing': 'border-box',
      background: 'rgba(86, 99, 122, 0.08)',
    },
    [
      h(
        'span',
        {
          attrs: { class: 'vo-hotspot-label' },
          style: {
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            font: '600 13px sans-serif',
            color: MARKER.line,
          },
        },
        ['Hotspot'],
      ),
    ],
  );
}

/** Each marker icon's glyph, on a 24 × 24 grid, drawn as strokes and fills in the text colour. */
const MARKER_GLYPHS: Record<MarkerIcon, { stroke?: string; fill?: string }> = {
  plus: { stroke: 'M12 7V17M7 12H17' },
  info: { stroke: 'M12 11V17', fill: 'M10.6 7.5a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0Z' },
  question: {
    stroke: 'M9.5 9.5a2.5 2.5 0 1 1 3.6 2.25c-.7.35-1.1.9-1.1 1.6v.6',
    fill: 'M10.8 16.8a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0Z',
  },
  pin: {
    stroke: 'M12 18.5s-4.5-5-4.5-8.25a4.5 4.5 0 0 1 9 0C16.5 13.5 12 18.5 12 18.5Z',
    fill: 'M10.6 10.25a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0Z',
  },
  star: {
    fill: 'M12 6.2l1.7 3.6 3.9.5-2.9 2.7.8 3.9L12 15l-3.5 1.9.8-3.9-2.9-2.7 3.9-.5Z',
  },
};

/**
 * A marker (P9.1): a round icon in its colour, its glyph black or white for
 * contrast. `data-pulse` asks the player to draw the pulse ring.
 */
function renderMarker(object: MarkerObject, context: RenderContext): RenderNode {
  const color = resolveColor(object.props.color, context);
  const ink = /^#[0-9a-f]{6}/i.test(color) ? textOnAccent(color.slice(0, 7)) : '#ffffff';
  const glyph = MARKER_GLYPHS[object.props.icon];
  const { width, height } = object.frame;
  const node = wrapper(object, { 'border-radius': '50%' }, [
    h(
      'svg',
      {
        attrs: {
          width: num(Math.max(width, 1)),
          height: num(Math.max(height, 1)),
          viewBox: '0 0 24 24',
          preserveAspectRatio: 'xMidYMid meet',
          'aria-hidden': 'true',
        },
        style: { position: 'absolute', left: '0', top: '0', display: 'block' },
      },
      [
        h('circle', { attrs: { cx: 12, cy: 12, r: 11, fill: color } }),
        glyph.stroke
          ? h('path', {
              attrs: {
                d: glyph.stroke,
                fill: 'none',
                stroke: ink,
                'stroke-width': 2,
                'stroke-linecap': 'round',
                'stroke-linejoin': 'round',
              },
            })
          : null,
        glyph.fill ? h('path', { attrs: { d: glyph.fill, fill: ink } }) : null,
      ],
    ),
  ]);
  if (object.props.pulse) node.attrs = { ...node.attrs, 'data-pulse': 'true' };
  return node;
}

/** What a web object's frame is allowed (P9.6): scripts and forms, never the course's origin. */
export const WEB_SANDBOX = 'allow-scripts allow-forms allow-popups';

/**
 * A web object (docs/briefs/P9.6-web-objects.md). In a course: a sandboxed
 * frame, or for "in a new window" a button (the player opens the page).
 * Elsewhere, and for a folder with nowhere to load from: a placeholder naming
 * the page, so the editor never loads anything.
 */
function renderWeb(object: WebObject, context: RenderContext): RenderNode {
  const { source, display, title } = object.props;
  const src = source.kind === 'url' ? source.url : context.webUrl?.(object.id, source.entry);
  // In Preview an address is never loaded (P9.6): it falls through to the placeholder.
  const loadable = src && !(source.kind === 'url' && context.remoteWeb === false);
  if (context.liveMedia && loadable) {
    if (display === 'window') {
      return wrapper(object, {}, [
        h(
          'button',
          {
            attrs: { type: 'button', class: 'vo-web-open', 'data-web-src': src },
            style: {
              width: '100%',
              height: '100%',
              font: '600 16px sans-serif',
              cursor: 'pointer',
            },
          },
          [title],
        ),
      ]);
    }
    return wrapper(object, {}, [
      h('iframe', {
        attrs: {
          class: 'vo-web',
          src,
          title,
          sandbox: WEB_SANDBOX,
          referrerpolicy: 'no-referrer',
          loading: 'lazy',
        },
        style: { width: '100%', height: '100%', border: '0', background: '#ffffff' },
      }),
    ]);
  }
  const named = source.kind === 'url' ? source.url : `Folder: ${source.entry}`;
  // Preview: an address is not loaded, but the author may open it in their browser.
  const openable = context.liveMedia && source.kind === 'url' && context.remoteWeb === false;
  return wrapper(
    object,
    {
      border: `2px dashed ${MARKER.line}`,
      'box-sizing': 'border-box',
      background: MARKER.fill,
      display: 'flex',
      'flex-direction': 'column',
      'align-items': 'center',
      'justify-content': 'center',
      gap: '6px',
      overflow: 'hidden',
      color: MARKER.line,
      font: '600 14px sans-serif',
      'text-align': 'center',
    },
    [
      h('span', { attrs: { class: 'vo-web-title' } }, [title]),
      h(
        'span',
        {
          attrs: { class: 'vo-web-source' },
          style: { 'font-weight': '400', 'word-break': 'break-all' },
        },
        [named],
      ),
      openable
        ? h(
            'button',
            { attrs: { type: 'button', class: 'vo-web-open', 'data-web-src': source.url } },
            ['Open in browser'],
          )
        : null,
    ],
  );
}

/** Where a slider's or dial's value sits in its range, 0 to 1 (P9.4). */
const controlFraction = (props: { min: number; max: number }, value: number) =>
  props.max > props.min
    ? Math.min(1, Math.max(0, (value - props.min) / (props.max - props.min)))
    : 0;

/**
 * A slider (docs/briefs/P9.4-sliders-dials.md). In a course, a native range
 * input the player keeps in step with the engine; elsewhere, a picture of
 * one at its initial value: a track, the filled part, and a round thumb.
 */
function renderSlider(object: SliderObject, context: RenderContext): RenderNode {
  const { props } = object;
  const color = resolveColor(props.color, context);
  const track = resolveColor(props.trackColor, context);
  const vertical = props.orientation === 'vertical';
  if (context.liveMedia) {
    return wrapper(object, {}, [
      h('input', {
        attrs: {
          type: 'range',
          class: 'vo-slider',
          min: String(props.min),
          max: String(props.max),
          step: String(props.step),
          value: String(props.initial),
          'aria-label': object.a11y.altText || object.name,
          'aria-orientation': vertical ? 'vertical' : false,
        },
        style: {
          width: '100%',
          height: '100%',
          margin: '0',
          'accent-color': color,
          'writing-mode': vertical && 'vertical-lr',
          direction: vertical && 'rtl',
        },
      }),
    ]);
  }
  const { width, height } = object.frame;
  const along = vertical ? height : width;
  const across = vertical ? width : height;
  const thickness = Math.max(4, Math.min(10, across / 4));
  const knob = Math.max(thickness * 1.8, Math.min(across, 24)) / 2;
  const start = knob;
  const length = Math.max(0, along - 2 * knob);
  const at = start + length * controlFraction(props, props.initial);
  const mid = across / 2;
  const bar = (from: number, to: number, fill: string) =>
    h('rect', {
      attrs: vertical
        ? {
            x: num(mid - thickness / 2),
            y: num(along - to),
            width: num(thickness),
            height: num(Math.max(0, to - from)),
            rx: num(thickness / 2),
            fill,
          }
        : {
            x: num(from),
            y: num(mid - thickness / 2),
            width: num(Math.max(0, to - from)),
            height: num(thickness),
            rx: num(thickness / 2),
            fill,
          },
    });
  return wrapper(object, {}, [
    canvas(width, height, [
      bar(start, start + length, track),
      bar(start, at, color),
      h('circle', {
        attrs: vertical
          ? {
              cx: num(mid),
              cy: num(along - at),
              r: num(knob),
              fill: color,
              stroke: '#ffffff',
              'stroke-width': 2,
            }
          : {
              cx: num(at),
              cy: num(mid),
              r: num(knob),
              fill: color,
              stroke: '#ffffff',
              'stroke-width': 2,
            },
      }),
    ]),
  ]);
}

/** A dial's sweep: from 135° left of straight up to 135° right of it (P9.4). */
export const DIAL_SWEEP = 270;
/** The dial's arc on a 100 × 100 grid: radius 40 about the middle, through the bottom gap. */
const DIAL_ARC = 'M21.716 78.284A40 40 0 1 1 78.284 78.284';

/**
 * A dial (P9.4): a track arc, the arc filled to its value, and a pointer.
 * In a course it is a slider to the keyboard and screen readers, and the
 * player moves the filled arc (`.vo-dial-value`) and pointer (`.vo-dial-pointer`).
 */
/**
 * The turn of a dial drawn its own way (B16), for a value: between its look's two angles, as
 * the value is between its least and most.
 */
export function dialLookAngle(
  props: { min: number; max: number; look: { from: number; to: number } },
  value: number,
): number {
  const fraction = controlFraction(props, value);
  return props.look.from + fraction * (props.look.to - props.look.from);
}

/**
 * A dial drawn its own way (B16): its face, a round picture centred on the pivot, and its
 * pointer over it, turned about the pivot. `.vo-dial-pivot` marks the pivot for the player.
 */
function renderLookedDial(
  object: DialObject,
  look: NonNullable<DialObject['props']['look']>,
  context: RenderContext,
): RenderNode {
  const { props } = object;
  const { width, height } = object.frame;
  const [px, py] = [look.pivot.x * width, look.pivot.y * height];
  const angle = dialLookAngle({ ...props, look }, props.initial);
  const clip = `${context.idPrefix}${object.id}-face`;
  const face = look.face;
  const node = wrapper(object, {}, [
    canvas(width, height, [
      face &&
        h('defs', {}, [
          h('clipPath', { attrs: { id: clip } }, [
            h('circle', { attrs: { cx: num(px), cy: num(py), r: num(face.size / 2) } }),
          ]),
        ]),
      face &&
        h('image', {
          attrs: {
            href: context.assetUrl(face.asset),
            x: num(px - face.size / 2),
            y: num(py - face.size / 2),
            width: num(face.size),
            height: num(face.size),
            preserveAspectRatio: 'xMidYMid slice',
            'clip-path': `url(#${clip})`,
          },
        }),
      h(
        'g',
        {
          attrs: {
            class: 'vo-dial-pointer',
            'data-pivot': `${num(px)} ${num(py)}`,
            transform: `rotate(${num(angle)} ${num(px)} ${num(py)})`,
          },
        },
        [
          h('path', {
            attrs: {
              d: scaledPath(look.pointer, width, height),
              fill: resolveColor(props.color, context),
            },
          }),
        ],
      ),
      h('circle', {
        attrs: { class: 'vo-dial-pivot', cx: num(px), cy: num(py), r: 0.5, fill: 'none' },
      }),
    ]),
  ]);
  if (context.liveMedia) {
    node.attrs = {
      ...node.attrs,
      role: 'slider',
      tabindex: '0',
      'aria-label': object.a11y.altText || object.name,
      'aria-valuemin': String(props.min),
      'aria-valuemax': String(props.max),
      'aria-valuenow': String(props.initial),
    };
  }
  return node;
}

function renderDial(object: DialObject, context: RenderContext): RenderNode {
  const { props } = object;
  if (props.look) return renderLookedDial(object, props.look, context);
  const color = resolveColor(props.color, context);
  const track = resolveColor(props.trackColor, context);
  const fraction = controlFraction(props, props.initial);
  const angle = -DIAL_SWEEP / 2 + fraction * DIAL_SWEEP;
  const live = context.liveMedia;
  const node = wrapper(object, {}, [
    h(
      'svg',
      {
        attrs: {
          width: num(Math.max(object.frame.width, 1)),
          height: num(Math.max(object.frame.height, 1)),
          viewBox: '0 0 100 100',
          preserveAspectRatio: 'xMidYMid meet',
          'aria-hidden': 'true',
        },
        style: { position: 'absolute', left: '0', top: '0', display: 'block', overflow: 'visible' },
      },
      [
        h('path', {
          attrs: {
            d: DIAL_ARC,
            fill: 'none',
            stroke: track,
            'stroke-width': 10,
            'stroke-linecap': 'round',
          },
        }),
        h('path', {
          attrs: {
            class: 'vo-dial-value',
            d: DIAL_ARC,
            fill: 'none',
            stroke: color,
            'stroke-width': 10,
            'stroke-linecap': 'round',
            pathLength: 100,
            'stroke-dasharray': `${num(fraction * 100)} 100`,
          },
        }),
        h('circle', {
          attrs: { cx: 50, cy: 50, r: 28, fill: '#ffffff', stroke: track, 'stroke-width': 2 },
        }),
        h('g', { attrs: { class: 'vo-dial-pointer', transform: `rotate(${num(angle)} 50 50)` } }, [
          h('line', {
            attrs: {
              x1: 50,
              y1: 50,
              x2: 50,
              y2: 28,
              stroke: color,
              'stroke-width': 6,
              'stroke-linecap': 'round',
            },
          }),
        ]),
      ],
    ),
  ]);
  if (live) {
    node.attrs = {
      ...node.attrs,
      role: 'slider',
      tabindex: '0',
      'aria-label': object.a11y.altText || object.name,
      'aria-valuemin': String(props.min),
      'aria-valuemax': String(props.max),
      'aria-valuenow': String(props.initial),
    };
  }
  return node;
}

/**
 * A scrolling panel (docs/briefs/P9.5-scrolling-panels.md): a group that shows
 * a window of its top `height` stage pixels. In a course it scrolls; a
 * thumbnail clips to it. The editor draws everything, with the window outlined.
 */
function renderScrollPanel(
  object: GroupObject & { scroll: { height: number } },
  context: RenderContext,
): RenderNode {
  const { x, y, width, height } = object.frame;
  const window = Math.min(object.scroll.height, height);
  const children = object.children.map((child) => renderObject(child, context));
  if (context.mediaMarkers) {
    return h(
      'div',
      {
        attrs: { class: 'vo-object', 'data-object-id': object.id, 'data-object-type': 'group' },
        style: { position: 'absolute', left: '0', top: '0', width: '0', height: '0' },
      },
      [
        ...children,
        h(
          'div',
          {
            attrs: { class: 'vo-scroll-window' },
            style: {
              position: 'absolute',
              left: px(x),
              top: px(y),
              width: px(width),
              height: px(window),
              border: `2px dashed ${MARKER.line}`,
              'box-sizing': 'border-box',
              'pointer-events': 'none',
            },
          },
          [
            h(
              'span',
              {
                attrs: { class: 'vo-scroll-label' },
                style: {
                  position: 'absolute',
                  right: '4px',
                  bottom: '2px',
                  font: '600 11px sans-serif',
                  color: MARKER.line,
                },
              },
              ['Scroll window'],
            ),
          ],
        ),
      ],
    );
  }
  const live = context.liveMedia;
  return h(
    'div',
    {
      attrs: {
        class: 'vo-object vo-scroll-panel',
        'data-object-id': object.id,
        'data-object-type': 'group',
        ...(live
          ? { role: 'region', tabindex: '0', 'aria-label': object.a11y.altText || object.name }
          : {}),
      },
      style: {
        position: 'absolute',
        left: px(x),
        top: px(y),
        width: px(width),
        height: px(window),
        'overflow-x': 'hidden',
        'overflow-y': live ? 'auto' : 'hidden',
      },
    },
    [
      // The content at its full height; its objects keep their stage positions.
      h('div', { style: { position: 'relative', width: px(width), height: px(height) } }, [
        h(
          'div',
          { style: { position: 'absolute', left: px(-x), top: px(-y), width: '0', height: '0' } },
          children,
        ),
      ]),
    ],
  );
}

function renderGroup(object: GroupObject, context: RenderContext): RenderNode {
  if (object.scroll) return renderScrollPanel({ ...object, scroll: object.scroll }, context);
  return h(
    'div',
    {
      attrs: { class: 'vo-object', 'data-object-id': object.id, 'data-object-type': 'group' },
      style: { position: 'absolute', left: '0', top: '0', width: '0', height: '0' },
    },
    object.children.map((child) => renderObject(child, context)),
  );
}

// -------------------------------------------------------------------- public

/**
 * Draw one object. Its look is its own (or a state's, resolved by the caller);
 * `state` says which state it is drawn in, for the few objects whose drawing
 * depends on it (a choice's mark is filled when `selected`).
 */
export function renderObject(
  object: SceneObject,
  context: RenderContext,
  state = 'normal',
): RenderNode {
  switch (object.type) {
    case 'choice':
      return renderChoice(object, context, state === 'selected');
    case 'textEntry':
      return renderTextEntry(object, context);
    case 'dropdown':
      return renderDropdown(object, context);
    case 'shape':
      return renderShape(object, context);
    case 'image':
      return renderImage(object, context);
    case 'button':
      return renderButton(object, context);
    case 'text':
      return renderText(object, context);
    case 'audio':
      return renderAudio(object, context);
    case 'video':
      return renderVideo(object, context);
    case 'zoomRegion':
      return renderZoomRegion(object, context);
    case 'hotspot':
      return renderHotspot(object, context);
    case 'marker':
      return renderMarker(object, context);
    case 'slider':
      return renderSlider(object, context);
    case 'dial':
      return renderDial(object, context);
    case 'web':
      return renderWeb(object, context);
    case 'graphic':
      return renderGraphic(object, context);
    case 'table':
      return renderTable(object, context);
    case 'panorama':
      return renderPanorama(object, context);
    case 'group':
      return renderGroup(object, context);
  }
}

/** A layer's objects, back to front. */
export function renderLayer(layer: Layer, context: RenderContext): RenderNode {
  return h(
    'div',
    {
      attrs: { class: 'vo-layer', 'data-layer-id': layer.id },
      style: { position: 'absolute', left: '0', top: '0', width: '0', height: '0' },
    },
    layer.objects.map((object) => renderObject(object, context)),
  );
}

/**
 * What a slide inherits, back to front: its master's layer, then its layout's
 * layer. A layout's placeholders only prompt in Master View; the slide has its
 * own copies, so they are left out here. Empty when the slide has no layout.
 */
export function renderInheritedLayers(slide: Slide, context: RenderContext): RenderNode[] {
  if (slide.layoutId === null) return [];
  for (const master of context.masters) {
    const layout = master.layouts.find((each) => each.id === slide.layoutId);
    if (!layout) continue;
    const content = {
      ...layout.layer,
      objects: layout.layer.objects.filter(
        (object) => !(object.type === 'text' && object.props.placeholder !== null),
      ),
    };
    return [renderLayer(master.layer, context), renderLayer(content, context)];
  }
  return [];
}

/**
 * A slide as it first appears: the stage at its natural size, the theme
 * background, the master and layout layers beneath, then the base layer.
 * Overlay layers are shown by triggers at run time, so they are not drawn
 * here. Scale it with a CSS transform on a parent; everything inside is in
 * stage units.
 */
export function renderSlide(slide: Slide, context: RenderContext): RenderNode {
  return h(
    'div',
    {
      attrs: { class: 'vo-slide', 'data-slide-id': slide.id },
      style: {
        position: 'relative',
        width: px(context.stage.width),
        height: px(context.stage.height),
        overflow: 'hidden',
        background: context.theme.colors.background,
      },
    },
    [...renderInheritedLayers(slide, context), renderLayer(slide.baseLayer, context)],
  );
}

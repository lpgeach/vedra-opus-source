import {
  createPanoramaSpot,
  findObject,
  forEachObject,
  tableLayout,
  withCell,
} from '@vedraopus/model';
import type { Frame, RichText, SceneObject, TableObject } from '@vedraopus/model';
import {
  applyTextAutofit,
  createAnimator,
  createRenderContext,
  panoramaDirection,
  renderInheritedLayers,
  renderLayer,
} from '@vedraopus/render';
import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { cancelFormatPainter, consumeFormatFor, getFormatPainterState } from '../format-painter';
import {
  editorAssetUrl,
  editor,
  getEditorState,
  partOf,
  selectedObjects,
  useEditor,
  ZOOM_MAX,
  ZOOM_MIN,
} from '../project-store';
import type { CurrentSlide, OpenProject } from '../project-store';
import { ui, useSettings } from '../ui-store';
import { stage as actions } from './actions';
import { ContextMenu } from './ContextMenu';
import type { ContextAction } from './ContextMenu';
import { Rulers } from './Rulers';
import { TextEditor } from './TextEditor';
import {
  centreOf,
  HANDLES,
  moveFrame,
  needsEvenScale,
  pointInFrame,
  rectFromPoints,
  rectsTouch,
  resizeFrame,
  rotateFrame,
  rotationDelta,
  scaleFrame,
  snapBox,
  snapValue,
  unionBounds,
  boundsOf,
} from './geometry';
import type { Handle, Point, Rect, SnapCandidates, SnapLine } from './geometry';
import { ObjectView, toReact } from './RenderTree';
import { previewAt } from '../timeline-preview';
import { spaceKey } from '../space-key';
import { MotionPaths } from './MotionPaths';
import { offerTransitionPreview, playOnStage } from './transition-preview';
import { StageToolbar, ZOOM_LEVELS } from './StageToolbar';
import { SelectionTags } from './SelectionTags';
import { Selection } from './Selection';
import { leavesOf, selectionFrame, transformObjects } from './transform';

/** Clear space kept around the stage inside its area, in screen pixels. */
const MARGIN = 32;
/** How far the pointer must travel before a press becomes a drag, in screen pixels. */
const DRAG_THRESHOLD = 3;
/** How close to a thin object a click still counts, in screen pixels. */
const HIT_SLOP = 4;
/** How close a moving edge must come to a line before it snaps, in screen pixels. */
const SNAP_PX = 6;
/**
 * How far the scroll position may be from the one this file placed and still
 * count as its own, in pixels. Sub-pixel layout can leave the browser clamping
 * or rounding a placed position by a pixel shortly afterwards.
 */
const SCROLL_SLOP = 2;
const ZOOM_STEPS = ZOOM_LEVELS;
const LINE_HANDLES: readonly Handle[] = ['w', 'e'];
const CORNERS: readonly Handle[] = ['nw', 'ne', 'se', 'sw'];

type Drag =
  /** Pressed, not yet moved far enough to mean anything. */
  | { kind: 'pending'; client: Point; from: Point; onObject: boolean; adding: boolean }
  | { kind: 'move'; from: Point; objects: SceneObject[] }
  | { kind: 'resize'; handle: Handle; box: Frame; objects: SceneObject[] }
  | { kind: 'rotate'; from: Point; pivot: Point; startRotation: number; objects: SceneObject[] }
  | {
      kind: 'guide';
      axis: 'x' | 'y';
      start: Point;
      /** The guide's position when the drag began; null for a new one. */
      at: number | null;
      /** The guides as they were when the drag began. */
      base: number[];
    }
  | { kind: 'marquee'; from: Point; base: readonly string[] }
  | { kind: 'pan'; client: Point; scrollLeft: number; scrollTop: number };

const isLine = (object: SceneObject) =>
  object.type === 'shape' &&
  (object.props.geometry.kind === 'line' || object.props.geometry.kind === 'arrow');

/** The frame the selection handles go round. */
function boxAround(selected: readonly SceneObject[]): Frame | null {
  const [only] = selected;
  if (!only) return null;
  if (selected.length === 1) return selectionFrame(only);
  const box = unionBounds(selected.flatMap(leavesOf).map((leaf) => leaf.frame));
  return box ? { ...box, rotation: 0 } : null;
}

/**
 * The slide being edited, drawn with the same renderers as a published
 * course, with selection and direct manipulation on top. The maths is in
 * geometry.ts and transform.ts; this file turns pointer and key events into
 * calls to them. See docs/briefs/P2.2-stage.md.
 */
export function Stage({ open, current }: { open: OpenProject; current: CurrentSlide | undefined }) {
  const {
    selection,
    zoom: zoomSetting,
    editingTextId,
    editingCell,
    playhead,
    timelinePreview,
    stateEdit,
  } = useEditor();
  // While the timeline plays or is scrubbed, draw only what the engine shows at that time.
  const slideForPreview = current?.isMaster ? undefined : current?.slide;
  const preview = useMemo(
    () =>
      timelinePreview && slideForPreview
        ? previewAt(open.project, slideForPreview.id, playhead, current?.layerId)
        : null,
    [timelinePreview, slideForPreview, open.project, playhead, current?.layerId],
  );
  const shownAtPlayhead = preview?.visible ?? null;
  const { view } = useSettings();
  const { project, session } = open;
  const size = project.stage;

  const editingObject = useMemo(() => {
    if (!editingTextId || !current) return null;
    const found = current.slide.baseLayer.objects.find((o) => o.id === editingTextId);
    if (!found) return null;
    if (found.type === 'text' || found.type === 'shape' || found.type === 'button') return found;
    // A table's cell (P9.9): the editor sits over that cell.
    if (found.type === 'table' && editingCell) return found;
    return null;
  }, [editingTextId, editingCell, current]);

  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [snapLines, setSnapLines] = useState<SnapLine[]>([]);
  const [panning, setPanning] = useState(false);
  const [scroll, setScroll] = useState({ left: 0, top: 0 });
  /** Where a right-click opened the stage menu, in client pixels. */
  const [menu, setMenu] = useState<Point | null>(null);
  const drag = useRef<Drag | null>(null);
  const spaceDown = useRef(false);
  const hovering = useRef(false);
  /** A stage point to keep under a screen point across a zoom change. */
  const zoomAnchor = useRef<{ stage: Point; screen: Point } | null>(null);
  /** The wheel-zoom in progress, if any: see `onWheel`. */
  const wheelBurst = useRef<{
    clientX: number;
    clientY: number;
    zoom: number;
    stage: Point;
  } | null>(null);
  /** Where the zoom code last put the scroll position, to tell its scrolling from the author's. */
  const placedScroll = useRef<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const element = viewportRef.current!;
    const measure = () => setViewport({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fit = viewport
    ? Math.min(
        ZOOM_MAX,
        Math.max(
          ZOOM_MIN,
          Math.min(
            (viewport.width - 2 * MARGIN) / size.width,
            (viewport.height - 2 * MARGIN) / size.height,
          ),
        ),
      )
    : 1;
  const zoom = zoomSetting === 'fit' ? fit : zoomSetting;
  const canvas = { width: size.width * zoom, height: size.height * zoom };
  // The scrolled content is at least the viewport, so a small stage sits centred.
  const content = {
    width: Math.max(viewport?.width ?? 0, canvas.width + 2 * MARGIN),
    height: Math.max(viewport?.height ?? 0, canvas.height + 2 * MARGIN),
  };
  const offset = {
    x: (content.width - canvas.width) / 2,
    y: (content.height - canvas.height) / 2,
  };

  // After a zoom about the pointer, scroll so the same stage point is under it.
  useLayoutEffect(() => {
    const anchor = zoomAnchor.current;
    const element = viewportRef.current;
    if (!anchor || !element || !viewport) return;
    zoomAnchor.current = null;
    // Clamp to the range this layout can actually scroll. A stage smaller than
    // its area is centred and cannot follow the pointer, and the browser's own
    // scroll range can round a fraction of a pixel past the content and correct
    // it after paint; clamping to the same numbers used for the layout keeps
    // the position this records true.
    const left = offset.x + anchor.stage.x * zoom - anchor.screen.x;
    const top = offset.y + anchor.stage.y * zoom - anchor.screen.y;
    element.scrollLeft = Math.min(Math.max(0, left), Math.max(0, content.width - viewport.width));
    element.scrollTop = Math.min(Math.max(0, top), Math.max(0, content.height - viewport.height));
    placedScroll.current = { left: element.scrollLeft, top: element.scrollTop };
    setScroll({ left: element.scrollLeft, top: element.scrollTop });
  }, [zoom, offset.x, offset.y, content.width, content.height, viewport]);

  const context = useMemo(
    () =>
      createRenderContext(
        {
          theme: project.theme,
          stage: project.stage,
          assets: project.assets,
          masters: project.masters,
        },
        // The stage marks where sound sits, so it can be selected and moved.
        {
          assetUrl: (hash) =>
            editorAssetUrl(session, { assets: project.assets, stage: project.stage }, hash),
          idPrefix: 'stage-',
          mediaMarkers: true,
        },
      ),
    [project.theme, project.stage, project.assets, project.masters, session],
  );

  // What the slide inherits (or, in Master View, what the layout sits on):
  // drawn beneath the objects and never selectable.
  const underlayFirst = current?.underlay?.[0];
  const beneath = current?.alsoBeneath;
  const underlay = useMemo(() => {
    if (!current) return [];
    if (current.underlay) return current.underlay.map((layer) => renderLayer(layer, context));
    return [
      ...renderInheritedLayers(current.slide, context),
      ...(beneath ?? []).map((layer) => renderLayer(layer, context)),
    ];
    // `current` is rebuilt on every render; these are what actually change what is drawn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, current?.slide.layoutId, current?.isMaster, underlayFirst, beneath]);

  const objects = useMemo(
    () => current?.slide.baseLayer.objects ?? [],
    [current?.slide.baseLayer.objects],
  );
  const selected = selectedObjects(current?.slide, selection);
  // A group's member chosen in the Animations tab or the timeline shows its own paths (B8).
  const pathsOf = partOf(selected[0], getEditorState().groupPart);
  const box = boxAround(selected);
  const handles = selected.length === 1 && isLine(selected[0]!) ? LINE_HANDLES : HANDLES;

  useLayoutEffect(() => {
    if (canvasRef.current) applyTextAutofit(canvasRef.current);
  }, [project, editingTextId, zoom, objects]);

  // While the timeline plays or is scrubbed, objects enter, leave and move as
  // the engine says, through the same animator as a course. Otherwise none is.
  const animator = useMemo(() => createAnimator(size), [size]);
  const slideRef = useRef<HTMLDivElement>(null);

  // The Transitions tab's Preview: the slide's own transition, or the edited layer's.
  const playTransition = useEffectEvent((target: 'slide' | 'layer') => {
    const canvasElement = canvasRef.current;
    const slideElement = slideRef.current;
    if (!canvasElement || !slideElement || !current || current.isMaster) return;
    const stored = project.scenes
      .flatMap((scene) => scene.slides)
      .find((slide) => slide.id === current.slide.id);
    if (target === 'slide') {
      if (!stored?.properties.transition) return;
      stopPreview.current?.();
      stopPreview.current = playOnStage({
        canvas: canvasElement,
        zoom,
        what: { slide: stored },
        transition: stored.properties.transition,
        context,
        hide: [slideElement],
      });
      return;
    }
    // Editing an overlay, `current.slide.baseLayer` is that layer.
    const layer = current.layerId ? current.slide.baseLayer : null;
    if (!layer?.properties.transition) return;
    stopPreview.current?.();
    stopPreview.current = playOnStage({
      canvas: canvasElement,
      zoom,
      what: { layer },
      transition: layer.properties.transition,
      context,
      hide: [...slideElement.querySelectorAll<HTMLElement>(':scope > [data-object-id]')],
    });
  });
  const stopPreview = useRef<(() => void) | null>(null);
  useEffect(() => {
    const withdraw = offerTransitionPreview((target) => playTransition(target));
    return () => {
      withdraw();
      stopPreview.current?.();
    };
  }, []);
  useLayoutEffect(() => {
    const root = slideRef.current;
    if (!root) return;
    for (const object of objects) {
      const element = root.querySelector<HTMLElement>(
        `:scope > [data-object-id="${CSS.escape(object.id)}"]`,
      );
      if (element) animator.apply(element, object, preview?.motion.get(object.id) ?? {});
    }
  });

  /**
   * Lines the moving objects can snap to: the stage's edges and centre, and
   * the edges and centre of every other object, including the parts of a group.
   */
  const snapCandidates = (moving: readonly SceneObject[]): SnapCandidates => {
    const movingIds = new Set(moving.flatMap(leavesOf).map((leaf) => leaf.id));
    const x = [0, size.width / 2, size.width];
    const y = [0, size.height / 2, size.height];
    const add = (frame: Frame) => {
      const bounds = boundsOf(frame);
      x.push(bounds.x, bounds.x + bounds.width / 2, bounds.x + bounds.width);
      y.push(bounds.y, bounds.y + bounds.height / 2, bounds.y + bounds.height);
    };
    for (const object of objects) {
      if (object.hiddenInEditor) continue;
      forEachObject([object], (each) => {
        if (!movingIds.has(each.id)) add(each.frame);
      });
    }
    if (view.grid) {
      for (let at = 0; at <= size.width; at += view.gridSize) x.push(at);
      for (let at = 0; at <= size.height; at += view.gridSize) y.push(at);
    }
    if (view.guides) {
      x.push(...view.guideX);
      y.push(...view.guideY);
    }
    return { x, y };
  };

  const textProps = (
    object: SceneObject,
    cell: { row: number; column: number } | null = null,
  ): {
    doc: RichText;
    padding: number;
    align: 'center' | 'start';
    autofit: 'none' | 'shrinkText' | 'growShape';
  } | null => {
    if (object.type === 'text')
      return {
        doc: object.props.text,
        padding: object.props.padding,
        align: 'start',
        autofit: object.props.autofit,
      };
    if (object.type === 'button')
      return { doc: object.props.text, padding: 8, align: 'center', autofit: 'none' };
    if (object.type === 'shape' && object.props.text)
      return { doc: object.props.text, padding: 8, align: 'center', autofit: 'none' };
    if (object.type === 'table' && cell) {
      const doc = object.props.rows[cell.row]?.cells[cell.column]?.text;
      if (doc) return { doc, padding: object.props.padding, align: 'start', autofit: 'none' };
    }
    return null;
  };

  /** Where a table's cell is on the slide (P9.9). */
  const cellFrame = (table: TableObject, cell: { row: number; column: number }): Frame => {
    const layout = tableLayout(table.props, table.frame.width, table.frame.height);
    const column = layout.columns[cell.column]!;
    const row = layout.rows[cell.row]!;
    return {
      x: table.frame.x + column.x,
      y: table.frame.y + row.y,
      width: column.width,
      height: row.height,
      rotation: 0,
    };
  };

  /** The table cell under a stage point, if there is one. */
  const cellAt = (table: TableObject, point: Point) => {
    const layout = tableLayout(table.props, table.frame.width, table.frame.height);
    const x = point.x - table.frame.x;
    const y = point.y - table.frame.y;
    const column = layout.columns.findIndex((each) => x >= each.x && x <= each.x + each.width);
    const row = layout.rows.findIndex((each) => y >= each.y && y <= each.y + each.height);
    return column >= 0 && row >= 0 ? { row, column } : null;
  };

  /**
   * Save an edit to `id`. The id is passed in rather than read from the store:
   * a click outside the box clears `editingTextId` first and the editor commits
   * as it goes away, so by then the store no longer says what was being edited.
   */
  const commitTextEdit = (
    id: string,
    doc: RichText,
    framePatch?: Partial<Frame>,
    cell: { row: number; column: number } | null = null,
  ) => {
    const openState = getEditorState().open;
    if (!openState) {
      editor.stopEditingText();
      return;
    }
    if (cell) {
      // One table cell (P9.9): the rest of the table as it is now.
      const table = findObject(openState.project, id)?.object;
      if (table?.type === 'table' && table.props.rows[cell.row]?.cells[cell.column]) {
        const { rows } = withCell(table.props, cell.row, cell.column, { text: doc });
        openState.history.execute('object.update', { objectId: id, changes: { props: { rows } } });
      }
      editor.stopEditingText();
      return;
    }
    const changes: { props: { text: RichText }; frame?: Partial<Frame> } = { props: { text: doc } };
    if (framePatch && Object.keys(framePatch).length > 0) changes.frame = framePatch;
    openState.history.execute('object.update', { objectId: id, changes });
    editor.stopEditingText();
  };

  const onDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!current || editingTextId) return;
    const point = toStage(event);
    const hit = objectAt(point);
    if (!hit) return;
    if (hit.type === 'panorama') {
      // A spot where the flat picture was double-clicked (P9.10).
      const openState = getEditorState().open;
      if (!openState || hit.props.spots.length >= 50) return;
      const at = panoramaDirection(
        (point.x - hit.frame.x) / hit.frame.width,
        (point.y - hit.frame.y) / hit.frame.height,
      );
      const spot = createPanoramaSpot(
        `Spot ${hit.props.spots.length + 1}`,
        Math.round(at.yaw),
        Math.round(at.pitch),
      );
      openState.history.execute('object.update', {
        objectId: hit.id,
        changes: { props: { spots: [...hit.props.spots, spot] } },
      });
      return;
    }
    if (hit.type === 'table') {
      const cell = cellAt(hit, point);
      if (cell) editor.startEditingText(hit.id, cell);
      return;
    }
    const tp = textProps(hit);
    if (!tp) return;
    // Shapes can have no text yet; initialize if needed.
    if (hit.type === 'shape' && !hit.props.text) {
      const openState = getEditorState().open;
      if (openState) {
        openState.history.execute('object.update', {
          objectId: hit.id,
          changes: { props: { text: { type: 'doc', content: [{ type: 'paragraph' }] } } },
        });
      }
    }
    editor.startEditingText(hit.id);
  };

  const toStage = (event: { clientX: number; clientY: number }): Point => {
    const bounds = canvasRef.current!.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) / zoom, y: (event.clientY - bounds.top) / zoom };
  };

  /** The topmost object under a stage point. */
  const objectAt = (point: Point): SceneObject | undefined =>
    [...objects]
      .reverse()
      .find(
        (object) =>
          !object.hiddenInEditor &&
          !object.locked &&
          leavesOf(object).some((leaf) => pointInFrame(point, leaf.frame, HIT_SLOP / zoom)),
      );

  /**
   * Zoom, keeping a point where it is on screen: `about`, or the middle of the
   * viewport. `stagePoint` says which stage point that is when the caller
   * already knows; otherwise it is read from the screen.
   */
  const zoomTo = (
    next: number,
    about?: { clientX: number; clientY: number },
    stagePoint?: Point,
  ): Point => {
    const element = viewportRef.current!;
    const bounds = element.getBoundingClientRect();
    const at = about ?? {
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
    };
    const anchored = stagePoint ?? toStage(at);
    zoomAnchor.current = {
      stage: anchored,
      screen: { x: at.clientX - bounds.left, y: at.clientY - bounds.top },
    };
    editor.setZoom(next);
    return anchored;
  };
  const zoomStep = (direction: 1 | -1) => {
    const next =
      direction === 1
        ? ZOOM_STEPS.find((step) => step > zoom + 0.001)
        : [...ZOOM_STEPS].reverse().find((step) => step < zoom - 0.001);
    if (next !== undefined) zoomTo(next);
  };

  // Ctrl+wheel zooms about the pointer. React's wheel listener is passive and
  // cannot stop the page zooming too, so this one is attached directly.
  const onWheel = useEffectEvent((event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    // One turn of the wheel arrives as several events (always, on macOS).
    // Scroll positions are whole pixels, and a stage smaller than its area is
    // centred and cannot follow the pointer, so re-reading the stage point
    // under the pointer for each event lets errors build up and the stage
    // drifts. While the gesture continues, keep the first event's stage point
    // and build on the zoom last asked for (React may not have drawn it yet).
    // It continues for as long as the pointer has not moved, the zoom is still
    // the one this asked for, and nothing else has scrolled the stage.
    const last = wheelBurst.current;
    const continuing =
      last !== null &&
      last.clientX === event.clientX &&
      last.clientY === event.clientY &&
      getEditorState().zoom === last.zoom;
    const from = continuing ? last.zoom : zoom;
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, from * Math.exp(-event.deltaY * 0.0015)));
    const stagePoint = zoomTo(next, event, continuing ? last.stage : undefined);
    wheelBurst.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      zoom: next,
      stage: stagePoint,
    };
  });
  useEffect(() => {
    const element = viewportRef.current!;
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  // Space+drag pans. Space is watched on the whole window, because the author
  // holds it wherever keyboard focus happens to be; it only counts while the
  // pointer is over the stage and they are not typing in a field.
  useEffect(() => {
    const typing = () => {
      const active = document.activeElement;
      return (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      );
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== ' ' || !hovering.current || typing()) return;
      spaceDown.current = true;
      // Otherwise Space would scroll the stage, or press a focused button.
      event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== ' ') return;
      if (spaceDown.current) event.preventDefault();
      spaceDown.current = false;
    };
    const release = () => {
      spaceDown.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', release);
    };
  }, []);

  // ------------------------------------------------------------- pointer

  /** A press on a ruler drags out a new guide of that axis. */
  const startGuide = (axis: 'x' | 'y', event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const element = viewportRef.current!;
    element.focus({ preventScroll: true });
    element.setPointerCapture(event.pointerId);
    drag.current = {
      kind: 'guide',
      axis,
      start: toStage(event),
      at: null,
      base: axis === 'x' ? [...view.guideX] : [...view.guideY],
    };
  };

  const onStageContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!current) return;
    event.preventDefault();
    // Right-clicking an object outside the selection makes it the selection,
    // so the menu acts on what the author pointed at.
    const hit = objectAt(toStage(event));
    if (hit && !selection.includes(hit.id)) editor.select([hit.id]);
    setMenu({ x: event.clientX, y: event.clientY });
  };

  /** Run one of the stage menu's commands. */
  const onMenuAction = (choice: ContextAction) => {
    switch (choice) {
      case 'cut':
        return void actions.cut();
      case 'copy':
        return void actions.copy();
      case 'paste':
        return void actions.paste();
      case 'duplicate':
        return actions.duplicate();
      case 'delete':
        return actions.deleteSelection();
      case 'group':
        return actions.group();
      case 'ungroup':
        return actions.ungroup();
      case 'lock':
        return actions.lockSelection();
      default:
        return actions.reorder(choice);
    }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const element = viewportRef.current!;
    element.focus({ preventScroll: true });
    if (drag.current) return;
    if (editingTextId) {
      // Clicking outside the editor commits it; the editor's overlay stops propagation.
      editor.stopEditingText();
      return;
    }

    if (event.button === 1 || (event.button === 0 && spaceDown.current)) {
      // A pan with Space held: letting Space go then does not play the timeline.
      if (spaceDown.current) spaceKey.panned = true;
      event.preventDefault();
      element.setPointerCapture(event.pointerId);
      drag.current = {
        kind: 'pan',
        client: { x: event.clientX, y: event.clientY },
        scrollLeft: element.scrollLeft,
        scrollTop: element.scrollTop,
      };
      setPanning(true);
      return;
    }
    if (event.button !== 0 || !current) return;
    // A press on the scroll bars is not a press on the stage.
    if (event.target === element) return;

    const point = toStage(event);
    const handle = (event.target as Element).closest('[data-handle]')?.getAttribute('data-handle');
    element.setPointerCapture(event.pointerId);

    if (handle && box) {
      if (handle === 'rotate') {
        editor.beginGesture('Rotate');
        drag.current = {
          kind: 'rotate',
          from: point,
          pivot: centreOf(box),
          startRotation: box.rotation,
          objects: selected,
        };
      } else {
        editor.beginGesture('Resize');
        drag.current = { kind: 'resize', handle: handle as Handle, box, objects: selected };
      }
      return;
    }

    const guide = (event.target as Element).closest('[data-guide-x], [data-guide-y]');
    if (guide) {
      const axis = guide.hasAttribute('data-guide-x') ? 'x' : 'y';
      const attribute = axis === 'x' ? 'data-guide-x' : 'data-guide-y';
      drag.current = {
        kind: 'guide',
        axis,
        start: point,
        at: Number(guide.getAttribute(attribute)),
        base: axis === 'x' ? [...view.guideX] : [...view.guideY],
      };
      return;
    }

    const hit = objectAt(point);
    const painter = getFormatPainterState();
    if (hit) {
      const already = selection.includes(hit.id);
      if (painter.armed && !event.shiftKey) {
        const changes = consumeFormatFor(hit);
        if (changes) {
          open.history.execute('object.update', { objectId: hit.id, changes: changes as never });
          editor.select([hit.id]);
        }
      } else if (event.shiftKey) {
        editor.select(already ? selection.filter((id) => id !== hit.id) : [...selection, hit.id]);
      } else if (!already) {
        editor.select([hit.id]);
      }
    } else if (painter.armed) {
      cancelFormatPainter();
    }
    drag.current = {
      kind: 'pending',
      client: { x: event.clientX, y: event.clientY },
      from: point,
      // Shift-clicking an object out of the selection must not then drag the rest.
      onObject: hit !== undefined && !(event.shiftKey && selection.includes(hit.id)),
      adding: event.shiftKey,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    let state = drag.current;
    if (!state) return;
    const element = viewportRef.current!;

    if (state.kind === 'pan') {
      element.scrollLeft = state.scrollLeft - (event.clientX - state.client.x);
      element.scrollTop = state.scrollTop - (event.clientY - state.client.y);
      setScroll({ left: element.scrollLeft, top: element.scrollTop });
      return;
    }

    if (state.kind === 'pending') {
      const travelled = Math.hypot(event.clientX - state.client.x, event.clientY - state.client.y);
      if (travelled < DRAG_THRESHOLD) return;
      if (state.onObject && selected.length > 0) {
        editor.beginGesture('Move');
        state = { kind: 'move', from: state.from, objects: selected };
      } else if (!state.onObject) {
        state = { kind: 'marquee', from: state.from, base: state.adding ? selection : [] };
      } else {
        return;
      }
      drag.current = state;
    }

    const point = toStage(event);
    switch (state.kind) {
      case 'guide': {
        const { axis } = state;
        const at = axis === 'x' ? point.x : point.y;
        // A new guide follows the pointer; an existing one moves by however
        // far the pointer has travelled since the press.
        const start = axis === 'x' ? state.start.x : state.start.y;
        const value = Math.round(state.at === null ? at : state.at + (at - start));
        const limit = axis === 'x' ? size.width : size.height;
        const next = [...state.base];
        const index = state.at === null ? -1 : next.indexOf(state.at);
        if (value < 0 || value > limit) {
          // Dragged off the stage (back onto a ruler): the guide goes away.
          if (index >= 0) next.splice(index, 1);
        } else if (index >= 0) {
          next[index] = value;
        } else {
          next.push(value);
        }
        ui.previewGuideLine(axis, next);
        break;
      }
      case 'move': {
        // Whole stage units, so objects do not land on fractions at odd zooms.
        let dx = Math.round(point.x - state.from.x);
        let dy = Math.round(point.y - state.from.y);
        // Shift keeps the move to one axis.
        let freeX = true;
        let freeY = true;
        if (event.shiftKey) {
          if (Math.abs(dx) >= Math.abs(dy)) {
            dy = 0;
            freeY = false;
          } else {
            dx = 0;
            freeX = false;
          }
        }
        // Ctrl (Cmd) suspends snapping; the selection box is what lines up.
        // `state.objects` holds the frames from when the drag began, while
        // `dx` and `dy` are from that same start, so they stay in step.
        let lines: SnapLine[] = [];
        const start = boxAround(state.objects);
        if (start && view.snap && !event.ctrlKey && !event.metaKey) {
          const from = boundsOf(start);
          const snap = snapBox(
            { ...from, x: from.x + dx, y: from.y + dy },
            snapCandidates(state.objects),
            SNAP_PX / zoom,
          );
          dx += freeX ? snap.dx : 0;
          dy += freeY ? snap.dy : 0;
          lines = snap.lines.filter((line) => (line.axis === 'x' ? freeX : freeY));
        }
        setSnapLines(lines);
        actions.applyFrames(transformObjects(state.objects, (frame) => moveFrame(frame, dx, dy)));
        break;
      }
      case 'resize': {
        const { handle, box: from, objects: dragged } = state;
        const [only] = dragged;
        const single = dragged.length === 1 && only!.type !== 'group' ? only! : null;
        const leaves = dragged.flatMap(leavesOf);
        // Pictures keep their proportions from a corner unless Shift releases
        // them; everything else is free unless Shift constrains it.
        const pictureCorner = single?.type === 'image' && CORNERS.includes(handle);
        const keepRatio =
          (pictureCorner ? !event.shiftKey : event.shiftKey) ||
          // A rotated box cannot be stretched along the stage axes and stay a box.
          (!single && leaves.some((leaf) => needsEvenScale(leaf.frame)));
        let target =
          from.rotation === 0 ? { x: Math.round(point.x), y: Math.round(point.y) } : point;
        // Snap the edges the handle drags, while the box is upright. Keeping
        // proportions has to choose an axis, so it does not snap.
        if (from.rotation === 0 && !keepRatio) {
          if (!view.snap || event.ctrlKey || event.metaKey) {
            setSnapLines([]);
          } else {
            const candidates = snapCandidates(dragged);
            const threshold = SNAP_PX / zoom;
            const lines: SnapLine[] = [];
            if (handle.includes('e') || handle.includes('w')) {
              const snapped = snapValue(target.x, candidates.x, threshold);
              target = { ...target, x: snapped.value };
              lines.push(...snapped.lines.map((at): SnapLine => ({ axis: 'x', at })));
            }
            if (handle.includes('n') || handle.includes('s')) {
              const snapped = snapValue(target.y, candidates.y, threshold);
              target = { ...target, y: snapped.value };
              lines.push(...snapped.lines.map((at): SnapLine => ({ axis: 'y', at })));
            }
            setSnapLines(lines);
          }
        } else {
          setSnapLines([]);
        }
        const to = resizeFrame(from, handle, target, {
          keepRatio,
          fromCentre: event.altKey,
          minSize: 1,
        });
        actions.applyFrames(
          transformObjects(dragged, (frame) => (single ? to : scaleFrame(frame, from, to))),
        );
        break;
      }
      case 'rotate': {
        setSnapLines([]);
        const { pivot, startRotation } = state;
        // Whole degrees, or 15° steps with Shift.
        const delta = rotationDelta(
          pivot,
          state.from,
          point,
          startRotation,
          event.shiftKey ? 15 : 1,
        );
        actions.applyFrames(
          transformObjects(state.objects, (frame) => rotateFrame(frame, pivot, delta)),
        );
        break;
      }
      case 'marquee': {
        setSnapLines([]);
        const area = rectFromPoints(state.from, point);
        setMarquee(area);
        const inside = objects
          .filter(
            (object) =>
              !object.hiddenInEditor &&
              !object.locked &&
              leavesOf(object).some((leaf) => rectsTouch(area, boundsOf(leaf.frame))),
          )
          .map((object) => object.id);
        editor.select([...new Set([...state.base, ...inside])]);
        break;
      }
    }
  };

  const endDrag = (cancelled: boolean) => {
    const state = drag.current;
    if (!state) return;
    drag.current = null;
    setMarquee(null);
    setSnapLines([]);
    setPanning(false);
    if (state.kind === 'guide') {
      if (cancelled) ui.previewGuideLine(state.axis, state.base);
      ui.commitView();
    }
    if (state.kind === 'move' || state.kind === 'resize' || state.kind === 'rotate') {
      if (cancelled) editor.cancelGesture();
      else editor.commitGesture();
    }
    // A click on empty stage, with no drag, clears the selection.
    if (state.kind === 'pending' && !state.onObject && !state.adding && !cancelled) {
      editor.select([]);
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (viewportRef.current!.hasPointerCapture(event.pointerId)) {
      viewportRef.current!.releasePointerCapture(event.pointerId);
    }
    endDrag(false);
  };

  // ------------------------------------------------------------ keyboard

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (editingTextId) return;
    const command = event.ctrlKey || event.metaKey;
    const step = event.shiftKey ? 10 : 1;
    const nudges: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const nudge = nudges[event.key];

    if (event.key === 'Escape') {
      if (drag.current) endDrag(true);
      else if (getFormatPainterState().armed) cancelFormatPainter();
      else editor.select([]);
    } else if (nudge && !command && selected.length > 0) {
      actions.nudge(...nudge);
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && !command) {
      actions.deleteSelection();
    } else if (command && event.key === '0') {
      editor.setZoom('fit');
    } else if (command && (event.key === '=' || event.key === '+')) {
      zoomStep(1);
    } else if (command && event.key === '-') {
      zoomStep(-1);
    } else if (command && event.code === 'KeyG') {
      if (event.shiftKey) actions.ungroup();
      else actions.group();
    } else if (command && event.code === 'BracketRight') {
      actions.reorder(event.shiftKey ? 'front' : 'forward');
    } else if (command && event.code === 'BracketLeft') {
      actions.reorder(event.shiftKey ? 'back' : 'backward');
    } else {
      return;
    }
    event.preventDefault();
  };

  return (
    <section
      className={`stage-area${view.rulers ? ' with-rulers' : ''}`}
      data-testid="stage"
      aria-label="Stage"
    >
      <StageToolbar
        open={open}
        current={current}
        zoom={zoom}
        fitting={zoomSetting === 'fit'}
        onStep={zoomStep}
        onZoom={(level) => (level === 'fit' ? editor.setZoom('fit') : zoomTo(level))}
      />
      {/* The stage itself, under the toolbar: rulers, and the scrolling area they measure. */}
      <div className="stage-body">
        {view.rulers && (
          <Rulers stage={size} zoom={zoom} scroll={scroll} offset={offset} onStart={startGuide} />
        )}
        <div
          ref={viewportRef}
          className={`stage-viewport${panning ? ' panning' : ''}`}
          data-testid="stage-viewport"
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => endDrag(true)}
          onKeyDown={onKeyDown}
          onContextMenu={onStageContextMenu}
          onDoubleClick={onDoubleClick}
          onScroll={(event) => {
            // Scrolling or panning by the author moves the stage under the
            // pointer, so a wheel zoom after it must take a fresh anchor. The
            // browser can nudge a placed position by a pixel as the layout
            // settles, which is not the author: allow for that much.
            const { scrollLeft, scrollTop } = event.currentTarget;
            setScroll({ left: scrollLeft, top: scrollTop });
            const placed = placedScroll.current;
            if (
              placed === null ||
              Math.abs(placed.left - scrollLeft) > SCROLL_SLOP ||
              Math.abs(placed.top - scrollTop) > SCROLL_SLOP
            ) {
              wheelBurst.current = null;
            }
          }}
          onPointerEnter={() => {
            hovering.current = true;
          }}
          onPointerLeave={() => {
            hovering.current = false;
          }}
        >
          {viewport && current && (
            <div className="stage-content" style={{ width: content.width, height: content.height }}>
              <div
                ref={canvasRef}
                className="stage-canvas"
                data-testid="stage-canvas"
                data-zoom={zoom}
                style={{
                  left: offset.x,
                  top: offset.y,
                  width: canvas.width,
                  height: canvas.height,
                }}
              >
                <div
                  ref={slideRef}
                  className="stage-slide"
                  style={{
                    width: size.width,
                    height: size.height,
                    transform: `scale(${zoom})`,
                    background: project.theme.colors.background,
                  }}
                >
                  {underlay.length > 0 && (
                    <div
                      className="stage-underlay"
                      data-testid="stage-underlay"
                      data-dim={beneath ? 'true' : undefined}
                      aria-hidden="true"
                    >
                      {underlay.map((node, index) => toReact(node, index))}
                    </div>
                  )}
                  {objects.map(
                    (object) =>
                      !object.hiddenInEditor &&
                      (!shownAtPlayhead || shownAtPlayhead.has(object.id)) && (
                        <ObjectView
                          key={object.id}
                          object={object}
                          context={context}
                          editingText={editingTextId === object.id}
                          editingCell={
                            editingTextId === object.id && object.type === 'table' && editingCell
                              ? `${editingCell.row}:${editingCell.column}`
                              : undefined
                          }
                          // Drawn in the state being edited (a choice's mark fills when selected).
                          state={stateEdit?.objectId === object.id ? stateEdit.stateId : 'normal'}
                        />
                      ),
                  )}
                  {editingObject &&
                    (() => {
                      const cell = editingObject.type === 'table' ? editingCell : null;
                      const tp = textProps(editingObject, cell);
                      if (!tp) return null;
                      return (
                        <TextEditor
                          key={cell ? `${cell.row}:${cell.column}` : 'text'}
                          object={
                            editingObject.type === 'table' && cell
                              ? { ...editingObject, frame: cellFrame(editingObject, cell) }
                              : editingObject
                          }
                          doc={tp.doc}
                          padding={tp.padding}
                          align={tp.align}
                          autofit={tp.autofit}
                          context={context}
                          onCommit={(doc, patch) =>
                            commitTextEdit(editingObject.id, doc, patch, cell)
                          }
                          onCancel={() => editor.stopEditingText()}
                        />
                      );
                    })()}
                </div>
                {view.offSlide !== 'show' && (
                  // Over what is past the slide's edges, in the pasteboard's colour (B2). It
                  // takes no pointer, so those objects are still picked and moved as before.
                  <div
                    className="stage-off-slide"
                    data-testid="stage-off-slide"
                    data-off-slide={view.offSlide}
                    aria-hidden="true"
                  />
                )}
                {view.grid && (
                  <div
                    className="stage-grid"
                    style={{
                      backgroundSize: `${view.gridSize * zoom}px ${view.gridSize * zoom}px`,
                    }}
                  />
                )}
                {view.guides &&
                  view.guideX.map((at) => (
                    <div
                      key={`guide-x-${at}`}
                      className="guide guide-vertical"
                      data-guide-x={at}
                      style={{ left: at * zoom }}
                    />
                  ))}
                {view.guides &&
                  view.guideY.map((at) => (
                    <div
                      key={`guide-y-${at}`}
                      className="guide guide-horizontal"
                      data-guide-y={at}
                      style={{ top: at * zoom }}
                    />
                  ))}
                <Selection
                  box={box}
                  handles={handles}
                  marquee={marquee}
                  snapLines={snapLines}
                  zoom={zoom}
                />
                {box && !editingTextId && (
                  <SelectionTags
                    box={box}
                    zoom={zoom}
                    name={selected.length === 1 ? selected[0]!.name : `${selected.length} objects`}
                  />
                )}
                {selected.length === 1 && !timelinePreview && (
                  <MotionPaths
                    open={open}
                    slide={current.slide}
                    object={pathsOf ?? selected[0]!}
                    zoom={zoom}
                    canvas={canvasRef}
                  />
                )}
              </div>
            </div>
          )}
          {viewport && !current && (
            <p className="placeholder">This project has no slides. Use Insert → New Slide.</p>
          )}
        </div>

        {menu && (
          <ContextMenu
            at={menu}
            selection={selected}
            onAction={onMenuAction}
            onClose={() => setMenu(null)}
          />
        )}
      </div>
    </section>
  );
}

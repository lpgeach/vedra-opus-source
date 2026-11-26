/**
 * What the author can do to the objects on the current slide, apart from
 * dragging them: the things the ribbon, the menu and the keyboard call.
 * Everything here goes through history commands, so everything is undoable.
 */
import {
  calloutGeometry,
  createAudioObject,
  createButtonObject,
  createGroupObject,
  createHotspotObject,
  createImageObject,
  createMarkerObject,
  createTextEntryObject,
  createCheckboxObject,
  createSliderObject,
  createWebObject,
  createGraphicObject,
  createTableObject,
  createPanoramaObject,
  createDialObject,
  createRadioObject,
  createShapeObject,
  createTextObject,
  createVideoObject,
  createZoomRegion,
  forEachObject,
} from '@vedraopus/model';
import type {
  CalloutKind,
  GraphicItem,
  AssetHash,
  Frame,
  GroupObject,
  SceneObject,
  ShapeGeometry,
  Speech,
} from '@vedraopus/model';
import { analyseAudio } from '../audio-analysis';
import { measureVideo } from '../video-analysis';
import { assetUrl, editedSlide, editor, getEditorState, selectedObjects } from '../project-store';
import {
  forMasters,
  PASTE_OFFSET,
  parseObjects,
  preparePaste,
  serializeObjects,
} from './clipboard';
import { alignMoves, boundsOf, distributeMoves, moveFrame, unionRects } from './geometry';
import type { Align, DistributeAxis, Point } from './geometry';
import { changedOnly, leavesOf, selectionFrame, transformObjects } from './transform';
import type { FrameUpdate } from './transform';

/** How far a new object is shifted when the usual spot is taken, so it does not hide the last one. */
const CASCADE = 16;
/** A picture larger than this share of the stage is scaled down when inserted. */
const MAX_PICTURE_SHARE = 0.8;

/** The project, slide and layer being edited, or null when there is nothing to edit. */
function editing() {
  const { open, view, selectedSlideId, masterTargetId, selection } = getEditorState();
  if (!open) return null;
  const current = editedSlide(open.project, view, selectedSlideId, masterTargetId);
  if (!current) return null;
  // Only the base layer is edited until slide layers arrive (P4.2).
  const layer = current.slide.baseLayer;
  return {
    history: open.history,
    project: open.project,
    slide: current.slide,
    layer,
    selected: selectedObjects(current.slide, selection),
    /** A master or layout: drawn under slides, but its timeline never plays. */
    isMaster: current.isMaster ?? false,
  };
}

/** Run several commands as one undo step. */
function asOneStep(label: string, run: () => void): void {
  const history = getEditorState().open?.history;
  if (!history) return;
  // Already inside a drag: its own gesture collects the commands.
  if (history.inGesture) {
    run();
    return;
  }
  editor.beginGesture(label);
  try {
    run();
  } catch (error) {
    editor.cancelGesture();
    throw error;
  }
  editor.commitGesture();
}

/** How an object should move in the z-order: one place, or all the way. */
type Reorder = 'forward' | 'backward' | 'front' | 'back';

/** Where the last objects copied from this window came from, if anywhere. */
let copiedFrom: { workspaceId: string | null; slideId: string } | null = null;
/** The clipboard write in progress, so a paste straight after a copy waits for it. */
let pendingWrite: Promise<void> | null = null;

/** How far a paste should shift, so a copy on the same slide does not hide its original. */
function pasteOffset(slideId: string): number {
  const workspaceId = getEditorState().open?.session.workspaceId ?? null;
  return copiedFrom?.workspaceId === workspaceId && copiedFrom.slideId === slideId
    ? PASTE_OFFSET
    : 0;
}

/** Add copied objects to the current slide and select them. */
function pasteObjects(copied: readonly SceneObject[], label: string, offset: number): void {
  const context = editing();
  if (!context || copied.length === 0) return;
  const prepared = preparePaste(copied, {
    assets: context.project.assets,
    offset,
  });
  const { missingMedia } = prepared;
  let { objects } = prepared;
  if (context.isMaster) {
    const kept = forMasters(objects);
    objects = kept.objects;
    if (kept.changed) {
      editor.showError(
        'Animations, zoom regions, hotspots and markers play only on slides, so they were left out of the paste.',
      );
    }
  }
  if (missingMedia === 1) {
    editor.showError('An object was not pasted because this project does not have its media file.');
  } else if (missingMedia > 1) {
    editor.showError(
      `${missingMedia} objects were not pasted because this project does not have their media files.`,
    );
  }
  if (objects.length === 0) return;
  asOneStep(label, () => {
    // Added back to front, so their z-order is kept and they end up on top.
    for (const object of objects) {
      context.history.execute('object.add', { layerId: context.layer.id, object });
    }
  });
  editor.select(objects.map((object) => object.id));
}

/** Frame updates that move each of `objects`, and everything inside them, by its move. */
function movedObjects(objects: readonly SceneObject[], moves: readonly Point[]): FrameUpdate[] {
  const byLeaf = new Map<string, Point>();
  objects.forEach((object, index) => {
    const move = moves[index]!;
    for (const leaf of leavesOf(object)) byLeaf.set(leaf.id, move);
  });
  return transformObjects(objects, (frame, object) => {
    const move = byLeaf.get(object.id)!;
    return moveFrame(frame, move.x, move.y);
  });
}

/**
 * How long a sound is, to the hundredth of a second: as the media pipeline
 * measured it on import, or by decoding it. Throws when it has no sound.
 */
export async function soundLength(hash: AssetHash): Promise<number> {
  const { open } = getEditorState();
  const meta = open?.project.assets[hash];
  if (!open || !meta) throw new Error('That sound is not in the project.');
  const length = meta.duration ?? (await analyseAudio(assetUrl(open.session, hash))).length;
  if (!(length > 0)) throw new Error(`"${meta.fileName}" has no sound in it.`);
  return Math.round(length * 100) / 100;
}

export const stage = {
  /** Add an object in the middle of the stage, on top, and select it. */
  /** Put an object on the slide: in the middle, or (sound markers) in the top-left corner. */
  insert(object: SceneObject, place: 'middle' | 'corner' = 'middle'): void {
    const context = editing();
    if (!context) return;
    const { width, height } = context.project.stage;
    let x = place === 'corner' ? CASCADE : Math.round((width - object.frame.width) / 2);
    let y = place === 'corner' ? CASCADE : Math.round((height - object.frame.height) / 2);
    const taken = (atX: number, atY: number) =>
      context.layer.objects.some((each) => each.frame.x === atX && each.frame.y === atY);
    while (taken(x, y)) {
      x += CASCADE;
      y += CASCADE;
    }
    object.frame.x = x;
    object.frame.y = y;
    context.history.execute('object.add', { layerId: context.layer.id, object });
    editor.select([object.id]);
  },

  insertShape(geometry: ShapeGeometry, name: string): void {
    stage.insert(createShapeObject(geometry, {}, name));
  },

  /** Insert → Caption (B17): a callout, its tail pointing below, ready for text. */
  insertCallout(kind: CalloutKind): void {
    const [width, height] = [240, 120];
    const label = { rounded: 'Rounded', square: 'Square', oval: 'Oval', cloud: 'Cloud' }[kind];
    stage.insert(
      createShapeObject(
        calloutGeometry(kind, width, height),
        { width, height },
        `${label} Callout`,
      ),
    );
  },

  insertTextBox(): void {
    stage.insert(createTextObject('Text', { width: 320, height: 60 }));
  },

  insertButton(): void {
    stage.insert(createButtonObject('Button'));
  },

  /**
   * A zoom region (docs/briefs/P6.7-zoom-and-cues.md): half the stage's size
   * in its middle, from the playhead for 3 s, or to the timeline's end if sooner.
   */
  insertZoomRegion(): void {
    const context = editing();
    if (!context) return;
    if (context.isMaster) {
      editor.showError('Zoom regions work on slides, not on masters and layouts.');
      return;
    }
    const region = createZoomRegion(context.project.stage);
    const { duration } = context.layer.timeline;
    const start = Math.min(
      Math.round(getEditorState().playhead * 10) / 10,
      Math.max(0, duration - 0.5),
    );
    region.timing = { start, duration: Math.max(0.5, Math.min(3, duration - start)) };
    stage.insert(region);
  },

  /** An invisible click target (docs/briefs/P9.1-hotspots-markers.md). */
  insertHotspot(): void {
    const context = editing();
    if (!context) return;
    if (context.isMaster) {
      editor.showError('Hotspots and markers work on slides, not on masters and layouts.');
      return;
    }
    stage.insert(createHotspotObject({ width: 200, height: 120 }));
  },

  /** A field the learner types into, outside a question, to bind to a variable (P9.2). */
  insertField(numeric: boolean): void {
    if (!editing()) return;
    stage.insert(
      createTextEntryObject(
        { width: 280, height: 44 },
        numeric,
        numeric ? 'Numeric Entry' : 'Text Entry',
      ),
    );
  },

  /** A table of 3 columns and 4 rows, the first a header (P9.9). */
  insertTable(): void {
    if (editing()) stage.insert(createTableObject());
  },

  /** A copy of an icon or illustration from the library (P9.8). */
  insertGraphic(item: GraphicItem): void {
    if (editing()) stage.insert(createGraphicObject(item));
  },

  /** A web page from an address (P9.6): the Format panel takes the real one. */
  insertWebAddress(): void {
    if (!editing()) return;
    stage.insert(createWebObject({ kind: 'url', url: 'https://example.com' }, 'Web page'));
  },

  /**
   * Ask for a folder of web pages and put it on the slide as a web object
   * (P9.6), its files kept as assets: one undo step.
   */
  async insertWebFolder(): Promise<void> {
    const context = editing();
    if (!context) return;
    const { folder, error } = await window.vedraopus.project.importWebFolder();
    if (error) {
      editor.showError(error);
      return;
    }
    if (!folder) return;
    const files: Record<string, string> = {};
    asOneStep('Insert web object', () => {
      for (const file of folder.files) {
        context.history.execute('asset.add', { hash: file.hash, meta: file.meta });
        files[file.path] = file.hash;
      }
      stage.insert(
        createWebObject(
          { kind: 'folder', files, entry: folder.entry },
          folder.name.slice(0, 200) || 'Web page',
        ),
      );
    });
  },

  /** A slider and a dial the learner moves to choose a number (P9.4). */
  insertSlider(): void {
    if (editing()) stage.insert(createSliderObject());
  },
  insertDial(): void {
    if (editing()) stage.insert(createDialObject());
  },

  /** A checkbox of the author's own (P9.3). */
  insertCheckbox(): void {
    if (!editing()) return;
    stage.insert(createCheckboxObject('Checkbox', { width: 280, height: 44 }));
  },

  /**
   * A radio button (P9.3), in the group of the radio button selected now, or
   * in a new group named for the slide's next free number.
   */
  insertRadio(): void {
    const context = editing();
    if (!context) return;
    const chosen = context.selected.find(
      (object) => object.type === 'choice' && object.props.mark === 'radio' && object.buttonSet,
    );
    let group = chosen?.buttonSet ?? null;
    if (!group) {
      const taken = new Set<string>();
      for (const layer of [context.slide.baseLayer, ...context.slide.layers]) {
        forEachObject(layer.objects, (object) => {
          if (object.buttonSet) taken.add(object.buttonSet);
        });
      }
      let n = 1;
      while (taken.has(`Group ${n}`)) n += 1;
      group = `Group ${n}`;
    }
    stage.insert(createRadioObject('Radio button', group, { width: 280, height: 44 }));
  },

  /** A small icon that opens its own label in the course (P9.1). */
  insertMarker(): void {
    const context = editing();
    if (!context) return;
    if (context.isMaster) {
      editor.showError('Hotspots and markers work on slides, not on masters and layouts.');
      return;
    }
    stage.insert(createMarkerObject());
  },

  /** Put a picture from the project's media on the slide at its natural size, if it fits. */
  insertImage(hash: AssetHash): void {
    const context = editing();
    const meta = context?.project.assets[hash];
    if (!context || meta?.kind !== 'image') return;
    let width = meta.width || 320;
    let height = meta.height || 240;
    const { stage: size } = context.project;
    const scale = Math.min(
      1,
      (size.width * MAX_PICTURE_SHARE) / width,
      (size.height * MAX_PICTURE_SHARE) / height,
    );
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
    const name = meta.fileName.replace(/\.[^.]+$/, '') || 'Picture';
    stage.insert(createImageObject(hash, { width, height }, name));
  },

  /** Ask for picture files, add them to the project's media, and put them on the slide. */
  /**
   * Ask for a picture and put it on the slide as a 360° image (P9.10): one undo
   * step. Spots and triggers belong to slides, so not on masters.
   */
  async insertPanoramaFromFile(): Promise<void> {
    const context = editing();
    if (!context) return;
    if (context.isMaster) {
      editor.showError('360° images work on slides, not on masters and layouts.');
      return;
    }
    const imported = await editor.importAssets();
    const picture = imported.find((asset) => asset.meta.kind === 'image');
    if (!picture) return;
    asOneStep('Insert 360° image', () => stage.insert(createPanoramaObject(picture.hash)));
  },

  async insertPictureFromFile(): Promise<void> {
    const imported = await editor.importAssets();
    const pictures = imported.filter((asset) => asset.meta.kind === 'image');
    if (pictures.length === 0) return;
    asOneStep('Insert picture', () => {
      for (const picture of pictures) stage.insertImage(picture.hash);
    });
  },

  /**
   * Put a sound on the slide: on the timeline from the start for its whole
   * length (measured by decoding it), its marker in the top-left corner.
   * Throws when the file cannot be decoded.
   */
  async insertAudio(
    hash: AssetHash,
    made?: { name: string; speech: Speech },
  ): Promise<string | undefined> {
    const { open } = getEditorState();
    const meta = open?.project.assets[hash];
    if (!open || meta?.kind !== 'audio') return undefined;
    const length = await soundLength(hash);
    const name = made?.name ?? (meta.fileName.replace(/\.[^.]+$/, '') || 'Audio');
    // Lengths to the hundredth: the timeline works in tenths, the sound may end between them.
    const audio = createAudioObject(hash, length, {}, name);
    // Made by text-to-speech: what it was made from, to change it later.
    if (made) audio.props.speech = made.speech;
    asOneStep('Insert audio', () => {
      stage.insert(audio, 'corner');
      stage.fitTimeline(audio);
    });
    return audio.id;
  },

  /**
   * Put a video on the slide, centred and scaled to fit like a picture, on the
   * timeline from the start for its whole length. Throws when it cannot be read.
   */
  async insertVideo(hash: AssetHash, poster?: AssetHash): Promise<void> {
    const { open } = getEditorState();
    const meta = open?.project.assets[hash];
    if (!open || meta?.kind !== 'video') return;
    // The pipeline measured it on import; otherwise the video's own metadata tells.
    const facts =
      meta.duration && meta.width && meta.height
        ? { length: meta.duration, width: meta.width, height: meta.height }
        : await measureVideo(assetUrl(open.session, hash));
    const { stage: size } = open.project;
    let width = facts.width || 480;
    let height = facts.height || 270;
    const scale = Math.min(
      1,
      (size.width * MAX_PICTURE_SHARE) / width,
      (size.height * MAX_PICTURE_SHARE) / height,
    );
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
    const name = meta.fileName.replace(/\.[^.]+$/, '') || 'Video';
    const length = Math.round(facts.length * 100) / 100;
    const video = createVideoObject(hash, length, { width, height }, name);
    if (poster && open.project.assets[poster]?.kind === 'image') video.props.poster = poster;
    asOneStep('Insert video', () => {
      stage.insert(video);
      stage.fitTimeline(video);
    });
  },

  /** Ask for video files, add them to the project's media, and put them on the slide. */
  async insertVideoFromFile(): Promise<void> {
    const imported = await editor.importAssets();
    const videos = imported.filter((asset) => asset.meta.kind === 'video');
    for (const video of videos) await stage.insertVideo(video.hash, video.poster?.hash);
  },

  /** Lengthen the edited layer's timeline, if needed, so all of `object` is on it. */
  fitTimeline(object: SceneObject): void {
    const context = editing();
    if (!context || object.timing.duration === 'untilEnd') return;
    const end = object.timing.start + object.timing.duration;
    if (end > context.layer.timeline.duration) {
      context.history.execute('layer.setDuration', {
        layerId: context.layer.id,
        duration: Math.ceil(end * 10) / 10,
      });
    }
  },

  /** Ask for sound files, add them to the project's media, and put them on the slide. */
  async insertAudioFromFile(): Promise<void> {
    const imported = await editor.importAssets();
    const sounds = imported.filter((asset) => asset.meta.kind === 'audio');
    for (const sound of sounds) await stage.insertAudio(sound.hash);
  },

  /** Give objects new frames. Frames that would not change produce no command. */
  applyFrames(updates: readonly FrameUpdate[]): void {
    const context = editing();
    if (!context) return;
    const now = new Map<string, Frame>();
    forEachObject(context.layer.objects, (object) => {
      now.set(object.id, object.frame);
    });
    for (const { objectId, frame } of changedOnly(updates, now)) {
      context.history.execute('object.update', { objectId, changes: { frame } });
    }
  },

  /** Move the selection by a distance in stage units. */
  nudge(dx: number, dy: number): void {
    const context = editing();
    if (!context || context.selected.length === 0) return;
    asOneStep('Nudge', () => {
      stage.applyFrames(transformObjects(context.selected, (frame) => moveFrame(frame, dx, dy)));
    });
  },

  deleteSelection(): void {
    const context = editing();
    // A locked object cannot be removed from the stage.
    const targets = context?.selected.filter((object) => !object.locked) ?? [];
    if (!context || targets.length === 0) return;
    context.history.execute('object.remove', {
      objectIds: targets.map((object) => object.id),
    });
    editor.select([]);
  },

  selectAll(): void {
    const context = editing();
    if (context) {
      editor.select(
        context.layer.objects.filter((object) => !object.locked).map((object) => object.id),
      );
    }
  },

  /** Gather the selected top-level objects into a group and select it. */
  group(): void {
    const context = editing();
    const members = context?.selected.filter((object) => !object.locked) ?? [];
    if (!context || members.length < 2) return;
    const group: GroupObject = createGroupObject([]);
    context.history.execute('object.group', {
      objectIds: members.map((object) => object.id),
      group,
    });
    editor.select([group.id]);
  },

  /**
   * Group the selection into a scrolling panel (P9.5): its window half the
   * group's height, at least 40, in one step.
   */
  scrollingPanel(): void {
    const context = editing();
    const members = context?.selected.filter((object) => !object.locked) ?? [];
    if (!context) return;
    if (members.length < 2) {
      editor.showError('Select two or more objects to put in a scrolling panel.');
      return;
    }
    const top = Math.min(...members.map((object) => object.frame.y));
    const bottom = Math.max(...members.map((object) => object.frame.y + object.frame.height));
    const group: GroupObject = {
      ...createGroupObject([], 'Scrolling Panel'),
      scroll: { height: Math.max(40, Math.round((bottom - top) / 2)) },
    };
    context.history.execute('object.group', {
      objectIds: members.map((object) => object.id),
      group,
    });
    editor.select([group.id]);
  },

  /** Dissolve every selected group and select what came out of them. */
  ungroup(): void {
    const context = editing();
    const groups = context?.selected.filter((object) => object.type === 'group') ?? [];
    if (!context || groups.length === 0) return;
    const freed = groups.flatMap((group) => group.children.map((child) => child.id));
    asOneStep('Ungroup', () => {
      for (const group of groups) context.history.execute('object.ungroup', { groupId: group.id });
    });
    editor.select(freed);
  },

  /** Keep the selection where it is, but make it unselectable by click from now on. */
  lockSelection(): void {
    const context = editing();
    const targets = context?.selected.filter((object) => !object.locked) ?? [];
    if (!context || targets.length === 0) return;
    asOneStep('Lock', () => {
      for (const object of targets) {
        context.history.execute('object.update', {
          objectId: object.id,
          changes: { locked: true },
        });
      }
    });
    editor.select([]);
  },

  /** Unlock everything on the slide, since a locked object cannot be clicked to unlock it. */
  unlockAll(): void {
    const context = editing();
    if (!context) return;
    const locked: string[] = [];
    forEachObject(context.layer.objects, (object) => {
      if (object.locked) locked.push(object.id);
    });
    if (locked.length === 0) return;
    asOneStep('Unlock All', () => {
      for (const objectId of locked) {
        context.history.execute('object.update', { objectId, changes: { locked: false } });
      }
    });
  },

  /** Move the selection in the z-order, keeping the selected objects' relative order. */
  reorder(mode: Reorder): void {
    const context = editing();
    if (!context) return;
    const selectedIds = new Set(
      context.selected.filter((object) => !object.locked).map((object) => object.id),
    );
    if (selectedIds.size === 0) return;

    // Plan the moves on a copy of the order, so each command's target index
    // matches the state the one before it will have left.
    const order = context.layer.objects.map((object) => object.id);
    const chosen = order.filter((id) => selectedIds.has(id));
    // Moving up, the topmost goes first so the selection keeps its order;
    // moving down, the bottommost does.
    const moving = mode === 'forward' || mode === 'back' ? [...chosen].reverse() : chosen;
    const steps: { objectId: string; index: number }[] = [];
    for (const objectId of moving) {
      const from = order.indexOf(objectId);
      const to =
        mode === 'front'
          ? order.length - 1
          : mode === 'back'
            ? 0
            : mode === 'forward'
              ? Math.min(from + 1, order.length - 1)
              : Math.max(from - 1, 0);
      if (to === from) continue;
      order.splice(from, 1);
      order.splice(to, 0, objectId);
      steps.push({ objectId, index: to });
    }
    if (steps.length === 0) return;
    asOneStep('Reorder', () => {
      for (const step of steps) context.history.execute('object.reorder', step);
    });
  },

  /**
   * Line the selection up. One object lines up in the stage; several line up
   * in the box around them. Rotated objects line up by what is seen.
   */
  align(align: Align): void {
    const context = editing();
    const targets = context?.selected.filter((object) => !object.locked) ?? [];
    if (!context || targets.length === 0) return;
    const boxes = targets.map((object) => boundsOf(selectionFrame(object)));
    const container =
      targets.length === 1
        ? { x: 0, y: 0, width: context.project.stage.width, height: context.project.stage.height }
        : unionRects(boxes)!;
    const moves = alignMoves(boxes, align, container);
    asOneStep('Align', () => {
      stage.applyFrames(movedObjects(targets, moves));
    });
  },

  /** Even out the gaps between three or more selected objects. */
  distribute(axis: DistributeAxis): void {
    const context = editing();
    const targets = context?.selected.filter((object) => !object.locked) ?? [];
    if (!context || targets.length < 3) return;
    const boxes = targets.map((object) => boundsOf(selectionFrame(object)));
    const moves = distributeMoves(boxes, axis);
    asOneStep('Distribute', () => {
      stage.applyFrames(movedObjects(targets, moves));
    });
  },

  /** Put the selected objects on the system clipboard, for this or another window. */
  async copy(): Promise<void> {
    const context = editing();
    if (!context || context.selected.length === 0) return;
    pendingWrite = window.vedraopus.clipboard.write(serializeObjects(context.selected));
    await pendingWrite;
    copiedFrom = {
      workspaceId: getEditorState().open?.session.workspaceId ?? null,
      slideId: context.slide.id,
    };
  },

  /** Copy, then remove the selection from the slide. */
  async cut(): Promise<void> {
    const context = editing();
    if (!context || context.selected.length === 0) return;
    await stage.copy();
    stage.deleteSelection();
  },

  /** Add the objects on the system clipboard to this slide. */
  async paste(): Promise<void> {
    const context = editing();
    if (!context) return;
    // A copy's write is still in flight when Paste follows it immediately.
    if (pendingWrite) await pendingWrite.catch(() => undefined);
    const copied = parseObjects(await window.vedraopus.clipboard.read());
    if (!copied || copied.length === 0) return;
    pasteObjects(copied, 'Paste', pasteOffset(context.slide.id));
  },

  /** Copy the selection in place, without touching the system clipboard. */
  duplicate(): void {
    const context = editing();
    if (!context || context.selected.length === 0) return;
    pasteObjects(context.selected, 'Duplicate', PASTE_OFFSET);
  },

  undo(): void {
    getEditorState().open?.history.undo();
  },

  redo(): void {
    getEditorState().open?.history.redo();
  },
};

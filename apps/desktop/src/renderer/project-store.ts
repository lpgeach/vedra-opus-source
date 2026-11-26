/**
 * The open project as the renderer sees it: the document's edit history, what
 * main says about the file on disk, and where the author is looking (which
 * view, which slide). React reads it through `useEditor`.
 *
 * How the panels are arranged is separate, in ui-store.ts: that belongs to the
 * installation, this belongs to the open project.
 */
import {
  allSlides,
  createHistory,
  createId,
  createSlide,
  findObject,
  findSlide,
  forEachObject,
  resolveObjectState,
  serializeProject,
  createQuestionSlide,
  convertToQuestion,
  createBank,
  createDrawSlide,
  createResultSlide,
  feedbackMasterOf,
  prepareSlideImport,
} from '@vedraopus/model';
import type {
  History,
  Layer,
  ObjectChanges,
  Project,
  Scene,
  SceneObject,
  Slide,
  Question,
  FreeformKind,
} from '@vedraopus/model';
import { useSyncExternalStore } from 'react';
import type {
  ImportedAsset,
  ImportProgress,
  OpenResult,
  PowerPointReport,
  SessionInfo,
} from '../shared/ipc';

/** What an import of slides brought in and left behind (P11.2 part B), for the author. */
export interface SlideImportSummary {
  slides: number;
  masters: number;
  variables: number;
  banks: number;
  media: number;
  dropped: string[];
}
import { heightToGrowTo } from './stage/grow-box';
import { forgetPendingTextFormat } from './stage/text-editor-state';
import { ui } from './ui-store';

export interface OpenProject {
  history: History;
  project: Project;
  session: SessionInfo;
}

/** The ribbon's tabs. `text` is contextual: it exists only while something with text is selected. */
export type SlidePanelTab = 'layers' | 'properties';
/** The upper right panel's tabs (B17). */
export type RightTab = 'triggers' | 'format' | 'check';

/** The ribbon's tabs (docs/briefs/B17-ribbon-and-panels.md); text is formatted from Home. */
export type RibbonTab =
  'home' | 'insert' | 'slides' | 'design' | 'transitions' | 'animations' | 'view';

export type EditorView = 'slide' | 'overview' | 'master';

/** How large the stage is drawn: to fit its area, or a fixed scale (1 = 100%). */
export type Zoom = 'fit' | number;
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 8;

export interface EditorState {
  open: OpenProject | null;
  view: EditorView;
  /**
   * The slide the author last chose. It may no longer exist (undo can remove
   * it), so read the slide being edited through `currentSlide`, not this.
   */
  selectedSlideId: string | null;
  /**
   * Edit-states mode: the object and the state of it being edited. The stage
   * shows the object in that state and changes to it are written to the state.
   * Read it through `activeStateEdit`, which also checks the object is still selected.
   */
  stateEdit: { objectId: string; stateId: string } | null;
  /** The overlay layer being edited on the current slide, or null for the base layer. */
  editingLayerId: string | null;
  /** Layers not drawn beneath the one being edited (the eye in the Layers panel). Not saved. */
  layersHiddenInEditor: readonly string[];
  ribbonTab: RibbonTab;
  /** The lower right panel's tab: the slide's layers or its properties (B17). */
  slidePanelTab: SlidePanelTab;
  /** The upper right panel's tab (B17). */
  rightTab: RightTab;
  /** Counts Insert → Trigger requests; the Triggers panel opens the new-trigger wizard on each. */
  newTriggerAsked: number;
  /** The timeline playhead, in seconds. */
  playhead: number;
  /**
   * True while the timeline is playing or being scrubbed: the stage then shows
   * only what the engine would show at the playhead. Otherwise it shows every
   * object, so anything can be edited.
   */
  timelinePreview: boolean;
  /** Whether the Publish dialog is showing. */
  publishOpen: boolean;
  /** The Translation dialog (P10.3). */
  translationOpen: boolean;
  /** What the last import could not bring across as it was (P11.1, B5); null when none is shown. */
  importReport: PowerPointReport | null;
  /** Which importer the report is from, for its wording. */
  importSource: 'powerpoint' | 'storyline';
  /** An import under way (B7): the cover over the window shows while this is set. */
  importing: ImportProgress | null;
  /** File → New from Template… (P11.2). */
  templatesOpen: boolean;
  /** File → Save as Template… (P11.2). */
  saveTemplateOpen: boolean;
  /** File → Export Handout… (P11.3). */
  handoutOpen: boolean;
  /** File → Export Video… (P11.3 part C). */
  videoOpen: boolean;
  /** File → Import Slides… (P11.2): the project chosen to take slides from, while choosing. */
  slideSource: { fileName: string; project: Project } | null;
  /** Whether the Variables dialog is showing. */
  variablesOpen: boolean;
  /** The Record Audio dialog. */
  recordingOpen: boolean;
  /** Insert → Icons and Illustrations (P9.8). */
  libraryOpen: boolean;
  /** Insert → Screen Recording (P9.11). */
  screenRecordingOpen: boolean;
  /**
   * The Text to Speech dialog: open to insert a new sound (`objectId` null),
   * or to change the sound with that id; null when closed.
   */
  speechDialog: { objectId: string | null } | null;
  /** In Master View, the id of the master or layout being edited. */
  masterTargetId: string | null;
  /**
   * Ids of the selected top-level objects on the current slide. Like the slide
   * id these can go stale; read them through `selectedObjects`.
   */
  selection: readonly string[];
  /** The object whose text is being edited in place on the stage, if any. */
  editingTextId: string | null;
  /** The cell being edited when `editingTextId` is a table (P9.9). */
  editingCell: { row: number; column: number } | null;
  /** A question slide shows its form or the slide itself (docs/briefs/P7.1-question-model.md). */
  questionView: 'form' | 'slide';
  /** The motion path chosen for editing on the selected object (docs/briefs/P6.5-animations.md). */
  motionPath: string | null;
  /**
   * The member of the selected group whose timing and animations are being edited (B8), chosen
   * in the timeline or the Animations tab; null, or one not in the group, means the group itself.
   */
  groupPart: string | null;
  /** The object a freeform motion path is being drawn for on the stage, if any. */
  drawingPathFor: string | null;
  zoom: Zoom;
  /** A message for the author about the last thing that went wrong, if any. */
  error: string | null;
}

let state: EditorState = {
  open: null,
  view: 'slide',
  selectedSlideId: null,
  masterTargetId: null,
  stateEdit: null,
  editingLayerId: null,
  layersHiddenInEditor: [],
  ribbonTab: 'home',
  slidePanelTab: 'layers',
  rightTab: 'triggers',
  newTriggerAsked: 0,
  playhead: 0,
  timelinePreview: false,
  publishOpen: false,
  translationOpen: false,
  importReport: null,
  importSource: 'powerpoint',
  importing: null,
  templatesOpen: false,
  saveTemplateOpen: false,
  slideSource: null,
  handoutOpen: false,
  videoOpen: false,
  variablesOpen: false,
  recordingOpen: false,
  libraryOpen: false,
  screenRecordingOpen: false,
  speechDialog: null,
  selection: [],
  editingTextId: null,
  editingCell: null,
  questionView: 'form',
  motionPath: null,
  groupPart: null,
  drawingPathFor: null,
  zoom: 'fit',
  error: null,
};
const listeners = new Set<() => void>();
let stopWatchingHistory: (() => void) | undefined;
let sendAfterGesture: (() => void) | undefined;
/** Gestures begun while one was already open; each commit closes one of them first. */
let nestedGestures = 0;

/** An import call is waiting on main, from its file dialog to its end (B7). */
let importInFlight = false;

/**
 * Run an import call, one at a time: a second asked for meanwhile does nothing (null). The
 * cover goes when it ends, however it ends, and progress arriving late cannot bring it back.
 */
async function whileImporting<T>(run: () => Promise<T>): Promise<T | null> {
  if (importInFlight) return null;
  importInFlight = true;
  try {
    return await run();
  } finally {
    importInFlight = false;
    setState({ importing: null });
  }
}

function setState(next: Partial<EditorState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function setSession(session: SessionInfo): void {
  // Ignore news about a project that has since been replaced.
  if (state.open?.session.workspaceId !== session.workspaceId) return;
  setState({ open: { ...state.open, session } });
}

function adopt(project: Project, session: SessionInfo): void {
  stopWatchingHistory?.();
  nestedGestures = 0;
  const real = createHistory(project, { validate: import.meta.env.DEV });
  // Everything in the editor changes objects with `object.update`. In
  // edit-states mode those changes belong to the state being edited, so the
  // command is given that state here, in one place, rather than at every caller.
  const history = new Proxy(real, {
    get(target, property) {
      if (property === 'execute') {
        return (name: string, payload: Record<string, unknown>) => {
          const editing = activeStateEdit();
          let routed =
            name === 'object.update' &&
            editing &&
            payload['objectId'] === editing.objectId &&
            payload['stateId'] === undefined
              ? { ...payload, stateId: editing.stateId }
              : payload;
          // A "grow box to fit" text box follows its text, growing or shrinking,
          // whoever changed it and in the same step as the change (see grow-box.ts).
          if (name === 'object.update' && routed['stateId'] === undefined) {
            const changes = (routed['changes'] ?? {}) as ObjectChanges;
            const found = findObject(target.project, String(routed['objectId']));
            const height = found ? heightToGrowTo(target.project, found.object, changes) : null;
            if (height !== null) {
              routed = { ...routed, changes: { ...changes, frame: { ...changes.frame, height } } };
            }
          }
          return (target.execute as (n: string, p: unknown) => void)(name, routed);
        };
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });

  let sendQueued = false;
  const send = () => {
    // Several changes in one tick (a multi-command action) go to main as one message.
    if (sendQueued) return;
    sendQueued = true;
    queueMicrotask(() => {
      sendQueued = false;
      void window.vedraopus.project.autosave(serializeProject(history.project)).then(setSession);
    });
  };
  sendAfterGesture = send;
  stopWatchingHistory = history.subscribe(() => {
    setState({ open: { history, project: history.project, session: state.open!.session } });
    // A drag changes the document on every pointer move. Main hears about it
    // once, when the drag ends (see `editor.commitGesture`).
    if (!history.inGesture) send();
  });
  setState({
    open: { history, project: history.project, session },
    view: 'slide',
    selectedSlideId: null,
    selection: [],
    editingTextId: null,
    zoom: 'fit',
    error: null,
  });
}

/** Apply the outcome of anything that opens a project. */
function settle(result: OpenResult): void {
  if (result.status === 'opened') adopt(result.project, result.session);
  else if (result.status === 'failed') setState({ error: result.message });
}

const current = () => serializeProject(state.open!.history.project);

export const editor = {
  newProject: async () => settle(await window.vedraopus.project.create()),
  openProject: async () => settle(await window.vedraopus.project.open()),
  /** File → Import PowerPoint… (P11.1): a new project from a deck, then its report. */
  importPowerPoint: async () => {
    const outcome = await whileImporting(() => window.vedraopus.project.importPowerPoint());
    if (!outcome) return;
    settle(outcome.result);
    if (outcome.result.status === 'opened')
      setState({ importReport: outcome.report, importSource: 'powerpoint' });
  },
  /** File → Import Articulate Storyline Course… (B5): a new project from a course, then its report. */
  importStoryline: async () => {
    const outcome = await whileImporting(() => window.vedraopus.project.importStoryline());
    if (!outcome) return;
    settle(outcome.result);
    if (outcome.result.status === 'opened')
      setState({ importReport: outcome.report, importSource: 'storyline' });
  },
  /** How far the import under way is (B7); ignored unless one is. */
  showImportProgress: (progress: ImportProgress) => {
    if (importInFlight) setState({ importing: progress });
  },
  /** Whether an import is under way, from its file dialog to its end (B7). */
  isImporting: () => importInFlight,
  closeImportReport: () => setState({ importReport: null }),
  /** File → New from Template… (P11.2): the chooser, over the Welcome screen or the editor. */
  setTemplatesOpen: (templatesOpen: boolean) => setState({ templatesOpen }),
  setSaveTemplateOpen: (saveTemplateOpen: boolean) =>
    setState({ saveTemplateOpen: saveTemplateOpen && state.open !== null }),
  /** A new, unsaved project from a template; null browses for any project file. */
  newFromTemplate: async (path: string | null) => {
    const result = await window.vedraopus.template.open(path);
    if (result.status !== 'cancelled') setState({ templatesOpen: false });
    settle(result);
  },
  /** The demo course that ships with the app (B4), as a new, unsaved copy. */
  openDemo: async () => settle(await window.vedraopus.template.openDemo()),
  /** File → Import Slides… (P11.2): choose a project, then its slides in the dialog. */
  openSlideSource: async () => {
    if (!state.open) return;
    const result = await window.vedraopus.project.openSlideSource();
    if (result.status === 'opened') {
      setState({ slideSource: { fileName: result.fileName, project: result.project } });
    } else if (result.status === 'failed') {
      setState({ error: result.message });
    }
  },
  closeSlideSource: () => setState({ slideSource: null }),
  /** File → Export Handout… (P11.3): the dialog, and the handout drawn for printing while it is open. */
  setHandoutOpen: (handoutOpen: boolean) =>
    setState({ handoutOpen: handoutOpen && state.open !== null }),
  setVideoOpen: (videoOpen: boolean) => setState({ videoOpen: videoOpen && state.open !== null }),
  /**
   * Copy the chosen slides in after the current one, with what they need, as
   * one step: their media first (main copies the files), then the command.
   */
  importSlides: async (slideIds: readonly string[]): Promise<SlideImportSummary | null> => {
    const open = state.open;
    const source = state.slideSource;
    if (!open || !source || slideIds.length === 0) return null;
    const prepared = prepareSlideImport(open.project, source.project, slideIds);
    await window.vedraopus.project.copySlideMedia(Object.keys(prepared.assets));
    const current = currentSlide(open.project, state.selectedSlideId);
    const inScene = current && open.project.scenes.some((scene) => scene.id === current.scene.id);
    const sceneId = inScene ? current.scene.id : open.project.scenes[0]!.id;
    open.history.execute('slides.import', {
      sceneId,
      index: inScene ? current.index + 1 : open.project.scenes[0]!.slides.length,
      slides: prepared.slides,
      banks: prepared.banks,
      masters: prepared.masters,
      variables: prepared.variables,
      assets: prepared.assets,
    });
    if (prepared.slides[0]) setState({ selectedSlideId: prepared.slides[0].id, selection: [] });
    return {
      slides: prepared.slides.length,
      masters: prepared.masters.length,
      variables: prepared.variables.length,
      banks: prepared.banks.length,
      media: Object.keys(prepared.assets).length,
      dropped: prepared.dropped,
    };
  },
  /** Save a copy of the open project as a template; the name it was saved as, or null. */
  saveAsTemplate: async (name: string): Promise<string | null> => {
    if (!state.open) return null;
    const result = await window.vedraopus.template.saveCurrent(current(), name);
    return result.status === 'saved' ? result.name : null;
  },
  openPath: async (path: string) => settle(await window.vedraopus.project.openPath(path)),
  recover: async (workspaceId: string) =>
    settle(await window.vedraopus.project.recover(workspaceId)),

  async save(as = false): Promise<void> {
    if (!state.open) return;
    const { project } = window.vedraopus;
    try {
      const result = await (as ? project.saveAs(current()) : project.save(current()));
      if (result.status === 'saved') setSession(result.session);
    } catch (error) {
      // A full disk or a folder that is gone (P11.5 part B): the file on disk is as it was,
      // because a save is written beside it and renamed over it only when complete.
      const reason =
        error instanceof Error
          ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
          : String(error);
      setState({
        error: `The project could not be saved: ${reason}. Any file it was saved to before is unchanged.`,
      });
    }
  },

  /**
   * Ask for documents or pictures and add them to the player's Resources tab
   * (P8.2), each titled by its file name: one undo step.
   */
  async addResourceFiles(): Promise<void> {
    const open = state.open;
    if (!open) return;
    const { imported, rejected } = await window.vedraopus.project.importFiles();
    if (imported.length > 0) {
      editor.beginGesture('Add resource files');
      for (const asset of imported) {
        open.history.execute('asset.add', { hash: asset.hash, meta: asset.meta });
      }
      const { tabs } = open.history.project.player;
      const items = imported.map((asset) => ({
        id: createId('res'),
        title: (asset.meta.fileName.replace(/\.[^.]+$/, '') || asset.meta.fileName).slice(0, 200),
        target: { kind: 'file' as const, asset: asset.hash },
      }));
      open.history.execute('project.setPlayer', {
        player: {
          tabs: {
            ...tabs,
            resources: { ...tabs.resources, items: [...tabs.resources.items, ...items] },
          },
        },
      });
      editor.commitGesture();
    }
    setState({ error: rejected.length > 0 ? rejected.join(' ') : null });
  },

  /** Ask for files and add them to the project's media. Returns what was added. */
  async importAssets(): Promise<ImportedAsset[]> {
    const open = state.open;
    if (!open) return [];
    const { imported, rejected } = await window.vedraopus.project.importAssets();
    if (imported.length > 0) {
      // Through `editor`, not the history, so main hears of the change (and the
      // project shows unsaved changes) when the gesture ends.
      editor.beginGesture('Import media');
      for (const asset of imported) {
        open.history.execute('asset.add', { hash: asset.hash, meta: asset.meta });
        // A video's poster frame, made by the media pipeline, comes in beside it.
        if (asset.poster)
          open.history.execute('asset.add', { hash: asset.poster.hash, meta: asset.poster.meta });
      }
      editor.commitGesture();
      // Show the author what they just brought in.
      ui.showLeftTab('media');
    }
    setState({ error: rejected.length > 0 ? rejected.join(' ') : null });
    return imported;
  },

  setView: (view: EditorView) => {
    if (view === state.view) return;
    // The selection belongs to the layer being shown, so it does not carry across views.
    const changesLayer = view === 'master' || state.view === 'master';
    setState({
      view,
      editingTextId: null,
      ...(changesLayer ? { selection: [] } : {}),
    });
  },

  setPublishOpen: (publishOpen: boolean) => setState({ publishOpen }),
  setTranslationOpen: (translationOpen: boolean) => setState({ translationOpen }),
  setVariablesOpen: (variablesOpen: boolean) => setState({ variablesOpen }),
  setRecordingOpen: (recordingOpen: boolean) => setState({ recordingOpen }),
  setLibraryOpen: (libraryOpen: boolean) => setState({ libraryOpen }),
  setScreenRecordingOpen: (screenRecordingOpen: boolean) => setState({ screenRecordingOpen }),
  openSpeech: (objectId: string | null) => setState({ speechDialog: { objectId } }),
  closeSpeech: () => setState({ speechDialog: null }),

  setPlayhead: (playhead: number) => setState({ playhead: Math.max(0, playhead) }),
  chooseMotionPath: (motionPath: string | null) => setState({ motionPath }),
  /** Edit a group's member, or (null) the group itself (B8). */
  chooseGroupPart: (groupPart: string | null) => setState({ groupPart, motionPath: null }),
  /** Wait for the author to draw a freeform path for this object on the stage (null: stop). */
  drawPathFor: (drawingPathFor: string | null) => setState({ drawingPathFor }),
  setTimelinePreview: (timelinePreview: boolean) => setState({ timelinePreview }),

  /** Play the current slide, its scene or the whole project in the preview window. */
  async preview(kind: 'slide' | 'scene' | 'project'): Promise<void> {
    const open = state.open;
    if (!open) return;
    const current = currentSlide(open.project, state.selectedSlideId);
    const scope =
      kind === 'project' || !current
        ? ({ kind: 'project' } as const)
        : kind === 'scene'
          ? ({ kind: 'scene', sceneId: current.scene.id } as const)
          : ({ kind: 'slide', slideId: current.slide.id } as const);
    try {
      await window.vedraopus.preview.open({
        workspaceId: open.session.workspaceId,
        projectJson: serializeProject(open.history.project),
        scope,
      });
    } catch (error) {
      setState({
        error: `Preview could not start: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  },

  /** Edit a master or one of its layouts; with no id, the one last edited or the first. */
  openMaster: (targetId?: string) => {
    const open = state.open;
    if (!open) return;
    const wanted = targetId ?? state.masterTargetId;
    const first = open.project.masters[0]?.id ?? null;
    const valid = wanted && findMasterTarget(open.project, wanted) ? wanted : first;
    setState({ view: 'master', masterTargetId: valid, selection: [], editingTextId: null });
  },

  selectSlide: (slideId: string) => {
    if (slideId !== state.selectedSlideId) {
      setState({
        selectedSlideId: slideId,
        stateEdit: null,
        editingLayerId: null,
        selection: [],
        editingTextId: null,
        playhead: 0,
        timelinePreview: false,
      });
    }
  },

  /** Open a slide for editing, from wherever the author is. */
  editSlide: (slideId: string) => {
    editor.selectSlide(slideId);
    setState({ view: 'slide' });
  },

  /** Replace the selection with these top-level objects of the current slide. */
  select(objectIds: readonly string[]): void {
    const same =
      objectIds.length === state.selection.length &&
      objectIds.every((id, index) => id === state.selection[index]);
    if (!same) {
      const editingTextId =
        state.editingTextId && objectIds.includes(state.editingTextId) ? state.editingTextId : null;
      // Edit-states mode belongs to one selected object and ends when the selection moves on.
      const stateEdit =
        state.stateEdit && objectIds.length === 1 && objectIds[0] === state.stateEdit.objectId
          ? state.stateEdit
          : null;
      setState({ selection: [...objectIds], editingTextId, stateEdit });
    }
  },

  /** Edit one of the current slide's layers on the stage (null for the base layer). */
  editLayer(layerId: string | null): void {
    if (layerId === state.editingLayerId) return;
    setState({ editingLayerId: layerId, selection: [], stateEdit: null, editingTextId: null });
  },

  /** Show or hide a layer beneath the one being edited. */
  toggleLayerInEditor(layerId: string): void {
    const hidden = state.layersHiddenInEditor;
    setState({
      layersHiddenInEditor: hidden.includes(layerId)
        ? hidden.filter((id) => id !== layerId)
        : [...hidden, layerId],
    });
  },

  /** Show and edit one state of an object on the stage; `normal` (or null) leaves the mode. */
  editState(objectId: string, stateId: string | null): void {
    setState({
      stateEdit: stateId && stateId !== 'normal' ? { objectId, stateId } : null,
      selection: [objectId],
      editingTextId: null,
    });
  },

  /** Editing text brings the text tools forward: they are on Home (B17). */
  startEditingText(objectId: string, cell: { row: number; column: number } | null = null): void {
    setState({
      editingTextId: objectId,
      editingCell: cell,
      selection: [objectId],
      ribbonTab: 'home',
    });
  },

  setRibbonTab(tab: RibbonTab): void {
    setState({ ribbonTab: tab });
  },

  /** Show a tab of the lower right panel: its layers or its properties (B17). */
  showSlidePanel(slidePanelTab: SlidePanelTab): void {
    setState({ slidePanelTab });
  },

  /** Show a tab of the upper right panel (B17). */
  showRightTab(rightTab: RightTab): void {
    setState({ rightTab });
  },

  /** Insert → Trigger (B17): the Triggers tab, with the new-trigger wizard open. */
  askNewTrigger(): void {
    setState({ rightTab: 'triggers', newTriggerAsked: state.newTriggerAsked + 1 });
  },

  stopEditingText(): void {
    forgetPendingTextFormat();
    if (state.editingTextId !== null) setState({ editingTextId: null });
  },

  setZoom(zoom: Zoom): void {
    setState({ zoom: zoom === 'fit' ? zoom : Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom)) });
  },

  /**
   * Group the commands that follow into one undo step: a drag, or one action
   * that changes several objects. Always pair with `commitGesture` or
   * `cancelGesture`.
   */
  beginGesture(label: string): void {
    const history = state.open?.history;
    if (!history) return;
    // A gesture inside another (a panel's change while a field gathers its
    // keystrokes) joins the outer one instead of failing.
    if (history.inGesture) {
      nestedGestures += 1;
      return;
    }
    history.beginGesture(label);
  },

  commitGesture(): void {
    if (nestedGestures > 0) {
      nestedGestures -= 1;
      return;
    }
    const history = state.open?.history;
    if (!history?.inGesture) return;
    history.commitGesture();
    sendAfterGesture?.();
  },

  /** Abandon a gesture, putting the document back as it was when it began. */
  cancelGesture(): void {
    nestedGestures = 0;
    const history = state.open?.history;
    if (history?.inGesture) history.cancelGesture();
  },

  showError: (message: string) => setState({ error: message }),

  /** Add a blank slide after the current one and make it current. */
  addSlide(): void {
    const open = state.open;
    if (!open) return;
    const current = currentSlide(open.project, state.selectedSlideId);
    // With no slide to follow (every slide deleted), start the first scene off.
    const sceneId = current?.scene.id ?? open.project.scenes[0]?.id;
    if (!sceneId) return;
    const slide = createSlide();
    open.history.execute('slide.add', { sceneId, slide, index: current ? current.index + 1 : 0 });
    setState({ selectedSlideId: slide.id, selection: [] });
  },

  /** Add a question slide after the current one, and show its form. */
  addQuestionSlide(kind: Question['kind']): void {
    const open = state.open;
    if (!open) return;
    const current = currentSlide(open.project, state.selectedSlideId);
    const sceneId = current?.scene.id ?? open.project.scenes[0]?.id;
    if (!sceneId) return;
    // Its feedback layers come from the project's own feedback master (P7.5).
    const slide = createQuestionSlide(
      kind,
      open.project.stage,
      undefined,
      feedbackMasterOf(open.project),
    );
    open.history.execute('slide.add', { sceneId, slide, index: current ? current.index + 1 : 0 });
    setState({ selectedSlideId: slide.id, selection: [], questionView: 'form' });
  },

  /**
   * Convert the current slide into a freeform question (docs/briefs/P7.4-freeform-questions.md):
   * the question, and a Submit button with its trigger, as one undo step; then Form View.
   */
  convertSlide(kind: FreeformKind): void {
    const open = state.open;
    if (!open) return;
    const current = currentSlide(open.project, state.selectedSlideId);
    // Only a real slide that is not a question yet (not a master or a layer being edited).
    if (!current || current.isMaster || current.alsoBeneath || current.slide.question) return;
    const slide = current.slide;
    const { question, objects, triggers, layers } = convertToQuestion(
      kind,
      open.project.stage,
      feedbackMasterOf(open.project),
    );
    editor.beginGesture('Convert to question');
    try {
      for (const object of objects) {
        open.history.execute('object.add', { layerId: slide.baseLayer.id, object });
      }
      for (const layer of layers) open.history.execute('layer.add', { slideId: slide.id, layer });
      for (const trigger of triggers) {
        open.history.execute('trigger.add', { slideId: slide.id, trigger });
      }
      open.history.execute('slide.setQuestion', { slideId: slide.id, question });
    } finally {
      editor.commitGesture();
    }
    setState({ selection: [], questionView: 'form' });
  },

  /** A new question bank with one question in it, which becomes the current slide (P7.6). */
  addBank(): void {
    const open = state.open;
    if (!open) return;
    const bank = createBank(
      `Question Bank ${open.project.banks.length + 1}`,
      open.project.stage,
      feedbackMasterOf(open.project),
    );
    open.history.execute('bank.add', { bank });
    setState({ selectedSlideId: bank.slides[0]!.id, selection: [], questionView: 'form' });
  },

  /**
   * A draw slide after the current one (docs/briefs/P7.6-banks-and-draws.md),
   * in a scene: the current slide's, or the last scene when a bank slide is
   * current. With no bank yet, one is made too, in the same undo step.
   */
  addDrawSlide(): void {
    const open = state.open;
    if (!open) return;
    const current = currentSlide(open.project, state.selectedSlideId);
    const inScene = current && open.project.scenes.some((scene) => scene.id === current.scene.id);
    const scene = inScene ? current.scene : open.project.scenes.at(-1);
    if (!scene) return;
    const index = inScene ? current.index + 1 : scene.slides.length;
    const existing = open.history.project.banks[0];
    const bank =
      existing ?? createBank('Question Bank 1', open.project.stage, feedbackMasterOf(open.project));
    const slide = createDrawSlide(bank.id);
    editor.beginGesture('Insert draw');
    try {
      if (!existing) open.history.execute('bank.add', { bank });
      open.history.execute('slide.add', { sceneId: scene.id, slide, index });
    } finally {
      editor.commitGesture();
    }
    setState({ selectedSlideId: slide.id, selection: [], questionView: 'form' });
  },

  /** A result slide after the current one, in its scene (or the last scene), P7.7. */
  addResultSlide(): void {
    const open = state.open;
    if (!open) return;
    const current = currentSlide(open.project, state.selectedSlideId);
    const inScene = current && open.project.scenes.some((scene) => scene.id === current.scene.id);
    const scene = inScene ? current.scene : open.project.scenes.at(-1);
    if (!scene) return;
    const slide = createResultSlide(open.project.stage);
    open.history.execute('slide.add', {
      sceneId: scene.id,
      slide,
      index: inScene ? current.index + 1 : scene.slides.length,
    });
    setState({ selectedSlideId: slide.id, selection: [], questionView: 'form' });
  },

  setQuestionView: (questionView: 'form' | 'slide') => setState({ questionView }),

  dismissError: () => setState({ error: null }),
};

export interface CurrentSlide {
  slide: Slide;
  /**
   * In Master View: layers drawn beneath the edited one (a layout sits on its
   * master). Absent for real slides, which draw what their layout gives them.
   */
  underlay?: Layer[];
  /** True when `slide` stands in for a master or layout being edited. */
  isMaster?: boolean;
  /**
   * When an overlay layer is being edited: `slide.baseLayer` is that layer, and
   * these are drawn beneath it (after what the slide inherits), dimmed and not
   * selectable. `layerId` is the layer being edited.
   */
  alsoBeneath?: Layer[];
  layerId?: string;
  scene: Scene;
  /** Position within its scene. */
  index: number;
  /** Position within the whole project, counting from 1. */
  number: number;
  /** Slides in the whole project. */
  total: number;
}

export function findMasterTarget(
  project: Project,
  id: string,
): { name: string; layer: Layer; underlay: Layer[] } | undefined {
  for (const master of project.masters) {
    if (master.id === id) return { name: master.name, layer: master.layer, underlay: [] };
    const layout = master.layouts.find((each) => each.id === id);
    if (layout) {
      return {
        name: `${master.name} › ${layout.name}`,
        layer: layout.layer,
        underlay: [master.layer],
      };
    }
  }
  return undefined;
}

/**
 * What the stage is editing: the current slide, or in Master View a stand-in
 * "slide" whose base layer is the master's or layout's own layer. Commands find
 * objects by id in any layer, so the stage edits it exactly like a slide.
 */
/** The state being edited, if edit-states mode is on and its object is still the selection. */
export function activeStateEdit(): { objectId: string; stateId: string } | null {
  const { stateEdit, selection } = state;
  return stateEdit && selection.length === 1 && selection[0] === stateEdit.objectId
    ? stateEdit
    : null;
}

const stateViews = new WeakMap<Slide, { key: string; slide: Slide }>();

/** `slide` with one object shown as it looks in the state being edited. */
function inEditedState(slide: Slide, objectId: string, stateId: string): Slide {
  const key = `${objectId}/${stateId}`;
  const known = stateViews.get(slide);
  if (known?.key === key) return known.slide;
  const objects = slide.baseLayer.objects.map((object) =>
    object.id === objectId ? resolveObjectState(object, stateId) : object,
  );
  const shown = { ...slide, baseLayer: { ...slide.baseLayer, objects } };
  stateViews.set(slide, { key, slide: shown });
  return shown;
}

/**
 * What the stage and panels work on. In edit-states mode the object being
 * edited appears as it looks in that state, so every tool reads the state's
 * values; their changes are routed to the state by the history (see `adopt`).
 */
export function editedSlide(
  project: Project,
  view: EditorView,
  selectedSlideId: string | null,
  masterTargetId: string | null,
): CurrentSlide | undefined {
  const current = editedSlideAsStored(project, view, selectedSlideId, masterTargetId);
  const editing = activeStateEdit();
  if (!current || !editing || current.isMaster) return current;
  return { ...current, slide: inEditedState(current.slide, editing.objectId, editing.stateId) };
}

const layerViews = new WeakMap<Slide, { key: string; view: CurrentSlide }>();

/**
 * The current slide as the stage edits it when an overlay layer is chosen: a
 * stand-in whose `baseLayer` is that layer, with the base layer and the
 * overlays below it (those not hidden in the editor) drawn beneath. Commands
 * find objects and layers by id, so editing the stand-in edits the real layer.
 */
function onLayer(current: CurrentSlide): CurrentSlide {
  const { editingLayerId, layersHiddenInEditor } = state;
  const index = current.slide.layers.findIndex((layer) => layer.id === editingLayerId);
  const layer = current.slide.layers[index];
  if (!layer) return current;
  const key = `${layer.id}/${layersHiddenInEditor.join(',')}`;
  const known = layerViews.get(current.slide);
  if (known?.key === key)
    return { ...current, ...known.view, number: current.number, total: current.total };
  const beneath = [current.slide.baseLayer, ...current.slide.layers.slice(0, index)].filter(
    (each) => !layersHiddenInEditor.includes(each.id),
  );
  const view: CurrentSlide = {
    ...current,
    slide: { ...current.slide, baseLayer: layer },
    alsoBeneath: beneath,
    layerId: layer.id,
  };
  layerViews.set(current.slide, { key, view });
  return view;
}

function editedSlideAsStored(
  project: Project,
  view: EditorView,
  selectedSlideId: string | null,
  masterTargetId: string | null,
): CurrentSlide | undefined {
  if (view !== 'master') {
    const current = currentSlide(project, selectedSlideId);
    return current && state.editingLayerId ? onLayer(current) : current;
  }
  const target = masterTargetId ? findMasterTarget(project, masterTargetId) : undefined;
  if (!target) return undefined;
  const stand = { ...createSlide(target.name), id: masterTargetId!, baseLayer: target.layer };
  const scene = project.scenes[0]!;
  return {
    slide: stand,
    scene,
    index: 0,
    number: 1,
    total: 1,
    underlay: target.underlay,
    isMaster: true,
  };
}

/**
 * The slide being edited: the selected one if it still exists, otherwise the
 * project's first. Undefined only for a project with no slides at all.
 */
export function currentSlide(
  project: Project,
  selectedSlideId: string | null,
): CurrentSlide | undefined {
  const slides = allSlides(project);
  const found = selectedSlideId ? findSlide(project, selectedSlideId) : undefined;
  const slide = found?.slide ?? slides[0]?.slide;
  if (!slide) return undefined;
  const location = found ?? findSlide(project, slide.id)!;
  return {
    slide,
    scene: location.scene,
    index: location.index,
    number: slides.findIndex((each) => each.slide.id === slide.id) + 1,
    total: slides.length,
  };
}

/** The state right now, for code that acts rather than renders. */
export const getEditorState = (): EditorState => state;

export function useEditor(): EditorState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

/** URL the renderer can load an asset of the open project from. */
export function assetUrl(session: SessionInfo, hash: string): string {
  return `vedraopus-asset://${session.workspaceId}/${hash}`;
}

/**
 * An asset's URL for drawing in the editor (P11.5 part B): a picture far
 * larger than the stage could need comes as a copy scaled to twice the
 * stage, which main makes once. Other media, and the published course, use
 * the file itself.
 */
export function editorAssetUrl(
  session: SessionInfo,
  project: Pick<Project, 'assets' | 'stage'>,
  hash: string,
): string {
  const url = assetUrl(session, hash);
  const meta = project.assets[hash];
  const fit = 2 * Math.max(project.stage.width, project.stage.height);
  if (meta?.kind !== 'image' || !meta.width || !meta.height) return url;
  return Math.max(meta.width, meta.height) > fit ? `${url}?fit=${fit}` : url;
}

/** Each slide's number in the project, counting from 1 across scenes. */
export function slideNumbers(project: Project): Map<string, number> {
  return new Map(allSlides(project).map(({ slide }, index) => [slide.id, index + 1]));
}

/** The selected objects that still exist on the slide, in z-order (back to front). */
/**
 * The part of the selected object being edited (B8): the group's member chosen as `groupPart`,
 * at any depth, or the object itself.
 */
export function partOf(object: SceneObject | undefined, groupPart: string | null) {
  if (!object || object.type !== 'group' || !groupPart) return object;
  let found: SceneObject | undefined;
  forEachObject(object.children, (each) => {
    if (each.id === groupPart) found = each;
  });
  return found ?? object;
}

export function selectedObjects(
  slide: Slide | undefined,
  selection: readonly string[],
): SceneObject[] {
  if (!slide || selection.length === 0) return [];
  const chosen = new Set(selection);
  return slide.baseLayer.objects.filter((object) => chosen.has(object.id));
}

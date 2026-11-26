import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  allLayers,
  CommandError,
  cloneLayer,
  createButtonObject,
  createGraphicObject,
  createTableObject,
  createPanoramaObject,
  createPanoramaSpot,
  plainRichText,
  translationUnits,
  withCell,
  withColumnAdded,
  withColumnRemoved,
  withRowAdded,
  withRowRemoved,
  createAudioObject,
  createEffect,
  createTransition,
  createHotspotObject,
  createMarkerObject,
  createZoomRegion,
  createQuestionSlide,
  allSlides,
  convertToQuestion,
  createBank,
  createDrawSlide,
  createResultSlide,
  feedbackMasterOf,
  isChoiceQuestion,
  isSurveyQuestion,
  questionObjects,
  transitionKinds,
  createMotionPath,
  createEmptyProject,
  createVideoObject,
  defaultPublishSettings,
  createHistory,
  createId,
  createTextEntryObject,
  createSliderObject,
  createWebObject,
  createDialObject,
  notesFromText,
  opensAsLightbox,
  presetOf,
  withPreset,
  createLayer,
  createScene,
  createSlide,
  createShapeObject,
  createSlideLayout,
  createSlideMaster,
  createTextObject,
  isBuiltInVariableName,
  placeholdersMissingFrom,
  replaceVariableReferences,
  resolveObjectState,
  unreachableSlides,
  slideLinks,
  variableUsage,
  findObject,
  findReferenceIssues,
  findSlide,
  normalState,
  parseProject,
  prepareSlideImport,
  triggerReferences,
} from './index';
import type {
  Change,
  GroupObject,
  History,
  Project,
  SceneObject,
  ShapeObject,
  Trigger,
  TriggerAction,
} from './index';

// ------------------------------------------------------------------ helpers

function shape(name = 'Rectangle'): ShapeObject {
  return {
    id: createId('obj'),
    name,
    type: 'shape',
    frame: { x: 0, y: 0, width: 100, height: 50, rotation: 0 },
    timing: { start: 0, duration: 'untilEnd' },
    locked: false,
    hiddenInEditor: false,
    initialState: 'normal',
    states: [normalState()],
    a11y: { altText: '', visibleToAssistiveTech: true },
    buttonSet: null,
    animations: { entrance: null, exit: null, motionPaths: [] },
    drag: null,
    props: {
      geometry: { kind: 'rect' },
      appearance: {
        fill: { kind: 'solid', color: '#ff0000' },
        stroke: null,
        shadow: null,
        opacity: 1,
      },
      text: null,
    },
  };
}

function group(children: SceneObject[]): SceneObject {
  const { props: _props, ...common } = shape('Group');
  return { ...common, type: 'group', children, scroll: null };
}

function trigger(objectId: string, action: Trigger['action']): Trigger {
  return {
    id: createId('trigger'),
    owner: { kind: 'object', id: objectId },
    event: { type: 'click', object: objectId },
    action,
    conditions: null,
    otherwise: null,
    enabled: true,
  };
}

/** Deep, unfrozen copy, for comparing against later states. */
const snapshot = (project: Project): Project => JSON.parse(JSON.stringify(project)) as Project;

/** A history over a fresh one-slide project, with full validation after every command. */
function setup() {
  const history = createHistory(createEmptyProject(), { validate: true });
  const scene = history.project.scenes[0]!;
  const slide = scene.slides[0]!;
  return { history, sceneId: scene.id, slideId: slide.id, layerId: slide.baseLayer.id };
}

/** A two-slide project with two objects and triggers that tie them together. */
function setupWithTriggers() {
  const project = createEmptyProject();
  const scene = project.scenes[0]!;
  const first = scene.slides[0]!;
  const second = createSlide('Second');
  scene.slides.push(second);

  const button = shape('Button');
  const target = shape('Target');
  first.baseLayer.objects.push(button, target);
  first.triggers.push(
    trigger(button.id, { type: 'changeState', object: target.id, state: 'normal' }),
    trigger(button.id, { type: 'jumpToSlide', target: { kind: 'slide', slide: second.id } }),
  );
  const backButton = shape('Back');
  second.baseLayer.objects.push(backButton);
  second.triggers.push(
    trigger(backButton.id, { type: 'jumpToSlide', target: { kind: 'slide', slide: first.id } }),
  );

  const history = createHistory(parseProject(project), { validate: true });
  return { history, first, second, button, target, backButton };
}

const objectsOf = (history: History, slideId: string) =>
  findSlide(history.project, slideId)!.slide.baseLayer.objects;

// ------------------------------------------------------------------- basics

describe('execute', () => {
  it('applies a command and exposes a new project', () => {
    const { history } = setup();
    const before = history.project;
    history.execute('project.rename', { title: 'Fire Safety' });
    expect(history.project.title).toBe('Fire Safety');
    expect(history.project).not.toBe(before);
  });

  it('never mutates a project it has handed out', () => {
    const { history, layerId } = setup();
    const before = history.project;
    const copy = snapshot(before);
    history.execute('object.add', { layerId, object: shape() });
    history.execute('project.setStageSize', { width: 800, height: 600 });
    expect(before).toEqual(copy);
    expect(Object.isFrozen(before)).toBe(true);
    expect(() => {
      (history.project as { title: string }).title = 'mutated';
    }).toThrow();
  });

  it('adds no undo step and notifies nobody when nothing changes', () => {
    const { history } = setup();
    const changes: Change[] = [];
    history.subscribe((change) => changes.push(change));
    history.execute('project.rename', { title: history.project.title });
    expect(history.canUndo).toBe(false);
    expect(changes).toEqual([]);
  });

  it('notifies subscribers with the patches, and stops after unsubscribe', () => {
    const { history } = setup();
    const changes: Change[] = [];
    const unsubscribe = history.subscribe((change) => changes.push(change));
    history.execute('project.rename', { title: 'A' });
    unsubscribe();
    history.execute('project.rename', { title: 'B' });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      source: 'execute',
      patches: [{ op: 'replace', path: ['title'], value: 'A' }],
    });
    expect(changes[0]!.project.title).toBe('A');
  });
});

describe('undo and redo', () => {
  it('walks back and forward through steps', () => {
    const { history } = setup();
    history.execute('project.rename', { title: 'One' });
    history.execute('project.rename', { title: 'Two' });
    expect(history.undoLabel).toBe('project.rename');

    history.undo();
    expect(history.project.title).toBe('One');
    history.undo();
    expect(history.project.title).toBe('Untitled Project');
    expect(history.canUndo).toBe(false);

    history.redo();
    history.redo();
    expect(history.project.title).toBe('Two');
    expect(history.canRedo).toBe(false);
  });

  it('does nothing when there is nothing to undo or redo', () => {
    const { history } = setup();
    const before = history.project;
    history.undo();
    history.redo();
    expect(history.project).toBe(before);
  });

  it('clears the redo stack when a new command runs', () => {
    const { history } = setup();
    history.execute('project.rename', { title: 'One' });
    history.undo();
    expect(history.canRedo).toBe(true);
    history.execute('project.rename', { title: 'Other' });
    expect(history.canRedo).toBe(false);
    history.redo();
    expect(history.project.title).toBe('Other');
  });

  it('keeps only the most recent steps up to the limit', () => {
    const history = createHistory(createEmptyProject(), { limit: 3 });
    for (const title of ['1', '2', '3', '4', '5']) history.execute('project.rename', { title });
    expect(history.undoDepth).toBe(3);
    for (let i = 0; i < 10; i++) history.undo();
    expect(history.project.title).toBe('2');
  });
});

describe('gestures', () => {
  it('collapses many commands into one undo step', () => {
    const { history, layerId } = setup();
    const object = shape();
    history.execute('object.add', { layerId, object });
    const beforeDrag = history.project;

    history.beginGesture('Move');
    for (let x = 1; x <= 20; x++) {
      history.execute('object.update', {
        objectId: object.id,
        changes: { frame: { x, y: x * 2 } },
      });
      // The stage sees every intermediate position.
      expect(findObject(history.project, object.id)!.object.frame.x).toBe(x);
    }
    history.commitGesture();

    expect(history.undoDepth).toBe(2);
    expect(history.undoLabel).toBe('Move');
    history.undo();
    expect(history.project).toEqual(beforeDrag);
    history.redo();
    expect(findObject(history.project, object.id)!.object.frame).toMatchObject({ x: 20, y: 40 });
  });

  it('restores the pre-gesture project exactly on cancel, with no undo step', () => {
    const { history, layerId } = setup();
    const object = shape();
    history.execute('object.add', { layerId, object });
    const before = snapshot(history.project);
    const sources: string[] = [];
    history.subscribe((change) => sources.push(change.source));

    history.beginGesture('Move');
    history.execute('object.update', { objectId: object.id, changes: { frame: { x: 50 } } });
    history.execute('object.rename', { objectId: object.id, name: 'Dragged' });
    history.cancelGesture();

    expect(history.project).toEqual(before);
    expect(history.undoDepth).toBe(1);
    expect(history.inGesture).toBe(false);
    expect(sources).toEqual(['execute', 'execute', 'cancel']);
  });

  it('treats undo during a gesture as cancelling it', () => {
    const { history } = setup();
    history.execute('project.rename', { title: 'Kept' });
    history.beginGesture('Retitle');
    history.execute('project.rename', { title: 'Dragging' });
    history.undo();
    expect(history.project.title).toBe('Kept');
    expect(history.inGesture).toBe(false);
    expect(history.undoDepth).toBe(1);
  });

  it('adds no undo step for a gesture that changed nothing', () => {
    const { history } = setup();
    history.beginGesture('Click without moving');
    history.commitGesture();
    expect(history.canUndo).toBe(false);
  });

  it('rejects nested gestures and commit without begin', () => {
    const { history } = setup();
    expect(() => history.commitGesture()).toThrow(/No gesture/);
    history.beginGesture('A');
    expect(() => history.beginGesture('B')).toThrow(/already in progress/);
  });
});

// ----------------------------------------------------------------- commands

describe('project commands', () => {
  it('sets the stage size and rejects impossible sizes', () => {
    const { history } = setup();
    history.execute('project.setStageSize', { width: 960, height: 540 });
    expect(history.project.stage).toEqual({ width: 960, height: 540 });
    expect(() => history.execute('project.setStageSize', { width: 0, height: 540 })).toThrow(
      CommandError,
    );
    expect(() => history.execute('project.setStageSize', { width: 12.5, height: 540 })).toThrow(
      CommandError,
    );
    expect(history.project.stage).toEqual({ width: 960, height: 540 });
  });

  it('keeps or scales object frames when resizing the stage', () => {
    const project = createEmptyProject();
    const [scene] = project.scenes;
    const [slide] = scene!.slides;
    const text = createTextObject('', { x: 100, y: 50, width: 200, height: 80, rotation: 0 });
    slide!.baseLayer.objects.push(text);
    const history = createHistory(project);
    history.execute('project.setStageSize', { width: 1920, height: 1080, mode: 'keep' });
    expect(history.project.stage).toEqual({ width: 1920, height: 1080 });
    expect(history.project.scenes[0]!.slides[0]!.baseLayer.objects[0]!.frame).toEqual({
      x: 100,
      y: 50,
      width: 200,
      height: 80,
      rotation: 0,
    });
    history.undo();
    history.execute('project.setStageSize', { width: 640, height: 360, mode: 'scale' });
    expect(history.project.stage).toEqual({ width: 640, height: 360 });
    expect(history.project.scenes[0]!.slides[0]!.baseLayer.objects[0]!.frame).toEqual({
      x: 50,
      y: 25,
      width: 100,
      height: 40,
      rotation: 0,
    });
    history.undo();
    expect(history.project.stage).toEqual({ width: 1280, height: 720 });
    expect(history.project.scenes[0]!.slides[0]!.baseLayer.objects[0]!.frame.x).toBe(100);
  });

  it('updates theme colours and fonts', () => {
    const { history } = setup();
    const before = history.project.theme.colors.accent1;
    history.execute('project.updateTheme', {
      colors: { accent1: '#112233' },
      fonts: { heading: 'Georgia' },
    });
    expect(history.project.theme.colors.accent1).toBe('#112233');
    expect(history.project.theme.fonts.heading).toBe('Georgia');
    expect(history.project.theme.fonts.body).toBe('Inter');
    history.undo();
    expect(history.project.theme.colors.accent1).toBe(before);
    expect(() =>
      history.execute('project.updateTheme', { colors: { accent1: 'nope' as never } }),
    ).toThrow(CommandError);
  });
});

describe('master and layout commands', () => {
  function withMaster() {
    const { history } = setup();
    const master = createSlideMaster('Corporate');
    history.execute('master.add', { master });
    const slide = history.project.scenes[0]!.slides[0]!;
    return { history, master, slide };
  }

  it('adds, renames and removes masters and layouts, each undoable', () => {
    const { history, master } = withMaster();
    // A project also has its feedback master (P7.5), which stays first.
    const own = () => history.project.masters.find((m) => m.id === master.id)!;
    expect(history.project.masters.map((m) => m.kind)).toEqual(['feedback', 'slide']);
    history.execute('master.rename', { masterId: master.id, name: 'Brand' });
    expect(own().name).toBe('Brand');
    const extra = createSlideLayout('Two Titles', ['title']);
    history.execute('layout.add', { masterId: master.id, layout: extra });
    expect(own().layouts).toHaveLength(4);
    history.execute('layout.rename', { layoutId: extra.id, name: 'Section' });
    history.execute('layout.remove', { layoutId: extra.id });
    expect(own().layouts).toHaveLength(3);
    history.undo();
    expect(own().layouts[3]!.name).toBe('Section');
    expect(() => history.execute('master.rename', { masterId: 'nope', name: 'x' })).toThrow(
      CommandError,
    );
    expect(() =>
      history.execute('layout.add', { masterId: master.id, layout: master.layouts[0]! }),
    ).toThrow(CommandError);
  });

  it('gives a slide a layout and the placeholders it lacks, once', () => {
    const { history, master, slide } = withMaster();
    const layout = master.layouts[0]!;
    history.execute('slide.setLayout', {
      slideId: slide.id,
      layoutId: layout.id,
      objects: placeholdersMissingFrom(layout, slide),
    });
    const after = history.project.scenes[0]!.slides[0]!;
    expect(after.layoutId).toBe(layout.id);
    expect(after.baseLayer.objects.map((o) => o.type === 'text' && o.props.placeholder)).toEqual([
      'title',
      'content',
    ]);
    // Re-applying adds nothing: the slide already has both.
    expect(placeholdersMissingFrom(layout, after)).toEqual([]);
    history.undo();
    expect(history.project.scenes[0]!.slides[0]!.layoutId).toBeNull();
    expect(() =>
      history.execute('slide.setLayout', { slideId: slide.id, layoutId: 'layout_missing' }),
    ).toThrow(CommandError);
  });

  it('blanks the slides of a removed layout or master', () => {
    const { history, master, slide } = withMaster();
    history.execute('slide.setLayout', { slideId: slide.id, layoutId: master.layouts[1]!.id });
    history.execute('layout.remove', { layoutId: master.layouts[1]!.id });
    expect(history.project.scenes[0]!.slides[0]!.layoutId).toBeNull();
    history.undo();
    expect(history.project.scenes[0]!.slides[0]!.layoutId).toBe(master.layouts[1]!.id);
    history.execute('master.remove', { masterId: master.id });
    expect(history.project.scenes[0]!.slides[0]!.layoutId).toBeNull();
  });

  it('edits objects in a master layer like any other', () => {
    const { history, master } = withMaster();
    const logo = createShapeObject({ kind: 'rect' });
    history.execute('object.add', { layerId: master.layer.id, object: logo });
    history.execute('object.update', { objectId: logo.id, changes: { frame: { x: 5 } } });
    const own = () => history.project.masters.find((m) => m.id === master.id)!;
    expect(own().layer.objects[0]!.frame.x).toBe(5);
    history.execute('object.remove', { objectIds: [logo.id] });
    expect(own().layer.objects).toHaveLength(0);
  });
});

describe('timeline commands', () => {
  function withCue() {
    const { history } = setup();
    const slide = history.project.scenes[0]!.slides[0]!;
    const layerId = slide.baseLayer.id;
    const cue = { id: createId('cue'), name: 'Beat', time: 2 };
    history.execute('cuePoint.add', { layerId, cuePoint: cue });
    return { history, layerId, cue, slideId: slide.id };
  }
  const base = (history: History) => history.project.scenes[0]!.slides[0]!.baseLayer;

  it('adds, moves, renames and removes cue points, each undoable', () => {
    const { history, cue, layerId } = withCue();
    expect(base(history).timeline.cuePoints).toEqual([cue]);
    history.execute('cuePoint.update', {
      cuePointId: cue.id,
      changes: { time: 3.5, name: 'Drop' },
    });
    expect(base(history).timeline.cuePoints[0]).toEqual({ id: cue.id, name: 'Drop', time: 3.5 });
    history.undo();
    expect(base(history).timeline.cuePoints[0]!.time).toBe(2);
    history.execute('cuePoint.remove', { cuePointId: cue.id });
    expect(base(history).timeline.cuePoints).toEqual([]);
    history.undo();
    expect(base(history).timeline.cuePoints).toHaveLength(1);
    const outside = { id: createId('cue'), name: 'Late', time: 999 };
    expect(() => history.execute('cuePoint.add', { layerId, cuePoint: outside })).toThrow(
      CommandError,
    );
    expect(() =>
      history.execute('cuePoint.update', { cuePointId: cue.id, changes: { time: -1 } }),
    ).toThrow(CommandError);
    expect(() => history.execute('cuePoint.remove', { cuePointId: 'cue_nope' })).toThrow(
      CommandError,
    );
  });

  it('changes the timeline length and pulls cue points back inside it', () => {
    const { history, layerId } = withCue();
    history.execute('layer.setDuration', { layerId, duration: 1.5 });
    expect(base(history).timeline).toMatchObject({ duration: 1.5 });
    expect(base(history).timeline.cuePoints[0]!.time).toBe(1.5);
    history.undo();
    expect(base(history).timeline.cuePoints[0]!.time).toBe(2);
    expect(() => history.execute('layer.setDuration', { layerId, duration: 0 })).toThrow(
      CommandError,
    );
    expect(() => history.execute('layer.setDuration', { layerId: 'nope', duration: 3 })).toThrow(
      CommandError,
    );
  });

  it('removes triggers that listened for a removed cue point', () => {
    const { history, cue, layerId, slideId } = withCue();
    const project = JSON.parse(JSON.stringify(history.project)) as Project;
    project.scenes[0]!.slides[0]!.triggers.push({
      id: createId('trigger'),
      owner: { kind: 'slide', id: slideId },
      event: { type: 'cuePoint', layer: layerId, cuePoint: cue.id },
      action: { type: 'jumpToSlide', target: { kind: 'next' } },
      conditions: null,
      otherwise: null,
      enabled: true,
    });
    const next = createHistory(project, { validate: true });
    next.execute('cuePoint.remove', { cuePointId: cue.id });
    expect(next.project.scenes[0]!.slides[0]!.triggers).toEqual([]);
    next.undo();
    expect(next.project.scenes[0]!.slides[0]!.triggers).toHaveLength(1);
  });
});

describe('state commands', () => {
  function withButton() {
    const { history } = setup();
    const slide = history.project.scenes[0]!.slides[0]!;
    const button = createButtonObject('Go');
    history.execute('object.add', { layerId: slide.baseLayer.id, object: button });
    history.execute('state.add', {
      objectId: button.id,
      state: { id: 'hover', name: 'Hover', overrides: {} },
    });
    const get = () => findObject(history.project, button.id)!.object;
    return { history, button, get, slideId: slide.id };
  }

  it('adds, renames, resets and removes states; normal stays', () => {
    const { history, button, get } = withButton();
    expect(get().states.map((s) => s.id)).toEqual(['normal', 'hover']);
    expect(() =>
      history.execute('state.add', {
        objectId: button.id,
        state: { id: 'hover', name: 'Again', overrides: {} },
      }),
    ).toThrow(CommandError);
    history.execute('state.update', {
      objectId: button.id,
      stateId: 'hover',
      changes: { name: 'Over', overrides: { frame: { x: 5 } } },
    });
    expect(get().states[1]).toEqual({ id: 'hover', name: 'Over', overrides: { frame: { x: 5 } } });
    history.execute('state.update', {
      objectId: button.id,
      stateId: 'hover',
      changes: { overrides: {} },
    });
    expect(get().states[1]!.overrides).toEqual({});
    expect(() =>
      history.execute('state.update', {
        objectId: button.id,
        stateId: 'normal',
        changes: { overrides: { frame: { x: 1 } } },
      }),
    ).toThrow(CommandError);
    expect(() =>
      history.execute('state.remove', { objectId: button.id, stateId: 'normal' }),
    ).toThrow(CommandError);
    history.execute('object.update', { objectId: button.id, changes: { initialState: 'hover' } });
    expect(get().initialState).toBe('hover');
    expect(() =>
      history.execute('object.update', { objectId: button.id, changes: { initialState: 'nope' } }),
    ).toThrow(CommandError);
    history.execute('state.remove', { objectId: button.id, stateId: 'hover' });
    expect(get().states.map((s) => s.id)).toEqual(['normal']);
    expect(get().initialState).toBe('normal');
    history.undo();
    expect(get().initialState).toBe('hover');
  });

  it('writes an update made in a state into that state, leaving normal alone', () => {
    const { history, button, get } = withButton();
    const normalFrame = { ...get().frame };
    const normalAppearance = (get() as typeof button).props.appearance;
    history.execute('object.update', {
      objectId: button.id,
      stateId: 'hover',
      changes: {
        frame: { x: 99 },
        locked: true,
        props: {
          appearance: { ...normalAppearance, opacity: 0.5 },
          cornerRadius: 20,
          text: { type: 'doc', content: [] },
        },
      },
    });
    const after = get() as typeof button;
    expect(after.frame).toEqual(normalFrame);
    expect(after.props.appearance).toEqual(normalAppearance);
    // Only what differs from normal is kept, so normal's other values still show through.
    expect(after.states[1]!.overrides).toEqual({
      frame: { x: 99 },
      appearance: { opacity: 0.5 },
      text: { type: 'doc', content: [] },
    });
    // Things a state cannot hold apply to the object itself.
    expect(after.locked).toBe(true);
    expect(after.props.cornerRadius).toBe(20);

    const shown = resolveObjectState(after, 'hover') as typeof button;
    expect(shown.frame.x).toBe(99);
    expect(shown.props.appearance.opacity).toBe(0.5);
    expect(shown.props.appearance.fill).toEqual(normalAppearance.fill);
    expect(resolveObjectState(after, 'hover')).toBe(shown);
    expect(resolveObjectState(after, 'normal')).toBe(after);
    expect(resolveObjectState(after, 'missing')).toBe(after);

    history.undo();
    expect(get().states[1]!.overrides).toEqual({});
    expect(() =>
      history.execute('object.update', { objectId: button.id, stateId: 'nope', changes: {} }),
    ).toThrow(CommandError);
  });

  it('removes triggers that used a removed state', () => {
    const { history, button, get, slideId } = withButton();
    const project = JSON.parse(JSON.stringify(history.project)) as Project;
    project.scenes[0]!.slides[0]!.triggers.push({
      id: createId('trigger'),
      owner: { kind: 'slide', id: slideId },
      event: { type: 'keyPress', key: 'a' },
      action: { type: 'changeState', object: button.id, state: 'hover' },
      conditions: null,
      otherwise: null,
      enabled: true,
    });
    const next = createHistory(project, { validate: true });
    next.execute('state.remove', { objectId: button.id, stateId: 'hover' });
    expect(next.project.scenes[0]!.slides[0]!.triggers).toEqual([]);
    expect(get().states).toHaveLength(2);
  });
});

describe('variable commands', () => {
  function withVariable() {
    const { history } = setup();
    const slide = history.project.scenes[0]!.slides[0]!;
    const box = createTextObject('Hello %name%, score %Score% and %Other%');
    history.execute('object.add', { layerId: slide.baseLayer.id, object: box });
    const variable = { id: createId('var'), name: 'Name', type: 'text' as const, default: 'Ada' };
    history.execute('variable.add', { variable });
    const text = () => {
      const object = findObject(history.project, box.id)!.object;
      return JSON.stringify(object.type === 'text' ? object.props.text : null);
    };
    return { history, variable, text, slideId: slide.id };
  }

  it('adds variables and refuses duplicate, built-in and badly typed ones', () => {
    const { history, variable } = withVariable();
    expect(history.project.variables.some((v) => v.id === variable.id)).toBe(true);
    const add = (name: string, extra: object = {}) =>
      history.execute('variable.add', {
        variable: { id: createId('var'), name, type: 'number', default: 0, ...extra } as never,
      });
    expect(() => add('NAME')).toThrow(/already/);
    expect(() => add('slidenumber')).toThrow(/built-in/);
    expect(() => add('Count', { default: 'x' })).toThrow(CommandError);
    expect(() => add('not valid')).toThrow(CommandError);
    add('Count');
    expect(isBuiltInVariableName('PercentComplete')).toBe(true);
  });

  it('renaming rewrites every reference in text, ignoring case, and undo puts them back', () => {
    const { history, variable, text } = withVariable();
    history.execute('variable.update', { variableId: variable.id, changes: { name: 'Learner' } });
    expect(text()).toContain('Hello %Learner%, score %Score% and %Other%');
    expect(variableUsage(history.project, variable.id)).toEqual({ text: 1, triggers: 0 });
    history.undo();
    expect(text()).toContain('Hello %name%,');
    expect(() =>
      history.execute('variable.update', {
        variableId: variable.id,
        changes: { name: 'SlideCount' },
      }),
    ).toThrow(/built-in/);
  });

  it('changes type and default together, and refuses a default of the wrong type', () => {
    const { history, variable } = withVariable();
    history.execute('variable.update', {
      variableId: variable.id,
      changes: { type: 'number', default: 5 },
    });
    expect(history.project.variables.find((v) => v.id === variable.id)).toMatchObject({
      type: 'number',
      default: 5,
    });
    expect(() =>
      history.execute('variable.update', { variableId: variable.id, changes: { default: 'five' } }),
    ).toThrow(CommandError);
  });

  it('removing a variable removes the triggers that used it and reports usage first', () => {
    const { history, variable, slideId } = withVariable();
    const project = JSON.parse(JSON.stringify(history.project)) as Project;
    project.scenes[0]!.slides[0]!.triggers.push({
      id: createId('trigger'),
      owner: { kind: 'slide', id: slideId },
      event: { type: 'variableChange', variable: variable.id },
      action: { type: 'jumpToSlide', target: { kind: 'next' } },
      conditions: null,
      otherwise: null,
      enabled: true,
    });
    const next = createHistory(project, { validate: true });
    expect(variableUsage(next.project, variable.id)).toEqual({ text: 1, triggers: 1 });
    next.execute('variable.remove', { variableId: variable.id });
    expect(next.project.variables.some((v) => v.id === variable.id)).toBe(false);
    expect(next.project.scenes[0]!.slides[0]!.triggers).toEqual([]);
    next.undo();
    expect(next.project.scenes[0]!.slides[0]!.triggers).toHaveLength(1);
    expect(replaceVariableReferences('%a% and %b%', (n) => (n === 'a' ? '1' : undefined))).toBe(
      '1 and %b%',
    );
  });
});

describe('trigger commands', () => {
  function withObjects() {
    const { history } = setup();
    const [first, second] = [history.project.scenes[0]!.slides[0]!, createSlide('Other')];
    history.execute('slide.add', { sceneId: history.project.scenes[0]!.id, slide: second });
    const button = createButtonObject('Go');
    const elsewhere = createButtonObject('Elsewhere');
    history.execute('object.add', { layerId: first.baseLayer.id, object: button });
    history.execute('object.add', { layerId: second.baseLayer.id, object: elsewhere });
    const make = (objectId: string) => ({
      id: createId('trigger'),
      owner: { kind: 'object' as const, id: objectId },
      event: { type: 'click' as const, object: objectId },
      action: {
        type: 'jumpToSlide' as const,
        target: { kind: 'slide' as const, slide: second.id },
      },
      conditions: null,
      otherwise: null,
      enabled: true,
    });
    const triggers = () => history.project.scenes[0]!.slides[0]!.triggers;
    return { history, first, second, button, elsewhere, make, triggers };
  }

  it('adds, updates, reorders and removes triggers, each undoable', () => {
    const { history, first, button, make, triggers } = withObjects();
    const [a, b] = [make(button.id), make(button.id)];
    history.execute('trigger.add', { slideId: first.id, trigger: a });
    history.execute('trigger.add', { slideId: first.id, trigger: b });
    expect(triggers().map((t) => t.id)).toEqual([a.id, b.id]);
    history.execute('trigger.move', { triggerId: b.id, index: 0 });
    expect(triggers().map((t) => t.id)).toEqual([b.id, a.id]);
    history.execute('trigger.update', { triggerId: a.id, changes: { enabled: false } });
    expect(triggers()[1]!.enabled).toBe(false);
    history.execute('trigger.remove', { triggerId: b.id });
    expect(triggers().map((t) => t.id)).toEqual([a.id]);
    history.undo();
    history.undo();
    expect(triggers()[1]!.enabled).toBe(true);
    expect(() => history.execute('trigger.remove', { triggerId: 'trigger_nope' })).toThrow(
      CommandError,
    );
  });

  it('refuses a trigger that refers to an object on another slide, and a malformed one', () => {
    const { history, first, elsewhere, button, make, triggers } = withObjects();
    expect(() =>
      history.execute('trigger.add', { slideId: first.id, trigger: make(elsewhere.id) }),
    ).toThrow(/cannot be saved/);
    expect(triggers()).toEqual([]);
    const ok = make(button.id);
    history.execute('trigger.add', { slideId: first.id, trigger: ok });
    expect(() =>
      history.execute('trigger.update', {
        triggerId: ok.id,
        changes: { action: { type: 'changeState', object: elsewhere.id, state: 'normal' } },
      }),
    ).toThrow(/cannot be saved/);
    expect(triggers()[0]!.action.type).toBe('jumpToSlide');
    expect(() =>
      history.execute('trigger.update', {
        triggerId: ok.id,
        changes: { event: { type: 'nope' } as never },
      }),
    ).toThrow(CommandError);
  });
});

describe('overlay layer commands', () => {
  function withLayer() {
    const { history } = setup();
    const slide = history.project.scenes[0]!.slides[0]!;
    const layer = createLayer('Popup');
    const close = createButtonObject('Close');
    layer.objects.push(close);
    history.execute('layer.add', { slideId: slide.id, layer });
    const opener = createButtonObject('Open');
    history.execute('object.add', { layerId: slide.baseLayer.id, object: opener });
    const base = { conditions: null, otherwise: null, enabled: true };
    const show = {
      ...base,
      id: createId('trigger'),
      owner: { kind: 'object' as const, id: opener.id },
      event: { type: 'click' as const, object: opener.id },
      action: { type: 'showLayer' as const, layer: layer.id },
    };
    const hide = {
      ...base,
      id: createId('trigger'),
      owner: { kind: 'object' as const, id: close.id },
      event: { type: 'click' as const, object: close.id },
      action: { type: 'hideLayer' as const, layer: layer.id },
    };
    history.execute('trigger.add', { slideId: slide.id, trigger: show });
    history.execute('trigger.add', { slideId: slide.id, trigger: hide });
    const current = () => history.project.scenes[0]!.slides[0]!;
    return { history, layer, close, current };
  }

  it('adds, renames, reorders and sets properties of layers, each undoable', () => {
    const { history, layer, current } = withLayer();
    const second = createLayer('Second');
    history.execute('layer.add', { slideId: current().id, layer: second, index: 0 });
    expect(current().layers.map((l) => l.name)).toEqual(['Second', 'Popup']);
    history.execute('layer.move', { layerId: second.id, index: 1 });
    expect(current().layers.map((l) => l.name)).toEqual(['Popup', 'Second']);
    history.execute('layer.rename', { layerId: layer.id, name: 'Feedback' });
    history.execute('layer.setProperties', {
      layerId: layer.id,
      properties: { hideBaseObjects: true, onRevisit: 'resume' },
    });
    expect(current().layers[0]).toMatchObject({
      name: 'Feedback',
      properties: { hideBaseObjects: true, onRevisit: 'resume', hideOtherLayers: true },
    });
    history.undo();
    expect(current().layers[0]!.properties.hideBaseObjects).toBe(false);
    expect(() => history.execute('layer.rename', { layerId: layer.id, name: ' ' })).toThrow(
      CommandError,
    );
    expect(() =>
      history.execute('layer.move', { layerId: current().baseLayer.id, index: 0 }),
    ).toThrow(/overlay/);
    expect(() =>
      history.execute('layer.setProperties', {
        layerId: layer.id,
        properties: { onRevisit: 'sometimes' as never },
      }),
    ).toThrow(CommandError);
  });

  it('removing a layer removes its triggers and the triggers that showed it; undo restores them', () => {
    const { history, layer, current } = withLayer();
    expect(current().triggers).toHaveLength(2);
    history.execute('layer.remove', { layerId: layer.id });
    expect(current().layers).toEqual([]);
    expect(current().triggers).toEqual([]);
    history.undo();
    expect(current().triggers).toHaveLength(2);
    expect(() => history.execute('layer.remove', { layerId: current().baseLayer.id })).toThrow(
      /overlay/,
    );
  });

  it('duplicates a layer with fresh ids and its own triggers', () => {
    const { history, layer, close, current } = withLayer();
    const copy = cloneLayer(current(), layer.id);
    history.execute('layer.add', {
      slideId: current().id,
      layer: copy.layer,
      triggers: copy.triggers,
    });
    const [, duplicate] = current().layers;
    expect(duplicate!.name).toBe('Popup copy');
    expect(duplicate!.objects[0]!.id).not.toBe(close.id);
    // The close button's trigger came along, about the copied button and the copied layer.
    expect(copy.triggers).toHaveLength(1);
    expect(copy.triggers[0]!.event).toEqual({ type: 'click', object: duplicate!.objects[0]!.id });
    expect(copy.triggers[0]!.action).toEqual({ type: 'hideLayer', layer: duplicate!.id });
    expect(findReferenceIssues(history.project)).toEqual([]);
  });
});

describe('slide properties and links', () => {
  function course() {
    const project = createEmptyProject();
    const [a, b, c, d] = ['A', 'B', 'C', 'D'].map((title) => createSlide(title));
    project.scenes = [{ ...createScene(), slides: [a!, b!, c!, d!] }];
    return { project, a: a!, b: b!, c: c!, d: d! };
  }
  const jump = (slideId: string, target: { kind: 'slide'; slide: string } | { kind: 'next' }) => ({
    id: createId('trigger'),
    owner: { kind: 'slide' as const, id: slideId },
    event: { type: 'keyPress' as const, key: 'j' },
    action: { type: 'jumpToSlide' as const, target },
    conditions: null,
    otherwise: null,
    enabled: true,
  });

  it('sets advance, revisit and the player buttons, undoably', () => {
    const { project, b } = course();
    const history = createHistory(project, { validate: true });
    history.execute('slide.setProperties', {
      slideId: b.id,
      properties: { advance: 'auto', onRevisit: 'resume', controls: { next: false } },
    });
    const stored = () => history.project.scenes[0]!.slides[1]!.properties;
    expect(stored()).toEqual({
      advance: 'auto',
      onRevisit: 'resume',
      controls: { previous: true, next: false },
      transition: null,
      focusOrder: null,
    });
    history.undo();
    expect(stored().controls.next).toBe(true);
    expect(() =>
      history.execute('slide.setProperties', {
        slideId: b.id,
        properties: { advance: 'sometimes' as never },
      }),
    ).toThrow(CommandError);
  });

  it('lists the ways between slides and the slides nothing reaches', () => {
    const { project, a, b, c, d } = course();
    // Every slide shows Previous and Next: everything is reachable.
    expect(unreachableSlides(project)).toEqual([]);
    for (const slide of [a, b, c, d]) slide.properties.controls = { previous: false, next: false };
    a.triggers.push(jump(a.id, { kind: 'slide', slide: c.id }));
    c.triggers.push({ ...jump(c.id, { kind: 'next' }), enabled: false });
    expect(slideLinks(project)).toEqual([{ from: a.id, to: c.id, kind: 'jump' }]);
    expect(unreachableSlides(project)).toEqual([b.id, d.id]);
    c.properties.advance = 'auto';
    expect(unreachableSlides(project)).toEqual([b.id]);
    expect(slideLinks(project)).toContainEqual({ from: c.id, to: d.id, kind: 'auto' });
  });
});

describe('tracking settings', () => {
  it('sets completion, reporting and resume, undoably, and refuses nonsense', () => {
    const { history } = setup();
    history.execute('project.setTracking', {
      tracking: { completion: { kind: 'slidesViewed', count: 4 }, reporting: 'passed-failed' },
    });
    expect(history.project.tracking).toEqual({
      completion: { kind: 'slidesViewed', count: 4 },
      reporting: 'passed-failed',
      resume: 'prompt',
    });
    history.undo();
    expect(history.project.tracking.reporting).toBe('completed-incomplete');
    expect(() =>
      history.execute('project.setTracking', {
        tracking: { completion: { kind: 'slidesViewed', count: 0 } },
      }),
    ).toThrow(CommandError);
    expect(() =>
      history.execute('project.setTracking', { tracking: { resume: 'maybe' as never } }),
    ).toThrow(CommandError);
  });
});

describe('audio objects', () => {
  it('removing a sound takes the triggers that play it or wait for it, and undo brings both back', () => {
    const { history, slideId, layerId } = setup();
    const hash = 'c'.repeat(64);
    history.execute('asset.add', {
      hash,
      meta: { kind: 'audio', fileName: 'n.wav', ext: 'wav', mimeType: 'audio/wav', byteLength: 1 },
    });
    const audio = createAudioObject(hash, 3);
    history.execute('object.add', { layerId, object: audio });
    const base = {
      owner: { kind: 'slide' as const, id: slideId },
      conditions: null,
      otherwise: null,
      enabled: true,
    };
    history.execute('trigger.add', {
      slideId,
      trigger: {
        ...base,
        id: createId('trigger'),
        event: { type: 'keyPress', key: 'p' },
        action: { type: 'pauseMedia', object: audio.id },
      },
    });
    history.execute('trigger.add', {
      slideId,
      trigger: {
        ...base,
        id: createId('trigger'),
        event: { type: 'mediaCompletes', object: audio.id },
        action: { type: 'jumpToSlide', target: { kind: 'next' } },
      },
    });
    history.execute('object.update', {
      objectId: audio.id,
      changes: { props: { volume: 0.4, startOn: 'trigger' } },
    });
    const slide = () => history.project.scenes[0]!.slides[0]!;
    expect(slide().baseLayer.objects[0]).toMatchObject({
      props: { volume: 0.4, startOn: 'trigger', length: 3 },
    });
    history.execute('object.remove', { objectIds: [audio.id] });
    expect(slide().triggers).toEqual([]);
    history.undo();
    expect(slide().triggers).toHaveLength(2);
    expect(() =>
      history.execute('object.update', { objectId: audio.id, changes: { props: { volume: 2 } } }),
    ).toThrow(CommandError);
  });
});

describe('publish settings', () => {
  it('remembers the target and its settings, undoably, and refuses nonsense', () => {
    const { history } = setup();
    expect(history.project.publish).toEqual(defaultPublishSettings());
    history.execute('project.setPublishSettings', {
      settings: { target: 'scorm2004', scorm2004Edition: 2, identifier: 'course-1', zip: true },
    });
    expect(history.project.publish).toEqual({
      ...defaultPublishSettings(),
      target: 'scorm2004',
      scorm2004Edition: 2,
      identifier: 'course-1',
      zip: true,
    });
    history.undo();
    expect(history.project.publish).toEqual(defaultPublishSettings());
    for (const settings of [
      { target: 'aicc' as never },
      { scorm2004Edition: 1 as never },
      { version: 'x'.repeat(21) },
      { zip: 'yes' as never },
    ]) {
      expect(() => history.execute('project.setPublishSettings', { settings })).toThrow(
        CommandError,
      );
    }
    expect(history.project.publish).toEqual(defaultPublishSettings());
  });
});

describe('asset commands', () => {
  const meta = {
    kind: 'image' as const,
    fileName: 'photo.png',
    ext: 'png',
    mimeType: 'image/png',
    byteLength: 10,
  };

  it('registers an asset once and ignores the same hash again', () => {
    const { history } = setup();
    const hash = 'a'.repeat(64);
    history.execute('asset.add', { hash, meta });
    history.execute('asset.add', { hash, meta: { ...meta, fileName: 'copy.png' } });
    expect(history.project.assets).toEqual({ [hash]: meta });
    expect(history.undoDepth).toBe(1);
    history.undo();
    expect(history.project.assets).toEqual({});
  });

  it('rejects malformed hashes and metadata', () => {
    const { history } = setup();
    expect(() => history.execute('asset.add', { hash: 'nope', meta })).toThrow(CommandError);
    expect(() =>
      history.execute('asset.add', { hash: 'a'.repeat(64), meta: { ...meta, ext: '.PNG' } }),
    ).toThrow(CommandError);
    expect(history.project.assets).toEqual({});
  });
});

describe('scene commands', () => {
  it('adds at the end by default or at an index, renames and moves', () => {
    const { history, sceneId } = setup();
    const b = createScene('B');
    const c = createScene('C');
    history.execute('scene.add', { scene: b });
    history.execute('scene.add', { scene: c, index: 0 });
    history.execute('scene.rename', { sceneId, title: 'A' });
    expect(history.project.scenes.map((scene) => scene.title)).toEqual(['C', 'A', 'B']);

    history.execute('scene.move', { sceneId: c.id, index: 2 });
    expect(history.project.scenes.map((scene) => scene.title)).toEqual(['A', 'B', 'C']);
  });

  it('refuses to remove the last scene', () => {
    const { history, sceneId } = setup();
    expect(() => history.execute('scene.remove', { sceneId })).toThrow(/at least one scene/);
    expect(history.project.scenes).toHaveLength(1);
  });

  it('removes triggers elsewhere that jump into a removed scene, and undo restores both', () => {
    const project = createEmptyProject();
    const main = project.scenes[0]!.slides[0]!;
    const appendix = createScene('Appendix');
    project.scenes.push(appendix);
    const button = shape('Button');
    main.baseLayer.objects.push(button);
    main.triggers.push(
      trigger(button.id, {
        type: 'jumpToSlide',
        target: { kind: 'slide', slide: appendix.slides[0]!.id },
      }),
      trigger(button.id, { type: 'jumpToSlide', target: { kind: 'next' } }),
    );
    const history = createHistory(parseProject(project), { validate: true });
    const before = snapshot(history.project);

    history.execute('scene.remove', { sceneId: appendix.id });
    expect(history.project.scenes).toHaveLength(1);
    expect(findSlide(history.project, main.id)!.slide.triggers).toHaveLength(1);

    history.undo();
    expect(history.project).toEqual(before);
  });

  it('rejects unknown scenes, bad indexes and reused ids, leaving the project untouched', () => {
    const { history, sceneId } = setup();
    const before = history.project;
    const duplicate = createScene();
    duplicate.id = sceneId;

    expect(() => history.execute('scene.rename', { sceneId: 'scene_nope', title: 'x' })).toThrow(
      CommandError,
    );
    expect(() => history.execute('scene.move', { sceneId, index: 5 })).toThrow(/out of range/);
    expect(() => history.execute('scene.add', { scene: createScene(), index: 9 })).toThrow(
      /out of range/,
    );
    expect(() => history.execute('scene.add', { scene: duplicate })).toThrow(/already in use/);
    expect(history.project).toBe(before);
    expect(history.canUndo).toBe(false);
  });
});

describe('slide commands', () => {
  it('adds, renames, and moves within and between scenes', () => {
    const { history, sceneId, slideId } = setup();
    const two = createSlide('Two');
    const three = createSlide('Three');
    const other = createScene('Other');
    history.execute('slide.add', { sceneId, slide: two });
    history.execute('slide.add', { sceneId, slide: three, index: 0 });
    history.execute('slide.rename', { slideId, title: 'One' });
    history.execute('scene.add', { scene: other });
    const titles = (index: number) =>
      history.project.scenes[index]!.slides.map((slide) => slide.title);
    expect(titles(0)).toEqual(['Three', 'One', 'Two']);

    history.execute('slide.move', { slideId: three.id, sceneId, index: 2 });
    expect(titles(0)).toEqual(['One', 'Two', 'Three']);

    history.execute('slide.move', { slideId: two.id, sceneId: other.id, index: 0 });
    expect(titles(0)).toEqual(['One', 'Three']);
    expect(titles(1)).toEqual(['Two', 'Untitled Slide']);
  });

  it('removes a slide along with triggers on other slides that jump to it', () => {
    const { history, first, second } = setupWithTriggers();
    const before = snapshot(history.project);

    history.execute('slide.remove', { slideId: second.id });
    expect(findSlide(history.project, second.id)).toBeUndefined();
    const remaining = findSlide(history.project, first.id)!.slide.triggers;
    expect(remaining.map((each) => each.action.type)).toEqual(['changeState']);

    history.undo();
    expect(history.project).toEqual(before);
  });

  it('rejects unknown slides and scenes and invalid slides', () => {
    const { history, sceneId, slideId } = setup();
    const before = history.project;
    const broken = { ...createSlide(), title: 42 } as unknown as ReturnType<typeof createSlide>;

    expect(() => history.execute('slide.remove', { slideId: 'slide_nope' })).toThrow(CommandError);
    expect(() =>
      history.execute('slide.add', { sceneId: 'scene_nope', slide: createSlide() }),
    ).toThrow(CommandError);
    expect(() => history.execute('slide.add', { sceneId, slide: broken })).toThrow(
      /Invalid slide at title/,
    );
    expect(() => history.execute('slide.move', { slideId, sceneId, index: 3 })).toThrow(
      /out of range/,
    );
    expect(history.project).toBe(before);
  });
});

describe('object commands', () => {
  it('adds on top by default or at a z-index, renames and reorders', () => {
    const { history, layerId, slideId } = setup();
    const a = shape('A');
    const b = shape('B');
    const c = shape('C');
    history.execute('object.add', { layerId, object: a });
    history.execute('object.add', { layerId, object: b });
    history.execute('object.add', { layerId, object: c, index: 0 });
    const names = () => objectsOf(history, slideId).map((object) => object.name);
    expect(names()).toEqual(['C', 'A', 'B']);

    history.execute('object.reorder', { objectId: c.id, index: 2 });
    history.execute('object.rename', { objectId: c.id, name: 'Front' });
    expect(names()).toEqual(['A', 'B', 'Front']);
  });

  it('merges frame, timing, a11y and props one level deep and replaces the rest', () => {
    const { history, layerId } = setup();
    const object = shape();
    history.execute('object.add', { layerId, object });
    history.execute('object.update', {
      objectId: object.id,
      changes: {
        locked: true,
        frame: { x: 40, rotation: 90 },
        timing: { start: 1.5 },
        a11y: { altText: 'A red box' },
        props: { geometry: { kind: 'ellipse' } },
      },
    });
    const updated = findObject(history.project, object.id)!.object as ShapeObject;
    expect(updated.locked).toBe(true);
    expect(updated.frame).toEqual({ x: 40, y: 0, width: 100, height: 50, rotation: 90 });
    expect(updated.timing).toEqual({ start: 1.5, duration: 'untilEnd' });
    expect(updated.a11y).toEqual({ altText: 'A red box', visibleToAssistiveTech: true });
    expect(updated.props.geometry).toEqual({ kind: 'ellipse' });
    expect(updated.props.appearance.opacity).toBe(1);
  });

  it('rejects updates that would make the object invalid', () => {
    const { history, layerId } = setup();
    const object = shape();
    history.execute('object.add', { layerId, object });
    const before = history.project;
    const update = (changes: Parameters<History['execute']>[1]) =>
      history.execute('object.update', changes as never);

    expect(() => update({ objectId: object.id, changes: { frame: { width: -1 } } })).toThrow(
      /frame\.width/,
    );
    expect(() => update({ objectId: object.id, changes: { props: { colour: 'red' } } })).toThrow(
      CommandError,
    );
    expect(() => update({ objectId: 'obj_nope', changes: { locked: true } })).toThrow(CommandError);
    expect(history.project).toBe(before);
  });

  it('reaches objects inside groups', () => {
    const { history, layerId } = setup();
    const inner = shape('Inner');
    const other = shape('Other');
    history.execute('object.add', { layerId, object: group([inner, other]) });

    history.execute('object.rename', { objectId: inner.id, name: 'Renamed' });
    history.execute('object.reorder', { objectId: inner.id, index: 1 });
    const location = findObject(history.project, inner.id)!;
    expect(location.object.name).toBe('Renamed');
    expect(location.siblings.map((each) => each.name)).toEqual(['Other', 'Renamed']);

    history.execute('object.remove', { objectIds: [inner.id] });
    expect(findObject(history.project, inner.id)).toBeUndefined();
    expect(findObject(history.project, other.id)).toBeDefined();
  });

  it('removes objects together with the triggers that refer to them, and undo restores both', () => {
    const { history, first, button, target } = setupWithTriggers();
    const before = snapshot(history.project);

    history.execute('object.remove', { objectIds: [target.id] });
    const slide = findSlide(history.project, first.id)!.slide;
    expect(slide.baseLayer.objects.map((object) => object.id)).toEqual([button.id]);
    expect(slide.triggers.map((each) => each.action.type)).toEqual(['jumpToSlide']);

    history.undo();
    expect(history.project).toEqual(before);
  });

  it('removes a group and a child of it in one command without tripping over itself', () => {
    const { history, layerId, slideId } = setup();
    const inner = shape('Inner');
    const outer = group([inner]);
    history.execute('object.add', { layerId, object: outer });
    history.execute('object.remove', { objectIds: [outer.id, inner.id] });
    expect(objectsOf(history, slideId)).toEqual([]);
  });

  it('rejects the whole removal if any id is unknown', () => {
    const { history, layerId, slideId } = setup();
    const object = shape();
    history.execute('object.add', { layerId, object });
    expect(() => history.execute('object.remove', { objectIds: [object.id, 'obj_nope'] })).toThrow(
      CommandError,
    );
    expect(objectsOf(history, slideId)).toHaveLength(1);
  });

  it('rejects unknown layers, reused ids, empty names and bad z-indexes', () => {
    const { history, layerId } = setup();
    const object = shape();
    history.execute('object.add', { layerId, object });
    const before = history.project;
    const twin = shape();
    twin.id = object.id;

    expect(() => history.execute('object.add', { layerId: 'layer_nope', object: shape() })).toThrow(
      CommandError,
    );
    expect(() => history.execute('object.add', { layerId, object: twin })).toThrow(
      /already in use/,
    );
    expect(() => history.execute('object.rename', { objectId: object.id, name: '' })).toThrow(
      CommandError,
    );
    expect(() => history.execute('object.reorder', { objectId: object.id, index: 1 })).toThrow(
      /out of range/,
    );
    expect(history.project).toBe(before);
  });
});

describe('grouping', () => {
  function threeShapes() {
    const { history, layerId, slideId } = setup();
    const [a, b, c] = [shape('A'), shape('B'), shape('C')];
    a.frame = { x: 10, y: 20, width: 100, height: 50, rotation: 0 };
    b.frame = { x: 300, y: 5, width: 40, height: 40, rotation: 0 };
    c.frame = { x: 200, y: 200, width: 60, height: 300, rotation: 0 };
    for (const object of [a, b, c]) history.execute('object.add', { layerId, object });
    return { history, layerId, slideId, a, b, c };
  }
  const emptyGroup = () => group([]) as GroupObject;

  it('gathers objects into a group where the topmost was, keeping their order', () => {
    const { history, slideId, a, b, c } = threeShapes();
    const container = emptyGroup();
    // Listed top-first on purpose: the result must follow z-order, not the list.
    history.execute('object.group', { objectIds: [c.id, a.id], group: container });

    const objects = objectsOf(history, slideId);
    expect(objects.map((object) => object.id)).toEqual([b.id, container.id]);
    const made = objects[1]!;
    expect(made.type === 'group' && made.children.map((child) => child.id)).toEqual([a.id, c.id]);
    expect(made.frame).toEqual({ x: 10, y: 20, width: 250, height: 480, rotation: 0 });
  });

  it('undoes and redoes as one step', () => {
    const { history, a, b } = threeShapes();
    const before = snapshot(history.project);
    history.execute('object.group', { objectIds: [a.id, b.id], group: emptyGroup() });
    const after = snapshot(history.project);
    history.undo();
    expect(history.project).toEqual(before);
    history.redo();
    expect(history.project).toEqual(after);
  });

  it('ungroups back to the same objects in the same places', () => {
    const { history, slideId, a, b, c } = threeShapes();
    const container = emptyGroup();
    history.execute('object.group', { objectIds: [a.id, b.id], group: container });
    expect(objectsOf(history, slideId).map((object) => object.id)).toEqual([container.id, c.id]);

    history.execute('object.ungroup', { groupId: container.id });
    expect(objectsOf(history, slideId).map((object) => object.id)).toEqual([a.id, b.id, c.id]);
    expect(findObject(history.project, container.id)).toBeUndefined();
    expect(() => parseProject(snapshot(history.project))).not.toThrow();
  });

  it('groups inside a group, and ungroups one level at a time', () => {
    const { history, slideId, a, b, c } = threeShapes();
    const inner = emptyGroup();
    const outer = emptyGroup();
    history.execute('object.group', { objectIds: [a.id, b.id], group: inner });
    history.execute('object.group', { objectIds: [inner.id, c.id], group: outer });
    expect(objectsOf(history, slideId).map((object) => object.id)).toEqual([outer.id]);

    history.execute('object.ungroup', { groupId: outer.id });
    expect(objectsOf(history, slideId).map((object) => object.id)).toEqual([inner.id, c.id]);
  });

  it('removes triggers that pointed at a group when it is dissolved, and undo restores them', () => {
    const { history, first, button, target } = setupWithTriggers();
    const container = emptyGroup();
    history.execute('object.group', { objectIds: [button.id, target.id], group: container });
    const slideNow = () => findSlide(history.project, first.id)!.slide;
    const kept = slideNow().triggers.length;
    expect(kept).toBeGreaterThan(0);

    // A trigger owned by the group itself.
    const onGroup = trigger(container.id, { type: 'jumpToSlide', target: { kind: 'next' } });
    const withTrigger = JSON.parse(JSON.stringify(history.project)) as Project;
    findSlide(withTrigger, first.id)!.slide.triggers.push(onGroup);
    const second = createHistory(parseProject(withTrigger), { validate: true });
    const before = snapshot(second.project);

    second.execute('object.ungroup', { groupId: container.id });
    const triggers = findSlide(second.project, first.id)!.slide.triggers;
    expect(triggers.map((each) => each.id)).not.toContain(onGroup.id);
    // Triggers on the children are untouched.
    expect(triggers).toHaveLength(kept);
    expect(() => parseProject(snapshot(second.project))).not.toThrow();

    second.undo();
    expect(second.project).toEqual(before);
  });

  it('rejects groups of fewer than two, repeats, strangers, non-empty groups and non-groups', () => {
    const { history, a, b } = threeShapes();
    const inside = shape('Inside');
    const elsewhere = group([inside]);
    history.execute('object.add', {
      layerId: allLayers(history.project)[0]!.layer.id,
      object: elsewhere,
    });
    const before = history.project;
    const attempt = (objectIds: string[], container = emptyGroup()) =>
      history.execute('object.group', { objectIds, group: container });

    expect(() => attempt([a.id])).toThrow(/at least two/);
    expect(() => attempt([a.id, a.id])).toThrow(/twice/);
    expect(() => attempt([a.id, 'obj_nope'])).toThrow(CommandError);
    // One on the layer, one inside another group: not siblings.
    expect(() => attempt([a.id, inside.id])).toThrow(/same layer or group/);
    expect(() => attempt([a.id, b.id], group([shape('Stowaway')]) as GroupObject)).toThrow(
      /start empty/,
    );
    expect(() => history.execute('object.ungroup', { groupId: a.id })).toThrow(/not a group/);
    expect(history.project).toBe(before);
  });
});

describe('triggerReferences', () => {
  it('lists every id a trigger depends on', () => {
    const full: Trigger = {
      id: 'trigger_1',
      owner: { kind: 'layer', id: 'layer_1' },
      event: { type: 'cuePoint', layer: 'layer_2', cuePoint: 'cue_1' },
      action: {
        type: 'setVariable',
        variable: 'var_1',
        operator: 'add',
        operand: { kind: 'variable', variable: 'var_2' },
      },
      conditions: {
        combine: 'and',
        items: [
          {
            subject: 'variable',
            variable: 'var_3',
            operator: '==',
            value: { kind: 'variable', variable: 'var_4' },
          },
          { subject: 'objectState', object: 'obj_1', operator: '==', state: 'hover' },
        ],
      },
      otherwise: { type: 'jumpToSlide', target: { kind: 'slide', slide: 'slide_1' } },
      enabled: true,
    };
    expect([...triggerReferences(full)].sort()).toEqual(
      [
        'cue_1',
        'layer_1',
        'layer_2',
        'obj_1',
        'slide_1',
        'var_1',
        'var_2',
        'var_3',
        'var_4',
      ].sort(),
    );
  });
});

// ------------------------------------------------------------ property test

/**
 * A random editing step, described without reference to any particular
 * project. `pick` values choose among whatever exists when the step runs, so
 * every generated step resolves to a command that is valid at that moment.
 */
const stepArbitrary = fc.record({
  kind: fc.constantFrom(
    'rename',
    'stage',
    'sceneAdd',
    'sceneRemove',
    'sceneMove',
    'slideAdd',
    'slideRemove',
    'slideMove',
    'objectAdd',
    'objectRemove',
    'objectUpdate',
    'objectReorder',
    'groupAdd',
    'masterAdd',
    'masterRemove',
    'layoutSet',
    'cueAdd',
    'cueRemove',
    'duration',
    'stateAdd',
    'stateRemove',
    'stateUpdate',
    'variableAdd',
    'variableRename',
    'variableRemove',
    'triggerAdd',
    'triggerMove',
    'triggerRemove',
    'layerAdd',
    'layerRemove',
    'layerMove',
    'slideProperties',
    'publishSettings',
    'tracking',
    'audioAdd',
    'videoAdd',
    'animate',
    'pathRemove',
    'zoomAdd',
    'markersAdd',
    'questionAdd',
    'questionEdit',
    'questionConvert',
    'bankAdd',
    'bankRemove',
    'drawAdd',
    'resultAdd',
    'questionBranch',
    'bankRename',
    'drawEdit',
    'resultEdit',
    'playerSet',
    'tabsSet',
    'notesSet',
    'lookSet',
    'lightboxSet',
    'courseActionAdd',
    'slideToBank',
    'fieldBind',
    'controlBind',
    'scrollSet',
    'webAdd',
    'dragSet',
    'graphicAdd',
    'tableEdit',
    'panoramaAdd',
    'focusOrderSet',
    'translate',
    'slidesImport',
  ),
  pick: fc.tuple(fc.nat(1000), fc.nat(1000), fc.nat(1000)),
  text: fc.string({ maxLength: 8 }),
  number: fc.integer({ min: 1, max: 2000 }),
});
type Step = ReturnType<typeof stepArbitrary.generate>['value'];

const QUESTION_KINDS = [
  'multipleChoice',
  'multipleResponse',
  'trueFalse',
  'fillInBlank',
  'numeric',
  'matchingDropdown',
  'sequenceDropdown',
  'wordBank',
  'matchingDrag',
  'sequenceDrag',
  'hotspot',
  'pickOne',
  'pickMany',
  'shortAnswer',
  'essay',
  'howMany',
  'whichWord',
  'ranking',
  'likert',
  'freePickOne',
  'freePickMany',
  'freeText',
  'freeKey',
  'freeDrag',
  'freeHotspot',
] as const;

const FREEFORM_KINDS = ['freePickOne', 'freePickMany', 'freeText', 'freeKey', 'freeDrag'] as const;

function runStep(history: History, step: Step): void {
  const { project } = history;
  const [a, b, c] = step.pick;
  const at = <T>(list: readonly T[], pick: number): T | undefined =>
    list[pick % (list.length || 1)];
  const scene = at(project.scenes, a)!;
  const slide = at(scene.slides, b);
  const object = slide && at(slide.baseLayer.objects, c);

  switch (step.kind) {
    case 'rename':
      return history.execute('project.rename', { title: step.text });
    case 'stage':
      return history.execute('project.setStageSize', { width: step.number, height: step.number });
    case 'sceneAdd':
      return history.execute('scene.add', {
        scene: createScene(step.text),
        index: b % (project.scenes.length + 1),
      });
    case 'sceneRemove':
      if (project.scenes.length > 1) history.execute('scene.remove', { sceneId: scene.id });
      return;
    case 'sceneMove':
      return history.execute('scene.move', { sceneId: scene.id, index: b % project.scenes.length });
    case 'slideAdd': {
      const added = createSlide(step.text);
      // Link the new slide to an existing one so removals have triggers to clean up.
      if (slide && object) {
        const button = shape('Link');
        added.baseLayer.objects.push(button);
        added.triggers.push(
          trigger(button.id, { type: 'jumpToSlide', target: { kind: 'slide', slide: slide.id } }),
        );
      }
      return history.execute('slide.add', { sceneId: scene.id, slide: added });
    }
    case 'slideRemove':
      if (slide) history.execute('slide.remove', { slideId: slide.id });
      return;
    case 'slideMove': {
      if (!slide) return;
      const target = at(project.scenes, c)!;
      const max = target.id === scene.id ? target.slides.length - 1 : target.slides.length;
      return history.execute('slide.move', {
        slideId: slide.id,
        sceneId: target.id,
        index: step.number % (max + 1),
      });
    }
    case 'objectAdd':
    case 'groupAdd': {
      if (!slide) return;
      const added = step.kind === 'groupAdd' ? group([shape('Child'), shape('Child')]) : shape();
      history.execute('object.add', { layerId: slide.baseLayer.id, object: added });
      if (object) {
        // Tie the new object to an existing one with a trigger, in a gesture so
        // the pair lands as one undo step — exercising coalescing under random load.
        history.beginGesture('rename pair');
        history.execute('object.rename', { objectId: added.id, name: `${step.text}!` });
        history.execute('object.rename', { objectId: object.id, name: `${step.text}?` });
        history.commitGesture();
      }
      return;
    }
    case 'cueAdd':
      if (slide) {
        history.execute('cuePoint.add', {
          layerId: slide.baseLayer.id,
          cuePoint: {
            id: createId('cue'),
            name: step.text || 'Cue',
            time: ((step.number % 100) / 100) * slide.baseLayer.timeline.duration,
          },
        });
      }
      return;
    case 'cueRemove': {
      const cue = slide && at(slide.baseLayer.timeline.cuePoints, c);
      if (cue) history.execute('cuePoint.remove', { cuePointId: cue.id });
      return;
    }
    case 'stateAdd':
      if (object) {
        history.execute('state.add', {
          objectId: object.id,
          state: {
            id: createId('state'),
            name: 'Random',
            overrides: { frame: { x: step.number } },
          },
        });
      }
      return;
    case 'stateRemove': {
      const state =
        object &&
        at(
          object.states.filter((each) => each.id !== 'normal'),
          c,
        );
      if (object && state)
        history.execute('state.remove', { objectId: object.id, stateId: state.id });
      return;
    }
    case 'stateUpdate': {
      const state =
        object &&
        at(
          object.states.filter((each) => each.id !== 'normal'),
          c,
        );
      if (object && state) {
        history.execute('state.update', {
          objectId: object.id,
          stateId: state.id,
          changes: {
            name: `S${step.number}`,
            overrides: step.number % 2 ? {} : { frame: { y: 3 } },
          },
        });
      }
      return;
    }
    case 'variableAdd':
      return history.execute('variable.add', {
        variable: {
          id: createId('var'),
          name: `V${createId('var').slice(4)}`,
          type: 'number',
          default: step.number,
        },
      });
    case 'variableRename': {
      const variable = at(project.variables, a);
      if (variable) {
        history.execute('variable.update', {
          variableId: variable.id,
          // A number default only for a number variable: fieldBind (P9.2) adds text ones.
          changes:
            variable.type === 'number'
              ? { name: `V${createId('var').slice(4)}`, default: step.number }
              : { name: `V${createId('var').slice(4)}` },
        });
      }
      return;
    }
    case 'variableRemove': {
      const variable = at(project.variables, a);
      if (variable) history.execute('variable.remove', { variableId: variable.id });
      return;
    }
    case 'triggerAdd':
      if (slide) {
        const variable = at(project.variables, b);
        history.execute('trigger.add', {
          slideId: slide.id,
          trigger: {
            id: createId('trigger'),
            owner: { kind: 'slide', id: slide.id },
            event: { type: 'keyPress', key: 'k' },
            action: variable
              ? {
                  type: 'setVariable',
                  variable: variable.id,
                  operator: 'assign',
                  operand: { kind: 'literal', value: 1 },
                }
              : { type: 'jumpToSlide', target: { kind: 'next' } },
            conditions: null,
            otherwise: null,
            enabled: step.number % 2 === 0,
          },
        });
      }
      return;
    case 'triggerMove':
      if (slide && slide.triggers.length > 1) {
        history.execute('trigger.move', {
          triggerId: at(slide.triggers, c)!.id,
          index: step.number % slide.triggers.length,
        });
      }
      return;
    case 'triggerRemove': {
      const trigger = slide && at(slide.triggers, c);
      if (trigger) history.execute('trigger.remove', { triggerId: trigger.id });
      return;
    }
    case 'layerAdd':
      if (slide) {
        const layer = createLayer(step.text || 'Layer');
        layer.objects.push(shape('On a layer'));
        history.execute('layer.add', {
          slideId: slide.id,
          layer,
          index: step.number % (slide.layers.length + 1),
        });
      }
      return;
    case 'layerRemove': {
      const layer = slide && at(slide.layers, c);
      if (layer) history.execute('layer.remove', { layerId: layer.id });
      return;
    }
    case 'layerMove': {
      const layer = slide && at(slide.layers, c);
      if (slide && layer)
        history.execute('layer.move', {
          layerId: layer.id,
          index: step.number % slide.layers.length,
        });
      return;
    }
    case 'audioAdd':
      if (slide) {
        // A sound, its object, and a trigger that plays it: removing the object later must take the trigger.
        const hash = 'd'.repeat(64);
        history.execute('asset.add', {
          hash,
          meta: {
            kind: 'audio',
            fileName: 'n.mp3',
            ext: 'mp3',
            mimeType: 'audio/mpeg',
            byteLength: 1,
          },
        });
        const audio = createAudioObject(hash, (step.number % 50) / 10 + 0.5);
        audio.props.startOn = step.number % 2 ? 'timeline' : 'trigger';
        // Some made from text, as Text to Speech makes them.
        if (step.number % 3 === 0) {
          audio.props.speech = { text: step.text || 'Hello', voice: 'espeak-ng:en', rate: 1.2 };
        }
        audio.props.captions = [
          {
            id: createId('caption'),
            start: 0,
            end: Math.min(0.4, audio.props.length),
            text: step.text,
          },
        ];
        history.execute('object.add', { layerId: slide.baseLayer.id, object: audio });
        // And edited, as the Captions tab does: the whole list at once.
        history.execute('object.update', {
          objectId: audio.id,
          changes: {
            props: {
              captions: [
                ...audio.props.captions,
                { id: createId('caption'), start: 0.1, end: audio.props.length, text: 'Later' },
              ],
            },
          },
        });
        history.execute('trigger.add', {
          slideId: slide.id,
          trigger: {
            id: createId('trigger'),
            owner: { kind: 'slide', id: slide.id },
            event: { type: 'mediaCompletes', object: audio.id },
            action: { type: 'playMedia', object: audio.id },
            conditions: null,
            otherwise: null,
            enabled: true,
          },
        });
      }
      return;
    case 'animate':
      // A zoom region has no animations (the command refuses them).
      if (slide && object && object.type !== 'zoomRegion') {
        // An entrance, an exit and a new path with the trigger that runs it, as the Animations tab does.
        const kinds = ['fade', 'fly', 'wipe', 'spin', 'bounce'] as const;
        const path = createMotionPath(step.number % 2 ? 'line' : 'arc', step.text || 'Path');
        history.execute('object.update', {
          objectId: object.id,
          changes: {
            animations: {
              entrance: createEffect(kinds[step.number % kinds.length]!),
              exit: step.number % 3 ? createEffect('fade', 0.3) : null,
              motionPaths: [...object.animations.motionPaths, path],
            },
          },
        });
        history.execute('trigger.add', {
          slideId: slide.id,
          trigger: trigger(object.id, { type: 'moveAlongPath', object: object.id, path: path.id }),
        });
      }
      return;
    case 'questionAdd':
      // A question slide, as Insert → Question… makes it.
      history.execute('slide.add', {
        sceneId: scene.id,
        slide: createQuestionSlide(
          QUESTION_KINDS[step.number % QUESTION_KINDS.length]!,
          project.stage,
        ),
        index: b % (scene.slides.length + 1),
      });
      return;
    case 'bankAdd':
      // A question bank (P7.6), with one question in it.
      history.execute('bank.add', {
        bank: createBank(step.text || 'Bank', project.stage, feedbackMasterOf(project)),
      });
      return;
    case 'bankRemove': {
      const bank = at(project.banks, a);
      if (bank) history.execute('bank.remove', { bankId: bank.id });
      return;
    }
    case 'playerSet': {
      // The player frame (P8.1): navigation, a control, and a menu entry renamed or hidden.
      const target = at(allSlides(project), a)?.slide;
      history.execute('project.setPlayer', {
        player: {
          menu: {
            ...project.player.menu,
            navigation: (['free', 'restricted', 'locked'] as const)[step.number % 3]!,
            entries: target
              ? {
                  ...project.player.menu.entries,
                  [target.id]: { title: step.text || null, hidden: step.number % 2 === 0 },
                }
              : project.player.menu.entries,
          },
          controls: { ...project.player.controls, speed: step.number % 4 !== 0 },
        },
      });
      return;
    }
    case 'webAdd': {
      // A web object from an address, in the slide or a new window (P9.6).
      if (!slide) return;
      const web = createWebObject(
        { kind: 'url', url: `https://example.com/${step.number}` },
        step.text.trim() || 'Page',
      );
      web.props.display = step.number % 2 === 0 ? 'inline' : 'window';
      history.execute('object.add', { layerId: slide.baseLayer.id, object: web });
      return;
    }
    case 'translate': {
      // Every other piece of text translated, with its formatting tags, into one of three
      // languages, Arabic among them (P10.3). A unit left blank stays as it was.
      const language = ['fr', 'ar', 'de'][a % 3]!;
      const units = translationUnits(history.project).map((unit, index) => ({
        id: unit.id,
        source: unit.source,
        target:
          (index + b) % 2 === 0
            ? unit.source.map((each) =>
                'text' in each ? { text: `${step.text || 'x'}${each.text}` } : each,
              )
            : null,
      }));
      history.execute('project.translate', { units, language });
      return;
    }
    case 'slidesImport': {
      // One or two slides from another project (P11.2): a copy of this one, as a template
      // saved from it would be, so the copies bring whatever this course has built so far.
      const from = JSON.parse(JSON.stringify(project)) as Project;
      const offered = from.scenes.flatMap((each) => each.slides);
      if (offered.length === 0) return;
      const ids = [...new Set([at(offered, a)!.id, at(offered, c)!.id])];
      const prepared = prepareSlideImport(project, from, ids);
      history.execute('slides.import', {
        sceneId: scene.id,
        index: b % (scene.slides.length + 1),
        slides: prepared.slides,
        banks: prepared.banks,
        masters: prepared.masters,
        variables: prepared.variables,
        assets: prepared.assets,
      });
      return;
    }
    case 'focusOrderSet': {
      // A Tab order of some of the slide's objects, reversed, or back to the layout's (P10.1).
      if (!slide) return;
      const ids = slide.baseLayer.objects
        .map((each) => each.id)
        .filter((_, i) => (i + a) % 2 === 0);
      history.execute('slide.setProperties', {
        slideId: slide.id,
        properties: { focusOrder: step.number % 3 === 0 ? null : ids.reverse() },
      });
      return;
    }
    case 'panoramaAdd': {
      // A 360° image of a picture with two spots and a trigger on one, then a spot removed (P9.10).
      if (!slide) return;
      const hash = '9'.repeat(64);
      if (!project.assets[hash]) {
        history.execute('asset.add', {
          hash,
          meta: {
            kind: 'image',
            fileName: 'room.jpg',
            ext: 'jpg',
            mimeType: 'image/jpeg',
            byteLength: 1,
          },
        });
      }
      const panorama = createPanoramaObject(hash);
      panorama.props.mode = step.number % 2 === 0 ? 'free' : 'guided';
      const first = createPanoramaSpot(
        'First',
        (step.number % 361) - 180,
        (step.number % 181) - 90,
      );
      const second = createPanoramaSpot('Second', 0, 0, 'hotspot');
      panorama.props.spots = [first, second];
      history.execute('object.add', { layerId: slide.baseLayer.id, object: panorama });
      history.execute('trigger.add', {
        slideId: slide.id,
        trigger: {
          id: createId('trigger'),
          owner: { kind: 'slide', id: slide.id },
          event:
            step.number % 3 === 0
              ? { type: 'panoramaVisited', object: panorama.id }
              : { type: 'spotClicked', object: panorama.id, spot: first.id },
          action: { type: 'jumpToSlide', target: { kind: 'next' } },
          conditions: null,
          otherwise: null,
          enabled: true,
        },
      });
      if (step.number % 2 === 1) {
        history.execute('object.update', {
          objectId: panorama.id,
          changes: { props: { spots: [second] } },
        });
      }
      return;
    }
    case 'tableEdit': {
      // A table added, or one there changed: a row or column in or out, a cell's text or fill (P9.9).
      if (!slide) return;
      const existing = slide.baseLayer.objects.find((each) => each.type === 'table');
      if (!existing || existing.type !== 'table') {
        history.execute('object.add', {
          layerId: slide.baseLayer.id,
          object: createTableObject(1 + (step.number % 4), 1 + (step.number % 5)),
        });
        return;
      }
      const grid = { columns: existing.props.columns, rows: existing.props.rows };
      const row = b % grid.rows.length;
      const column = c % grid.columns.length;
      let next: typeof grid;
      try {
        switch (step.number % 5) {
          case 0:
            next = withRowAdded(grid, row);
            break;
          case 1:
            next = withColumnAdded(grid, column);
            break;
          case 2:
            next = withRowRemoved(grid, row);
            break;
          case 3:
            next = withColumnRemoved(grid, column);
            break;
          default:
            next = withCell(grid, row, column, {
              text: plainRichText(step.text),
              fill: step.number % 2 === 0 ? null : { theme: 'accent3' },
            });
        }
      } catch {
        return; // At a limit: no change.
      }
      history.execute('object.update', {
        objectId: existing.id,
        changes: { props: { columns: next.columns, rows: next.rows } },
      });
      return;
    }
    case 'graphicAdd': {
      // An icon or illustration from the library, then its colours and line width (P9.8).
      if (!slide) return;
      const graphic = createGraphicObject({
        library: step.number % 2 === 0 ? 'lucide' : 'openDoodles',
        key: `item-${step.number}`,
        title: 'Item',
        viewBox: { width: 24, height: 24 },
        strokeWidth: step.number % 2 === 0 ? 2 : null,
        nodes: [
          {
            tag: 'g',
            attrs: { stroke: 'ink', fill: 'accent' },
            children: [{ tag: 'circle', attrs: { cx: '12', cy: '12', r: '8' }, children: [] }],
          },
        ],
      });
      history.execute('object.add', { layerId: slide.baseLayer.id, object: graphic });
      history.execute('object.update', {
        objectId: graphic.id,
        changes: {
          props: {
            ink: step.number % 3 === 0 ? '#123456' : { theme: 'accent2' },
            ...(graphic.props.strokeWidth === null ? {} : { strokeWidth: 1 + (step.number % 5) }),
          },
        },
      });
      return;
    }
    case 'dragSet': {
      // An object made draggable (or not), with "dropped on" and "intersects" triggers (P9.7).
      const objects = slide?.baseLayer.objects.filter((each) => each.type !== 'zoomRegion') ?? [];
      if (!slide || objects.length < 2) return;
      const dragged = objects[a % objects.length]!;
      const other = objects[(a + 1) % objects.length]!;
      const drag = step.number % 4 === 0 ? null : { returnToStart: step.number % 2 === 0 };
      history.execute('object.update', { objectId: dragged.id, changes: { drag } });
      for (const event of [
        { type: 'droppedOn' as const, object: dragged.id, target: other.id },
        { type: 'intersects' as const, object: dragged.id, other: other.id },
      ]) {
        history.execute('trigger.add', {
          slideId: slide.id,
          trigger: {
            id: createId('trigger'),
            owner: { kind: 'slide', id: slide.id },
            event,
            action: { type: 'jumpToSlide', target: { kind: 'next' } },
            conditions: null,
            otherwise: null,
            enabled: true,
          },
        });
      }
      return;
    }
    case 'scrollSet': {
      // A group made a scrolling panel, its window changed, or made ordinary again (P9.5).
      const group = slide?.baseLayer.objects.find((each) => each.type === 'group');
      if (!group || group.type !== 'group') return;
      const scroll = step.number % 3 === 0 ? null : { height: 1 + (step.number % 300) };
      history.execute('object.update', { objectId: group.id, changes: { scroll } });
      return;
    }
    case 'controlBind': {
      // A slider or dial bound to a new number variable, with a moves trigger (P9.4).
      if (!slide) return;
      const variable = {
        id: createId('var'),
        name: `Ctl${step.number}x${a}`,
        type: 'number' as const,
        default: 0,
      };
      if (
        project.variables.some((each) => each.name.toLowerCase() === variable.name.toLowerCase())
      ) {
        return;
      }
      history.execute('variable.add', { variable });
      const control = step.number % 2 === 0 ? createSliderObject() : createDialObject();
      control.props.variable = variable.id;
      control.props.max = 10 + (step.number % 50);
      history.execute('object.add', { layerId: slide.baseLayer.id, object: control });
      history.execute('trigger.add', {
        slideId: slide.id,
        trigger: {
          id: createId('trigger'),
          owner: { kind: 'object', id: control.id },
          event: { type: 'controlMoves', object: control.id },
          action: { type: 'jumpToSlide', target: { kind: 'next' } },
          conditions: null,
          otherwise: null,
          enabled: true,
        },
      });
      if (step.number % 3 === 0) history.execute('variable.remove', { variableId: variable.id });
      return;
    }
    case 'fieldBind': {
      // A data-entry field bound to a new variable, with a loses-focus trigger (P9.2);
      // sometimes the variable changes type, which unbinds the field.
      if (!slide) return;
      const numeric = step.number % 2 === 0;
      const variable = {
        id: createId('var'),
        name: `Field${step.number}x${a}`,
        type: numeric ? ('number' as const) : ('text' as const),
        default: numeric ? 0 : '',
      };
      if (
        project.variables.some((each) => each.name.toLowerCase() === variable.name.toLowerCase())
      ) {
        return;
      }
      history.execute('variable.add', { variable });
      const field = createTextEntryObject({ x: 20, y: 20 }, numeric);
      field.props.variable = variable.id;
      if (numeric && step.number % 4 === 0) {
        field.props.min = 0;
        field.props.max = step.number;
      }
      history.execute('object.add', { layerId: slide.baseLayer.id, object: field });
      history.execute('trigger.add', {
        slideId: slide.id,
        trigger: {
          id: createId('trigger'),
          owner: { kind: 'object', id: field.id },
          event: { type: 'controlLosesFocus', object: field.id },
          action: { type: 'toggleVariable', variable: variable.id },
          conditions: null,
          otherwise: null,
          enabled: true,
        },
      });
      if (step.number % 3 === 0) {
        history.execute('variable.update', {
          variableId: variable.id,
          changes: numeric ? { type: 'text', default: '' } : { type: 'number', default: 0 },
        });
      }
      return;
    }
    case 'slideToBank': {
      // A question slide of a scene moved into a bank, leaving the course (the Phase 8 review).
      const bank = at(project.banks, b);
      const question = allSlides(project).filter(({ slide: each }) => each.question)[a % 7];
      if (!bank || !question) return;
      history.execute('slide.move', {
        slideId: question.slide.id,
        sceneId: bank.id,
        index: step.number % (bank.slides.length + 1),
      });
      return;
    }
    case 'courseActionAdd': {
      // One of plan 4.2's last actions on a slide (P8.6).
      const target = at(allSlides(project), a)?.slide;
      if (!target) return;
      const actions: TriggerAction[] = [
        { type: 'restartCourse' },
        { type: 'exitCourse' },
        { type: 'printSlide' },
        { type: 'sendEmail', to: 'a@b.example', subject: step.text, body: '%Score%' },
        { type: 'seekTimeline', layer: target.baseLayer.id, time: step.number % 10 },
      ];
      history.execute('trigger.add', {
        slideId: target.id,
        trigger: {
          id: createId('trigger'),
          owner: { kind: 'slide', id: target.id },
          event: { type: 'timelineEnd', layer: target.baseLayer.id },
          action: actions[step.number % actions.length]!,
          conditions: null,
          otherwise: null,
          enabled: true,
        },
      });
      return;
    }
    case 'lightboxSet': {
      // A button-less lightbox trigger on one slide opening another, or a custom tab opening one (P8.4).
      const slides = project.scenes.flatMap((scene) => scene.slides).filter((each) => !each.draw);
      const from = at(slides, a);
      const to = at(slides, b);
      if (!from || !to || from.id === to.id) return;
      if (step.number % 2 === 0) {
        history.execute('trigger.add', {
          slideId: from.id,
          trigger: {
            id: createId('trigger'),
            owner: { kind: 'slide', id: from.id },
            event: { type: 'timelineEnd', layer: from.baseLayer.id },
            action: { type: 'openLightbox', slide: to.id, controls: step.number % 4 === 0 },
            conditions: null,
            otherwise: null,
            enabled: true,
          },
        });
      } else {
        const { tabs } = project.player;
        history.execute('project.setPlayer', {
          player: {
            tabs: {
              ...tabs,
              custom: [
                ...tabs.custom,
                { id: createId('tab'), label: 'Box', lightbox: { slide: to.id, controls: false } },
              ].slice(-3),
            },
          },
        });
      }
      return;
    }
    case 'tabsSet': {
      // The player's tabs (P8.2): a custom tab with a trigger listening for it, or one
      // removed (taking its triggers); a link; a glossary term; Notes shown or not.
      const { tabs } = project.player;
      const target = at(allSlides(project), a)?.slide;
      const removing = tabs.custom.length > 0 && step.number % 3 === 0;
      const tab = { id: createId('tab'), label: step.text.trim() || 'Tab', lightbox: null };
      history.execute('project.setPlayer', {
        player: {
          tabs: {
            resources: {
              show: tabs.resources.show,
              items: [
                ...tabs.resources.items,
                {
                  id: createId('res'),
                  title: 'Link',
                  target: { kind: 'link' as const, url: `https://example.com/${step.number}` },
                },
              ].slice(-3),
            },
            glossary: {
              show: tabs.glossary.show,
              terms: [
                ...tabs.glossary.terms,
                { id: createId('term'), term: step.text || 'Term', definition: 'Means.' },
              ].slice(-3),
            },
            notes: { show: step.number % 2 === 0 },
            custom: removing ? tabs.custom.slice(1) : [...tabs.custom, tab].slice(-3),
          },
        },
      });
      const added = history.project.player.tabs.custom.find((each) => each.id === tab.id);
      if (target && added) {
        history.execute('trigger.add', {
          slideId: target.id,
          trigger: {
            id: createId('trigger'),
            owner: { kind: 'slide', id: target.id },
            event: { type: 'playerTab', tab: added.id },
            action: { type: 'jumpToSlide', target: { kind: 'next' } },
            conditions: null,
            otherwise: null,
            enabled: true,
          },
        });
      }
      return;
    }
    case 'lookSet': {
      // The player's look and words (P8.3), or a preset of them applied.
      const { player } = project;
      if (step.number % 5 === 0) {
        const preset = presetOf(player, 'Saved');
        preset.look.scheme = 'light';
        history.execute('project.setPlayer', { player: withPreset(player, preset) });
        return;
      }
      const language = (['en', 'fr', 'de-CH'] as const)[step.number % 3]!;
      history.execute('project.setPlayer', {
        player: {
          look: {
            ...player.look,
            scheme: (['dark', 'light', 'auto'] as const)[step.number % 3]!,
            controlsAt: step.number % 2 === 0 ? 'top' : 'bottom',
            menuSide: step.number % 4 < 2 ? 'left' : 'right',
          },
          labels: {
            language,
            words: {
              ...player.labels.words,
              [language]: { ...player.labels.words[language], next: step.text.trim() || 'On' },
            },
          },
        },
      });
      return;
    }
    case 'notesSet': {
      // A slide's notes (P8.2).
      const target = at(allSlides(project), a)?.slide;
      if (target) {
        history.execute('slide.setNotes', {
          slideId: target.id,
          notes: notesFromText(step.text ? `${step.text}\nMore.` : ''),
        });
      }
      return;
    }
    case 'questionBranch': {
      // A question branching to another slide of the course (the Phase 7 review).
      const quizSlide = allSlides(project).find(({ slide: each }) => each.question)?.slide;
      const target = at(allSlides(project), c)?.slide;
      if (!quizSlide?.question || !target) return;
      const branch = { ...quizSlide.question.branch } as Record<string, unknown>;
      const key = Object.keys(branch)[step.number % Object.keys(branch).length]!;
      branch[key] = step.number % 3 ? { kind: 'slide', slide: target.id } : null;
      history.execute('slide.setQuestion', {
        slideId: quizSlide.id,
        question: { ...quizSlide.question, branch } as typeof quizSlide.question,
      });
      return;
    }
    case 'bankRename': {
      const bank = at(project.banks, a);
      if (bank) history.execute('bank.rename', { bankId: bank.id, title: `${step.text}!` });
      return;
    }
    case 'drawEdit': {
      // A draw's settings changed, or a plain slide made one (P7.6).
      const target = allSlides(project).find(
        ({ slide: each }) =>
          each.draw ||
          // A slide that opens as a lightbox cannot become a draw (P8.4).
          (!each.question && !each.result && !opensAsLightbox(project, each.id)),
      )?.slide;
      if (!target) return;
      const bank = at(project.banks, b);
      history.execute('slide.setDraw', {
        slideId: target.id,
        draw:
          step.number % 4 === 0
            ? null
            : {
                bank: bank?.id ?? null,
                count: (step.number % 5) + 1,
                order: step.number % 2 ? 'random' : 'inOrder',
                locked:
                  bank && step.number % 3 === 0 ? bank.slides.slice(0, 1).map((s) => s.id) : [],
              },
      });
      return;
    }
    case 'resultEdit': {
      // A result's settings changed (P7.7).
      const target = allSlides(project).find(({ slide: each }) => each.result)?.slide;
      if (!target?.result) return;
      history.execute('slide.setResult', {
        slideId: target.id,
        result:
          step.number % 5 === 0
            ? null
            : {
                ...target.result,
                passPercent: step.number % 101,
                timer: step.number % 2 ? { seconds: 10 + (step.number % 600) } : null,
              },
      });
      return;
    }
    case 'resultAdd': {
      // A result slide (P7.7): all questions, or the first question slide it finds.
      const result = createResultSlide(project.stage);
      const named = allSlides(project).find(({ slide: each }) => each.question)?.slide;
      if (named && step.number % 2 === 0) {
        result.result = { ...result.result!, include: { kind: 'chosen', slides: [named.id] } };
      }
      history.execute('slide.add', {
        sceneId: scene.id,
        slide: result,
        index: b % (scene.slides.length + 1),
      });
      return;
    }
    case 'drawAdd': {
      // A draw slide from a bank (or none), its first question locked now and then.
      const bank = at(project.banks, a);
      const draw = createDrawSlide(bank?.id ?? null);
      if (bank && step.number % 2 === 0 && bank.slides[0]) {
        draw.draw = { ...draw.draw!, locked: [bank.slides[0].id], order: 'inOrder' };
      }
      history.execute('slide.add', {
        sceneId: scene.id,
        slide: draw,
        index: b % (scene.slides.length + 1),
      });
      return;
    }
    case 'questionConvert': {
      // An ordinary slide converted into a freeform question (P7.4), its objects chosen as choices.
      if (!slide || slide.question || slide.draw || slide.result) return;
      const kind = FREEFORM_KINDS[step.number % FREEFORM_KINDS.length]!;
      const { question, objects, triggers, layers } = convertToQuestion(
        kind,
        project.stage,
        feedbackMasterOf(project),
      );
      for (const object of objects) {
        history.execute('object.add', { layerId: slide.baseLayer.id, object });
      }
      // Its feedback layers (P7.5) first: their buttons' triggers are among `triggers`.
      for (const layer of layers) history.execute('layer.add', { slideId: slide.id, layer });
      for (const each of triggers)
        history.execute('trigger.add', { slideId: slide.id, trigger: each });
      const own = slide.baseLayer.objects.filter(
        (object) => object.type !== 'audio' && object.type !== 'zoomRegion',
      );
      history.execute('slide.setQuestion', {
        slideId: slide.id,
        question:
          question.kind === 'freePickOne' || question.kind === 'freePickMany'
            ? {
                ...question,
                choices: own.slice(0, 3).map((object, index) => ({
                  id: createId('choice'),
                  object: object.id,
                  correct: index === c % 3,
                })),
              }
            : question.kind === 'freeDrag' && own.length >= 3
              ? {
                  ...question,
                  targets: [own[2]!.id],
                  items: own.slice(0, 2).map((object, index) => ({
                    id: createId('choice'),
                    object: object.id,
                    target: index === c % 2 ? own[2]!.id : null,
                  })),
                }
              : question,
      });
      return;
    }
    case 'questionEdit': {
      // As Form View changes it: settings, and sometimes a choice object deleted on the stage.
      const quiz = slide?.question
        ? slide
        : project.scenes.flatMap((each) => each.slides).find((each) => each.question);
      if (!quiz?.question) return;
      const question = quiz.question;
      const settings = {
        attempts: step.number % 4 === 0 ? null : (step.number % 10) + 1,
        required: step.number % 3 !== 0,
      };
      history.execute('slide.setQuestion', {
        slideId: quiz.id,
        question: isSurveyQuestion(question)
          ? {
              ...question,
              required: settings.required,
              branch: { answered: step.number % 2 ? null : { kind: 'next' } },
              feedback: { ...question.feedback, by: step.number % 3 ? 'question' : 'none' },
              ...('shuffle' in question ? { shuffle: step.number % 2 === 0 } : {}),
            }
          : isChoiceQuestion(question)
            ? {
                ...question,
                ...settings,
                shuffle: step.number % 2 === 0,
                scoring:
                  step.number % 2
                    ? { by: 'choice' }
                    : { by: 'question', points: step.number % 100 },
              }
            : { ...question, ...settings, scoring: { by: 'question', points: step.number % 100 } },
      });
      // One of its answer parts deleted on the stage, now and then.
      const parts = questionObjects(question).filter(
        (part) => part.role !== 'prompt' && part.role !== 'submit button',
      );
      const victim = parts[c % (parts.length || 1)];
      if (victim && step.number % 5 === 0) {
        history.execute('object.remove', { objectIds: [victim.id] });
      }
      return;
    }
    case 'zoomAdd':
      if (slide) {
        const region = createZoomRegion(project.stage);
        region.timing = { start: step.number % 5, duration: (step.number % 4) + 1 };
        history.execute('object.add', { layerId: slide.baseLayer.id, object: region });
        history.execute('object.update', {
          objectId: region.id,
          changes: { props: { speed: (step.number % 30) / 10 } },
        });
      }
      return;
    case 'markersAdd':
      // The two new objects (P9.1), with the edits the Format panel can make.
      if (slide) {
        const hotspot = createHotspotObject(
          { x: 20, y: 30 },
          step.number % 2 ? 'ellipse' : 'rect',
          step.text || 'Hotspot',
        );
        history.execute('object.add', { layerId: slide.baseLayer.id, object: hotspot });
        const marker = createMarkerObject({ x: 200, y: 120 }, step.text || 'Marker');
        history.execute('object.add', { layerId: slide.baseLayer.id, object: marker });
        history.execute('object.update', {
          objectId: marker.id,
          changes: {
            props: {
              body: step.text,
              opensOn: step.number % 2 ? 'hover' : 'click',
              pulse: step.number % 3 === 0,
            },
          },
        });
      }
      return;
    case 'pathRemove':
      if (object && object.animations.motionPaths.length > 0) {
        // Its triggers must go with it.
        history.execute('object.update', {
          objectId: object.id,
          changes: {
            animations: {
              ...object.animations,
              motionPaths: object.animations.motionPaths.slice(1),
            },
          },
        });
      }
      return;
    case 'videoAdd':
      if (slide) {
        const hash = 'e'.repeat(64);
        history.execute('asset.add', {
          hash,
          meta: {
            kind: 'video',
            fileName: 'v.mp4',
            ext: 'mp4',
            mimeType: 'video/mp4',
            byteLength: 1,
          },
        });
        const length = (step.number % 50) / 5 + 1;
        const video = createVideoObject(hash, length);
        video.props.startOn = (['timeline', 'click', 'trigger'] as const)[step.number % 3]!;
        video.props.trimStart = length / 4;
        history.execute('object.add', { layerId: slide.baseLayer.id, object: video });
        history.execute('trigger.add', {
          slideId: slide.id,
          trigger: {
            id: createId('trigger'),
            owner: { kind: 'object', id: video.id },
            event: { type: 'click', object: video.id },
            action: { type: 'pauseMedia', object: video.id },
            conditions: null,
            otherwise: null,
            enabled: true,
          },
        });
      }
      return;
    case 'tracking':
      history.execute('project.setTracking', {
        tracking: {
          completion:
            step.number % 3 === 0
              ? { kind: 'trigger' }
              : { kind: 'slidesViewed', count: step.number % 3 === 1 ? null : step.number },
          reporting: (
            [
              'completed-incomplete',
              'passed-incomplete',
              'passed-failed',
              'completed-failed',
            ] as const
          )[step.number % 4],
          resume: (['always', 'never', 'prompt'] as const)[step.number % 3],
        },
      });
      return;
    case 'publishSettings':
      history.execute('project.setPublishSettings', {
        settings: {
          target: (['web', 'scorm12', 'scorm2004', 'xapi', 'cmi5'] as const)[step.number % 5],
          scorm2004Edition: ([2, 3, 4] as const)[step.number % 3],
          identifier: step.text,
          zip: step.number % 2 === 0,
        },
      });
      return;
    case 'slideProperties':
      if (slide) {
        history.execute('slide.setProperties', {
          slideId: slide.id,
          properties: {
            advance: step.number % 2 ? 'auto' : 'user',
            onRevisit: (['auto', 'reset', 'resume'] as const)[step.number % 3],
            controls: { next: step.number % 4 !== 0 },
            transition:
              step.number % 5 === 0
                ? null
                : createTransition(transitionKinds[step.number % transitionKinds.length]!),
          },
        });
        // And an overlay's transition, when the slide has one.
        const overlay = slide.layers[0];
        if (overlay) {
          history.execute('layer.setProperties', {
            layerId: overlay.id,
            properties: { transition: step.number % 2 ? createTransition('fade', 0.3) : null },
          });
        }
      }
      return;
    case 'duration':
      if (slide) {
        history.execute('layer.setDuration', {
          layerId: slide.baseLayer.id,
          duration: (step.number % 30) + 1,
        });
      }
      return;
    case 'masterAdd':
      return history.execute('master.add', { master: createSlideMaster(step.text || 'M') });
    case 'masterRemove': {
      // The feedback master stays (P7.5); slide masters can go.
      const master = at(
        project.masters.filter((m) => m.kind === 'slide'),
        a,
      );
      if (master) history.execute('master.remove', { masterId: master.id });
      return;
    }
    case 'layoutSet': {
      if (!slide) return;
      const layouts = project.masters.filter((m) => m.kind === 'slide').flatMap((m) => m.layouts);
      const layout = at(layouts, c);
      history.execute('slide.setLayout', {
        slideId: slide.id,
        layoutId: layout?.id ?? null,
        objects: layout ? placeholdersMissingFrom(layout, slide) : [],
      });
      return;
    }
    case 'objectRemove':
      if (object) history.execute('object.remove', { objectIds: [object.id] });
      return;
    case 'objectUpdate':
      if (object) {
        history.execute('object.update', {
          objectId: object.id,
          changes: { frame: { x: step.number, width: step.number }, locked: step.number % 2 === 0 },
        });
      }
      return;
    case 'objectReorder':
      if (slide && object) {
        history.execute('object.reorder', {
          objectId: object.id,
          index: step.number % slide.baseLayer.objects.length,
        });
      }
      return;
  }
}

describe('undo/redo invariant', () => {
  it('undoing every step restores the original; redoing restores the result', () => {
    fc.assert(
      fc.property(fc.array(stepArbitrary, { maxLength: 40 }), (steps) => {
        const { history } = setupWithTriggers();
        const original = snapshot(history.project);

        for (const step of steps) runStep(history, step);
        const result = snapshot(history.project);
        const depth = history.undoDepth;

        for (let i = 0; i < depth; i++) history.undo();
        expect(history.canUndo).toBe(false);
        expect(history.project).toEqual(original);

        for (let i = 0; i < depth; i++) history.redo();
        expect(history.canRedo).toBe(false);
        expect(history.project).toEqual(result);
        // The redone project is still a loadable document.
        expect(() => parseProject(snapshot(history.project))).not.toThrow();
      }),
      { numRuns: 300 },
    );
    // 300 random edit sequences take about five seconds on their own and longer
    // when other test files share the processor, so the default limit is too tight.
  }, 60_000);
});

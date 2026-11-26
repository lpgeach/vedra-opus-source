import { formatPath, ProjectValidationError } from './errors';
import { branchTargets, feedbackParts, questionObjects, questionPartIds } from './questions';
import type { QuestionObject } from './questions';
import type { ProjectIssue } from './errors';
import { migrateToCurrent } from './migrations';
import { feedbackRoles, projectSchema } from './schema';
import type { Layer, Project, SceneObject, Slide, Trigger } from './schema';
import { allSlides, everySlide, forEachObject, slideLayers } from './traverse';

type Path = (string | number)[];

/**
 * Checks the schema cannot express: ids are unique, and everything that refers
 * to something else by id refers to something that exists.
 */
export function findReferenceIssues(project: Project): ProjectIssue[] {
  const issues: ProjectIssue[] = [];
  const report = (path: Path, message: string) => issues.push({ path: formatPath(path), message });

  // Ids are unique across the whole project, so a reference never needs a scope.
  // State ids are the exception: they are names local to their object.
  const seenIds = new Map<string, string>();
  const claimId = (id: string, path: Path) => {
    const first = seenIds.get(id);
    if (first !== undefined)
      report([...path, 'id'], `duplicate id "${id}" (first used at ${first})`);
    else seenIds.set(id, formatPath(path));
  };

  const checkAsset = (hash: string, path: Path) => {
    if (!(hash in project.assets))
      report(path, `asset ${hash.slice(0, 12)}… is not in the project`);
  };

  const checkObject = (object: SceneObject, path: Path) => {
    claimId(object.id, path);
    const stateIds = new Set<string>();
    object.states.forEach((state, index) => {
      if (stateIds.has(state.id)) {
        report([...path, 'states', index, 'id'], `duplicate state "${state.id}"`);
      }
      stateIds.add(state.id);
      if (state.overrides.asset) {
        checkAsset(state.overrides.asset, [...path, 'states', index, 'overrides', 'asset']);
      }
    });
    if (!stateIds.has('normal')) report([...path, 'states'], 'object has no "normal" state');
    if (!stateIds.has(object.initialState)) {
      report([...path, 'initialState'], `object has no state "${object.initialState}"`);
    }
    if (object.type === 'image' || object.type === 'audio' || object.type === 'panorama') {
      checkAsset(object.props.asset, [...path, 'props', 'asset']);
    }
    const kindOf = (hash: string) =>
      Object.hasOwn(project.assets, hash) ? project.assets[hash]!.kind : undefined;
    if (object.type === 'audio') {
      const kind = kindOf(object.props.asset);
      if (kind && kind !== 'audio') {
        report([...path, 'props', 'asset'], 'an audio object must use an audio asset');
      }
    }
    if (object.type === 'audio' || object.type === 'video') {
      object.props.captions.forEach((cue, index) => {
        claimId(cue.id, [...path, 'props', 'captions', index]);
        if (cue.end > object.props.length + 0.01) {
          report([...path, 'props', 'captions', index, 'end'], 'caption ends after the media does');
        }
      });
    }
    if (object.type === 'dial' && object.props.look?.face) {
      // A dial's face is a picture (B16).
      const at = [...path, 'props', 'look', 'face', 'asset'];
      checkAsset(object.props.look.face.asset, at);
      const kind = kindOf(object.props.look.face.asset);
      if (kind && kind !== 'image') report(at, 'a dial’s face must be a picture');
    }
    if (object.type === 'panorama') {
      // A picture, and spots with ids of their own (P9.10).
      const kind = kindOf(object.props.asset);
      if (kind && kind !== 'image') {
        report([...path, 'props', 'asset'], 'a 360° image must use a picture');
      }
      object.props.spots.forEach((spot, index) => {
        claimId(spot.id, [...path, 'props', 'spots', index]);
      });
    }
    if (object.type === 'table') {
      // One cell per column in every row (P9.9).
      const columns = object.props.columns.length;
      object.props.rows.forEach((row, index) => {
        if (row.cells.length !== columns) {
          report(
            [...path, 'props', 'rows', index, 'cells'],
            `a row needs one cell for each of the ${columns} columns`,
          );
        }
      });
    }
    if (object.drag !== null && path.includes('children')) {
      // Inside a group it moves with the group (P9.7).
      report([...path, 'drag'], 'only an object at the top of a layer can be dragged');
    }
    if (object.type === 'web' && object.props.source.kind === 'folder') {
      // A web folder's start page is one of its files, and each file is the project's (P9.6).
      const { files, entry } = object.props.source;
      if (!(entry in files)) {
        report(
          [...path, 'props', 'source', 'entry'],
          `the start page "${entry}" is not in the folder`,
        );
      }
      for (const [file, hash] of Object.entries(files)) {
        checkAsset(hash, [...path, 'props', 'source', 'files', file]);
      }
    }
    if (object.type === 'slider' || object.type === 'dial') {
      // A slider's or dial's range, step, start and variable (P9.4).
      const { min, max, step, initial, variable } = object.props;
      if (min >= max)
        report([...path, 'props', 'max'], 'the greatest value is not more than the least');
      else if (step > max - min)
        report([...path, 'props', 'step'], 'the step is bigger than the range');
      if (initial < min || initial > max) {
        report([...path, 'props', 'initial'], 'the starting value is outside the range');
      }
      if (variable !== null) {
        const bound = project.variables.find((each) => each.id === variable);
        if (!bound) report([...path, 'props', 'variable'], `no variable with id "${variable}"`);
        else if (bound.type !== 'number') {
          report([...path, 'props', 'variable'], 'a slider or dial binds a number variable');
        }
      }
    }
    if (object.type === 'textEntry') {
      // A data-entry field's variable and limits (P9.2).
      const { variable, numeric, min, max } = object.props;
      if (variable !== null) {
        const bound = project.variables.find((each) => each.id === variable);
        const wanted = numeric ? 'number' : 'text';
        if (!bound) report([...path, 'props', 'variable'], `no variable with id "${variable}"`);
        else if (bound.type !== wanted) {
          report(
            [...path, 'props', 'variable'],
            `a ${numeric ? 'numeric' : 'text'} field binds a ${wanted} variable`,
          );
        }
      }
      if (!numeric && (min !== null || max !== null)) {
        report([...path, 'props', 'min'], 'only a numeric field has a least or greatest value');
      }
      if (min !== null && max !== null && min > max) {
        report([...path, 'props', 'max'], 'the greatest value is less than the least');
      }
    }
    if (object.type === 'marker') {
      // A marker's label: a picture or video, and a sound (P9.1).
      const { media, audio } = object.props;
      if (media !== null) {
        checkAsset(media, [...path, 'props', 'media']);
        const kind = kindOf(media);
        if (kind && kind !== 'image' && kind !== 'video') {
          report([...path, 'props', 'media'], "a marker's media is a picture or a video");
        }
      }
      if (audio !== null) {
        checkAsset(audio, [...path, 'props', 'audio']);
        const kind = kindOf(audio);
        if (kind && kind !== 'audio')
          report([...path, 'props', 'audio'], "a marker's sound is audio");
      }
    }
    if (object.type === 'video') {
      checkAsset(object.props.asset, [...path, 'props', 'asset']);
      const kind = kindOf(object.props.asset);
      if (kind && kind !== 'video') {
        report([...path, 'props', 'asset'], 'a video object must use a video asset');
      }
      if (object.props.poster !== null) {
        checkAsset(object.props.poster, [...path, 'props', 'poster']);
        const posterKind = kindOf(object.props.poster);
        if (posterKind && posterKind !== 'image') {
          report([...path, 'props', 'poster'], 'a poster must be a picture');
        }
      }
    }
    const { animations } = object;
    animations.motionPaths.forEach((motion, index) => {
      claimId(motion.id, [...path, 'animations', 'motionPaths', index]);
    });
    const hasText =
      object.type === 'text' ||
      object.type === 'button' ||
      (object.type === 'shape' && object.props.text !== null);
    for (const phase of ['entrance', 'exit'] as const) {
      if (animations[phase]?.byParagraph && !hasText) {
        report([...path, 'animations', phase, 'byParagraph'], 'only text can animate by paragraph');
      }
    }
    if (
      object.type === 'zoomRegion' &&
      (animations.entrance || animations.exit || animations.motionPaths.length > 0)
    ) {
      report([...path, 'animations'], 'a zoom region cannot have animations');
    }
    if (object.type === 'group') {
      object.children.forEach((child, index) => {
        if (child.type === 'zoomRegion') {
          report([...path, 'children', index, 'type'], 'a zoom region cannot be in a group');
        }
      });
    }
    if (object.type === 'shape' || object.type === 'button') {
      const { fill } = object.props.appearance;
      if (fill.kind === 'image') {
        checkAsset(fill.asset, [...path, 'props', 'appearance', 'fill', 'asset']);
      }
    }
  };

  const checkLayer = (layer: Layer, path: Path) => {
    claimId(layer.id, path);
    forEachObject(layer.objects, checkObject, [...path, 'objects']);
    layer.timeline.cuePoints.forEach((cue, index) => {
      claimId(cue.id, [...path, 'timeline', 'cuePoints', index]);
      if (cue.time > layer.timeline.duration) {
        report(
          [...path, 'timeline', 'cuePoints', index, 'time'],
          'cue point is after the end of the timeline',
        );
      }
    });
  };

  claimId(project.id, []);
  /** Only overlay layers are shown and hidden, so only they can have a transition. */
  const noTransition = (layer: Layer, path: Path) => {
    if (layer.properties.transition !== null) {
      report([...path, 'properties', 'transition'], 'only an overlay layer can have a transition');
    }
  };

  const layoutIds = new Set<string>();
  // One feedback master, with one layout for each result (P7.5).
  const feedbackMasters = project.masters.filter((master) => master.kind === 'feedback');
  if (feedbackMasters.length !== 1) {
    report(['masters'], 'a project has exactly one feedback master');
  }
  project.masters.forEach((master, masterIndex) => {
    const masterPath: Path = ['masters', masterIndex];
    claimId(master.id, masterPath);
    const roles = master.layouts.map((layout) => layout.role);
    if (master.kind === 'feedback') {
      if (
        roles.length !== feedbackRoles.length ||
        !feedbackRoles.every((role) => roles.includes(role))
      ) {
        report([...masterPath, 'layouts'], 'the feedback master has one layout for each result');
      }
    } else if (roles.some((role) => role !== null)) {
      report([...masterPath, 'layouts'], 'only the feedback master’s layouts have results');
    }
    checkLayer(master.layer, [...masterPath, 'layer']);
    noTransition(master.layer, [...masterPath, 'layer']);
    master.layouts.forEach((layout, layoutIndex) => {
      const layoutPath: Path = [...masterPath, 'layouts', layoutIndex];
      claimId(layout.id, layoutPath);
      // Slides are laid out on slide masters only.
      if (master.kind === 'slide') layoutIds.add(layout.id);
      checkLayer(layout.layer, [...layoutPath, 'layer']);
      noTransition(layout.layer, [...layoutPath, 'layer']);
    });
  });

  const variableIds = new Set<string>();
  const variableNames = new Map<string, number>();
  project.variables.forEach((variable, index) => {
    claimId(variable.id, ['variables', index]);
    variableIds.add(variable.id);
    const key = variable.name.toLowerCase();
    if (variableNames.has(key)) {
      report(['variables', index, 'name'], `duplicate variable name "${variable.name}"`);
    }
    variableNames.set(key, index);
  });

  project.scenes.forEach((scene, index) => claimId(scene.id, ['scenes', index]));
  project.banks.forEach((bank, index) => claimId(bank.id, ['banks', index]));
  // Every slide is checked, the banks' too (P7.6); jumps can only go to the scenes' slides.
  const slides = everySlide(project);
  const slideIds = new Set(allSlides(project).map(({ slide }) => slide.id));
  // The player's tabs (P8.2): ids claimed, files kept with the course.
  const { tabs } = project.player;
  const tabIds = new Set(tabs.custom.map((tab) => tab.id));
  const fileAssets = new Set(
    Object.entries(project.assets)
      .filter(([, meta]) => meta.kind === 'file' || meta.kind === 'image')
      .map(([hash]) => hash),
  );
  const lightboxSlides = new Set(
    project.scenes.flatMap((scene) => scene.slides.filter((s) => !s.draw).map((s) => s.id)),
  );
  tabs.custom.forEach((tab, index) => {
    claimId(tab.id, ['player', 'tabs', 'custom', index]);
    if (tab.lightbox && !lightboxSlides.has(tab.lightbox.slide)) {
      report(
        ['player', 'tabs', 'custom', index, 'lightbox', 'slide'],
        `a lightbox is a slide of the course, not a draw: "${tab.lightbox.slide}"`,
      );
    }
  });
  tabs.resources.items.forEach((item, index) => {
    const at: Path = ['player', 'tabs', 'resources', 'items', index];
    claimId(item.id, at);
    if (item.target.kind === 'file') checkAsset(item.target.asset, [...at, 'target', 'asset']);
  });
  tabs.glossary.terms.forEach((term, index) =>
    claimId(term.id, ['player', 'tabs', 'glossary', 'terms', index]),
  );
  const bankSlides = new Map(
    project.banks.map((bank) => [bank.id, new Set(bank.slides.map((slide) => slide.id))]),
  );
  // Result slides (P7.7): what they include, no cycles, one role per slide.
  const sceneSlides = new Map(allSlides(project).map(({ slide }) => [slide.id, slide]));
  const includes = (slide: Slide): string[] =>
    slide.result?.include.kind === 'chosen' ? slide.result.include.slides : [];
  for (const { slide, path } of slides) {
    // A slide's background picture (B17).
    const background = slide.properties.background;
    if (background?.kind === 'image') {
      const at = [...path, 'properties', 'background', 'asset'];
      checkAsset(background.asset, at);
      const meta = Object.hasOwn(project.assets, background.asset)
        ? project.assets[background.asset]
        : undefined;
      if (meta && meta.kind !== 'image') report(at, 'a slide’s background must be a picture');
    }
    const roles = [slide.question, slide.draw, slide.result].filter((each) => each !== null);
    if (roles.length > 1) report(path, 'a slide is at most one of a question, a draw and a result');
    if (!slide.result) continue;
    if (path[0] === 'banks') report([...path, 'result'], 'a result slide belongs in a scene');
    for (const id of includes(slide)) {
      const named = sceneSlides.get(id);
      if (id === slide.id) report([...path, 'result', 'include'], 'a result cannot include itself');
      else if (!named || !(named.question || named.draw || named.result)) {
        report([...path, 'result', 'include'], `"${id}" is not a question, draw or result slide`);
      }
    }
    for (const layer of [slide.result.layers.passed, slide.result.layers.failed]) {
      if (layer !== null && !slide.layers.some((each) => each.id === layer)) {
        report([...path, 'result', 'layers'], `no overlay layer with id "${layer}" on the slide`);
      }
    }
    // A cycle: following includes from this slide comes back to it.
    const seen = new Set<string>();
    const walk = (id: string): boolean => {
      if (id === slide.id && seen.size > 0) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      const next = sceneSlides.get(id);
      return next ? includes(next).some(walk) : false;
    };
    if (walk(slide.id)) report([...path, 'result', 'include'], 'result slides include each other');
  }
  // The player's menu entries name scene slides; its logo is a picture (P8.1).
  for (const id of Object.keys(project.player.menu.entries)) {
    if (!sceneSlides.has(id)) {
      report(
        ['player', 'menu', 'entries', id],
        `a menu entry names no slide of the course: "${id}"`,
      );
    }
  }
  const logo = project.player.logo;
  if (logo !== null && project.assets[logo]?.kind !== 'image') {
    report(['player', 'logo'], 'the logo is a picture of the course');
  }
  const completion = project.tracking.completion;
  if (completion.kind === 'result') {
    const tracked = sceneSlides.get(completion.slide);
    if (tracked?.result?.kind !== 'graded') {
      report(['tracking', 'completion'], 'completion by result names a graded result slide');
    }
  }
  for (const { slide, path } of slides) {
    const inBank = path[0] === 'banks';
    if (inBank && !slide.question) report(path, 'a question bank holds question slides only');
    if (slide.draw) {
      if (inBank) report([...path, 'draw'], 'a draw slide belongs in a scene, not a bank');
      if (slide.question) report([...path, 'draw'], 'a draw slide is not a question itself');
      const bank = slide.draw.bank === null ? undefined : bankSlides.get(slide.draw.bank);
      if (slide.draw.bank !== null && !bank) {
        report([...path, 'draw', 'bank'], `no question bank with id "${slide.draw.bank}"`);
      }
      for (const id of slide.draw.locked) {
        if (!bank?.has(id)) {
          report(
            [...path, 'draw', 'locked'],
            `a locked question "${id}" is not in the draw's bank`,
          );
        }
      }
    }
  }

  for (const { slide, path } of slides) {
    claimId(slide.id, path);
    if (slide.layoutId !== null && !layoutIds.has(slide.layoutId)) {
      report([...path, 'layoutId'], `no layout with id "${slide.layoutId}"`);
    }
    for (const { layer, path: layerPath } of slideLayers(slide)) {
      checkLayer(layer, [...path, ...layerPath]);
    }
    noTransition(slide.baseLayer, [...path, 'baseLayer']);
    if (slide.question) checkQuestion(slide, [...path, 'question'], claimId, report);
    // Where a question branches to: a slide of the course (the Phase 7 review).
    for (const target of slide.question ? branchTargets(slide.question) : []) {
      if (!slideIds.has(target)) {
        report(
          [...path, 'question', 'branch'],
          `a branch goes to no slide of the course: "${target}"`,
        );
      }
    }
    // The Tab order names the slide's own objects, each once (P10.1).
    if (slide.properties.focusOrder) {
      const here = new Set<string>();
      for (const { layer } of slideLayers(slide)) {
        forEachObject(layer.objects, (object) => here.add(object.id));
      }
      const seen = new Set<string>();
      slide.properties.focusOrder.forEach((id, index) => {
        const at: Path = [...path, 'properties', 'focusOrder', index];
        if (!here.has(id)) report(at, `no object with id "${id}" on this slide`);
        else if (seen.has(id)) report(at, `"${id}" is in the Tab order twice`);
        seen.add(id);
      });
    }
    slide.triggers.forEach((trigger, index) => {
      const triggerPath: Path = [...path, 'triggers', index];
      claimId(trigger.id, triggerPath);
      checkTrigger(
        trigger,
        slide,
        triggerPath,
        { slideIds, variableIds, tabIds, lightboxSlides, fileAssets },
        report,
      );
    });
  }

  return issues;
}

/**
 * A question's parts are objects of the right type on its slide's own base
 * layer, each used once (docs/briefs/P7.1-question-model.md).
 */
function checkQuestion(
  slide: Slide,
  path: Path,
  claimId: (id: string, path: Path) => void,
  report: (path: Path, message: string) => void,
): void {
  const question = slide.question!;
  const onBase = new Map(slide.baseLayer.objects.map((object) => [object.id, object]));
  const used = new Set<string>();
  const need = (id: string, type: QuestionObject['type'], at: Path, what: string) => {
    const object = onBase.get(id);
    if (!object) report(at, `no ${what} with id "${id}" on the slide's base layer`);
    else if (type === 'onStage') {
      // Freeform parts (P7.4): anything the learner can see and click.
      if (object.type === 'audio' || object.type === 'zoomRegion') {
        report(at, `the ${what} must be an object the learner can see on the stage`);
      }
    } else if (object.type !== type) report(at, `the ${what} must be a ${type} object`);
    if (used.has(id)) report(at, `object "${id}" is used twice in the question`);
    used.add(id);
  };
  for (const part of questionObjects(question)) {
    need(part.id, part.type, [...path, part.role], part.role);
  }
  for (const id of questionPartIds(question)) claimId(id, [...path, 'parts']);
  // Feedback layers (P7.5): overlays of this slide; the message a text, the button a button, on it.
  for (const { role, part } of feedbackParts(question)) {
    const at: Path = [...path, 'feedback', role];
    const layer = slide.layers.find((each) => each.id === part.layer);
    if (!layer) {
      report(at, `no overlay layer with id "${part.layer}" on the slide`);
      continue;
    }
    const on = (id: string, type: SceneObject['type'], what: string) => {
      const object = layer.objects.find((each) => each.id === id);
      if (!object) report(at, `the ${what} is not on the ${role} feedback layer`);
      else if (object.type !== type) report(at, `the ${what} must be a ${type} object`);
    };
    if (part.message) on(part.message, 'text', 'message');
    if (part.button) on(part.button, 'button', 'button');
  }
}

/** Triggers may only refer to things on their own slide, plus variables and other slides. */
function checkTrigger(
  trigger: Trigger,
  slide: Slide,
  path: Path,
  project: {
    slideIds: Set<string>;
    variableIds: Set<string>;
    tabIds: Set<string>;
    /** Scene slides that can be lightboxes: not draw slides (P8.4). */
    lightboxSlides: Set<string>;
    /** Assets an `openFile` action may open: files and pictures (P8.6). */
    fileAssets: Set<string>;
  },
  report: (path: Path, message: string) => void,
): void {
  const layers = new Map<string, Layer>();
  const objects = new Map<string, SceneObject>();
  for (const { layer } of slideLayers(slide)) {
    layers.set(layer.id, layer);
    forEachObject(layer.objects, (object) => objects.set(object.id, object));
  }

  const needObject = (id: string, at: Path) => {
    if (!objects.has(id)) report(at, `no object with id "${id}" on this slide`);
  };
  const needLayer = (id: string, at: Path) => {
    if (!layers.has(id)) report(at, `no layer with id "${id}" on this slide`);
  };
  const needVariable = (id: string, at: Path) => {
    if (!project.variableIds.has(id)) report(at, `no variable with id "${id}"`);
  };
  const needAudio = (id: string, at: Path) => {
    needObject(id, at);
    const object = objects.get(id);
    if (object && object.type !== 'audio' && object.type !== 'video') {
      report(at, `object "${object.name}" is not audio or video`);
    }
  };
  const needPath = (objectId: string, pathId: string, at: Path) => {
    const object = objects.get(objectId);
    if (object && !object.animations.motionPaths.some((motion) => motion.id === pathId)) {
      report(at, `object "${object.name}" has no motion path "${pathId}"`);
    }
  };
  const needState = (objectId: string, stateId: string, at: Path) => {
    const object = objects.get(objectId);
    if (object && !object.states.some((state) => state.id === stateId)) {
      report(at, `object "${object.name}" has no state "${stateId}"`);
    }
  };

  const { owner, event } = trigger;
  const ownerPath: Path = [...path, 'owner', 'id'];
  if (owner.kind === 'object') needObject(owner.id, ownerPath);
  else if (owner.kind === 'layer') needLayer(owner.id, ownerPath);
  else if (owner.id !== slide.id)
    report(ownerPath, 'a slide-owned trigger must be owned by its own slide');

  const eventPath: Path = [...path, 'event'];
  switch (event.type) {
    case 'keyPress':
      break;
    case 'playerTab':
      if (!project.tabIds.has(event.tab))
        report([...eventPath, 'tab'], `no custom player tab "${event.tab}"`);
      break;
    case 'timelineStart':
    case 'timelineEnd':
    case 'timelineReaches':
      needLayer(event.layer, [...eventPath, 'layer']);
      break;
    case 'cuePoint': {
      needLayer(event.layer, [...eventPath, 'layer']);
      const layer = layers.get(event.layer);
      if (layer && !layer.timeline.cuePoints.some((cue) => cue.id === event.cuePoint)) {
        report(
          [...eventPath, 'cuePoint'],
          `no cue point with id "${event.cuePoint}" on that layer`,
        );
      }
      break;
    }
    case 'stateChange':
      needObject(event.object, [...eventPath, 'object']);
      needState(event.object, event.state, [...eventPath, 'state']);
      break;
    case 'variableChange':
      needVariable(event.variable, [...eventPath, 'variable']);
      break;
    case 'mediaCompletes':
      needAudio(event.object, [...eventPath, 'object']);
      break;
    case 'draggedOver':
    case 'droppedOn':
      needObject(event.object, [...eventPath, 'object']);
      needObject(event.target, [...eventPath, 'target']);
      break;
    case 'intersects':
    case 'stopsIntersecting':
      needObject(event.object, [...eventPath, 'object']);
      needObject(event.other, [...eventPath, 'other']);
      break;
    case 'spotClicked':
    case 'panoramaVisited': {
      needObject(event.object, [...eventPath, 'object']);
      const panorama = objects.get(event.object);
      if (panorama && panorama.type !== 'panorama') {
        report([...eventPath, 'object'], `"${panorama.name}" is not a 360° image`);
      } else if (
        panorama?.type === 'panorama' &&
        event.type === 'spotClicked' &&
        !panorama.props.spots.some((spot) => spot.id === event.spot)
      ) {
        report([...eventPath, 'spot'], `"${panorama.name}" has no spot with id "${event.spot}"`);
      }
      break;
    }
    case 'controlMoves': {
      needObject(event.object, [...eventPath, 'object']);
      const control = objects.get(event.object);
      if (control && control.type !== 'slider' && control.type !== 'dial') {
        report([...eventPath, 'object'], `"${control.name}" is not a slider or dial`);
      }
      break;
    }
    case 'controlLosesFocus': {
      needObject(event.object, [...eventPath, 'object']);
      const control = objects.get(event.object);
      if (control && control.type !== 'textEntry' && control.type !== 'dropdown') {
        report([...eventPath, 'object'], `"${control.name}" is not a text entry or dropdown`);
      }
      break;
    }
    case 'animationCompletes': {
      needObject(event.object, [...eventPath, 'object']);
      const { animation } = event;
      const object = objects.get(event.object);
      if (animation.kind === 'path') {
        needPath(event.object, animation.path, [...eventPath, 'animation', 'path']);
      } else if (object && object.animations[animation.kind] === null) {
        report(
          [...eventPath, 'animation', 'kind'],
          `object "${object.name}" has no ${animation.kind} animation`,
        );
      }
      break;
    }
    default:
      needObject(event.object, [...eventPath, 'object']);
  }

  const checkAction = (action: Trigger['action'], actionPath: Path) => {
    switch (action.type) {
      case 'changeState':
        needObject(action.object, [...actionPath, 'object']);
        needState(action.object, action.state, [...actionPath, 'state']);
        break;
      case 'showLayer':
      case 'hideLayer':
      case 'pauseTimeline':
      case 'resumeTimeline':
      case 'seekTimeline':
        needLayer(action.layer, [...actionPath, 'layer']);
        break;
      case 'setFocus':
        needObject(action.object, [...actionPath, 'object']);
        break;
      case 'openFile':
        if (!project.fileAssets.has(action.asset)) {
          report([...actionPath, 'asset'], 'opens a file or picture of the course');
        }
        break;
      case 'openLightbox':
        if (!project.lightboxSlides.has(action.slide)) {
          report(
            [...actionPath, 'slide'],
            `a lightbox is a slide of the course, not a draw: "${action.slide}"`,
          );
        }
        break;
      case 'jumpToSlide':
        if (action.target.kind === 'slide' && !project.slideIds.has(action.target.slide)) {
          report([...actionPath, 'target', 'slide'], `no slide with id "${action.target.slide}"`);
        }
        break;
      case 'setVariable':
        needVariable(action.variable, [...actionPath, 'variable']);
        if (action.operand.kind === 'variable') {
          needVariable(action.operand.variable, [...actionPath, 'operand', 'variable']);
        }
        break;
      case 'toggleVariable':
        needVariable(action.variable, [...actionPath, 'variable']);
        break;
      case 'playMedia':
      case 'pauseMedia':
      case 'stopMedia':
        needAudio(action.object, [...actionPath, 'object']);
        break;
      case 'moveAlongPath':
        needObject(action.object, [...actionPath, 'object']);
        needPath(action.object, action.path, [...actionPath, 'path']);
        break;
      case 'openUrl':
      case 'executeJavaScript':
        break;
    }
  };
  checkAction(trigger.action, [...path, 'action']);
  if (trigger.otherwise) checkAction(trigger.otherwise, [...path, 'otherwise']);

  trigger.conditions?.items.forEach((condition, index) => {
    const conditionPath: Path = [...path, 'conditions', 'items', index];
    if (condition.subject === 'variable') {
      needVariable(condition.variable, [...conditionPath, 'variable']);
      if (condition.value.kind === 'variable') {
        needVariable(condition.value.variable, [...conditionPath, 'value', 'variable']);
      }
    } else {
      needObject(condition.object, [...conditionPath, 'object']);
      needState(condition.object, condition.state, [...conditionPath, 'state']);
    }
  });
}

/**
 * Turn the parsed contents of a project.json — of any supported format
 * version — into a valid current-format Project, or throw
 * ProjectValidationError listing what is wrong and where.
 */
export function parseProject(raw: unknown): Project {
  const migrated = migrateToCurrent(raw);
  const result = projectSchema.safeParse(migrated);
  if (!result.success) {
    throw new ProjectValidationError(
      result.error.issues.map((issue) => ({
        path: formatPath(issue.path),
        message: issue.message,
      })),
    );
  }
  const referenceIssues = findReferenceIssues(result.data);
  if (referenceIssues.length > 0) throw new ProjectValidationError(referenceIssues);
  return result.data;
}

/** The text of project.json for a project. */
export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}

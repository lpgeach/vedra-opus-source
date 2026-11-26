import { ProjectValidationError } from './errors';
import { createId } from './ids';
import { V17_FEEDBACK_MASTER } from './migration-v17-data';
import { FORMAT_VERSION } from './schema';

type RawDocument = Record<string, unknown>;

/**
 * migrations[n] upgrades a document from format version n to n + 1. Entries
 * are never edited or removed once released; they receive untyped data because
 * the old shapes no longer exist as types.
 */
const migrations: Record<number, (doc: RawDocument) => RawDocument> = {
  // v0 was the pre-release shape, which kept the stage size as two top-level fields.
  0: (doc) => {
    const { slideWidth, slideHeight, ...rest } = doc;
    return { ...rest, stage: { width: slideWidth, height: slideHeight } };
  },
  // v2 added `placeholder` to text boxes; every existing one is an ordinary text box.
  1: (doc) => {
    const fixObjects = (objects: unknown): void => {
      if (!Array.isArray(objects)) return;
      for (const object of objects) {
        if (!isRecord(object)) continue;
        if (object['type'] === 'text' && isRecord(object['props'])) {
          object['props']['placeholder'] ??= null;
        }
        fixObjects(object['children']);
      }
    };
    const fixLayer = (layer: unknown): void => {
      if (isRecord(layer)) fixObjects(layer['objects']);
    };
    const copy = structuredCloneJson(doc);
    const scenes = Array.isArray(copy['scenes']) ? copy['scenes'] : [];
    for (const scene of scenes) {
      if (!isRecord(scene) || !Array.isArray(scene['slides'])) continue;
      for (const slide of scene['slides']) {
        if (!isRecord(slide)) continue;
        fixLayer(slide['baseLayer']);
        if (Array.isArray(slide['layers'])) slide['layers'].forEach(fixLayer);
      }
    }
    const masters = Array.isArray(copy['masters']) ? copy['masters'] : [];
    for (const master of masters) {
      if (!isRecord(master)) continue;
      fixLayer(master['layer']);
      if (Array.isArray(master['layouts'])) {
        for (const layout of master['layouts']) if (isRecord(layout)) fixLayer(layout['layer']);
      }
    }
    return copy;
  },
  // v4 added how the course reports to an LMS, with the defaults a new project gets.
  // v8 added captions to audio and video objects: none yet on any of them.
  // v14 added more kinds of question and two input objects: nothing to change.
  // v38 (docs/briefs/B12-storyline-leftovers.md) added the ignore-case comparisons: a v37 file is valid as it is.
  39: (doc) => {
    // v40 (docs/briefs/B16-dial-looks-and-paths.md): a dial may be drawn its own way; every
    // older one is drawn as ours, as before.
    const copy = structuredCloneJson(doc);
    eachSavedObjectV27(copy, (object) => {
      if (object['type'] === 'dial' && isRecord(object['props'])) object['props']['look'] ??= null;
    });
    return copy;
  },
  // v39 (docs/briefs/B13-path-shapes.md) added path shapes: a v38 file is valid as it is.
  38: (doc) => structuredCloneJson(doc),
  37: (doc) => structuredCloneJson(doc),
  36: (doc) => {
    // v37 (docs/briefs/B11-drag-and-retry-options.md): drag-and-drop questions may keep one
    // item on each target and hold their drop states until Submit, and a result may retry
    // only the wrong answers. Older projects do none of these, as before.
    const copy = structuredCloneJson(doc);
    for (const key of ['scenes', 'banks']) {
      const groups = copy[key];
      if (!Array.isArray(groups)) continue;
      for (const group of groups) {
        const slides = isRecord(group) && Array.isArray(group['slides']) ? group['slides'] : [];
        for (const slide of slides) {
          if (!isRecord(slide)) continue;
          const question = slide['question'];
          if (isRecord(question) && question['kind'] === 'freeDrag') {
            question['onePerTarget'] ??= false;
            question['dropStatesAfterSubmit'] ??= false;
          }
          if (isRecord(slide['result'])) slide['result']['retryIncorrectOnly'] ??= false;
        }
      }
    }
    return copy;
  },
  35: (doc) => {
    // v36 (docs/briefs/B8-group-member-animations.md): a group's members keep their own timing
    // and animations. Until now a member's timing was ignored and it showed whenever its group
    // did, so each member of an older project spans the whole timeline, and plays as it did.
    const copy = structuredCloneJson(doc);
    eachSavedObjectV27(copy, (object) => {
      if (object['type'] !== 'group' || !Array.isArray(object['children'])) return;
      for (const child of object['children']) {
        if (isRecord(child)) child['timing'] = { start: 0, duration: 'untilEnd' };
      }
    });
    return copy;
  },
  34: (doc) => {
    // v35 (docs/briefs/P10.1-accessibility.md): slides may set a Tab order; none do yet.
    const copy = structuredCloneJson(doc);
    for (const key of ['scenes', 'banks']) {
      const groups = copy[key];
      if (!Array.isArray(groups)) continue;
      for (const group of groups) {
        const slides = isRecord(group) && Array.isArray(group['slides']) ? group['slides'] : [];
        for (const slide of slides) {
          if (isRecord(slide) && isRecord(slide['properties'])) {
            slide['properties']['focusOrder'] ??= null;
          }
        }
      }
    }
    return copy;
  },
  // v34 (docs/briefs/P9.10-panoramas.md) added 360° images and their spot events: a v33 file is valid as it is.
  33: (doc) => structuredCloneJson(doc),
  // v33 (docs/briefs/P9.9-tables.md) added table objects: a v32 file is valid as it is.
  32: (doc) => structuredCloneJson(doc),
  // v32 (docs/briefs/P9.8-icons-library.md) added graphic objects: a v31 file is valid as it is.
  31: (doc) => structuredCloneJson(doc),
  30: (doc) => {
    // v31 (docs/briefs/P9.7-drag-intersections.md): objects may be draggable; none are yet.
    const copy = structuredCloneJson(doc);
    eachSavedObjectV27(copy, (object) => {
      object['drag'] ??= null;
    });
    return copy;
  },
  // v30 (docs/briefs/P9.6-web-objects.md) added web objects: a v29 file is valid as it is.
  29: (doc) => structuredCloneJson(doc),
  28: (doc) => {
    // v29 (docs/briefs/P9.5-scrolling-panels.md): a group may scroll; none does yet.
    const copy = structuredCloneJson(doc);
    eachSavedObjectV27(copy, (object) => {
      if (object['type'] === 'group') object['scroll'] ??= null;
    });
    return copy;
  },
  // v28 (docs/briefs/P9.4-sliders-dials.md) added two object types: a v27 file is valid as it is.
  27: (doc) => structuredCloneJson(doc),
  26: (doc) => {
    // v27 (docs/briefs/P9.2-data-entry.md): text entries may be bound to a variable; none are yet.
    const copy = structuredCloneJson(doc);
    eachSavedObjectV27(copy, (object) => {
      const props = object['props'];
      if (object['type'] !== 'textEntry' || !isRecord(props)) return;
      props['variable'] ??= null;
      props['min'] ??= null;
      props['max'] ??= null;
    });
    return copy;
  },
  // v26 (docs/briefs/P9.1-hotspots-markers.md) added two object types: a v25 file is valid as it is.
  25: (doc) => structuredCloneJson(doc),
  // v25 (docs/briefs/P8.6-course-actions.md) added actions: a v24 file is valid as it is.
  24: (doc) => structuredCloneJson(doc),
  // v24 (docs/briefs/P8.5-responsive.md) added label words: a v23 file is valid as it is.
  23: (doc) => structuredCloneJson(doc),
  22: (doc) => {
    // v23 (docs/briefs/P8.4-lightbox.md): custom tabs can open a lightbox; existing ones run triggers.
    const copy = structuredCloneJson(doc);
    const player = copy['player'] as Record<string, unknown> | undefined;
    const tabs = player?.['tabs'] as Record<string, unknown> | undefined;
    const custom = tabs?.['custom'];
    if (Array.isArray(custom)) {
      for (const tab of custom) {
        if (tab && typeof tab === 'object') (tab as Record<string, unknown>)['lightbox'] ??= null;
      }
    }
    return copy;
  },
  21: (doc) => {
    // v22 (docs/briefs/P8.3-player-appearance.md): the player's look and words, as before.
    const copy = structuredCloneJson(doc);
    const player = copy['player'];
    if (player && typeof player === 'object' && !Array.isArray(player)) {
      const record = player as Record<string, unknown>;
      record['look'] ??= {
        scheme: 'dark',
        accent: '#2f6fed',
        font: 'system',
        controlsAt: 'bottom',
        menuSide: 'left',
      };
      record['labels'] ??= { language: 'en', words: {} };
    }
    return copy;
  },
  20: (doc) => {
    // v21 (docs/briefs/P8.2-player-tabs.md): the player's tabs, all shown and none filled.
    const copy = structuredCloneJson(doc);
    const player = copy['player'];
    if (player && typeof player === 'object' && !Array.isArray(player)) {
      (player as Record<string, unknown>)['tabs'] ??= {
        resources: { show: true, items: [] },
        glossary: { show: true, terms: [] },
        notes: { show: true },
        custom: [],
      };
    }
    return copy;
  },
  19: (doc) => {
    // v20 (docs/briefs/P8.1-player-frame.md): the player frame, as a new course has it.
    const copy = structuredCloneJson(doc);
    copy['player'] ??= {
      title: true,
      logo: null,
      menu: { show: true, navigation: 'free', entries: {} },
      controls: {
        seekbar: 'view',
        submit: false,
        volume: true,
        captions: true,
        speed: true,
        fullscreen: true,
        accessibility: true,
      },
    };
    return copy;
  },
  18: (doc) => {
    // v19 (docs/briefs/P7.7-result-slides.md): result slides; none yet.
    const copy = structuredCloneJson(doc);
    for (const scene of [
      ...(Array.isArray(copy['scenes']) ? copy['scenes'] : []),
      ...(Array.isArray(copy['banks']) ? copy['banks'] : []),
    ]) {
      if (!isRecord(scene) || !Array.isArray(scene['slides'])) continue;
      for (const slide of scene['slides']) if (isRecord(slide)) slide['result'] ??= null;
    }
    return copy;
  },
  17: (doc) => {
    // v18 (docs/briefs/P7.6-banks-and-draws.md): question banks, and draw slides; none yet.
    const copy = structuredCloneJson(doc);
    copy['banks'] ??= [];
    for (const scene of Array.isArray(copy['scenes']) ? copy['scenes'] : []) {
      if (!isRecord(scene) || !Array.isArray(scene['slides'])) continue;
      for (const slide of scene['slides']) if (isRecord(slide)) slide['draw'] ??= null;
    }
    return copy;
  },
  16: (doc) => {
    // v17 (docs/briefs/P7.5-feedback.md): masters have a kind and layouts a role; the
    // project gains the default feedback master; a question's feedback words move
    // onto feedback layers made from it.
    const copy = structuredCloneJson(doc);
    const masters = Array.isArray(copy['masters']) ? copy['masters'] : [];
    for (const master of masters) {
      if (!isRecord(master)) continue;
      master['kind'] ??= 'slide';
      for (const layout of Array.isArray(master['layouts']) ? master['layouts'] : []) {
        if (isRecord(layout)) layout['role'] ??= null;
      }
    }
    const stage = isRecord(copy['stage']) ? copy['stage'] : {};
    const width = typeof stage['width'] === 'number' ? stage['width'] : 1280;
    const height = typeof stage['height'] === 'number' ? stage['height'] : 720;
    const feedback = v17FeedbackMaster(width, height);
    masters.push(feedback);
    copy['masters'] = masters;
    for (const scene of Array.isArray(copy['scenes']) ? copy['scenes'] : []) {
      if (!isRecord(scene) || !Array.isArray(scene['slides'])) continue;
      for (const slide of scene['slides']) {
        if (isRecord(slide)) v17FeedbackLayers(slide, feedback);
      }
    }
    return copy;
  },
  15: (doc) => doc,
  14: (doc) => {
    // v15: a text entry may take several lines (an essay); every one so far took one.
    const copy = structuredCloneJson(doc);
    eachSavedObject(copy, (object) => {
      const props = object['props'];
      if (object['type'] === 'textEntry' && isRecord(props)) props['multiline'] ??= false;
    });
    return copy;
  },
  13: (doc) => doc,
  12: (doc) => {
    // v13: a slide may be a question; none was.
    const copy = structuredCloneJson(doc);
    for (const scene of Array.isArray(copy['scenes']) ? copy['scenes'] : []) {
      if (!isRecord(scene) || !Array.isArray(scene['slides'])) continue;
      for (const slide of scene['slides']) if (isRecord(slide)) slide['question'] ??= null;
    }
    return copy;
  },
  11: (doc) => {
    // v12: sounds remember the text they were spoken from; none were.
    const copy = structuredCloneJson(doc);
    eachSavedObject(copy, (object) => {
      if (object['type'] === 'audio' && isRecord(object['props'])) {
        object['props']['speech'] ??= null;
      }
    });
    return copy;
  },
  // v11 added zoom regions: nothing to change.
  10: (doc) => doc,
  9: (doc) => {
    // v10: slides and layers get transitions; none had any before.
    const copy = structuredCloneJson(doc);
    const layer = (value: unknown) => {
      if (isRecord(value) && isRecord(value['properties'])) {
        value['properties']['transition'] ??= null;
      }
    };
    for (const scene of Array.isArray(copy['scenes']) ? copy['scenes'] : []) {
      if (!isRecord(scene) || !Array.isArray(scene['slides'])) continue;
      for (const slide of scene['slides']) {
        if (!isRecord(slide)) continue;
        if (isRecord(slide['properties'])) slide['properties']['transition'] ??= null;
        layer(slide['baseLayer']);
        for (const each of Array.isArray(slide['layers']) ? slide['layers'] : []) layer(each);
      }
    }
    for (const master of Array.isArray(copy['masters']) ? copy['masters'] : []) {
      if (!isRecord(master)) continue;
      layer(master['layer']);
      for (const layout of Array.isArray(master['layouts']) ? master['layouts'] : []) {
        if (isRecord(layout)) layer(layout['layer']);
      }
    }
    return copy;
  },
  8: (doc) => {
    // v9: every object gets animations; none had any before.
    const copy = structuredCloneJson(doc);
    eachSavedObject(copy, (object) => {
      object['animations'] ??= { entrance: null, exit: null, motionPaths: [] };
    });
    return copy;
  },
  7: (doc) => {
    const copy = structuredCloneJson(doc);
    const fix = (objects: unknown): void => {
      if (!Array.isArray(objects)) return;
      for (const object of objects) {
        if (!isRecord(object)) continue;
        if (
          (object['type'] === 'audio' || object['type'] === 'video') &&
          isRecord(object['props'])
        ) {
          object['props']['captions'] ??= [];
        }
        fix(object['children']);
      }
    };
    const fixLayer = (layer: unknown) => {
      if (isRecord(layer)) fix(layer['objects']);
    };
    for (const scene of Array.isArray(copy['scenes']) ? copy['scenes'] : []) {
      if (!isRecord(scene) || !Array.isArray(scene['slides'])) continue;
      for (const slide of scene['slides']) {
        if (!isRecord(slide)) continue;
        fixLayer(slide['baseLayer']);
        for (const layer of Array.isArray(slide['layers']) ? slide['layers'] : []) fixLayer(layer);
      }
    }
    for (const master of Array.isArray(copy['masters']) ? copy['masters'] : []) {
      if (!isRecord(master)) continue;
      fixLayer(master['layer']);
      for (const layout of Array.isArray(master['layouts']) ? master['layouts'] : []) {
        if (isRecord(layout)) fixLayer(layout['layer']);
      }
    }
    return copy;
  },
  // v7 added video objects: nothing to change.
  6: (doc) => doc,
  // v6 added audio objects, media actions and the media-completes event: nothing to change.
  5: (doc) => doc,
  // v5 added the remembered publish settings; nothing had been remembered before.
  4: (doc) => ({
    ...doc,
    publish: doc['publish'] ?? {
      target: 'web',
      scorm2004Edition: 4,
      title: '',
      identifier: '',
      version: '1.0',
      description: '',
      zip: false,
    },
  }),
  3: (doc) => ({
    ...doc,
    tracking: doc['tracking'] ?? {
      completion: { kind: 'slidesViewed', count: null },
      reporting: 'completed-incomplete',
      resume: 'prompt',
    },
  }),
  // v3 added the player buttons each slide shows; every existing slide showed both.
  2: (doc) => {
    const copy = structuredCloneJson(doc);
    const scenes = Array.isArray(copy['scenes']) ? copy['scenes'] : [];
    for (const scene of scenes) {
      if (!isRecord(scene) || !Array.isArray(scene['slides'])) continue;
      for (const slide of scene['slides']) {
        if (isRecord(slide) && isRecord(slide['properties'])) {
          slide['properties']['controls'] ??= { previous: true, next: true };
        }
      }
    }
    return copy;
  },
};

/**
 * Call `visit` on every object of a saved document at any depth: on slides
 * and their layers, and on masters and their layouts, inside groups too.
 */
function eachSavedObject(doc: RawDocument, visit: (object: RawDocument) => void): void {
  const walk = (objects: unknown): void => {
    if (!Array.isArray(objects)) return;
    for (const object of objects) {
      if (!isRecord(object)) continue;
      visit(object);
      walk(object['children']);
    }
  };
  const layer = (value: unknown) => {
    if (isRecord(value)) walk(value['objects']);
  };
  for (const scene of Array.isArray(doc['scenes']) ? doc['scenes'] : []) {
    if (!isRecord(scene) || !Array.isArray(scene['slides'])) continue;
    for (const slide of scene['slides']) {
      if (!isRecord(slide)) continue;
      layer(slide['baseLayer']);
      for (const each of Array.isArray(slide['layers']) ? slide['layers'] : []) layer(each);
    }
  }
  for (const master of Array.isArray(doc['masters']) ? doc['masters'] : []) {
    if (!isRecord(master)) continue;
    layer(master['layer']);
    for (const layout of Array.isArray(master['layouts']) ? master['layouts'] : []) {
      if (isRecord(layout)) layer(layout['layer']);
    }
  }
}

/**
 * Every object a v27 document holds, groups' children included: in scenes'
 * and question banks' slides, and in masters. (`eachSavedObject` predates
 * banks; it is kept as it was so older migrations do not change.)
 */
function eachSavedObjectV27(doc: RawDocument, visit: (object: RawDocument) => void): void {
  eachSavedObject(doc, visit);
  const walk = (objects: unknown): void => {
    if (!Array.isArray(objects)) return;
    for (const object of objects) {
      if (!isRecord(object)) continue;
      visit(object);
      walk(object['children']);
    }
  };
  for (const bank of Array.isArray(doc['banks']) ? doc['banks'] : []) {
    if (!isRecord(bank) || !Array.isArray(bank['slides'])) continue;
    for (const slide of bank['slides']) {
      if (!isRecord(slide)) continue;
      for (const layer of [
        slide['baseLayer'],
        ...(Array.isArray(slide['layers']) ? slide['layers'] : []),
      ]) {
        if (isRecord(layer)) walk(layer['objects']);
      }
    }
  }
}

/** The frozen v17 default feedback master, laid out for a `width` × `height` stage, with new ids. */
function v17FeedbackMaster(width: number, height: number): RawDocument {
  const master = JSON.parse(JSON.stringify(V17_FEEDBACK_MASTER)) as RawDocument;
  const sx = width / 1280;
  const sy = height / 720;
  const fresh = (value: unknown, prefix: string): void => {
    if (Array.isArray(value)) value.forEach((each) => fresh(each, prefix));
    else if (isRecord(value)) {
      const frame = value['frame'];
      if (isRecord(frame) && typeof frame['x'] === 'number') {
        frame['x'] = Math.round((frame['x'] as number) * sx);
        frame['y'] = Math.round((frame['y'] as number) * sy);
        frame['width'] = Math.round((frame['width'] as number) * sx);
        frame['height'] = Math.round((frame['height'] as number) * sy);
      }
      for (const [key, inner] of Object.entries(value)) fresh(inner, key);
    }
  };
  fresh(master, '');
  v17RenewIds(master);
  return master;
}

/** New ids for everything in a raw master or layer that has one (masters, layouts, layers, objects). */
function v17RenewIds(value: unknown): void {
  if (Array.isArray(value)) value.forEach(v17RenewIds);
  else if (isRecord(value)) {
    const id = value['id'];
    if (typeof id === 'string' && /^(master|layout|layer|obj)_/.test(id)) {
      value['id'] = createId(id.slice(0, id.indexOf('_')) as 'master' | 'layout' | 'layer' | 'obj');
    }
    for (const inner of Object.values(value)) v17RenewIds(inner);
  }
}

/**
 * A raw question slide's feedback as format 17 has it: for each result it
 * gives feedback for, a layer copied from the feedback master with the old
 * words in its message and a button that continues; none when it gave none.
 */
function v17FeedbackLayers(slide: RawDocument, master: RawDocument): void {
  const question = slide['question'];
  if (!isRecord(question) || !isRecord(question['feedback'])) return;
  const old = question['feedback'];
  const survey = 'answered' in old;
  const attempts = question['attempts'];
  const again = !survey && (attempts === null || (typeof attempts === 'number' && attempts > 1));
  const roles = survey ? ['answered'] : ['correct', 'incorrect', ...(again ? ['tryAgain'] : [])];
  const next: RawDocument = { by: old['by'] };
  for (const role of survey ? ['answered'] : ['correct', 'incorrect', 'tryAgain'])
    next[role] = null;
  if (old['by'] !== 'none') {
    const layouts = Array.isArray(master['layouts']) ? master['layouts'] : [];
    const layers = Array.isArray(slide['layers']) ? slide['layers'] : [];
    const triggers = Array.isArray(slide['triggers']) ? slide['triggers'] : [];
    for (const role of roles) {
      const layout = layouts.find((each) => isRecord(each) && each['role'] === role);
      if (!isRecord(layout) || !isRecord(layout['layer'])) continue;
      const layer = JSON.parse(JSON.stringify(layout['layer'])) as RawDocument;
      v17RenewIds(layer);
      layer['properties'] = {
        ...(layer['properties'] as RawDocument),
        hideOtherLayers: true,
        pauseBaseTimeline: true,
        blockBaseClicks: true,
      };
      const objects = Array.isArray(layer['objects']) ? (layer['objects'] as RawDocument[]) : [];
      const message = objects.find(
        (each) =>
          each['type'] === 'text' &&
          isRecord(each['props']) &&
          each['props']['placeholder'] === 'content',
      );
      const words = typeof old[role] === 'string' ? (old[role] as string) : '';
      if (message && isRecord(message['props'])) {
        message['props']['placeholder'] = null;
        message['props']['text'] =
          words === ''
            ? { type: 'doc', content: [] }
            : {
                type: 'doc',
                content: words.split('\n').map((line) => ({
                  type: 'paragraph',
                  content: line === '' ? [] : [{ type: 'text', text: line }],
                })),
              };
      }
      const button = objects.find((each) => each['type'] === 'button');
      if (button) {
        triggers.push({
          id: createId('trigger'),
          owner: { kind: 'object', id: button['id'] },
          event: { type: 'click', object: button['id'] },
          action: { type: 'continueQuestion' },
          conditions: null,
          otherwise: null,
          enabled: true,
        });
      }
      layers.push(layer);
      next[role] = {
        layer: layer['id'],
        message: message ? message['id'] : null,
        button: button ? button['id'] : null,
      };
    }
    slide['layers'] = layers;
    slide['triggers'] = triggers;
  }
  question['feedback'] = next;
}

function structuredCloneJson(doc: RawDocument): RawDocument {
  return JSON.parse(JSON.stringify(doc)) as RawDocument;
}

function isRecord(value: unknown): value is RawDocument {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Upgrade a parsed project.json of any known version to the current format.
 * The result is still unvalidated; pass it to the schema next.
 */
export function migrateToCurrent(raw: unknown): unknown {
  if (!isRecord(raw)) {
    throw new ProjectValidationError([{ path: '', message: 'project must be an object' }]);
  }
  const version = raw['formatVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    throw new ProjectValidationError([
      { path: 'formatVersion', message: 'missing or invalid format version' },
    ]);
  }
  if (version > FORMAT_VERSION) {
    throw new ProjectValidationError([
      {
        path: 'formatVersion',
        message: `this project was saved by a newer version of Vedra Opus (format ${version}; this version reads up to ${FORMAT_VERSION})`,
      },
    ]);
  }

  let doc = raw;
  for (let from = version; from < FORMAT_VERSION; from++) {
    const migrate = migrations[from];
    if (!migrate) throw new Error(`No migration registered from format version ${from}`);
    doc = { ...migrate(doc), formatVersion: from + 1 };
  }
  return doc;
}

import { describe, expect, it } from 'vitest';
import {
  createAudioObject,
  createEmptyProject,
  createVideoObject,
  createId,
  createSlide,
  FORMAT_VERSION,
  normalState,
  parseProject,
  ProjectValidationError,
  serializeProject,
} from './index';
import type { Project, ShapeObject, Trigger } from './index';

function issuesOf(raw: unknown) {
  try {
    parseProject(raw);
  } catch (error) {
    if (error instanceof ProjectValidationError) return error.issues;
    throw error;
  }
  throw new Error('expected parseProject to reject the document');
}

function shape(id: string): ShapeObject {
  return {
    id,
    name: 'Rectangle',
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

function clickTrigger(objectId: string, action: Trigger['action']): Trigger {
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

/** An empty project with one rectangle on its only slide. */
function projectWithShape(): { project: Project; objectId: string } {
  const project = createEmptyProject();
  const objectId = createId('obj');
  project.scenes[0]!.slides[0]!.baseLayer.objects.push(shape(objectId));
  return { project, objectId };
}

describe('createId', () => {
  it('produces prefixed ids that do not collide', () => {
    const ids = new Set(Array.from({ length: 5000 }, () => createId('obj')));
    expect(ids.size).toBe(5000);
    for (const id of ids) expect(id).toMatch(/^obj_[0-9a-z]{16}$/);
  });
});

describe('createEmptyProject', () => {
  it('is valid and has one scene with one slide', () => {
    const project = parseProject(createEmptyProject('My Course'));
    expect(project.title).toBe('My Course');
    expect(project.formatVersion).toBe(FORMAT_VERSION);
    expect(project.scenes).toHaveLength(1);
    expect(project.scenes[0]!.slides).toHaveLength(1);
  });

  it('does not share theme objects between projects', () => {
    const a = createEmptyProject();
    const b = createEmptyProject();
    a.theme.colors.accent1 = '#000000';
    expect(b.theme.colors.accent1).not.toBe('#000000');
  });
});

describe('save and load', () => {
  it('round-trips a project unchanged', () => {
    const { project, objectId } = projectWithShape();
    const slide = project.scenes[0]!.slides[0]!;
    project.variables.push({ id: createId('var'), name: 'Score', type: 'number', default: 0 });
    slide.triggers.push(clickTrigger(objectId, { type: 'jumpToSlide', target: { kind: 'next' } }));
    expect(parseProject(JSON.parse(serializeProject(project)))).toEqual(project);
  });
});

describe('schema validation', () => {
  it('reports the exact path of an invalid value', () => {
    const { project } = projectWithShape();
    project.scenes[0]!.slides[0]!.baseLayer.objects[0]!.frame.width = -5;
    const issues = issuesOf(project);
    expect(issues.map((issue) => issue.path)).toContain(
      'scenes[0].slides[0].baseLayer.objects[0].frame.width',
    );
  });

  it('rejects unknown keys instead of silently dropping them', () => {
    const raw = { ...createEmptyProject(), surprise: true };
    expect(issuesOf(raw)[0]!.message).toMatch(/surprise/);
  });

  it('rejects a variable whose default does not match its type', () => {
    const project = createEmptyProject();
    project.variables.push({ id: createId('var'), name: 'Done', type: 'boolean', default: 'no' });
    expect(issuesOf(project).map((issue) => issue.path)).toEqual(['variables[0].default']);
  });

  it('rejects non-objects and missing versions with a clear message', () => {
    expect(issuesOf(null)[0]!.message).toMatch(/must be an object/);
    expect(issuesOf({})[0]!.path).toBe('formatVersion');
  });

  it('refuses projects from a newer format instead of misreading them', () => {
    const raw = { ...createEmptyProject(), formatVersion: FORMAT_VERSION + 1 };
    expect(issuesOf(raw)[0]!.message).toMatch(/newer version/);
  });
});

describe('reference validation', () => {
  it('rejects duplicate ids anywhere in the project', () => {
    const project = createEmptyProject();
    const copy = createSlide();
    copy.id = project.scenes[0]!.slides[0]!.id;
    project.scenes[0]!.slides.push(copy);
    const issues = issuesOf(project);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.path).toBe('scenes[0].slides[1].id');
    expect(issues[0]!.message).toMatch(/duplicate id/);
  });

  it('rejects an image whose asset is not in the project', () => {
    const project = createEmptyProject();
    project.scenes[0]!.slides[0]!.baseLayer.objects.push({
      ...shape(createId('obj')),
      type: 'image',
      props: { asset: 'a'.repeat(64), crop: null, opacity: 1 },
    });
    expect(issuesOf(project)[0]!.path).toBe('scenes[0].slides[0].baseLayer.objects[0].props.asset');
  });

  it('rejects an object without a normal state or with an unknown initial state', () => {
    const { project } = projectWithShape();
    const object = project.scenes[0]!.slides[0]!.baseLayer.objects[0]!;
    object.states = [{ id: 'hover', name: 'Hover', overrides: {} }];
    object.initialState = 'selected';
    expect(issuesOf(project).map((issue) => issue.message)).toEqual([
      'object has no "normal" state',
      'object has no state "selected"',
    ]);
  });

  it('rejects triggers that point at missing objects, states, slides or variables', () => {
    const { project, objectId } = projectWithShape();
    project.scenes[0]!.slides[0]!.triggers.push(
      clickTrigger('obj_missing', { type: 'changeState', object: objectId, state: 'glowing' }),
      clickTrigger(objectId, {
        type: 'jumpToSlide',
        target: { kind: 'slide', slide: 'slide_gone' },
      }),
      clickTrigger(objectId, { type: 'toggleVariable', variable: 'var_gone' }),
    );
    const paths = issuesOf(project).map((issue) => issue.path);
    const base = 'scenes[0].slides[0].triggers';
    expect(paths).toEqual([
      `${base}[0].owner.id`,
      `${base}[0].event.object`,
      `${base}[0].action.state`,
      `${base}[1].action.target.slide`,
      `${base}[2].action.variable`,
    ]);
  });

  it('finds objects nested inside groups', () => {
    const { project, objectId } = projectWithShape();
    const layer = project.scenes[0]!.slides[0]!.baseLayer;
    const child = layer.objects.pop()!;
    const { props: _props, ...common } = shape(createId('obj'));
    layer.objects.push({ ...common, type: 'group', children: [child], scroll: null });
    project.scenes[0]!.slides[0]!.triggers.push(
      clickTrigger(objectId, { type: 'changeState', object: objectId, state: 'normal' }),
    );
    expect(() => parseProject(project)).not.toThrow();
  });

  it('accepts audio objects with media triggers, and rejects bad sound references', () => {
    const SOUND = 'e'.repeat(64);
    const PICTURE = 'f'.repeat(64);
    const make = (edit: (p: Project, audioId: string, boxId: string) => void) => {
      const project = createEmptyProject();
      project.assets[SOUND] = {
        kind: 'audio',
        fileName: 'a.mp3',
        ext: 'mp3',
        mimeType: 'audio/mpeg',
        byteLength: 1,
      };
      project.assets[PICTURE] = {
        kind: 'image',
        fileName: 'a.png',
        ext: 'png',
        mimeType: 'image/png',
        byteLength: 1,
      };
      const slide = project.scenes[0]!.slides[0]!;
      const audio = createAudioObject(SOUND, 2.5);
      const box = shape('box_1');
      slide.baseLayer.objects.push(audio, box);
      slide.triggers.push(clickTrigger(box.id, { type: 'playMedia', object: audio.id }), {
        ...clickTrigger(box.id, { type: 'stopMedia', object: audio.id }),
        owner: { kind: 'slide', id: slide.id },
        event: { type: 'mediaCompletes', object: audio.id },
      });
      edit(project, audio.id, box.id);
      return JSON.parse(serializeProject(project)) as unknown;
    };
    const ok = make(() => undefined);
    expect(parseProject(ok).scenes[0]!.slides[0]!.baseLayer.objects[0]).toMatchObject({
      type: 'audio',
      timing: { start: 0, duration: 2.5 },
      props: { asset: SOUND, length: 2.5, volume: 1, startOn: 'timeline' },
    });

    const pictureAsSound = make((p, audioId) => {
      const audio = p.scenes[0]!.slides[0]!.baseLayer.objects.find((o) => o.id === audioId)!;
      if (audio.type === 'audio') audio.props.asset = PICTURE;
    });
    expect(issuesOf(pictureAsSound)).toEqual([
      expect.objectContaining({ message: 'an audio object must use an audio asset' }),
    ]);
    const mediaOnABox = make((p, _audioId, boxId) => {
      p.scenes[0]!.slides[0]!.triggers[0]!.action = { type: 'pauseMedia', object: boxId };
    });
    expect(issuesOf(mediaOnABox)).toEqual([
      expect.objectContaining({ message: 'object "Rectangle" is not audio or video' }),
    ]);
    const missing = make((p) => {
      p.scenes[0]!.slides[0]!.triggers[1]!.event = { type: 'mediaCompletes', object: 'gone' };
    });
    expect(issuesOf(missing)[0]?.message).toContain('gone');
    const silent = make((p, audioId) => {
      const audio = p.scenes[0]!.slides[0]!.baseLayer.objects.find((o) => o.id === audioId)!;
      if (audio.type === 'audio') audio.props.length = 0;
    });
    expect(issuesOf(silent).length).toBeGreaterThan(0);
  });

  it('accepts a video with a picture as its poster, and refuses bad trims and wrong kinds', () => {
    const FILM = 'b'.repeat(64);
    const PICTURE = 'f'.repeat(64);
    const SOUND = 'e'.repeat(64);
    const make = (edit: (props: ReturnType<typeof createVideoObject>['props']) => void) => {
      const project = createEmptyProject();
      project.assets[FILM] = {
        kind: 'video',
        fileName: 'f.mp4',
        ext: 'mp4',
        mimeType: 'video/mp4',
        byteLength: 1,
      };
      project.assets[PICTURE] = {
        kind: 'image',
        fileName: 'p.png',
        ext: 'png',
        mimeType: 'image/png',
        byteLength: 1,
      };
      project.assets[SOUND] = {
        kind: 'audio',
        fileName: 's.mp3',
        ext: 'mp3',
        mimeType: 'audio/mpeg',
        byteLength: 1,
      };
      const video = createVideoObject(FILM, 10);
      video.props.poster = PICTURE;
      edit(video.props);
      project.scenes[0]!.slides[0]!.baseLayer.objects.push(video);
      return JSON.parse(serializeProject(project)) as unknown;
    };
    expect(
      parseProject(make((p) => Object.assign(p, { trimStart: 2, trimEnd: 7 }))).scenes[0]!
        .slides[0]!.baseLayer.objects[0],
    ).toMatchObject({
      type: 'video',
      props: {
        length: 10,
        trimStart: 2,
        trimEnd: 7,
        poster: PICTURE,
        startOn: 'timeline',
        controls: false,
        pictureInPicture: false,
      },
    });
    expect(
      issuesOf(make((p) => Object.assign(p, { trimStart: 5, trimEnd: 5 })))[0]?.message,
    ).toContain('trim');
    expect(issuesOf(make((p) => Object.assign(p, { trimEnd: 11 })))[0]?.message).toContain('trim');
    expect(issuesOf(make((p) => Object.assign(p, { poster: SOUND })))).toEqual([
      expect.objectContaining({ message: 'a poster must be a picture' }),
    ]);
    expect(issuesOf(make((p) => Object.assign(p, { asset: SOUND })))).toEqual([
      expect.objectContaining({ message: 'a video object must use a video asset' }),
    ]);
    expect(
      issuesOf(make((p) => Object.assign(p, { poster: 'a'.repeat(64) })))[0]?.message,
    ).toContain('not in the project');
  });

  it('rejects variable names that differ only by case', () => {
    const project = createEmptyProject();
    project.variables.push(
      { id: createId('var'), name: 'Score', type: 'number', default: 0 },
      { id: createId('var'), name: 'score', type: 'number', default: 0 },
    );
    expect(issuesOf(project)[0]!.path).toBe('variables[1].name');
  });
});

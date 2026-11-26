import { describe, expect, it } from 'vitest';
import {
  cloneSlide,
  createAudioObject,
  createEffect,
  createEmptyProject,
  createGroupObject,
  createHistory,
  createId,
  createImageObject,
  createMotionPath,
  createShapeObject,
  createTextObject,
  effectDirections,
  effectKinds,
  effectSchema,
  findObject,
  migrateToCurrent,
  motionPathSchema,
  parseProject,
  ProjectValidationError,
} from './index';
import type { Project, SceneObject, Trigger } from './index';

const HASH = 'a'.repeat(64);

const run = (object: SceneObject, path: string): Trigger => ({
  id: createId('trigger'),
  owner: { kind: 'object', id: object.id },
  event: { type: 'click', object: object.id },
  action: { type: 'moveAlongPath', object: object.id, path },
  conditions: null,
  otherwise: null,
  enabled: true,
});
const waitFor = (
  object: SceneObject,
  animation: Extract<Trigger['event'], { type: 'animationCompletes' }>['animation'],
): Trigger => ({
  id: createId('trigger'),
  owner: { kind: 'object', id: object.id },
  event: { type: 'animationCompletes', object: object.id, animation },
  action: { type: 'completeCourse' },
  conditions: null,
  otherwise: null,
  enabled: true,
});

/** A project with `objects` on its one slide, and `triggers`. */
function projectWith(objects: SceneObject[], triggers: Trigger[] = []): Project {
  const project = createEmptyProject('Animated');
  project.assets[HASH] = {
    kind: 'image',
    fileName: 'p.png',
    ext: 'png',
    mimeType: 'image/png',
    byteLength: 1,
  };
  const slide = project.scenes[0]!.slides[0]!;
  slide.baseLayer.objects.push(...objects);
  slide.triggers.push(...triggers);
  return project;
}
const issues = (project: Project): string[] => {
  try {
    parseProject(JSON.parse(JSON.stringify(project)));
    return [];
  } catch (error) {
    if (error instanceof ProjectValidationError) return error.issues.map((issue) => issue.message);
    throw error;
  }
};

describe('effects and paths in the saved format', () => {
  it('takes each effect with its own directions, the first by default', () => {
    for (const kind of effectKinds) {
      const effect = createEffect(kind);
      expect(effectSchema.safeParse(effect).success, kind).toBe(true);
      expect(effect.direction).toBe(effectDirections[kind][0] ?? null);
    }
    const bad = [
      { ...createEffect('fly'), direction: 'clockwise' },
      { ...createEffect('fade'), direction: 'left' },
      { ...createEffect('fly'), direction: null },
      { ...createEffect('fade'), duration: 0 },
    ];
    for (const effect of bad) expect(effectSchema.safeParse(effect).success).toBe(false);
  });

  it('gives a line two points and an arc three', () => {
    expect(motionPathSchema.safeParse(createMotionPath('line', 'L')).success).toBe(true);
    expect(motionPathSchema.safeParse(createMotionPath('arc', 'A')).success).toBe(true);
    const line = createMotionPath('line', 'L');
    line.points.push({ x: 1, y: 1 });
    expect(motionPathSchema.safeParse(line).success).toBe(false);
    const freeform = createMotionPath('freeform', 'F', [
      { x: 0, y: 0 },
      { x: 3, y: 4 },
    ]);
    expect(motionPathSchema.safeParse(freeform).success).toBe(true);
  });

  it('allows by paragraph only with text, and animations inside groups as well (B8)', () => {
    const text = createTextObject('One\nTwo');
    text.animations.entrance = { ...createEffect('fade'), byParagraph: true };
    const picture = createImageObject(HASH);
    picture.animations.exit = { ...createEffect('fade'), byParagraph: true };
    expect(issues(projectWith([text]))).toEqual([]);
    expect(issues(projectWith([picture]))).toEqual(['only text can animate by paragraph']);

    // Until B8 a group's members could not animate; now they can, alongside the group.
    const inner = createShapeObject({ kind: 'rect' });
    inner.animations.entrance = createEffect('grow');
    const group = createGroupObject([inner, createShapeObject({ kind: 'ellipse' })]);
    expect(issues(projectWith([group]))).toEqual([]);
    group.animations.entrance = createEffect('grow');
    expect(issues(projectWith([group]))).toEqual([]);
  });

  it('checks that triggers name a path of their own object, and an animation it has', () => {
    const one = createShapeObject({ kind: 'rect' });
    const other = createShapeObject({ kind: 'rect' });
    const path = createMotionPath('line', 'Across');
    one.animations.motionPaths = [path];
    expect(issues(projectWith([one, other], [run(one, path.id)]))).toEqual([]);
    expect(issues(projectWith([one, other], [run(other, path.id)]))).toEqual([
      `object "Shape" has no motion path "${path.id}"`,
    ]);
    expect(issues(projectWith([one], [waitFor(one, { kind: 'path', path: path.id })]))).toEqual([]);
    expect(issues(projectWith([one], [waitFor(one, { kind: 'exit' })]))).toEqual([
      'object "Shape" has no exit animation',
    ]);
    // Path ids are unique across the project.
    other.animations.motionPaths = [{ ...path }];
    expect(issues(projectWith([one, other]))[0]).toContain('duplicate id');
  });

  it('gives a group’s members in an older project the whole timeline, as they played (B8)', () => {
    // Before format 36 a member's own timing was ignored: it showed whenever its group did.
    const inner = createShapeObject({ kind: 'rect' });
    inner.timing = { start: 2, duration: 3 };
    const outer = createShapeObject({ kind: 'ellipse' });
    outer.timing = { start: 2, duration: 3 };
    const nested = createGroupObject([inner]);
    nested.timing = { start: 1, duration: 4 };
    const group = createGroupObject([nested]);
    const v35 = { ...JSON.parse(JSON.stringify(projectWith([group, outer]))), formatVersion: 35 };
    const loaded = parseProject(v35);
    const members = loaded.scenes[0]!.slides[0]!.baseLayer.objects;
    const loadedGroup = members[0]!;
    expect(loadedGroup.type).toBe('group');
    if (loadedGroup.type !== 'group') return;
    const loadedNested = loadedGroup.children[0]!;
    expect(loadedNested.timing).toEqual({ start: 0, duration: 'untilEnd' });
    expect(loadedNested.type === 'group' && loadedNested.children[0]!.timing).toEqual({
      start: 0,
      duration: 'untilEnd',
    });
    // An object at the top of its layer keeps its own.
    expect(members[1]!.timing).toEqual({ start: 2, duration: 3 });
  });

  it('gives every object in an older project no animations, wherever it is', () => {
    const v8 = {
      formatVersion: 8,
      scenes: [
        {
          slides: [
            {
              baseLayer: {
                objects: [{ id: 'a' }, { id: 'g', type: 'group', children: [{ id: 'b' }] }],
              },
              layers: [{ objects: [{ id: 'c' }] }],
            },
          ],
        },
      ],
      masters: [
        { layer: { objects: [{ id: 'd' }] }, layouts: [{ layer: { objects: [{ id: 'e' }] } }] },
      ],
    };
    const migrated = migrateToCurrent(v8) as typeof v8 & { formatVersion: number };
    expect(migrated.formatVersion).toBeGreaterThanOrEqual(9);
    // a, g, b, c, d, e (not the feedback master a later format adds, P7.5).
    const before = { ...migrated, masters: migrated.masters.slice(0, 1) };
    expect(
      JSON.stringify(before).match(
        /"animations":\{"entrance":null,"exit":null,"motionPaths":\[\]\}/g,
      ),
    ).toHaveLength(6);
    expect(JSON.stringify(v8)).not.toContain('animations');
  });
});

describe('commands and copies', () => {
  const setup = (objects: SceneObject[], triggers: Trigger[] = []) => {
    const history = createHistory(parseProject(projectWith(objects, triggers)), { validate: true });
    const slide = () => history.project.scenes[0]!.slides[0]!;
    return { history, slide };
  };

  it('removes the triggers of a path that is deleted, or of an exit that is taken off', () => {
    const box = createShapeObject({ kind: 'rect' });
    const across = createMotionPath('line', 'Across');
    const down = createMotionPath('line', 'Down');
    box.animations = { entrance: null, exit: createEffect('fade'), motionPaths: [across, down] };
    const { history, slide } = setup(
      [box],
      [run(box, across.id), run(box, down.id), waitFor(box, { kind: 'exit' })],
    );
    history.execute('object.update', {
      objectId: box.id,
      changes: { animations: { entrance: null, exit: createEffect('fade'), motionPaths: [down] } },
    });
    expect(slide().triggers.map((each) => each.action)).toEqual([
      { type: 'moveAlongPath', object: box.id, path: down.id },
      { type: 'completeCourse' },
    ]);
    history.execute('object.update', {
      objectId: box.id,
      changes: { animations: { entrance: null, exit: null, motionPaths: [down] } },
    });
    expect(slide().triggers).toHaveLength(1);
    history.undo();
    history.undo();
    expect(slide().triggers).toHaveLength(3);
  });

  it('keeps members’ animations and the triggers that run them when grouping, and lets members animate (B8)', () => {
    const one = createShapeObject({ kind: 'rect' });
    const two = createShapeObject({ kind: 'ellipse' });
    const path = createMotionPath('line', 'Across');
    one.animations = { entrance: createEffect('fade'), exit: null, motionPaths: [path] };
    const { history, slide } = setup([one, two], [run(one, path.id)]);
    const group = createGroupObject([]);
    group.children = [];
    history.execute('object.group', { objectIds: [one.id, two.id], group });
    // Until B8 grouping dropped them; now the member keeps its animations and its trigger.
    const grouped = findObject(history.project, one.id)!.object;
    expect(grouped.animations).toEqual(one.animations);
    expect(slide().triggers).toHaveLength(1);
    history.execute('object.update', {
      objectId: two.id,
      changes: { animations: { entrance: null, exit: createEffect('fade'), motionPaths: [] } },
    });
    expect(findObject(history.project, two.id)!.object.animations.exit).toMatchObject({
      kind: 'fade',
    });
    // Undoing both puts the member back as grouped: still with its animations.
    history.undo();
    history.undo();
    expect(findObject(history.project, one.id)!.object.animations).toEqual(one.animations);
  });

  it('gives copies new path and caption ids, with their triggers following', () => {
    const box = createShapeObject({ kind: 'rect' });
    const path = createMotionPath('line', 'Across');
    box.animations.motionPaths = [path];
    const project = projectWith([box], [run(box, path.id)]);
    const sound = createAudioObject('b'.repeat(64), 2);
    sound.props.captions = [{ id: createId('caption'), start: 0, end: 1, text: 'Hi' }];
    project.assets['b'.repeat(64)] = {
      kind: 'audio',
      fileName: 's.mp3',
      ext: 'mp3',
      mimeType: 'audio/mpeg',
      byteLength: 1,
    };
    const slide = project.scenes[0]!.slides[0]!;
    slide.baseLayer.objects.push(sound);
    const copy = cloneSlide(slide);
    const copiedBox = copy.baseLayer.objects[0]!;
    const copiedPath = copiedBox.animations.motionPaths[0]!;
    expect(copiedPath.id).not.toBe(path.id);
    expect(copy.triggers[0]!.action).toEqual({
      type: 'moveAlongPath',
      object: copiedBox.id,
      path: copiedPath.id,
    });
    const copiedSound = copy.baseLayer.objects[1]!;
    expect(copiedSound.type === 'audio' && copiedSound.props.captions[0]!.id).not.toBe(
      sound.props.captions[0]!.id,
    );
    // Both slides together are a valid project: no id is used twice.
    project.scenes[0]!.slides.push(copy);
    expect(issues(project)).toEqual([]);
  });
});

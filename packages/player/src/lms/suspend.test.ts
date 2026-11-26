import {
  createBank,
  createResultSlide,
  createDrawSlide,
  createButtonObject,
  createEmptyProject,
  createId,
  createLayer,
  createMotionPath,
  createQuestionSlide,
  createScene,
  createSlide,
} from '@vedraopus/model';
import type { ChoiceQuestion, Project, Question } from '@vedraopus/model';
import { createEngine } from '@vedraopus/engine';
import type { SessionState } from '@vedraopus/engine';
import { describe, expect, it } from 'vitest';
import { compress, decodeSession, decompress, encodeSession } from './suspend';

/**
 * A question slide whose Submit takes its branch at once: feedback none, so
 * no feedback layer waits for the learner (feedback.test.ts tests those, P7.5).
 */
const quizSlide = (...args: Parameters<typeof createQuestionSlide>) => {
  const slide = createQuestionSlide(...args);
  slide.question!.feedback.by = 'none';
  return slide;
};

describe('compression', () => {
  it('round-trips text of every size, including non-ASCII and long repeats', () => {
    const samples = [
      '',
      'a',
      '{"k":"x"}',
      'ünïcödé ✓ 漢字 🙂',
      'abc'.repeat(5000),
      JSON.stringify({ list: Array.from({ length: 3000 }, (_, i) => i % 97) }),
    ];
    // Enough random text to push the codes past every width up to 16 bits.
    let random = '';
    let seed = 7;
    for (let i = 0; i < 200_000; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      random += String.fromCharCode(32 + (seed % 90));
    }
    samples.push(random);
    for (const text of samples) {
      const packed = compress(text);
      expect(packed).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(decompress(packed)).toBe(text);
    }
  });

  it('makes repetitive JSON much smaller', () => {
    const text = JSON.stringify(
      Array.from({ length: 200 }, () => ({ state: 'selected', visible: true })),
    );
    expect(compress(text).length).toBeLessThan(text.length / 5);
  });
});

/** A course of `n` slides, each with three buttons with states and an overlay layer. */
function bigCourse(n: number): Project {
  const project = createEmptyProject();
  const slides = Array.from({ length: n }, (_, i) => {
    const slide = createSlide(`Slide ${i + 1}`);
    slide.properties.onRevisit = 'resume';
    for (let b = 0; b < 3; b++) {
      const button = createButtonObject(`B${b}`);
      button.timing = { start: 0, duration: 'untilEnd' };
      button.states.push(
        { id: 'selected', name: 'Selected', overrides: {} },
        { id: 'state_done', name: 'Done', overrides: {} },
      );
      slide.baseLayer.objects.push(button);
    }
    slide.layers.push(createLayer('Feedback'));
    return slide;
  });
  project.scenes = [{ ...createScene(), slides }];
  for (let v = 0; v < 10; v++) {
    project.variables.push({ id: createId('var'), name: `Answer${v}`, type: 'text', default: '' });
  }
  return project;
}

/** Visit every slide, leaving state on each: states, marks, a layer shown, time passed. */
function fullSession(project: Project): SessionState {
  const engine = createEngine(project);
  const slides = project.scenes[0]!.slides;
  slides.forEach((slide, i) => {
    if (i > 0) engine.jumpToSlide(slide.id);
    const [a, b] = slide.baseLayer.objects;
    engine.setObjectState(a!.id, 'state_done');
    engine.pointer('click', b!.id);
    engine.showLayer(slide.layers[0]!.id);
    engine.tick(i * 1000);
    engine.tick(i * 1000 + 700);
  });
  for (let v = 0; v < 10; v++) engine.setVariable(`Answer${v}`, `choice ${v}`);
  return JSON.parse(JSON.stringify(engine.getState())) as SessionState;
}

describe('suspend data', () => {
  it('a 100-slide course, fully visited with state on every slide, fits in 4,096 characters', () => {
    const project = bigCourse(100);
    const state = fullSession(project);
    expect(Object.keys(state.sv ?? {})).toHaveLength(100);
    const { text, dropped } = encodeSession(project, state);
    expect(dropped).toEqual([]);
    expect(text.length).toBeLessThan(4096);
    // …and brings back exactly the same session.
    expect(decodeSession(project, text)).toEqual(state);
    // Resuming from it gives the same view as the engine that saved it.
    const original = createEngine(project, { restore: state });
    const resumed = createEngine(project, { restore: decodeSession(project, text)! });
    expect(resumed.getView()).toEqual(original.getView());
  });

  it('drops detail in order when it does not fit, keeping completion and the current slide', () => {
    const project = bigCourse(100);
    const state = fullSession(project);
    const full = encodeSession(project, state).text.length;
    const fit = (limit: number) => encodeSession(project, state, limit);

    const first = fit(full - 1);
    expect(first.dropped).toEqual(['other slides’ resume detail']);
    expect(first.text.length).toBeLessThanOrEqual(full - 1);
    const back = decodeSession(project, first.text)!;
    expect(Object.keys(back.sv ?? {})).toEqual([state.s]);
    expect(back.x).toEqual(state.x);

    const tiny = fit(40);
    expect(tiny.dropped).toEqual([
      'other slides’ resume detail',
      'the current slide’s resume detail',
      'the slides visited',
      'variables',
    ]);
    const least = decodeSession(project, tiny.text)!;
    expect(least).toMatchObject({ v: 1, s: state.s, c: 1 });
    expect(least.sv).toBeUndefined();
    expect(least.x).toBeUndefined();
  });

  it('after a republish with different slides, keeps only completion, time and variables', () => {
    const project = bigCourse(3);
    const state = fullSession(project);
    const { text } = encodeSession(project, state);
    const changed: Project = JSON.parse(JSON.stringify(project));
    changed.scenes[0]!.slides.push(createSlide('New'));
    const back = decodeSession(changed, text)!;
    expect(back).toEqual({ v: 1, c: 1, e: state.e, x: state.x });
  });

  it('ignores what is not its own suspend data', () => {
    const project = bigCourse(1);
    expect(decodeSession(project, '')).toBeNull();
    expect(decodeSession(project, 'some other tool wrote this')).toBeNull();
    expect(decodeSession(project, 'E1.***')).toBeNull();
    expect(decodeSession(project, 'E1.' + compress('not json'))).toBeNull();
  });
});

describe('suspend data and motion paths (P6.5)', () => {
  it('keeps where a path left an object, so a resumed course has it there', () => {
    const project = createEmptyProject();
    const slide = createSlide('Moving');
    slide.properties.onRevisit = 'resume';
    const box = createButtonObject('Box');
    const path = {
      ...createMotionPath('line', 'Across', [
        { x: 0, y: 0 },
        { x: 240, y: -30 },
      ]),
      duration: 1,
    };
    box.animations.motionPaths = [path];
    slide.baseLayer.objects.push(box);
    slide.triggers.push({
      id: createId('trigger'),
      owner: { kind: 'object', id: box.id },
      event: { type: 'timelineStart', layer: slide.baseLayer.id },
      action: { type: 'moveAlongPath', object: box.id, path: path.id },
      conditions: null,
      otherwise: null,
      enabled: true,
    });
    project.scenes = [{ ...createScene(), slides: [slide, createSlide('Next')] }];
    const engine = createEngine(project);
    engine.tick(0);
    engine.tick(1500);
    engine.next();
    const state = JSON.parse(JSON.stringify(engine.getState())) as SessionState;
    expect(state.sv?.[slide.id]?.m).toEqual({ [box.id]: [240, -30] });
    const back = decodeSession(project, encodeSession(project, state).text)!;
    expect(back.sv?.[slide.id]?.m).toEqual({ [box.id]: [240, -30] });
    const resumed = createEngine(project, { restore: back });
    resumed.jumpToSlide(slide.id);
    const view = resumed.getView().layers[0]!.objects.find((each) => each.id === box.id)!;
    expect(view.offset).toEqual({ x: 240, y: -30 });
  });
});

describe('suspend data and questions (P7.1)', () => {
  it('keeps answers, attempts and the shuffled order through encoding', () => {
    const project = createEmptyProject();
    const answered = quizSlide('multipleChoice', project.stage);
    const pending = quizSlide('multipleResponse', project.stage);
    (pending.question as ChoiceQuestion).shuffle = true;
    (pending.question as ChoiceQuestion).attempts = 3;
    project.scenes = [{ ...createScene(), slides: [answered, pending, createSlide('End')] }];
    const engine = createEngine(project, { random: () => 0 });
    engine.tick(0);
    engine.pointer('click', (answered.question as ChoiceQuestion).choices[0]!.object);
    engine.pointer('click', answered.question!.submit!);
    // On the second question: one wrong try.
    engine.pointer('click', (pending.question as ChoiceQuestion).choices[1]!.object);
    engine.pointer('click', pending.question!.submit!);
    const state = JSON.parse(JSON.stringify(engine.getState())) as SessionState;
    expect(state.q).toEqual({
      [answered.id]: { a: 1, r: 'c', s: 10, c: [0] },
      [pending.id]: { a: 1, o: [1, 2, 0] },
    });
    const back = decodeSession(project, encodeSession(project, state).text)!;
    expect(back.q).toEqual(state.q);
    // Squeezed hard, the answers are the last thing to go.
    const { dropped } = encodeSession(project, state, 10);
    expect(dropped.at(-1)).toBe('question answers');
  });
});

it('keeps what was typed and chosen in graded questions (P7.2)', () => {
  const project = createEmptyProject();
  const blank = quizSlide('fillInBlank', project.stage);
  const matching = quizSlide('matchingDropdown', project.stage);
  project.scenes = [{ ...createScene(), slides: [blank, matching, createSlide('End')] }];
  const engine = createEngine(project, { random: () => 0 });
  engine.tick(0);
  const entry = (blank.question as { entry: string }).entry;
  engine.input(entry, 'answer');
  engine.pointer('click', blank.question!.submit!);
  const pairs = (matching.question as { pairs: { select: string; match: string }[] }).pairs;
  engine.input(pairs[0]!.select, pairs[0]!.match);
  const state = JSON.parse(JSON.stringify(engine.getState())) as SessionState;
  expect(state.q?.[blank.id]).toEqual({ a: 1, r: 'c', s: 10, v: ['answer'] });
  expect(state.q?.[matching.id]?.v).toEqual([pairs[0]!.match, '', '']);
  const back = decodeSession(project, encodeSession(project, state).text)!;
  expect(back.q).toEqual(state.q);
});

it('keeps answered survey questions: no score, picks and what was typed (P7.3)', () => {
  const project = createEmptyProject();
  const pick = quizSlide('pickMany', project.stage);
  const essay = quizSlide('essay', project.stage);
  project.scenes = [{ ...createScene(), slides: [pick, essay, createSlide('End')] }];
  const engine = createEngine(project);
  engine.tick(0);
  const choices = (pick.question as { choices: { object: string }[] }).choices;
  engine.pointer('click', choices[1]!.object);
  engine.pointer('click', choices[2]!.object);
  engine.pointer('click', pick.question!.submit!);
  const entry = (essay.question as { entry: string }).entry;
  engine.input(entry, 'One.\nTwo.');
  engine.pointer('click', essay.question!.submit!);
  const state = JSON.parse(JSON.stringify(engine.getState())) as SessionState;
  expect(state.q).toEqual({
    [pick.id]: { a: 1, r: 'a', c: [1, 2] },
    [essay.id]: { a: 1, r: 'a', v: ['One.\nTwo.'] },
  });
  const back = decodeSession(project, encodeSession(project, state).text)!;
  expect(back.q).toEqual(state.q);
  // A course changed since, where the survey slide became a graded one: not answered there.
  const changed = structuredClone(project);
  changed.scenes[0]!.slides[0]!.question = quizSlide('multipleResponse', project.stage).question;
  const text = encodeSession(project, state).text;
  const other = decodeSession(changed, text);
  // The record is still read (same slides), but a survey result is not a graded one.
  expect(other?.q?.[pick.id]).toEqual({ a: 1 });
});

it('keeps freeform picks and a shortcut key’s presses (P7.4)', () => {
  const project = createEmptyProject();
  const pick = quizSlide('freePickMany', project.stage);
  const key = quizSlide('freeKey', project.stage);
  (key.question as { attempts: number }).attempts = 2;
  project.scenes = [{ ...createScene(), slides: [pick, key, createSlide('End')] }];
  const engine = createEngine(project);
  engine.tick(0);
  const choices = (pick.question as { choices: { object: string }[] }).choices;
  engine.pointer('click', choices[0]!.object);
  engine.pointer('click', pick.question!.submit!);
  engine.key('q', { alt: true });
  const state = JSON.parse(JSON.stringify(engine.getState())) as SessionState;
  expect(state.q).toEqual({
    [pick.id]: { a: 1, r: 'c', s: 10, c: [0] },
    [key.id]: { a: 1, v: ['Alt+Q'] },
  });
  const back = decodeSession(project, encodeSession(project, state).text)!;
  expect(back.q).toEqual(state.q);
});

it('keeps where freeform drag items were put, on targets or off (P7.4)', () => {
  const project = createEmptyProject();
  const drag = quizSlide('freeDrag', project.stage);
  const question = drag.question as { items: { object: string }[]; returnToStart: boolean };
  question.returnToStart = false;
  project.scenes = [{ ...createScene(), slides: [drag, createSlide('End')] }];
  const engine = createEngine(project);
  engine.tick(0);
  // Inside the Fruit bin (it snaps to its middle), and off every bin.
  engine.drop(question.items[0]!.object, 700, 250);
  engine.drop(question.items[2]!.object, 40, 650);
  const state = JSON.parse(JSON.stringify(engine.getState())) as SessionState;
  const target = (drag.question as { targets: string[] }).targets[0];
  expect(state.q?.[drag.id]?.v).toEqual([`${target}|750|296`, '', '|40|650']);
  const back = decodeSession(project, encodeSession(project, state).text)!;
  expect(back.q).toEqual(state.q);
});

it('keeps a Likert question’s ratings (P7.3)', () => {
  const project = createEmptyProject();
  const likert = quizSlide('likert', project.stage);
  project.scenes = [{ ...createScene(), slides: [likert, createSlide('End')] }];
  const engine = createEngine(project);
  engine.tick(0);
  const rows = (likert.question as { statements: { points: string[] }[] }).statements;
  rows.forEach((row, index) => engine.pointer('click', row.points[index]!));
  engine.pointer('click', likert.question!.submit!);
  const state = JSON.parse(JSON.stringify(engine.getState())) as SessionState;
  // Row r's point r, by position over the grid of 5: 0, 5 + 1 = 6, 10 + 2 = 12.
  expect(state.q).toEqual({ [likert.id]: { a: 1, r: 'a', c: [0, 6, 12] } });
  const back = decodeSession(project, encodeSession(project, state).text)!;
  expect(back.q).toEqual(state.q);
});

it('keeps a ranking’s order and the word in a which-word blank (P7.3)', () => {
  const project = createEmptyProject();
  const word = quizSlide('whichWord', project.stage);
  const ranking = quizSlide('ranking', project.stage);
  project.scenes = [{ ...createScene(), slides: [word, ranking, createSlide('End')] }];
  const engine = createEngine(project);
  engine.tick(0);
  const q = word.question as { blank: string; words: { object: string }[] };
  const blank = word.baseLayer.objects.find((object) => object.id === q.blank)!.frame;
  engine.drop(q.words[2]!.object, blank.x + 4, blank.y + 4);
  engine.pointer('click', word.question!.submit!);
  const items = (ranking.question as { items: { object: string }[] }).items.map((i) => i.object);
  const first = ranking.baseLayer.objects.find((object) => object.id === items[0])!.frame;
  // Item 1 dropped where item 0 stands: they swap; not submitted yet.
  engine.drop(items[1]!, first.x + 4, first.y + 4);
  const state = JSON.parse(JSON.stringify(engine.getState())) as SessionState;
  expect(state.q).toEqual({
    [word.id]: { a: 1, r: 'a', v: [q.words[2]!.object] },
    [ranking.id]: { a: 0, v: [items[1], items[0], items[2]] },
  });
  const back = decodeSession(project, encodeSession(project, state).text)!;
  expect(back.q).toEqual(state.q);
});

it('keeps where tiles were dropped in drag questions, as object ids (P7.2)', () => {
  const project = createEmptyProject();
  const matching = quizSlide('matchingDrag', project.stage);
  project.scenes = [{ ...createScene(), slides: [matching, createSlide('End')] }];
  const engine = createEngine(project, { random: () => 0 });
  engine.tick(0);
  const pairs = (matching.question as { pairs: { item: string; target: string }[] }).pairs;
  const target = matching.baseLayer.objects.find((object) => object.id === pairs[1]!.target)!;
  const middle = [
    target.frame.x + target.frame.width / 2,
    target.frame.y + target.frame.height / 2,
  ] as const;
  expect(engine.drop(pairs[0]!.item, ...middle)).toBe(true);
  const state = JSON.parse(JSON.stringify(engine.getState())) as SessionState;
  expect(state.q?.[matching.id]).toEqual({ a: 0, o: [1, 2, 0], v: [pairs[1]!.target, '', ''] });
  const back = decodeSession(project, encodeSession(project, state).text)!;
  expect(back.q).toEqual(state.q);
  // A course resumed from it shows the item where it was left.
  const resumed = createEngine(project, { random: () => 0, restore: back });
  resumed.tick(0);
  const offsetOf = (e: typeof engine) =>
    e.getView().layers[0]!.objects.find((object) => object.id === pairs[0]!.item)!.offset;
  expect(offsetOf(resumed)).toEqual(offsetOf(engine));
  expect(offsetOf(resumed)).toBeDefined();
});

it('keeps where a hotspot was marked, as the spot and the point (P7.2)', () => {
  const project = createEmptyProject();
  const hotspot = quizSlide('hotspot', project.stage);
  project.scenes = [{ ...createScene(), slides: [hotspot, createSlide('End')] }];
  const engine = createEngine(project);
  engine.tick(0);
  const q = hotspot.question as Extract<Question, { kind: 'hotspot' }>;
  const spot = hotspot.baseLayer.objects.find((object) => object.id === q.spots[1]!.object)!;
  const mark = [spot.frame.x + spot.frame.width / 2, spot.frame.y + spot.frame.height / 2] as const;
  expect(engine.mark(...mark)).toBe(true);
  const state = JSON.parse(JSON.stringify(engine.getState())) as SessionState;
  expect(state.q?.[hotspot.id]?.v).toEqual([q.spots[1]!.id, String(mark[0]), String(mark[1])]);
  const back = decodeSession(project, encodeSession(project, state).text)!;
  expect(back.q).toEqual(state.q);
  const resumed = createEngine(project, { restore: back });
  resumed.tick(0);
  const view = resumed.getView().layers[0]!.objects.find((object) => object.id === q.picture)!;
  expect(view.mark).toEqual({ x: mark[0], y: mark[1] });
  expect(
    resumed.getView().layers[0]!.objects.find((object) => object.id === spot.id)!.visible,
  ).toBe(false);
});

it('keeps a draw and the answers to drawn bank questions (P7.6)', () => {
  const project = createEmptyProject();
  const pool = createBank('Pool', project.stage);
  pool.slides.push(quizSlide('trueFalse', project.stage), quizSlide('numeric', project.stage));
  for (const slide of pool.slides) slide.question!.feedback.by = 'none';
  project.banks = [pool];
  const draw = createDrawSlide(pool.id);
  project.scenes = [{ ...createScene(), slides: [draw, createSlide('End')] }];
  const engine = createEngine(project, { random: () => 0 });
  engine.tick(0);
  const first = engine.getView().slideId!;
  const question = pool.slides.find((slide) => slide.id === first)!.question!;
  engine.pointer('click', question.submit!);
  const state = JSON.parse(JSON.stringify(engine.getState())) as SessionState;
  expect(state.d?.[draw.id]).toHaveLength(2);
  const back = decodeSession(project, encodeSession(project, state).text)!;
  expect(back.d).toEqual(state.d);
  expect(back.s).toBe(state.s);
  expect(back.vis).toEqual(state.vis);
});

it('keeps results reached and result timers (P7.7)', () => {
  const project = createEmptyProject();
  const question = quizSlide('multipleChoice', project.stage);
  const result = createResultSlide(project.stage);
  project.scenes = [{ ...createScene(), slides: [question, result] }];
  const state: SessionState = {
    v: 1,
    res: { [result.id]: { s: 10, m: 20 } },
    tm: { [result.id]: 12.3 },
  };
  const back = decodeSession(project, encodeSession(project, state).text)!;
  expect(back.res).toEqual(state.res);
  expect(back.tm).toEqual(state.tm);
});

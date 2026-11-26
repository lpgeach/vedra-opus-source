import {
  allSlides,
  createChoiceObject,
  createFeedbackLayer,
  FEEDBACK_WORDS,
  feedbackMasterOf,
  createLikertLabel,
  createLikertPoint,
  createDropdownObject,
  createDropTarget,
  createId,
  createSpot,
  createTextEntryObject,
  createTextObject,
  createTile,
  isChoiceQuestion,
  likertGrid,
  plainRichText,
  withSelectedState,
} from '@vedraopus/model';
import type {
  ChoiceQuestion,
  FeedbackRole,
  Question,
  RichText,
  SceneObject,
  Slide,
} from '@vedraopus/model';

/** The kinds answered by picking choice objects: graded (P7.1) or survey (P7.3). */
export type Picks = ChoiceQuestion | Extract<Question, { kind: 'pickOne' | 'pickMany' }>;
/** Whether picking one choice unpicks the others. */
const singlePick = (kind: Picks['kind']) =>
  kind === 'multipleChoice' || kind === 'trueFalse' || kind === 'pickOne';

type Matching = Extract<Question, { kind: 'matchingDropdown' }>;
type Sequence = Extract<Question, { kind: 'sequenceDropdown' }>;
type WordBank = Extract<Question, { kind: 'wordBank' }>;
type DragMatching = Extract<Question, { kind: 'matchingDrag' }>;
type DragSequence = Extract<Question, { kind: 'sequenceDrag' }>;
type Hotspot = Extract<Question, { kind: 'hotspot' }>;
import { editor } from './project-store';
import type { OpenProject } from './project-store';

/**
 * What Form View does to a question slide (docs/briefs/P7.1-question-model.md).
 * Each change is one undo step: the question itself, and the objects it names.
 */

/** The words of rich text as plain text, a line for each paragraph. */
export function plainWords(doc: RichText | null | undefined): string {
  if (!doc) return '';
  const words = (node: RichText['content'][number]): string =>
    node.type === 'text' ? (node.text ?? '') : (node.content ?? []).map(words).join('');
  return doc.content.map(words).join('\n');
}

const step = (label: string, run: () => void) => {
  editor.beginGesture(label);
  try {
    run();
  } finally {
    editor.commitGesture();
  }
};

/** An object on the slide: its base layer, or one of its overlays (a feedback message, P7.5). */
const objectOn = (slide: Slide, id: string | null): SceneObject | undefined => {
  if (id === null) return undefined;
  for (const layer of [slide.baseLayer, ...slide.layers]) {
    const found = layer.objects.find((object) => object.id === id);
    if (found) return found;
  }
  return undefined;
};

/** Change the question's settings. */
export function setQuestion(open: OpenProject, slide: Slide, question: Question, label: string) {
  step(label, () => open.history.execute('slide.setQuestion', { slideId: slide.id, question }));
}

/** Set an object's words (a prompt, a choice, a tile or a target), unless they are already those. */
export function setWords(open: OpenProject, slide: Slide, objectId: string | null, text: string) {
  const object = objectOn(slide, objectId);
  if (!object || (object.type !== 'text' && object.type !== 'choice' && object.type !== 'shape'))
    return;
  if (plainWords(object.props.text) === text) return;
  // New words keep how the first paragraph was set out (its alignment, say).
  const attrs = object.props.text?.content.find((block) => block.type === 'paragraph')?.attrs;
  const doc = plainRichText(text);
  if (attrs) {
    doc.content = doc.content.map((block) =>
      block.type === 'paragraph' ? { ...block, attrs: { ...attrs } } : block,
    );
  }
  step('Change question text', () =>
    open.history.execute('object.update', {
      objectId: object.id,
      changes: { props: { text: doc } },
    }),
  );
}

/** Add a choice: an object under the last one, and its entry in the question. */
export function addChoice(open: OpenProject, slide: Slide, question: Picks) {
  const objects = question.choices
    .map((choice) => objectOn(slide, choice.object))
    .filter((object): object is SceneObject => !!object);
  const last = objects.at(-1);
  const single = singlePick(question.kind);
  const mark = single ? 'radio' : 'checkbox';
  const object = createChoiceObject(
    'New answer',
    mark,
    last
      ? {
          x: last.frame.x,
          y: last.frame.y + 60,
          width: last.frame.width,
          height: last.frame.height,
        }
      : { x: 100, y: 200 },
    `Choice ${question.choices.length + 1}`,
  );
  object.timing = { start: 0, duration: 'untilEnd' };
  object.buttonSet = single ? (last?.buttonSet ?? createId('obj')) : null;
  const id = createId('choice');
  const next: Question = isChoiceQuestion(question)
    ? {
        ...question,
        choices: [
          ...question.choices,
          { id, object: object.id, correct: false, points: 0, feedback: '' },
        ],
      }
    : { ...question, choices: [...question.choices, { id, object: object.id }] };
  step('Add choice', () => {
    open.history.execute('object.add', { layerId: slide.baseLayer.id, object });
    open.history.execute('slide.setQuestion', { slideId: slide.id, question: next });
  });
}

/** Delete a choice and its object. */
export function deleteChoice(open: OpenProject, objectId: string) {
  step('Delete choice', () => open.history.execute('object.remove', { objectIds: [objectId] }));
}

/**
 * Move a choice up or down the list. Their objects swap places on the slide,
 * so the slide reads in the question's order.
 */
export function moveChoice(
  open: OpenProject,
  slide: Slide,
  question: Picks,
  from: number,
  to: number,
) {
  const a = question.choices[from];
  const b = question.choices[to];
  if (!a || !b) return;
  const first = objectOn(slide, a.object);
  const second = objectOn(slide, b.object);
  const swap = <T>(list: readonly T[]): T[] => {
    const out = [...list];
    [out[from], out[to]] = [out[to]!, out[from]!];
    return out;
  };
  const next: Question = isChoiceQuestion(question)
    ? { ...question, choices: swap(question.choices) }
    : { ...question, choices: swap(question.choices) };
  step('Move choice', () => {
    if (first && second) {
      open.history.execute('object.update', {
        objectId: first.id,
        changes: { frame: { x: second.frame.x, y: second.frame.y } },
      });
      open.history.execute('object.update', {
        objectId: second.id,
        changes: { frame: { x: first.frame.x, y: first.frame.y } },
      });
    }
    open.history.execute('slide.setQuestion', { slideId: slide.id, question: next });
  });
}

/**
 * Switch between multiple choice and multiple response: the marks change, the
 * choices share a button set only for multiple choice, and multiple choice
 * keeps the first correct answer only.
 */
export function setKind(
  open: OpenProject,
  slide: Slide,
  question: ChoiceQuestion,
  kind: 'multipleChoice' | 'multipleResponse',
) {
  if (kind === question.kind) return;
  const single = kind === 'multipleChoice';
  const set = single ? createId('obj') : null;
  const firstCorrect = question.choices.findIndex((choice) => choice.correct);
  step('Change question type', () => {
    for (const choice of question.choices) {
      const object = objectOn(slide, choice.object);
      if (!object) continue;
      open.history.execute('object.update', {
        objectId: object.id,
        changes: { buttonSet: set, props: { mark: single ? 'radio' : 'checkbox' } },
      });
    }
    open.history.execute('slide.setQuestion', {
      slideId: slide.id,
      question: {
        ...question,
        kind,
        choices: question.choices.map((choice, index) => ({
          ...choice,
          correct: single ? index === firstCorrect : choice.correct,
        })),
      },
    });
  });
}

/**
 * Switch a survey between pick one and pick many (P7.3): the marks change, and
 * the choices share a button set only for pick one. Nothing is right, so
 * nothing else changes.
 */
export function setPickKind(
  open: OpenProject,
  slide: Slide,
  question: Extract<Question, { kind: 'pickOne' | 'pickMany' }>,
  kind: 'pickOne' | 'pickMany',
) {
  if (kind === question.kind) return;
  const single = kind === 'pickOne';
  const set = single ? createId('obj') : null;
  step('Change question type', () => {
    for (const choice of question.choices) {
      const object = objectOn(slide, choice.object);
      if (!object) continue;
      open.history.execute('object.update', {
        objectId: object.id,
        changes: { buttonSet: set, props: { mark: single ? 'radio' : 'checkbox' } },
      });
    }
    open.history.execute('slide.setQuestion', {
      slideId: slide.id,
      question: { ...question, kind },
    });
  });
}

/** Mark a choice right (multiple choice: the only right one) or, for multiple response, not. */
export function setCorrect(
  open: OpenProject,
  slide: Slide,
  question: ChoiceQuestion,
  index: number,
  on: boolean,
) {
  const choices = question.choices.map((choice, i) =>
    question.kind === 'multipleChoice'
      ? { ...choice, correct: i === index ? on : on ? false : choice.correct }
      : i === index
        ? { ...choice, correct: on }
        : choice,
  );
  setQuestion(open, slide, { ...question, choices }, 'Change correct answer');
}

/** Give dropdowns the same options (a matching or sequence question's, kept in step with its words). */
function setOptions(
  open: OpenProject,
  slide: Slide,
  selects: readonly string[],
  options: string[],
) {
  for (const id of selects) {
    const object = objectOn(slide, id);
    if (object?.type !== 'dropdown') continue;
    if (JSON.stringify(object.props.options) === JSON.stringify(options)) continue;
    open.history.execute('object.update', { objectId: id, changes: { props: { options } } });
  }
}

/** Change a matching pair's match: the question, and every dropdown's options. */
export function setMatch(
  open: OpenProject,
  slide: Slide,
  question: Matching,
  index: number,
  match: string,
) {
  const words = match.trim();
  if (!words) return;
  const pairs = question.pairs.map((pair, i) => (i === index ? { ...pair, match: words } : pair));
  step('Change match', () => {
    open.history.execute('slide.setQuestion', {
      slideId: slide.id,
      question: { ...question, pairs },
    });
    setOptions(
      open,
      slide,
      pairs.map((pair) => pair.select),
      pairs.map((pair) => pair.match),
    );
  });
}

/** Add a pair: an item's text box and its dropdown, under the last pair. */
export function addPair(open: OpenProject, slide: Slide, question: Matching) {
  const last = question.pairs.at(-1);
  const lastItem = last && objectOn(slide, last.item);
  const lastSelect = last && objectOn(slide, last.select);
  const y = (lastItem?.frame.y ?? 140) + 60;
  const match = `Match ${question.pairs.length + 1}`;
  const item = createTextObject(
    `Item ${question.pairs.length + 1}`,
    { x: lastItem?.frame.x ?? 100, y, width: lastItem?.frame.width ?? 400, height: 44 },
    `Item ${question.pairs.length + 1}`,
  );
  const pairs = [...question.pairs];
  const select = createDropdownObject(
    [...pairs.map((pair) => pair.match), match],
    { x: lastSelect?.frame.x ?? 540, y, width: lastSelect?.frame.width ?? 400 },
    `Match ${question.pairs.length + 1}`,
  );
  for (const object of [item, select]) object.timing = { start: 0, duration: 'untilEnd' };
  const next = [...pairs, { id: createId('choice'), item: item.id, select: select.id, match }];
  step('Add pair', () => {
    open.history.execute('object.add', { layerId: slide.baseLayer.id, object: item });
    open.history.execute('object.add', { layerId: slide.baseLayer.id, object: select });
    open.history.execute('slide.setQuestion', {
      slideId: slide.id,
      question: { ...question, pairs: next },
    });
    setOptions(
      open,
      slide,
      next.map((pair) => pair.select),
      next.map((pair) => pair.match),
    );
  });
}

/** Delete a pair and both its objects; the other dropdowns lose its match. */
export function deletePair(open: OpenProject, slide: Slide, question: Matching, index: number) {
  const pair = question.pairs[index];
  if (!pair) return;
  const rest = question.pairs.filter((_, i) => i !== index);
  step('Delete pair', () => {
    open.history.execute('object.remove', { objectIds: [pair.item, pair.select] });
    setOptions(
      open,
      slide,
      rest.map((each) => each.select),
      rest.map((each) => each.match),
    );
  });
}

/** Set a sequence step's words (its place is its position): the question, and every dropdown's options. */
export function setStep(
  open: OpenProject,
  slide: Slide,
  question: Sequence,
  index: number,
  text: string,
) {
  const words = text.trim();
  if (!words) return;
  const steps = question.steps.map((each, i) => (i === index ? { ...each, text: words } : each));
  step('Change step', () => {
    open.history.execute('slide.setQuestion', {
      slideId: slide.id,
      question: { ...question, steps },
    });
    setOptions(
      open,
      slide,
      steps.map((each) => each.select),
      steps.map((each) => each.text),
    );
  });
}

/** Swap two steps' words, so the right order changes; the dropdowns stay where they are. */
export function moveStep(
  open: OpenProject,
  slide: Slide,
  question: Sequence,
  from: number,
  to: number,
) {
  const a = question.steps[from];
  const b = question.steps[to];
  if (!a || !b) return;
  const steps = question.steps.map((each, i) =>
    i === from ? { ...each, text: b.text } : i === to ? { ...each, text: a.text } : each,
  );
  setQuestion(open, slide, { ...question, steps }, 'Move step');
}

/** Add a step: a dropdown under the last one. */
export function addStep(open: OpenProject, slide: Slide, question: Sequence) {
  const last = question.steps.at(-1);
  const lastSelect = last && objectOn(slide, last.select);
  const text = `Step ${question.steps.length + 1}`;
  const texts = [...question.steps.map((each) => each.text), text];
  const select = createDropdownObject(
    texts,
    {
      x: lastSelect?.frame.x ?? 100,
      y: (lastSelect?.frame.y ?? 140) + 60,
      width: lastSelect?.frame.width ?? 400,
    },
    `Step ${question.steps.length + 1}`,
  );
  select.timing = { start: 0, duration: 'untilEnd' };
  const steps = [...question.steps, { id: createId('choice'), select: select.id, text }];
  step('Add step', () => {
    open.history.execute('object.add', { layerId: slide.baseLayer.id, object: select });
    open.history.execute('slide.setQuestion', {
      slideId: slide.id,
      question: { ...question, steps },
    });
    setOptions(
      open,
      slide,
      steps.map((each) => each.select),
      texts,
    );
  });
}

/** Delete a step and its dropdown; the others lose its words. */
export function deleteStep(open: OpenProject, slide: Slide, question: Sequence, index: number) {
  const gone = question.steps[index];
  if (!gone) return;
  const rest = question.steps.filter((_, i) => i !== index);
  step('Delete step', () => {
    open.history.execute('object.remove', { objectIds: [gone.select] });
    setOptions(
      open,
      slide,
      rest.map((each) => each.select),
      rest.map((each) => each.text),
    );
  });
}

// ---------------------------------------------------------------- drag kinds (P7.2 step B)

/** Add objects to the slide's base layer, shown for the whole slide, then set the question. */
function addParts(
  open: OpenProject,
  slide: Slide,
  objects: SceneObject[],
  question: Question,
  label: string,
) {
  for (const object of objects) object.timing = { start: 0, duration: 'untilEnd' };
  step(label, () => {
    for (const object of objects) {
      open.history.execute('object.add', { layerId: slide.baseLayer.id, object });
    }
    open.history.execute('slide.setQuestion', { slideId: slide.id, question });
  });
}

/** Delete answer parts' objects; the question loses the parts that named them. */
export function deleteParts(open: OpenProject, objectIds: string[], label: string) {
  step(label, () => open.history.execute('object.remove', { objectIds }));
}

/** Where the next tile goes: beside the last one if there is room on the stage, else under it. */
function nextFrame(open: OpenProject, last: SceneObject | undefined, across: boolean) {
  if (!last) return { x: 100, y: 300 };
  const { x, y, width, height } = last.frame;
  const room = x + 2 * width + 40 <= open.project.stage.width;
  return across && room
    ? { x: x + width + 40, y, width, height }
    : { x, y: y + height + 16, width, height };
}

/** Add a word tile to a word bank, beside the last. */
export function addWord(open: OpenProject, slide: Slide, question: WordBank) {
  const last = objectOn(slide, question.words.at(-1)?.object ?? null);
  const n = question.words.length + 1;
  const tile = createTile('another word', nextFrame(open, last, true), `Word ${n}`);
  addParts(
    open,
    slide,
    [tile],
    {
      ...question,
      words: [...question.words, { id: createId('choice'), object: tile.id, correct: false }],
    },
    'Add word',
  );
}

/** Mark a word right or not in the blank (any number may be right). */
export function setWordCorrect(
  open: OpenProject,
  slide: Slide,
  question: WordBank,
  index: number,
  correct: boolean,
) {
  const words = question.words.map((word, i) => (i === index ? { ...word, correct } : word));
  setQuestion(open, slide, { ...question, words }, 'Change correct answer');
}

/** Add a pair to a drag matching question: an item tile and its target, under the last pair. */
export function addDragPair(open: OpenProject, slide: Slide, question: DragMatching) {
  const last = question.pairs.at(-1);
  const n = question.pairs.length + 1;
  const item = createTile(
    `Item ${n}`,
    nextFrame(open, objectOn(slide, last?.item ?? null), false),
    `Item ${n}`,
  );
  const target = createDropTarget(
    `Match ${n}`,
    nextFrame(open, objectOn(slide, last?.target ?? null), false),
    `Target ${n}`,
  );
  addParts(
    open,
    slide,
    [item, target],
    {
      ...question,
      pairs: [...question.pairs, { id: createId('choice'), item: item.id, target: target.id }],
    },
    'Add pair',
  );
}

/** Add a step tile to a drag sequence, under the last. */
export function addDragStep(open: OpenProject, slide: Slide, question: DragSequence) {
  const last = objectOn(slide, question.steps.at(-1)?.object ?? null);
  const n = question.steps.length + 1;
  const tile = createTile(`Step ${n}`, nextFrame(open, last, false), `Step ${n}`);
  addParts(
    open,
    slide,
    [tile],
    { ...question, steps: [...question.steps, { id: createId('choice'), object: tile.id }] },
    'Add step',
  );
}

/**
 * Move a step of a drag sequence up or down the right order. The two tiles swap
 * places on the slide too, so the slide reads in the right order (the learner
 * sees them shuffled).
 */
export function moveDragStep(
  open: OpenProject,
  slide: Slide,
  question: DragSequence,
  from: number,
  to: number,
) {
  const a = question.steps[from];
  const b = question.steps[to];
  if (!a || !b) return;
  const first = objectOn(slide, a.object);
  const second = objectOn(slide, b.object);
  const steps = [...question.steps];
  steps[from] = b;
  steps[to] = a;
  step('Move step', () => {
    if (first && second) {
      open.history.execute('object.update', {
        objectId: first.id,
        changes: { frame: { x: second.frame.x, y: second.frame.y } },
      });
      open.history.execute('object.update', {
        objectId: second.id,
        changes: { frame: { x: first.frame.x, y: first.frame.y } },
      });
    }
    open.history.execute('slide.setQuestion', {
      slideId: slide.id,
      question: { ...question, steps },
    });
  });
}

// ---------------------------------------------------------------- survey drag kinds (P7.3 step B)

type WhichWord = Extract<Question, { kind: 'whichWord' }>;
type Ranking = Extract<Question, { kind: 'ranking' }>;

/** Add a word to a which-word survey, beside the last one. Nothing is right or wrong. */
export function addSurveyWord(open: OpenProject, slide: Slide, question: WhichWord) {
  const last = objectOn(slide, question.words.at(-1)?.object ?? null);
  const n = question.words.length + 1;
  const tile = createTile('another word', nextFrame(open, last, true), `Word ${n}`);
  addParts(
    open,
    slide,
    [tile],
    { ...question, words: [...question.words, { id: createId('choice'), object: tile.id }] },
    'Add word',
  );
}

/** Add an item to a ranking survey, below the last one. */
export function addRankingItem(open: OpenProject, slide: Slide, question: Ranking) {
  const last = objectOn(slide, question.items.at(-1)?.object ?? null);
  const n = question.items.length + 1;
  const tile = createTile(`Item ${n}`, nextFrame(open, last, false), `Item ${n}`);
  addParts(
    open,
    slide,
    [tile],
    { ...question, items: [...question.items, { id: createId('choice'), object: tile.id }] },
    'Add item',
  );
}

/**
 * Move a ranking item up or down the order the learner starts from. The two
 * tiles swap places on the slide too, so the slide shows that order.
 */
export function moveRankingItem(
  open: OpenProject,
  slide: Slide,
  question: Ranking,
  from: number,
  to: number,
) {
  const a = question.items[from];
  const b = question.items[to];
  if (!a || !b) return;
  const first = objectOn(slide, a.object);
  const second = objectOn(slide, b.object);
  const items = [...question.items];
  items[from] = b;
  items[to] = a;
  step('Move item', () => {
    if (first && second) {
      open.history.execute('object.update', {
        objectId: first.id,
        changes: { frame: { x: second.frame.x, y: second.frame.y } },
      });
      open.history.execute('object.update', {
        objectId: second.id,
        changes: { frame: { x: first.frame.x, y: first.frame.y } },
      });
    }
    open.history.execute('slide.setQuestion', {
      slideId: slide.id,
      question: { ...question, items },
    });
  });
}

// ---------------------------------------------------------------- Likert (P7.3 step C)

type Likert = Extract<Question, { kind: 'likert' }>;

/** The slide and its question as the project has them now (after commands in this step). */
const likertNow = (open: OpenProject, slideId: string) => {
  const slide = allSlides(open.history.project).find((each) => each.slide.id === slideId)?.slide;
  const question = slide?.question?.kind === 'likert' ? slide.question : null;
  return slide && question ? { slide, question } : null;
};

/**
 * Where the grid stands now: the box around its labels, statements and points,
 * or the new-slide place when it has none.
 */
function likertArea(open: OpenProject, slide: Slide, question: Likert) {
  const ids = [
    ...question.labels,
    ...question.statements.flatMap((statement) => [statement.text, ...statement.points]),
  ];
  const frames = ids.flatMap((id) => {
    const object = objectOn(slide, id);
    return object ? [object.frame] : [];
  });
  if (frames.length === 0) {
    const { width, height } = open.history.project.stage;
    const margin = Math.round(width * 0.08);
    return { x: margin, y: Math.round(height * 0.3) - 40, width: width - 2 * margin };
  }
  const x = Math.min(...frames.map((frame) => frame.x));
  const y = Math.min(...frames.map((frame) => frame.y));
  const right = Math.max(...frames.map((frame) => frame.x + frame.width));
  return { x, y, width: right - x };
}

/** Move every part of the grid to where `likertGrid` puts it (inside a step). */
function relayLikert(
  open: OpenProject,
  slideId: string,
  area: { x: number; y: number; width: number },
) {
  const now = likertNow(open, slideId);
  if (!now) return;
  const { slide, question } = now;
  const grid = likertGrid(area, question.labels.length);
  const place = (id: string, frame: { x: number; y: number; width: number; height: number }) => {
    const object = objectOn(slide, id);
    if (!object) return;
    const { x, y, width, height } = object.frame;
    if (x === frame.x && y === frame.y && width === frame.width && height === frame.height) return;
    open.history.execute('object.update', { objectId: id, changes: { frame } });
  };
  question.labels.forEach((id, column) => place(id, grid.label(column)));
  question.statements.forEach((statement, row) => {
    place(statement.text, grid.statement(row));
    statement.points.forEach((id, column) => place(id, grid.point(row, column)));
  });
}

/** Add a point at the right end of the scale, with a point for every statement. */
export function addLikertPoint(open: OpenProject, slide: Slide, question: Likert) {
  const area = likertArea(open, slide, question);
  const column = question.labels.length;
  const grid = likertGrid(area, column + 1);
  const label = createLikertLabel('New point', grid.label(column), `Scale ${column + 1}`);
  const points = question.statements.map((statement, row) =>
    createLikertPoint(
      grid.point(row, column),
      objectOn(slide, statement.points[0] ?? null)?.buttonSet ?? createId('obj'),
      `Statement ${row + 1} point ${column + 1}`,
    ),
  );
  const added = [label, ...points];
  for (const object of added) object.timing = { start: 0, duration: 'untilEnd' };
  step('Add scale point', () => {
    for (const object of added) {
      open.history.execute('object.add', { layerId: slide.baseLayer.id, object });
    }
    open.history.execute('slide.setQuestion', {
      slideId: slide.id,
      question: {
        ...question,
        labels: [...question.labels, label.id],
        statements: question.statements.map((statement, row) => ({
          ...statement,
          points: [...statement.points, points[row]!.id],
        })),
      },
    });
    relayLikert(open, slide.id, area);
  });
}

/** Delete a point of the scale: its label and every statement's point there. */
export function deleteLikertPoint(
  open: OpenProject,
  slide: Slide,
  question: Likert,
  column: number,
) {
  const label = question.labels[column];
  if (label === undefined) return;
  const area = likertArea(open, slide, question);
  const objectIds = [
    label,
    ...question.statements.flatMap((statement) => statement.points[column] ?? []),
  ];
  step('Delete scale point', () => {
    open.history.execute('object.remove', { objectIds });
    relayLikert(open, slide.id, area);
  });
}

/** Add a statement under the last, with a point for each label of the scale. */
export function addLikertStatement(open: OpenProject, slide: Slide, question: Likert) {
  const area = likertArea(open, slide, question);
  const row = question.statements.length;
  const grid = likertGrid(area, question.labels.length);
  const text = createTextObject('New statement', grid.statement(row), `Statement ${row + 1}`);
  const set = createId('obj');
  const points = question.labels.map((_, column) =>
    createLikertPoint(grid.point(row, column), set, `Statement ${row + 1} point ${column + 1}`),
  );
  addParts(
    open,
    slide,
    [text, ...points],
    {
      ...question,
      statements: [
        ...question.statements,
        { id: createId('choice'), text: text.id, points: points.map((point) => point.id) },
      ],
    },
    'Add statement',
  );
}

/** Delete a statement, its text and its points; the rows below close up. */
export function deleteLikertStatement(
  open: OpenProject,
  slide: Slide,
  question: Likert,
  row: number,
) {
  const statement = question.statements[row];
  if (!statement) return;
  const area = likertArea(open, slide, question);
  step('Delete statement', () => {
    open.history.execute('object.remove', { objectIds: [statement.text, ...statement.points] });
    relayLikert(open, slide.id, area);
  });
}

// ---------------------------------------------------------------- freeform (P7.4)

type FreePick = Extract<Question, { kind: 'freePickOne' | 'freePickMany' }>;

/** The button set a freeform pick-one question's choices share, or null for pick many. */
const freeSetOf = (slide: Slide, question: FreePick): string | null => {
  if (question.kind !== 'freePickOne') return null;
  for (const choice of question.choices) {
    const set = objectOn(slide, choice.object)?.buttonSet;
    if (set) return set;
  }
  return createId('obj');
};

/**
 * Make an object on the slide one of a freeform pick question's choices, or
 * stop it being one. A new choice gets a Selected state if it has none, and
 * for pick one joins the question's button set.
 */
export function setFreeChoice(
  open: OpenProject,
  slide: Slide,
  question: FreePick,
  objectId: string,
  on: boolean,
) {
  const object = objectOn(slide, objectId);
  if (!object) return;
  if (!on) {
    step('Remove choice', () => {
      if (question.kind === 'freePickOne' && object.buttonSet !== null) {
        open.history.execute('object.update', { objectId, changes: { buttonSet: null } });
      }
      open.history.execute('slide.setQuestion', {
        slideId: slide.id,
        question: {
          ...question,
          choices: question.choices.filter((choice) => choice.object !== objectId),
        },
      });
    });
    return;
  }
  if (question.choices.some((choice) => choice.object === objectId)) return;
  const set = freeSetOf(slide, question);
  const selected = withSelectedState(object).states.find((state) => state.id === 'selected')!;
  step('Add choice', () => {
    if (!object.states.some((state) => state.id === 'selected')) {
      open.history.execute('state.add', { objectId, state: selected });
    }
    if (object.buttonSet !== set) {
      open.history.execute('object.update', { objectId, changes: { buttonSet: set } });
    }
    open.history.execute('slide.setQuestion', {
      slideId: slide.id,
      question: {
        ...question,
        choices: [
          ...question.choices,
          { id: createId('choice'), object: objectId, correct: false },
        ],
      },
    });
  });
}

/** Mark a freeform choice right or not; pick one has one right answer. */
export function setFreeCorrect(
  open: OpenProject,
  slide: Slide,
  question: FreePick,
  index: number,
  correct: boolean,
) {
  const choices = question.choices.map((choice, i) => ({
    ...choice,
    correct: i === index ? correct : question.kind === 'freePickOne' ? false : choice.correct,
  }));
  setQuestion(open, slide, { ...question, choices }, 'Change correct answer');
}

/** Switch a freeform pick between one and many: the choices' button set follows. */
export function setFreePickKind(
  open: OpenProject,
  slide: Slide,
  question: FreePick,
  kind: 'freePickOne' | 'freePickMany',
) {
  if (kind === question.kind) return;
  const set = kind === 'freePickOne' ? createId('obj') : null;
  const first = question.choices.findIndex((choice) => choice.correct);
  step('Change question type', () => {
    for (const choice of question.choices) {
      if (objectOn(slide, choice.object)) {
        open.history.execute('object.update', {
          objectId: choice.object,
          changes: { buttonSet: set },
        });
      }
    }
    open.history.execute('slide.setQuestion', {
      slideId: slide.id,
      question: {
        ...question,
        kind,
        choices: question.choices.map((choice, index) => ({
          ...choice,
          correct: kind === 'freePickOne' ? index === first : choice.correct,
        })),
      },
    });
  });
}

/** Add a text entry to a freeform text question's slide and make it the question's. */
export function addFreeEntry(
  open: OpenProject,
  slide: Slide,
  question: Extract<Question, { kind: 'freeText' }>,
) {
  const entry = createTextEntryObject({ x: 100, y: 300 });
  addParts(open, slide, [entry], { ...question, entry: entry.id }, 'Add text entry');
}

/**
 * Make a question's missing feedback layer for `role` from the project's
 * feedback master, with the words it starts with (P7.5).
 */
export function makeFeedbackLayer(
  open: OpenProject,
  slide: Slide,
  question: Question,
  role: FeedbackRole,
) {
  const master = feedbackMasterOf(open.history.project);
  if (!master) return;
  const { layer, part, triggers } = createFeedbackLayer(master, role, FEEDBACK_WORDS[role]);
  step('Make feedback layer', () => {
    open.history.execute('layer.add', { slideId: slide.id, layer, triggers });
    open.history.execute('slide.setQuestion', {
      slideId: slide.id,
      question: { ...question, feedback: { ...question.feedback, [role]: part } } as Question,
    });
  });
}

/** Take the question away from a slide; its objects stay as they are. */
export function stopBeingQuestion(open: OpenProject, slide: Slide) {
  step('Stop being a question', () =>
    open.history.execute('slide.setQuestion', { slideId: slide.id, question: null }),
  );
}

// ---------------------------------------------------------------- hotspot (P7.2 step C)

/** Add a region to a hotspot question, beside the last one. */
export function addSpot(open: OpenProject, slide: Slide, question: Hotspot) {
  const last = objectOn(slide, question.spots.at(-1)?.object ?? null);
  const n = question.spots.length + 1;
  const spot = createSpot(nextFrame(open, last, true), `Spot ${n}`);
  addParts(
    open,
    slide,
    [spot],
    {
      ...question,
      spots: [...question.spots, { id: createId('choice'), object: spot.id, correct: false }],
    },
    'Add spot',
  );
}

/** Tick a hotspot region as one that counts as a correct answer. */
export function setSpotCorrect(
  open: OpenProject,
  slide: Slide,
  question: Hotspot,
  index: number,
  correct: boolean,
) {
  const spots = question.spots.map((spot, i) => (i === index ? { ...spot, correct } : spot));
  setQuestion(open, slide, { ...question, spots }, 'Change correct answer');
}

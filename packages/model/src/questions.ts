import { createId } from './ids';
import type {
  FeedbackPart,
  FeedbackRole,
  JumpTarget,
  KeyCombo,
  Question,
  SceneObject,
} from './schema';

/** A question's feedback layers that exist, by result (P7.5). */
export function feedbackParts(question: Question): { role: FeedbackRole; part: FeedbackPart }[] {
  const feedback = question.feedback as Partial<Record<FeedbackRole, FeedbackPart | null>>;
  const out: { role: FeedbackRole; part: FeedbackPart }[] = [];
  for (const role of ['correct', 'incorrect', 'tryAgain', 'answered'] as const) {
    const part = feedback[role];
    if (part) out.push({ role, part });
  }
  return out;
}

/** The question with its feedback parts changed by `change` (null takes a part away). */
export function mapFeedbackParts(
  question: Question,
  change: (part: FeedbackPart) => FeedbackPart | null,
): Question {
  const feedback: Record<string, unknown> = { ...question.feedback };
  for (const { role, part } of feedbackParts(question)) feedback[role] = change(part);
  return { ...question, feedback } as Question;
}

/** The slides a question's branches name (P7.1, P7.3). */
export function branchTargets(question: Question): string[] {
  return Object.values(question.branch as Record<string, JumpTarget | null>).flatMap((target) =>
    target?.kind === 'slide' ? [target.slide] : [],
  );
}

/** The question with branches to `removed` slides taken back to "the next slide" (null). */
export function withoutBranchesTo(question: Question, removed: ReadonlySet<string>): Question {
  const branch: Record<string, JumpTarget | null> = { ...question.branch };
  for (const [key, target] of Object.entries(branch)) {
    if (target?.kind === 'slide' && removed.has(target.slide)) branch[key] = null;
  }
  return { ...question, branch } as Question;
}

/** The question without the feedback layer `layerId` (deleted from the slide). */
export function withoutLayer(question: Question, layerId: string): Question {
  return mapFeedbackParts(question, (part) => (part.layer === layerId ? null : part));
}

/** Keys that only modify another (and Tab, kept for moving around): never a shortcut's answer. */
export const NOT_A_SHORTCUT = new Set([
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'AltGraph',
  'CapsLock',
  'Fn',
  'OS',
  'Tab',
]);

/**
 * A key and its modifiers as one text, `Ctrl+Shift+S`: how Form View shows a
 * shortcut, and what the engine compares (a single character without case).
 */
export function keyComboText(combo: KeyCombo): string {
  if (combo.key === '') return '';
  const key =
    combo.key === ' ' ? 'Space' : combo.key.length === 1 ? combo.key.toUpperCase() : combo.key;
  const held = [
    combo.ctrl && 'Ctrl',
    combo.alt && 'Alt',
    combo.shift && 'Shift',
    combo.meta && 'Meta',
  ].filter((each): each is string => !!each);
  return [...held, key].join('+');
}

/**
 * What each kind of question is made of (docs/briefs/P7.2-graded-types.md), so
 * validation, deleting, copying and the id checks need not know the kinds.
 */

/** An object a question names, the part it plays, and the type it must be. */
export interface QuestionObject {
  id: string;
  role: string;
  /** The type it must be, or `onStage` for any object the learner can see (freeform, P7.4). */
  type: SceneObject['type'] | 'onStage';
}

/** Every object the question names, with the type each must be. */
export function questionObjects(question: Question): QuestionObject[] {
  const out: QuestionObject[] = [];
  if (question.prompt) out.push({ id: question.prompt, role: 'prompt', type: 'text' });
  if (question.submit) out.push({ id: question.submit, role: 'submit button', type: 'button' });
  switch (question.kind) {
    case 'multipleChoice':
    case 'multipleResponse':
    case 'trueFalse':
      for (const choice of question.choices) {
        out.push({ id: choice.object, role: 'choice', type: 'choice' });
      }
      break;
    case 'pickOne':
    case 'pickMany':
      for (const choice of question.choices) {
        out.push({ id: choice.object, role: 'choice', type: 'choice' });
      }
      break;
    case 'freePickOne':
    case 'freePickMany':
      for (const choice of question.choices) {
        out.push({ id: choice.object, role: 'choice', type: 'onStage' });
      }
      break;
    case 'freeKey':
      break;
    case 'freeHotspot':
      for (const spot of question.spots)
        out.push({ id: spot.object, role: 'spot', type: 'onStage' });
      break;
    case 'freeDrag':
      for (const item of question.items)
        out.push({ id: item.object, role: 'item', type: 'onStage' });
      for (const target of question.targets)
        out.push({ id: target, role: 'target', type: 'onStage' });
      break;
    case 'fillInBlank':
    case 'numeric':
    case 'shortAnswer':
    case 'essay':
    case 'howMany':
    case 'freeText':
      if (question.entry) out.push({ id: question.entry, role: 'text entry', type: 'textEntry' });
      break;
    case 'matchingDropdown':
      for (const pair of question.pairs) {
        out.push({ id: pair.item, role: 'item', type: 'text' });
        out.push({ id: pair.select, role: 'dropdown', type: 'dropdown' });
      }
      break;
    case 'sequenceDropdown':
      for (const step of question.steps) {
        out.push({ id: step.select, role: 'dropdown', type: 'dropdown' });
      }
      break;
    case 'wordBank':
    case 'whichWord':
      if (question.blank) out.push({ id: question.blank, role: 'blank', type: 'shape' });
      for (const word of question.words) out.push({ id: word.object, role: 'word', type: 'shape' });
      break;
    case 'ranking':
      for (const item of question.items) out.push({ id: item.object, role: 'item', type: 'shape' });
      break;
    case 'likert':
      for (const label of question.labels) out.push({ id: label, role: 'label', type: 'text' });
      for (const statement of question.statements) {
        out.push({ id: statement.text, role: 'statement', type: 'text' });
        for (const point of statement.points)
          out.push({ id: point, role: 'point', type: 'choice' });
      }
      break;
    case 'matchingDrag':
      for (const pair of question.pairs) {
        out.push({ id: pair.item, role: 'item', type: 'shape' });
        out.push({ id: pair.target, role: 'target', type: 'shape' });
      }
      break;
    case 'sequenceDrag':
      for (const step of question.steps) out.push({ id: step.object, role: 'step', type: 'shape' });
      break;
    case 'hotspot':
      if (question.picture) out.push({ id: question.picture, role: 'picture', type: 'shape' });
      for (const spot of question.spots) out.push({ id: spot.object, role: 'spot', type: 'shape' });
      break;
  }
  return out;
}

/** The ids of the question's own parts (choices, pairs, steps), unique project-wide. */
export function questionPartIds(question: Question): string[] {
  switch (question.kind) {
    case 'multipleChoice':
    case 'multipleResponse':
    case 'trueFalse':
    case 'pickOne':
    case 'pickMany':
    case 'freePickOne':
    case 'freePickMany':
      return question.choices.map((choice) => choice.id);
    case 'freeDrag':
      return question.items.map((item) => item.id);
    case 'freeHotspot':
      return question.spots.map((spot) => spot.id);
    case 'matchingDropdown':
      return question.pairs.map((pair) => pair.id);
    case 'sequenceDropdown':
    case 'sequenceDrag':
      return question.steps.map((step) => step.id);
    case 'wordBank':
    case 'whichWord':
      return question.words.map((word) => word.id);
    case 'ranking':
      return question.items.map((item) => item.id);
    case 'likert':
      return question.statements.map((statement) => statement.id);
    case 'matchingDrag':
      return question.pairs.map((pair) => pair.id);
    case 'hotspot':
      return question.spots.map((spot) => spot.id);
    case 'fillInBlank':
    case 'numeric':
    case 'shortAnswer':
    case 'essay':
    case 'howMany':
    case 'freeText':
    case 'freeKey':
      return [];
  }
}

/**
 * The question without the objects in `removed`: a part that names one goes,
 * and the prompt, Submit or text entry is unset.
 */
export function withoutObjects(question: Question, removed: ReadonlySet<string>): Question {
  const keep = (id: string | null) => (id !== null && removed.has(id) ? null : id);
  // A deleted feedback message or button is no longer the layer's (P7.5).
  const kept = mapFeedbackParts(question, (part) => ({
    ...part,
    message: keep(part.message),
    button: keep(part.button),
  }));
  const base = { ...kept, prompt: keep(kept.prompt), submit: keep(kept.submit) };
  switch (base.kind) {
    case 'multipleChoice':
    case 'multipleResponse':
      return { ...base, choices: base.choices.filter((choice) => !removed.has(choice.object)) };
    case 'pickOne':
    case 'pickMany':
      return { ...base, choices: base.choices.filter((choice) => !removed.has(choice.object)) };
    case 'freePickOne':
    case 'freePickMany':
      return { ...base, choices: base.choices.filter((choice) => !removed.has(choice.object)) };
    case 'freeKey':
      return base;
    case 'freeHotspot':
      return { ...base, spots: base.spots.filter((spot) => !removed.has(spot.object)) };
    case 'freeDrag': {
      // A deleted target is no item's any more.
      const targets = base.targets.filter((target) => !removed.has(target));
      return {
        ...base,
        targets,
        items: base.items
          .filter((item) => !removed.has(item.object))
          .map((item) => ({
            ...item,
            target: item.target !== null && targets.includes(item.target) ? item.target : null,
          })),
      };
    }
    case 'trueFalse': {
      // True/false keeps both its choices; without one it is multiple choice (undo brings it back).
      const choices = base.choices.filter((choice) => !removed.has(choice.object));
      return choices.length === base.choices.length
        ? base
        : { ...base, kind: 'multipleChoice', choices };
    }
    case 'fillInBlank':
    case 'numeric':
    case 'shortAnswer':
    case 'essay':
    case 'howMany':
    case 'freeText':
      return { ...base, entry: keep(base.entry) };
    case 'matchingDropdown':
      return {
        ...base,
        pairs: base.pairs.filter((pair) => !removed.has(pair.item) && !removed.has(pair.select)),
      };
    case 'sequenceDropdown':
      return { ...base, steps: base.steps.filter((step) => !removed.has(step.select)) };
    case 'wordBank':
      return {
        ...base,
        blank: keep(base.blank),
        words: base.words.filter((word) => !removed.has(word.object)),
      };
    case 'whichWord':
      return {
        ...base,
        blank: keep(base.blank),
        words: base.words.filter((word) => !removed.has(word.object)),
      };
    case 'ranking':
      return { ...base, items: base.items.filter((item) => !removed.has(item.object)) };
    case 'likert': {
      // A deleted label takes its column (that point of every statement) with it;
      // a statement goes with its text or any point of a column that stays.
      const columns = base.labels.flatMap((label, index) => (removed.has(label) ? [] : [index]));
      return {
        ...base,
        labels: columns.map((index) => base.labels[index]!),
        statements: base.statements
          .filter(
            (statement) =>
              !removed.has(statement.text) &&
              columns.every((index) => {
                const point = statement.points[index];
                return point !== undefined && !removed.has(point);
              }),
          )
          .map((statement) => ({
            ...statement,
            points: columns.map((index) => statement.points[index]!),
          })),
      };
    }
    case 'matchingDrag':
      return {
        ...base,
        pairs: base.pairs.filter((pair) => !removed.has(pair.item) && !removed.has(pair.target)),
      };
    case 'sequenceDrag':
      return { ...base, steps: base.steps.filter((step) => !removed.has(step.object)) };
    case 'hotspot':
      return {
        ...base,
        picture: keep(base.picture),
        spots: base.spots.filter((spot) => !removed.has(spot.object)),
      };
  }
}

/** The question with new ids for its parts (for a copy). */
export function renewPartIds(question: Question): Question {
  switch (question.kind) {
    case 'multipleChoice':
    case 'multipleResponse':
    case 'trueFalse':
      return {
        ...question,
        choices: question.choices.map((choice) => ({ ...choice, id: createId('choice') })),
      };
    case 'pickOne':
    case 'pickMany':
      return {
        ...question,
        choices: question.choices.map((choice) => ({ ...choice, id: createId('choice') })),
      };
    case 'freePickOne':
    case 'freePickMany':
      return {
        ...question,
        choices: question.choices.map((choice) => ({ ...choice, id: createId('choice') })),
      };
    case 'freeDrag':
      return {
        ...question,
        items: question.items.map((item) => ({ ...item, id: createId('choice') })),
      };
    case 'freeHotspot':
      return {
        ...question,
        spots: question.spots.map((spot) => ({ ...spot, id: createId('choice') })),
      };
    case 'matchingDropdown':
      return {
        ...question,
        pairs: question.pairs.map((pair) => ({ ...pair, id: createId('choice') })),
      };
    case 'sequenceDropdown':
      return {
        ...question,
        steps: question.steps.map((step) => ({ ...step, id: createId('choice') })),
      };
    case 'sequenceDrag':
      return {
        ...question,
        steps: question.steps.map((step) => ({ ...step, id: createId('choice') })),
      };
    case 'wordBank':
      return {
        ...question,
        words: question.words.map((word) => ({ ...word, id: createId('choice') })),
      };
    case 'whichWord':
      return {
        ...question,
        words: question.words.map((word) => ({ ...word, id: createId('choice') })),
      };
    case 'ranking':
      return {
        ...question,
        items: question.items.map((item) => ({ ...item, id: createId('choice') })),
      };
    case 'likert':
      return {
        ...question,
        statements: question.statements.map((statement) => ({
          ...statement,
          id: createId('choice'),
        })),
      };
    case 'matchingDrag':
      return {
        ...question,
        pairs: question.pairs.map((pair) => ({ ...pair, id: createId('choice') })),
      };
    case 'hotspot':
      return {
        ...question,
        spots: question.spots.map((spot) => ({ ...spot, id: createId('choice') })),
      };
    case 'fillInBlank':
    case 'numeric':
    case 'shortAnswer':
    case 'essay':
    case 'howMany':
    case 'freeText':
    case 'freeKey':
      return question;
  }
}

/**
 * Every choice object the learner marks to answer, by position: the choices of
 * the choice and pick kinds, or a Likert question's points statement by
 * statement. The engine keeps which are chosen (`c`) by these positions.
 */
export function choiceMarks(question: Question): string[] {
  if (question.kind === 'likert') return question.statements.flatMap((each) => each.points);
  return pickedFrom(question).map((choice) => choice.object);
}

/**
 * The choices the learner picks among, graded or not (multiple choice and
 * response, true/false, pick one, pick many), in the question's order; empty
 * for the other kinds.
 */
export function pickedFrom(question: Question): readonly { id: string; object: string }[] {
  switch (question.kind) {
    case 'multipleChoice':
    case 'multipleResponse':
    case 'trueFalse':
    case 'pickOne':
    case 'pickMany':
    case 'freePickOne':
    case 'freePickMany':
      return question.choices;
    default:
      return [];
  }
}

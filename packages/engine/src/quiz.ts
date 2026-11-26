import { isChoiceQuestion, isSurveyQuestion, keyComboText } from '@vedraopus/model';
import type { NumericCondition, Question, SurveyQuestion } from '@vedraopus/model';

/**
 * Marking a question's answer (docs/briefs/P7.1-question-model.md). Pure: the
 * engine works out which choices are chosen and what happens next.
 */

export interface Marked {
  /** Something was given: a choice, words or a number, every dropdown chosen. */
  answered: boolean;
  correct: boolean;
  /** Points earned, never below 0. */
  score: number;
}

/**
 * What the learner gave: the chosen choices (choice kinds), or what was typed
 * or chosen in each part, by position (text entry: one; matching: a dropdown
 * per pair; sequence: a dropdown per step).
 */
export interface Answer {
  chosen: readonly string[];
  values: readonly string[];
}

/**
 * Where a freeform drag item is (P7.4), from its saved value: `target|x|y`,
 * the target possibly empty (left off every target) and the item's middle in
 * stage units; '' (or anything else) is home, null.
 */
export function freePlace(value: string): { target: string; x: number; y: number } | null {
  const match = /^([^|]*)\|(-?\d+(?:\.\d+)?)\|(-?\d+(?:\.\d+)?)$/.exec(value);
  return match ? { target: match[1]!, x: Number(match[2]), y: Number(match[3]) } : null;
}

/** A number as a learner might type it: `3.5`, or `3,5` where a comma is the decimal mark. */
export function readNumber(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed.includes('.') ? trimmed : trimmed.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

const meets = (condition: NumericCondition, n: number): boolean => {
  switch (condition.op) {
    case 'equal':
      return n === condition.value;
    case 'notEqual':
      return n !== condition.value;
    case 'less':
      return n < condition.value;
    case 'lessOrEqual':
      return n <= condition.value;
    case 'greater':
      return n > condition.value;
    case 'greaterOrEqual':
      return n >= condition.value;
    case 'between':
      return (
        n >= Math.min(condition.from, condition.to) && n <= Math.max(condition.from, condition.to)
      );
  }
};

/**
 * Whether `answer` answers `question`, and what it scores
 * (docs/briefs/P7.1-question-model.md, P7.2-graded-types.md).
 */
export function markAnswer(question: Question, answer: Answer): Marked {
  if (isSurveyQuestion(question)) return markSurvey(question, answer);
  const whole = (answered: boolean, correct: boolean): Marked => ({
    answered,
    correct: answered && correct,
    score: answered && correct && question.scoring.by === 'question' ? question.scoring.points : 0,
  });
  switch (question.kind) {
    case 'multipleChoice':
    case 'multipleResponse':
    case 'trueFalse': {
      const picked = new Set(answer.chosen);
      const right = question.choices.filter((choice) => choice.correct).map((choice) => choice.id);
      const correct =
        right.length > 0 &&
        right.every((id) => picked.has(id)) &&
        [...picked].every((id) => right.includes(id)) &&
        (question.kind === 'multipleResponse' || picked.size === 1);
      const score =
        question.scoring.by === 'question'
          ? correct
            ? question.scoring.points
            : 0
          : Math.max(
              0,
              question.choices
                .filter((choice) => picked.has(choice.id))
                .reduce((sum, choice) => sum + choice.points, 0),
            );
      return { answered: picked.size > 0, correct, score };
    }
    case 'freePickOne':
    case 'freePickMany': {
      // Freeform picks (P7.4): the objects selected, scored by question.
      const picked = new Set(answer.chosen);
      const right = question.choices.filter((choice) => choice.correct).map((choice) => choice.id);
      return whole(
        picked.size > 0,
        right.length > 0 &&
          right.every((id) => picked.has(id)) &&
          [...picked].every((id) => right.includes(id)),
      );
    }
    case 'freeDrag': {
      // Each item's place: right when it is on the target it belongs on, or on none for a decoy.
      const on = question.items.map((_, i) => freePlace(answer.values[i] ?? '')?.target ?? '');
      return whole(
        question.items.length > 0 && answer.values.some((value) => freePlace(value) !== null),
        question.items.every((item, i) => on[i] === (item.target ?? '')),
      );
    }
    case 'freeKey': {
      // The key pressed, as its text (`Ctrl+S`).
      const pressed = answer.values[0] ?? '';
      const wanted = keyComboText(question.key);
      return whole(pressed !== '', wanted !== '' && pressed === wanted);
    }
    case 'freeText':
    case 'fillInBlank': {
      const typed = (answer.values[0] ?? '').trim();
      const fold = (text: string) =>
        question.caseSensitive ? text.trim() : text.trim().toLowerCase();
      return whole(
        typed !== '',
        question.answers.some((each) => fold(each) === fold(typed)),
      );
    }
    case 'numeric': {
      const typed = answer.values[0] ?? '';
      const n = readNumber(typed);
      return whole(
        typed.trim() !== '',
        n !== null && question.answers.some((each) => meets(each, n)),
      );
    }
    case 'matchingDropdown': {
      const values = question.pairs.map((_, i) => answer.values[i] ?? '');
      return whole(
        question.pairs.length > 0 && values.every((value) => value !== ''),
        question.pairs.every((pair, i) => values[i] === pair.match),
      );
    }
    case 'sequenceDropdown': {
      const values = question.steps.map((_, i) => answer.values[i] ?? '');
      return whole(
        question.steps.length > 0 && values.every((value) => value !== ''),
        question.steps.every((step, i) => values[i] === step.text),
      );
    } // The drag kinds (P7.2 step B): `values` are where things were dropped.
    case 'wordBank': {
      // The word (object id) in the blank, or ''.
      const placed = answer.values[0] ?? '';
      const word = question.words.find((each) => each.object === placed);
      return whole(placed !== '', word?.correct ?? false);
    }
    case 'matchingDrag': {
      // For each pair, the target (object id) its item is on, or ''.
      const on = question.pairs.map((_, i) => answer.values[i] ?? '');
      return whole(
        question.pairs.length > 0 && on.some((target) => target !== ''),
        question.pairs.every((pair, i) => on[i] === pair.target),
      );
    }
    case 'sequenceDrag': {
      // The step objects in the order the learner left them.
      const order = question.steps.map((_, i) => answer.values[i] ?? '');
      return whole(
        question.steps.length > 0,
        question.steps.every((step, i) => order[i] === step.object),
      );
    }
    case 'freeHotspot':
    case 'hotspot': {
      // The engine has worked out which spot the learner's mark is in: its id,
      // then the mark's position in stage units. A mark outside every spot gets ''.
      const spot = question.spots.find((each) => each.id === (answer.values[0] ?? ''));
      return whole(answer.values.length >= 3, !!spot?.correct);
    }
  }
}

/**
 * A survey answer (docs/briefs/P7.3-survey-types.md): nothing is right or
 * wrong and nothing scores, so it is only answered or not.
 */
function markSurvey(question: SurveyQuestion, answer: Answer): Marked {
  const typed = answer.values[0] ?? '';
  const answered = (() => {
    switch (question.kind) {
      case 'pickOne':
      case 'pickMany':
        return answer.chosen.length > 0;
      case 'shortAnswer':
      case 'essay':
        return typed.trim() !== '';
      case 'howMany':
        return readNumber(typed) !== null;
      case 'whichWord':
        // The word (object id) in the blank, or ''.
        return typed !== '';
      case 'ranking':
        // The order the tiles stand in is the answer, moved or not.
        return question.items.length > 0;
      case 'likert':
        // For each statement, the position of its chosen point, or '': every one rated.
        return (
          question.statements.length > 0 &&
          question.statements.every((_, row) => (answer.values[row] ?? '') !== '')
        );
    }
  })();
  return { answered, correct: false, score: 0 };
}

/** The most points the question can give: what a correct answer is worth (0 for a survey). */
export function bestScore(question: Question): number {
  if (isSurveyQuestion(question)) return 0;
  if (question.scoring.by === 'question' || !isChoiceQuestion(question)) {
    return question.scoring.by === 'question' ? question.scoring.points : 0;
  }
  const points = question.choices.filter((choice) => choice.correct).map((choice) => choice.points);
  return Math.max(
    0,
    points.reduce((sum, value) => sum + value, 0),
  );
}

/** A random order of `count` items (Fisher–Yates), from `random` (0 ≤ r < 1). */
export function shuffled(count: number, random: () => number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

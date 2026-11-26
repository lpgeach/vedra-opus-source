import { keyComboText } from '@vedraopus/model';
import type { Question } from '@vedraopus/model';
import { freePlace } from '@vedraopus/engine';
import type { SavedQuestion } from '@vedraopus/engine';
import type { InteractionAnswer, LmsInteraction } from './driver';

/**
 * A finished question as the LMS records it (docs/briefs/P7.7-result-slides.md):
 * its interaction type, the learner's answer and the right one as parts, and
 * the result. Choices, items and steps are named by letter in position order,
 * as SCORM 1.2 requires. A Likert question is one interaction per statement.
 */

const LETTERS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const letter = (index: number) => LETTERS[index] ?? String(index);
const list = (indexes: readonly number[]): InteractionAnswer => ({
  kind: 'list',
  items: indexes.map(letter),
});
const text = (words: string): InteractionAnswer => ({ kind: 'text', text: words });
const positions = (count: number) => Array.from({ length: count }, (_, index) => index);

/** The interactions for `question` (on slide `id`) finished as `record` says; none if unfinished. */
export function interactionsOf(
  id: string,
  question: Question,
  record: SavedQuestion | undefined,
  latency?: number,
): LmsInteraction[] {
  if (!record?.r) return [];
  const result: LmsInteraction['result'] =
    record.r === 'c' ? 'correct' : record.r === 'i' ? 'wrong' : 'neutral';
  const chosen = record.c ?? [];
  const values = record.v ?? [];
  const one = (
    type: LmsInteraction['type'],
    response: InteractionAnswer,
    correct?: InteractionAnswer,
  ): LmsInteraction[] => [
    {
      id,
      type,
      response,
      ...(correct ? { correct } : {}),
      result,
      ...(latency !== undefined ? { latency } : {}),
    },
  ];
  const right = (flags: readonly boolean[]) =>
    flags.flatMap((flag, index) => (flag ? [index] : []));

  switch (question.kind) {
    case 'trueFalse':
      // The first choice is True.
      return one(
        'true-false',
        { kind: 'bool', value: chosen[0] === 0 },
        { kind: 'bool', value: question.choices[0]?.correct === true },
      );
    case 'multipleChoice':
    case 'multipleResponse':
    case 'freePickOne':
    case 'freePickMany':
      return one('choice', list(chosen), list(right(question.choices.map((c) => c.correct))));
    case 'pickOne':
    case 'pickMany':
      return one('choice', list(chosen));
    case 'fillInBlank':
    case 'freeText':
      return one(
        'fill-in',
        text(values[0] ?? ''),
        question.answers[0] ? text(question.answers[0]) : undefined,
      );
    case 'shortAnswer':
      return one('fill-in', text(values[0] ?? ''));
    case 'essay':
      return one('long-fill-in', text(values[0] ?? ''));
    case 'numeric': {
      const equal = question.answers.find((each) => each.op === 'equal');
      return one(
        'numeric',
        text(values[0] ?? ''),
        equal && equal.op === 'equal' ? text(String(equal.value)) : undefined,
      );
    }
    case 'howMany':
      return one('numeric', text(values[0] ?? ''));
    case 'matchingDropdown':
      return one(
        'matching',
        {
          kind: 'pairs',
          pairs: question.pairs.flatMap((_, i): [string, string][] => {
            const match = question.pairs.findIndex((pair) => pair.match === values[i]);
            return match >= 0 ? [[letter(i), letter(match)]] : [];
          }),
        },
        { kind: 'pairs', pairs: question.pairs.map((_, i) => [letter(i), letter(i)]) },
      );
    case 'matchingDrag':
      return one(
        'matching',
        {
          kind: 'pairs',
          pairs: question.pairs.flatMap((_, i): [string, string][] => {
            const target = question.pairs.findIndex((pair) => pair.target === values[i]);
            return target >= 0 ? [[letter(i), letter(target)]] : [];
          }),
        },
        { kind: 'pairs', pairs: question.pairs.map((_, i) => [letter(i), letter(i)]) },
      );
    case 'sequenceDropdown':
      return one(
        'sequencing',
        list(values.map((value) => question.steps.findIndex((step) => step.text === value))),
        list(positions(question.steps.length)),
      );
    case 'sequenceDrag':
      return one(
        'sequencing',
        list(values.map((value) => question.steps.findIndex((step) => step.object === value))),
        list(positions(question.steps.length)),
      );
    case 'ranking':
      return one(
        'sequencing',
        list(values.map((value) => question.items.findIndex((item) => item.object === value))),
      );
    case 'wordBank':
    case 'whichWord': {
      const placed = question.words.findIndex((word) => word.object === values[0]);
      const response = list(placed >= 0 ? [placed] : []);
      return question.kind === 'wordBank'
        ? one('choice', response, list(right(question.words.map((word) => word.correct))))
        : one('choice', response);
    }
    case 'hotspot':
    case 'freeHotspot': {
      const marked = question.spots.findIndex((spot) => spot.id === values[0]);
      return one(
        'choice',
        list(marked >= 0 ? [marked] : []),
        list(right(question.spots.map((spot) => spot.correct))),
      );
    }
    case 'freeDrag':
      return one(
        'matching',
        {
          kind: 'pairs',
          pairs: question.items.flatMap((_, i): [string, string][] => {
            const on = freePlace(values[i] ?? '')?.target ?? '';
            const target = question.targets.indexOf(on);
            return target >= 0 ? [[letter(i), letter(target)]] : [];
          }),
        },
        {
          kind: 'pairs',
          pairs: question.items.flatMap((item, i): [string, string][] =>
            item.target ? [[letter(i), letter(question.targets.indexOf(item.target))]] : [],
          ),
        },
      );
    case 'freeKey':
      return one('fill-in', text(values[0] ?? ''), text(keyComboText(question.key)));
    case 'likert': {
      // One a statement: the point chosen in its row, by letter.
      const columns = question.labels.length;
      return question.statements.map((_, row) => {
        const at = chosen.find((index) => index >= row * columns && index < (row + 1) * columns);
        return {
          id: `${id}-${row + 1}`,
          type: 'likert' as const,
          response: list(at === undefined ? [] : [at - row * columns]),
          result,
          ...(latency !== undefined ? { latency } : {}),
        };
      });
    }
  }
}

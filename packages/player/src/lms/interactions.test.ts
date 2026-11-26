import {
  createEmptyProject,
  createQuestionSlide,
  createScene,
  createSlide,
} from '@vedraopus/model';
import type { ChoiceQuestion, Question, Slide } from '@vedraopus/model';
import { createEngine } from '@vedraopus/engine';
import { describe, expect, it } from 'vitest';
import { formatAnswer } from './driver';
import type { InteractionAnswer } from './driver';
import { interactionsOf } from './interactions';

/** Interactions for the LMS (docs/briefs/P7.7-result-slides.md). */

/** Play `slide` alone, answer it with `answer`, and give its interactions. */
function played(slide: Slide, answer: (engine: ReturnType<typeof createEngine>) => void) {
  slide.question!.feedback.by = 'none';
  const project = createEmptyProject('Interactions');
  project.scenes = [{ ...createScene(), slides: [slide, createSlide('End')] }];
  const engine = createEngine(project, { random: () => 0.5 });
  engine.tick(0);
  answer(engine);
  engine.pointer('click', slide.question!.submit!);
  return interactionsOf(slide.id, slide.question!, engine.getState().q?.[slide.id], 3);
}
const stage = { width: 1280, height: 720 };
const make = (kind: Question['kind']) => createQuestionSlide(kind, stage);

describe('interactionsOf', () => {
  it('gives multiple choice its chosen letter, the right one, and the result', () => {
    const slide = make('multipleChoice');
    const q = slide.question as ChoiceQuestion;
    expect(played(slide, (e) => e.pointer('click', q.choices[2]!.object))).toEqual([
      {
        id: slide.id,
        type: 'choice',
        response: { kind: 'list', items: ['c'] },
        correct: { kind: 'list', items: ['a'] },
        result: 'wrong',
        latency: 3,
      },
    ]);
  });

  it('gives true/false as true or false', () => {
    const slide = make('trueFalse');
    const q = slide.question as ChoiceQuestion;
    const [one] = played(slide, (e) => e.pointer('click', q.choices[0]!.object));
    expect(one).toMatchObject({
      type: 'true-false',
      response: { kind: 'bool', value: true },
      correct: { kind: 'bool', value: true },
      result: 'correct',
    });
  });

  it('gives fill in the blank, an essay and numeric their words', () => {
    const blank = make('fillInBlank');
    const entry = (blank.question as { entry: string }).entry;
    expect(played(blank, (e) => e.input(entry, 'answer'))[0]).toMatchObject({
      type: 'fill-in',
      response: { kind: 'text', text: 'answer' },
      correct: { kind: 'text', text: 'answer' },
      result: 'correct',
    });
    const essay = make('essay');
    const essayEntry = (essay.question as { entry: string }).entry;
    expect(played(essay, (e) => e.input(essayEntry, 'Long\nwords'))[0]).toMatchObject({
      type: 'long-fill-in',
      response: { kind: 'text', text: 'Long\nwords' },
      result: 'neutral',
    });
    const numeric = make('numeric');
    const numericEntry = (numeric.question as { entry: string }).entry;
    expect(played(numeric, (e) => e.input(numericEntry, '9'))[0]).toMatchObject({
      type: 'numeric',
      response: { kind: 'text', text: '9' },
      correct: { kind: 'text', text: '10' },
      result: 'wrong',
    });
  });

  it('gives matching its pairs and sequencing its order, by letter', () => {
    const matching = make('matchingDropdown');
    const pairs = (matching.question as Extract<Question, { kind: 'matchingDropdown' }>).pairs;
    // The first two swapped: a with b, b with a; c with c.
    const [m] = played(matching, (e) => {
      e.input(pairs[0]!.select, pairs[1]!.match);
      e.input(pairs[1]!.select, pairs[0]!.match);
      e.input(pairs[2]!.select, pairs[2]!.match);
    });
    expect(m).toMatchObject({
      type: 'matching',
      response: {
        kind: 'pairs',
        pairs: [
          ['a', 'b'],
          ['b', 'a'],
          ['c', 'c'],
        ],
      },
      correct: {
        kind: 'pairs',
        pairs: [
          ['a', 'a'],
          ['b', 'b'],
          ['c', 'c'],
        ],
      },
      result: 'wrong',
    });
    const sequence = make('sequenceDropdown');
    const steps = (sequence.question as Extract<Question, { kind: 'sequenceDropdown' }>).steps;
    const [s] = played(sequence, (e) => {
      steps.forEach((step, i) => e.input(step.select, steps[i]!.text));
    });
    expect(s).toMatchObject({
      type: 'sequencing',
      response: { kind: 'list', items: ['a', 'b', 'c'] },
      correct: { kind: 'list', items: ['a', 'b', 'c'] },
      result: 'correct',
    });
  });

  it('gives a Likert question an interaction a statement', () => {
    const slide = make('likert');
    const rows = (slide.question as Extract<Question, { kind: 'likert' }>).statements;
    const found = played(slide, (e) => {
      rows.forEach((row, index) => e.pointer('click', row.points[index]!));
    });
    expect(found.map((each) => [each.id, each.type, each.response, each.result])).toEqual([
      [`${slide.id}-1`, 'likert', { kind: 'list', items: ['a'] }, 'neutral'],
      [`${slide.id}-2`, 'likert', { kind: 'list', items: ['b'] }, 'neutral'],
      [`${slide.id}-3`, 'likert', { kind: 'list', items: ['c'] }, 'neutral'],
    ]);
  });

  it('gives nothing for a question not finished', () => {
    const slide = make('multipleChoice');
    expect(interactionsOf(slide.id, slide.question!, { a: 0 })).toEqual([]);
    expect(interactionsOf(slide.id, slide.question!, undefined)).toEqual([]);
  });
});

describe('formatAnswer', () => {
  it('writes SCORM 1.2’s forms, and SCORM 2004’s (which xAPI shares)', () => {
    const list: InteractionAnswer = { kind: 'list', items: ['a', 'c'] };
    const pairs: InteractionAnswer = {
      kind: 'pairs',
      pairs: [
        ['a', 'b'],
        ['b', 'a'],
      ],
    };
    expect(formatAnswer(list, 'scorm12')).toBe('a,c');
    expect(formatAnswer(list, 'scorm2004')).toBe('a[,]c');
    expect(formatAnswer(pairs, 'scorm12')).toBe('a.b,b.a');
    expect(formatAnswer(pairs, 'scorm2004')).toBe('a[.]b[,]b[.]a');
    expect(formatAnswer({ kind: 'bool', value: true }, 'scorm12')).toBe('t');
    expect(formatAnswer({ kind: 'bool', value: false }, 'scorm2004')).toBe('false');
    expect(formatAnswer({ kind: 'text', text: 'x'.repeat(300) }, 'scorm12')).toHaveLength(255);
  });
});

import { isChoiceQuestion } from '@vedraopus/model';
import type { ChoiceQuestion, NumericCondition, Question, Slide } from '@vedraopus/model';
import type { OpenProject } from '../project-store';
import {
  addChoice,
  addDragPair,
  addDragStep,
  addLikertPoint,
  addLikertStatement,
  addPair,
  addRankingItem,
  addSpot,
  addStep,
  addSurveyWord,
  addWord,
  deleteChoice,
  deleteLikertPoint,
  deleteLikertStatement,
  deletePair,
  deleteParts,
  deleteStep,
  moveChoice,
  moveDragStep,
  moveRankingItem,
  moveStep,
  setCorrect,
  setMatch,
  setQuestion,
  setSpotCorrect,
  setStep,
  setWordCorrect,
  setWords,
} from '../question-edit';
import {
  FreeDragAnswers,
  FreeHotspotAnswers,
  FreeKeyAnswers,
  FreePickAnswers,
  FreeTextEntry,
} from './FreeformAnswers';
import { NumericInput } from './NumericInput';
import { Words } from './QuestionWords';

interface AnswersProps<Q extends Question = Question> {
  open: OpenProject;
  slide: Slide;
  question: Q;
  /** The words of an object on the slide. */
  words: (objectId: string | null) => string;
}

/** Form View's answers, by kind (docs/briefs/P7.2-graded-types.md). */
export function Answers(props: AnswersProps) {
  const { question } = props;
  if (isChoiceQuestion(question)) return <ChoiceAnswers {...props} question={question} />;
  switch (question.kind) {
    case 'fillInBlank':
      return <BlankAnswers {...props} question={question} />;
    case 'numeric':
      return <NumericAnswers {...props} question={question} />;
    case 'matchingDropdown':
      return <MatchingAnswers {...props} question={question} />;
    case 'sequenceDropdown':
      return <SequenceAnswers {...props} question={question} />;
    case 'wordBank':
      return <WordBankAnswers {...props} question={question} />;
    case 'matchingDrag':
      return <DragMatchingAnswers {...props} question={question} />;
    case 'sequenceDrag':
      return <DragSequenceAnswers {...props} question={question} />;
    case 'hotspot':
      return <HotspotAnswers {...props} question={question} />;
    case 'pickOne':
    case 'pickMany':
      return <PickAnswers {...props} question={question} />;
    case 'whichWord':
      return <WhichWordAnswers {...props} question={question} />;
    case 'ranking':
      return <RankingAnswers {...props} question={question} />;
    case 'likert':
      return <LikertAnswers {...props} question={question} />;
    case 'freePickOne':
    case 'freePickMany':
      return <FreePickAnswers {...props} question={question} />;
    case 'freeText':
      return (
        <>
          <FreeTextEntry {...props} question={question} />
          <BlankAnswers {...props} question={question} />
        </>
      );
    case 'freeKey':
      return <FreeKeyAnswers {...props} question={question} />;
    case 'freeDrag':
      return <FreeDragAnswers {...props} question={question} />;
    case 'freeHotspot':
      return <FreeHotspotAnswers {...props} question={question} />;
    case 'shortAnswer':
    case 'essay':
    case 'howMany':
      return (
        <p className="muted" data-testid="question-any-answer">
          {question.kind === 'howMany'
            ? 'Any number the learner types is accepted.'
            : 'Any answer the learner types is accepted.'}
        </p>
      );
  }
}

type Pick = Extract<Question, { kind: 'pickOne' | 'pickMany' }>;
type WhichWord = Extract<Question, { kind: 'whichWord' }>;
type Ranking = Extract<Question, { kind: 'ranking' }>;
type Likert = Extract<Question, { kind: 'likert' }>;

/** A Likert question's scale and statements (P7.3); the slide's grid follows. */
function LikertAnswers({ open, slide, question, words }: AnswersProps<Likert>) {
  return (
    <>
      <p className="muted">The scale, from one end to the other (2 to 10 points):</p>
      <ol className="question-choices">
        {question.labels.map((label, index) => (
          <li key={label} data-testid="question-scale-point">
            <Words
              label={`Scale point ${index + 1} text`}
              value={words(label)}
              onCommit={(text) => setWords(open, slide, label, text)}
            />
            <button
              type="button"
              aria-label={`Delete scale point ${index + 1}`}
              disabled={question.labels.length <= 2}
              onClick={() => deleteLikertPoint(open, slide, question, index)}
            >
              Delete
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        disabled={question.labels.length >= 10}
        onClick={() => addLikertPoint(open, slide, question)}
      >
        Add scale point
      </button>
      <p className="muted">The statements the learner rates on it:</p>
      <ol className="question-choices">
        {question.statements.map((statement, index) => (
          <li key={statement.id} data-testid="question-statement">
            <Words
              label={`Statement ${index + 1} text`}
              value={words(statement.text)}
              onCommit={(text) => setWords(open, slide, statement.text, text)}
            />
            <button
              type="button"
              aria-label={`Delete statement ${index + 1}`}
              onClick={() => deleteLikertStatement(open, slide, question, index)}
            >
              Delete
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        disabled={question.statements.length >= 10}
        onClick={() => addLikertStatement(open, slide, question)}
      >
        Add statement
      </button>
    </>
  );
}

/** A which-word survey's words: any one may go in the blank (P7.3). */
function WhichWordAnswers({ open, slide, question, words }: AnswersProps<WhichWord>) {
  return (
    <>
      <p className="muted">Words the learner may put in the blank (any one is an answer):</p>
      <ol className="question-choices">
        {question.words.map((word, index) => (
          <li key={word.id} data-testid="question-word">
            <Words
              label={`Word ${index + 1} text`}
              value={words(word.object)}
              onCommit={(text) => setWords(open, slide, word.object, text)}
            />
            <button
              type="button"
              aria-label={`Delete word ${index + 1}`}
              onClick={() => deleteParts(open, [word.object], 'Delete word')}
            >
              Delete
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        disabled={question.words.length >= 10}
        onClick={() => addSurveyWord(open, slide, question)}
      >
        Add word
      </button>
    </>
  );
}

/** A ranking survey's items, in the order the learner starts from (P7.3). */
function RankingAnswers({ open, slide, question, words }: AnswersProps<Ranking>) {
  return (
    <>
      <p className="muted">
        The items, in the order the learner starts from; they drag them into their own:
      </p>
      <ol className="question-choices">
        {question.items.map((item, index) => (
          <li key={item.id} data-testid="question-item">
            <Words
              label={`Item ${index + 1} text`}
              value={words(item.object)}
              onCommit={(text) => setWords(open, slide, item.object, text)}
            />
            <Move
              what="item"
              n={index + 1}
              count={question.items.length}
              onMove={(to) => moveRankingItem(open, slide, question, index, to)}
              onDelete={() => deleteParts(open, [item.object], 'Delete item')}
            />
          </li>
        ))}
      </ol>
      <button
        type="button"
        disabled={question.items.length >= 10}
        onClick={() => addRankingItem(open, slide, question)}
      >
        Add item
      </button>
    </>
  );
}

/** A survey's choices (docs/briefs/P7.3-survey-types.md): words only, nothing right or wrong. */
function PickAnswers({ open, slide, question, words }: AnswersProps<Pick>) {
  return (
    <>
      <ol className="question-choices">
        {question.choices.map((choice, index) => {
          const n = index + 1;
          return (
            <li key={choice.id} data-testid="question-choice">
              <Words
                label={`Choice ${n} text`}
                value={words(choice.object)}
                onCommit={(text) => setWords(open, slide, choice.object, text)}
              />
              <Move
                what="choice"
                n={n}
                count={question.choices.length}
                onMove={(to) => moveChoice(open, slide, question, index, to)}
                onDelete={() => deleteChoice(open, choice.object)}
              />
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        disabled={question.choices.length >= 20}
        onClick={() => addChoice(open, slide, question)}
      >
        Add choice
      </button>
    </>
  );
}

function Move({
  what,
  n,
  count,
  onMove,
  onDelete,
}: {
  what: string;
  n: number;
  count: number;
  onMove: (to: number) => void;
  onDelete?: () => void;
}) {
  return (
    <>
      <button
        type="button"
        aria-label={`Move ${what} ${n} up`}
        disabled={n === 1}
        onClick={() => onMove(n - 2)}
      >
        ▲
      </button>
      <button
        type="button"
        aria-label={`Move ${what} ${n} down`}
        disabled={n === count}
        onClick={() => onMove(n)}
      >
        ▼
      </button>
      {onDelete && (
        <button type="button" aria-label={`Delete ${what} ${n}`} onClick={onDelete}>
          Delete
        </button>
      )}
    </>
  );
}

function ChoiceAnswers({ open, slide, question, words }: AnswersProps<ChoiceQuestion>) {
  const single = question.kind !== 'multipleResponse';
  const fixed = question.kind === 'trueFalse';
  const byChoice = question.scoring.by === 'choice';
  const set = (choices: ChoiceQuestion['choices'], label: string) =>
    setQuestion(open, slide, { ...question, choices }, label);
  return (
    <>
      <ol className="question-choices">
        {question.choices.map((choice, index) => {
          const n = index + 1;
          return (
            <li key={choice.id} data-testid="question-choice">
              <input
                type={single ? 'radio' : 'checkbox'}
                name={`correct-${slide.id}`}
                aria-label={`Choice ${n} is correct`}
                checked={choice.correct}
                onChange={(event) => setCorrect(open, slide, question, index, event.target.checked)}
              />
              <Words
                label={`Choice ${n} text`}
                value={words(choice.object)}
                onCommit={(text) => setWords(open, slide, choice.object, text)}
              />
              {byChoice && (
                <NumericInput
                  aria-label={`Choice ${n} points`}
                  className="question-points"
                  value={String(choice.points)}
                  min={-1000}
                  max={1000}
                  undoLabel="Change points"
                  onValue={(points) =>
                    points !== null &&
                    set(
                      question.choices.map((each, i) => (i === index ? { ...each, points } : each)),
                      'Change points',
                    )
                  }
                />
              )}
              {!fixed && (
                <Move
                  what="choice"
                  n={n}
                  count={question.choices.length}
                  onMove={(to) => moveChoice(open, slide, question, index, to)}
                  onDelete={() => deleteChoice(open, choice.object)}
                />
              )}
              {question.feedback.by === 'choice' && (
                <Words
                  label={`Choice ${n} feedback`}
                  value={choice.feedback}
                  placeholder="Feedback when this is chosen"
                  onCommit={(feedback) =>
                    set(
                      question.choices.map((each, i) =>
                        i === index ? { ...each, feedback } : each,
                      ),
                      'Change feedback',
                    )
                  }
                />
              )}
            </li>
          );
        })}
      </ol>
      {!fixed && (
        <button
          type="button"
          disabled={question.choices.length >= 20}
          onClick={() => addChoice(open, slide, question)}
        >
          Add choice
        </button>
      )}
      {!question.choices.some((each) => each.correct) && (
        <p className="field-problem" role="status" data-testid="question-warning">
          No answer is marked correct yet.
        </p>
      )}
    </>
  );
}

type Blank = Extract<Question, { kind: 'fillInBlank' | 'freeText' }>;

function BlankAnswers({ open, slide, question }: AnswersProps<Blank>) {
  const set = (patch: { answers?: string[]; caseSensitive?: boolean }, label: string) =>
    setQuestion(open, slide, { ...question, ...patch }, label);
  return (
    <>
      <p className="muted">Answers that count as right (any one of them):</p>
      <ol className="question-choices">
        {question.answers.map((answer, index) => (
          <li key={`${index}/${answer}`} data-testid="question-answer">
            <Words
              label={`Answer ${index + 1}`}
              value={answer}
              onCommit={(text) =>
                text.trim() &&
                set(
                  {
                    answers: question.answers.map((each, i) => (i === index ? text.trim() : each)),
                  },
                  'Change answer',
                )
              }
            />
            <button
              type="button"
              aria-label={`Delete answer ${index + 1}`}
              onClick={() =>
                set({ answers: question.answers.filter((_, i) => i !== index) }, 'Delete answer')
              }
            >
              Delete
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        disabled={question.answers.length >= 20}
        onClick={() => set({ answers: [...question.answers, 'another answer'] }, 'Add answer')}
      >
        Add answer
      </button>
      <label className="question-inline">
        <input
          type="checkbox"
          checked={question.caseSensitive}
          onChange={(event) => set({ caseSensitive: event.target.checked }, 'Change case')}
        />
        Capitals matter
      </label>
      {question.answers.length === 0 && (
        <p className="field-problem" role="status" data-testid="question-warning">
          No answer counts as right yet.
        </p>
      )}
    </>
  );
}

type Numeric = Extract<Question, { kind: 'numeric' }>;
const OPERATORS: [NumericCondition['op'], string][] = [
  ['equal', 'equal to'],
  ['notEqual', 'not equal to'],
  ['less', 'less than'],
  ['lessOrEqual', 'at most'],
  ['greater', 'more than'],
  ['greaterOrEqual', 'at least'],
  ['between', 'between'],
];

function NumericAnswers({ open, slide, question }: AnswersProps<Numeric>) {
  const replace = (index: number, condition: NumericCondition | null, label: string) =>
    setQuestion(
      open,
      slide,
      {
        ...question,
        answers:
          condition === null
            ? question.answers.filter((_, i) => i !== index)
            : question.answers.map((each, i) => (i === index ? condition : each)),
      },
      label,
    );
  const number = (label: string, value: number, onValue: (n: number) => void) => (
    <NumericInput
      aria-label={label}
      className="question-points"
      value={String(value)}
      undoLabel="Change number"
      onValue={(n) => n !== null && onValue(n)}
    />
  );
  return (
    <>
      <p className="muted">Right when the number is (any one of these):</p>
      <ol className="question-choices">
        {question.answers.map((condition, index) => {
          const n = index + 1;
          return (
            <li key={index} data-testid="question-answer">
              <select
                aria-label={`Condition ${n}`}
                value={condition.op}
                onChange={(event) => {
                  const op = event.target.value as NumericCondition['op'];
                  const value = condition.op === 'between' ? condition.from : condition.value;
                  replace(
                    index,
                    op === 'between' ? { op, from: value, to: value + 10 } : { op, value },
                    'Change condition',
                  );
                }}
              >
                {OPERATORS.map(([op, name]) => (
                  <option key={op} value={op}>
                    {name}
                  </option>
                ))}
              </select>
              {condition.op === 'between' ? (
                <>
                  {number(`Condition ${n} from`, condition.from, (from) =>
                    replace(index, { ...condition, from }, 'Change condition'),
                  )}
                  <span>and</span>
                  {number(`Condition ${n} to`, condition.to, (to) =>
                    replace(index, { ...condition, to }, 'Change condition'),
                  )}
                </>
              ) : (
                number(`Condition ${n} value`, condition.value, (value) =>
                  replace(index, { ...condition, value }, 'Change condition'),
                )
              )}
              <button
                type="button"
                aria-label={`Delete condition ${n}`}
                onClick={() => replace(index, null, 'Delete condition')}
              >
                Delete
              </button>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        disabled={question.answers.length >= 10}
        onClick={() =>
          setQuestion(
            open,
            slide,
            { ...question, answers: [...question.answers, { op: 'equal', value: 0 }] },
            'Add condition',
          )
        }
      >
        Add condition
      </button>
      {question.answers.length === 0 && (
        <p className="field-problem" role="status" data-testid="question-warning">
          No number counts as right yet.
        </p>
      )}
    </>
  );
}

type Matching = Extract<Question, { kind: 'matchingDropdown' }>;

function MatchingAnswers({ open, slide, question, words }: AnswersProps<Matching>) {
  return (
    <>
      <p className="muted">Each item, and the match the learner chooses for it:</p>
      <ol className="question-choices">
        {question.pairs.map((pair, index) => {
          const n = index + 1;
          return (
            <li key={pair.id} data-testid="question-pair">
              <Words
                label={`Item ${n} text`}
                value={words(pair.item)}
                onCommit={(text) => setWords(open, slide, pair.item, text)}
              />
              <span aria-hidden="true">→</span>
              <Words
                label={`Item ${n} match`}
                value={pair.match}
                onCommit={(text) => setMatch(open, slide, question, index, text)}
              />
              <button
                type="button"
                aria-label={`Delete pair ${n}`}
                onClick={() => deletePair(open, slide, question, index)}
              >
                Delete
              </button>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        disabled={question.pairs.length >= 10}
        onClick={() => addPair(open, slide, question)}
      >
        Add pair
      </button>
    </>
  );
}

type Sequence = Extract<Question, { kind: 'sequenceDropdown' }>;

function SequenceAnswers({ open, slide, question }: AnswersProps<Sequence>) {
  return (
    <>
      <p className="muted">The steps in their right order (the learner sees them shuffled):</p>
      <ol className="question-choices">
        {question.steps.map((step, index) => {
          const n = index + 1;
          return (
            <li key={step.id} data-testid="question-step">
              <Words
                label={`Step ${n} text`}
                value={step.text}
                onCommit={(text) => setStep(open, slide, question, index, text)}
              />
              <Move
                what="step"
                n={n}
                count={question.steps.length}
                onMove={(to) => moveStep(open, slide, question, index, to)}
                onDelete={() => deleteStep(open, slide, question, index)}
              />
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        disabled={question.steps.length >= 10}
        onClick={() => addStep(open, slide, question)}
      >
        Add step
      </button>
    </>
  );
}

type WordBank = Extract<Question, { kind: 'wordBank' }>;

function WordBankAnswers({ open, slide, question, words }: AnswersProps<WordBank>) {
  return (
    <>
      <p className="muted">Words the learner may put in the blank; tick the right ones:</p>
      <ol className="question-choices">
        {question.words.map((word, index) => (
          <li key={word.id} data-testid="question-word">
            <input
              type="checkbox"
              aria-label={`Word ${index + 1} is correct`}
              checked={word.correct}
              onChange={(event) =>
                setWordCorrect(open, slide, question, index, event.target.checked)
              }
            />
            <Words
              label={`Word ${index + 1} text`}
              value={words(word.object)}
              onCommit={(text) => setWords(open, slide, word.object, text)}
            />
            <button
              type="button"
              aria-label={`Delete word ${index + 1}`}
              onClick={() => deleteParts(open, [word.object], 'Delete word')}
            >
              Delete
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        disabled={question.words.length >= 10}
        onClick={() => addWord(open, slide, question)}
      >
        Add word
      </button>
      {!question.words.some((word) => word.correct) && (
        <p className="field-problem" role="status" data-testid="question-warning">
          No word is marked right yet.
        </p>
      )}
    </>
  );
}

type DragMatching = Extract<Question, { kind: 'matchingDrag' }>;

function DragMatchingAnswers({ open, slide, question, words }: AnswersProps<DragMatching>) {
  return (
    <>
      <p className="muted">Each item tile and the target it belongs on:</p>
      <ol className="question-choices">
        {question.pairs.map((pair, index) => (
          <li key={pair.id} data-testid="question-pair">
            <Words
              label={`Item ${index + 1} text`}
              value={words(pair.item)}
              onCommit={(text) => setWords(open, slide, pair.item, text)}
            />
            <span aria-hidden="true">→</span>
            <Words
              label={`Target ${index + 1} text`}
              value={words(pair.target)}
              onCommit={(text) => setWords(open, slide, pair.target, text)}
            />
            <button
              type="button"
              aria-label={`Delete pair ${index + 1}`}
              onClick={() => deleteParts(open, [pair.item, pair.target], 'Delete pair')}
            >
              Delete
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        disabled={question.pairs.length >= 10}
        onClick={() => addDragPair(open, slide, question)}
      >
        Add pair
      </button>
    </>
  );
}

type DragSequence = Extract<Question, { kind: 'sequenceDrag' }>;

function DragSequenceAnswers({ open, slide, question, words }: AnswersProps<DragSequence>) {
  return (
    <>
      <p className="muted">The steps in their right order (the learner sees them shuffled):</p>
      <ol className="question-choices">
        {question.steps.map((step, index) => (
          <li key={step.id} data-testid="question-step">
            <Words
              label={`Step ${index + 1} text`}
              value={words(step.object)}
              onCommit={(text) => setWords(open, slide, step.object, text)}
            />
            <Move
              what="step"
              n={index + 1}
              count={question.steps.length}
              onMove={(to) => moveDragStep(open, slide, question, index, to)}
              onDelete={() => deleteParts(open, [step.object], 'Delete step')}
            />
          </li>
        ))}
      </ol>
      <button
        type="button"
        disabled={question.steps.length >= 10}
        onClick={() => addDragStep(open, slide, question)}
      >
        Add step
      </button>
    </>
  );
}

type Hotspot = Extract<Question, { kind: 'hotspot' }>;

function HotspotAnswers({ open, slide, question }: AnswersProps<Hotspot>) {
  return (
    <>
      <p className="muted">
        The picture is the object on the slide. Position the regions over it; the learner sees only
        the picture. Tick the regions that count as right:
      </p>
      <ol className="question-choices">
        {question.spots.map((spot, index) => (
          <li key={spot.id} data-testid="question-spot">
            <input
              type="checkbox"
              aria-label={`Spot ${index + 1} is correct`}
              checked={spot.correct}
              onChange={(event) =>
                setSpotCorrect(open, slide, question, index, event.target.checked)
              }
            />
            <span>{`Spot ${index + 1}`}</span>
            <button
              type="button"
              aria-label={`Delete spot ${index + 1}`}
              onClick={() => deleteParts(open, [spot.object], 'Delete spot')}
            >
              Delete
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        disabled={question.spots.length >= 10}
        onClick={() => addSpot(open, slide, question)}
      >
        Add spot
      </button>
      {!question.spots.some((spot) => spot.correct) && (
        <p className="field-problem" role="status" data-testid="question-warning">
          No spot is marked right yet.
        </p>
      )}
    </>
  );
}

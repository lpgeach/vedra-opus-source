import { allSlides, freeformKinds, isChoiceQuestion, isSurveyQuestion } from '@vedraopus/model';
import type { GradedQuestion, JumpTarget, Question, Slide, SurveyQuestion } from '@vedraopus/model';
import type { ReactNode } from 'react';
import type { OpenProject } from '../project-store';
import {
  plainWords,
  setFreePickKind,
  setKind,
  setPickKind,
  setQuestion,
  setWords,
  stopBeingQuestion,
} from '../question-edit';
import { FeedbackWords } from './FeedbackWords';
import { Answers } from './QuestionAnswers';
import { Words } from './QuestionWords';
import { NumericInput } from './NumericInput';

/**
 * Form View (docs/briefs/P7.1-question-model.md): a question slide's question,
 * its answers and its settings, edited as a form. The words are the slide's
 * own objects; everything else is the question.
 */
export function QuestionForm({ open, slide }: { open: OpenProject; slide: Slide }) {
  const question = slide.question!;
  const set = (patch: Partial<GradedQuestion>, label: string) =>
    setQuestion(open, slide, { ...question, ...patch } as Question, label);
  const words = (objectId: string | null) => {
    const object = objectId
      ? slide.baseLayer.objects.find((each) => each.id === objectId)
      : undefined;
    return object && (object.type === 'text' || object.type === 'choice' || object.type === 'shape')
      ? plainWords(object.props.text)
      : '';
  };
  const choice = isChoiceQuestion(question);
  // Narrowed for the graded rows; a survey has its own (docs/briefs/P7.3-survey-types.md).
  const graded = isSurveyQuestion(question) ? null : question;
  const survey = isSurveyQuestion(question) ? question : null;
  const slides = allSlides(open.history.project).map(({ slide: each }) => each);
  // A converted slide's prompt and Submit are the author's own objects (P7.4).
  const freeform = (freeformKinds as readonly string[]).includes(question.kind);
  const textObjects = slide.baseLayer.objects.filter((object) => object.type === 'text');
  const buttons = slide.baseLayer.objects.filter((object) => object.type === 'button');

  return (
    <section className="question-form" data-testid="question-form" aria-label="Question form">
      <Row label="Type">
        {choice && question.kind !== 'trueFalse' ? (
          <select
            aria-label="Question type"
            value={question.kind}
            onChange={(event) =>
              setKind(
                open,
                slide,
                question,
                event.target.value as 'multipleChoice' | 'multipleResponse',
              )
            }
          >
            <option value="multipleChoice">Multiple choice (one answer)</option>
            <option value="multipleResponse">Multiple response (any number of answers)</option>
          </select>
        ) : question.kind === 'pickOne' || question.kind === 'pickMany' ? (
          <select
            aria-label="Question type"
            value={question.kind}
            onChange={(event) =>
              setPickKind(open, slide, question, event.target.value as 'pickOne' | 'pickMany')
            }
          >
            <option value="pickOne">Pick one (survey)</option>
            <option value="pickMany">Pick many (survey)</option>
          </select>
        ) : question.kind === 'freePickOne' || question.kind === 'freePickMany' ? (
          <select
            aria-label="Question type"
            value={question.kind}
            onChange={(event) =>
              setFreePickKind(
                open,
                slide,
                question,
                event.target.value as 'freePickOne' | 'freePickMany',
              )
            }
          >
            <option value="freePickOne">Pick one (freeform)</option>
            <option value="freePickMany">Pick many (freeform)</option>
          </select>
        ) : (
          <p className="question-kind" data-testid="question-kind">
            {KIND_NAMES[question.kind]}
          </p>
        )}
      </Row>

      {freeform && (
        <Row label="Parts">
          <label className="question-inline">
            <span>Question text box</span>
            <select
              aria-label="Question text box"
              value={question.prompt ?? ''}
              onChange={(event) =>
                setQuestion(
                  open,
                  slide,
                  { ...question, prompt: event.target.value || null },
                  'Change question text box',
                )
              }
            >
              <option value="">None</option>
              {textObjects.map((object) => (
                <option key={object.id} value={object.id}>
                  {object.name}
                </option>
              ))}
            </select>
          </label>
          {question.kind !== 'freeKey' && (
            <label className="question-inline">
              <span>Submit button</span>
              <select
                aria-label="Submit button"
                value={question.submit ?? ''}
                onChange={(event) =>
                  setQuestion(
                    open,
                    slide,
                    { ...question, submit: event.target.value || null },
                    'Change submit button',
                  )
                }
              >
                <option value="">None</option>
                {buttons.map((object) => (
                  <option key={object.id} value={object.id}>
                    {object.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="button" onClick={() => stopBeingQuestion(open, slide)}>
            Stop Being a Question
          </button>
        </Row>
      )}

      <Row label="Question">
        {question.prompt ? (
          <Words
            label="Question text"
            value={words(question.prompt)}
            rows={3}
            onCommit={(text) => setWords(open, slide, question.prompt, text)}
          />
        ) : freeform ? (
          <p className="muted">No text box is chosen as the question.</p>
        ) : (
          <p className="muted">The question’s text box was deleted from the slide.</p>
        )}
      </Row>

      <Row label="Answers">
        <Answers open={open} slide={slide} question={question} words={words} />
      </Row>

      {graded ? (
        <>
          <Row label="Score">
            <select
              aria-label="Score by"
              value={graded.scoring.by}
              onChange={(event) =>
                set(
                  {
                    scoring:
                      event.target.value === 'choice'
                        ? { by: 'choice' }
                        : { by: 'question', points: 10 },
                  },
                  'Change scoring',
                )
              }
            >
              <option value="question">By question</option>
              {choice && <option value="choice">By choice</option>}
            </select>
            {graded.scoring.by === 'question' && (
              <label className="question-inline">
                <span>Points</span>
                <NumericInput
                  aria-label="Points"
                  value={String(graded.scoring.points)}
                  min={0}
                  max={1000}
                  undoLabel="Change points"
                  onValue={(points) =>
                    points !== null && set({ scoring: { by: 'question', points } }, 'Change points')
                  }
                />
              </label>
            )}
          </Row>

          <Row label="Attempts">
            <select
              aria-label="Attempts allowed"
              value={graded.attempts === null ? 'unlimited' : String(graded.attempts)}
              onChange={(event) =>
                set(
                  {
                    attempts:
                      event.target.value === 'unlimited' ? null : Number(event.target.value),
                  },
                  'Change attempts',
                )
              }
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              <option value="unlimited">Unlimited</option>
            </select>
            {'shuffle' in graded && (
              <label className="question-inline">
                <input
                  type="checkbox"
                  checked={graded.shuffle}
                  onChange={(event) => set({ shuffle: event.target.checked }, 'Change shuffle')}
                />
                Shuffle answers
              </label>
            )}
            <label className="question-inline">
              <input
                type="checkbox"
                checked={graded.required}
                onChange={(event) => set({ required: event.target.checked }, 'Change required')}
              />
              Required (Next waits for an answer)
            </label>
          </Row>

          <Row label="Feedback">
            <select
              aria-label="Feedback by"
              value={graded.feedback.by}
              onChange={(event) =>
                set(
                  {
                    feedback: {
                      ...graded.feedback,
                      by: event.target.value as Question['feedback']['by'],
                    },
                  },
                  'Change feedback',
                )
              }
            >
              <option value="question">By question</option>
              {choice && <option value="choice">By choice</option>}
              <option value="none">None</option>
            </select>
            {graded.feedback.by !== 'none' && (
              <FeedbackWords open={open} slide={slide} question={graded} />
            )}
            {graded.feedback.by === 'choice' && (
              <p className="muted">
                By choice, the Correct and Incorrect layers show the feedback of the choice picked.
              </p>
            )}
          </Row>

          <Row label="Then">
            {(['correct', 'incorrect'] as const).map((which) => (
              <label key={which} className="question-inline">
                <span>
                  {which === 'correct' ? 'After a correct answer' : 'After an incorrect answer'}
                </span>
                <select
                  aria-label={
                    which === 'correct' ? 'After a correct answer' : 'After an incorrect answer'
                  }
                  value={targetValue(graded.branch[which])}
                  onChange={(event) =>
                    set(
                      { branch: { ...graded.branch, [which]: targetFrom(event.target.value) } },
                      'Change branching',
                    )
                  }
                >
                  <option value="next">Go to the next slide</option>
                  {slides.map((each) => (
                    <option key={each.id} value={each.id}>
                      Go to “{each.title || 'Untitled'}”
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </Row>
        </>
      ) : (
        survey && <SurveyRows open={open} slide={slide} question={survey} slides={slides} />
      )}
    </section>
  );
}

const KIND_NAMES: Record<Question['kind'], string> = {
  multipleChoice: 'Multiple choice',
  multipleResponse: 'Multiple response',
  trueFalse: 'True or false',
  fillInBlank: 'Fill in the blank',
  numeric: 'Numeric',
  matchingDropdown: 'Matching (dropdowns)',
  sequenceDropdown: 'Sequence (dropdowns)',
  wordBank: 'Word bank',
  matchingDrag: 'Matching (drag and drop)',
  sequenceDrag: 'Sequence (drag and drop)',
  hotspot: 'Hotspot',
  pickOne: 'Pick one (survey)',
  pickMany: 'Pick many (survey)',
  shortAnswer: 'Short answer (survey)',
  essay: 'Essay (survey)',
  howMany: 'How many (survey)',
  whichWord: 'Which word (survey)',
  ranking: 'Ranking (survey)',
  likert: 'Likert (survey)',
  freePickOne: 'Pick one (freeform)',
  freePickMany: 'Pick many (freeform)',
  freeText: 'Text entry (freeform)',
  freeKey: 'Shortcut key (freeform)',
  freeDrag: 'Drag and drop (freeform)',
  freeHotspot: 'Hotspot (freeform)',
};

/**
 * A survey question's settings (docs/briefs/P7.3-survey-types.md): no score or
 * attempts; one thank-you and one place to go once it is answered.
 */
function SurveyRows({
  open,
  slide,
  question,
  slides,
}: {
  open: OpenProject;
  slide: Slide;
  question: SurveyQuestion;
  slides: Slide[];
}) {
  const set = (patch: Partial<SurveyQuestion>, label: string) =>
    setQuestion(open, slide, { ...question, ...patch } as Question, label);
  return (
    <>
      <Row label="Options">
        {'shuffle' in question && (
          <label className="question-inline">
            <input
              type="checkbox"
              checked={question.shuffle}
              onChange={(event) => set({ shuffle: event.target.checked }, 'Change shuffle')}
            />
            Shuffle answers
          </label>
        )}
        <label className="question-inline">
          <input
            type="checkbox"
            checked={question.required}
            onChange={(event) => set({ required: event.target.checked }, 'Change required')}
          />
          Required (Next waits for an answer)
        </label>
      </Row>

      <Row label="Feedback">
        <select
          aria-label="Feedback by"
          value={question.feedback.by}
          onChange={(event) =>
            set(
              {
                feedback: {
                  ...question.feedback,
                  by: event.target.value as SurveyQuestion['feedback']['by'],
                },
              },
              'Change feedback',
            )
          }
        >
          <option value="question">By question</option>
          <option value="none">None</option>
        </select>
        {question.feedback.by === 'question' && (
          <FeedbackWords open={open} slide={slide} question={question} />
        )}
      </Row>

      <Row label="Then">
        <label className="question-inline">
          <span>After answering</span>
          <select
            aria-label="After answering"
            value={targetValue(question.branch.answered)}
            onChange={(event) =>
              set({ branch: { answered: targetFrom(event.target.value) } }, 'Change branching')
            }
          >
            <option value="next">Go to the next slide</option>
            {slides.map((each) => (
              <option key={each.id} value={each.id}>
                Go to “{each.title || 'Untitled'}”
              </option>
            ))}
          </select>
        </label>
      </Row>
    </>
  );
}

const targetValue = (target: JumpTarget | null) =>
  target === null || target.kind === 'next'
    ? 'next'
    : target.kind === 'slide'
      ? target.slide
      : 'next';
const targetFrom = (value: string): JumpTarget | null =>
  value === 'next' ? null : { kind: 'slide', slide: value };

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="question-row" role="group" aria-label={label}>
      <h3 className="question-row-label">{label}</h3>
      <div className="question-row-body">{children}</div>
    </div>
  );
}

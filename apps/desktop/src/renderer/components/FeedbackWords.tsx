import { feedbackRolesFor } from '@vedraopus/model';
import type { FeedbackPart, FeedbackRole, Question, Slide } from '@vedraopus/model';
import type { OpenProject } from '../project-store';
import { makeFeedbackLayer, plainWords, setWords } from '../question-edit';
import { Words } from './QuestionWords';

/** What each feedback layer is called in Form View (docs/briefs/P7.5-feedback.md). */
const NAMES: Record<FeedbackRole, string> = {
  correct: 'Correct',
  incorrect: 'Incorrect',
  tryAgain: 'Try Again',
  answered: 'Thank You',
};

/**
 * Form View's feedback words: for each layer the question needs, the words of
 * its message (the text on the slide's feedback layer), or a button to make a
 * missing layer from the feedback master.
 */
export function FeedbackWords({
  open,
  slide,
  question,
}: {
  open: OpenProject;
  slide: Slide;
  question: Question;
}) {
  const feedback = question.feedback as Partial<Record<FeedbackRole, FeedbackPart | null>>;
  return (
    <>
      {feedbackRolesFor(question).map((role) => {
        const part = feedback[role];
        const layer = part ? slide.layers.find((each) => each.id === part.layer) : undefined;
        if (!part || !layer) {
          return (
            <button
              key={role}
              type="button"
              onClick={() => makeFeedbackLayer(open, slide, question, role)}
            >
              Make the {NAMES[role]} layer
            </button>
          );
        }
        const message = part.message
          ? layer.objects.find((object) => object.id === part.message)
          : undefined;
        if (message?.type !== 'text') {
          return (
            <p key={role} className="muted">
              The {NAMES[role]} layer has no message text; edit its words on the layer.
            </p>
          );
        }
        return (
          <Words
            key={role}
            label={`${NAMES[role]} feedback`}
            value={plainWords(message.props.text)}
            onCommit={(text) => setWords(open, slide, message.id, text)}
          />
        );
      })}
      <p className="muted">
        Each is a layer on this slide, made from the feedback master; change how it looks on the
        layer, or for new questions in Master View.
      </p>
    </>
  );
}

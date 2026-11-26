import { allSlides } from '@vedraopus/model';
import type { Result, Slide } from '@vedraopus/model';
import type { ReactNode } from 'react';
import type { OpenProject } from '../project-store';
import { editor } from '../project-store';
import { plainWords, setWords } from '../question-edit';
import { NumericInput } from './NumericInput';
import { Words } from './QuestionWords';

/**
 * Form View for a result slide (docs/briefs/P7.7-result-slides.md): what it
 * adds up, its pass mark and timer, and the words of its Passed and Failed layers.
 */
export function ResultForm({ open, slide }: { open: OpenProject; slide: Slide }) {
  const result = slide.result!;
  const set = (next: Result, label: string) => {
    editor.beginGesture(label);
    try {
      open.history.execute('slide.setResult', { slideId: slide.id, result: next });
    } finally {
      editor.commitGesture();
    }
  };
  // What it can include: the course's question, draw and other result slides.
  const candidates = allSlides(open.history.project)
    .map(({ slide: each }) => each)
    .filter((each) => each.id !== slide.id && (each.question || each.draw || each.result));
  const chosen = result.include.kind === 'chosen' ? result.include.slides : [];
  const layerWords = (layerId: string | null) => {
    const layer = slide.layers.find((each) => each.id === layerId);
    const text = layer?.objects.find((object) => object.type === 'text');
    return text?.type === 'text' ? { id: text.id, words: plainWords(text.props.text) } : null;
  };
  const passed = layerWords(result.layers.passed);
  const failed = layerWords(result.layers.failed);

  return (
    <section className="question-form" data-testid="result-form" aria-label="Result form">
      <Row label="Kind">
        <select
          aria-label="Result kind"
          value={result.kind}
          onChange={(event) =>
            set({ ...result, kind: event.target.value as Result['kind'] }, 'Change result kind')
          }
        >
          <option value="graded">Graded: a score and a pass mark</option>
          <option value="survey">Survey: how many were answered</option>
        </select>
      </Row>
      <Row label="Questions">
        <label className="question-inline">
          <input
            type="radio"
            name={`include-${slide.id}`}
            checked={result.include.kind === 'all'}
            onChange={() => set({ ...result, include: { kind: 'all' } }, 'Change questions')}
          />
          Every {result.kind === 'graded' ? 'graded' : 'survey'} question in the course
        </label>
        <label className="question-inline">
          <input
            type="radio"
            name={`include-${slide.id}`}
            checked={result.include.kind === 'chosen'}
            onChange={() =>
              set({ ...result, include: { kind: 'chosen', slides: [] } }, 'Change questions')
            }
          />
          Only these:
        </label>
        {result.include.kind === 'chosen' && (
          <ul className="question-choices">
            {candidates.map((each) => {
              const what = each.draw ? 'draw' : each.result ? 'result' : 'question';
              const name = `${each.title || 'Untitled'} (${what})`;
              return (
                <li key={each.id} data-testid="result-candidate">
                  <label className="question-inline">
                    <input
                      type="checkbox"
                      aria-label={`Include “${each.title || 'Untitled'}”`}
                      checked={chosen.includes(each.id)}
                      onChange={(event) =>
                        set(
                          {
                            ...result,
                            include: {
                              kind: 'chosen',
                              slides: event.target.checked
                                ? [...chosen, each.id]
                                : chosen.filter((id) => id !== each.id),
                            },
                          },
                          'Change questions',
                        )
                      }
                    />
                    {name}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </Row>
      {result.kind === 'graded' && (
        <Row label="Pass mark">
          <label className="question-inline">
            <span>Pass at</span>
            <NumericInput
              aria-label="Pass percentage"
              value={String(result.passPercent)}
              min={0}
              max={100}
              undoLabel="Change pass mark"
              onValue={(value) =>
                value !== null &&
                set(
                  { ...result, passPercent: Math.min(100, Math.max(0, value)) },
                  'Change pass mark',
                )
              }
            />
            <span>% or more</span>
          </label>
        </Row>
      )}
      <Row label="Timer">
        <label className="question-inline">
          <input
            type="checkbox"
            aria-label="Time limit"
            checked={result.timer !== null}
            onChange={(event) =>
              set(
                { ...result, timer: event.target.checked ? { seconds: 600 } : null },
                'Change timer',
              )
            }
          />
          A time limit on these questions
        </label>
        {result.timer && (
          <label className="question-inline">
            <NumericInput
              aria-label="Minutes allowed"
              value={String(result.timer.seconds / 60)}
              min={1}
              max={1440}
              undoLabel="Change timer"
              onValue={(minutes) =>
                minutes !== null &&
                set(
                  {
                    ...result,
                    timer: { seconds: Math.max(10, Math.min(86400, Math.round(minutes * 60))) },
                  },
                  'Change timer',
                )
              }
            />
            <span>minutes, from the first of them</span>
          </label>
        )}
      </Row>
      {result.kind === 'graded' && (
        <Row label="Retry">
          <label className="question-inline">
            <input
              type="checkbox"
              checked={result.retryIncorrectOnly}
              onChange={(event) =>
                set({ ...result, retryIncorrectOnly: event.target.checked }, 'Change retry')
              }
            />
            Retry only the questions answered wrongly; the rest keep their answers
          </label>
        </Row>
      )}
      <Row label="Feedback">
        {passed && (
          <Words
            label={result.kind === 'graded' ? 'Passed feedback' : 'Finished feedback'}
            value={passed.words}
            onCommit={(text) => setWords(open, slide, passed.id, text)}
          />
        )}
        {result.kind === 'graded' && failed && (
          <Words
            label="Failed feedback"
            value={failed.words}
            onCommit={(text) => setWords(open, slide, failed.id, text)}
          />
        )}
        <p className="muted">
          {result.kind === 'graded'
            ? 'The Passed or Failed layer is shown when the learner reaches this slide.'
            : 'The Passed layer is shown when the learner reaches this slide.'}{' '}
          The score is in the built-in variables ResultScore, ResultPercent and the rest.
        </p>
      </Row>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="question-row" role="group" aria-label={label}>
      <h3 className="question-row-label">{label}</h3>
      <div className="question-row-body">{children}</div>
    </div>
  );
}

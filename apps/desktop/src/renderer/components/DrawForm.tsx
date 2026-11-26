import type { Draw, Slide } from '@vedraopus/model';
import type { ReactNode } from 'react';
import type { OpenProject } from '../project-store';
import { editor } from '../project-store';
import { NumericInput } from './NumericInput';

/**
 * Form View for a draw slide (docs/briefs/P7.6-banks-and-draws.md): which
 * bank, how many questions, in what order, and which are always drawn.
 */
export function DrawForm({ open, slide }: { open: OpenProject; slide: Slide }) {
  const draw = slide.draw!;
  const { banks } = open.history.project;
  const bank = banks.find((each) => each.id === draw.bank);
  const set = (next: Draw, label: string) => {
    editor.beginGesture(label);
    try {
      open.history.execute('slide.setDraw', { slideId: slide.id, draw: next });
    } finally {
      editor.commitGesture();
    }
  };
  return (
    <section className="question-form" data-testid="draw-form" aria-label="Draw form">
      <Row label="Bank">
        <select
          aria-label="Question bank"
          value={draw.bank ?? ''}
          onChange={(event) =>
            set({ ...draw, bank: event.target.value || null, locked: [] }, 'Change bank')
          }
        >
          <option value="">None</option>
          {banks.map((each) => (
            <option key={each.id} value={each.id}>
              {each.title || 'Untitled bank'}
            </option>
          ))}
        </select>
        {banks.length === 0 && (
          <p className="muted">Add a question bank in the slide list to draw from.</p>
        )}
      </Row>
      <Row label="Draw">
        <label className="question-inline">
          <span>Questions to draw</span>
          <NumericInput
            aria-label="Questions to draw"
            value={String(draw.count)}
            min={1}
            max={100}
            undoLabel="Change count"
            onValue={(count) =>
              count !== null && set({ ...draw, count: Math.round(count) }, 'Change count')
            }
          />
        </label>
        <select
          aria-label="Draw order"
          value={draw.order}
          onChange={(event) =>
            set({ ...draw, order: event.target.value as Draw['order'] }, 'Change draw order')
          }
        >
          <option value="random">At random</option>
          <option value="inOrder">In the bank’s order</option>
        </select>
        {bank && (
          <p className="muted">
            {bank.slides.length} {bank.slides.length === 1 ? 'question' : 'questions'} in “
            {bank.title}”; a learner meets each at most once.
            {draw.count > bank.slides.length && ` Only ${bank.slides.length} can be drawn from it.`}
          </p>
        )}
      </Row>
      {bank && (
        <Row label="Locked">
          <p className="muted">Locked questions are always among those drawn.</p>
          <ul className="question-choices">
            {bank.slides.map((each, index) => {
              const title = each.title || `Question ${index + 1}`;
              return (
                <li key={each.id} data-testid="draw-question">
                  <label className="question-inline">
                    <input
                      type="checkbox"
                      aria-label={`Lock “${title}”`}
                      checked={draw.locked.includes(each.id)}
                      onChange={(event) =>
                        set(
                          {
                            ...draw,
                            locked: event.target.checked
                              ? [...draw.locked, each.id]
                              : draw.locked.filter((id) => id !== each.id),
                          },
                          'Change locked questions',
                        )
                      }
                    />
                    {title}
                  </label>
                </li>
              );
            })}
          </ul>
        </Row>
      )}
    </section>
  );
}

/** What a draw slide stands for, said in words. */
export function describeDraw(slide: Slide, banks: OpenProject['project']['banks']): string {
  const draw = slide.draw!;
  const bank = banks.find((each) => each.id === draw.bank);
  if (!bank) return 'This slide draws no questions: choose a question bank in Form View.';
  const order = draw.order === 'random' ? 'at random' : 'in order';
  return `In the course, this slide is replaced by ${draw.count} ${draw.count === 1 ? 'question' : 'questions'} drawn ${order} from “${bank.title}”.`;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="question-row" role="group" aria-label={label}>
      <h3 className="question-row-label">{label}</h3>
      <div className="question-row-body">{children}</div>
    </div>
  );
}

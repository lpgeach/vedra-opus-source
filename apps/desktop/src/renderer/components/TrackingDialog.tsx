import type { Tracking } from '@vedraopus/model';
import { useState } from 'react';
import type { OpenProject } from '../project-store';
import { NumericInput } from './NumericInput';
import { takeFocus } from './dialog-focus';

export const REPORTING: [Tracking['reporting'], string][] = [
  ['completed-incomplete', 'Completed, or incomplete'],
  ['passed-incomplete', 'Passed, or incomplete'],
  ['passed-failed', 'Passed, or failed'],
  ['completed-failed', 'Completed, or failed'],
];
const RESUME: [Tracking['resume'], string][] = [
  ['prompt', 'Ask whether to continue'],
  ['always', 'Always continue where they left off'],
  ['never', 'Always start from the beginning'],
];

/** How the course counts as complete, what the LMS is told, and what returning learners get. */
export function TrackingDialog({ open, onClose }: { open: OpenProject; onClose: () => void }) {
  const stored = open.project.tracking;
  const slides = open.project.scenes.reduce((n, scene) => n + scene.slides.length, 0);
  // Graded result slides the course can pass or fail by (P7.7).
  const resultSlides = open.project.scenes.flatMap((scene) =>
    scene.slides.filter((slide) => slide.result?.kind === 'graded'),
  );
  const [completion, setCompletion] = useState<'all' | 'count' | 'trigger' | 'result'>(
    stored.completion.kind === 'trigger'
      ? 'trigger'
      : stored.completion.kind === 'result'
        ? 'result'
        : stored.completion.count === null
          ? 'all'
          : 'count',
  );
  const [resultSlide, setResultSlide] = useState(
    stored.completion.kind === 'result' ? stored.completion.slide : (resultSlides[0]?.id ?? ''),
  );
  const [count, setCount] = useState(
    stored.completion.kind === 'slidesViewed' && stored.completion.count !== null
      ? stored.completion.count
      : Math.max(1, slides),
  );
  const [reporting, setReporting] = useState(stored.reporting);
  const [resume, setResume] = useState(stored.resume);

  const apply = () => {
    open.history.execute('project.setTracking', {
      tracking: {
        completion:
          completion === 'trigger'
            ? { kind: 'trigger' }
            : completion === 'result' && resultSlide
              ? { kind: 'result', slide: resultSlide }
              : { kind: 'slidesViewed', count: completion === 'all' ? null : count },
        reporting,
        resume,
      },
    });
    onClose();
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        className="dialog"
        ref={takeFocus}
        tabIndex={-1}
        role="dialog"
        aria-label="Tracking"
        data-testid="tracking-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
      >
        <h2>Tracking</h2>
        <fieldset>
          <legend>The course is complete when</legend>
          <label>
            <input
              type="radio"
              name="completion"
              checked={completion === 'all'}
              onChange={() => setCompletion('all')}
            />
            Every slide has been seen
          </label>
          <label>
            <input
              type="radio"
              name="completion"
              checked={completion === 'count'}
              onChange={() => setCompletion('count')}
            />
            This many slides have been seen:
            <NumericInput
              aria-label="Slides to see"
              className="tracking-count"
              min={1}
              value={String(count)}
              disabled={completion !== 'count'}
              onValue={(value) => {
                if (value !== null && value >= 1) setCount(Math.round(value));
              }}
            />
            <span className="muted">of {slides}</span>
          </label>
          <label>
            <input
              type="radio"
              name="completion"
              checked={completion === 'trigger'}
              onChange={() => setCompletion('trigger')}
            />
            Only when a trigger completes it
          </label>
          <label>
            <input
              type="radio"
              name="completion"
              checked={completion === 'result'}
              disabled={resultSlides.length === 0}
              onChange={() => setCompletion('result')}
            />
            The learner reaches a result slide, passing or failing by it:
            <select
              aria-label="Result slide"
              value={resultSlide}
              disabled={completion !== 'result'}
              onChange={(event) => setResultSlide(event.target.value)}
            >
              {resultSlides.map((slide) => (
                <option key={slide.id} value={slide.id}>
                  {slide.title || 'Untitled'}
                </option>
              ))}
            </select>
          </label>
          {resultSlides.length === 0 && (
            <p className="muted">Insert a result slide to pass or fail the course by it.</p>
          )}
          <p className="muted">A “Complete the course” trigger completes it in every case.</p>
        </fieldset>
        <label className="field">
          <span>Tell the LMS the course is</span>
          <select
            aria-label="Tell the LMS the course is"
            value={reporting}
            onChange={(e) => setReporting(e.target.value as Tracking['reporting'])}
          >
            {REPORTING.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>When a learner comes back</span>
          <select
            aria-label="When a learner comes back"
            value={resume}
            onChange={(e) => setResume(e.target.value as Tracking['resume'])}
          >
            {RESUME.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={apply}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

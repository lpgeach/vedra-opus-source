import {
  allSlides,
  createTransition,
  transitionDirections,
  transitionKinds,
} from '@vedraopus/model';
import type { Transition, TransitionDirection, TransitionKind } from '@vedraopus/model';
import { previewTransition } from '../stage/transition-preview';
import { editedSlide, editor, useEditor } from '../project-store';
import { NumericInput } from './NumericInput';
import { Group } from './ribbon-parts';

const KIND_NAMES: Record<TransitionKind, string> = {
  fade: 'Fade',
  push: 'Push',
  cover: 'Cover',
  uncover: 'Uncover',
  wipe: 'Wipe',
  split: 'Split',
  iris: 'Iris',
  zoom: 'Zoom',
};
const DIRECTION_NAMES: Record<TransitionDirection, string> = {
  right: 'From the right',
  left: 'From the left',
  bottom: 'From below',
  top: 'From above',
  horizontal: 'Horizontal',
  vertical: 'Vertical',
};
/** For an uncover, the direction is where the old slide goes. */
const UNCOVER_NAMES: Partial<Record<TransitionDirection, string>> = {
  right: 'To the right',
  left: 'To the left',
  bottom: 'Downwards',
  top: 'Upwards',
};

/**
 * The fields for one transition: its kind (or none), direction and duration,
 * named `title` ("Slide transition", "Layer transition").
 */
function TransitionFields({
  title,
  transition,
  onChange,
}: {
  title: string;
  transition: Transition | null;
  onChange: (next: Transition | null, label: string) => void;
}) {
  const directions: readonly TransitionDirection[] = transition
    ? transitionDirections[transition.kind]
    : [];
  return (
    <div className="anim-fields">
      <div className="anim-row">
        <select
          className="ribbon-select"
          aria-label={title}
          value={transition?.kind ?? ''}
          onChange={(event) => {
            const kind = event.target.value as TransitionKind | '';
            onChange(
              kind === '' ? null : createTransition(kind, transition?.duration ?? 0.5),
              kind === '' ? 'Remove transition' : 'Change transition',
            );
          }}
        >
          <option value="">None</option>
          {transitionKinds.map((kind) => (
            <option key={kind} value={kind}>
              {KIND_NAMES[kind]}
            </option>
          ))}
        </select>
        {transition && directions.length > 0 && (
          <select
            className="ribbon-select"
            aria-label={`${title} direction`}
            value={transition.direction ?? ''}
            onChange={(event) =>
              onChange(
                { ...transition, direction: event.target.value as TransitionDirection },
                'Change transition direction',
              )
            }
          >
            {directions.map((direction) => (
              <option key={direction} value={direction}>
                {(transition.kind === 'uncover' && UNCOVER_NAMES[direction]) ||
                  DIRECTION_NAMES[direction]}
              </option>
            ))}
          </select>
        )}
      </div>
      {transition && (
        <div className="anim-row">
          <NumericInput
            className="ribbon-input ribbon-number"
            aria-label={`${title} duration`}
            title="Seconds"
            value={String(transition.duration)}
            min={0.1}
            max={5}
            undoLabel="Change transition duration"
            onValue={(n) =>
              n !== null && onChange({ ...transition, duration: n }, 'Change transition duration')
            }
          />
          <span className="ribbon-unit">s</span>
        </div>
      )}
    </div>
  );
}

/** The Transitions ribbon tab (docs/briefs/P6.6-transitions.md). */
export function TransitionsTab() {
  const { open, view, selectedSlideId, masterTargetId } = useEditor();
  const current = open
    ? editedSlide(open.history.project, view, selectedSlideId, masterTargetId)
    : undefined;
  const slide =
    open && current && !current.isMaster
      ? allSlides(open.history.project).find((each) => each.slide.id === current.slide.id)?.slide
      : undefined;
  if (!open || !current || !slide) {
    return (
      <Group label="Transition">
        <p className="ribbon-hint" data-testid="transitions-hint">
          {current?.isMaster
            ? 'Transitions play between slides, not on masters and layouts.'
            : 'Choose a slide to give it a transition.'}
        </p>
      </Group>
    );
  }
  const { history } = open;
  const layer = current.layerId ? slide.layers.find((each) => each.id === current.layerId) : null;
  const inOneStep = (label: string, run: () => void) => {
    editor.beginGesture(label);
    try {
      run();
    } finally {
      editor.commitGesture();
    }
  };

  return (
    <>
      <Group label="Transition to This Slide">
        <TransitionFields
          title="Slide transition"
          transition={slide.properties.transition}
          onChange={(transition, label) =>
            inOneStep(label, () =>
              history.execute('slide.setProperties', {
                slideId: slide.id,
                properties: { transition },
              }),
            )
          }
        />
        <div className="anim-fields">
          <button
            type="button"
            className="ribbon-button small"
            disabled={!slide.properties.transition}
            onClick={() => previewTransition('slide')}
          >
            Preview
          </button>
          <button
            type="button"
            className="ribbon-button small"
            onClick={() =>
              inOneStep('Apply transition to all slides', () => {
                for (const { slide: each } of allSlides(history.project)) {
                  history.execute('slide.setProperties', {
                    slideId: each.id,
                    properties: { transition: slide.properties.transition },
                  });
                }
              })
            }
          >
            Apply to all slides
          </button>
        </div>
      </Group>
      {layer && (
        <Group label={`Transition of ${layer.name}`}>
          <TransitionFields
            title="Layer transition"
            transition={layer.properties.transition}
            onChange={(transition, label) =>
              inOneStep(label, () =>
                history.execute('layer.setProperties', {
                  layerId: layer.id,
                  properties: { transition },
                }),
              )
            }
          />
          <div className="anim-fields">
            <button
              type="button"
              className="ribbon-button small"
              aria-label="Preview layer transition"
              disabled={!layer.properties.transition}
              onClick={() => previewTransition('layer')}
            >
              Preview
            </button>
          </div>
        </Group>
      )}
    </>
  );
}

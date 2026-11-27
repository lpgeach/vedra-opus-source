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
import { Command, Group } from './ribbon-parts';
import { TileGallery } from './tile-gallery';
import type { Tile } from './tile-gallery';
import { TransitionPicture } from './TransitionPicture';

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
 * A new transition of `kind`, keeping the duration, and the direction when the new kind
 * takes it (Push from the left becomes Cover from the left).
 */
function changeKind(previous: Transition | null, kind: TransitionKind): Transition {
  const next = createTransition(kind, previous?.duration ?? 0.5);
  const allowed: readonly string[] = transitionDirections[kind];
  return previous?.direction && allowed.includes(previous.direction)
    ? { ...next, direction: previous.direction as TransitionDirection }
    : next;
}

/**
 * The transitions as a gallery (B27): one tile each, with a picture that plays it while the
 * pointer or the keyboard is on it (`TileGallery`, shared with the Animations tab).
 */
function Gallery({
  title,
  transition,
  onChange,
}: {
  title: string;
  transition: Transition | null;
  onChange: (next: Transition | null, label: string) => void;
}) {
  const chosen = transition?.kind ?? 'none';
  const tiles: Tile<TransitionKind | 'none'>[] = [
    {
      key: 'none',
      name: 'None',
      title: 'No transition',
      picture: () => <TransitionPicture transition={null} playing={false} />,
    },
    ...transitionKinds.map((kind) => ({
      key: kind,
      name: KIND_NAMES[kind],
      title: `${KIND_NAMES[kind]}: point at it to see it`,
      picture: (playing: boolean) => (
        <TransitionPicture
          transition={kind === chosen && transition ? transition : createTransition(kind)}
          playing={playing}
        />
      ),
    })),
  ];
  return (
    <TileGallery
      label={title}
      tiles={tiles}
      chosen={chosen}
      testId="transition-gallery"
      onChoose={(kind) =>
        onChange(
          kind === 'none' ? null : changeKind(transition, kind),
          kind === 'none' ? 'Remove transition' : 'Change transition',
        )
      }
    />
  );
}

/** The direction of the chosen transition, for those that have one. */
function EffectOptions({
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
      <span className="ribbon-unit">Direction</span>
      <select
        className="ribbon-select"
        aria-label={`${title} direction`}
        disabled={!transition || directions.length === 0}
        value={transition?.direction ?? ''}
        onChange={(event) =>
          transition &&
          onChange(
            { ...transition, direction: event.target.value as TransitionDirection },
            'Change transition direction',
          )
        }
      >
        {directions.length === 0 && <option value="">None</option>}
        {transition &&
          directions.map((direction) => (
            <option key={direction} value={direction}>
              {(transition.kind === 'uncover' && UNCOVER_NAMES[direction]) ||
                DIRECTION_NAMES[direction]}
            </option>
          ))}
      </select>
    </div>
  );
}

/** The Transitions ribbon tab (docs/briefs/P6.6-transitions.md; the gallery, B27). */
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
  // While a layer is being edited, the tab sets that layer's transition; otherwise the slide's.
  const layer = current.layerId ? slide.layers.find((each) => each.id === current.layerId) : null;
  const inOneStep = (label: string, run: () => void) => {
    editor.beginGesture(label);
    try {
      run();
    } finally {
      editor.commitGesture();
    }
  };
  const title = layer ? 'Layer transition' : 'Slide transition';
  const transition = layer ? layer.properties.transition : slide.properties.transition;
  const onChange = (next: Transition | null, label: string) =>
    inOneStep(label, () =>
      layer
        ? history.execute('layer.setProperties', {
            layerId: layer.id,
            properties: { transition: next },
          })
        : history.execute('slide.setProperties', {
            slideId: slide.id,
            properties: { transition: next },
          }),
    );

  return (
    <>
      <Group label="Preview">
        <Command
          icon="play"
          label="Preview"
          title={
            layer
              ? `Play ${layer.name}'s transition on the stage`
              : 'Play the transition on the stage'
          }
          onClick={transition ? () => previewTransition(layer ? 'layer' : 'slide') : undefined}
        />
      </Group>
      <Group label={layer ? `Transition to ${layer.name}` : 'Transition to This Slide'}>
        <Gallery title={title} transition={transition} onChange={onChange} />
      </Group>
      <Group label="Effect Options">
        <EffectOptions title={title} transition={transition} onChange={onChange} />
      </Group>
      <Group label="Timing">
        <div className="anim-fields">
          <div className="anim-row">
            <span className="ribbon-unit">Duration</span>
            <NumericInput
              className="ribbon-input ribbon-number"
              aria-label={`${title} duration`}
              title="Seconds"
              value={transition ? String(transition.duration) : ''}
              disabled={!transition}
              min={0.1}
              max={5}
              undoLabel="Change transition duration"
              onValue={(n) =>
                transition &&
                n !== null &&
                onChange({ ...transition, duration: n }, 'Change transition duration')
              }
            />
            <span className="ribbon-unit">s</span>
          </div>
          {!layer && (
            <button
              type="button"
              className="ribbon-button compact"
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
              Apply to All Slides
            </button>
          )}
        </div>
      </Group>
    </>
  );
}

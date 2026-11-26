import { createEffect, effectDirections, effectKinds } from '@vedraopus/model';
import type {
  Effect,
  EffectDirection,
  EffectKind,
  MotionPath,
  SceneObject,
} from '@vedraopus/model';
import { addMotionPath, defaultPathPoints, setAnimations } from '../animations-edit';
import {
  editedSlide,
  editor,
  getEditorState,
  partOf,
  selectedObjects,
  useEditor,
} from '../project-store';
import type { OpenProject } from '../project-store';
import { NumericInput } from './NumericInput';
import { Group } from './ribbon-parts';

const EFFECT_NAMES: Record<EffectKind, string> = {
  fade: 'Fade',
  fly: 'Fly',
  float: 'Float',
  wipe: 'Wipe',
  split: 'Split',
  iris: 'Iris',
  grow: 'Grow',
  zoom: 'Zoom',
  spin: 'Spin',
  spinGrow: 'Spin and grow',
  bounce: 'Bounce',
  swivel: 'Swivel',
};
const DIRECTION_NAMES: Record<EffectDirection, string> = {
  left: 'Left',
  right: 'Right',
  top: 'Top',
  bottom: 'Bottom',
  topLeft: 'Top left',
  topRight: 'Top right',
  bottomLeft: 'Bottom left',
  bottomRight: 'Bottom right',
  horizontal: 'Horizontal',
  vertical: 'Vertical',
  clockwise: 'Clockwise',
  anticlockwise: 'Anticlockwise',
};
const EASING_NAMES: Record<MotionPath['easing'], string> = {
  linear: 'Steady',
  easeIn: 'Speed up',
  easeOut: 'Slow down',
  easeInOut: 'Speed up, slow down',
};

/** Indents a member in the Part list by its depth in the group. */
const EM_SPACE = String.fromCodePoint(0x2003);

/** The group itself, or one of its members at any depth, to animate (B8). */
function PartChooser({ group, part }: { group: SceneObject; part: string }) {
  const members: { object: SceneObject; depth: number }[] = [];
  if (group.type === 'group') {
    const walk = (children: readonly SceneObject[], depth: number) => {
      for (const child of children) {
        members.push({ object: child, depth });
        if (child.type === 'group') walk(child.children, depth + 1);
      }
    };
    walk(group.children, 1);
  }
  return (
    <Group label="Part">
      <select
        className="ribbon-select"
        aria-label="Part to animate"
        value={part}
        onChange={(event) =>
          editor.chooseGroupPart(event.target.value === group.id ? null : event.target.value)
        }
      >
        <option value={group.id}>{group.name} (the whole group)</option>
        {members.map(({ object, depth }) => (
          <option key={object.id} value={object.id}>
            {`${EM_SPACE.repeat(depth)}${object.name}`}
          </option>
        ))}
      </select>
    </Group>
  );
}

const hasText = (object: SceneObject) =>
  object.type === 'text' ||
  object.type === 'button' ||
  (object.type === 'shape' && object.props.text !== null);

/**
 * The Animations ribbon tab (docs/briefs/P6.5-animations.md): the entrance,
 * exit and motion paths of the one selected object.
 */
export function AnimationsTab() {
  const {
    open,
    view,
    selectedSlideId,
    masterTargetId,
    selection,
    motionPath,
    drawingPathFor,
    groupPart,
  } = useEditor();
  const current = open
    ? editedSlide(open.history.project, view, selectedSlideId, masterTargetId)
    : undefined;
  const selected = selectedObjects(current?.slide, selection);
  const top = selected.length === 1 ? selected[0]! : null;
  // A group's member, chosen here or in the timeline, has animations of its own (B8).
  const object = partOf(top ?? undefined, groupPart) ?? null;
  if (!open || !current || !object || current.isMaster || getEditorState().stateEdit) {
    return (
      <Group label="Animation">
        <p className="ribbon-hint" data-testid="animations-hint">
          {current?.isMaster
            ? 'Animations play on slides, not on masters and layouts.'
            : getEditorState().stateEdit
              ? 'Animations belong to the object, not to one of its states.'
              : 'Select one object on the slide to animate it.'}
        </p>
      </Group>
    );
  }
  const { animations } = object;
  const chosen =
    animations.motionPaths.find((path) => path.id === motionPath) ?? animations.motionPaths[0];
  const setPath = (path: MotionPath, label: string) =>
    setAnimations(
      open,
      object.id,
      {
        ...animations,
        motionPaths: animations.motionPaths.map((each) => (each.id === path.id ? path : each)),
      },
      label,
    );

  return (
    <>
      {top?.type === 'group' && <PartChooser group={top} part={object.id} />}
      {(['entrance', 'exit'] as const).map((phase) => (
        <EffectGroup
          key={phase}
          open={open}
          object={object}
          phase={phase}
          effect={animations[phase]}
        />
      ))}
      <Group label="Motion Paths">
        <div className="anim-fields">
          <div className="anim-row">
            {(['line', 'arc'] as const).map((shape) => (
              <button
                key={shape}
                type="button"
                className="ribbon-button small"
                aria-label={`Add ${shape} path`}
                onClick={() =>
                  addMotionPath(
                    open,
                    current.slide,
                    object,
                    shape,
                    defaultPathPoints(shape, object, open.history.project.stage.width),
                  )
                }
              >
                {shape === 'line' ? 'Line' : 'Arc'}
              </button>
            ))}
            <button
              type="button"
              className="ribbon-button small"
              aria-label="Draw freeform path"
              aria-pressed={drawingPathFor === object.id}
              onClick={() => editor.drawPathFor(drawingPathFor === object.id ? null : object.id)}
            >
              Freeform
            </button>
            {chosen && (
              <select
                className="ribbon-select"
                aria-label="Motion path"
                value={chosen.id}
                onChange={(event) => editor.chooseMotionPath(event.target.value)}
              >
                {animations.motionPaths.map((path) => (
                  <option key={path.id} value={path.id}>
                    {path.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          {chosen && (
            <div className="anim-row">
              <NumericInput
                className="ribbon-input ribbon-number"
                aria-label="Path duration"
                title="Seconds"
                value={String(chosen.duration)}
                min={0.05}
                max={60}
                undoLabel="Change path duration"
                onValue={(n) =>
                  n !== null && setPath({ ...chosen, duration: n }, 'Change path duration')
                }
              />
              <select
                className="ribbon-select"
                aria-label="Path easing"
                value={chosen.easing}
                onChange={(event) =>
                  setPath(
                    { ...chosen, easing: event.target.value as MotionPath['easing'] },
                    'Change path easing',
                  )
                }
              >
                {Object.entries(EASING_NAMES).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
              <label className="ribbon-field">
                <input
                  type="checkbox"
                  checked={chosen.relativeStart}
                  onChange={(event) =>
                    setPath({ ...chosen, relativeStart: event.target.checked }, 'Change path start')
                  }
                />
                Relative start
              </label>
              <button
                type="button"
                className="ribbon-button small"
                aria-label="Delete path"
                onClick={() => {
                  setAnimations(
                    open,
                    object.id,
                    {
                      ...animations,
                      motionPaths: animations.motionPaths.filter((each) => each.id !== chosen.id),
                    },
                    'Delete motion path',
                  );
                  editor.chooseMotionPath(null);
                }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </Group>
    </>
  );
}

function EffectGroup({
  open,
  object,
  phase,
  effect,
}: {
  open: OpenProject;
  object: SceneObject;
  phase: 'entrance' | 'exit';
  effect: Effect | null;
}) {
  const title = phase === 'entrance' ? 'Entrance' : 'Exit';
  const set = (next: Effect | null, label: string) =>
    setAnimations(open, object.id, { ...object.animations, [phase]: next }, label);
  const directions: readonly EffectDirection[] = effect ? effectDirections[effect.kind] : [];
  return (
    <Group label={title}>
      <div className="anim-fields">
        <div className="anim-row">
          <select
            className="ribbon-select"
            aria-label={`${title} effect`}
            value={effect?.kind ?? ''}
            onChange={(event) => {
              const kind = event.target.value as EffectKind | '';
              if (kind === '') return set(null, `Remove ${phase}`);
              const fresh = createEffect(kind, effect?.duration ?? 0.5);
              set(
                { ...fresh, byParagraph: (effect?.byParagraph ?? false) && hasText(object) },
                `Change ${phase}`,
              );
            }}
          >
            <option value="">None</option>
            {effectKinds.map((kind) => (
              <option key={kind} value={kind}>
                {EFFECT_NAMES[kind]}
              </option>
            ))}
          </select>
          {directions.length > 0 && effect && (
            <select
              className="ribbon-select"
              aria-label={`${title} direction`}
              value={effect.direction ?? ''}
              onChange={(event) =>
                set(
                  { ...effect, direction: event.target.value as EffectDirection },
                  `Change ${phase} direction`,
                )
              }
            >
              {directions.map((direction) => (
                <option key={direction} value={direction}>
                  {DIRECTION_NAMES[direction]}
                </option>
              ))}
            </select>
          )}
        </div>
        {effect && (
          <div className="anim-row">
            <NumericInput
              className="ribbon-input ribbon-number"
              aria-label={`${title} duration`}
              title="Seconds"
              value={String(effect.duration)}
              min={0.05}
              max={30}
              undoLabel={`Change ${phase} duration`}
              onValue={(n) =>
                n !== null && set({ ...effect, duration: n }, `Change ${phase} duration`)
              }
            />
            <span className="ribbon-unit">s</span>
            {hasText(object) && (
              <label className="ribbon-field">
                <input
                  type="checkbox"
                  aria-label={`${title} by paragraph`}
                  checked={effect.byParagraph}
                  onChange={(event) =>
                    set({ ...effect, byParagraph: event.target.checked }, `Change ${phase}`)
                  }
                />
                By paragraph
              </label>
            )}
          </div>
        )}
      </div>
    </Group>
  );
}

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
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { EffectPicture } from './EffectPicture';
import { NumericInput } from './NumericInput';
import { popupPlace, useDismiss } from './popover';
import { TileGallery } from './tile-gallery';
import type { Tile } from './tile-gallery';
import { Command, Group } from './ribbon-parts';
import { cancelFormatPainter, pickAnimations, useFormatPainter } from '../format-painter';

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

/** A small drawing of a motion path's shape, for its button (B28): a dot travelling a line. */
function PathPicture({ shape }: { shape: 'line' | 'arc' | 'freeform' }) {
  const d = {
    line: 'M6 22 L38 8',
    arc: 'M6 24 Q22 -4 38 24',
    freeform: 'M5 20 C10 6 16 26 22 14 S32 4 39 16',
  }[shape];
  return (
    <svg className="path-picture" viewBox="0 0 44 30" width="44" height="30" aria-hidden="true">
      <path d={d} className="path-picture-line" />
      <circle
        cx={5.5}
        cy={shape === 'line' ? 22 : shape === 'arc' ? 24 : 20}
        r={3.5}
        className="path-picture-start"
      />
      <path d={d} className="path-picture-dash" />
    </svg>
  );
}

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
/**
 * The Animation Painter (B17): copies the selected object's entrance and exit to the next object
 * clicked. A double-click keeps it on until Escape or a second click here, as the Format Painter.
 */
function AnimationPainter({ object }: { object: SceneObject | null }) {
  const painter = useFormatPainter();
  const armed = painter.armed && painter.animations;
  return (
    <Group label="Copy">
      <Command
        icon="entrance"
        label={armed ? 'Cancel Painter' : 'Animation Painter'}
        pressed={armed}
        onClick={
          armed ? cancelFormatPainter : object ? () => pickAnimations(object, false) : undefined
        }
        onDoubleClick={object && !armed ? () => pickAnimations(object, true) : undefined}
      />
    </Group>
  );
}

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
      <>
        <AnimationPainter object={null} />
        <Group label="Animation">
          <p className="ribbon-hint" data-testid="animations-hint">
            {current?.isMaster
              ? 'Animations play on slides, not on masters and layouts.'
              : getEditorState().stateEdit
                ? 'Animations belong to the object, not to one of its states.'
                : 'Select one object on the slide to animate it.'}
          </p>
        </Group>
      </>
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
      <AnimationPainter object={object} />
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
                className="path-button"
                aria-label={`Add ${shape} path`}
                title={shape === 'line' ? 'Add a straight path' : 'Add a curved path'}
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
                <PathPicture shape={shape} />
                <span>{shape === 'line' ? 'Line' : 'Arc'}</span>
              </button>
            ))}
            <button
              type="button"
              className="path-button"
              aria-label="Draw freeform path"
              title="Draw a path on the stage"
              aria-pressed={drawingPathFor === object.id}
              onClick={() => editor.drawPathFor(drawingPathFor === object.id ? null : object.id)}
            >
              <PathPicture shape="freeform" />
              <span>Freeform</span>
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

/**
 * A new effect of `kind`, keeping the duration, By paragraph, and the direction when the new
 * kind takes it (Fly from the left becomes Float from the left).
 */
function changeEffect(previous: Effect | null, kind: EffectKind, withText: boolean): Effect {
  const fresh = createEffect(kind, previous?.duration ?? 0.5);
  const allowed: readonly string[] = effectDirections[kind];
  return {
    ...fresh,
    direction:
      previous?.direction && allowed.includes(previous.direction)
        ? previous.direction
        : fresh.direction,
    byParagraph: (previous?.byParagraph ?? false) && withText,
  };
}

/**
 * The effects as a gallery (B28): a button showing the chosen effect's picture and name,
 * which opens a grid of every effect, each a tile whose picture plays it.
 */
function EffectGallery({
  title,
  phase,
  effect,
  onChoose,
}: {
  title: string;
  phase: 'entrance' | 'exit';
  effect: Effect | null;
  onChoose: (kind: EffectKind | 'none') => void;
}) {
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const [pointed, setPointed] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const open = place !== null;
  useDismiss(
    container,
    open,
    () => setPlace(null),
    () => setPlace(popupPlace(container)),
  );
  // Opened: the keyboard starts on the chosen effect.
  useEffect(() => {
    if (open) container.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }, [open]);
  const chosen = effect?.kind ?? 'none';
  const name = effect ? EFFECT_NAMES[effect.kind] : 'None';
  const tiles: Tile<EffectKind | 'none'>[] = [
    {
      key: 'none',
      name: 'None',
      title: phase === 'entrance' ? 'No entrance effect' : 'No exit effect',
      picture: () => <EffectPicture effect={null} phase={phase} playing={false} />,
    },
    ...effectKinds.map((kind) => ({
      key: kind,
      name: EFFECT_NAMES[kind],
      title: `${EFFECT_NAMES[kind]}: point at it to see it`,
      picture: (playing: boolean) => (
        <EffectPicture
          effect={kind === chosen && effect ? effect : createEffect(kind)}
          phase={phase}
          playing={playing}
        />
      ),
    })),
  ];
  return (
    <div className="gallery" ref={container}>
      <button
        type="button"
        className="effect-gallery-button"
        aria-label={`${title} effect`}
        aria-haspopup="true"
        aria-expanded={open}
        data-kind={chosen}
        title={`${title}: ${name}. Choose another effect`}
        onClick={() => setPlace(open ? null : popupPlace(container))}
        onPointerEnter={() => setPointed(true)}
        onPointerLeave={() => setPointed(false)}
        onFocus={() => setPointed(true)}
        onBlur={() => setPointed(false)}
      >
        <EffectPicture effect={effect} phase={phase} playing={pointed && !open} />
        <span className="effect-gallery-name">
          {name}
          <span aria-hidden="true"> ▾</span>
        </span>
      </button>
      {place && (
        <div
          className="menu-panel effect-gallery-panel"
          role="dialog"
          aria-label={`${title} effects`}
          style={place}
        >
          <TileGallery
            label={`${title} effect`}
            tiles={tiles}
            chosen={chosen}
            onChoose={onChoose}
            onClickTile={() => setPlace(null)}
            className="tile-grid"
            testId={`${phase}-gallery`}
          />
        </div>
      )}
    </div>
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
  const choose = (kind: EffectKind | 'none') =>
    kind === 'none'
      ? set(null, `Remove ${phase}`)
      : set(changeEffect(effect, kind, hasText(object)), `Change ${phase}`);
  return (
    <Group label={title}>
      <div className="anim-effect">
        <EffectGallery title={title} phase={phase} effect={effect} onChoose={choose} />
        <div className="anim-fields">
          <select
            className="ribbon-select"
            aria-label={`${title} direction`}
            disabled={!effect || directions.length === 0}
            value={effect?.direction ?? ''}
            onChange={(event) =>
              effect &&
              set(
                { ...effect, direction: event.target.value as EffectDirection },
                `Change ${phase} direction`,
              )
            }
          >
            {directions.length === 0 && <option value="">No direction</option>}
            {directions.map((direction) => (
              <option key={direction} value={direction}>
                {DIRECTION_NAMES[direction]}
              </option>
            ))}
          </select>
          <div className="anim-row">
            <NumericInput
              className="ribbon-input ribbon-number"
              aria-label={`${title} duration`}
              title="Seconds"
              value={effect ? String(effect.duration) : ''}
              disabled={!effect}
              min={0.05}
              max={30}
              undoLabel={`Change ${phase} duration`}
              onValue={(n) =>
                effect && n !== null && set({ ...effect, duration: n }, `Change ${phase} duration`)
              }
            />
            <span className="ribbon-unit">s</span>
            {hasText(object) && (
              <label className="ribbon-field">
                <input
                  type="checkbox"
                  aria-label={`${title} by paragraph`}
                  disabled={!effect}
                  checked={effect?.byParagraph ?? false}
                  onChange={(event) =>
                    effect &&
                    set({ ...effect, byParagraph: event.target.checked }, `Change ${phase}`)
                  }
                />
                By paragraph
              </label>
            )}
          </div>
        </div>
      </div>
    </Group>
  );
}

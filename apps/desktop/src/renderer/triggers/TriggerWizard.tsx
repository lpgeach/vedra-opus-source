import { BUILT_IN_STATE_NAMES, createId } from '@vedraopus/model';
import type {
  PanoramaObject,
  Condition,
  Operand,
  Slide,
  Trigger,
  TriggerAction,
  TriggerEvent,
  Variable,
} from '@vedraopus/model';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { OpenProject } from '../project-store';
import { describeTrigger, namesFor, ownerFor } from './describe';

type ActionType = TriggerAction['type'];
type EventType = TriggerEvent['type'];

const ACTIONS: [ActionType, string][] = [
  ['changeState', 'Change state of'],
  ['showLayer', 'Show layer'],
  ['hideLayer', 'Hide layer'],
  ['jumpToSlide', 'Jump to slide'],
  ['openLightbox', 'Open a slide as a lightbox'],
  ['closeLightbox', 'Close the lightbox'],
  ['setVariable', 'Set variable'],
  ['toggleVariable', 'Toggle variable'],
  ['pauseTimeline', 'Pause timeline of'],
  ['resumeTimeline', 'Resume timeline of'],
  ['playMedia', 'Play media'],
  ['pauseMedia', 'Pause media'],
  ['stopMedia', 'Stop media'],
  ['moveAlongPath', 'Move along path'],
  ['openUrl', 'Open web page'],
  ['openFile', 'Open a file'],
  ['sendEmail', 'Send an email'],
  ['printSlide', 'Print the slide'],
  ['setFocus', 'Set focus to'],
  ['seekTimeline', 'Seek the timeline of'],
  ['restartCourse', 'Restart the course'],
  ['exitCourse', 'Exit the course'],
  ['executeJavaScript', 'Run JavaScript'],
  ['completeCourse', 'Complete the course'],
  ['submitInteraction', 'Submit the question'],
  ['continueQuestion', 'Go on from the feedback'],
  ['reviewQuiz', 'Review the quiz'],
  ['exitReview', 'Leave the review'],
  ['retryQuiz', 'Retry the quiz'],
  ['printResults', 'Print the results'],
];
const EVENTS: [EventType, string][] = [
  ['click', 'the learner clicks'],
  ['doubleClick', 'the learner double-clicks'],
  ['rightClick', 'the learner right-clicks'],
  ['mouseEnter', 'the pointer moves onto'],
  ['mouseLeave', 'the pointer leaves'],
  ['keyPress', 'the learner presses the key'],
  ['playerTab', 'the learner clicks the player tab'],
  ['timelineStart', 'the timeline starts of'],
  ['timelineEnd', 'the timeline ends of'],
  ['timelineReaches', 'the timeline reaches a time on'],
  ['cuePoint', 'the timeline reaches a cue point on'],
  ['stateChange', 'an object changes state:'],
  ['variableChange', 'a variable changes:'],
  ['mediaCompletes', 'media completes:'],
  ['controlLosesFocus', 'a control loses focus:'],
  ['controlMoves', 'a slider or dial moves:'],
  ['spotClicked', 'the learner opens a spot in a 360° image:'],
  ['panoramaVisited', 'every spot in a 360° image is opened:'],
  ['draggedOver', 'the learner drags an object over another:'],
  ['droppedOn', 'the learner drops an object on another:'],
  ['intersects', 'two objects intersect:'],
  ['stopsIntersecting', 'two objects stop intersecting:'],
  ['animationCompletes', 'an animation completes:'],
];
/** What a new script starts as: a reminder of what it can reach. */
const SCRIPT_START = `// player.getVar('Name'), player.setVar('Name', value)
// player.object('Object name'): .state, .visible, .setState(id), .show(), .hide()
`;

const SET_OPERATORS = [
  ['assign', 'to'],
  ['add', 'adding'],
  ['subtract', 'subtracting'],
  ['multiply', 'multiplied by'],
  ['divide', 'divided by'],
  ['append', 'followed by the text'],
] as const;
const COMPARISONS = [
  ['==', 'is'],
  ['!=', 'is not'],
  ['<', 'is less than'],
  ['<=', 'is at most'],
  ['>', 'is more than'],
  ['>=', 'is at least'],
  ['contains', 'contains'],
  ['==i', 'is, ignoring case,'],
  ['!=i', 'is not, ignoring case,'],
] as const;

/** Everything on the slide a trigger can point at. */
function choices(open: OpenProject, slide: Slide) {
  const objects = [slide.baseLayer, ...slide.layers].flatMap((layer) => layer.objects);
  const layers = [slide.baseLayer, ...slide.layers];
  const overlays = slide.layers;
  const slides = open.project.scenes.flatMap((scene) => scene.slides);
  /** Sound and video, for the media actions and event. */
  const media = objects.filter((o) => o.type === 'audio' || o.type === 'video');
  /** Objects with motion paths, and with any animation at all. */
  const withPaths = objects.filter((o) => o.animations.motionPaths.length > 0);
  const animated = objects.filter(
    (o) => o.animations.entrance || o.animations.exit || o.animations.motionPaths.length > 0,
  );
  return {
    /** The slide is a question, so its answer can be submitted. */
    isQuestion: slide.question !== null,
    objects,
    media,
    /** Text entries and dropdowns, for "a control loses focus" (P9.2). */
    fields: objects.filter((o) => o.type === 'textEntry' || o.type === 'dropdown'),
    /** Sliders and dials, for "a slider or dial moves" (P9.4). */
    movers: objects.filter((o) => o.type === 'slider' || o.type === 'dial'),
    /** 360° images, for their spot events (P9.10). */
    panoramas: objects.filter((o): o is PanoramaObject => o.type === 'panorama'),
    /** Objects the learner can drag, for "dragged over" and "dropped on" (P9.7). */
    draggables: objects.filter((o) => o.drag !== null),
    withPaths,
    animated,
    layers,
    overlays,
    slides,
    variables: open.project.variables,
    /** Slides that can open as a lightbox over this one (P8.4): not draws, not itself. */
    lightboxes: slides.filter((each) => !each.draw && each.id !== slide.id),
    /** The player's custom tabs (P8.2). */
    tabs: open.project.player.tabs.custom,
    /** The course's files and pictures, for Open a file (P8.6). */
    files: Object.entries(open.project.assets).filter(
      ([, meta]) => meta.kind === 'file' || meta.kind === 'image',
    ),
  };
}
type Choices = ReturnType<typeof choices>;

function Pick<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map(([id, name]) => (
        <option key={id} value={id}>
          {name}
        </option>
      ))}
    </select>
  );
}

const firstId = (list: readonly { id: string }[]) => list[0]?.id ?? '';
const pathsOf = (c: Choices, objectId: string): [string, string][] =>
  (c.objects.find((o) => o.id === objectId)?.animations.motionPaths ?? []).map((path) => [
    path.id,
    path.name,
  ]);
type Animation = Extract<TriggerEvent, { type: 'animationCompletes' }>['animation'];
/** An object's animations as choices: its entrance, its exit and each path. */
const animationsOf = (c: Choices, objectId: string): [string, string][] => {
  const object = c.objects.find((o) => o.id === objectId);
  if (!object) return [];
  return [
    ...(object.animations.entrance ? [['entrance', 'its entrance'] as [string, string]] : []),
    ...(object.animations.exit ? [['exit', 'its exit'] as [string, string]] : []),
    ...pathsOf(c, objectId).map(([id, name]): [string, string] => [`path:${id}`, `path ${name}`]),
  ];
};
const animationKey = (animation: Animation) =>
  animation.kind === 'path' ? `path:${animation.path}` : animation.kind;
const animationFromKey = (key: string): Animation =>
  key.startsWith('path:')
    ? { kind: 'path', path: key.slice('path:'.length) }
    : { kind: key === 'exit' ? 'exit' : 'entrance' };
const statesOf = (c: Choices, objectId: string): [string, string][] =>
  (c.objects.find((o) => o.id === objectId)?.states ?? []).map((s) => [
    s.id,
    s.name || BUILT_IN_STATE_NAMES[s.id] || s.id,
  ]);

/** A fresh action of a kind, filled in with the first sensible targets. */
function blankAction(type: ActionType, c: Choices): TriggerAction | null {
  const object = c.objects[0];
  const overlay = firstId(c.overlays);
  const variable = c.variables[0];
  switch (type) {
    case 'changeState':
      return object ? { type, object: object.id, state: 'normal' } : null;
    case 'showLayer':
    case 'hideLayer':
      return overlay ? { type, layer: overlay } : null;
    case 'jumpToSlide':
      return { type, target: { kind: 'next' } };
    case 'setVariable':
      return variable
        ? {
            type,
            variable: variable.id,
            operator: 'assign',
            operand: { kind: 'literal', value: variable.default },
          }
        : null;
    case 'toggleVariable': {
      const flag = c.variables.find((v) => v.type === 'boolean');
      return flag ? { type, variable: flag.id } : null;
    }
    case 'pauseTimeline':
    case 'resumeTimeline':
      return { type, layer: firstId(c.layers) };
    case 'playMedia':
    case 'pauseMedia':
    case 'stopMedia':
      return c.media[0] ? { type, object: c.media[0].id } : null;
    case 'moveAlongPath': {
      const moving = c.withPaths[0];
      return moving
        ? { type, object: moving.id, path: moving.animations.motionPaths[0]!.id }
        : null;
    }
    case 'openUrl':
      return { type, url: 'https://' };
    case 'executeJavaScript':
      return { type, code: SCRIPT_START };
    case 'completeCourse':
      return { type };
    case 'submitInteraction':
    case 'continueQuestion':
      return c.isQuestion ? { type } : null;
    case 'reviewQuiz':
    case 'exitReview':
    case 'retryQuiz':
    case 'printResults':
    case 'closeLightbox':
    case 'restartCourse':
    case 'exitCourse':
    case 'printSlide':
      return { type };
    case 'sendEmail':
      return { type, to: '', subject: '', body: '' };
    case 'openFile':
      return c.files[0] ? { type, asset: c.files[0][0] } : null;
    case 'setFocus':
      return object ? { type, object: object.id } : null;
    case 'seekTimeline':
      return { type, layer: c.layers[0]!.id, time: 0 };
    case 'openLightbox':
      return c.lightboxes[0] ? { type, slide: c.lightboxes[0].id, controls: false } : null;
  }
}

function blankEvent(
  type: EventType,
  c: Choices,
  objectId: string | undefined,
): TriggerEvent | null {
  const object = objectId ?? firstId(c.objects);
  const layer = firstId(c.layers);
  switch (type) {
    case 'click':
    case 'doubleClick':
    case 'rightClick':
    case 'mouseEnter':
    case 'mouseLeave':
      return object ? { type, object } : null;
    case 'keyPress':
      return { type, key: 'Enter' };
    case 'playerTab':
      return c.tabs[0] ? { type, tab: c.tabs[0].id } : null;
    case 'timelineStart':
    case 'timelineEnd':
      return { type, layer };
    case 'timelineReaches':
      return { type, layer, time: 1 };
    case 'cuePoint': {
      const owner = c.layers.find((l) => l.timeline.cuePoints.length > 0);
      return owner ? { type, layer: owner.id, cuePoint: owner.timeline.cuePoints[0]!.id } : null;
    }
    case 'stateChange':
      return object ? { type, object, state: 'normal' } : null;
    case 'variableChange':
      return c.variables[0] ? { type, variable: c.variables[0].id } : null;
    case 'mediaCompletes': {
      const audio = c.media.find((o) => o.id === objectId) ?? c.media[0];
      return audio ? { type, object: audio.id } : null;
    }
    case 'controlLosesFocus': {
      const field = c.fields.find((o) => o.id === objectId) ?? c.fields[0];
      return field ? { type, object: field.id } : null;
    }
    case 'controlMoves': {
      const control = c.movers.find((o) => o.id === objectId) ?? c.movers[0];
      return control ? { type, object: control.id } : null;
    }
    case 'spotClicked': {
      const panorama =
        c.panoramas.find((o) => o.id === objectId && o.props.spots.length > 0) ??
        c.panoramas.find((o) => o.props.spots.length > 0);
      return panorama ? { type, object: panorama.id, spot: panorama.props.spots[0]!.id } : null;
    }
    case 'panoramaVisited': {
      const panorama = c.panoramas.find((o) => o.id === objectId) ?? c.panoramas[0];
      return panorama ? { type, object: panorama.id } : null;
    }
    case 'draggedOver':
    case 'droppedOn': {
      const dragged = c.draggables.find((o) => o.id === objectId) ?? c.draggables[0];
      const target = c.objects.find((o) => o.id !== dragged?.id);
      return dragged && target ? { type, object: dragged.id, target: target.id } : null;
    }
    case 'intersects':
    case 'stopsIntersecting': {
      const first = c.objects.find((o) => o.id === objectId) ?? c.objects[0];
      const other = c.objects.find((o) => o.id !== first?.id);
      return first && other ? { type, object: first.id, other: other.id } : null;
    }
    case 'animationCompletes': {
      const animated = c.animated.find((o) => o.id === objectId) ?? c.animated[0];
      const first = animated && animationsOf(c, animated.id)[0];
      return animated && first
        ? { type, object: animated.id, animation: animationFromKey(first[0]) }
        : null;
    }
  }
}

/** A literal typed in, made the variable's own kind of value. */
function literalFor(variable: Variable | undefined, text: string): string | number | boolean {
  if (variable?.type === 'number') {
    const n = Number(text);
    return Number.isFinite(n) && text.trim() !== '' ? n : 0;
  }
  if (variable?.type === 'boolean') return text === 'true';
  return text;
}

function OperandField({
  label,
  operand,
  variable,
  c,
  onChange,
}: {
  label: string;
  operand: Operand;
  variable: Variable | undefined;
  c: Choices;
  onChange: (operand: Operand) => void;
}) {
  const kind = operand.kind;
  return (
    <>
      <select
        aria-label={`${label} source`}
        value={kind === 'literal' ? '__value' : operand.variable}
        onChange={(e) =>
          onChange(
            e.target.value === '__value'
              ? { kind: 'literal', value: variable?.default ?? '' }
              : { kind: 'variable', variable: e.target.value },
          )
        }
      >
        <option value="__value">the value</option>
        {c.variables.map((v) => (
          <option key={v.id} value={v.id}>
            the variable {v.name}
          </option>
        ))}
      </select>
      {kind === 'literal' &&
        (variable?.type === 'boolean' ? (
          <select
            aria-label={label}
            value={String(operand.value)}
            onChange={(e) => onChange({ kind: 'literal', value: e.target.value === 'true' })}
          >
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        ) : (
          <input
            aria-label={label}
            className="trigger-value"
            // Remount when the value changes from outside (another variable chosen).
            key={`${variable?.id ?? ''}/${String(operand.value)}`}
            defaultValue={String(operand.value)}
            inputMode={variable?.type === 'number' ? 'decimal' : undefined}
            onBlur={(e) =>
              onChange({ kind: 'literal', value: literalFor(variable, e.target.value) })
            }
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
        ))}
    </>
  );
}

function ActionFields({
  label,
  action,
  c,
  onChange,
}: {
  label: string;
  action: TriggerAction;
  c: Choices;
  onChange: (action: TriggerAction) => void;
}) {
  const objectOptions = c.objects.map((o) => [o.id, o.name] as const);
  const layerOptions = c.layers.map((l, i) => [l.id, i === 0 ? 'the slide' : l.name] as const);
  switch (action.type) {
    case 'changeState':
      return (
        <>
          <Pick
            label={`${label} object`}
            value={action.object}
            options={objectOptions}
            onChange={(object) => onChange({ ...action, object, state: 'normal' })}
          />
          <span>to</span>
          <Pick
            label={`${label} state`}
            value={action.state}
            options={statesOf(c, action.object)}
            onChange={(state) => onChange({ ...action, state })}
          />
        </>
      );
    case 'showLayer':
    case 'hideLayer':
      return (
        <Pick
          label={`${label} layer`}
          value={action.layer}
          options={c.overlays.map((l) => [l.id, l.name] as const)}
          onChange={(layer) => onChange({ ...action, layer })}
        />
      );
    case 'playMedia':
    case 'pauseMedia':
    case 'stopMedia':
      return (
        <Pick
          label={`${label} media`}
          value={action.object}
          options={c.media.map((o) => [o.id, o.name] as const)}
          onChange={(object) => onChange({ ...action, object })}
        />
      );
    case 'moveAlongPath':
      return (
        <>
          <Pick
            label={`${label} object`}
            value={action.object}
            options={c.withPaths.map((o) => [o.id, o.name] as const)}
            onChange={(object) =>
              onChange({ ...action, object, path: pathsOf(c, object)[0]?.[0] ?? '' })
            }
          />
          <span>along</span>
          <Pick
            label={`${label} path`}
            value={action.path}
            options={pathsOf(c, action.object)}
            onChange={(path) => onChange({ ...action, path })}
          />
        </>
      );
    case 'pauseTimeline':
    case 'resumeTimeline':
      return (
        <Pick
          label={`${label} layer`}
          value={action.layer}
          options={layerOptions}
          onChange={(layer) => onChange({ ...action, layer })}
        />
      );
    case 'openLightbox':
      return (
        <>
          <Pick
            label={`${label} slide`}
            value={action.slide}
            options={c.lightboxes.map(
              (s) => [s.id, `${c.slides.indexOf(s) + 1}. ${s.title || 'Untitled slide'}`] as const,
            )}
            onChange={(slide) => onChange({ ...action, slide })}
          />
          <label className="trigger-check">
            <input
              type="checkbox"
              aria-label={`${label} shows Previous and Next`}
              checked={action.controls}
              onChange={(e) => onChange({ ...action, controls: e.target.checked })}
            />
            with Previous and Next
          </label>
        </>
      );
    case 'jumpToSlide': {
      const value =
        action.target.kind === 'slide' ? action.target.slide : `__${action.target.kind}`;
      return (
        <Pick
          label={`${label} slide`}
          value={value}
          options={[
            ['__next', 'the next slide'],
            ['__previous', 'the previous slide'],
            ...c.slides.map((s) => [s.id, s.title || 'Untitled slide'] as const),
          ]}
          onChange={(id) =>
            onChange({
              ...action,
              target:
                id === '__next' || id === '__previous'
                  ? { kind: id === '__next' ? 'next' : 'previous' }
                  : { kind: 'slide', slide: id },
            })
          }
        />
      );
    }
    case 'setVariable': {
      const variable = c.variables.find((v) => v.id === action.variable);
      return (
        <>
          <Pick
            label={`${label} variable`}
            value={action.variable}
            options={c.variables.map((v) => [v.id, v.name] as const)}
            onChange={(id) => {
              const next = c.variables.find((v) => v.id === id)!;
              onChange({
                ...action,
                variable: id,
                operand: { kind: 'literal', value: next.default },
              });
            }}
          />
          <Pick
            label={`${label} operation`}
            value={action.operator}
            options={SET_OPERATORS.filter(([op]) =>
              op === 'assign'
                ? true
                : op === 'append'
                  ? variable?.type === 'text'
                  : variable?.type === 'number',
            )}
            onChange={(operator) => onChange({ ...action, operator })}
          />
          <OperandField
            label={`${label} value`}
            operand={action.operand}
            variable={variable}
            c={c}
            onChange={(operand) => onChange({ ...action, operand })}
          />
        </>
      );
    }
    case 'toggleVariable':
      return (
        <Pick
          label={`${label} variable`}
          value={action.variable}
          options={c.variables
            .filter((v) => v.type === 'boolean')
            .map((v) => [v.id, v.name] as const)}
          onChange={(variable) => onChange({ ...action, variable })}
        />
      );
    case 'sendEmail':
      return (
        <>
          {(
            [
              ['to', 'to', 'trigger-url'],
              ['subject', 'subject', 'trigger-url'],
              ['body', 'message', 'trigger-url'],
            ] as const
          ).map(([field, name, className]) => (
            <input
              key={field}
              aria-label={`${label} email ${name}`}
              className={className}
              placeholder={field === 'to' ? 'Address (or leave blank)' : name}
              defaultValue={action[field]}
              onBlur={(e) => {
                const value =
                  field === 'to' ? e.target.value.replace(/[?&#]/g, '').trim() : e.target.value;
                onChange({ ...action, [field]: value });
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
            />
          ))}
        </>
      );
    case 'openFile':
      return (
        <Pick
          label={`${label} file`}
          value={action.asset}
          options={c.files.map(([hash, meta]) => [hash, meta.fileName] as const)}
          onChange={(asset) => onChange({ ...action, asset })}
        />
      );
    case 'setFocus':
      return (
        <Pick
          label={`${label} object`}
          value={action.object}
          options={objectOptions}
          onChange={(object) => onChange({ ...action, object })}
        />
      );
    case 'seekTimeline':
      return (
        <>
          <Pick
            label={`${label} layer`}
            value={action.layer}
            options={layerOptions}
            onChange={(layer) => onChange({ ...action, layer })}
          />
          <span>to</span>
          <input
            aria-label={`${label} time in seconds`}
            className="trigger-value"
            inputMode="decimal"
            key={action.time}
            defaultValue={action.time}
            onBlur={(e) => {
              const time = Number(e.target.value);
              onChange({ ...action, time: Number.isFinite(time) && time >= 0 ? time : 0 });
            }}
          />
        </>
      );
    case 'openUrl':
      return (
        <input
          aria-label={`${label} address`}
          className="trigger-url"
          defaultValue={action.url}
          onBlur={(e) => onChange({ ...action, url: e.target.value.trim() || 'https://' })}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
      );
    case 'completeCourse':
      return <span className="muted">(reported to the LMS as the course’s completion)</span>;
    case 'executeJavaScript':
      return (
        <div className="trigger-script">
          <textarea
            aria-label={`${label} code`}
            spellCheck={false}
            rows={7}
            defaultValue={action.code}
            onKeyDown={(e) => {
              // Tab indents rather than leaving the box; Escape still closes the dialog.
              e.stopPropagation();
              if (e.key === 'Escape') e.currentTarget.blur();
              if (e.key === 'Tab') {
                e.preventDefault();
                const box = e.currentTarget;
                const at = box.selectionStart;
                box.setRangeText('  ', at, box.selectionEnd, 'end');
              }
            }}
            onBlur={(e) => onChange({ ...action, code: e.target.value })}
          />
          <p className="muted">
            Runs in the course only, never in the editor. It gets <code>player</code>:{' '}
            <code>player.getVar(name)</code>, <code>player.setVar(name, value)</code> and{' '}
            <code>player.object(name)</code> (<code>.state</code>, <code>.visible</code>,{' '}
            <code>.setState(id)</code>, <code>.show()</code>, <code>.hide()</code>).
          </p>
        </div>
      );
  }
}

function ActionPicker({
  label,
  action,
  c,
  onChange,
}: {
  label: string;
  action: TriggerAction;
  c: Choices;
  onChange: (action: TriggerAction) => void;
}) {
  return (
    <>
      <select
        aria-label={label}
        value={action.type}
        onChange={(e) => {
          const next = blankAction(e.target.value as ActionType, c);
          if (next) onChange(next);
        }}
      >
        {ACTIONS.map(([type, name]) => (
          <option key={type} value={type} disabled={!blankAction(type, c)}>
            {name}
          </option>
        ))}
      </select>
      <ActionFields label={label} action={action} c={c} onChange={onChange} />
    </>
  );
}

function EventFields({
  event,
  c,
  onChange,
}: {
  event: TriggerEvent;
  c: Choices;
  onChange: (event: TriggerEvent) => void;
}) {
  const objectOptions = c.objects.map((o) => [o.id, o.name] as const);
  const layerOptions = c.layers.map((l, i) => [l.id, i === 0 ? 'the slide' : l.name] as const);
  switch (event.type) {
    case 'click':
    case 'doubleClick':
    case 'rightClick':
    case 'mouseEnter':
    case 'mouseLeave':
      return (
        <Pick
          label="Event object"
          value={event.object}
          options={objectOptions}
          onChange={(object) => onChange({ ...event, object })}
        />
      );
    case 'playerTab':
      return (
        <Pick
          label="Player tab"
          value={event.tab}
          options={c.tabs.map((tab) => [tab.id, tab.label] as const)}
          onChange={(tab) => onChange({ ...event, tab })}
        />
      );
    case 'keyPress':
      return (
        <input
          aria-label="Key"
          className="trigger-key"
          value={event.key === ' ' ? 'Space' : event.key}
          readOnly
          title="Click here, then press the key"
          onKeyDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.key !== 'Tab' && e.key !== 'Shift' && e.key !== 'Control' && e.key !== 'Alt') {
              onChange({ ...event, key: e.key });
            }
          }}
        />
      );
    case 'timelineStart':
    case 'timelineEnd':
      return (
        <Pick
          label="Event layer"
          value={event.layer}
          options={layerOptions}
          onChange={(layer) => onChange({ ...event, layer })}
        />
      );
    case 'timelineReaches':
      return (
        <>
          <Pick
            label="Event layer"
            value={event.layer}
            options={layerOptions}
            onChange={(layer) => onChange({ ...event, layer })}
          />
          <span>at</span>
          <input
            aria-label="Time in seconds"
            className="trigger-value"
            inputMode="decimal"
            key={event.time}
            defaultValue={event.time}
            onBlur={(e) => {
              const time = Number(e.target.value);
              onChange({ ...event, time: Number.isFinite(time) && time >= 0 ? time : 0 });
            }}
          />
          <span>s</span>
        </>
      );
    case 'cuePoint': {
      const cues = c.layers.flatMap((l) =>
        l.timeline.cuePoints.map((cue) => ({ layer: l.id, cue })),
      );
      return (
        <Pick
          label="Cue point"
          value={event.cuePoint}
          options={cues.map(({ cue }) => [cue.id, cue.name] as const)}
          onChange={(id) =>
            onChange({ ...event, cuePoint: id, layer: cues.find((x) => x.cue.id === id)!.layer })
          }
        />
      );
    }
    case 'stateChange':
      return (
        <>
          <Pick
            label="Event object"
            value={event.object}
            options={objectOptions}
            onChange={(object) => onChange({ ...event, object, state: 'normal' })}
          />
          <span>becomes</span>
          <Pick
            label="Event state"
            value={event.state}
            options={statesOf(c, event.object)}
            onChange={(state) => onChange({ ...event, state })}
          />
        </>
      );
    case 'variableChange':
      return (
        <Pick
          label="Event variable"
          value={event.variable}
          options={c.variables.map((v) => [v.id, v.name] as const)}
          onChange={(variable) => onChange({ ...event, variable })}
        />
      );
    case 'controlMoves':
      return (
        <Pick
          label="Event slider or dial"
          value={event.object}
          options={c.movers.map((o) => [o.id, o.name] as const)}
          onChange={(object) => onChange({ ...event, object })}
        />
      );
    case 'spotClicked': {
      const panorama = c.panoramas.find((o) => o.id === event.object);
      return (
        <>
          <Pick
            label="Event 360° image"
            value={event.object}
            options={c.panoramas
              .filter((o) => o.props.spots.length > 0)
              .map((o) => [o.id, o.name] as const)}
            onChange={(object) => {
              const first = c.panoramas.find((o) => o.id === object)?.props.spots[0];
              if (first) onChange({ ...event, object, spot: first.id });
            }}
          />
          <span>spot</span>
          <Pick
            label="Event spot"
            value={event.spot}
            options={(panorama?.props.spots ?? []).map((spot) => [spot.id, spot.name] as const)}
            onChange={(spot) => onChange({ ...event, spot })}
          />
        </>
      );
    }
    case 'panoramaVisited':
      return (
        <Pick
          label="Event 360° image"
          value={event.object}
          options={c.panoramas.map((o) => [o.id, o.name] as const)}
          onChange={(object) => onChange({ ...event, object })}
        />
      );
    case 'draggedOver':
    case 'droppedOn':
      return (
        <>
          <Pick
            label="Event dragged object"
            value={event.object}
            options={c.draggables.map((o) => [o.id, o.name] as const)}
            onChange={(object) => onChange({ ...event, object })}
          />
          <span>{event.type === 'draggedOver' ? 'over' : 'on'}</span>
          <Pick
            label="Event target"
            value={event.target}
            options={objectOptions.filter(([id]) => id !== event.object)}
            onChange={(target) => onChange({ ...event, target })}
          />
        </>
      );
    case 'intersects':
    case 'stopsIntersecting':
      return (
        <>
          <Pick
            label="Event object"
            value={event.object}
            options={objectOptions}
            onChange={(object) => onChange({ ...event, object })}
          />
          <span>and</span>
          <Pick
            label="Event other object"
            value={event.other}
            options={objectOptions.filter(([id]) => id !== event.object)}
            onChange={(other) => onChange({ ...event, other })}
          />
        </>
      );
    case 'controlLosesFocus':
      return (
        <Pick
          label="Event control"
          value={event.object}
          options={c.fields.map((o) => [o.id, o.name] as const)}
          onChange={(object) => onChange({ ...event, object })}
        />
      );
    case 'mediaCompletes':
      return (
        <Pick
          label="Event media"
          value={event.object}
          options={c.media.map((o) => [o.id, o.name] as const)}
          onChange={(object) => onChange({ ...event, object })}
        />
      );
    case 'animationCompletes':
      return (
        <>
          <Pick
            label="Event object"
            value={event.object}
            options={c.animated.map((o) => [o.id, o.name] as const)}
            onChange={(object) => {
              const first = animationsOf(c, object)[0];
              if (first) onChange({ ...event, object, animation: animationFromKey(first[0]) });
            }}
          />
          <span>finishes</span>
          <Pick
            label="Event animation"
            value={animationKey(event.animation)}
            options={animationsOf(c, event.object)}
            onChange={(key) => onChange({ ...event, animation: animationFromKey(key) })}
          />
        </>
      );
  }
}

function ConditionRow({
  condition,
  c,
  onChange,
  onRemove,
}: {
  condition: Condition;
  c: Choices;
  onChange: (condition: Condition) => void;
  onRemove: () => void;
}) {
  const subject =
    condition.subject === 'variable' ? `var:${condition.variable}` : `obj:${condition.object}`;
  return (
    <div className="trigger-condition" data-testid="trigger-condition">
      <select
        aria-label="Condition subject"
        value={subject}
        onChange={(e) => {
          const [kind, id] = e.target.value.split(/:(.*)/) as [string, string];
          if (kind === 'var') {
            const variable = c.variables.find((v) => v.id === id)!;
            onChange({
              subject: 'variable',
              variable: id,
              operator: '==',
              value: { kind: 'literal', value: variable.default },
            });
          } else onChange({ subject: 'objectState', object: id, operator: '==', state: 'normal' });
        }}
      >
        {c.variables.map((v) => (
          <option key={v.id} value={`var:${v.id}`}>
            {v.name}
          </option>
        ))}
        {c.objects.map((o) => (
          <option key={o.id} value={`obj:${o.id}`}>
            {o.name} (state)
          </option>
        ))}
      </select>
      {condition.subject === 'variable' ? (
        <>
          <Pick
            label="Comparison"
            value={condition.operator}
            options={COMPARISONS}
            onChange={(operator) => onChange({ ...condition, operator })}
          />
          <OperandField
            label="Compared with"
            operand={condition.value}
            variable={c.variables.find((v) => v.id === condition.variable)}
            c={c}
            onChange={(value) => onChange({ ...condition, value })}
          />
        </>
      ) : (
        <>
          <Pick
            label="Comparison"
            value={condition.operator}
            options={[
              ['==', 'is'],
              ['!=', 'is not'],
            ]}
            onChange={(operator) => onChange({ ...condition, operator })}
          />
          <Pick
            label="Compared state"
            value={condition.state}
            options={statesOf(c, condition.object)}
            onChange={(state) => onChange({ ...condition, state })}
          />
        </>
      )}
      <button aria-label="Remove condition" onClick={onRemove}>
        ✕
      </button>
    </div>
  );
}

function Line({ children }: { children: ReactNode }) {
  return <div className="trigger-line">{children}</div>;
}

/**
 * Build or change a trigger as a sentence: action and its target, when (the
 * event), if (conditions), otherwise (an action for when they fail).
 */
export function TriggerWizard({
  open,
  slide,
  existing,
  objectId,
  onClose,
}: {
  open: OpenProject;
  slide: Slide;
  /** The trigger to change; leave out to make a new one. */
  existing?: Trigger;
  /** For a new trigger: the selected object, which the event starts out about. */
  objectId?: string;
  onClose: () => void;
}) {
  const c = choices(open, slide);
  const [draft, setDraft] = useState<Omit<Trigger, 'id' | 'owner' | 'enabled'>>(() => {
    if (existing) return existing;
    const event = blankEvent('click', c, objectId) ?? blankEvent('timelineStart', c, undefined)!;
    return {
      event,
      action: blankAction('jumpToSlide', c)!,
      conditions: null,
      otherwise: null,
    };
  });
  const [error, setError] = useState<string | null>(null);
  const names = namesFor(open.project, slide);

  const save = () => {
    const owner = ownerFor(draft.event, slide);
    try {
      if (existing) {
        open.history.execute('trigger.update', {
          triggerId: existing.id,
          changes: { ...draft, owner },
        });
      } else {
        open.history.execute('trigger.add', {
          slideId: slide.id,
          trigger: { id: createId('trigger'), owner, enabled: true, ...draft },
        });
      }
      onClose();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    }
  };

  const conditions = draft.conditions;
  const firstCondition = (): Condition | null => {
    const variable = c.variables[0];
    if (variable) {
      return {
        subject: 'variable',
        variable: variable.id,
        operator: '==',
        value: { kind: 'literal', value: variable.default },
      };
    }
    const object = c.objects[0];
    return object
      ? { subject: 'objectState', object: object.id, operator: '==', state: 'normal' }
      : null;
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        className="dialog trigger-wizard"
        role="dialog"
        aria-label={existing ? 'Edit trigger' : 'New trigger'}
        data-testid="trigger-wizard"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <h2>{existing ? 'Edit trigger' : 'New trigger'}</h2>
        <Line>
          <ActionPicker
            label="Action"
            action={draft.action}
            c={c}
            onChange={(action) => setDraft({ ...draft, action })}
          />
        </Line>
        <Line>
          <span>when</span>
          <select
            aria-label="Event"
            value={draft.event.type}
            onChange={(e) => {
              const event = blankEvent(e.target.value as EventType, c, objectId);
              if (event) setDraft({ ...draft, event });
            }}
          >
            {EVENTS.map(([type, name]) => (
              <option key={type} value={type} disabled={!blankEvent(type, c, objectId)}>
                {name}
              </option>
            ))}
          </select>
          <EventFields
            event={draft.event}
            c={c}
            onChange={(event) => setDraft({ ...draft, event })}
          />
        </Line>
        {conditions && (
          <div className="trigger-conditions">
            <Line>
              <span>if</span>
              {conditions.items.length > 1 && (
                <Pick
                  label="Combine conditions"
                  value={conditions.combine}
                  options={[
                    ['and', 'all of these are true'],
                    ['or', 'any of these is true'],
                  ]}
                  onChange={(combine) =>
                    setDraft({ ...draft, conditions: { ...conditions, combine } })
                  }
                />
              )}
            </Line>
            {conditions.items.map((condition, index) => (
              <ConditionRow
                key={index}
                condition={condition}
                c={c}
                onChange={(next) => {
                  const items = conditions.items.map((item, i) => (i === index ? next : item));
                  setDraft({ ...draft, conditions: { ...conditions, items } });
                }}
                onRemove={() => {
                  const items = conditions.items.filter((_, i) => i !== index);
                  setDraft({
                    ...draft,
                    conditions: items.length > 0 ? { ...conditions, items } : null,
                    otherwise: items.length > 0 ? draft.otherwise : null,
                  });
                }}
              />
            ))}
          </div>
        )}
        <Line>
          <button
            disabled={!firstCondition()}
            title={firstCondition() ? undefined : 'Add a variable or an object first'}
            onClick={() => {
              const condition = firstCondition()!;
              setDraft({
                ...draft,
                conditions: {
                  combine: conditions?.combine ?? 'and',
                  items: [...(conditions?.items ?? []), condition],
                },
              });
            }}
          >
            Add condition
          </button>
          {conditions && !draft.otherwise && (
            <button
              onClick={() => setDraft({ ...draft, otherwise: blankAction('jumpToSlide', c) })}
            >
              Add “otherwise”
            </button>
          )}
        </Line>
        {conditions && draft.otherwise && (
          <Line>
            <span>otherwise</span>
            <ActionPicker
              label="Otherwise action"
              action={draft.otherwise}
              c={c}
              onChange={(otherwise) => setDraft({ ...draft, otherwise })}
            />
            <button
              aria-label="Remove otherwise"
              onClick={() => setDraft({ ...draft, otherwise: null })}
            >
              ✕
            </button>
          </Line>
        )}
        <p className="trigger-sentence" data-testid="trigger-sentence">
          {describeTrigger(
            { ...draft, id: 'preview', owner: ownerFor(draft.event, slide), enabled: true },
            names,
          )}
        </p>
        {error && (
          <p className="variables-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button onClick={onClose}>Cancel</button>
          <button onClick={save}>{existing ? 'Save' : 'Add trigger'}</button>
        </div>
      </div>
    </div>
  );
}

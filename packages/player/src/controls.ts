import { forEachObject } from '@vedraopus/model';
import type { DialObject, Project, SliderObject } from '@vedraopus/model';
import { DIAL_SWEEP, dialLookAngle } from '@vedraopus/render';

/**
 * Sliders and dials in a course (docs/briefs/P9.4-sliders-dials.md): kept in
 * step with the engine's values, and moved by the learner's pointer and keys.
 * A slider is a native range input; a dial is ours, with slider semantics.
 */

type Control = SliderObject | DialObject;

/**
 * The value a pointer at (`dx`, `dy`) from a dial's middle asks for: its angle
 * from straight up, clockwise, within the dial's sweep (a point in the gap at
 * the bottom goes to the nearer end).
 */
export function dialValue(props: { min: number; max: number }, dx: number, dy: number): number {
  const half = DIAL_SWEEP / 2;
  let angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
  if (angle > half || angle < -half) angle = angle > 0 ? half : -half;
  const fraction = (angle + half) / DIAL_SWEEP;
  return props.min + fraction * (props.max - props.min);
}

/**
 * The value a dial drawn its own way (B16) asks for with its pointer at `angle` degrees,
 * clockwise from as it is drawn: between the look's two angles, or the nearer of them.
 */
export function lookedDialValue(
  props: { min: number; max: number; look: { from: number; to: number } },
  angle: number,
): number {
  const { from, to } = props.look;
  const middle = (from + to) / 2;
  // The same direction, the turn nearest the middle of the range.
  let a = angle;
  while (a > middle + 180) a -= 360;
  while (a <= middle - 180) a += 360;
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  a = Math.min(high, Math.max(low, a));
  const fraction = (a - from) / (to - from);
  return props.min + fraction * (props.max - props.min);
}

/** Where a key moves a value: a step, ten steps, or an end. Null for other keys. */
export function keyedValue(
  props: { min: number; max: number; step: number },
  value: number,
  key: string,
): number | null {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return value + props.step;
    case 'ArrowLeft':
    case 'ArrowDown':
      return value - props.step;
    case 'PageUp':
      return value + props.step * 10;
    case 'PageDown':
      return value - props.step * 10;
    case 'Home':
      return props.min;
    case 'End':
      return props.max;
    default:
      return null;
  }
}

export interface ControlEvents {
  /** The learner moved a control toward `value`; the player passes it to the engine and draws. */
  move(objectId: string, value: number): void;
}

export function createControls(project: Project, stage: HTMLElement, events: ControlEvents) {
  const controls = new Map<string, Control>();
  for (const scene of [...project.scenes, ...project.banks]) {
    for (const slide of scene.slides) {
      for (const layer of [slide.baseLayer, ...slide.layers]) {
        forEachObject(layer.objects, (object) => {
          if (object.type === 'slider' || object.type === 'dial') controls.set(object.id, object);
        });
      }
    }
  }
  /** The values last drawn, by id, so a dial's drag reads where it is now. */
  const shown = new Map<string, number>();

  const dialOf = (target: EventTarget | null) => {
    if (!(target instanceof stage.ownerDocument.defaultView!.Element)) return null;
    const element = target.closest<HTMLElement>('[data-object-type="dial"]');
    const object = element ? controls.get(element.dataset['objectId'] ?? '') : undefined;
    return element && object?.type === 'dial' ? { element, object } : null;
  };

  let dragging: { pointerId: number; element: HTMLElement; object: DialObject } | null = null;
  const turn = (event: PointerEvent, element: HTMLElement, object: DialObject) => {
    const look = object.props.look;
    // A dial drawn its own way (B16) turns about its pivot, wherever that is on the screen.
    const pivot = look ? element.querySelector('.vo-dial-pivot') : null;
    const box = (pivot ?? element).getBoundingClientRect();
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height / 2);
    if (look) {
      const onScreen = (Math.atan2(dx, -dy) * 180) / Math.PI;
      events.move(
        object.id,
        lookedDialValue({ ...object.props, look }, onScreen - object.frame.rotation),
      );
      return;
    }
    events.move(object.id, dialValue(object.props, dx, dy));
  };
  const down = (event: PointerEvent) => {
    const dial = dialOf(event.target);
    if (!dial || event.button !== 0) return;
    event.preventDefault();
    dragging = { pointerId: event.pointerId, ...dial };
    dial.element.setPointerCapture?.(event.pointerId);
    dial.element.focus();
    turn(event, dial.element, dial.object);
  };
  const move = (event: PointerEvent) => {
    if (!dragging || event.pointerId !== dragging.pointerId) return;
    turn(event, dragging.element, dragging.object);
  };
  const up = (event: PointerEvent) => {
    if (dragging && event.pointerId === dragging.pointerId) dragging = null;
  };
  stage.addEventListener('pointerdown', down);
  stage.addEventListener('pointermove', move);
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);

  return {
    /** Keys on a focused dial (a slider's are the browser's). True when one was used. */
    key(event: KeyboardEvent): boolean {
      const dial = dialOf(event.target);
      if (!dial) return false;
      const value = keyedValue(
        dial.object.props,
        shown.get(dial.object.id) ?? dial.object.props.initial,
        event.key,
      );
      if (value === null) return false;
      event.preventDefault();
      events.move(dial.object.id, value);
      return true;
    },
    /** A slider's input moved: true when it was a slider's. */
    input(target: EventTarget | null, id: string | undefined): boolean {
      const object = id ? controls.get(id) : undefined;
      if (
        object?.type !== 'slider' ||
        !(target instanceof stage.ownerDocument.defaultView!.HTMLInputElement)
      ) {
        return false;
      }
      events.move(object.id, Number(target.value));
      return true;
    },
    /** Draw each control at the engine's value. */
    sync(
      values: Iterable<{ id: string; controlValue?: number }>,
      elements: Map<string, HTMLElement>,
    ) {
      for (const { id, controlValue } of values) {
        if (controlValue === undefined) continue;
        const object = controls.get(id);
        const element = elements.get(id);
        if (!object || !element) continue;
        shown.set(id, controlValue);
        if (object.type === 'slider') {
          const input = element.querySelector<HTMLInputElement>('input.vo-slider');
          if (input && Number(input.value) !== controlValue) input.value = String(controlValue);
          continue;
        }
        const { min, max, look } = object.props;
        const fraction = max > min ? (controlValue - min) / (max - min) : 0;
        const angle = -DIAL_SWEEP / 2 + fraction * DIAL_SWEEP;
        element.setAttribute('role', 'slider');
        element.tabIndex = 0;
        element.setAttribute('aria-valuenow', String(controlValue));
        if (look) {
          // Turned about its own pivot (B16).
          const pointer = element.querySelector('.vo-dial-pointer');
          const pivot = pointer?.getAttribute('data-pivot') ?? '0 0';
          pointer?.setAttribute(
            'transform',
            `rotate(${dialLookAngle({ ...object.props, look }, controlValue)} ${pivot})`,
          );
          continue;
        }
        element
          .querySelector('.vo-dial-value')
          ?.setAttribute('stroke-dasharray', `${fraction * 100} 100`);
        element
          .querySelector('.vo-dial-pointer')
          ?.setAttribute('transform', `rotate(${angle} 50 50)`);
      }
    },
    destroy() {
      stage.removeEventListener('pointerdown', down);
      stage.removeEventListener('pointermove', move);
      stage.removeEventListener('pointerup', up);
      stage.removeEventListener('pointercancel', up);
    },
  };
}

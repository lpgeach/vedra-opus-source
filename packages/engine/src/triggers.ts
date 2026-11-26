/**
 * The pure parts of trigger evaluation (plan section 5): which triggers an
 * event wakes, in what order, how conditions compare values, and what a
 * "set variable" action produces. The engine supplies the live state.
 */
import { variableValueText } from '@vedraopus/model';
import type {
  Condition,
  Operand,
  Trigger,
  TriggerEvent,
  Variable,
  VariableValue,
} from '@vedraopus/model';
import type { EngineEvent } from './types';

/** Cascades deeper than this stop, so two triggers that wake each other cannot run forever. */
export const MAX_CASCADE_DEPTH = 32;

/** Whether the trigger's "when" is this event. */
export function listensFor(event: TriggerEvent, happened: EngineEvent): boolean {
  switch (event.type) {
    case 'click':
    case 'doubleClick':
    case 'rightClick':
    case 'mouseEnter':
    case 'mouseLeave':
      return (
        happened.type === 'objectInput' &&
        happened.input === event.type &&
        happened.objectId === event.object
      );
    case 'keyPress':
      return happened.type === 'keyPress' && sameKey(event.key, happened.key);
    case 'playerTab':
      return happened.type === 'playerTab' && happened.tab === event.tab;
    case 'timelineStart':
    case 'timelineEnd':
      return happened.type === event.type && happened.layerId === event.layer;
    case 'timelineReaches':
      return (
        happened.type === 'timelineReaches' &&
        happened.layerId === event.layer &&
        happened.time === event.time
      );
    case 'cuePoint':
      return (
        happened.type === 'cuePoint' &&
        happened.layerId === event.layer &&
        happened.cuePointId === event.cuePoint
      );
    case 'stateChange':
      return (
        happened.type === 'objectStateChange' &&
        happened.objectId === event.object &&
        happened.state === event.state
      );
    case 'variableChange':
      return happened.type === 'variableChange' && happened.variableId === event.variable;
    case 'mediaCompletes':
      return happened.type === 'mediaComplete' && happened.objectId === event.object;
    case 'controlMoves':
      return happened.type === 'controlMoves' && happened.objectId === event.object;
    case 'controlLosesFocus':
      return happened.type === 'controlLosesFocus' && happened.objectId === event.object;
    case 'spotClicked':
      return (
        happened.type === 'spotClicked' &&
        happened.objectId === event.object &&
        happened.spotId === event.spot
      );
    case 'panoramaVisited':
      return happened.type === 'panoramaVisited' && happened.objectId === event.object;
    case 'draggedOver':
    case 'droppedOn':
      return (
        (happened.type === 'draggedOver' || happened.type === 'droppedOn') &&
        happened.type === event.type &&
        happened.objectId === event.object &&
        happened.targetId === event.target
      );
    case 'intersects':
    case 'stopsIntersecting': {
      const wanted = event.type === 'intersects' ? 'objectsIntersect' : 'objectsSeparate';
      if (happened.type !== wanted) return false;
      const { objectId, otherId } = happened;
      return (
        (objectId === event.object && otherId === event.other) ||
        (objectId === event.other && otherId === event.object)
      );
    }
    case 'animationCompletes':
      return (
        happened.type === 'animationComplete' &&
        happened.objectId === event.object &&
        happened.animation === event.animation.kind &&
        (event.animation.kind !== 'path' || happened.path === event.animation.path)
      );
  }
}

/** Letters match in either case ("a" and "A"); named keys ("Enter") must match exactly. */
export function sameKey(wanted: string, pressed: string): boolean {
  return wanted.length === 1 && pressed.length === 1
    ? wanted.toLowerCase() === pressed.toLowerCase()
    : wanted === pressed;
}

const SCOPE_RANK = { object: 0, layer: 1, slide: 2 } as const;

/** Object triggers first, then layer, then slide; within each, the order they are listed in. */
export function inEvaluationOrder(triggers: readonly Trigger[]): Trigger[] {
  return triggers
    .map((trigger, index) => ({ trigger, index }))
    .sort(
      (a, b) =>
        SCOPE_RANK[a.trigger.owner.kind] - SCOPE_RANK[b.trigger.owner.kind] || a.index - b.index,
    )
    .map(({ trigger }) => trigger);
}

const asNumber = (value: VariableValue): number | null => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
};

/** Compare two values the way an author expects: numbers as numbers, text ignoring case for "contains". */
export function compare(
  left: VariableValue,
  operator: Extract<Condition, { subject: 'variable' }>['operator'],
  right: VariableValue,
): boolean {
  if (operator === 'contains') {
    return variableValueText(left).toLowerCase().includes(variableValueText(right).toLowerCase());
  }
  // As text, ignoring case (B12).
  if (operator === '==i' || operator === '!=i') {
    const same = variableValueText(left).toLowerCase() === variableValueText(right).toLowerCase();
    return operator === '==i' ? same : !same;
  }
  const [a, b] = [asNumber(left), asNumber(right)];
  const numeric =
    a !== null && b !== null && typeof left !== 'boolean' && typeof right !== 'boolean';
  const l = numeric ? a : variableValueText(left);
  const r = numeric ? b : variableValueText(right);
  switch (operator) {
    case '==':
      return l === r;
    case '!=':
      return l !== r;
    case '<':
      return l < r;
    case '<=':
      return l <= r;
    case '>':
      return l > r;
    case '>=':
      return l >= r;
  }
}

export interface ConditionWorld {
  /** A variable's current value by id, or undefined if there is none. */
  variable(id: string): VariableValue | undefined;
  /** The state an object is shown in on the current slide, or undefined if it is not there. */
  objectState(id: string): string | undefined;
}

export function operandValue(operand: Operand, world: ConditionWorld): VariableValue | undefined {
  return operand.kind === 'literal' ? operand.value : world.variable(operand.variable);
}

/** Conditions are checked when the trigger runs, so earlier triggers' changes count. */
export function conditionsPass(conditions: Trigger['conditions'], world: ConditionWorld): boolean {
  if (!conditions) return true;
  const one = (condition: Condition): boolean => {
    if (condition.subject === 'objectState') {
      const state = world.objectState(condition.object);
      if (state === undefined) return false;
      return condition.operator === '==' ? state === condition.state : state !== condition.state;
    }
    const left = world.variable(condition.variable);
    const right = operandValue(condition.value, world);
    if (left === undefined || right === undefined) return false;
    return compare(left, condition.operator, right);
  };
  return conditions.combine === 'and' ? conditions.items.every(one) : conditions.items.some(one);
}

/**
 * The value a "set variable" action gives a variable, or undefined when it
 * cannot apply (arithmetic on text, dividing by zero, a value that is not a number).
 */
export function nextValue(
  variable: Pick<Variable, 'type'>,
  current: VariableValue,
  operator: 'assign' | 'add' | 'subtract' | 'multiply' | 'divide' | 'append',
  operand: VariableValue,
): VariableValue | undefined {
  if (operator === 'assign') {
    if (variable.type === 'text') return variableValueText(operand);
    if (variable.type === 'boolean') return operand === true || operand === 'true';
    return asNumber(operand) ?? undefined;
  }
  if (operator === 'append') {
    return variable.type === 'text' ? `${String(current)}${variableValueText(operand)}` : undefined;
  }
  const [a, b] = [asNumber(current), asNumber(operand)];
  if (variable.type !== 'number' || a === null || b === null) return undefined;
  switch (operator) {
    case 'add':
      return a + b;
    case 'subtract':
      return a - b;
    case 'multiply':
      return a * b;
    case 'divide':
      return b === 0 ? undefined : a / b;
  }
}

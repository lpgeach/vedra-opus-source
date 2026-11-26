import type { Appearance, ObjectState, SceneObject } from './schema';

/** Names for the built-in states, as shown to authors. */
export const BUILT_IN_STATE_NAMES: Record<string, string> = {
  normal: 'Normal',
  hover: 'Hover',
  down: 'Down',
  selected: 'Selected',
  visited: 'Visited',
  disabled: 'Disabled',
  hidden: 'Hidden',
  dragOver: 'Drag Over',
  dropCorrect: 'Drop Correct',
  dropIncorrect: 'Drop Incorrect',
};

const cache = new WeakMap<SceneObject, Map<string, SceneObject>>();

/**
 * The object as it looks in one of its states: `normal` plus that state's
 * overrides. A state the object does not have, or `normal`, gives the object
 * itself. Results are remembered per object, so the same call returns the same
 * value and renderers can skip unchanged objects.
 */
export function resolveObjectState(object: SceneObject, stateId: string): SceneObject {
  if (stateId === 'normal') return object;
  const state = object.states.find((each) => each.id === stateId);
  if (!state) return object;
  let perObject = cache.get(object);
  const known = perObject?.get(stateId);
  if (known) return known;

  const { overrides } = state;
  const resolved = { ...object, frame: { ...object.frame, ...overrides.frame } } as SceneObject;
  if (resolved.type !== 'group') {
    const props = { ...resolved.props } as Record<string, unknown>;
    if (overrides.appearance && 'appearance' in props) {
      props['appearance'] = { ...(props['appearance'] as Appearance), ...overrides.appearance };
    }
    if (overrides.text !== undefined && 'text' in props) props['text'] = overrides.text;
    if (overrides.asset !== undefined && 'asset' in props) props['asset'] = overrides.asset;
    (resolved as { props: unknown }).props = props;
  }
  if (!perObject) cache.set(object, (perObject = new Map()));
  perObject.set(stateId, resolved);
  return resolved;
}

/** True when the state changes nothing. */
export function isEmptyState(state: ObjectState): boolean {
  return Object.keys(state.overrides).length === 0;
}

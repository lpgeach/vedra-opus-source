import { findLayer, findObject, idsInObject, pruneFocusOrder, triggerReferencesAny } from '../find';
import { withoutObjects } from '../questions';
import { objectStateSchema, sceneObjectSchema } from '../schema';
import type { Animations, Trigger } from '../schema';
import { CommandError } from './types';
import type { CommandHandlers } from './types';
import { assertIdsAreNew, assertValid, insertionIndex, moveWithin, requireObject } from './util';

type ObjectCommands = Pick<
  CommandHandlers,
  | 'object.add'
  | 'object.remove'
  | 'object.update'
  | 'state.add'
  | 'state.remove'
  | 'state.update'
  | 'object.reorder'
  | 'object.rename'
  | 'object.group'
  | 'object.ungroup'
>;

export const objectCommands: ObjectCommands = {
  'object.add': (draft, { layerId, object, index }) => {
    const found = findLayer(draft, layerId);
    if (!found) throw new CommandError(`No layer with id "${layerId}"`);
    assertValid(sceneObjectSchema, object, 'object');
    assertIdsAreNew(draft, idsInObject(object));
    const { objects } = found.layer;
    objects.splice(insertionIndex(index, objects.length), 0, object);
  },

  'object.remove': (draft, { objectIds }) => {
    // Resolve everything before removing anything, so one bad id rejects the whole command.
    const targets = objectIds.map((id) => requireObject(draft, id));
    const removedIds = new Set(targets.flatMap(({ object }) => idsInObject(object)));

    for (const { object, slide } of targets) {
      // Removing a group may already have taken this object with it.
      const location = findObject(draft, object.id);
      location?.siblings.splice(location.index, 1);
      if (slide) {
        slide.triggers = slide.triggers.filter(
          (trigger) => !triggerReferencesAny(trigger, removedIds),
        );
        // A removed object leaves its question: a part that names it goes, a prompt or Submit is unset.
        if (slide.question) slide.question = withoutObjects(slide.question, removedIds);
        // And the Tab order (P10.1).
        pruneFocusOrder(slide);
      }
    }
  },

  'object.update': (draft, { objectId, changes, stateId }) => {
    const { object, slide, siblings, layer } = requireObject(draft, objectId);
    if (changes.animations !== undefined) {
      if (stateId !== undefined && stateId !== 'normal') {
        throw new CommandError('Animations belong to the object, not to one of its states');
      }
      const { entrance, exit, motionPaths } = changes.animations;
      if (object.type === 'zoomRegion' && (entrance || exit || motionPaths.length > 0)) {
        throw new CommandError('A zoom region cannot have animations');
      }
      const kept = new Set(motionPaths.map((motion) => motion.id));
      const removedPaths = new Set(
        object.animations.motionPaths.map((motion) => motion.id).filter((id) => !kept.has(id)),
      );
      assertIdsAreNew(
        draft,
        motionPaths
          .map((motion) => motion.id)
          .filter((id) => !object.animations.motionPaths.some((motion) => motion.id === id)),
      );
      if (slide)
        slide.triggers = withoutAnimationTriggers(
          slide.triggers,
          objectId,
          changes.animations,
          removedPaths,
        );
    }
    if (changes.drag && siblings !== layer.objects) {
      throw new CommandError('An object inside a group moves with it, so it cannot be dragged');
    }
    let { frame, props } = changes;
    const { timing, a11y } = changes;
    const rest: Record<string, unknown> = { ...changes };
    for (const key of ['frame', 'timing', 'a11y', 'props']) delete rest[key];

    if (stateId !== undefined && stateId !== 'normal') {
      const state = object.states.find((each) => each.id === stateId);
      if (!state) throw new CommandError(`Object "${objectId}" has no state "${stateId}"`);
      const { overrides } = state;
      if (frame) {
        overrides.frame = { ...overrides.frame, ...frame };
        frame = undefined;
      }
      if (props) {
        const remaining = { ...props };
        if ('appearance' in remaining && object.type !== 'group' && 'appearance' in object.props) {
          // Keep only what differs from normal, so later changes to normal still show through.
          const normal = object.props.appearance as unknown as Record<string, unknown>;
          const wanted = remaining['appearance'] as Record<string, unknown>;
          const differing: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(wanted)) {
            if (JSON.stringify(value) !== JSON.stringify(normal[key])) differing[key] = value;
          }
          if (Object.keys(differing).length > 0) overrides.appearance = differing as never;
          else delete overrides.appearance;
          delete remaining['appearance'];
        }
        if ('text' in remaining && remaining['text'] !== null) {
          overrides.text = remaining['text'] as never;
          delete remaining['text'];
        }
        if ('asset' in remaining) {
          overrides.asset = remaining['asset'] as never;
          delete remaining['asset'];
        }
        props = Object.keys(remaining).length > 0 ? remaining : undefined;
      }
    }

    if (typeof rest['initialState'] === 'string') {
      const wanted = rest['initialState'];
      if (!object.states.some((state) => state.id === wanted)) {
        throw new CommandError(`Object "${objectId}" has no state "${wanted}"`);
      }
    }
    Object.assign(object, rest);
    if (frame) Object.assign(object.frame, frame);
    if (timing) Object.assign(object.timing, timing);
    if (a11y) Object.assign(object.a11y, a11y);
    if (props && object.type === 'panorama' && Array.isArray(props['spots'])) {
      // A 360° image's spots (P9.10): new ones need new ids; triggers waiting for a removed one go.
      const before = new Set(object.props.spots.map((spot) => spot.id));
      const after = (props['spots'] as { id: string }[]).map((spot) => spot.id);
      assertIdsAreNew(
        draft,
        after.filter((id) => !before.has(id)),
      );
      const removed = new Set([...before].filter((id) => !after.includes(id)));
      if (slide && removed.size > 0) {
        slide.triggers = slide.triggers.filter(
          (trigger) => !triggerReferencesAny(trigger, removed),
        );
      }
    }
    if (props) {
      if (object.type === 'group') throw new CommandError('A group has no props to update');
      Object.assign(object.props, props);
    }
    assertValid(sceneObjectSchema, object, `changes to object "${objectId}"`);
  },

  'state.add': (draft, { objectId, state, index }) => {
    const { object } = requireObject(draft, objectId);
    assertValid(objectStateSchema, state, 'state');
    if (object.states.some((each) => each.id === state.id)) {
      throw new CommandError(`Object "${objectId}" already has a state "${state.id}"`);
    }
    object.states.splice(insertionIndex(index, object.states.length), 0, state);
    assertValid(sceneObjectSchema, object, `changes to object "${objectId}"`);
  },

  'state.remove': (draft, { objectId, stateId }) => {
    const { object, slide } = requireObject(draft, objectId);
    if (stateId === 'normal') throw new CommandError('The normal state cannot be removed');
    const index = object.states.findIndex((each) => each.id === stateId);
    if (index < 0) throw new CommandError(`Object "${objectId}" has no state "${stateId}"`);
    object.states.splice(index, 1);
    if (object.initialState === stateId) object.initialState = 'normal';
    if (slide) {
      // Triggers that set or test this state of this object no longer mean anything.
      const uses = (value: unknown): boolean => {
        if (!value || typeof value !== 'object') return false;
        const record = value as Record<string, unknown>;
        if (record['object'] === objectId && record['state'] === stateId) return true;
        return Object.values(record).some(uses);
      };
      slide.triggers = slide.triggers.filter((trigger) => !uses(trigger));
    }
  },

  'state.update': (draft, { objectId, stateId, changes }) => {
    const { object } = requireObject(draft, objectId);
    const state = object.states.find((each) => each.id === stateId);
    if (!state) throw new CommandError(`Object "${objectId}" has no state "${stateId}"`);
    if (changes.name !== undefined) {
      if (changes.name.length === 0) throw new CommandError('A state name cannot be empty');
      state.name = changes.name;
    }
    if (changes.overrides !== undefined) {
      if (stateId === 'normal' && Object.keys(changes.overrides).length > 0) {
        throw new CommandError('The normal state has no overrides: it is the object itself');
      }
      state.overrides = changes.overrides;
    }
    assertValid(sceneObjectSchema, object, `changes to object "${objectId}"`);
  },

  'object.reorder': (draft, { objectId, index }) => {
    const { siblings, index: from } = requireObject(draft, objectId);
    moveWithin(siblings, from, index);
  },

  'object.rename': (draft, { objectId, name }) => {
    if (name.length === 0) throw new CommandError('An object name cannot be empty');
    requireObject(draft, objectId).object.name = name;
  },

  'object.group': (draft, { objectIds, group }) => {
    if (new Set(objectIds).size !== objectIds.length) {
      throw new CommandError('The same object was listed twice');
    }
    if (objectIds.length < 2) throw new CommandError('A group needs at least two objects');
    if (group.children.length > 0) throw new CommandError('The new group must start empty');
    assertValid(sceneObjectSchema, group, 'group');
    assertIdsAreNew(draft, [group.id]);

    const members = objectIds.map((id) => requireObject(draft, id));
    const { siblings } = members[0]!;
    if (members.some((member) => member.siblings !== siblings)) {
      throw new CommandError('Only objects in the same layer or group can be grouped');
    }

    // Members keep their own timing and animations (B8); only dragging is for objects at
    // the top of a layer, as a dragged object inside a group would leave it behind (P9.7).
    for (const member of members) member.object.drag = null;

    // Keep the members' z-order, and put the group where the topmost one was.
    members.sort((a, b) => a.index - b.index);
    const children = members.map((member) => member.object);
    const top = members.at(-1)!.index;
    const left = Math.min(...children.map((child) => child.frame.x));
    const topEdge = Math.min(...children.map((child) => child.frame.y));
    const right = Math.max(...children.map((child) => child.frame.x + child.frame.width));
    const bottom = Math.max(...children.map((child) => child.frame.y + child.frame.height));

    // Remove from the top down so earlier positions stay valid.
    for (const member of [...members].reverse()) siblings.splice(member.index, 1);
    siblings.splice(top - (members.length - 1), 0, {
      ...group,
      frame: { x: left, y: topEdge, width: right - left, height: bottom - topEdge, rotation: 0 },
      children,
    });
  },

  'object.ungroup': (draft, { groupId }) => {
    const { object, siblings, index, slide } = requireObject(draft, groupId);
    if (object.type !== 'group') throw new CommandError(`Object "${groupId}" is not a group`);
    siblings.splice(index, 1, ...object.children);
    if (slide) {
      const gone = new Set([groupId]);
      slide.triggers = slide.triggers.filter((trigger) => !triggerReferencesAny(trigger, gone));
      pruneFocusOrder(slide);
    }
  },
};

/**
 * `triggers` without those that run a removed motion path, or wait for an
 * animation the object no longer has (`next` is what it will have).
 */
function withoutAnimationTriggers(
  triggers: Trigger[],
  objectId: string,
  next: Animations,
  removedPaths: ReadonlySet<string>,
): Trigger[] {
  return triggers.filter((trigger) => {
    if (triggerReferencesAny(trigger, removedPaths)) return false;
    const { event } = trigger;
    if (event.type !== 'animationCompletes' || event.object !== objectId) return true;
    return event.animation.kind === 'path' || next[event.animation.kind] !== null;
  });
}

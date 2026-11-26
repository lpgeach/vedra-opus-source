import { current, isDraft } from 'immer';
import { triggerSchema } from '../schema';
import type { Project, Trigger } from '../schema';
import { everySlide } from '../traverse';
import { findReferenceIssues } from '../validate';
import { CommandError } from './types';
import type { CommandHandlers } from './types';
import { assertIdsAreNew, assertValid, insertionIndex, moveWithin, requireSlide } from './util';

function requireTrigger(project: Project, triggerId: string) {
  for (const { slide } of everySlide(project)) {
    const index = slide.triggers.findIndex((trigger) => trigger.id === triggerId);
    if (index >= 0) return { slide, index, trigger: slide.triggers[index]! };
  }
  throw new CommandError(`No trigger with id "${triggerId}"`);
}

/**
 * A trigger may only refer to its own slide's objects, layers and cue points
 * (plus any slide and project variables). Reject it, naming the first problem,
 * if it does not.
 */
function assertReferencesHold(project: Project, triggerId: string): void {
  const plain = isDraft(project) ? (current(project) as Project) : project;
  // The trigger's own place in the document, as validation issues spell it.
  let prefix = '';
  plain.scenes.forEach((scene, sceneIndex) =>
    scene.slides.forEach((slide, slideIndex) => {
      const index = slide.triggers.findIndex((trigger) => trigger.id === triggerId);
      if (index >= 0) prefix = `scenes[${sceneIndex}].slides[${slideIndex}].triggers[${index}]`;
    }),
  );
  const problem = findReferenceIssues(plain).find(
    (issue) => issue.path === prefix || issue.path.startsWith(`${prefix}.`),
  );
  if (problem) throw new CommandError(`The trigger cannot be saved: ${problem.message}`);
}

export const triggerCommands: Pick<
  CommandHandlers,
  'trigger.add' | 'trigger.update' | 'trigger.remove' | 'trigger.move'
> = {
  'trigger.add': (draft, { slideId, trigger, index }) => {
    const { slide } = requireSlide(draft, slideId);
    assertValid(triggerSchema, trigger, 'trigger');
    assertIdsAreNew(draft, [trigger.id]);
    slide.triggers.splice(insertionIndex(index, slide.triggers.length), 0, trigger);
    assertReferencesHold(draft, trigger.id);
  },

  'trigger.update': (draft, { triggerId, changes }) => {
    const { trigger } = requireTrigger(draft, triggerId);
    const next: Trigger = { ...trigger, ...changes, id: trigger.id };
    assertValid(triggerSchema, next, 'trigger');
    Object.assign(trigger, changes);
    assertReferencesHold(draft, triggerId);
  },

  'trigger.remove': (draft, { triggerId }) => {
    const { slide, index } = requireTrigger(draft, triggerId);
    slide.triggers.splice(index, 1);
  },

  'trigger.move': (draft, { triggerId, index }) => {
    const { slide, index: from } = requireTrigger(draft, triggerId);
    moveWithin(slide.triggers, from, index);
  },
};

import type { Project, Slide, TriggerAction } from './schema';
import { allSlides } from './traverse';

export interface SlideLink {
  from: string;
  to: string;
  /** `jump`: a trigger jumps there. `next` / `previous`: the slide's own player button. `auto`: it moves on when its timeline ends. */
  kind: 'jump' | 'next' | 'previous' | 'auto';
}

/** Where a jump action leads from `index` in course order, if anywhere. */
function jumpTarget(
  action: TriggerAction | null,
  order: readonly Slide[],
  index: number,
): string | null {
  if (!action || action.type !== 'jumpToSlide') return null;
  const { target } = action;
  if (target.kind === 'slide')
    return order.some((s) => s.id === target.slide) ? target.slide : null;
  return order[index + (target.kind === 'next' ? 1 : -1)]?.id ?? null;
}

/**
 * Every way a learner can get from one slide to another: triggers that jump
 * (including jumps to the next or previous slide, and "otherwise" actions),
 * the slide's Previous and Next buttons when shown, and moving on by itself.
 * Each pair and kind is listed once.
 */
export function slideLinks(project: Project): SlideLink[] {
  const order = allSlides(project).map(({ slide }) => slide);
  const links = new Map<string, SlideLink>();
  const add = (from: string, to: string | null | undefined, kind: SlideLink['kind']) => {
    if (!to || to === from) return;
    links.set(`${from}>${to}>${kind}`, { from, to, kind });
  };
  order.forEach((slide, index) => {
    for (const trigger of slide.triggers) {
      if (!trigger.enabled) continue;
      add(slide.id, jumpTarget(trigger.action, order, index), 'jump');
      add(slide.id, jumpTarget(trigger.otherwise, order, index), 'jump');
    }
    const { controls, advance } = slide.properties;
    if (controls.next) add(slide.id, order[index + 1]?.id, 'next');
    if (controls.previous) add(slide.id, order[index - 1]?.id, 'previous');
    if (advance === 'auto') add(slide.id, order[index + 1]?.id, 'auto');
  });
  return [...links.values()];
}

/** Slides the learner can never reach from the first slide by any link. */
export function unreachableSlides(project: Project): string[] {
  const order = allSlides(project).map(({ slide }) => slide);
  const first = order[0];
  if (!first) return [];
  const next = new Map<string, string[]>();
  for (const link of slideLinks(project)) {
    next.set(link.from, [...(next.get(link.from) ?? []), link.to]);
  }
  const reached = new Set([first.id]);
  const queue = [first.id];
  while (queue.length > 0) {
    for (const to of next.get(queue.shift()!) ?? []) {
      if (!reached.has(to)) {
        reached.add(to);
        queue.push(to);
      }
    }
  }
  return order.filter((slide) => !reached.has(slide.id)).map((slide) => slide.id);
}

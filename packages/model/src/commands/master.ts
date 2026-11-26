import { idsInLayer } from '../find';
import { slideLayoutSchema, slideMasterSchema } from '../schema';
import type { Project } from '../schema';
import { everySlide } from '../traverse';
import { CommandError } from './types';
import type { CommandHandlers } from './types';
import { assertIdsAreNew, assertValid, insertionIndex, requireSlide } from './util';

function requireMaster(project: Project, masterId: string) {
  const index = project.masters.findIndex((master) => master.id === masterId);
  const master = project.masters[index];
  if (!master) throw new CommandError(`No master with id "${masterId}"`);
  return { master, index };
}

function requireLayout(project: Project, layoutId: string) {
  for (const master of project.masters) {
    const index = master.layouts.findIndex((layout) => layout.id === layoutId);
    const layout = master.layouts[index];
    if (layout) return { layout, master, index };
  }
  throw new CommandError(`No layout with id "${layoutId}"`);
}

/** Slides that used a removed layout become blank (no layout). */
function detachSlides(project: Project, layoutIds: ReadonlySet<string>): void {
  for (const { slide } of everySlide(project)) {
    if (slide.layoutId !== null && layoutIds.has(slide.layoutId)) slide.layoutId = null;
  }
}

export const masterCommands: Pick<
  CommandHandlers,
  | 'master.add'
  | 'master.remove'
  | 'master.rename'
  | 'layout.add'
  | 'layout.remove'
  | 'layout.rename'
  | 'slide.setLayout'
> = {
  'master.add': (draft, { master, index }) => {
    assertValid(slideMasterSchema, master, 'master');
    if (master.kind === 'feedback') throw new CommandError('A project has one feedback master');
    assertIdsAreNew(draft, [
      master.id,
      ...idsInLayer(master.layer),
      ...master.layouts.flatMap((layout) => [layout.id, ...idsInLayer(layout.layer)]),
    ]);
    draft.masters.splice(insertionIndex(index, draft.masters.length), 0, master);
  },

  'master.remove': (draft, { masterId }) => {
    const { master, index } = requireMaster(draft, masterId);
    if (master.kind === 'feedback') throw new CommandError('The feedback master cannot be deleted');
    detachSlides(draft, new Set(master.layouts.map((layout) => layout.id)));
    draft.masters.splice(index, 1);
  },

  'master.rename': (draft, { masterId, name }) => {
    if (name.length === 0) throw new CommandError('A master name cannot be empty');
    requireMaster(draft, masterId).master.name = name;
  },

  'layout.add': (draft, { masterId, layout, index }) => {
    const { master } = requireMaster(draft, masterId);
    if (master.kind === 'feedback') {
      throw new CommandError('The feedback master has its four layouts only');
    }
    assertValid(slideLayoutSchema, layout, 'layout');
    if (layout.role !== null) throw new CommandError('Only feedback layouts have a result');
    assertIdsAreNew(draft, [layout.id, ...idsInLayer(layout.layer)]);
    master.layouts.splice(insertionIndex(index, master.layouts.length), 0, layout);
  },

  'layout.remove': (draft, { layoutId }) => {
    const { layout, master, index } = requireLayout(draft, layoutId);
    if (master.kind === 'feedback') throw new CommandError('Feedback layouts cannot be deleted');
    detachSlides(draft, new Set([layout.id]));
    master.layouts.splice(index, 1);
  },

  'layout.rename': (draft, { layoutId, name }) => {
    if (name.length === 0) throw new CommandError('A layout name cannot be empty');
    requireLayout(draft, layoutId).layout.name = name;
  },

  'slide.setLayout': (draft, { slideId, layoutId, objects = [] }) => {
    const { slide } = requireSlide(draft, slideId);
    if (layoutId !== null && requireLayout(draft, layoutId).master.kind === 'feedback') {
      throw new CommandError('A slide cannot use a feedback layout');
    }
    slide.layoutId = layoutId;
    // Placeholder copies the caller made for this slide go on top of its own objects.
    for (const object of objects) {
      assertIdsAreNew(draft, [object.id]);
      slide.baseLayer.objects.push(object);
    }
  },
};

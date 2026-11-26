import { idsInLayer, idsInScene, idsInSlide, opensAsLightbox, triggerReferencesAny } from '../find';
import type { Project, Slide } from '../schema';
import { branchTargets, questionPartIds, withoutBranchesTo } from '../questions';
import {
  assetMetaSchema,
  drawSchema,
  resultSchema,
  richTextSchema,
  sceneSchema,
  slideMasterSchema,
  slideSchema,
  variableSchema,
} from '../schema';
import { everySlide } from '../traverse';
import { CommandError } from './types';
import type { CommandHandlers } from './types';
import {
  assertIdsAreNew,
  assertValid,
  insertionIndex,
  moveWithin,
  requireScene,
  requireSlide,
} from './util';

/**
 * After slides have been taken out of the project, drop every remaining
 * trigger that depended on them (in practice: jumps to a removed slide), so
 * the project never holds a reference to something that is gone.
 */
function removeTriggersReferencing(project: Project, removedIds: ReadonlySet<string>): void {
  for (const { slide } of everySlide(project)) {
    if (!slide.triggers.some((trigger) => triggerReferencesAny(trigger, removedIds))) continue;
    slide.triggers = slide.triggers.filter((trigger) => !triggerReferencesAny(trigger, removedIds));
  }
}

type SceneCommands = Pick<
  CommandHandlers,
  | 'scene.add'
  | 'scene.remove'
  | 'scene.rename'
  | 'scene.move'
  | 'slide.add'
  | 'slides.import'
  | 'slide.remove'
  | 'slide.rename'
  | 'slide.setQuestion'
  | 'slide.setProperties'
  | 'slide.setNotes'
  | 'slide.move'
  | 'bank.add'
  | 'bank.remove'
  | 'bank.rename'
  | 'slide.setDraw'
  | 'slide.setResult'
>;

/**
 * After slides are gone (P7.7): take them out of every result's included
 * slides, and if the tracked result went, track by trigger instead.
 */
function forgetResultsOf(project: Project, removedIds: ReadonlySet<string>): void {
  // Questions that branched to a removed slide go on to the next slide instead.
  for (const { slide } of everySlide(project)) {
    if (slide.question && branchTargets(slide.question).some((id) => removedIds.has(id))) {
      slide.question = withoutBranchesTo(slide.question, removedIds);
    }
  }
  for (const { slide } of everySlide(project)) {
    const include = slide.result?.include;
    if (include?.kind === 'chosen' && include.slides.some((id) => removedIds.has(id))) {
      include.slides = include.slides.filter((id) => !removedIds.has(id));
    }
  }
  // The player's menu forgets removed slides (P8.1).
  for (const id of Object.keys(project.player.menu.entries)) {
    if (removedIds.has(id)) delete project.player.menu.entries[id];
  }
  // A custom tab that opened a removed slide as a lightbox runs triggers again (P8.4).
  for (const tab of project.player.tabs.custom) {
    if (tab.lightbox && removedIds.has(tab.lightbox.slide)) tab.lightbox = null;
  }
  const completion = project.tracking.completion;
  if (completion.kind === 'result' && removedIds.has(completion.slide)) {
    project.tracking.completion = { kind: 'trigger' };
  }
}

/** A bank holds question slides only, and never a draw slide (P7.6). */
function assertFitsIn(bank: boolean | undefined, slide: Slide): void {
  if (bank && (!slide.question || slide.draw)) {
    throw new CommandError('A question bank holds question slides only');
  }
}

/** Take removed bank slides out of every draw's locked questions. */
function unlockRemoved(project: Project, removedIds: ReadonlySet<string>): void {
  for (const { slide } of everySlide(project)) {
    if (slide.draw?.locked.some((id) => removedIds.has(id))) {
      slide.draw.locked = slide.draw.locked.filter((id) => !removedIds.has(id));
    }
  }
}

export const sceneCommands: SceneCommands = {
  'scene.add': (draft, { scene, index }) => {
    assertValid(sceneSchema, scene, 'scene');
    assertIdsAreNew(draft, idsInScene(scene));
    draft.scenes.splice(insertionIndex(index, draft.scenes.length), 0, scene);
  },

  'scene.remove': (draft, { sceneId }) => {
    const { scene, index, bank } = requireScene(draft, sceneId);
    if (bank) throw new CommandError('Remove a question bank with bank.remove');
    if (draft.scenes.length === 1) throw new CommandError('A project must keep at least one scene');
    const removedIds = new Set(idsInScene(scene));
    draft.scenes.splice(index, 1);
    removeTriggersReferencing(draft, removedIds);
    unlockRemoved(draft, removedIds);
    forgetResultsOf(draft, removedIds);
  },

  'scene.rename': (draft, { sceneId, title }) => {
    requireScene(draft, sceneId).scene.title = title;
  },

  'scene.move': (draft, { sceneId, index }) => {
    const { index: from, bank } = requireScene(draft, sceneId);
    if (bank) throw new CommandError('Question banks are not moved among the scenes');
    moveWithin(draft.scenes, from, index);
  },

  'slide.add': (draft, { sceneId, slide, index }) => {
    const { scene, bank } = requireScene(draft, sceneId);
    assertValid(slideSchema, slide, 'slide');
    assertFitsIn(bank, slide);
    assertIdsAreNew(draft, idsInSlide(slide));
    scene.slides.splice(insertionIndex(index, scene.slides.length), 0, slide);
  },

  'slides.import': (draft, { sceneId, index, slides, banks, masters, variables, assets }) => {
    const { scene, bank } = requireScene(draft, sceneId);
    if (bank) throw new CommandError('Slides are imported into a scene, not a question bank');
    for (const slide of slides) assertValid(slideSchema, slide, 'slide');
    for (const each of banks) assertValid(sceneSchema, each, 'bank');
    for (const master of masters) {
      assertValid(slideMasterSchema, master, 'master');
      if (master.kind !== 'slide') throw new CommandError('Only slide masters are imported');
    }
    for (const variable of variables) assertValid(variableSchema, variable, 'variable');
    for (const meta of Object.values(assets)) assertValid(assetMetaSchema, meta, 'asset');
    assertIdsAreNew(draft, [
      ...slides.flatMap(idsInSlide),
      ...banks.flatMap(idsInScene),
      ...masters.flatMap((master) => [
        master.id,
        ...idsInLayer(master.layer),
        ...master.layouts.flatMap((layout) => [layout.id, ...idsInLayer(layout.layer)]),
      ]),
      ...variables.map((variable) => variable.id),
    ]);
    const names = new Set(draft.variables.map((variable) => variable.name.toLowerCase()));
    for (const variable of variables) {
      if (names.has(variable.name.toLowerCase())) {
        throw new CommandError(`A variable called "${variable.name}" already exists`);
      }
      names.add(variable.name.toLowerCase());
    }
    for (const [hash, meta] of Object.entries(assets)) draft.assets[hash] ??= meta;
    draft.variables.push(...variables);
    // Slide masters go before the feedback master, which stays last.
    const feedback = draft.masters.findIndex((master) => master.kind === 'feedback');
    draft.masters.splice(feedback < 0 ? draft.masters.length : feedback, 0, ...masters);
    draft.banks.push(...banks);
    scene.slides.splice(insertionIndex(index, scene.slides.length), 0, ...slides);
  },

  'slide.remove': (draft, { slideId }) => {
    const { slide, scene, index } = requireSlide(draft, slideId);
    const removedIds = new Set(idsInSlide(slide));
    scene.slides.splice(index, 1);
    removeTriggersReferencing(draft, removedIds);
    unlockRemoved(draft, removedIds);
    forgetResultsOf(draft, removedIds);
  },

  'slide.rename': (draft, { slideId, title }) => {
    requireSlide(draft, slideId).slide.title = title;
  },

  'slide.setQuestion': (draft, { slideId, question }) => {
    const { slide, scene } = requireSlide(draft, slideId);
    if (question && slide.draw) throw new CommandError('A draw slide cannot also be a question');
    if (question && slide.result) {
      throw new CommandError('A result slide cannot also be a question');
    }
    if (!question && draft.banks.includes(scene)) {
      throw new CommandError('A question bank holds question slides only');
    }
    if (question) {
      const before = new Set(slide.question ? questionPartIds(slide.question) : []);
      assertIdsAreNew(
        draft,
        questionPartIds(question).filter((id) => !before.has(id)),
      );
    }
    slide.question = question;
    assertValid(slideSchema, slide, `slide "${slide.title}"`);
  },

  'slide.setNotes': (draft, { slideId, notes }) => {
    const { slide } = requireSlide(draft, slideId);
    assertValid(richTextSchema, notes, 'notes');
    slide.notes = notes;
  },

  'slide.setProperties': (draft, { slideId, properties }) => {
    const { slide } = requireSlide(draft, slideId);
    const { controls, ...rest } = properties;
    Object.assign(slide.properties, rest);
    if (controls) Object.assign(slide.properties.controls, controls);
    assertValid(slideSchema, slide, `slide "${slide.title}"`);
  },

  'slide.move': (draft, { slideId, sceneId, index }) => {
    const from = requireSlide(draft, slideId);
    const { scene: target, bank } = requireScene(draft, sceneId);
    assertFitsIn(bank, from.slide);
    // A slide leaving its bank is no longer locked into draws from it.
    if (from.scene.id !== target.id) unlockRemoved(draft, new Set([slideId]));
    // A slide going from a scene into a bank leaves the course (the Phase 8 review):
    // other slides' jumps and lightboxes to it go, and so do branches, results,
    // menu entries and tabs that named it, as when a slide is removed.
    const fromBank = draft.banks.some((each) => each.id === from.scene.id);
    if (bank && !fromBank) {
      const moved = new Set([slideId]);
      for (const { slide } of everySlide(draft)) {
        if (slide.id === slideId) continue;
        slide.triggers = slide.triggers.filter((trigger) => !triggerReferencesAny(trigger, moved));
      }
      forgetResultsOf(draft, moved);
    }
    if (from.scene.id === target.id) {
      moveWithin(target.slides, from.index, index);
      return;
    }
    const position = insertionIndex(index, target.slides.length);
    const [slide] = from.scene.slides.splice(from.index, 1);
    target.slides.splice(position, 0, slide!);
  },

  'bank.add': (draft, { bank, index }) => {
    assertValid(sceneSchema, bank, 'bank');
    for (const slide of bank.slides) assertFitsIn(true, slide);
    assertIdsAreNew(draft, idsInScene(bank));
    draft.banks.splice(insertionIndex(index, draft.banks.length), 0, bank);
  },

  'bank.remove': (draft, { bankId }) => {
    const index = draft.banks.findIndex((bank) => bank.id === bankId);
    const bank = draft.banks[index];
    if (!bank) throw new CommandError(`No question bank with id "${bankId}"`);
    draft.banks.splice(index, 1);
    // Draws from it now draw nothing; their locks went with it.
    for (const { slide } of everySlide(draft)) {
      if (slide.draw?.bank === bankId) slide.draw = { ...slide.draw, bank: null, locked: [] };
    }
    const removed = new Set(idsInScene(bank));
    removeTriggersReferencing(draft, removed);
    forgetResultsOf(draft, removed);
  },

  'bank.rename': (draft, { bankId, title }) => {
    const bank = draft.banks.find((each) => each.id === bankId);
    if (!bank) throw new CommandError(`No question bank with id "${bankId}"`);
    bank.title = title;
  },

  'slide.setResult': (draft, { slideId, result }) => {
    const { slide } = requireSlide(draft, slideId);
    if (result) {
      assertValid(resultSchema, result, 'result');
      if (slide.question || slide.draw) {
        throw new CommandError('A question or draw slide cannot also be a result slide');
      }
      if (draft.banks.some((bank) => bank.slides.includes(slide))) {
        throw new CommandError('A result slide belongs in a scene, not a bank');
      }
    }
    slide.result = result;
    if (!result) forgetResultsOf(draft, new Set([slideId]));
  },

  'slide.setDraw': (draft, { slideId, draw }) => {
    const { slide } = requireSlide(draft, slideId);
    if (draw) {
      assertValid(drawSchema, draw, 'draw');
      if (slide.question) throw new CommandError('A question slide cannot also be a draw');
      if (slide.result) throw new CommandError('A result slide cannot also be a draw');
      if (opensAsLightbox(draft as Project, slide.id)) {
        throw new CommandError('A slide that opens as a lightbox cannot be a draw');
      }
      if (draft.banks.some((bank) => bank.slides.includes(slide))) {
        throw new CommandError('A draw slide belongs in a scene, not a bank');
      }
    }
    slide.draw = draw;
  },
};

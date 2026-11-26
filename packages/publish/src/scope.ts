import { triggerReferencesAny, withoutBranchesTo } from '@vedraopus/model';
import type { PlayerSettings, Project, Slide } from '@vedraopus/model';

export type PreviewScope =
  { kind: 'project' } | { kind: 'scene'; sceneId: string } | { kind: 'slide'; slideId: string };

/**
 * The part of a project a preview plays: all of it, one scene or one slide.
 * Triggers that pointed at slides left out are dropped, so the result is a
 * valid project on its own. An id that does not exist gives the whole project.
 */
/** A slide with nothing left that names a slide in `removed`. */
function withoutRemoved(slide: Slide, removed: ReadonlySet<string>): Slide {
  const include = slide.result?.include;
  return {
    ...slide,
    triggers: slide.triggers.filter((trigger) => !triggerReferencesAny(trigger, removed)),
    question: slide.question ? withoutBranchesTo(slide.question, removed) : null,
    result:
      slide.result && include?.kind === 'chosen'
        ? {
            ...slide.result,
            include: { kind: 'chosen', slides: include.slides.filter((id) => !removed.has(id)) },
          }
        : slide.result,
  };
}

/** The player's menu and lightbox tabs, naming no slide in `removed` (the Phase 8 review). */
function playerWithout(player: PlayerSettings, removed: ReadonlySet<string>): PlayerSettings {
  return {
    ...player,
    menu: {
      ...player.menu,
      entries: Object.fromEntries(
        Object.entries(player.menu.entries).filter(([id]) => !removed.has(id)),
      ),
    },
    tabs: {
      ...player.tabs,
      custom: player.tabs.custom.map((tab) =>
        tab.lightbox && removed.has(tab.lightbox.slide) ? { ...tab, lightbox: null } : tab,
      ),
    },
  };
}

export function scopeProject(project: Project, scope: PreviewScope): Project {
  if (scope.kind === 'project') return project;
  // A question bank's slide plays on its own, as the course's only slide (P7.6).
  const banked =
    scope.kind === 'slide'
      ? project.banks.flatMap((bank) => bank.slides).find((slide) => slide.id === scope.slideId)
      : undefined;
  if (banked) {
    const others = new Set(
      [...project.scenes, ...project.banks]
        .flatMap((scene) => scene.slides.map((slide) => slide.id))
        .filter((id) => id !== banked.id),
    );
    return {
      ...project,
      scenes: [
        {
          id: project.scenes[0]?.id ?? 'scene_preview',
          title: 'Preview',
          slides: [withoutRemoved(banked, others)],
        },
      ],
      banks: [],
      player: playerWithout(project.player, others),
      tracking:
        project.tracking.completion.kind === 'result'
          ? { ...project.tracking, completion: { kind: 'trigger' } }
          : project.tracking,
    };
  }
  const scenes = project.scenes
    .map((scene) => {
      if (scope.kind === 'scene') return scene.id === scope.sceneId ? scene : null;
      const slides = scene.slides.filter((slide) => slide.id === scope.slideId);
      return slides.length > 0 ? { ...scene, slides } : null;
    })
    .filter((scene) => scene !== null);
  if (scenes.length === 0) return project;

  const kept = new Set(scenes.flatMap((scene) => scene.slides.map((slide) => slide.id)));
  const removed = new Set(
    project.scenes
      .flatMap((scene) => scene.slides.map((slide) => slide.id))
      .filter((id) => !kept.has(id)),
  );
  return {
    ...project,
    player: playerWithout(project.player, removed),
    // Nothing may name a slide left out (the Phase 7 review): tracking, results, branches.
    tracking:
      project.tracking.completion.kind === 'result' &&
      removed.has(project.tracking.completion.slide)
        ? { ...project.tracking, completion: { kind: 'trigger' } }
        : project.tracking,
    scenes: scenes.map((scene) => ({
      ...scene,
      slides: scene.slides.map((slide) => withoutRemoved(slide, removed)),
    })),
  };
}

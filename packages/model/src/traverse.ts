import type { Layer, Project, SceneObject, Slide } from './schema';

type Path = (string | number)[];

/** Visit every object in a list depth-first, including the children of groups. */
export function forEachObject(
  objects: readonly SceneObject[],
  visit: (object: SceneObject, path: Path) => void,
  basePath: Path = [],
): void {
  objects.forEach((object, index) => {
    const path = [...basePath, index];
    visit(object, path);
    if (object.type === 'group') forEachObject(object.children, visit, [...path, 'children']);
  });
}

/** Base layer first, then overlay layers bottom to top, each with its document path. */
export function slideLayers(slide: Slide): { layer: Layer; path: Path }[] {
  return [
    { layer: slide.baseLayer, path: ['baseLayer'] },
    ...slide.layers.map((layer, index) => ({ layer, path: ['layers', index] as Path })),
  ];
}

/**
 * Every slide anywhere: the scenes' (course order), then the question banks'
 * (P7.6). Validation, references and finding by id use this; playing uses
 * `allSlides`.
 */
export function everySlide(project: Project): { slide: Slide; path: Path }[] {
  return [
    ...allSlides(project),
    ...project.banks.flatMap((bank, bankIndex) =>
      bank.slides.map((slide, slideIndex) => ({
        slide,
        path: ['banks', bankIndex, 'slides', slideIndex] as Path,
      })),
    ),
  ];
}

/** Every slide in the scenes, in course order, with its document path (not the banks'). */
export function allSlides(project: Project): { slide: Slide; path: Path }[] {
  return project.scenes.flatMap((scene, sceneIndex) =>
    scene.slides.map((slide, slideIndex) => ({
      slide,
      path: ['scenes', sceneIndex, 'slides', slideIndex] as Path,
    })),
  );
}

import { cloneScene, cloneSlide, createScene, createSlide, findSlide } from '@vedraopus/model';
import { editor, getEditorState } from './project-store';

/** Overview commands. Each is one history step, so each undoes in one go. */
function history() {
  return getEditorState().open?.history;
}

export const overview = {
  addSlide(sceneId: string): void {
    const h = history();
    if (!h) return;
    const slide = createSlide();
    h.execute('slide.add', { sceneId, slide });
    editor.selectSlide(slide.id);
  },

  duplicateSlide(slideId: string): void {
    const open = getEditorState().open;
    const found = open && findSlide(open.history.project, slideId);
    if (!open || !found) return;
    const copy = cloneSlide(found.slide);
    open.history.execute('slide.add', {
      sceneId: found.scene.id,
      slide: copy,
      index: found.index + 1,
    });
    editor.selectSlide(copy.id);
  },

  deleteSlide(slideId: string): void {
    history()?.execute('slide.remove', { slideId });
  },

  renameSlide(slideId: string, title: string): void {
    const clean = title.trim();
    const open = getEditorState().open;
    const found = open && findSlide(open.history.project, slideId);
    if (!open || !found || clean === '' || clean === found.slide.title) return;
    open.history.execute('slide.rename', { slideId, title: clean });
  },

  /** Move a slide to `index` in a scene (default: the end). */
  moveSlide(slideId: string, sceneId: string, index?: number): void {
    const open = getEditorState().open;
    if (!open) return;
    const scene = open.history.project.scenes.find((s) => s.id === sceneId);
    const found = findSlide(open.history.project, slideId);
    if (!scene || !found) return;
    let target = index ?? scene.slides.length;
    // Moving later within the same scene: the slide's own old place is vacated first.
    if (found.scene.id === sceneId && found.index < target) target -= 1;
    if (found.scene.id === sceneId && found.index === target) return;
    open.history.execute('slide.move', { slideId, sceneId, index: target });
  },

  addScene(afterSceneId?: string): void {
    const open = getEditorState().open;
    if (!open) return;
    const scenes = open.history.project.scenes;
    const at = afterSceneId ? scenes.findIndex((s) => s.id === afterSceneId) + 1 : scenes.length;
    open.history.execute('scene.add', {
      scene: createScene(`Scene ${scenes.length + 1}`),
      index: at,
    });
  },

  duplicateScene(sceneId: string): void {
    const open = getEditorState().open;
    const scenes = open?.history.project.scenes ?? [];
    const index = scenes.findIndex((s) => s.id === sceneId);
    if (!open || index < 0) return;
    open.history.execute('scene.add', { scene: cloneScene(scenes[index]!), index: index + 1 });
  },

  deleteScene(sceneId: string): void {
    const open = getEditorState().open;
    if (!open || open.history.project.scenes.length < 2) return;
    open.history.execute('scene.remove', { sceneId });
  },

  renameScene(sceneId: string, title: string): void {
    const clean = title.trim();
    const open = getEditorState().open;
    const scene = open?.history.project.scenes.find((s) => s.id === sceneId);
    if (!open || !scene || clean === '' || clean === scene.title) return;
    open.history.execute('scene.rename', { sceneId, title: clean });
  },

  moveScene(sceneId: string, index: number): void {
    const open = getEditorState().open;
    const count = open?.history.project.scenes.length ?? 0;
    if (!open || index < 0 || index >= count) return;
    open.history.execute('scene.move', { sceneId, index });
  },
};

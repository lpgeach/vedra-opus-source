import type { Draft } from 'immer';
import {
  assetHashSchema,
  assetMetaSchema,
  publishSettingsSchema,
  themeSchema,
  playerSettingsSchema,
  trackingSchema,
} from '../schema';
import type { Project, SceneObject } from '../schema';
import { triggerReferencesAny } from '../find';
import { LANGUAGE_TAG } from '../labels';
import { applyTranslation } from '../translation';
import { everySlide } from '../traverse';
import { CommandError } from './types';
import type { CommandHandlers } from './types';
import { assertValid } from './util';

function scaleFrame(frame: SceneObject['frame'], sx: number, sy: number): SceneObject['frame'] {
  return {
    x: frame.x * sx,
    y: frame.y * sy,
    width: frame.width * sx,
    height: frame.height * sy,
    rotation: frame.rotation,
  };
}

function scaleObjectFrames(object: SceneObject, sx: number, sy: number): void {
  object.frame = scaleFrame(object.frame, sx, sy);
  if (object.type === 'group') {
    for (const child of object.children) scaleObjectFrames(child, sx, sy);
  }
}

function scaleAllContent(draft: Draft<Project>, sx: number, sy: number): void {
  const visitLayer = (layer: { objects: SceneObject[] }) => {
    for (const object of layer.objects) scaleObjectFrames(object, sx, sy);
  };
  for (const scene of draft.scenes) {
    for (const slide of scene.slides) {
      visitLayer(slide.baseLayer);
      for (const layer of slide.layers) visitLayer(layer);
    }
  }
  for (const master of draft.masters) {
    visitLayer(master.layer);
    for (const layout of master.layouts) visitLayer(layout.layer);
  }
}

export const projectCommands: Pick<
  CommandHandlers,
  | 'project.rename'
  | 'project.setStageSize'
  | 'project.updateTheme'
  | 'project.setTracking'
  | 'project.setPlayer'
  | 'project.translate'
  | 'project.setPublishSettings'
  | 'asset.add'
> = {
  'project.rename': (draft, { title }) => {
    draft.title = title;
  },

  'project.setStageSize': (draft, { width, height, mode = 'keep' }) => {
    for (const value of [width, height]) {
      if (!Number.isInteger(value) || value < 1) {
        throw new CommandError(
          `Stage size must be whole numbers of at least 1, got ${width}×${height}`,
        );
      }
    }
    if (mode !== 'keep' && mode !== 'scale') {
      throw new CommandError(`Unknown stage resize mode "${String(mode)}"`);
    }
    if (mode === 'scale' && (draft.stage.width === 0 || draft.stage.height === 0)) {
      throw new CommandError('Cannot scale content from a zero-sized stage');
    }
    if (mode === 'scale') {
      const sx = width / draft.stage.width;
      const sy = height / draft.stage.height;
      if (sx !== 1 || sy !== 1) scaleAllContent(draft, sx, sy);
    }
    draft.stage.width = width;
    draft.stage.height = height;
  },

  'project.updateTheme': (draft, { colors, fonts }) => {
    if (colors) {
      for (const [slot, value] of Object.entries(colors)) {
        if (!(slot in draft.theme.colors)) {
          throw new CommandError(`Unknown theme colour slot "${slot}"`);
        }
        (draft.theme.colors as Record<string, string>)[slot] = value as string;
      }
    }
    if (fonts) {
      if (fonts.heading !== undefined) draft.theme.fonts.heading = fonts.heading;
      if (fonts.body !== undefined) draft.theme.fonts.body = fonts.body;
    }
    assertValid(themeSchema, draft.theme, 'theme');
  },

  'project.setPlayer': (draft, { player }) => {
    const tabsBefore = new Set(draft.player.tabs.custom.map((tab) => tab.id));
    Object.assign(draft.player, player);
    assertValid(playerSettingsSchema, draft.player, 'player');
    // A custom tab removed takes the triggers that listen for it (P8.2), as an object does.
    for (const tab of draft.player.tabs.custom) tabsBefore.delete(tab.id);
    if (tabsBefore.size > 0) {
      for (const { slide } of everySlide(draft as Project)) {
        slide.triggers = slide.triggers.filter(
          (trigger) => !triggerReferencesAny(trigger, tabsBefore),
        );
      }
    }
  },

  'project.translate': (draft, { units, language }) => {
    if (!LANGUAGE_TAG.test(language)) {
      throw new CommandError(`${language} is not a language tag such as fr or pt-BR`);
    }
    applyTranslation(draft as Project, units, language);
    assertValid(playerSettingsSchema, draft.player, 'player');
  },

  'project.setTracking': (draft, { tracking }) => {
    Object.assign(draft.tracking, tracking);
    assertValid(trackingSchema, draft.tracking, 'tracking');
  },

  'project.setPublishSettings': (draft, { settings }) => {
    Object.assign(draft.publish, settings);
    assertValid(publishSettingsSchema, draft.publish, 'publish settings');
  },

  'asset.add': (draft, { hash, meta }) => {
    assertValid(assetHashSchema, hash, 'asset hash');
    assertValid(assetMetaSchema, meta, 'asset metadata');
    // Content-addressed: the same hash is the same file, so keep the first record.
    if (hash in draft.assets) return;
    draft.assets[hash] = meta;
  },
};

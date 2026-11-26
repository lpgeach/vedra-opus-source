import type { AssetHash, AssetMeta, Color, Project, SlideMaster, Theme } from '@vedraopus/model';

/** Everything a renderer needs to know about an object's surroundings. */
export interface RenderContext {
  theme: Theme;
  stage: { width: number; height: number };
  assets: Readonly<Record<AssetHash, AssetMeta>>;
  /** Masters and their layouts, so a slide can draw what it inherits. */
  masters: readonly SlideMaster[];
  /**
   * Where the browser can load an asset from. The editor, preview and a
   * published course each keep media somewhere different. Return undefined
   * for an asset that cannot be loaded; a placeholder is drawn instead.
   */
  assetUrl: (hash: AssetHash) => string | undefined;
  /**
   * The text to show for `%Name%` in rich text, or undefined for a name it does
   * not know (shown as written). Left out in the editor, where the author sees
   * the reference itself.
   */
  variables?: (name: string) => string | undefined;
  /**
   * Put in front of every element id the renderers create (gradients,
   * patterns). Give each rendering of a slide in the same page its own
   * prefix — the stage and a thumbnail, say — or their ids clash and a
   * hidden copy can blank the fills of a visible one.
   */
  idPrefix: string;
  /**
   * Draw markers for what has no look of its own, sound and zoom regions, so
   * the author can select them. Only the editor's stage wants these; a course
   * and a thumbnail draw nothing for them.
   */
  mediaMarkers: boolean;
  /**
   * Live in a course: video plays here, getting the browser's controls when
   * it asks for them, and text entries and dropdowns (P7.2) are real inputs.
   * Elsewhere (the editor, thumbnails) they are pictures of themselves.
   */
  liveMedia: boolean;
  /**
   * Where a web object's folder page is served from (P9.6): the published
   * course's `content/web/<id>/<path>`, or Preview's. Left out, a folder shows
   * its placeholder.
   */
  webUrl?: (objectId: string, path: string) => string | undefined;
  /** False where an address must not be loaded (Preview): it shows a placeholder to open it. */
  remoteWeb?: boolean;
}

export interface RenderContextOptions {
  assetUrl: RenderContext['assetUrl'];
  idPrefix?: string;
  variables?: RenderContext['variables'];
  /** Default false. */
  mediaMarkers?: boolean;
  /** Default false. */
  liveMedia?: boolean;
  webUrl?: RenderContext['webUrl'];
  remoteWeb?: boolean;
}

export function createRenderContext(
  project: Pick<Project, 'theme' | 'stage' | 'assets'> & Partial<Pick<Project, 'masters'>>,
  options: RenderContextOptions,
): RenderContext {
  return {
    theme: project.theme,
    stage: project.stage,
    assets: project.assets,
    masters: project.masters ?? [],
    // The asset must be one the project knows; otherwise it is treated as missing.
    assetUrl: (hash) => (Object.hasOwn(project.assets, hash) ? options.assetUrl(hash) : undefined),
    idPrefix: (options.idPrefix ?? '').replace(/[^A-Za-z0-9_-]/g, '-'),
    mediaMarkers: options.mediaMarkers ?? false,
    liveMedia: options.liveMedia ?? false,
    ...(options.variables ? { variables: options.variables } : {}),
    ...(options.webUrl ? { webUrl: options.webUrl } : {}),
    ...(options.remoteWeb === false ? { remoteWeb: false } : {}),
  };
}

/** A colour as CSS: literal colours pass through, theme references are looked up. */
export function resolveColor(color: Color, context: RenderContext): string {
  return typeof color === 'string' ? color : context.theme.colors[color.theme];
}

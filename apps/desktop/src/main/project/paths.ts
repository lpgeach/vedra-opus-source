import { join } from 'node:path';

/** Workspace ids are lower-case hex so they survive being a URL host. */
export const WORKSPACE_ID = /^[0-9a-f]{32}$/;
export const ASSET_HASH = /^[0-9a-f]{64}$/;
/** The only asset file names a workspace or container may hold. */
export const ASSET_FILE = /^[0-9a-f]{64}\.[a-z0-9]{1,8}$/;

export const PROJECT_FILE = 'project.json';
export const META_FILE = 'meta.json';
export const WORKSPACE_FILE = 'workspace.json';
export const ASSETS_DIR = 'assets';
export const FILE_EXTENSION = 'vedraopus';
/** Old project files still open, but new Save and Save As use `FILE_EXTENSION`. */
export const LEGACY_FILE_EXTENSION = 'eloquent';

export function assetPath(workspaceDir: string, hash: string, ext: string): string {
  const name = `${hash}.${ext}`;
  if (!ASSET_FILE.test(name)) throw new Error(`Refusing unsafe asset name "${name}"`);
  return join(workspaceDir, ASSETS_DIR, name);
}

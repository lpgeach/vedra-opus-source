/**
 * A workspace is the unpacked, on-disk working copy of one open project:
 *
 *   <root>/<id>/project.json     latest autosaved document
 *   <root>/<id>/assets/…         its media
 *   <root>/<id>/workspace.json   bookkeeping (below)
 *
 * It exists from open until clean close. One that is still there at the next
 * launch with unsaved changes is what crash recovery offers back.
 */
import { parseProject, serializeProject } from '@vedraopus/model';
import type { Project } from '@vedraopus/model';
import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { renameWithRetry } from '../fs-retry';
import { join } from 'node:path';
import { ASSETS_DIR, PROJECT_FILE, WORKSPACE_FILE, WORKSPACE_ID } from './paths';

export interface WorkspaceInfo {
  /** The `.vedraopus` file this was opened from or last saved to; null if never saved. */
  sourcePath: string | null;
  /** True once the working copy differs from `sourcePath`. */
  dirty: boolean;
  /** ISO time of the last write to the working copy. */
  modifiedAt: string;
}

export interface Workspace {
  id: string;
  dir: string;
}

export interface RecoverableWorkspace extends Workspace, WorkspaceInfo {
  title: string;
}

async function writeFileAtomic(filePath: string, data: string): Promise<void> {
  const temp = `${filePath}.tmp-${randomBytes(4).toString('hex')}`;
  await writeFile(temp, data);
  await renameWithRetry(temp, filePath);
}

export async function createWorkspace(root: string): Promise<Workspace> {
  const id = randomBytes(16).toString('hex');
  const dir = join(root, id);
  await mkdir(join(dir, ASSETS_DIR), { recursive: true });
  return { id, dir };
}

export function workspaceDir(root: string, id: string): string {
  if (!WORKSPACE_ID.test(id)) throw new Error(`Invalid workspace id "${id}"`);
  return join(root, id);
}

export async function writeWorkspaceInfo(workspace: Workspace, info: WorkspaceInfo): Promise<void> {
  await writeFileAtomic(join(workspace.dir, WORKSPACE_FILE), JSON.stringify(info));
}

export async function readWorkspaceInfo(dir: string): Promise<WorkspaceInfo | undefined> {
  try {
    const raw = JSON.parse(
      await readFile(join(dir, WORKSPACE_FILE), 'utf8'),
    ) as Partial<WorkspaceInfo>;
    if (typeof raw.dirty !== 'boolean' || typeof raw.modifiedAt !== 'string') return undefined;
    return {
      sourcePath: typeof raw.sourcePath === 'string' ? raw.sourcePath : null,
      dirty: raw.dirty,
      modifiedAt: raw.modifiedAt,
    };
  } catch {
    return undefined;
  }
}

/** Write the working copy of the document. Atomic, so a crash never leaves half a file. */
export async function writeWorkspaceProject(workspace: Workspace, project: Project): Promise<void> {
  await writeFileAtomic(join(workspace.dir, PROJECT_FILE), serializeProject(project));
}

export async function readWorkspaceProject(dir: string): Promise<Project> {
  return parseProject(JSON.parse(await readFile(join(dir, PROJECT_FILE), 'utf8')));
}

export async function removeWorkspace(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

/**
 * Called at launch, before anything is opened: every workspace still on disk
 * was left by a session that did not close cleanly. Those with unsaved changes
 * and a readable project are returned for recovery; the rest are deleted.
 */
export async function findRecoverableWorkspaces(root: string): Promise<RecoverableWorkspace[]> {
  let names: string[];
  try {
    names = await readdir(root);
  } catch {
    return [];
  }
  const recoverable: RecoverableWorkspace[] = [];
  for (const id of names) {
    const dir = join(root, id);
    const info = WORKSPACE_ID.test(id) ? await readWorkspaceInfo(dir) : undefined;
    if (info?.dirty) {
      try {
        const project = await readWorkspaceProject(dir);
        recoverable.push({ id, dir, ...info, title: project.title });
        continue;
      } catch {
        // Unreadable working copy: nothing to recover.
      }
    }
    await removeWorkspace(dir);
  }
  return recoverable.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

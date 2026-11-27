import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import type * as NodeFs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Closing with unsaved changes never hangs (docs/briefs/windows-close-hang.md): the working
 * copy is removed only once its writes are done, and a working copy Windows will not let go
 * of does not stop the close, nor come back as something to recover.
 */

const dialogAnswers: number[] = [];
vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.0', getPath: () => tmpdir(), addRecentDocument: () => undefined },
  dialog: {
    showMessageBox: () => Promise.resolve({ response: dialogAnswers.shift() ?? 2 }),
  },
}));

/** When set, removing a folder fails as Windows does while a file in it is open. */
let refuseRemoval = false;
vi.mock('node:fs', async (original) => {
  const fs = await original<typeof NodeFs>();
  return {
    ...fs,
    rmSync: (...args: Parameters<typeof fs.rmSync>) => {
      if (refuseRemoval) {
        throw Object.assign(new Error('EPERM: operation not permitted, rmdir'), {
          code: 'EPERM',
        });
      }
      fs.rmSync(...args);
    },
  };
});

const { ProjectSessions } = await import('./session');
const { findRecoverableWorkspaces } = await import('./workspace');

const DONT_SAVE = 1;

let root: string;
let workspaces: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vedraopus-close-'));
  workspaces = join(root, 'workspaces');
  refuseRemoval = false;
  dialogAnswers.length = 0;
});

afterEach(() => {
  refuseRemoval = false;
  vi.useRealTimers();
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

/** A new project with one unsaved change, and the folder of its working copy. */
async function changedProject() {
  const sessions = new ProjectSessions(() => undefined, workspaces, join(root, 'recent.json'));
  const opened = await sessions.newProject();
  if (opened.status !== 'opened') throw new Error('The project did not open');
  const [id] = readdirSync(workspaces);
  const dir = join(workspaces, id!);
  return { sessions, project: opened.project, dir };
}

describe('closing a project with unsaved changes', () => {
  it('waits for an autosave write under way, then removes the working copy', async () => {
    const { sessions, project, dir } = await changedProject();
    const failures = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    sessions.autosave(JSON.stringify({ ...project, title: 'Changed' }));
    // The autosave delay passes: the write to the working copy starts…
    vi.advanceTimersByTime(1000);
    vi.useRealTimers();
    // …and the author closes, answering Don't Save, while it is still writing.
    dialogAnswers.push(DONT_SAVE);
    await expect(sessions.confirmLeavingCurrent()).resolves.toBe(true);
    // Give a write that was not waited for the time to finish, or fail, before looking.
    await new Promise((done) => setTimeout(done, 1000));

    expect(existsSync(dir)).toBe(false);
    expect(failures).not.toHaveBeenCalled();
    expect(sessions.isDirty).toBe(false);
  });

  it('still closes when the working copy cannot be removed, and it is not offered back', async () => {
    const { sessions, project, dir } = await changedProject();
    sessions.autosave(JSON.stringify({ ...project, title: 'Changed' }));
    // Let the autosave reach the disk, so the working copy says it has unsaved changes.
    await new Promise((done) => setTimeout(done, 1000));
    expect(await findRecoverableWorkspaces(workspaces)).toHaveLength(1);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    refuseRemoval = true;
    dialogAnswers.push(DONT_SAVE);
    await expect(sessions.confirmLeavingCurrent()).resolves.toBe(true);
    expect(sessions.isDirty).toBe(false);
    expect(existsSync(dir)).toBe(true);

    // The next launch: the author chose not to keep it, so it is deleted, not offered.
    refuseRemoval = false;
    expect(await findRecoverableWorkspaces(workspaces)).toEqual([]);
    expect(existsSync(dir)).toBe(false);
  });
});

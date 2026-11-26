import { randomBytes } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, open, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { renameWithRetry } from './fs-retry';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { publishCourse, PublishCancelled } from '@vedraopus/publish';
import type { GraphicLibrary, PlayerLibraryNotice } from '@vedraopus/publish';
import type { Project, PublishSettings } from '@vedraopus/model';
import { ZipFile } from 'yazl';
import { assetPath } from './project/paths';

/** A folder name for a course: lower-case letters, digits and dashes. */
export function courseFolderName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'course';
}

/**
 * Where the built player lives: next to the app's compiled code when packaged
 * (and after `npm run build`), or in the player package when running from the
 * repository in development.
 */
export function findPlayerDir(candidates: readonly string[]): string {
  const found = candidates.find((dir) => existsSync(join(dir, 'player.js')));
  if (!found) {
    throw new Error('The course player has not been built. Run "npm run build" and try again.');
  }
  return found;
}

/**
 * The npm packages built into the player, from the list its build writes beside
 * it (scripts/third-party-notices.mjs). A player built without the list has none to give.
 */
export async function playerLibraries(playerDir: string): Promise<PlayerLibraryNotice[]> {
  const file = join(playerDir, 'third-party-notices.json');
  if (!existsSync(file)) return [];
  const list = JSON.parse(await readFile(file, 'utf8')) as { packages?: PlayerLibraryNotice[] };
  return (list.packages ?? []).map(({ name, version, licence, text }) => ({
    name,
    version,
    licence,
    text,
  }));
}

export interface PublishProjectOptions {
  project: Project;
  workspaceDir: string;
  /** The folder the author chose; the course goes in a folder or zip of its own inside it. */
  parentFolder: string;
  settings: PublishSettings;
  playerDir: string;
  /** The library's licence notices (P9.8), for a course that uses its sets. */
  notices?: Partial<Record<GraphicLibrary, string>>;
  signal?: { readonly aborted: boolean };
  onProgress?: (done: number, total: number) => void;
}

export type PublishProjectResult =
  | { status: 'done'; kind: 'folder' | 'zip'; path: string; files: number; warnings: string[] }
  | { status: 'cancelled' };

/** Files worth compressing; pictures, sound and video already are. */
const TEXT = new Set(['.html', '.js', '.css', '.json', '.xml', '.xsd', '.dtd', '.svg', '.txt']);

/** True for a file that starts like a zip (or is empty), so replacing it loses nothing of the author's. */
async function isZipOrEmpty(file: string): Promise<boolean> {
  const handle = await open(file, 'r');
  try {
    const head = Buffer.alloc(4);
    const { bytesRead } = await handle.read(head, 0, 4, 0);
    if (bytesRead === 0) return true;
    return head.readUInt32LE(0) === 0x04034b50 || head.readUInt32LE(0) === 0x06054b50;
  } finally {
    await handle.close();
  }
}

/** Write `files` from `folder` into a zip at `target`, names relative and with `/`. */
async function writeZip(folder: string, files: readonly string[], target: string): Promise<void> {
  const zip = new ZipFile();
  const done = pipeline(zip.outputStream, createWriteStream(target));
  for (const file of files) {
    zip.addFile(join(folder, ...file.split('/')), file, {
      compress: TEXT.has(extname(file).toLowerCase()),
    });
  }
  zip.end();
  await done;
}

/**
 * Publish for the target in `settings` into `<parentFolder>/<course name>`, or
 * `<course name>.zip` there. The course is built in a hidden staging folder
 * and moved (or zipped) into place only when complete, so a failed or
 * cancelled publish leaves nothing behind and an earlier publish of the same
 * course is replaced whole. A folder that is not an earlier publish, or a file
 * that is not a zip, is never touched.
 */
export async function publishProject(
  options: PublishProjectOptions,
): Promise<PublishProjectResult> {
  const { project, workspaceDir, parentFolder, settings, playerDir } = options;
  const name = courseFolderName(settings.title.trim() || project.title);
  const target = join(parentFolder, settings.zip ? `${name}.zip` : name);
  const stagingId = randomBytes(6).toString('hex');
  const staging = join(parentFolder, `.vedraopus-publish-${stagingId}`);
  const stagingZip = `${staging}.zip`;

  if (existsSync(target)) {
    if (settings.zip) {
      const info = await stat(target);
      if (!info.isFile() || !(await isZipOrEmpty(target))) {
        throw new Error(`"${target}" already exists and is not a zip file. Choose another folder.`);
      }
    } else {
      const entries = await readdir(target);
      if (entries.length > 0 && !existsSync(join(target, 'content', 'data.js'))) {
        throw new Error(
          `"${target}" already exists and is not a published course. Choose another folder.`,
        );
      }
    }
  }

  await mkdir(staging, { recursive: true });
  try {
    const [js, css] = await Promise.all([
      readFile(join(playerDir, 'player.js'), 'utf8'),
      readFile(join(playerDir, 'player.css'), 'utf8'),
    ]);
    const report = await publishCourse(project, settings, {
      // With the npm packages built into the player, whose notices every course carries (R2).
      player: { js, css, libraries: await playerLibraries(playerDir) },
      readAsset: (hash, meta) => readFile(assetPath(workspaceDir, hash, meta.ext)),
      write: async (path, data) => {
        const file = resolve(staging, path);
        if (!file.startsWith(resolve(staging) + sep))
          throw new Error(`Unsafe output path "${path}"`);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, data);
      },
      ...(options.notices ? { notices: options.notices } : {}),
      ...(options.onProgress ? { onProgress: options.onProgress } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
    if (options.signal?.aborted) throw new PublishCancelled();
    if (settings.zip) {
      await writeZip(staging, report.files, stagingZip);
      if (options.signal?.aborted) throw new PublishCancelled();
      await rm(target, { force: true });
      await renameWithRetry(stagingZip, target);
      await rm(staging, { recursive: true, force: true });
    } else {
      await rm(target, { recursive: true, force: true });
      await renameWithRetry(staging, target);
    }
    return {
      status: 'done',
      kind: settings.zip ? 'zip' : 'folder',
      path: target,
      files: report.files.length,
      warnings: report.warnings,
    };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    await rm(stagingZip, { force: true });
    if (error instanceof PublishCancelled) return { status: 'cancelled' };
    throw error;
  }
}

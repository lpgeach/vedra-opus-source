/**
 * Reading and writing `.vedraopus` files: a zip holding project.json, meta.json
 * and assets/<sha256>.<ext> (docs/PLAN.md §3.4).
 */
import { parseProject, serializeProject } from '@vedraopus/model';
import type { Project } from '@vedraopus/model';
import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, open, readFile, rm, stat } from 'node:fs/promises';
import { renameWithRetry } from '../fs-retry';
import { basename, dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import type { Entry, ZipFile as ZipReader } from 'yauzl';
import { ZipFile as ZipWriter } from 'yazl';
import { ASSET_FILE, assetPath, ASSETS_DIR, META_FILE, PROJECT_FILE } from './paths';

const MAX_PROJECT_JSON_BYTES = 256 * 1024 * 1024;
const MAX_ASSET_BYTES = 2 * 1024 * 1024 * 1024;

export interface ContainerMeta {
  formatVersion: number;
  appVersion: string;
  createdAt: string;
  modifiedAt: string;
}

/** The file could not be read as an Vedra Opus project. `message` is safe to show the author. */
export class ContainerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContainerError';
  }
}

function openZip(filePath: string): Promise<ZipReader> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: false }, (error, zip) => {
      if (error)
        reject(new ContainerError('This file is not an Vedra Opus project or is damaged.'));
      else resolve(zip);
    });
  });
}

function extractEntry(zip: ZipReader, entry: Entry, target: string): Promise<void> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error) return reject(error);
      pipeline(stream, createWriteStream(target)).then(resolve, reject);
    });
  });
}

/**
 * Where an entry may be written, or null to skip it. Only names we know are
 * extracted, to fixed locations built from validated parts — an entry can
 * never choose its own path, which rules out zip-slip by construction.
 */
function destinationFor(entry: Entry, workspaceDir: string): string | null {
  const name = entry.fileName;
  if (name === PROJECT_FILE || name === META_FILE) {
    if (entry.uncompressedSize > MAX_PROJECT_JSON_BYTES) {
      throw new ContainerError('The project data in this file is too large to open.');
    }
    return join(workspaceDir, name);
  }
  const assetName = name.startsWith(`${ASSETS_DIR}/`) ? name.slice(ASSETS_DIR.length + 1) : null;
  if (assetName !== null && ASSET_FILE.test(assetName)) {
    if (entry.uncompressedSize > MAX_ASSET_BYTES) {
      throw new ContainerError(`A media file in this project is too large to open.`);
    }
    return join(workspaceDir, ASSETS_DIR, assetName);
  }
  // Folders, caches such as thumbs/, and anything unrecognised.
  return null;
}

/** Unpack a `.vedraopus` file into an empty workspace directory and return its project. */
export async function unpackContainer(filePath: string, workspaceDir: string): Promise<Project> {
  await mkdir(join(workspaceDir, ASSETS_DIR), { recursive: true });
  const zip = await openZip(filePath);
  let sawProject = false;
  try {
    await new Promise<void>((resolve, reject) => {
      zip.on('error', reject);
      zip.on('end', resolve);
      zip.on('entry', (entry: Entry) => {
        Promise.resolve()
          .then(() => destinationFor(entry, workspaceDir))
          .then((target) => {
            if (target === null) return;
            if (entry.fileName === PROJECT_FILE) sawProject = true;
            return extractEntry(zip, entry, target);
          })
          .then(() => zip.readEntry(), reject);
      });
      zip.readEntry();
    });
  } catch (error) {
    if (error instanceof ContainerError) throw error;
    throw new ContainerError('This file is damaged and could not be read.');
  } finally {
    zip.close();
  }
  if (!sawProject) throw new ContainerError('This file does not contain an Vedra Opus project.');

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(join(workspaceDir, PROJECT_FILE), 'utf8'));
  } catch {
    throw new ContainerError('The project data in this file is damaged.');
  }
  // Throws ProjectValidationError with the details if the document is not valid.
  return parseProject(raw);
}

/**
 * A `.vedraopus` file's project, read without unpacking its media (P11.2: the
 * template list). Throws ContainerError or ProjectValidationError, as opening does.
 */
export async function readContainerProject(filePath: string): Promise<Project> {
  const zip = await openZip(filePath);
  let text: string | null;
  try {
    text = await new Promise<string | null>((resolve, reject) => {
      zip.on('error', reject);
      zip.on('end', () => resolve(null));
      zip.on('entry', (entry: Entry) => {
        if (entry.fileName !== PROJECT_FILE) {
          zip.readEntry();
          return;
        }
        if (entry.uncompressedSize > MAX_PROJECT_JSON_BYTES) {
          reject(new ContainerError('The project data in this file is too large to open.'));
          return;
        }
        zip.openReadStream(entry, (error, stream) => {
          if (error) return reject(error);
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
          stream.on('error', reject);
        });
      });
      zip.readEntry();
    });
  } catch (error) {
    if (error instanceof ContainerError) throw error;
    throw new ContainerError('This file is damaged and could not be read.');
  } finally {
    zip.close();
  }
  if (text === null) throw new ContainerError('This file does not contain an Vedra Opus project.');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ContainerError('The project data in this file is damaged.');
  }
  return parseProject(raw);
}

/**
 * Copy the media files named by `hashes` out of a `.vedraopus` file into a
 * workspace (P11.2: importing slides). Files already there are left as they
 * are; names are checked as when opening, so an entry cannot choose its path.
 */
export async function extractAssets(
  filePath: string,
  workspaceDir: string,
  hashes: ReadonlySet<string>,
): Promise<string[]> {
  await mkdir(join(workspaceDir, ASSETS_DIR), { recursive: true });
  const zip = await openZip(filePath);
  const copied: string[] = [];
  try {
    await new Promise<void>((resolve, reject) => {
      zip.on('error', reject);
      zip.on('end', resolve);
      zip.on('entry', (entry: Entry) => {
        const name = entry.fileName.startsWith(`${ASSETS_DIR}/`)
          ? entry.fileName.slice(ASSETS_DIR.length + 1)
          : '';
        const hash = name.split('.')[0] ?? '';
        if (!ASSET_FILE.test(name) || !hashes.has(hash)) {
          zip.readEntry();
          return;
        }
        if (entry.uncompressedSize > MAX_ASSET_BYTES) {
          reject(new ContainerError('A media file in that project is too large to copy.'));
          return;
        }
        const target = join(workspaceDir, ASSETS_DIR, name);
        stat(target).then(
          () => zip.readEntry(),
          () =>
            extractEntry(zip, entry, target).then(() => {
              copied.push(hash);
              zip.readEntry();
            }, reject),
        );
      });
      zip.readEntry();
    });
  } catch (error) {
    if (error instanceof ContainerError) throw error;
    throw new ContainerError('That project is damaged and its media could not be copied.');
  } finally {
    zip.close();
  }
  return copied;
}

/** Read a container's meta.json from an unpacked workspace, if it has a usable one. */
export async function readMeta(workspaceDir: string): Promise<Partial<ContainerMeta>> {
  try {
    const meta: unknown = JSON.parse(await readFile(join(workspaceDir, META_FILE), 'utf8'));
    return typeof meta === 'object' && meta !== null ? (meta as Partial<ContainerMeta>) : {};
  } catch {
    return {};
  }
}

/**
 * Write a `.vedraopus` file from a project and the workspace holding its
 * assets. The file appears at `targetPath` complete or not at all: it is
 * built beside the target and renamed over it, so a failure part-way leaves
 * any existing file untouched. Only assets the project lists are included.
 */
export async function packContainer(
  project: Project,
  workspaceDir: string,
  targetPath: string,
  meta: ContainerMeta,
): Promise<void> {
  const tempPath = join(
    dirname(targetPath),
    `.${basename(targetPath)}.tmp-${randomBytes(6).toString('hex')}`,
  );
  try {
    const zip = new ZipWriter();
    const written = pipeline(zip.outputStream, createWriteStream(tempPath));
    // If an asset file is missing, yazl reports it on the zip itself.
    const failed = new Promise<never>((_, reject) => zip.on('error', reject));

    zip.addBuffer(Buffer.from(serializeProject(project)), PROJECT_FILE);
    zip.addBuffer(Buffer.from(JSON.stringify(meta, null, 2)), META_FILE);
    for (const [hash, asset] of Object.entries(project.assets)) {
      zip.addFile(assetPath(workspaceDir, hash, asset.ext), `${ASSETS_DIR}/${hash}.${asset.ext}`, {
        // Media is already compressed; storing it keeps saves fast.
        compress: false,
      });
    }
    zip.end();
    await Promise.race([written, failed]);

    const handle = await open(tempPath, 'r+');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    await renameWithRetry(tempPath, targetPath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

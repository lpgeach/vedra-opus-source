import type { AssetMeta } from '@vedraopus/model';
import { WEB_PATH } from '@vedraopus/model';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, readdir } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, sep } from 'node:path';
import { mimeTypeForExtension } from './assets';
import { assetPath } from './paths';

/**
 * A folder of web pages copied into the project for a web object
 * (docs/briefs/P9.6-web-objects.md): every file, by its path in the folder,
 * stored as an asset of kind `file`. They only ever run inside a sandboxed
 * frame, so HTML and script are kept as they are.
 */

/** The most a web folder may hold. */
export const WEB_FOLDER_LIMITS = { files: 2000, bytes: 200 * 1024 * 1024 } as const;

/** The folder cannot be used. `message` is safe to show the author. */
export class WebFolderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebFolderError';
  }
}

export interface ImportedWebFolder {
  files: { path: string; hash: string; meta: AssetMeta }[];
  /** The page it starts at. */
  entry: string;
}

const TEXT: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  js: 'text/javascript',
  mjs: 'text/javascript',
  css: 'text/css',
  json: 'application/json',
  txt: 'text/plain',
};

function sha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

/** Every regular file under `root`, by its path in it (`/` between parts). Links are not followed. */
async function walk(root: string): Promise<{ path: string; full: string; size: number }[]> {
  const found: { path: string; full: string; size: number }[] = [];
  const visit = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await visit(full);
      } else if (entry.isFile()) {
        const path = relative(root, full).split(sep).join('/');
        found.push({ path, full, size: (await lstat(full)).size });
        if (found.length > WEB_FOLDER_LIMITS.files) {
          throw new WebFolderError(
            `The folder has more than ${WEB_FOLDER_LIMITS.files} files, too many for a web object.`,
          );
        }
      }
    }
  };
  await visit(root);
  return found;
}

/**
 * Copy the folder at `folder` into the project's workspace. It must hold an
 * `index.html` at its top, or another `.html` page there to start at.
 */
export async function importWebFolder(
  workspaceDir: string,
  folder: string,
): Promise<ImportedWebFolder> {
  const listed = await walk(folder);
  if (listed.length === 0) throw new WebFolderError('The folder is empty.');
  const bytes = listed.reduce((total, file) => total + file.size, 0);
  if (bytes > WEB_FOLDER_LIMITS.bytes) {
    throw new WebFolderError('The folder is bigger than 200 MB, too big for a web object.');
  }
  for (const file of listed) {
    if (!WEB_PATH.test(file.path)) {
      throw new WebFolderError(`"${file.path}" is not a name a web page can use.`);
    }
  }
  const pages = listed
    .map((file) => file.path)
    .filter((path) => !path.includes('/') && /\.html?$/i.test(path))
    .sort();
  const entry = pages.find((path) => path.toLowerCase() === 'index.html') ?? pages[0];
  if (!entry) {
    throw new WebFolderError('The folder has no index.html (or other .html page) at its top.');
  }
  await mkdir(dirname(assetPath(workspaceDir, '0'.repeat(64), 'bin')), { recursive: true });
  const files: ImportedWebFolder['files'] = [];
  for (const file of listed) {
    const hash = await sha256(file.full);
    const found = extname(file.path).slice(1).toLowerCase();
    const ext = /^[a-z0-9]{1,8}$/.test(found) ? found : 'bin';
    try {
      await copyFile(file.full, assetPath(workspaceDir, hash, ext), 1 /* COPYFILE_EXCL */);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    files.push({
      path: file.path,
      hash,
      meta: {
        kind: 'file',
        fileName: basename(file.path),
        ext,
        mimeType: TEXT[ext] ?? mimeTypeForExtension(ext) ?? 'application/octet-stream',
        byteLength: file.size,
      },
    });
  }
  return { files, entry };
}

import { nativeImage, protocol } from 'electron';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { mimeTypeForExtension } from './assets';
import { parseRange } from './range';
import { ASSET_HASH, ASSETS_DIR, WORKSPACE_ID } from './paths';

export const ASSET_SCHEME = 'vedraopus-asset';

/** Must run before the app is ready. */
export const PREVIEW_SCHEME = 'vedraopus-preview';

/** Where a workspace keeps scaled copies of large pictures; never saved in the project file. */
const PREVIEWS_DIR = 'previews';

/** The largest scaled copy asked for: a 4K stage drawn twice over. */
const MAX_FIT = 8192;

/**
 * Must run before the app is ready, and only once: Electron accepts a single
 * call, so every custom scheme the app uses is declared here.
 */
export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ASSET_SCHEME,
      // corsEnabled: the editor fetches sounds to measure them and draw their waveforms (P6.1).
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true,
      },
    },
    // stream: the preview's sound and video play from it (Luke, testing alpha 1: they did not).
    { scheme: PREVIEW_SCHEME, privileges: { standard: true, secure: true, stream: true } },
  ]);
}

const notFound = () => new Response('Not found', { status: 404 });

const PICTURE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);

/**
 * A picture scaled so its longer side is `fit` pixels, made once and kept in
 * the workspace (P11.5 part B): the editor draws a huge photograph from it.
 * Null when the picture is no larger than that, or cannot be read: the
 * original is then served.
 */
async function scaledPicture(
  workspaceDir: string,
  hash: string,
  file: string,
  ext: string,
  fit: number,
): Promise<{ path: string; ext: string } | null> {
  const outExt = ext === 'jpg' || ext === 'jpeg' ? 'jpg' : 'png';
  const target = join(workspaceDir, PREVIEWS_DIR, `${hash}-${fit}.${outExt}`);
  try {
    await stat(target);
    return { path: target, ext: outExt };
  } catch {
    // Not made yet.
  }
  const image = nativeImage.createFromPath(file);
  if (image.isEmpty()) return null;
  const { width, height } = image.getSize();
  if (Math.max(width, height) <= fit) return null;
  const scaled =
    width >= height
      ? image.resize({ width: fit, quality: 'good' })
      : image.resize({ height: fit, quality: 'good' });
  await mkdir(join(workspaceDir, PREVIEWS_DIR), { recursive: true });
  await writeFile(target, outExt === 'jpg' ? scaled.toJPEG(90) : scaled.toPNG());
  return { path: target, ext: outExt };
}

/**
 * Serve `vedraopus-asset://<workspaceId>/<hash>` from that workspace's asset
 * folder. The path on disk is assembled only from the two validated parts and
 * a directory listing; nothing else in the URL can influence it.
 *
 * Large media (P11.5 part B): a `Range` request gets just those bytes, so a
 * long video seeks without being read whole; `?fit=<pixels>` on a picture
 * larger than that gets a scaled copy.
 */
export function handleAssetRequests(workspacesRoot: string): void {
  // Each asset's file name, found once: listing the folder for every request is slow with many.
  const fileNames = new Map<string, string>();
  protocol.handle(ASSET_SCHEME, async (request) => {
    const url = new URL(request.url);
    const workspaceId = url.hostname;
    const hash = url.pathname.slice(1);
    if (!WORKSPACE_ID.test(workspaceId) || !ASSET_HASH.test(hash)) return notFound();

    const workspaceDir = join(workspacesRoot, workspaceId);
    const dir = join(workspaceDir, ASSETS_DIR);
    const key = `${workspaceId}/${hash}`;
    let fileName = fileNames.get(key);
    let size: number;
    try {
      if (!fileName) {
        fileName = (await readdir(dir)).find((name) => name.startsWith(`${hash}.`));
        if (!fileName) return notFound();
        fileNames.set(key, fileName);
      }
      size = (await stat(join(dir, fileName))).size;
    } catch {
      fileNames.delete(key);
      return notFound();
    }
    let path = join(dir, fileName);
    let ext = fileName.slice(hash.length + 1);

    const fit = Number(url.searchParams.get('fit'));
    if (Number.isInteger(fit) && fit >= 16 && fit <= MAX_FIT && PICTURE_EXTENSIONS.has(ext)) {
      const scaled = await scaledPicture(workspaceDir, hash, path, ext, fit).catch(() => null);
      if (scaled) {
        path = scaled.path;
        ext = scaled.ext;
        size = (await stat(path)).size;
      }
    }

    const headers: Record<string, string> = {
      'content-type': mimeTypeForExtension(ext) ?? 'application/octet-stream',
      // Content-addressed, so a URL's bytes never change.
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      // The editor's page (file:// when built) reads these with fetch. Only the
      // editor's own session serves this scheme, and it could already show them.
      'access-control-allow-origin': '*',
      'accept-ranges': 'bytes',
    };
    const range = parseRange(request.headers.get('range'), size);
    if (range === 'unsatisfiable') {
      return new Response(null, {
        status: 416,
        headers: { ...headers, 'content-range': `bytes */${size}` },
      });
    }
    const { start, end } = range ?? { start: 0, end: size - 1 };
    const body =
      size === 0
        ? null
        : (Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream<Uint8Array>);
    return new Response(body, {
      status: range ? 206 : 200,
      headers: {
        ...headers,
        'content-length': String(size === 0 ? 0 : end - start + 1),
        ...(range ? { 'content-range': `bytes ${start}-${end}/${size}` } : {}),
      },
    });
  });
}

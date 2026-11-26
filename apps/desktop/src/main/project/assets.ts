import type { AssetMeta } from '@vedraopus/model';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, mkdtemp, open, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import type { MediaTools } from '../media/ffmpeg';
import { extractPoster, normalise, PatentedFormatError, posterTime } from '../media/normalise';
import { SystemDecodeError } from '../media/system-decoder';
import { assetPath } from './paths';

/** File types an author may import, by extension. Anything else is refused. */
const ASSET_TYPES: Record<string, { kind: AssetMeta['kind']; mimeType: string }> = {
  png: { kind: 'image', mimeType: 'image/png' },
  jpg: { kind: 'image', mimeType: 'image/jpeg' },
  jpeg: { kind: 'image', mimeType: 'image/jpeg' },
  gif: { kind: 'image', mimeType: 'image/gif' },
  webp: { kind: 'image', mimeType: 'image/webp' },
  svg: { kind: 'image', mimeType: 'image/svg+xml' },
  mp3: { kind: 'audio', mimeType: 'audio/mpeg' },
  m4a: { kind: 'audio', mimeType: 'audio/mp4' },
  wav: { kind: 'audio', mimeType: 'audio/wav' },
  ogg: { kind: 'audio', mimeType: 'audio/ogg' },
  mp4: { kind: 'video', mimeType: 'video/mp4' },
  webm: { kind: 'video', mimeType: 'video/webm' },
  woff2: { kind: 'font', mimeType: 'font/woff2' },
  ttf: { kind: 'font', mimeType: 'font/ttf' },
  otf: { kind: 'font', mimeType: 'font/otf' },
};

export const IMPORTABLE_EXTENSIONS = Object.keys(ASSET_TYPES);

/**
 * Files a course can offer in its Resources tab (P8.2), beside pictures.
 * HTML, scripts and programs are refused: opened from the course, they
 * could run script in it or on the learner's machine.
 */
const DOCUMENT_TYPES: Record<string, { kind: AssetMeta['kind']; mimeType: string }> = {
  pdf: { kind: 'file', mimeType: 'application/pdf' },
  doc: { kind: 'file', mimeType: 'application/msword' },
  docx: {
    kind: 'file',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  xls: { kind: 'file', mimeType: 'application/vnd.ms-excel' },
  xlsx: {
    kind: 'file',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  ppt: { kind: 'file', mimeType: 'application/vnd.ms-powerpoint' },
  pptx: {
    kind: 'file',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  },
  odt: { kind: 'file', mimeType: 'application/vnd.oasis.opendocument.text' },
  ods: { kind: 'file', mimeType: 'application/vnd.oasis.opendocument.spreadsheet' },
  odp: { kind: 'file', mimeType: 'application/vnd.oasis.opendocument.presentation' },
  rtf: { kind: 'file', mimeType: 'application/rtf' },
  txt: { kind: 'file', mimeType: 'text/plain' },
  csv: { kind: 'file', mimeType: 'text/csv' },
  zip: { kind: 'file', mimeType: 'application/zip' },
};

/**
 * What a resource file may be: a document, or a picture. Not SVG: opened as
 * a page from the Resources tab, its scripts would run, as HTML's would.
 */
const RESOURCE_TYPES: Record<string, { kind: AssetMeta['kind']; mimeType: string }> = {
  ...DOCUMENT_TYPES,
  ...Object.fromEntries(
    Object.entries(ASSET_TYPES).filter(([ext, type]) => type.kind === 'image' && ext !== 'svg'),
  ),
};

export const RESOURCE_EXTENSIONS = Object.keys(RESOURCE_TYPES);

export function mimeTypeForExtension(ext: string): string | undefined {
  return ASSET_TYPES[ext]?.mimeType ?? DOCUMENT_TYPES[ext]?.mimeType;
}

/** The file is not a type Vedra Opus can import. `message` is safe to show the author. */
export class UnsupportedAssetError extends Error {
  constructor(fileName: string) {
    super(`"${fileName}" is not a supported file type.`);
    this.name = 'UnsupportedAssetError';
  }
}

export interface ImportedAsset {
  hash: string;
  meta: AssetMeta;
  /** For a video that went through the media pipeline: a frame of it, stored as a picture. */
  poster?: ImportedAsset;
}

/** The media pipeline, when ffmpeg is available (docs/briefs/P6.3-media-pipeline.md). */
export interface MediaOptions {
  tools: MediaTools;
  /** How far a conversion is, from 0 to 1, by the name of the file being converted. */
  onProgress?: (fileName: string, fraction: number) => void;
  /** Read only royalty-free formats (the app sets it everywhere: docs/licences.md). */
  refusePatented?: boolean;
}

/** This system's name, as the author knows it. */
const systemName = () =>
  ({ win32: 'Windows', darwin: 'macOS' })[process.platform as string] ?? 'Linux';

/** ffmpeg could not make sense of the file. `message` is safe to show the author. */
export class MediaConversionError extends Error {
  constructor(fileName: string, reason: string, message?: string) {
    super(message ?? `"${fileName}" could not be converted (${reason}).`);
    this.name = 'MediaConversionError';
  }
}

/** Store a file under its SHA-256 in the workspace's assets; storing the same bytes again does nothing. */
async function storeFile(workspaceDir: string, file: string, ext: string) {
  const [hash, { size }] = await Promise.all([sha256(file), stat(file)]);
  const target = assetPath(workspaceDir, hash, ext);
  await mkdir(dirname(target), { recursive: true });
  try {
    // Fails if the file is already there, which is exactly the "already imported" case.
    await copyFile(file, target, 1 /* COPYFILE_EXCL */);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  return { hash, size };
}

/**
 * Run a sound or video through the pipeline and store what comes out, with
 * its length (and picture size), and for a video a poster frame as well.
 * `fileName` is the author's name for it; the extension follows the result.
 */
async function importMedia(
  workspaceDir: string,
  source: string,
  fileName: string,
  ext: string,
  mimeType: string,
  media: MediaOptions,
): Promise<ImportedAsset> {
  await mkdir(workspaceDir, { recursive: true });
  // In the workspace, not /tmp: a long video would not fit a small temporary folder.
  const work = await mkdtemp(join(workspaceDir, '.media-'));
  try {
    let result;
    try {
      result = await normalise(
        media.tools,
        source,
        ext,
        mimeType,
        work,
        (fraction) => media.onProgress?.(fileName, fraction),
        media.refusePatented ? { refusePatented: true } : {},
      );
    } catch (error) {
      if (error instanceof SystemDecodeError) {
        throw new MediaConversionError(
          fileName,
          error.message,
          `"${fileName}" uses ${error.format ?? 'a format'} that ${systemName()} could not read here. Convert it to WebM (VP9 or VP8), or for sound to MP3, WAV, Opus or FLAC, first.`,
        );
      }
      if (error instanceof PatentedFormatError) {
        throw new MediaConversionError(
          fileName,
          error.message,
          `"${fileName}" ${error.message}, which needs a patent licence, so Vedra Opus cannot import it on ${systemName()}. Convert it to WebM (VP9 or VP8), or for sound to MP3, WAV, Opus or FLAC, first.`,
        );
      }
      throw new MediaConversionError(
        fileName,
        error instanceof Error ? error.message : String(error),
      );
    }
    const stored = await storeFile(workspaceDir, result.path, result.ext);
    const base = fileName.replace(/\.[^.]+$/, '') || 'media';
    const meta: AssetMeta = {
      kind: result.kind,
      fileName: result.changed ? `${base}.${result.ext}` : fileName,
      ext: result.ext,
      mimeType: result.mimeType,
      byteLength: stored.size,
      ...(result.info.duration ? { duration: result.info.duration } : {}),
      ...(result.kind === 'video' && result.info.video
        ? { width: result.info.video.width, height: result.info.video.height }
        : {}),
    };
    const asset: ImportedAsset = { hash: stored.hash, meta };
    if (result.kind === 'video') {
      const png = join(work, 'poster.png');
      try {
        await extractPoster(media.tools, result.path, posterTime(result.info.duration), png);
        const poster = await storeFile(workspaceDir, png, 'png');
        const size = readImageSize(await readHeader(png, 64));
        asset.poster = {
          hash: poster.hash,
          meta: {
            kind: 'image',
            fileName: `${base} poster.png`,
            ext: 'png',
            mimeType: 'image/png',
            byteLength: poster.size,
            ...(size ?? {}),
          },
        };
      } catch {
        // No poster: the video shows its first frame instead.
      }
    }
    return asset;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

function sha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Pixel size from the file header, for the formats where that is a few fixed
 * bytes. Returns undefined when the format is not handled or the header is
 * not what it should be; dimensions are optional metadata.
 */
export function readImageSize(header: Buffer): { width: number; height: number } | undefined {
  // PNG: signature, then the IHDR chunk with big-endian width and height.
  if (
    header.length >= 24 &&
    header.readUInt32BE(0) === 0x89504e47 &&
    header.toString('latin1', 12, 16) === 'IHDR'
  ) {
    return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
  }
  // GIF: "GIF87a"/"GIF89a", then little-endian logical screen size.
  if (header.length >= 10 && header.toString('latin1', 0, 3) === 'GIF') {
    return { width: header.readUInt16LE(6), height: header.readUInt16LE(8) };
  }
  // JPEG: walk the segments to the first start-of-frame marker.
  if (header.length >= 4 && header[0] === 0xff && header[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < header.length && header[offset] === 0xff) {
      const marker = header[offset + 1]!;
      const isStartOfFrame =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isStartOfFrame) {
        return { width: header.readUInt16BE(offset + 7), height: header.readUInt16BE(offset + 5) };
      }
      offset += 2 + header.readUInt16BE(offset + 2);
    }
  }
  return undefined;
}

async function readHeader(filePath: string, bytes: number): Promise<Buffer> {
  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** The longest narration kept: about three hours of WebM/Opus. */
export const MAX_RECORDING_BYTES = 256 * 1024 * 1024;
/** The largest screen recording kept (P9.11): ten minutes of screen at a generous rate. */
export const MAX_SCREEN_RECORDING_BYTES = 500 * 1024 * 1024;

/**
 * Store a narration recorded in the editor (WebM with Opus sound, as
 * Chromium records) in the workspace's asset store, named by its SHA-256 like
 * any import. `takenAt` names it for the author ("Recording 14:05:09").
 */
export async function storeRecording(
  workspaceDir: string,
  bytes: Uint8Array,
  takenAt: Date,
  media?: MediaOptions,
  /** A narration, or a screen recording (P9.11): WebM with VP8 or VP9, and maybe Opus. */
  kind: 'audio' | 'video' = 'audio',
): Promise<ImportedAsset> {
  if (bytes.byteLength === 0) throw new Error('The recording is empty.');
  const limit = kind === 'video' ? MAX_SCREEN_RECORDING_BYTES : MAX_RECORDING_BYTES;
  if (bytes.byteLength > limit) throw new Error('The recording is too long to keep.');
  const time = takenAt.toTimeString().slice(0, 8);
  const name = kind === 'video' ? `Screen recording ${time}.webm` : `Recording ${time}.webm`;
  const mimeType = kind === 'video' ? 'video/webm' : 'audio/webm';
  if (media) {
    // Through the pipeline: an MP3 with a proper length, which every browser can seek in.
    await mkdir(workspaceDir, { recursive: true });
    const work = await mkdtemp(join(workspaceDir, '.recording-'));
    try {
      const take = join(work, 'take.webm');
      await writeFile(take, bytes);
      // A video comes back as WebM (VP9, Opus) with a poster frame.
      return await importMedia(workspaceDir, take, name, 'webm', mimeType, media);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }
  const hash = createHash('sha256').update(bytes).digest('hex');
  const target = assetPath(workspaceDir, hash, 'webm');
  await mkdir(dirname(target), { recursive: true });
  try {
    await writeFile(target, bytes, { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  return {
    hash,
    meta: {
      kind,
      fileName: name,
      ext: 'webm',
      mimeType,
      byteLength: bytes.byteLength,
    },
  };
}

/**
 * Copy a file into the workspace's asset store, named by the SHA-256 of its
 * contents, and describe it. Importing identical bytes again stores nothing new.
 */
export async function importAsset(
  workspaceDir: string,
  sourcePath: string,
  media?: MediaOptions,
  /** Media for the stage, or a file for the Resources tab (P8.2). */
  accept: 'media' | 'resource' = 'media',
): Promise<ImportedAsset> {
  const fileName = basename(sourcePath);
  const ext = extname(fileName).slice(1).toLowerCase();
  const type = (accept === 'resource' ? RESOURCE_TYPES : ASSET_TYPES)[ext];
  if (!type) throw new UnsupportedAssetError(fileName);
  if (media && (type.kind === 'audio' || type.kind === 'video')) {
    return importMedia(workspaceDir, sourcePath, fileName, ext, type.mimeType, media);
  }

  const [hash, { size }] = await Promise.all([sha256(sourcePath), stat(sourcePath)]);
  const target = assetPath(workspaceDir, hash, ext);
  await mkdir(dirname(target), { recursive: true });
  try {
    // Fails if the file is already there, which is exactly the "already imported" case.
    await copyFile(sourcePath, target, 1 /* COPYFILE_EXCL */);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }

  const meta: AssetMeta = {
    kind: type.kind,
    fileName,
    ext,
    mimeType: type.mimeType,
    byteLength: size,
  };
  if (type.kind === 'image') {
    // 64 KiB covers JPEGs that carry large metadata blocks before the frame header.
    const imageSize = readImageSize(await readHeader(sourcePath, 64 * 1024));
    if (imageSize) Object.assign(meta, imageSize);
  }
  return { hash, meta };
}

/**
 * Importing a `.pptx` file into a workspace (docs/briefs/P11.1-pptx-import.md):
 * its parts read from the zip, within limits, and its pictures stored as the
 * project's media.
 */
import {
  createAudioObject,
  createImageObject,
  createVideoObject,
  findObject,
} from '@vedraopus/model';
import type { AssetMeta } from '@vedraopus/model';
import { createHash } from 'node:crypto';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import { ZipFile } from 'yazl';
import type { Entry } from 'yauzl';
import { importAsset, readImageSize } from '../../project/assets';
import type { MediaOptions } from '../../project/assets';
import { PatentedFormatError } from '../../media/normalise';
import { assetPath } from '../../project/paths';
import { drawDecks, widthGroups } from '../libreoffice';
import { isBlankPng } from '../png';
import { convertPptx } from './convert';
import type { ConvertResult } from './convert';
import type { ImportStep } from '../progress';
import { drawingDeck } from './drawing';
import type { PendingDrawing } from './drawing';
import { PptxError } from './xml';

/** Limits on what a deck may hold, so a damaged or hostile file cannot fill the memory. */
const MAX_PART_BYTES = 200 * 1024 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;
const MAX_PARTS = 20_000;

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

/** Every part of the zip, by name. */
export function readZipParts(path: string): Promise<Map<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) {
        reject(new PptxError('This is not a PowerPoint presentation (.pptx), or it is damaged.'));
        return;
      }
      const parts = new Map<string, Uint8Array>();
      let total = 0;
      zip.on('entry', (entry: Entry) => {
        if (entry.fileName.endsWith('/')) {
          zip.readEntry();
          return;
        }
        total += entry.uncompressedSize;
        if (
          parts.size >= MAX_PARTS ||
          entry.uncompressedSize > MAX_PART_BYTES ||
          total > MAX_TOTAL_BYTES
        ) {
          zip.close();
          reject(new PptxError('This presentation is too large to import.'));
          return;
        }
        zip.openReadStream(entry, (err, stream) => {
          if (err || !stream) {
            reject(new PptxError('This presentation is damaged: a part of it cannot be read.'));
            return;
          }
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('end', () => {
            parts.set(entry.fileName, new Uint8Array(Buffer.concat(chunks)));
            zip.readEntry();
          });
          stream.on('error', () =>
            reject(new PptxError('This presentation is damaged: a part of it cannot be read.')),
          );
        });
      });
      zip.on('end', () => resolve(parts));
      zip.on('error', () => reject(new PptxError('This presentation is damaged.')));
      zip.readEntry();
    });
  });
}

/** A picture's bytes stored in the workspace's media, once for each different file. */
function pictureStore(workspaceDir: string, assets: Record<string, AssetMeta>) {
  return ({ name, ext, bytes }: { name: string; ext: string; bytes: Uint8Array }) => {
    const buffer = Buffer.from(bytes);
    const hash = createHash('sha256').update(buffer).digest('hex');
    if (!assets[hash]) {
      const target = assetPath(workspaceDir, hash, ext);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, buffer);
      assets[hash] = {
        kind: 'image',
        fileName: name,
        ext,
        mimeType: MIME[ext] ?? 'application/octet-stream',
        byteLength: buffer.length,
        ...(readImageSize(buffer.subarray(0, 64 * 1024)) ?? {}),
      };
    }
    return { hash };
  };
}

/** The deck at `path` as a project in `workspaceDir`, its pictures stored there. */
export async function importPowerPointFile(
  path: string,
  workspaceDir: string,
  /** The media pipeline (P6.3); without it, sound and video stay as reported placeholders. */
  media?: MediaOptions,
  /** LibreOffice's program (part D); without it, charts and the like stay as reported placeholders. */
  soffice?: string | null,
  /** Each stage as it starts, and each media file as it is brought in (B7). */
  onProgress?: (step: ImportStep) => void,
): Promise<ConvertResult> {
  onProgress?.({ stage: 'reading', done: 0, total: 0 });
  const parts = await readZipParts(path);
  const assets: Record<string, AssetMeta> = {};
  const storePicture = pictureStore(workspaceDir, assets);
  onProgress?.({ stage: 'slides', done: 0, total: 0 });
  const result = convertPptx(parts, { fileName: basename(path, extname(path)), storePicture });
  if (result.drawings.length > 0) onProgress?.({ stage: 'drawing', done: 0, total: 0 });
  await drawContent(result, parts, soffice ?? null, storePicture);
  result.project.assets = { ...result.project.assets, ...assets };
  await importMedia(result, parts, workspaceDir, media, onProgress);
  return result;
}

/**
 * Charts, SmartArt, embedded objects and pictures in other formats, each
 * drawn by LibreOffice from a deck of its own and put in its stand-in's place
 * (part D), at two to three times its size. What cannot be drawn stays a
 * placeholder, reported with why.
 */
async function drawContent(
  result: ConvertResult,
  parts: ReadonlyMap<string, Uint8Array>,
  soffice: string | null,
  storePicture: ReturnType<typeof pictureStore>,
): Promise<void> {
  if (result.drawings.length === 0) return;
  const fail = (pending: PendingDrawing, why: string) =>
    result.report.push({
      slide: pending.slide,
      outcome: 'placeholder',
      what: `${pending.what}; ${why}`,
    });
  if (!soffice) {
    for (const pending of result.drawings) {
      fail(pending, 'it could not be drawn as a picture, as LibreOffice is not installed');
    }
    return;
  }
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-pptx-drawing-'));
  try {
    const decks = join(work, 'decks');
    const out = join(work, 'out');
    mkdirSync(decks);
    mkdirSync(out);
    const files: (string | null)[] = [];
    for (const [index, pending] of result.drawings.entries()) {
      const file = join(decks, `drawing-${index + 1}.pptx`);
      try {
        await writeZip(file, drawingDeck(parts, result.presentationPart, pending));
        files.push(file);
      } catch (error) {
        files.push(null);
        fail(
          pending,
          `it could not be drawn: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    // One run for each group of drawings of about the same width (a run takes seconds to start).
    const drawn = new Set<number>();
    for (const group of widthGroups(result.drawings.map((pending) => pending.frame))) {
      const indexes = group.indexes.filter((index) => files[index]);
      if (indexes.length === 0) continue;
      try {
        await drawDecks(
          soffice,
          indexes.map((index) => files[index]!),
          out,
          join(work, 'profile'),
          group.pixelWidth,
        );
        for (const index of indexes) drawn.add(index);
      } catch (error) {
        for (const index of indexes) {
          fail(result.drawings[index]!, `it could not be drawn: ${(error as Error).message}`);
        }
      }
    }
    result.drawings.forEach((pending, index) => {
      if (!drawn.has(index)) return;
      const png = join(out, `drawing-${index + 1}.png`);
      const place = findObject(result.project, pending.objectId);
      if (!place) return;
      const bytes = existsSync(png) ? readFileSync(png) : null;
      // Content LibreOffice cannot read comes back as nothing on a clear background.
      if (!bytes || bytes.length === 0 || isBlankPng(bytes)) {
        fail(pending, 'LibreOffice could not draw it');
        return;
      }
      const standIn = place.object;
      const { hash } = storePicture({ name: `${standIn.name}.png`, ext: 'png', bytes });
      // The picture takes the stand-in's place, name, timing, animations and description.
      const picture = createImageObject(hash, standIn.frame, standIn.name);
      picture.id = standIn.id;
      picture.timing = standIn.timing;
      picture.animations = standIn.animations;
      picture.a11y = standIn.a11y;
      place.siblings[place.index] = picture;
      result.report.push({
        slide: pending.slide,
        outcome: 'approximated',
        what: `${pending.what}, drawn as a picture`,
      });
    });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** Parts as a zip file. */
async function writeZip(file: string, parts: ReadonlyMap<string, Uint8Array>): Promise<void> {
  const zip = new ZipFile();
  for (const [name, bytes] of parts) zip.addBuffer(Buffer.from(bytes), name);
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(file));
}

/**
 * Each sound and video through the media pipeline, into the stand-in's place
 * (part C). One that cannot be imported stays a placeholder, reported with why.
 */
async function importMedia(
  result: ConvertResult,
  parts: ReadonlyMap<string, Uint8Array>,
  workspaceDir: string,
  media: MediaOptions | undefined,
  onProgress?: (step: ImportStep) => void,
): Promise<void> {
  if (result.media.length === 0) return;
  const total = result.media.length;
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-pptx-media-'));
  try {
    for (const [done, pending] of result.media.entries()) {
      const place = findObject(result.project, pending.objectId);
      const bytes = parts.get(pending.partName);
      if (!place || !bytes) continue;
      const name = place.object.name;
      onProgress?.({ stage: 'media', done, total, file: name, fraction: 0 });
      const fail = (why: string) =>
        result.report.push({
          slide: pending.slide,
          outcome: 'placeholder',
          what: `“${name}” ${why}`,
        });
      if (!media) {
        fail('could not be imported: the media tools are not installed');
        continue;
      }
      const file = join(work, basename(pending.partName));
      writeFileSync(file, bytes);
      try {
        // The pipeline's own progress through this file, passed on to the cover too (B7).
        const tracked: MediaOptions = {
          ...media,
          onProgress: (converting, fraction) => {
            media.onProgress?.(converting, fraction);
            onProgress?.({ stage: 'media', done, total, file: name, fraction });
          },
        };
        const { hash, meta } = await importAsset(workspaceDir, file, tracked);
        const length = Math.max(0.1, meta.duration ?? 1);
        const made =
          meta.kind === 'video'
            ? createVideoObject(hash, length, place.object.frame, name)
            : createAudioObject(hash, length, place.object.frame, name);
        made.timing = { ...made.timing, start: place.object.timing.start };
        made.a11y = place.object.a11y;
        made.animations = place.object.animations;
        place.siblings[place.index] = made;
        result.project.assets[hash] = meta;
      } catch (error) {
        fail(
          error instanceof PatentedFormatError
            ? `could not be imported: it ${error.message}, which courses do not use (convert it to WebM or MP3)`
            : `could not be imported: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

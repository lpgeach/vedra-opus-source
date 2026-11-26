/**
 * Importing a `.story` file into a workspace (docs/briefs/B5-storyline-import.md):
 * its media found and stored (sound and video through the media pipeline), then
 * the course converted, and checked as any project is.
 */
import { parseCaptions, parseProject, serializeProject } from '@vedraopus/model';
import type { AssetMeta, ParsedCaptions, XmlElement } from '@vedraopus/model';
import {
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { IMPORTABLE_EXTENSIONS, importAsset, readImageSize } from '../../project/assets';
import { runFfmpeg } from '../../media/ffmpeg';
import type { MediaOptions } from '../../project/assets';
import type { ImportStep } from '../progress';
import { PatentedFormatError } from '../../media/normalise';
import { convertStoryline, RELATIVE_FILE } from './convert';
import type { ConvertResult, PlacedMedia } from './convert';
import { resolveMedia } from './media';
import { readStorylinePackage, readXml } from './package';
import type { StorylinePackage } from './package';

/** The extension a stored part is imported as: Storyline keeps MP4 video as `.mpeg`. */
const importExtension = (kind: string, part: string) => {
  const ext = part.slice(part.lastIndexOf('.') + 1).toLowerCase();
  if (kind === 'video' && (ext === 'mpeg' || ext === 'mpg')) return 'mp4';
  return ext === 'jpeg' ? 'jpg' : ext;
};

/**
 * The width over the height of each picture on the course's slides that shows media item `g`
 * whole (B15): a cropped one says nothing of its file's proportions.
 */
export function useAspects(pkg: Pick<StorylinePackage, 'xml'>, g: string): number[] {
  const aspects: number[] = [];
  const walk = (element: XmlElement) => {
    if (element.name === 'pic' && element.attrs['assetG'] === g) {
      const child = (name: string) =>
        element.children.find(
          (each): each is XmlElement => typeof each !== 'string' && each.name === name,
        );
      const loc = child('loc')?.attrs ?? {};
      const crop = child('sourceRect')?.attrs ?? {};
      const width = Number(loc['r']) - Number(loc['l']);
      const height = Number(loc['b']) - Number(loc['t']);
      const cropped = ['l', 't', 'r', 'b'].some((side) => Number(crop[side] ?? 0) !== 0);
      if (!cropped && width > 0 && height > 0) aspects.push(width / height);
    }
    for (const each of element.children) if (typeof each !== 'string') walk(each);
  };
  for (const [part, text] of pkg.xml) {
    if (!/^story\/(slides|slideLayouts|slideMasters)\/[^/]+\.xml$/.test(part)) continue;
    if (!text.includes(g)) continue;
    const root = readXml(pkg, part);
    if (root) walk(root);
  }
  return aspects;
}

/**
 * Of the files a picture could be, the one whose proportions match every picture that shows it
 * whole (within 2%), and of several, the one of the type the course recorded (B15); null when
 * that does not settle it.
 */
export function byProportions(
  candidates: { part: string; size: { width: number; height: number } | null | undefined }[],
  aspects: readonly number[],
  type: string,
): string | null {
  if (aspects.length === 0) return null;
  let fitting = candidates.filter(
    ({ size }) =>
      !!size &&
      size.height > 0 &&
      aspects.every((aspect) => Math.abs(size.width / size.height / aspect - 1) < 0.02),
  );
  if (fitting.length > 1) {
    const same = fitting.filter(
      ({ part }) => importExtension('picture', part) === type.toLowerCase(),
    );
    if (same.length > 0) fitting = same;
  }
  return fitting.length === 1 ? fitting[0]!.part : null;
}

/** Paths the course's triggers open beside it (B15): `jumpToFileUrl`'s `open`, not web addresses. */
export function linkedFiles(pkg: Pick<StorylinePackage, 'xml'>): string[] {
  const found = new Set<string>();
  for (const [part, text] of pkg.xml) {
    if (!/^story\/(slides|slideLayouts|slideMasters)\/[^/]+\.xml$/.test(part)) continue;
    for (const match of text.matchAll(/action="jumpToFileUrl"[\s\S]*?\bopen="([^"]*)"/g)) {
      const path = match[1]!
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
      if (path && !/^https?:\/\//i.test(path) && RELATIVE_FILE.test(path)) found.add(path);
    }
  }
  return [...found];
}

/**
 * A linked file beside the `.story` file at `storyPath` (B15): at its own path from there, or by
 * its name alone; never outside that folder.
 */
export function besideStory(storyPath: string, linked: string): string | null {
  const folder = resolve(dirname(storyPath));
  const relativePath = linked.replace(/\\/g, '/');
  for (const candidate of [join(folder, relativePath), join(folder, basename(relativePath))]) {
    const full = resolve(candidate);
    if (!full.startsWith(folder + sep)) continue;
    try {
      if (statSync(full).isFile()) return full;
    } catch {
      // Not there.
    }
  }
  return null;
}

/** The course at `path` as a project in `workspaceDir`, its media stored there. */
export async function importStorylineFile(
  path: string,
  workspaceDir: string,
  fileName: string,
  /** The media pipeline (P6.3); without it, sound and video are reported and left out. */
  media?: MediaOptions,
  /** Each stage as it starts, and each media file as it is brought in (B7). */
  onProgress?: (step: ImportStep) => void,
): Promise<ConvertResult> {
  onProgress?.({ stage: 'reading', done: 0, total: 0 });
  const pkg = await readStorylinePackage(path);
  const resolved = resolveMedia(pkg);
  // Closed captions are files too (`.vtt`), each named by its video's or sound's `ccG`
  // (B5 part C): they are read here, and go onto their media as it is converted.
  const captionParts = new Map(
    [...resolved.files].filter(([g]) => resolved.items.get(g)?.type === 'vtt'),
  );
  for (const g of captionParts.keys()) resolved.files.delete(g);
  const captions = new Map<string, ParsedCaptions>();
  const placed = new Map<string, PlacedMedia>();
  const assets = new Map<string, AssetMeta>();
  const problems: string[] = [];
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-storyline-'));
  try {
    // A guessed picture whose course recorded its pixel size is settled by the candidates' own:
    // they come out of the zip with the rest, and the one of that size is it.
    const sized = resolved.guesses.filter((g) => resolved.items.get(g)?.size);
    // One with no recorded size is settled, where it can be, by the proportions of the pictures
    // that show it (B15).
    const unsized = resolved.guesses.filter((g) => {
      const item = resolved.items.get(g);
      return item?.kind === 'picture' && !item.size;
    });
    const extracted = await pkg.extractAll(
      new Set([
        ...resolved.files.values(),
        ...captionParts.values(),
        ...[...sized, ...unsized].flatMap((g) => resolved.candidates.get(g) ?? []),
      ]),
      work,
    );
    const sizeOf = (part: string) => {
      const file = extracted.get(part);
      if (!file) return null;
      const header = Buffer.alloc(64 * 1024);
      const fd = openSync(file, 'r');
      try {
        return readImageSize(header.subarray(0, readSync(fd, header, 0, header.length, 0)));
      } finally {
        closeSync(fd);
      }
    };
    for (const g of unsized) {
      const chosen = byProportions(
        (resolved.candidates.get(g) ?? []).map((part) => ({ part, size: sizeOf(part) })),
        useAspects(pkg, g),
        resolved.items.get(g)!.type,
      );
      if (chosen) {
        resolved.files.set(g, chosen);
        resolved.guesses = resolved.guesses.filter((each) => each !== g);
        resolved.guessed = resolved.guesses.length;
      }
    }
    for (const [g, part] of captionParts) {
      const file = extracted.get(part);
      if (file) captions.set(g, parseCaptions(readFileSync(file, 'utf8')));
    }
    for (const g of sized) {
      const want = resolved.items.get(g)!.size!;
      const matching = (resolved.candidates.get(g) ?? []).filter((part) => {
        const file = extracted.get(part);
        if (!file) return false;
        const header = Buffer.alloc(64 * 1024);
        const fd = openSync(file, 'r');
        try {
          const size = readImageSize(header.subarray(0, readSync(fd, header, 0, header.length, 0)));
          return size?.width === want.width && size.height === want.height;
        } finally {
          closeSync(fd);
        }
      });
      if (matching.length === 1) {
        resolved.files.set(g, matching[0]!);
        resolved.guesses = resolved.guesses.filter((each) => each !== g);
        resolved.guessed = resolved.guesses.length;
      }
    }
    // One stored asset for each file, however many items share it.
    const byPart = new Map<string, PlacedMedia | null>();
    const total = new Set(resolved.files.values()).size;
    onProgress?.({ stage: 'media', done: 0, total });
    for (const [g, part] of resolved.files) {
      const item = resolved.items.get(g)!;
      if (!byPart.has(part)) {
        const done = byPart.size;
        const shown = item.name || part.slice(part.lastIndexOf('/') + 1);
        onProgress?.({ stage: 'media', done, total, file: shown, fraction: 0 });
        // The pipeline's own progress through this file, passed on to the cover too.
        const tracked: MediaOptions | undefined = media && {
          ...media,
          onProgress: (converting, fraction) => {
            media.onProgress?.(converting, fraction);
            onProgress?.({ stage: 'media', done, total, file: shown, fraction });
          },
        };
        const file = extracted.get(part);
        let result: PlacedMedia | null = null;
        if (file) {
          const named = `${file}.${importExtension(item.kind, part)}`;
          renameSync(file, named);
          try {
            if (item.kind !== 'picture' && !media) {
              problems.push(
                `“${item.name}” could not be imported: the media tools are not installed`,
              );
            } else {
              // A picture of a type the app does not take (TIFF, BMP) comes in as a PNG,
              // converted by ffmpeg (B5 part C).
              let source = named;
              const ext = named.slice(named.lastIndexOf('.') + 1).toLowerCase();
              if (item.kind === 'picture' && !IMPORTABLE_EXTENSIONS.includes(ext)) {
                if (!media) throw new Error(`${ext.toUpperCase()} pictures need the media tools`);
                source = `${file}.png`;
                await runFfmpeg(media.tools, named, ['-frames:v', '1'], source);
              }
              const asset = await importAsset(
                workspaceDir,
                source,
                item.kind === 'picture' ? undefined : tracked,
              );
              result = {
                hash: asset.hash,
                kind:
                  asset.meta.kind === 'video'
                    ? 'video'
                    : asset.meta.kind === 'audio'
                      ? 'audio'
                      : 'image',
                ...(asset.meta.duration !== undefined ? { duration: asset.meta.duration } : {}),
              };
              assets.set(asset.hash, asset.meta);
            }
          } catch (error) {
            problems.push(
              error instanceof PatentedFormatError
                ? `“${item.name}” could not be imported: it ${error.message}, which this system cannot convert`
                : `“${item.name}” could not be imported: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
        byPart.set(part, result);
      }
      const result = byPart.get(part);
      if (result) placed.set(g, result);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  // Files the course's triggers open beside it, if they are beside the `.story` file (B15).
  const external = new Map<string, string>();
  for (const linked of linkedFiles(pkg)) {
    const file = besideStory(path, linked);
    if (!file) continue;
    try {
      const asset = await importAsset(workspaceDir, file, undefined, 'resource');
      assets.set(asset.hash, asset.meta);
      external.set(linked, asset.hash);
    } catch (error) {
      problems.push(
        `“${linked}” could not be brought in: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  onProgress?.({ stage: 'slides', done: 0, total: 0 });
  const result = convertStoryline(pkg, {
    fileName,
    media: (g) => placed.get(g) ?? null,
    captions: (g) => captions.get(g) ?? null,
    externalFile: (linked) => external.get(linked) ?? null,
  });
  result.project.assets = Object.fromEntries(assets);
  for (const problem of problems)
    result.report.unshift({ slide: null, outcome: 'skipped', what: problem });
  if (resolved.guessed > 0) {
    result.report.unshift({
      slide: null,
      outcome: 'approximated',
      what: `${resolved.guessed} media item${resolved.guessed > 1 ? 's were' : ' was'} matched to one of several identical-looking files`,
    });
  }
  // As any project: whatever the converter made must be valid, or the import fails here.
  onProgress?.({ stage: 'checking', done: 0, total: 0 });
  result.project = parseProject(JSON.parse(serializeProject(result.project)));
  return result;
}

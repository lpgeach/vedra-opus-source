/**
 * Which stored file holds each of a course's media items (docs/briefs/B5-storyline-import.md).
 *
 * `story.xml` lists every picture, sound and video by GUID, with its type and
 * size, and the slides, layouts and masters name them by GUID (`assetG` and the
 * like). The files are `story/media/R….ext`, and each part lists the files it uses
 * as relationships. No part says which file is which item, so it is worked out:
 *
 * - an item's file is among the media of every part that uses it, of a fitting type;
 * - a stored original keeps the size the course records for it;
 * - a file settled on one item is no other's.
 *
 * Where a few files still fit, they are the same size and type, in practice copies
 * of one picture, and the first is taken.
 */
import { relationshipsOf } from './package';
import type { StorylinePackage } from './package';

export interface MediaItem {
  g: string;
  kind: 'picture' | 'sound' | 'video';
  /** The course's word for its type: `png`, `jpeg`, `mp3`, `mp4`, … */
  type: string;
  /** The file name the author imported. */
  name: string;
  bytes: number;
  /** Its pixel size, where the course recorded one (`source="Pasted Image (1522x786)"`). */
  size?: { width: number; height: number };
}

export interface ResolvedMedia {
  items: Map<string, MediaItem>;
  /** Each used item's stored part, by GUID. */
  files: Map<string, string>;
  /** Items whose file was a guess among same-sized files that differ. */
  guessed: number;
  /** Their GUIDs, each with the files it could still be. */
  guesses: string[];
  candidates: Map<string, string[]>;
}

/**
 * Types that are video or sound wherever they are listed (B5 part C): a course can list an MP4
 * under `<media>`, the element pictures use.
 */
const VIDEO_TYPES = new Set(['mp4', 'mpeg', 'mpg', 'mov', 'm4v', 'flv', 'wmv', 'avi', 'webm']);
const SOUND_TYPES = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'wma']);

const KINDS: Record<string, MediaItem['kind']> = {
  media: 'picture',
  audio: 'sound',
  video: 'video',
};

/** The file extensions a stored copy of each type can have. */
const FITS: Record<string, string[]> = {
  png: ['png', 'jpg'],
  jpeg: ['jpg', 'jpeg', 'png'],
  jpg: ['jpg', 'jpeg', 'png'],
  gif: ['gif', 'png'],
  bmp: ['bmp', 'png', 'jpg'],
  tiff: ['tiff', 'png', 'jpg'],
  emf: ['emf', 'png'],
  wmf: ['wmf', 'png'],
  svg: ['svg', 'png'],
  mp3: ['mp3'],
  wav: ['wav', 'mp3'],
  mp4: ['mp4', 'mpeg'],
  flv: ['flv', 'mpeg'],
  vtt: ['vtt'],
};
const fits = (type: string, part: string) => {
  const ext = part.slice(part.lastIndexOf('.') + 1).toLowerCase();
  return (FITS[type] ?? [type]).includes(ext);
};

const ATTRIBUTE =
  / ([A-Za-z0-9]+)="([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/g;

/** Every media item the course lists, by GUID. */
export function mediaItems(storyXml: string): Map<string, MediaItem> {
  const items = new Map<string, MediaItem>();
  for (const match of storyXml.matchAll(/<(media|audio|video) ([^>]*?)\/?>/g)) {
    const attrs = Object.fromEntries(
      [...match[2]!.matchAll(/([A-Za-z0-9]+)="([^"]*)"/g)].map((each) => [each[1]!, each[2]!]),
    );
    const g = attrs['g'];
    if (!g || items.has(g)) continue;
    const size = /\((\d+)x(\d+)\)/.exec(attrs['source'] ?? '');
    items.set(g, {
      g,
      kind: VIDEO_TYPES.has((attrs['type'] ?? '').toLowerCase())
        ? 'video'
        : SOUND_TYPES.has((attrs['type'] ?? '').toLowerCase())
          ? 'sound'
          : KINDS[match[1]!]!,
      type: (attrs['type'] ?? '').toLowerCase(),
      name: decode(attrs['displayName'] ?? ''),
      bytes: Number(attrs['bytes'] ?? 0),
      ...(size ? { size: { width: Number(size[1]), height: Number(size[2]) } } : {}),
    });
  }
  return items;
}

const decode = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

/** The parts that place media: slides, layouts and masters. */
const PLACING = /^story\/(slides|slideLayouts|slideMasters)\/[^/]+\.xml$/;

export function resolveMedia(
  pkg: Pick<StorylinePackage, 'xml' | 'media'> & Partial<Pick<StorylinePackage, 'crcs'>>,
): ResolvedMedia {
  const items = mediaItems(pkg.xml.get('story/story.xml') ?? '');
  const candidates = new Map<string, string[]>();
  // The order items are first used in, and files first listed in, across the parts.
  const useOrder = new Map<string, number>();
  const fileOrder = new Map<string, number>();
  // A part lists a relationship for each use of a medium, in the order it uses them, with
  // others (its sound, captions, its thumbnail) among them: walking the uses and the list
  // together, each use votes for the next listed file that could be it (B5 part C).
  const votes = new Map<string, Map<string, number>>();
  for (const [part, text] of pkg.xml) {
    if (!PLACING.test(part)) continue;
    const listed = relationshipsOf(pkg, part)
      .filter((each) => each.type === 'media' && pkg.media.has(each.target))
      .map((each) => each.target);
    const files = [...new Set(listed)];
    for (const file of files) if (!fileOrder.has(file)) fileOrder.set(file, fileOrder.size);
    const used = new Set<string>();
    let next = 0;
    for (const match of text.matchAll(ATTRIBUTE)) {
      // A slide's thumbnail (`thumbG`) is never imported: it is not looked for.
      if (/^thumb/i.test(match[1]!) || !items.has(match[2]!)) continue;
      used.add(match[2]!);
      if (!useOrder.has(match[2]!)) useOrder.set(match[2]!, useOrder.size);
      const item = items.get(match[2]!)!;
      while (next < listed.length && !fits(item.type, listed[next]!)) next++;
      if (next < listed.length) {
        const tally = votes.get(item.g) ?? new Map<string, number>();
        tally.set(listed[next]!, (tally.get(listed[next]!) ?? 0) + 1);
        votes.set(item.g, tally);
        next++;
      }
    }
    for (const g of used) {
      const item = items.get(g)!;
      const fitting = files.filter((file) => fits(item.type, file));
      const before = candidates.get(g);
      candidates.set(g, before ? before.filter((file) => fitting.includes(file)) : fitting);
    }
  }
  // A stored original keeps its recorded size: prefer those where any fit.
  for (const [g, list] of candidates) {
    const exact = list.filter((file) => pkg.media.get(file) === items.get(g)!.bytes);
    if (exact.length > 0) candidates.set(g, exact);
  }
  // A file settled on one item is no other's.
  const settle = () => {
    for (let changed = true; changed;) {
      changed = false;
      const settled = new Map<string, string>();
      for (const [g, list] of candidates) if (list.length === 1) settled.set(list[0]!, g);
      for (const [g, list] of candidates) {
        if (list.length < 2) continue;
        const kept = list.filter((file) => (settled.get(file) ?? g) === g);
        if (kept.length < list.length) {
          candidates.set(g, kept);
          changed = true;
        }
      }
    }
  };
  settle();
  // Where the files that fit still tie, the uses' votes decide, if one file has the most. A
  // picture whose course recorded its pixel size is left for that, which is surer.
  for (const [g, list] of candidates) {
    if (list.length < 2 || items.get(g)!.size) continue;
    const tally = votes.get(g);
    if (!tally) continue;
    const ranked = list
      .map((file) => ({ file, count: tally.get(file) ?? 0 }))
      .sort((a, b) => b.count - a.count);
    if (ranked[0]!.count > 0 && ranked[0]!.count > (ranked[1]?.count ?? 0)) {
      candidates.set(g, [ranked[0]!.file]);
    }
  }
  settle();
  // n items sharing the same n files (frames of one size, say): a part lists its files in the
  // order it uses them, so the first used takes the first listed.
  const byList = new Map<string, string[]>();
  for (const [g, list] of candidates) {
    if (list.length < 2) continue;
    const key = [...list].sort().join('\n');
    byList.set(key, [...(byList.get(key) ?? []), g]);
  }
  for (const [key, sharing] of byList) {
    const shared = key.split('\n');
    if (sharing.length !== shared.length) continue;
    const users = [...sharing].sort((a, b) => (useOrder.get(a) ?? 0) - (useOrder.get(b) ?? 0));
    const listed = [...shared].sort((a, b) => (fileOrder.get(a) ?? 0) - (fileOrder.get(b) ?? 0));
    users.forEach((g, at) => candidates.set(g, [listed[at]!]));
  }
  // An item with no recorded size takes the one file that fits it and that no other item could be.
  for (const [g, list] of candidates) {
    if (list.length < 2 || items.get(g)!.bytes > 0) continue;
    const others = new Set(
      [...candidates].filter(([other]) => other !== g).flatMap(([, files]) => files),
    );
    const free = list.filter((file) => !others.has(file));
    if (free.length === 1) candidates.set(g, free);
  }
  settle();
  const files = new Map<string, string>();
  const guesses: string[] = [];
  for (const [g, list] of candidates) {
    if (list.length === 0) continue;
    // Copies of the same bytes (same size and CRC) are no guess: any of them is the file.
    const same = (file: string) =>
      pkg.media.get(file) === pkg.media.get(list[0]!) &&
      pkg.crcs?.get(file) !== undefined &&
      pkg.crcs.get(file) === pkg.crcs.get(list[0]!);
    if (list.length > 1 && !list.every(same)) guesses.push(g);
    files.set(g, list[0]!);
  }
  return {
    items,
    files,
    guessed: guesses.length,
    guesses,
    candidates: new Map(guesses.map((g) => [g, candidates.get(g)!])),
  };
}

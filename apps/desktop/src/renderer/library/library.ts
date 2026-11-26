/**
 * The icons and illustrations library (docs/briefs/P9.8-icons-library.md): Lucide's
 * icons and the Open Doodles, made into plain drawings by
 * `scripts/build-library.mjs`. They load only when first asked for, so the app
 * starts without them.
 */
import type { GraphicItem } from '@vedraopus/model';

export type LibraryKind = 'icons' | 'illustrations';

export interface LibraryItem extends GraphicItem {
  /** Words it is found by, besides its name. */
  tags: string[];
}

/** What `scripts/build-library.mjs` writes. */
interface LibraryFile {
  library: GraphicItem['library'];
  source: string;
  viewBox: GraphicItem['viewBox'];
  strokeWidth: number | null;
  items: {
    key: string;
    title: string;
    tags: string[];
    viewBox?: GraphicItem['viewBox'];
    nodes: GraphicItem['nodes'];
  }[];
}

/** The library's items from the text of one of its files. */
export function parseLibrary(text: string): LibraryItem[] {
  const file = JSON.parse(text) as LibraryFile;
  return file.items.map((item) => ({
    library: file.library,
    key: item.key,
    title: item.title,
    tags: item.tags,
    viewBox: item.viewBox ?? file.viewBox,
    nodes: item.nodes,
    strokeWidth: file.strokeWidth,
  }));
}

const loaded = new Map<LibraryKind, Promise<LibraryItem[]>>();

/** Every icon, or every illustration, loaded once. */
export function loadLibrary(kind: LibraryKind): Promise<LibraryItem[]> {
  let items = loaded.get(kind);
  if (!items) {
    items = (
      kind === 'icons' ? import('./lucide.json?raw') : import('./open-doodles.json?raw')
    ).then((module) => parseLibrary(module.default));
    loaded.set(kind, items);
  }
  return items;
}

/**
 * The items a search finds: each word must start a word of the item's name or
 * key, or be in one of its tags. Names that match come before tags that do.
 * An empty search finds everything.
 */
export function searchLibrary(items: readonly LibraryItem[], query: string): LibraryItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...items];
  const named: LibraryItem[] = [];
  const tagged: LibraryItem[] = [];
  for (const item of items) {
    const names = `${item.title} ${item.key.replace(/-/g, ' ')}`.toLowerCase().split(/\s+/);
    const tags = item.tags.map((tag) => tag.toLowerCase());
    const byName = words.every((word) => names.some((name) => name.startsWith(word)));
    if (byName) named.push(item);
    else if (
      words.every(
        (word) =>
          names.some((name) => name.startsWith(word)) || tags.some((tag) => tag.includes(word)),
      )
    ) {
      tagged.push(item);
    }
  }
  // Among names: the exact one first, then those that start with the search.
  const wanted = words.join('-');
  const rank = (item: LibraryItem) =>
    item.key === wanted ? 0 : item.key.startsWith(words[0]!) ? 1 : 2;
  named.sort((a, b) => rank(a) - rank(b));
  return [...named, ...tagged];
}

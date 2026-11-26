/**
 * Reading a `.story` file (docs/briefs/B5-storyline-import.md): an Open Packaging
 * Conventions zip. Its XML parts are read into memory, within limits; its media,
 * which can run to hundreds of megabytes, stay in the zip until one is wanted.
 */
import { parseXml } from '@vedraopus/model';
import type { XmlElement } from '@vedraopus/model';
import { createWriteStream } from 'node:fs';
import { basename, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import type { Entry, ZipFile } from 'yauzl';

/** A byte-order mark at the start of a part, which some tools write. */
const LEADING_BOM = new RegExp('^\ufeff');

/** A file the importer cannot read, with a reason for the author. */
export class StorylineError extends Error {}

/** Limits, so a damaged or hostile file cannot fill the memory. */
const MAX_XML_PART_BYTES = 64 * 1024 * 1024;
const MAX_XML_TOTAL_BYTES = 512 * 1024 * 1024;
const MAX_PARTS = 50_000;

export interface StorylinePackage {
  /** The XML parts (`.xml`, `.rels`), by name without a leading slash. */
  xml: Map<string, string>;
  /** Every other part's size, by name: the media, still in the zip. */
  media: Map<string, number>;
  /** The CRC-32 the zip records for each of those parts: same size and CRC, same bytes. */
  crcs: Map<string, number>;
  /** Write one part to `target`. */
  extract(name: string, target: string): Promise<void>;
  /** Write these parts into `folder`, in one pass over the zip; their paths, by name. */
  extractAll(names: ReadonlySet<string>, folder: string): Promise<Map<string, string>>;
}

function open(path: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true, autoClose: false }, (error, zip) => {
      if (error || !zip) reject(new StorylineError(NOT_A_COURSE));
      else resolve(zip);
    });
  });
}

const NOT_A_COURSE = 'This is not an Articulate Storyline course (.story), or it is damaged.';

function readEntry(zip: ZipFile, entry: Entry): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) return reject(error ?? new Error('unreadable'));
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  });
}

/** Read the package at `path`: its XML now, its media on request. */
export async function readStorylinePackage(path: string): Promise<StorylinePackage> {
  const zip = await open(path);
  const xml = new Map<string, string>();
  const media = new Map<string, number>();
  const crcs = new Map<string, number>();
  const entries = new Map<string, Entry>();
  let total = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      zip.on('error', reject);
      zip.on('end', resolve);
      zip.on('entry', (entry: Entry) => {
        void (async () => {
          const name = entry.fileName.replace(/^\/+/, '');
          if (name.endsWith('/') || name.includes('..')) return zip.readEntry();
          if (entries.size >= MAX_PARTS)
            throw new StorylineError('This course has too many parts.');
          entries.set(name, entry);
          if (/\.(xml|rels)$/i.test(name)) {
            if (entry.uncompressedSize > MAX_XML_PART_BYTES) {
              throw new StorylineError(`A part of this course is too large to read (${name}).`);
            }
            total += entry.uncompressedSize;
            if (total > MAX_XML_TOTAL_BYTES) {
              throw new StorylineError('This course holds too much data to read.');
            }
            xml.set(name, (await readEntry(zip, entry)).toString('utf8').replace(LEADING_BOM, ''));
          } else {
            media.set(name, entry.uncompressedSize);
            crcs.set(name, entry.crc32);
          }
          zip.readEntry();
        })().catch(reject);
      });
      zip.readEntry();
    });
  } catch (error) {
    zip.close();
    throw error instanceof StorylineError ? error : new StorylineError(NOT_A_COURSE);
  }
  if (!xml.has('story/story.xml')) {
    zip.close();
    throw new StorylineError(NOT_A_COURSE);
  }
  zip.close();
  return {
    xml,
    media,
    crcs,
    async extract(name, target) {
      const entry = entries.get(name);
      if (!entry) throw new StorylineError(`The course has no part ${name}.`);
      const again = await open(path);
      try {
        await new Promise<void>((resolve, reject) => {
          again.openReadStream(entry, (error, stream) => {
            if (error || !stream) return reject(error ?? new Error('unreadable'));
            pipeline(stream, createWriteStream(target)).then(resolve, reject);
          });
        });
      } finally {
        again.close();
      }
    },
    async extractAll(names, folder) {
      const written = new Map<string, string>();
      const again = await open(path);
      try {
        await new Promise<void>((resolve, reject) => {
          again.on('error', reject);
          again.on('end', resolve);
          again.on('entry', (entry: Entry) => {
            const name = entry.fileName.replace(/^\/+/, '');
            if (!names.has(name)) return again.readEntry();
            // A safe name of our own: the part's base name, which is unique in story/media.
            const target = join(
              folder,
              `${written.size}-${basename(name).replace(/[^A-Za-z0-9._-]/g, '_')}`,
            );
            again.openReadStream(entry, (error, stream) => {
              if (error || !stream) return reject(error ?? new Error('unreadable'));
              pipeline(stream, createWriteStream(target)).then(() => {
                written.set(name, target);
                again.readEntry();
              }, reject);
            });
          });
          again.readEntry();
        });
      } finally {
        again.close();
      }
      return written;
    },
  };
}

/** A part's XML, parsed; undefined when the course lacks it. */
export function readXml(pkg: Pick<StorylinePackage, 'xml'>, name: string): XmlElement | undefined {
  const text = pkg.xml.get(name);
  return text === undefined ? undefined : parseXml(text);
}

/** A part's relationships, in order: `{ id, type, target }`, targets without a leading slash. */
export function relationshipsOf(
  pkg: Pick<StorylinePackage, 'xml'>,
  part: string,
): { id: string; type: string; target: string }[] {
  const slash = part.lastIndexOf('/');
  const relsName = `${part.slice(0, slash)}/_rels/${part.slice(slash + 1)}.rels`;
  const root = readXml(pkg, relsName);
  if (!root) return [];
  return root.children.flatMap((child) =>
    typeof child === 'string' || child.name !== 'Relationship'
      ? []
      : [
          {
            id: child.attrs['Id'] ?? '',
            type: child.attrs['Type'] ?? '',
            target: (child.attrs['Target'] ?? '').replace(/^\/+/, ''),
          },
        ],
  );
}

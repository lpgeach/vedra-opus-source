// `crypto` exists in every runtime we target (browsers, Node, Electron) but this
// package compiles without DOM or Node typings, so declare the one call we use.
declare const crypto: { getRandomValues<T extends Uint8Array>(array: T): T };

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const ID_LENGTH = 16;

/** Kinds of thing that carry an id; the prefix makes ids readable in saved files and logs. */
export type IdPrefix =
  | 'project'
  | 'scene'
  | 'slide'
  | 'layer'
  | 'obj'
  | 'state'
  | 'trigger'
  | 'var'
  | 'cue'
  | 'caption'
  | 'path'
  | 'choice'
  | 'master'
  | 'layout'
  // The player's tabs (P8.2).
  | 'tab'
  | 'res'
  | 'term'
  // A saved player look (P8.3).
  | 'preset'
  // A 360° image's spot (P9.10).
  | 'spot';

/** A new unique id such as `slide_k3x9…`. Unique across the project, not just per kind. */
export function createId(prefix: IdPrefix): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_LENGTH));
  let suffix = '';
  for (const byte of bytes) suffix += ALPHABET[byte % 36];
  return `${prefix}_${suffix}`;
}

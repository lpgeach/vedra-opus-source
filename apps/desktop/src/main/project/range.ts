/**
 * HTTP byte ranges for the media scheme (docs/briefs/P11.5-hardening.md, part B):
 * a long video seeks by asking for just the bytes it needs.
 */

/** The bytes a `Range: bytes=…` header asks for, within `size`; null for the whole file. */
export function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | 'unsatisfiable' | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === '' && match[2] === '')) return null;
  let start: number;
  let end: number;
  if (match[1] === '') {
    // The last N bytes.
    const last = Number(match[2]);
    if (last === 0) return 'unsatisfiable';
    start = Math.max(0, size - last);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start >= size || start > end) return 'unsatisfiable';
  return { start, end };
}

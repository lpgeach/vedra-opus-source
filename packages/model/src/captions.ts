/**
 * Closed captions as text files: WebVTT and SubRip, read and written
 * (docs/briefs/P6.4-captions.md). Pure: no DOM, no files.
 */
import { createId } from './ids';
import type { CaptionCue } from './schema';

export interface ParsedCaptions {
  cues: CaptionCue[];
  /** What could not be read, with the line it was on, in words for the author. */
  problems: string[];
}

/** `HH:MM:SS.mmm`, `MM:SS.mmm` (VTT) or `HH:MM:SS,mmm` (SRT), in seconds; null if it is none of those. */
export function parseTimestamp(text: string): number | null {
  const match = /^(?:(\d+):)?([0-5]?\d):([0-5]\d)[.,](\d{1,3})$/.exec(text.trim());
  if (!match) return null;
  const [, hours, minutes, seconds, fraction] = match;
  return (
    Number(hours ?? 0) * 3600 +
    Number(minutes) * 60 +
    Number(seconds) +
    Number(fraction!.padEnd(3, '0')) / 1000
  );
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
};

/** A cue's text as plain text: VTT and SRT markup (`<i>`, `<c.class>`, `<v Name>`) removed, entities decoded. */
export function plainCueText(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, name: string) => ENTITIES[name]!)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .trim();
}

/** Read a WebVTT or SubRip file. Throws when it holds no cue at all. */
export function parseCaptions(text: string): ParsedCaptions {
  const lines = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const cues: CaptionCue[] = [];
  const problems: string[] = [];
  let i = 0;
  // The WebVTT header, and anything up to the first blank line, is not a cue.
  if (/^WEBVTT(?:\s|$)/.test(lines[0] ?? '')) {
    while (i < lines.length && lines[i]!.trim() !== '') i++;
  }
  while (i < lines.length) {
    while (i < lines.length && lines[i]!.trim() === '') i++;
    if (i >= lines.length) break;
    const blockStart = i;
    const block: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== '') block.push(lines[i++]!);
    // NOTE, STYLE and REGION blocks say nothing a caption needs.
    if (/^(NOTE|STYLE|REGION)(?:\s|$)/.test(block[0]!)) continue;
    // An identifier (VTT) or number (SRT) may come before the timing line.
    const timingAt = block.findIndex((line) => line.includes('-->'));
    if (timingAt < 0 || timingAt > 1) {
      problems.push(`Line ${blockStart + 1}: no "start --> end" times.`);
      continue;
    }
    const [from, rest] = block[timingAt]!.split('-->');
    const start = parseTimestamp(from ?? '');
    // Cue settings (position, align, …) follow the end time; they are not kept.
    const end = parseTimestamp((rest ?? '').trim().split(/\s+/)[0] ?? '');
    if (start === null || end === null) {
      problems.push(
        `Line ${blockStart + timingAt + 1}: times not understood ("${block[timingAt]!.trim()}").`,
      );
      continue;
    }
    if (end <= start) {
      problems.push(`Line ${blockStart + timingAt + 1}: the caption ends before it starts.`);
      continue;
    }
    const words = plainCueText(block.slice(timingAt + 1).join('\n'));
    if (words === '') {
      problems.push(`Line ${blockStart + timingAt + 1}: the caption has no text.`);
      continue;
    }
    cues.push({ id: createId('caption'), start, end, text: words });
  }
  if (cues.length === 0) {
    throw new Error(
      problems[0]
        ? `No captions could be read. ${problems[0]}`
        : 'There are no captions in this file.',
    );
  }
  cues.sort((a, b) => a.start - b.start || a.end - b.end);
  return { cues, problems };
}

/** Seconds as `HH:MM:SS.mmm`, with `.` (VTT) or `,` (SRT) before the milliseconds. */
export function formatTimestamp(seconds: number, separator: '.' | ',' = '.'): string {
  const total = Math.round(Math.max(0, seconds) * 1000);
  const ms = total % 1000;
  const s = Math.floor(total / 1000) % 60;
  const m = Math.floor(total / 60_000) % 60;
  const h = Math.floor(total / 3_600_000);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(h)}:${two(m)}:${two(s)}${separator}${String(ms).padStart(3, '0')}`;
}

/** Text that cannot be mistaken for markup or a timing line inside a cue. */
const safeVtt = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/-->/g, '--&gt;');

/** The cues, in time order, as a WebVTT file. */
export function formatVtt(cues: readonly CaptionCue[]): string {
  const sorted = [...cues].sort((a, b) => a.start - b.start || a.end - b.end);
  const blocks = sorted.map(
    (cue) =>
      `${formatTimestamp(cue.start)} --> ${formatTimestamp(cue.end)}\n${safeVtt(cue.text.trim()).replace(/\n\s*\n/g, '\n')}`,
  );
  return `WEBVTT\n\n${blocks.join('\n\n')}\n`;
}

/** The cues, in time order, as a SubRip file. */
export function formatSrt(cues: readonly CaptionCue[]): string {
  const sorted = [...cues].sort((a, b) => a.start - b.start || a.end - b.end);
  return sorted
    .map(
      (cue, index) =>
        `${index + 1}\n${formatTimestamp(cue.start, ',')} --> ${formatTimestamp(cue.end, ',')}\n${cue.text.trim().replace(/\n\s*\n/g, '\n')}`,
    )
    .join('\n\n')
    .concat('\n');
}

/**
 * Path shapes' outlines (docs/briefs/B13-path-shapes.md): SVG path data with only
 * absolute `M`, `L`, `C` and `Z`, every coordinate in a 0–1 box that is stretched
 * to the object's frame (as a polygon's points are). Points may lie outside the
 * box, as a callout's tail does. Arcs are written as curves by whoever makes one.
 */

export type PathCommand =
  | { op: 'M' | 'L'; values: [number, number] }
  | { op: 'C'; values: [number, number, number, number, number, number] }
  | { op: 'Z'; values: [] };

const COUNTS = { M: 2, L: 2, C: 6, Z: 0 } as const;
const TOKEN = /\s*,?\s*([MLCZ]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/y;

/** The commands of path data, or null when it is not the kind path shapes take. */
export function parsePathData(d: string): PathCommand[] | null {
  const tokens: string[] = [];
  TOKEN.lastIndex = 0;
  let at = 0;
  for (;;) {
    TOKEN.lastIndex = at;
    const found = TOKEN.exec(d);
    if (!found) break;
    tokens.push(found[1]!);
    at = TOKEN.lastIndex;
  }
  if (d.slice(at).trim() !== '' || tokens[0] !== 'M') return null;
  const commands: PathCommand[] = [];
  for (let i = 0; i < tokens.length;) {
    const op = tokens[i++] as keyof typeof COUNTS;
    if (!(op in COUNTS)) return null;
    const values: number[] = [];
    for (let n = 0; n < COUNTS[op]; n++) {
      const value = Number(tokens[i++]);
      if (!Number.isFinite(value)) return null;
      values.push(value);
    }
    commands.push({ op, values } as PathCommand);
  }
  return commands;
}

/** Whether `d` is path data a path shape takes. */
export const isPathData = (d: string): boolean => parsePathData(d) !== null;

const short = (value: number) => {
  const rounded = Math.round(value * 1e4) / 1e4;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};

/** Path data from commands, coordinates rounded to four places. */
export function writePathData(commands: readonly PathCommand[]): string {
  return commands.map(({ op, values }) => op + values.map(short).join(' ')).join('');
}

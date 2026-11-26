/**
 * Suspend data: a course's saved session in as few characters as an LMS will
 * keep (SCORM 1.2 allows 4,096). See docs/briefs/P5.2-scorm-12.md.
 *
 * 1. Ids become positions in the published course, the visited list a bitset.
 * 2. The JSON of that is compressed with LZW and written in URL-safe base64.
 * 3. If it is still too long, detail is dropped in a fixed order.
 */
import { everySlide, choiceMarks, forEachObject, isSurveyQuestion } from '@vedraopus/model';
import type { Project, SceneObject, Slide, VariableValue } from '@vedraopus/model';
import type { SavedQuestion, SavedSlide, SessionState } from '@vedraopus/engine';

const PREFIX = 'E1.';
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// ------------------------------------------------------------------ compaction

interface CompactSlide {
  /** [object, state] positions for states that are not the initial one. */
  o?: [number, number][];
  /** [object, marks] for selected / visited marks. */
  f?: [number, string][];
  /** Shown overlay layers, by position among the slide's overlays. */
  l?: number[];
  /** [layer, tenths of a second]: 0 is the base layer, 1.. the overlays. */
  t?: [number, number][];
  /** Objects a script hid. */
  h?: number[];
  /** [object, x, y]: where motion paths left objects, in whole stage units (P6.5). */
  m?: [number, number, number][];
}

interface Compact {
  /** Which course this belongs to: a fingerprint of its slides. */
  k: string;
  s?: number;
  c?: 1;
  e?: number;
  /** Variables by name (names survive a republish better than positions). */
  x?: Record<string, VariableValue>;
  /** Visited slides as a bitset. */
  b?: string;
  r?: Record<string, CompactSlide>;
  /**
   * Questions by slide position (P7.1): [attempts, result (0 unfinished, 1
   * correct, 2 incorrect), score, chosen choices, shuffled order, and (P7.2)
   * what was typed or chosen in its parts].
   */
  q?: Record<string, [number, number, number, number[], number[], string[]?]>;
  /** Each draw (P7.6): draw slide position → the drawn slides' positions, in play order. */
  d?: Record<string, number[]>;
  /** Results reached (P7.7): result slide position → [score, most]. */
  res?: Record<string, [number, number]>;
  /** Result timers (P7.7): result slide position → course time started, in tenths of a second. */
  tm?: Record<string, number>;
}

/** FNV-1a over the slide ids, in base 36: changes when slides are added, removed or reordered. */
export function courseFingerprint(project: Project): string {
  let hash = 0x811c9dc5;
  for (const { slide } of everySlide(project)) {
    for (const ch of `${slide.id}|`) {
      hash ^= ch.charCodeAt(0);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash.toString(36);
}

function objectsOn(slide: Slide): SceneObject[] {
  const all: SceneObject[] = [];
  for (const layer of [slide.baseLayer, ...slide.layers]) {
    forEachObject(layer.objects, (object) => all.push(object));
  }
  return all;
}

const toBits = (on: readonly boolean[]): string => {
  let out = '';
  for (let i = 0; i < on.length; i += 6) {
    let n = 0;
    for (let j = 0; j < 6; j++) if (on[i + j]) n |= 1 << j;
    out += ALPHABET[n];
  }
  return out.replace(/A+$/, '');
};
const fromBits = (text: string, length: number): boolean[] => {
  const on: boolean[] = [];
  for (let i = 0; i < length; i++) {
    const n = ALPHABET.indexOf(text[Math.floor(i / 6)] ?? 'A');
    on.push((n >> (i % 6)) & 1 ? true : false);
  }
  return on;
};

function compact(project: Project, state: SessionState): Compact {
  const slides = everySlide(project).map(({ slide }) => slide);
  const index = new Map(slides.map((slide, i) => [slide.id, i]));
  const out: Compact = { k: courseFingerprint(project) };
  if (state.s !== undefined && index.has(state.s)) out.s = index.get(state.s)!;
  if (state.c) out.c = 1;
  // Tenths of a second, as the engine keeps it.
  if (state.e) out.e = Math.round(state.e * 10);
  const x: Record<string, VariableValue> = {};
  for (const [id, value] of Object.entries(state.x ?? {})) {
    const variable = project.variables.find((each) => each.id === id);
    if (variable) x[variable.name] = value;
  }
  if (Object.keys(x).length > 0) out.x = x;
  if (state.vis?.length) {
    const seen = new Set(state.vis);
    out.b = toBits(slides.map((slide) => seen.has(slide.id)));
  }
  const r: Record<string, CompactSlide> = {};
  for (const [slideId, saved] of Object.entries(state.sv ?? {})) {
    const slide = slides[index.get(slideId) ?? -1];
    if (!slide) continue;
    const objects = objectsOn(slide);
    const at = (id: string) => objects.findIndex((object) => object.id === id);
    const layers = [slide.baseLayer, ...slide.layers].map((layer) => layer.id);
    const one: CompactSlide = {};
    const o = Object.entries(saved.o ?? {}).flatMap(([id, stateId]): [number, number][] => {
      const i = at(id);
      const s = objects[i]?.states.findIndex((each) => each.id === stateId) ?? -1;
      return i >= 0 && s >= 0 ? [[i, s]] : [];
    });
    if (o.length) one.o = o;
    const f = Object.entries(saved.f ?? {}).flatMap(([id, marks]): [number, string][] =>
      at(id) >= 0 ? [[at(id), marks]] : [],
    );
    if (f.length) one.f = f;
    const l = (saved.l ?? []).map((id) => layers.indexOf(id)).filter((i) => i > 0);
    if (l.length) one.l = l;
    const t = Object.entries(saved.t ?? {}).flatMap(([id, seconds]): [number, number][] =>
      layers.includes(id) ? [[layers.indexOf(id), Math.round(seconds * 10)]] : [],
    );
    if (t.length) one.t = t;
    const h = (saved.h ?? []).map(at).filter((i) => i >= 0);
    if (h.length) one.h = h;
    const m = Object.entries(saved.m ?? {}).flatMap(([id, [x, y]]): [number, number, number][] =>
      at(id) >= 0 ? [[at(id), x, y]] : [],
    );
    if (m.length) one.m = m;
    if (Object.keys(one).length > 0) r[index.get(slideId)!] = one;
  }
  if (Object.keys(r).length > 0) out.r = r;
  const q: NonNullable<Compact['q']> = {};
  for (const [slideId, record] of Object.entries(state.q ?? {})) {
    const at = index.get(slideId);
    if (at === undefined) continue;
    const packed: NonNullable<Compact['q']>[string] = [
      record.a,
      record.r === 'c' ? 1 : record.r === 'i' ? 2 : record.r === 'a' ? 3 : 0,
      record.s ?? 0,
      record.c ?? [],
      record.o ?? [],
    ];
    if (record.v) packed.push(record.v);
    q[at] = packed;
  }
  if (Object.keys(q).length > 0) out.q = q;
  const d: NonNullable<Compact['d']> = {};
  for (const [drawId, drawn] of Object.entries(state.d ?? {})) {
    const at = index.get(drawId);
    if (at === undefined) continue;
    d[at] = drawn.flatMap((id) => (index.has(id) ? [index.get(id)!] : []));
  }
  if (Object.keys(d).length > 0) out.d = d;
  const res: NonNullable<Compact['res']> = {};
  for (const [id, { s, m }] of Object.entries(state.res ?? {})) {
    if (index.has(id)) res[index.get(id)!] = [s, m];
  }
  if (Object.keys(res).length > 0) out.res = res;
  const tm: NonNullable<Compact['tm']> = {};
  for (const [id, at] of Object.entries(state.tm ?? {})) {
    if (index.has(id)) tm[index.get(id)!] = Math.round(at * 10);
  }
  if (Object.keys(tm).length > 0) out.tm = tm;
  return out;
}

function expand(project: Project, data: Compact): SessionState {
  const slides = everySlide(project).map(({ slide }) => slide);
  const state: SessionState = { v: 1 };
  if (data.c === 1) state.c = 1;
  if (typeof data.e === 'number' && data.e > 0) state.e = data.e / 10;
  const x: Record<string, VariableValue> = {};
  for (const [name, value] of Object.entries(data.x ?? {})) {
    const variable = project.variables.find((each) => each.name === name);
    if (variable && typeof value === typeof variable.default) x[variable.id] = value;
  }
  if (Object.keys(x).length > 0) state.x = x;
  // Positions only mean something in the same course.
  if (data.k !== courseFingerprint(project)) return state;
  if (typeof data.s === 'number' && slides[data.s]) state.s = slides[data.s]!.id;
  if (data.b) {
    const on = fromBits(data.b, slides.length);
    const vis = slides.filter((_, i) => on[i]).map((slide) => slide.id);
    if (vis.length) state.vis = vis;
  }
  const sv: Record<string, SavedSlide> = {};
  for (const [key, one] of Object.entries(data.r ?? {})) {
    const slide = slides[Number(key)];
    if (!slide) continue;
    const objects = objectsOn(slide);
    const layers = [slide.baseLayer, ...slide.layers].map((layer) => layer.id);
    const saved: SavedSlide = {};
    const o: Record<string, string> = {};
    for (const [i, s] of one.o ?? []) {
      const object = objects[i];
      const stateId = object?.states[s]?.id;
      if (object && stateId) o[object.id] = stateId;
    }
    if (Object.keys(o).length) saved.o = o;
    const f: Record<string, string> = {};
    for (const [i, marks] of one.f ?? []) if (objects[i]) f[objects[i].id] = marks;
    if (Object.keys(f).length) saved.f = f;
    const l = (one.l ?? []).map((i) => layers[i]).filter((id): id is string => !!id);
    if (l.length) saved.l = l;
    const t: Record<string, number> = {};
    for (const [i, tenths] of one.t ?? []) if (layers[i]) t[layers[i]] = tenths / 10;
    if (Object.keys(t).length) saved.t = t;
    const h = (one.h ?? []).map((i) => objects[i]?.id).filter((id): id is string => !!id);
    if (h.length) saved.h = h;
    const m: Record<string, [number, number]> = {};
    for (const [i, x, y] of one.m ?? []) if (objects[i]) m[objects[i].id] = [x, y];
    if (Object.keys(m).length) saved.m = m;
    sv[slide.id] = saved;
  }
  if (Object.keys(sv).length) state.sv = sv;
  const q: NonNullable<SessionState['q']> = {};
  for (const [key, [a, r, s, c, o, v]] of Object.entries(data.q ?? {})) {
    const slide = slides[Number(key)];
    if (!slide || !slide.question) continue;
    const record: SavedQuestion = { a };
    if (r === 1 || r === 2) {
      record.r = r === 1 ? 'c' : 'i';
      record.s = s;
      // Only a question answered by marking choices has chosen ones (freeform picks too, P7.4).
      if (choiceMarks(slide.question).length > 0) record.c = c;
    } else if (r === 3 && isSurveyQuestion(slide.question)) {
      // A survey answered (P7.3): no score; picks and Likert points are chosen choices.
      record.r = 'a';
      if (choiceMarks(slide.question).length > 0) record.c = c;
    }
    if (o.length > 0) record.o = o;
    if (v && v.length > 0) record.v = v;
    q[slide.id] = record;
  }
  if (Object.keys(q).length) state.q = q;
  const d: NonNullable<SessionState['d']> = {};
  for (const [key, drawn] of Object.entries(data.d ?? {})) {
    const slide = slides[Number(key)];
    if (!slide?.draw || !Array.isArray(drawn)) continue;
    d[slide.id] = drawn.flatMap((i) => (slides[i] ? [slides[i].id] : []));
  }
  if (Object.keys(d).length) state.d = d;
  const res: NonNullable<SessionState['res']> = {};
  for (const [key, pair] of Object.entries(data.res ?? {})) {
    const slide = slides[Number(key)];
    if (slide?.result && Array.isArray(pair)) res[slide.id] = { s: pair[0], m: pair[1] };
  }
  if (Object.keys(res).length) state.res = res;
  const tm: NonNullable<SessionState['tm']> = {};
  for (const [key, tenths] of Object.entries(data.tm ?? {})) {
    const slide = slides[Number(key)];
    if (slide?.result && typeof tenths === 'number') tm[slide.id] = tenths / 10;
  }
  if (Object.keys(tm).length) state.tm = tm;
  return state;
}

// ----------------------------------------------------------------- compression

/** UTF-8 bytes of `text` (written out here so the codec runs anywhere, with or without a DOM). */
function utf8(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else {
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
  }
  return out;
}

function fromUtf8(bytes: readonly number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i]!;
    const extra = b >= 0xf0 ? 3 : b >= 0xe0 ? 2 : b >= 0xc0 ? 1 : 0;
    let c = extra === 0 ? b : b & (0x3f >> extra);
    for (let k = 1; k <= extra; k++) c = (c << 6) | ((bytes[i + k] ?? 0) & 63);
    out += String.fromCodePoint(c);
    i += extra + 1;
  }
  return out;
}

/** LZW over the UTF-8 bytes of `text`, codes packed into 6-bit characters. */
export function compress(text: string): string {
  const bytes = utf8(text);
  const dict = new Map<string, number>();
  for (let i = 0; i < 256; i++) dict.set(String.fromCharCode(i), i);
  let next = 256;
  let width = 9;
  let out = '';
  let buffer = 0;
  let bits = 0;
  const write = (code: number) => {
    buffer |= code << bits;
    bits += width;
    while (bits >= 6) {
      out += ALPHABET[buffer & 63];
      buffer >>>= 6;
      bits -= 6;
    }
  };
  let word = '';
  for (const byte of bytes) {
    const ch = String.fromCharCode(byte);
    const joined = word + ch;
    if (dict.has(joined)) {
      word = joined;
      continue;
    }
    write(dict.get(word)!);
    // The dictionary stops growing at 16-bit codes; plenty for a few kilobytes.
    if (next < 1 << 16) {
      dict.set(joined, next++);
      if (next > 1 << width && width < 16) width++;
    }
    word = ch;
  }
  if (word !== '') write(dict.get(word)!);
  if (bits > 0) out += ALPHABET[buffer & 63];
  return out;
}

export function decompress(packed: string): string {
  const dict: string[] = [];
  for (let i = 0; i < 256; i++) dict.push(String.fromCharCode(i));
  let width = 9;
  let buffer = 0;
  let bits = 0;
  let position = 0;
  const read = (): number | null => {
    while (bits < width) {
      if (position >= packed.length) return null;
      const n = ALPHABET.indexOf(packed[position++]!);
      if (n < 0) throw new Error('Not suspend data');
      buffer |= n << bits;
      bits += 6;
    }
    const code = buffer & ((1 << width) - 1);
    buffer >>>= width;
    bits -= width;
    return code;
  };
  const first = read();
  if (first === null) return '';
  let previous = dict[first]!;
  let result = previous;
  // The compressor adds an entry (and may widen its codes) after writing each
  // code, the first included. The decoder learns that entry one code later, so
  // it counts entries separately from its dictionary, to read each code at the
  // width the compressor wrote it with.
  let next = 256;
  const grow = () => {
    if (next < 1 << 16) {
      next++;
      if (next > 1 << width && width < 16) width++;
    }
  };
  grow();
  for (;;) {
    const code = read();
    if (code === null) break;
    let entry: string;
    if (code < dict.length) entry = dict[code]!;
    else if (code === dict.length) entry = previous + previous[0]!;
    else throw new Error('Corrupt suspend data');
    result += entry;
    if (dict.length < 1 << 16) dict.push(previous + entry[0]!);
    grow();
    previous = entry;
  }
  return fromUtf8(Array.from(result, (ch) => ch.charCodeAt(0)));
}

// --------------------------------------------------------------- the size guard

export interface EncodedSession {
  text: string;
  /** What had to be left out to fit, in the order it was dropped. */
  dropped: string[];
}

/**
 * Encode a session for an LMS, within `limit` characters. If it does not fit,
 * leave out (in order) other slides' resume detail, the current slide's, the
 * visited list, and the variables. Completion and the current slide always stay.
 */
export function encodeSession(project: Project, state: SessionState, limit = 4096): EncodedSession {
  const data = compact(project, state);
  const pack = (value: Compact) => PREFIX + compress(JSON.stringify(value));
  const steps: [string, (value: Compact) => void][] = [
    [
      'other slides’ resume detail',
      (value) => {
        if (!value.r) return;
        const keep = value.s !== undefined ? value.r[value.s] : undefined;
        value.r = keep ? { [value.s!]: keep } : undefined;
        if (!value.r) delete value.r;
      },
    ],
    ['the current slide’s resume detail', (value) => delete value.r],
    ['the slides visited', (value) => delete value.b],
    ['variables', (value) => delete value.x],
    // Last of all: what the learner answered, which the score depends on, with the
    // draws, results and timers that go with it (P7.6, P7.7).
    [
      'question answers',
      (value) => {
        delete value.q;
        delete value.d;
        delete value.res;
        delete value.tm;
      },
    ],
  ];
  const dropped: string[] = [];
  let text = pack(data);
  for (const [name, drop] of steps) {
    if (text.length <= limit) break;
    const before = JSON.stringify(data);
    drop(data);
    if (JSON.stringify(data) === before) continue;
    dropped.push(name);
    text = pack(data);
  }
  return { text, dropped };
}

/** The session in suspend data, or null if there is none or it cannot be read. */
export function decodeSession(project: Project, text: string): SessionState | null {
  if (!text.startsWith(PREFIX)) return null;
  try {
    const data = JSON.parse(decompress(text.slice(PREFIX.length))) as Compact;
    if (typeof data !== 'object' || data === null || typeof data.k !== 'string') return null;
    return expand(project, data);
  } catch {
    return null;
  }
}

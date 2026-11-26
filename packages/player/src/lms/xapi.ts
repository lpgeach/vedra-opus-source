import type { ReportedStatus } from '@vedraopus/engine';
import type { LmsDriver, LmsInteraction } from './driver';
import { formatAnswer } from './driver';
import { scorm2004Time as isoDuration, scaledScore } from './scorm2004';
import { xapiActivityTypes, xapiVerbs } from './xapi-vocabulary';
import type { XapiVerb } from './xapi-vocabulary';

/** An xAPI Agent with exactly one identifier, as 1.0 requires. */
export interface XapiAgent {
  objectType: 'Agent';
  name?: string;
  mbox?: string;
  mbox_sha1sum?: string;
  openid?: string;
  account?: { homePage: string; name: string };
}

/** What the LMS passed in the course's address. */
export interface XapiLaunch {
  /** Ends with `/`. */
  endpoint: string;
  /** The `Authorization` header value; empty for none. */
  auth: string;
  actor: XapiAgent;
  registration?: string;
  activityId: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A random (version 4) UUID. `crypto.randomUUID` is missing on `file://` and plain `http`. */
export function uuid(crypto: Pick<Crypto, 'getRandomValues'>): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The first item of an older (0.9x) launch's arrays, or the value itself. */
const first = (value: unknown): unknown => (Array.isArray(value) ? value[0] : value);
const text = (value: unknown): string | undefined => {
  const v = first(value);
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
};

/**
 * The actor from a launch, in 1.0 form with exactly one identifier. Older
 * launches send `{"name":["…"],"mbox":["mailto:…"]}` and accounts as
 * `accountServiceHomePage` / `accountName`; those are accepted too.
 */
export function parseActor(json: string): XapiAgent | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const a = raw as Record<string, unknown>;
  const name = text(a['name']);
  const base: XapiAgent = { objectType: 'Agent', ...(name ? { name } : {}) };
  const mbox = text(a['mbox']);
  if (mbox) return { ...base, mbox: mbox.startsWith('mailto:') ? mbox : `mailto:${mbox}` };
  const sha = text(a['mbox_sha1sum']);
  if (sha) return { ...base, mbox_sha1sum: sha };
  const openid = text(a['openid']);
  if (openid) return { ...base, openid };
  const account = first(a['account']);
  if (typeof account === 'object' && account !== null) {
    const acc = account as Record<string, unknown>;
    const homePage = text(acc['homePage']) ?? text(acc['accountServiceHomePage']);
    const accountName = text(acc['name']) ?? text(acc['accountName']);
    if (homePage && accountName) return { ...base, account: { homePage, name: accountName } };
  }
  return null;
}

/** The launch details in a course address's query, or why tracking cannot start. */
export function parseLaunch(
  search: string,
  defaultActivityId: string,
  warn: (message: string) => void = () => undefined,
): XapiLaunch | { problem: string } {
  const query = new URLSearchParams(search);
  const endpoint = query.get('endpoint')?.trim();
  if (!endpoint) return { problem: 'No xAPI launch details (endpoint) were given' };
  const actor = parseActor(query.get('actor') ?? '');
  if (!actor) return { problem: 'The xAPI launch gave no usable learner (actor)' };
  const registration = query.get('registration')?.trim();
  if (registration && !UUID.test(registration)) {
    // Sending it would make the LRS refuse every statement.
    warn('The xAPI registration is not a UUID, so it is left out.');
  }
  return {
    endpoint: endpoint.endsWith('/') ? endpoint : `${endpoint}/`,
    auth: query.get('auth') ?? '',
    actor,
    ...(registration && UUID.test(registration) ? { registration } : {}),
    activityId: query.get('activity_id')?.trim() || defaultActivityId,
  };
}

/** What to do with a request's outcome: an HTTP status, or `null` when it never arrived. */
export function deliveryOutcome(status: number | null): 'done' | 'retry' | 'drop' {
  if (status === null || status === 429 || status >= 500) return 'retry';
  if (status >= 200 && status < 300) return 'done';
  // Any other answer will not change: the request is wrong, not the LRS busy.
  return 'drop';
}

/** Seconds before retry number `attempt` (from 0): 1, 2, 4, … at most 30. */
export const retryDelay = (attempt: number) => Math.min(30, 2 ** attempt);

export interface ReachedStatus {
  completion: 'completed' | 'incomplete';
  success: 'passed' | 'failed' | 'unknown';
}

/**
 * The status statements a change from `reached` to `next` calls for, and the
 * status reached after it. Completion, once reached, stays; a known result
 * is not forgotten when the course reports `unknown`.
 */
export function statusChange(
  reached: ReachedStatus,
  next: ReachedStatus,
): { verbs: ('completed' | 'passed' | 'failed')[]; reached: ReachedStatus } {
  const verbs: ('completed' | 'passed' | 'failed')[] = [];
  if (next.completion === 'completed' && reached.completion !== 'completed')
    verbs.push('completed');
  if (next.success !== 'unknown' && next.success !== reached.success) verbs.push(next.success);
  return {
    verbs,
    reached: {
      completion: reached.completion === 'completed' ? 'completed' : next.completion,
      success: next.success === 'unknown' ? reached.success : next.success,
    },
  };
}

/** The saved state document's id. */
export const STATE_ID = 'vedraopus.session';

export interface StateDocument {
  v: 1;
  data?: string;
  location?: string;
  status?: ReachedStatus;
}

/**
 * The saved state document, keeping only what has the expected shape. Anything
 * else (another tool's document, a damaged one) reads as nothing saved.
 */
export function readState(body: string): StateDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return { v: 1 };
  }
  if (typeof raw !== 'object' || raw === null || (raw as { v?: unknown }).v !== 1) return { v: 1 };
  const doc = raw as Record<string, unknown>;
  const status = doc['status'] as Partial<ReachedStatus> | undefined;
  const validStatus =
    typeof status === 'object' &&
    status !== null &&
    (status.completion === 'completed' || status.completion === 'incomplete') &&
    (status.success === 'passed' || status.success === 'failed' || status.success === 'unknown');
  return {
    v: 1,
    ...(typeof doc['data'] === 'string' ? { data: doc['data'] } : {}),
    ...(typeof doc['location'] === 'string' ? { location: doc['location'] } : {}),
    ...(validStatus
      ? { status: { completion: status.completion!, success: status.success! } }
      : {}),
  };
}

export interface XapiCourse {
  /** Used when the launch gives no activity id. */
  activityId: string;
  title: string;
}

export interface XapiDeps {
  fetch: (url: string, init: RequestInit) => Promise<{ status: number; text(): Promise<string> }>;
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  now: () => Date;
  crypto: Pick<Crypto, 'getRandomValues'>;
  search: string;
  /** Per-tab storage, for what must survive a reload (cmi5's one-use token). */
  session?: Pick<Storage, 'getItem' | 'setItem'> | null;
  /** How long to wait for the LRS at the start before giving up. */
  stateTimeoutMs?: number;
}

/** What a standard settles at the start, before any statement is sent. */
export interface LrsSession {
  /** The `Authorization` header value; empty for none. */
  auth: string;
  /** Merged into every statement's context (cmi5's `contextTemplate`). */
  contextTemplate?: Record<string, unknown>;
  /** Category activities for the statements the standard defines (cmi5). */
  definedCategory?: object;
  /** Added to completed, passed and failed (cmi5's `moveOn` category). */
  statusCategory?: object;
  /** No completed, passed or failed at all (cmi5's Browse and Review modes). */
  noStatusStatements?: boolean;
  /** Completing the course also passes it when no graded result exists (cmi5 `moveOn` that needs passing). */
  passOnCompletion?: boolean;
  /** Once passed, never failed (cmi5). */
  noFailAfterPass?: boolean;
  /** Where to go when the learner exits (cmi5's `returnURL`). */
  returnUrl?: string;
}

/** How one LRS-based standard starts: what it reads from the address and the LRS. */
export interface LrsProfile {
  /** In messages: "xAPI", "cmi5". */
  name: string;
  parseLaunch(
    search: string,
    defaultActivityId: string,
    warn: (message: string) => void,
  ): (XapiLaunch & { fetchUrl?: string }) | { problem: string };
  /** Get what the session needs, or why tracking cannot go ahead. */
  open(
    launch: XapiLaunch & { fetchUrl?: string },
    request: (url: string, init: RequestInit, auth: string) => Promise<LrsAnswer>,
    io: XapiDeps,
  ): Promise<LrsSession | { problem: string }>;
}

/** An LRS's answer, or `null` status when it never came. */
export interface LrsAnswer {
  status: number | null;
  text: string;
}

const ACTIVITY_LANG = 'en-US';

export const xapiProfile: LrsProfile = {
  name: 'xAPI',
  parseLaunch,
  open: async (launch) => ({ auth: launch.auth }),
};

/** A course reporting to the LRS its xAPI launch names. */
export const xapiDriver = (
  window: Window,
  warn: (message: string) => void,
  course: XapiCourse,
  deps: Partial<XapiDeps> = {},
) => lrsDriver(window, warn, course, xapiProfile, deps);

/** Merge context parts; arrays of context activities are joined, not replaced. */
function mergeContext(...parts: (Record<string, unknown> | undefined)[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const part of parts) {
    if (!part) continue;
    for (const [key, value] of Object.entries(part)) {
      if (key === 'contextActivities' || key === 'extensions') {
        const into = (out[key] ?? {}) as Record<string, unknown>;
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          into[k] =
            key === 'contextActivities'
              ? [...((into[k] as unknown[]) ?? []), ...(Array.isArray(v) ? v : [v])]
              : v;
        }
        out[key] = into;
      } else out[key] = value;
    }
  }
  return out;
}

export interface LrsDriver extends LmsDriver {
  /** Where to send the learner after they exit, if the LMS said. */
  exitUrl(): string | null;
}

export function lrsDriver(
  window: Window,
  warn: (message: string) => void,
  course: XapiCourse,
  profile: LrsProfile,
  deps: Partial<XapiDeps> = {},
): LrsDriver {
  const io: XapiDeps = {
    fetch: deps.fetch ?? ((url, init) => window.fetch(url, init)),
    setTimeout: deps.setTimeout ?? ((run, ms) => window.setTimeout(run, ms)),
    clearTimeout: deps.clearTimeout ?? ((handle) => window.clearTimeout(handle as number)),
    now: deps.now ?? (() => new Date()),
    crypto: deps.crypto ?? window.crypto,
    search: deps.search ?? window.location.search,
    session:
      deps.session !== undefined
        ? deps.session
        : (() => {
            try {
              return window.sessionStorage;
            } catch {
              return null;
            }
          })(),
    ...(deps.stateTimeoutMs !== undefined ? { stateTimeoutMs: deps.stateTimeoutMs } : {}),
  };
  let launch: (XapiLaunch & { fetchUrl?: string }) | null = null;
  let session: LrsSession = { auth: '' };
  let connected = false;
  /** False when the saved state could not be read: then it is never overwritten. */
  let stateWritable = false;
  let saved: StateDocument = { v: 1 };
  let reached: ReachedStatus = { completion: 'incomplete', success: 'unknown' };
  let suspendData = '';
  let bookmark = '';
  let stateDirty = false;
  let score: { scaled?: number; raw: number; min: number; max: number } | null = null;
  let startedAt = 0;
  const queue: object[] = [];
  let sending = false;
  let attempt = 0;
  let retryTimer: unknown = null;

  const headers = (auth = session.auth): Record<string, string> => ({
    'X-Experience-API-Version': '1.0.3',
    'Content-Type': 'application/json',
    ...(auth ? { Authorization: auth } : {}),
  });

  const courseActivity = () => ({
    objectType: 'Activity',
    id: launch!.activityId,
    definition: { name: { [ACTIVITY_LANG]: course.title }, type: xapiActivityTypes.course },
  });

  const statement = (
    verb: XapiVerb,
    object: object,
    extra: { result?: object; parent?: boolean; defined?: boolean; status?: boolean } = {},
  ) => {
    const categories = [
      ...(extra.defined && session.definedCategory ? [session.definedCategory] : []),
      ...(extra.status && session.statusCategory ? [session.statusCategory] : []),
    ];
    const context = mergeContext(
      session.contextTemplate,
      launch!.registration ? { registration: launch!.registration } : undefined,
      extra.parent
        ? { contextActivities: { parent: [{ objectType: 'Activity', id: launch!.activityId }] } }
        : undefined,
      categories.length ? { contextActivities: { category: categories } } : undefined,
    );
    queue.push({
      id: uuid(io.crypto),
      timestamp: io.now().toISOString(),
      actor: launch!.actor,
      verb,
      object,
      ...(extra.result ? { result: extra.result } : {}),
      ...(Object.keys(context).length ? { context } : {}),
    });
  };

  /** Seconds since tracking started, as an ISO 8601 duration. */
  const elapsed = () => isoDuration((io.now().getTime() - startedAt) / 1000);

  const stateUrl = (stateId = STATE_ID) => {
    const query = new URLSearchParams({
      activityId: launch!.activityId,
      agent: JSON.stringify(launch!.actor),
      stateId,
      ...(launch!.registration ? { registration: launch!.registration } : {}),
    });
    return `${launch!.endpoint}activities/state?${query}`;
  };

  const stateBody = (): string =>
    JSON.stringify({
      v: 1,
      ...(suspendData ? { data: suspendData } : {}),
      ...(bookmark ? { location: bookmark } : {}),
      status: reached,
    } satisfies StateDocument);

  /** One request with a time limit, for the start, when waiting holds the learner up. */
  const ask = async (url: string, init: RequestInit, auth: string): Promise<LrsAnswer> => {
    const controller = new AbortController();
    const timer = io.setTimeout(() => controller.abort(), io.stateTimeoutMs ?? 8000);
    try {
      const response = await io.fetch(url, {
        ...init,
        headers: { ...headers(auth), ...(init.headers as Record<string, string> | undefined) },
        signal: controller.signal,
      });
      return { status: response.status, text: await response.text() };
    } catch {
      return { status: null, text: '' };
    } finally {
      io.clearTimeout(timer);
    }
  };

  const request = async (url: string, init: RequestInit): Promise<number | null> => {
    try {
      return (await io.fetch(url, { ...init, headers: headers() })).status;
    } catch {
      return null;
    }
  };

  /** Send what is queued, then the state, one request at a time; retry later on failure. */
  const flush = async () => {
    if (sending || retryTimer !== null || !connected) return;
    sending = true;
    try {
      while (queue.length > 0 || (stateDirty && stateWritable)) {
        if (queue.length > 0) {
          const batch = queue.slice();
          const outcome = deliveryOutcome(
            await request(`${launch!.endpoint}statements`, {
              method: 'POST',
              body: JSON.stringify(batch),
            }),
          );
          if (outcome === 'retry') return later();
          queue.splice(0, batch.length);
          if (outcome === 'drop')
            warn(`The LRS refused ${batch.length} statement(s); they were not recorded.`);
        } else {
          stateDirty = false;
          const outcome = deliveryOutcome(
            await request(stateUrl(), { method: 'PUT', body: stateBody() }),
          );
          if (outcome === 'retry') {
            stateDirty = true;
            return later();
          }
          if (outcome === 'drop') warn('The LRS refused to save progress.');
        }
      }
      attempt = 0;
    } finally {
      sending = false;
    }
  };
  const later = () => {
    retryTimer = io.setTimeout(
      () => {
        retryTimer = null;
        void flush();
      },
      retryDelay(attempt++) * 1000,
    );
  };

  return {
    // The State API has no fixed limit; this keeps the last save on leaving
    // well inside what browsers send for a closing page (about 64 KB).
    suspendLimit: 32000,
    init() {
      const parsed = profile.parseLaunch(io.search, course.activityId, warn);
      if ('problem' in parsed) {
        warn(`${parsed.problem}, so this course is not being tracked.`);
        return false;
      }
      launch = parsed;
      connected = true;
      return true;
    },
    async ready() {
      if (!connected) return;
      const opened = await profile.open(launch!, ask, io);
      if ('problem' in opened) {
        warn(`${opened.problem}, so this course is not being tracked.`);
        connected = false;
        return;
      }
      session = opened;
      const answer = await ask(stateUrl(), { method: 'GET' }, session.auth);
      if (answer.status === 200) {
        const doc = readState(answer.text);
        saved = doc;
        suspendData = doc.data ?? '';
        bookmark = doc.location ?? '';
        if (doc.status) reached = doc.status;
        stateWritable = true;
      } else if (answer.status === 404) {
        stateWritable = true;
      } else if (answer.status === null) {
        warn('The LRS did not return saved progress in time; starting afresh.');
      } else {
        warn(`The LRS would not return saved progress (${answer.status}); starting afresh.`);
      }
      startedAt = io.now().getTime();
      statement(xapiVerbs.initialized, courseActivity(), { defined: true });
      void flush();
    },
    isResuming: () => typeof saved.data === 'string' && saved.data !== '',
    getBookmark: () => bookmark,
    setBookmark(location) {
      if (location !== bookmark) stateDirty = true;
      bookmark = location;
    },
    getSuspendData: () => suspendData,
    setSuspendData(data) {
      if (data !== suspendData) stateDirty = true;
      suspendData = data;
    },
    setStatus(status: ReportedStatus) {
      if (!connected) return;
      let next: ReachedStatus = { completion: status.completion, success: status.success };
      if (session.passOnCompletion && next.completion === 'completed' && next.success === 'unknown')
        next = { ...next, success: 'passed' };
      if (session.noFailAfterPass && reached.success === 'passed' && next.success === 'failed')
        next = { ...next, success: 'passed' };
      const change = statusChange(reached, next);
      if (JSON.stringify(change.reached) !== JSON.stringify(reached)) stateDirty = true;
      reached = change.reached;
      if (session.noStatusStatements) return;
      for (const verb of change.verbs) {
        statement(xapiVerbs[verb], courseActivity(), {
          defined: true,
          status: true,
          result: {
            ...(verb === 'completed' ? { completion: true } : { success: verb === 'passed' }),
            ...(score && verb !== 'completed' ? { score } : {}),
            ...(session.definedCategory ? { duration: elapsed() } : {}),
          },
        });
      }
    },
    setScore(raw, min, max) {
      const scaled = scaledScore(raw, min, max);
      score = { ...(scaled !== null ? { scaled } : {}), raw, min, max };
    },
    recordInteraction(interaction: LmsInteraction) {
      if (!connected) return;
      statement(
        xapiVerbs.answered,
        {
          objectType: 'Activity',
          id: `${launch!.activityId}/interactions/${encodeURIComponent(interaction.id)}`,
          definition: {
            type: xapiActivityTypes.interaction,
            interactionType: interaction.type,
            ...(interaction.correct !== undefined
              ? { correctResponsesPattern: [formatAnswer(interaction.correct, 'scorm2004')] }
              : {}),
          },
        },
        {
          parent: true,
          result: {
            // xAPI writes responses as SCORM 2004 does.
            response: formatAnswer(interaction.response, 'scorm2004'),
            ...(interaction.result === 'correct' || interaction.result === 'wrong'
              ? { success: interaction.result === 'correct' }
              : {}),
            ...(interaction.latency !== undefined
              ? { duration: isoDuration(interaction.latency) }
              : {}),
          },
        },
      );
    },
    slideEntered(slide) {
      if (!connected) return;
      statement(
        xapiVerbs.experienced,
        {
          objectType: 'Activity',
          id: `${launch!.activityId}/slides/${encodeURIComponent(slide.id)}`,
          definition: {
            name: { [ACTIVITY_LANG]: slide.title || `Slide ${slide.index + 1}` },
            type: xapiActivityTypes.slide,
          },
        },
        { parent: true },
      );
    },
    commit() {
      void flush();
    },
    terminate(sessionSeconds, complete) {
      if (!connected) return;
      statement(xapiVerbs.terminated, courseActivity(), {
        defined: true,
        result: { duration: isoDuration(sessionSeconds), completion: complete },
      });
      connected = false;
      if (retryTimer !== null) io.clearTimeout(retryTimer);
      // The page is closing: hand everything to the browser to finish sending.
      // Repeating statements a request still in flight carries is safe: same ids.
      void io
        .fetch(`${launch!.endpoint}statements`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify(queue.splice(0)),
          keepalive: true,
        })
        .catch(() => undefined);
      if (stateWritable && stateDirty) {
        void io
          .fetch(stateUrl(), {
            method: 'PUT',
            headers: headers(),
            body: stateBody(),
            keepalive: true,
          })
          .catch(() => undefined);
      }
    },
    exitUrl: () => session.returnUrl ?? null,
  };
}

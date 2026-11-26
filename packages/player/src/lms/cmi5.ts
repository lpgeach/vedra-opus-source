import { lrsDriver, parseActor } from './xapi';
import type { LrsProfile, LrsSession, XapiCourse, XapiDeps, XapiLaunch } from './xapi';

/** cmi5's category activities (cmi5 section 9.6.2). */
export const CMI5_CATEGORY = {
  objectType: 'Activity',
  id: 'https://w3id.org/xapi/cmi5/context/categories/cmi5',
};
export const MOVEON_CATEGORY = {
  objectType: 'Activity',
  id: 'https://w3id.org/xapi/cmi5/context/categories/moveon',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the LMS passes in a cmi5 launch address. All five are required. */
export function parseCmi5Launch(
  search: string,
  defaultActivityId: string,
): (XapiLaunch & { fetchUrl: string }) | { problem: string } {
  const query = new URLSearchParams(search);
  const endpoint = query.get('endpoint')?.trim();
  const fetchUrl = query.get('fetch')?.trim();
  const registration = query.get('registration')?.trim();
  const activityId = query.get('activityId')?.trim();
  if (!endpoint || !fetchUrl)
    return { problem: 'No cmi5 launch details (endpoint, fetch) were given' };
  const actor = parseActor(query.get('actor') ?? '');
  if (!actor) return { problem: 'The cmi5 launch gave no usable learner (actor)' };
  if (!registration || !UUID.test(registration))
    return { problem: 'The cmi5 launch gave no registration' };
  return {
    endpoint: endpoint.endsWith('/') ? endpoint : `${endpoint}/`,
    fetchUrl,
    auth: '',
    actor,
    registration,
    activityId: activityId || defaultActivityId,
  };
}

/** The parts of `LMS.LaunchData` the course uses (cmi5 section 10). */
export interface Cmi5LaunchData {
  contextTemplate: Record<string, unknown>;
  launchMode: 'Normal' | 'Browse' | 'Review';
  moveOn: string;
  returnURL?: string;
  masteryScore?: number;
}

/** `LMS.LaunchData`, or why it cannot be used. */
export function readLaunchData(text: string): Cmi5LaunchData | { problem: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { problem: 'The LMS launch data is not JSON' };
  }
  if (typeof raw !== 'object' || raw === null) return { problem: 'The LMS launch data is empty' };
  const doc = raw as Record<string, unknown>;
  const template = doc['contextTemplate'];
  if (typeof template !== 'object' || template === null || Array.isArray(template))
    return { problem: 'The LMS launch data has no context template' };
  const mode = doc['launchMode'];
  if (mode !== 'Normal' && mode !== 'Browse' && mode !== 'Review')
    return { problem: 'The LMS launch data has no launch mode' };
  return {
    contextTemplate: template as Record<string, unknown>,
    launchMode: mode,
    moveOn: typeof doc['moveOn'] === 'string' ? doc['moveOn'] : 'NotApplicable',
    ...(typeof doc['returnURL'] === 'string' && doc['returnURL']
      ? { returnURL: doc['returnURL'] }
      : {}),
    ...(typeof doc['masteryScore'] === 'number' ? { masteryScore: doc['masteryScore'] } : {}),
  };
}

const tokenKey = (fetchUrl: string) => `vedraopus.cmi5.token:${fetchUrl}`;

/** The token this tab already traded the fetch URL for, if any. */
function storedToken(io: XapiDeps, fetchUrl: string): string | null {
  try {
    return io.session?.getItem(tokenKey(fetchUrl)) ?? null;
  } catch {
    return null;
  }
}

/** A JSON object's properties; anything else reads as none. */
function jsonObject(text: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const cmi5Profile: LrsProfile = {
  name: 'cmi5',
  parseLaunch: (search, defaultActivityId) => parseCmi5Launch(search, defaultActivityId),
  async open(launch, ask, io) {
    // The fetch URL answers once. A reload of the same launch reuses the
    // token, kept for this tab only.
    const fetchUrl = launch.fetchUrl!;
    let token = storedToken(io, fetchUrl);
    if (!token) {
      const answer = await ask(fetchUrl, { method: 'POST' }, '');
      const body = jsonObject(answer.text);
      const got = body['auth-token'];
      if (answer.status !== 200 || typeof got !== 'string' || !got) {
        const why = typeof body['error-text'] === 'string' ? `: ${body['error-text']}` : '';
        return { problem: `The LMS gave no access token${why}` };
      }
      token = got;
      try {
        io.session?.setItem(tokenKey(fetchUrl), token);
      } catch {
        // Without storage a reload cannot continue tracking; this visit still can.
      }
    }
    const auth = `Basic ${token}`;
    const query = new URLSearchParams({
      activityId: launch.activityId,
      agent: JSON.stringify(launch.actor),
      stateId: 'LMS.LaunchData',
      registration: launch.registration!,
    });
    const answer = await ask(
      `${launch.endpoint}activities/state?${query}`,
      { method: 'GET' },
      auth,
    );
    if (answer.status !== 200)
      return { problem: `The LMS launch data could not be read (${answer.status ?? 'no answer'})` };
    const data = readLaunchData(answer.text);
    if ('problem' in data) return data;
    return {
      auth,
      contextTemplate: data.contextTemplate,
      definedCategory: CMI5_CATEGORY,
      statusCategory: MOVEON_CATEGORY,
      noStatusStatements: data.launchMode !== 'Normal',
      // These criteria are met only by a passed statement. With no graded
      // result, completing the course counts as passing it (as P5.1 reports).
      passOnCompletion: data.moveOn === 'Passed' || data.moveOn === 'CompletedAndPassed',
      noFailAfterPass: true,
      ...(data.returnURL ? { returnUrl: data.returnURL } : {}),
    } satisfies LrsSession;
  },
};

/** A course launched by a cmi5 LMS, reporting as an assignable unit. */
export const cmi5Driver = (
  window: Window,
  warn: (message: string) => void,
  course: XapiCourse,
  deps: Partial<XapiDeps> = {},
) => lrsDriver(window, warn, course, cmi5Profile, deps);

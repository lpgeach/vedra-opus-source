import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IRI = /^[A-Za-z][A-Za-z0-9+.-]*:[^\s]+$/;
const DURATION = /^P(?!$)(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function checkLanguageMap(where: string, value: unknown, problems: string[]) {
  if (!isObject(value) || Object.keys(value).length === 0)
    problems.push(`${where} is not a language map`);
  else
    for (const v of Object.values(value))
      if (typeof v !== 'string') problems.push(`${where} has a non-string`);
}

function checkActivity(where: string, value: unknown, problems: string[]) {
  if (!isObject(value)) return void problems.push(`${where} is not an object`);
  if (value['objectType'] !== 'Activity') problems.push(`${where}.objectType is not Activity`);
  if (typeof value['id'] !== 'string' || !IRI.test(value['id']))
    problems.push(`${where}.id is not an IRI`);
  const definition = value['definition'];
  if (definition !== undefined) {
    if (!isObject(definition)) return void problems.push(`${where}.definition is not an object`);
    if (definition['name'] !== undefined)
      checkLanguageMap(`${where}.definition.name`, definition['name'], problems);
    if (definition['type'] !== undefined && !IRI.test(String(definition['type'])))
      problems.push(`${where}.definition.type is not an IRI`);
  }
}

/** What is wrong with an Agent, as xAPI 1.0.3 defines it. */
export function checkAgent(where: string, value: unknown, problems: string[]) {
  if (!isObject(value)) return void problems.push(`${where} is not an object`);
  if (value['objectType'] !== undefined && value['objectType'] !== 'Agent')
    problems.push(`${where}.objectType is not Agent`);
  const ifis = ['mbox', 'mbox_sha1sum', 'openid', 'account'].filter((k) => value[k] !== undefined);
  if (ifis.length !== 1) problems.push(`${where} has ${ifis.length} identifiers, not exactly one`);
  if (value['mbox'] !== undefined && !String(value['mbox']).startsWith('mailto:'))
    problems.push(`${where}.mbox is not a mailto: IRI`);
  const account = value['account'];
  if (
    account !== undefined &&
    (!isObject(account) ||
      typeof account['homePage'] !== 'string' ||
      typeof account['name'] !== 'string')
  )
    problems.push(`${where}.account needs homePage and name`);
}

/** What is wrong with a statement, as xAPI 1.0.3 defines it (the parts a course sends). */
export function checkStatement(s: unknown): string[] {
  const problems: string[] = [];
  if (!isObject(s)) return ['statement is not an object'];
  const allowed = ['id', 'actor', 'verb', 'object', 'result', 'context', 'timestamp'];
  for (const key of Object.keys(s))
    if (!allowed.includes(key)) problems.push(`unexpected property ${key}`);
  if (typeof s['id'] !== 'string' || !UUID.test(s['id'])) problems.push('id is not a UUID');
  if (typeof s['timestamp'] !== 'string' || !TIMESTAMP.test(s['timestamp']))
    problems.push('timestamp is not ISO 8601');
  checkAgent('actor', s['actor'], problems);
  const verb = s['verb'];
  if (!isObject(verb) || typeof verb['id'] !== 'string' || !IRI.test(verb['id']))
    problems.push('verb.id is not an IRI');
  else checkLanguageMap('verb.display', verb['display'], problems);
  checkActivity('object', s['object'], problems);
  const result = s['result'];
  if (result !== undefined) {
    if (!isObject(result)) problems.push('result is not an object');
    else {
      if (result['duration'] !== undefined && !DURATION.test(String(result['duration'])))
        problems.push('result.duration is not ISO 8601');
      for (const flag of ['success', 'completion'])
        if (result[flag] !== undefined && typeof result[flag] !== 'boolean')
          problems.push(`result.${flag} is not a boolean`);
      const score = result['score'];
      if (
        isObject(score) &&
        score['scaled'] !== undefined &&
        (Number(score['scaled']) < -1 || Number(score['scaled']) > 1)
      )
        problems.push('result.score.scaled is outside -1…1');
    }
  }
  const context = s['context'];
  if (context !== undefined) {
    if (!isObject(context)) problems.push('context is not an object');
    else {
      if (context['registration'] !== undefined && !UUID.test(String(context['registration'])))
        problems.push('context.registration is not a UUID');
      const activities = context['contextActivities'];
      if (activities !== undefined) {
        if (!isObject(activities)) problems.push('context.contextActivities is not an object');
        else
          for (const [kind, list] of Object.entries(activities)) {
            if (!Array.isArray(list))
              problems.push(`context.contextActivities.${kind} is not an array`);
            else
              list.forEach((a, i) =>
                checkActivity(`context.contextActivities.${kind}[${i}]`, a, problems),
              );
          }
      }
    }
  }
  return problems;
}

const body = (request: IncomingMessage) =>
  new Promise<string>((done) => {
    let text = '';
    request.on('data', (chunk: Buffer) => (text += chunk.toString('utf8')));
    request.on('end', () => done(text));
  });

/**
 * A stand-in LRS on its own port (so the course makes real cross-origin
 * requests, preflight included). It checks the auth and version headers and
 * every statement, keeps statements (once per id, like an LRS) and state
 * documents, and can be told to fail the next statement requests.
 */
export async function startMockLrs(auth: string) {
  const statements: Json[] = [];
  const problems: string[] = [];
  const state = new Map<string, string>();
  const log: string[] = [];
  let failNext = 0;
  let preflights = 0;
  /** cmi5 fetch URLs handed out, and whether each has been used. */
  const fetchUsed = new Map<string, boolean>();
  let fetches = 0;
  /** The token a cmi5 fetch URL trades for: the auth this LRS expects, without "Basic ". */
  const token = auth.replace(/^Basic /, '');

  /** A state document's key; the agent compared by content, not by its JSON text. */
  const stateKey = (q: {
    activityId: string;
    agent: string;
    stateId: string;
    registration?: string;
  }) => {
    let agent = q.agent;
    try {
      const parsed = JSON.parse(q.agent) as Json;
      agent = JSON.stringify(
        Object.fromEntries(Object.entries(parsed).sort(([a], [b]) => a.localeCompare(b))),
      );
    } catch {
      // Left as given; the request is refused below anyway.
    }
    return [q.activityId, agent, q.stateId, q.registration ?? ''].join('|');
  };

  const reply = (
    request: IncomingMessage,
    response: ServerResponse,
    status: number,
    text = '',
    type = 'application/json',
  ) => {
    response.writeHead(status, {
      'Access-Control-Allow-Origin': request.headers.origin ?? '*',
      'X-Experience-API-Version': '1.0.3',
      ...(text ? { 'Content-Type': type } : {}),
    });
    response.end(text);
  };

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://lrs');
    if (request.method === 'OPTIONS') {
      preflights++;
      response.writeHead(204, {
        'Access-Control-Allow-Origin': request.headers.origin ?? '*',
        'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Experience-API-Version',
        'Access-Control-Max-Age': '0',
      });
      return void response.end();
    }
    const text = await body(request);
    log.push(`${request.method} ${url.pathname}`);
    // cmi5: the launch's fetch URL, answered once, with no Authorization.
    if (url.pathname.startsWith('/fetch/') && request.method === 'POST') {
      fetches++;
      if (!fetchUsed.has(url.pathname)) {
        problems.push(`unknown fetch URL ${url.pathname}`);
        return reply(request, response, 404);
      }
      if (fetchUsed.get(url.pathname)) {
        return reply(
          request,
          response,
          200,
          JSON.stringify({ 'error-code': '1', 'error-text': 'Already used' }),
        );
      }
      fetchUsed.set(url.pathname, true);
      return reply(request, response, 200, JSON.stringify({ 'auth-token': token }));
    }
    if (request.headers.authorization !== auth) {
      problems.push(`${request.method} ${url.pathname}: wrong Authorization`);
      return reply(request, response, 401);
    }
    if (!String(request.headers['x-experience-api-version'] ?? '').startsWith('1.0')) {
      problems.push(`${request.method} ${url.pathname}: no X-Experience-API-Version`);
      return reply(request, response, 400);
    }

    if (url.pathname === '/xapi/statements' && request.method === 'POST') {
      if (failNext > 0) {
        failNext--;
        return reply(request, response, 503);
      }
      const parsed = JSON.parse(text) as unknown;
      const batch = Array.isArray(parsed) ? parsed : [parsed];
      for (const s of batch) {
        const issues = checkStatement(s);
        if (issues.length)
          problems.push(...issues.map((p) => `statement ${(s as Json)['id']}: ${p}`));
      }
      if (batch.some((s) => checkStatement(s).length > 0)) return reply(request, response, 400);
      for (const s of batch as Json[]) {
        const existing = statements.find((t) => t['id'] === s['id']);
        if (existing && JSON.stringify(existing) !== JSON.stringify(s))
          return reply(request, response, 409);
      }
      for (const s of batch as Json[])
        if (!statements.some((t) => t['id'] === s['id'])) statements.push(s);
      return reply(request, response, 200, JSON.stringify(batch.map((s) => (s as Json)['id'])));
    }

    if (url.pathname === '/xapi/activities/state') {
      const activityId = url.searchParams.get('activityId');
      const stateId = url.searchParams.get('stateId');
      const agentProblems: string[] = [];
      try {
        checkAgent('agent', JSON.parse(url.searchParams.get('agent') ?? ''), agentProblems);
      } catch {
        agentProblems.push('agent is not JSON');
      }
      if (!activityId || !IRI.test(activityId) || !stateId || agentProblems.length) {
        problems.push(
          `state request: ${[...agentProblems, 'activityId and stateId are required'].join('; ')}`,
        );
        return reply(request, response, 400);
      }
      const registration = url.searchParams.get('registration');
      const key = stateKey({
        activityId,
        agent: url.searchParams.get('agent') ?? '',
        stateId,
        ...(registration ? { registration } : {}),
      });
      if (request.method === 'GET') {
        const saved = state.get(key);
        return saved === undefined
          ? reply(request, response, 404)
          : reply(request, response, 200, saved);
      }
      if (request.method === 'PUT') {
        state.set(key, text);
        return reply(request, response, 204);
      }
    }
    problems.push(`unexpected ${request.method} ${url.pathname}`);
    reply(request, response, 404);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done()));
  return {
    endpoint: `http://127.0.0.1:${(server.address() as { port: number }).port}/xapi/`,
    statements,
    problems,
    state,
    log,
    get preflights() {
      return preflights;
    },
    failStatements(count: number) {
      failNext = count;
    },
    /** A one-use cmi5 fetch URL. */
    fetchUrl() {
      const path = `/fetch/${fetchUsed.size + 1}`;
      fetchUsed.set(path, false);
      return `http://127.0.0.1:${(server.address() as { port: number }).port}${path}`;
    },
    get fetches() {
      return fetches;
    },
    /** Leave a state document, as an LMS leaves cmi5's LMS.LaunchData. */
    putState(
      q: { activityId: string; agent: object; stateId: string; registration?: string },
      doc: object,
    ) {
      state.set(stateKey({ ...q, agent: JSON.stringify(q.agent) }), JSON.stringify(doc));
    },
    /** A state document saved under this id, parsed. */
    stateDocument(stateId: string): Json | undefined {
      for (const [key, text] of state)
        if (key.split('|')[2] === stateId) return JSON.parse(text) as Json;
      return undefined;
    },
    reset() {
      statements.length = 0;
      problems.length = 0;
      log.length = 0;
      state.clear();
      failNext = 0;
      fetches = 0;
    },
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
}

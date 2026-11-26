import { parseProject } from '@vedraopus/model';
import type { Project } from '@vedraopus/model';
import type { Page } from '@playwright/test';
import {
  cpSync,
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import type { WebPublishOptions } from '../src/index';

const root = join(import.meta.dirname, '../../..');
const fixture = join(root, 'fixtures/projects/two-slides');
const dist = join(root, 'packages/player/dist');

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.xml': 'application/xml',
  '.xsd': 'application/xml',
};

/** The opening of a mock LMS page: records calls in `window.lms`, opens the course in a frame. */
export const MOCK_LMS_COMMON = `
window.lms = { calls: [], store: {}, finished: false };
function record(name, args, result) { window.lms.calls.push([name].concat(args, [result])); return result; }
window.openCourse = function (store) {
  window.lms.store = store; window.lms.calls = []; window.lms.finished = false;
  var frame = document.createElement('iframe');
  frame.src = 'course/index.html';
  frame.style.cssText = 'border:0;width:1000px;height:700px';
  document.body.appendChild(frame);
};
window.closeCourse = function () { document.querySelector('iframe').remove(); };
`;

export const mockLmsPage = (api: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>Mock LMS</title></head>
<body style="margin:0"><script>${MOCK_LMS_COMMON}${api}</script></body></html>`;

/**
 * A stand-in SCORM 2004 LMS's API for `mockLmsPage`: `API_1484_11` behaving
 * as 2004's does. Calls before `Initialize` or after `Terminate` fail with
 * 122/132/142, and `cmi.location` over 1,000 characters is refused.
 */
export const SCORM2004_API = `
window.lms.state = 'not initialized';
var lastError = '0';
function ok(name, args) { lastError = '0'; return record(name, args, 'true'); }
function fail(name, args, code) { lastError = code; return record(name, args, 'false'); }
window.API_1484_11 = {
  Initialize: function (a) {
    if (window.lms.state !== 'not initialized') return fail('Initialize', [a], '103');
    window.lms.state = 'running'; return ok('Initialize', [a]);
  },
  Terminate: function (a) {
    if (window.lms.state !== 'running') return fail('Terminate', [a], '112');
    window.lms.state = 'terminated'; window.lms.finished = true; return ok('Terminate', [a]);
  },
  GetValue: function (e) {
    if (window.lms.state !== 'running') { lastError = '122'; return record('GetValue', [e], ''); }
    lastError = '0'; var v = window.lms.store[e]; return record('GetValue', [e], v === undefined ? '' : v);
  },
  SetValue: function (e, v) {
    if (window.lms.state !== 'running') return fail('SetValue', [e, v], '132');
    if (e === 'cmi.location' && String(v).length > 1000) return fail('SetValue', [e, v], '405');
    window.lms.store[e] = String(v); return ok('SetValue', [e, v]);
  },
  Commit: function (a) {
    if (window.lms.state !== 'running') return fail('Commit', [a], '142');
    return ok('Commit', [a]);
  },
  GetLastError: function () { return lastError; },
  GetErrorString: function (c) { return 'error ' + c; },
  GetDiagnostic: function () { return ''; }
};
var reopen = window.openCourse;
window.openCourse = function (store) { reopen(store); window.lms.state = 'not initialized'; };
`;

type Publisher = (
  project: Project,
  options: Pick<WebPublishOptions, 'player' | 'readAsset' | 'write'>,
) => Promise<unknown>;

/**
 * Publish the two-slide fixture with `publisher` into `course/` beside the
 * mock LMS page, and serve both over HTTP so the course frame and the LMS
 * share an origin, as in a real LMS.
 */
export async function servePackage(publisher: Publisher, lmsPage: string) {
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-lms-'));
  const course = join(work, 'course');
  const project = parseProject(JSON.parse(readFileSync(join(fixture, 'project.json'), 'utf8')));
  await publisher(project, {
    player: {
      js: readFileSync(join(dist, 'player.js'), 'utf8'),
      css: readFileSync(join(dist, 'player.css'), 'utf8'),
    },
    readAsset: async (hash, meta) => readFileSync(join(fixture, 'assets', `${hash}.${meta.ext}`)),
    write: async (path, data) => {
      const file = join(course, path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, data);
    },
  });
  return serveWork(work, lmsPage);
}

/** Serve an already-published course at `course/`, beside the mock LMS page at `lms.html`. */
export async function serveFolder(courseFolder: string, lmsPage: string) {
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-lms-'));
  cpSync(courseFolder, join(work, 'course'), { recursive: true });
  return serveWork(work, lmsPage);
}

async function serveWork(work: string, lmsPage: string) {
  const course = join(work, 'course');
  writeFileSync(join(work, 'lms.html'), lmsPage);
  const server = createServer((request, response) => {
    const path = decodeURIComponent((request.url ?? '/').split('?')[0]!);
    const file = resolve(work, `.${path}`);
    if (!file.startsWith(resolve(work) + sep) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(response);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done()));
  return {
    base: `http://127.0.0.1:${(server.address() as { port: number }).port}/`,
    read: (path: string) => readFileSync(join(course, path), 'utf8'),
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
}

export type Call = [string, ...string[]];

export const calls = (page: Page) =>
  page.evaluate(() => (window as unknown as { lms: { calls: Call[] } }).lms.calls);

export const store = (page: Page) =>
  page.evaluate(() => (window as unknown as { lms: { store: Record<string, string> } }).lms.store);

/** The values written to `element`, in order, by the API's set call `setter`. */
export const sets = (list: Call[], setter: string, element: string) =>
  list.filter((call) => call[0] === setter && call[1] === element).map((call) => call[2]);

export async function openCourse(page: Page, base: string, start: Record<string, string>) {
  await page.goto(`${base}lms.html`);
  await page.evaluate(
    (s) => (window as unknown as { openCourse(s: unknown): void }).openCourse(s),
    start,
  );
  return page.frameLocator('iframe');
}

export const closeCourse = (page: Page) =>
  page.evaluate(() => (window as unknown as { closeCourse(): void }).closeCourse());

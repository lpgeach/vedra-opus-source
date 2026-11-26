/**
 * Preview: the real player, fed the same files Publish writes, in a window of
 * its own that has no preload and so no way to reach the editor or the OS.
 * The files are held in memory and served from `vedraopus-preview://<token>/`.
 */
import { BrowserWindow, session, shell } from 'electron';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { publishWeb, scopeProject } from '@vedraopus/publish';
import type { GraphicLibrary, PreviewScope } from '@vedraopus/publish';
import type { Project } from '@vedraopus/model';
import { mimeTypeForExtension, RESOURCE_EXTENSIONS } from './project/assets';
import { assetPath } from './project/paths';
import { PREVIEW_SCHEME } from './project/protocol';
import { parseRange } from './project/range';

export const PREVIEW_PARTITION = 'vedraopus-preview';
const PARTITION = PREVIEW_PARTITION;

const TEXT_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
};

/**
 * Only what the course itself needs: its own files, inline script and style,
 * and running the author's "execute JavaScript" triggers (hence 'unsafe-eval').
 * The window has no bridge to the editor or the OS, so that code reaches
 * nothing outside the course, and it cannot fetch anything.
 */
const CSP =
  "default-src 'self' 'unsafe-inline' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; form-action 'none'";

/**
 * The bar above the previewed course. Its buttons navigate to action
 * addresses, which the main process intercepts; the page has no other channel.
 */
const TOOLBAR = `
<style>
#course{height:calc(100% - 36px)!important}
#vo-preview-bar{box-sizing:border-box;height:36px;display:flex;gap:8px;align-items:center;padding:0 12px;background:#0b0f12;color:#f0f0f3;font:13px system-ui,sans-serif}
#vo-preview-bar span{flex:1}
#vo-preview-bar button{padding:3px 12px;border:1px solid #5c6670;border-radius:4px;background:#2b3138;color:inherit;font:inherit;cursor:pointer}
</style>
<script>
(function () {
  var bar = document.createElement('div');
  bar.id = 'vo-preview-bar';
  var label = document.createElement('span');
  label.textContent = 'Preview';
  bar.appendChild(label);
  function button(text, action) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.addEventListener('click', function () {
      var engine = window.VEDRAOPUS_PLAYER.engine;
      var view = engine ? engine.getView() : { slideId: null };
      location.href = '/__action/' + action + '?slide=' + encodeURIComponent(view.slideId || '');
    });
    bar.appendChild(b);
  }
  button('Replay', 'replay');
  button('Edit', 'edit');
  button('Close', 'close');
  document.body.insertBefore(bar, document.body.firstChild);
})();
</script>
`;

/**
 * The course file a preview window asked to open (Phase 8 review): one of its
 * own `content/assets/<hash>.<ext>`, of a type the Resources tab takes. Null
 * for anything else, another preview's included.
 */
export function previewFile(url: string, token: string): { hash: string; ext: string } | null {
  let address: URL;
  try {
    address = new URL(url);
  } catch {
    return null;
  }
  if (address.protocol !== `${PREVIEW_SCHEME}:` || !token || address.hostname !== token)
    return null;
  const match = /^\/content\/assets\/([0-9a-f]{64})\.([a-z0-9]+)$/.exec(address.pathname);
  if (!match || !RESOURCE_EXTENSIONS.includes(match[2]!)) return null;
  return { hash: match[1]!, ext: match[2]! };
}

export interface PreviewRequest {
  project: Project;
  workspaceDir: string;
  scope: PreviewScope;
  player: { js: string; css: string };
  /** The library's licence notices (P9.8), for a course that uses its sets. */
  notices?: Partial<Record<GraphicLibrary, string>>;
}

export class Previews {
  private files = new Map<string, string | Uint8Array>();
  private token = '';
  /** Other courses served the same way, such as one being made into a video (P11.3), by token. */
  private sites = new Map<string, Map<string, string | Uint8Array>>();
  /** The open project's working copy, where a course file the preview opens is kept. */
  private workspaceDir = '';
  private window: BrowserWindow | undefined;

  constructor(
    private readonly getParent: () => BrowserWindow | undefined,
    /** The author asked to edit the slide the preview is showing. */
    private readonly onEdit: (slideId: string) => void,
  ) {}

  /** Call once, after the app is ready. */
  handleRequests(): void {
    // The preview window has a session of its own, and a handler belongs to one session.
    session.fromPartition(PARTITION).protocol.handle(PREVIEW_SCHEME, (request) => {
      const url = new URL(request.url);
      const path = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      const site = url.hostname === this.token ? this.files : this.sites.get(url.hostname);
      const data = site?.get(path);
      if (data === undefined) return new Response('Not found', { status: 404 });
      const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
      const type = TEXT_TYPES[ext] ?? mimeTypeForExtension(ext) ?? 'application/octet-stream';
      const body = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
      const headers = {
        'content-type': type,
        'cache-control': 'no-store',
        'content-security-policy': CSP,
        'x-content-type-options': 'nosniff',
        'accept-ranges': 'bytes',
      };
      // Byte ranges, as the editor's media scheme gives them: a video seeks by asking for some.
      const range = parseRange(request.headers.get('range'), body.length);
      if (range === 'unsatisfiable') {
        return new Response(null, {
          status: 416,
          headers: { ...headers, 'content-range': `bytes */${body.length}` },
        });
      }
      const { start, end } = range ?? { start: 0, end: body.length - 1 };
      return new Response(body.subarray(start, end + 1), {
        status: range ? 206 : 200,
        headers: {
          ...headers,
          'content-length': String(end - start + 1),
          ...(range ? { 'content-range': `bytes ${start}-${end}/${body.length}` } : {}),
        },
      });
    });
  }

  async open({ project, workspaceDir, scope, player, notices }: PreviewRequest): Promise<void> {
    const files = new Map<string, string | Uint8Array>();
    await publishWeb(scopeProject(project, scope), {
      player,
      readAsset: (hash, meta) => readFile(assetPath(workspaceDir, hash, meta.ext)),
      write: async (path, data) => void files.set(path, data),
      // Web objects from an address are not loaded here (P9.6).
      preview: true,
      ...(notices ? { notices } : {}),
    });
    const page = files.get('index.html') as string;
    files.set('index.html', page.replace('</body>', `${TOOLBAR}</body>`));
    this.files = files;
    this.workspaceDir = workspaceDir;
    this.token = randomBytes(16).toString('hex');

    const window = this.window && !this.window.isDestroyed() ? this.window : this.createWindow();
    this.window = window;
    await window.loadURL(`${PREVIEW_SCHEME}://${this.token}/index.html`);
    window.show();
    window.focus();
  }

  close(): void {
    if (this.window && !this.window.isDestroyed()) this.window.close();
  }

  /** Serve `files` under a token of their own, in the preview's session, until `unhost`. */
  host(files: Map<string, string | Uint8Array>): string {
    const token = randomBytes(16).toString('hex');
    this.sites.set(token, files);
    return token;
  }

  unhost(token: string): void {
    this.sites.delete(token);
  }

  private createWindow(): BrowserWindow {
    const window = new BrowserWindow({
      width: 1024,
      height: 680,
      minWidth: 480,
      minHeight: 360,
      show: false,
      title: 'Preview',
      autoHideMenuBar: true,
      webPreferences: {
        // No preload: authored content in a preview gets no bridge at all.
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        partition: PARTITION,
        // Narration starts with its slide, as it will for most learners once they have clicked in.
        autoplayPolicy: 'no-user-gesture-required',
      },
    });
    window.setMenu(null);
    // A course's "open URL" trigger: web pages go to the learner's browser, never into the app.
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (/^(https?|mailto):/i.test(url)) void shell.openExternal(url);
      // A course file (the Resources tab, "open a file"): the project's own copy,
      // in the system's app for it, as a learner's browser would open it.
      const file = previewFile(url, this.token);
      if (file && this.files.has(`content/assets/${file.hash}.${file.ext}`) && this.workspaceDir) {
        void shell.openPath(assetPath(this.workspaceDir, file.hash, file.ext));
      }
      return { action: 'deny' };
    });
    window.webContents.on('will-navigate', (event, target) => {
      // The page may not go anywhere; the toolbar's addresses are instructions to us.
      event.preventDefault();
      let url: URL;
      try {
        url = new URL(target);
      } catch {
        return;
      }
      if (url.protocol !== `${PREVIEW_SCHEME}:` || url.hostname !== this.token) return;
      if (url.pathname === '/__action/replay') {
        window.webContents.reload();
      } else if (url.pathname === '/__action/close') {
        window.close();
      } else if (url.pathname === '/__action/edit') {
        const slideId = url.searchParams.get('slide') ?? '';
        window.close();
        if (slideId) this.onEdit(slideId);
        const parent = this.getParent();
        if (parent && !parent.isDestroyed()) parent.focus();
      }
    });
    window.on('closed', () => {
      this.window = undefined;
      this.files = new Map();
      this.token = '';
    });
    return window;
  }
}

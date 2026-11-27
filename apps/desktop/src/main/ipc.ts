import { app, clipboard, dialog, ipcMain, Menu, shell } from 'electron';
import { drawsOverlay, TITLE_BAR_HEIGHT } from './title-bar';
import { exportHandout, exportHandoutDocument } from './handout';
import { exportVideo, VideoCancelled } from './video/export';
import { NO_VOICES_HINT } from './speech/providers';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { createScreenCapture } from './screen-capture';
import { readNotices } from './notices';
import { DONATE_URL, feedbackUrlHere } from './feedback';
import { findElectronDir, folderWithSource, NOTICES_FILE, thirdPartyNotices } from './third-party';
import { locale, t } from '../shared/strings';
import { readTranslationDocument, writeTranslationDocument } from './translation-document';

/** Captions files are text; anything bigger than this is not one. */
const MAX_CAPTION_FILE = 2 * 1024 * 1024;
const MAX_TRANSLATION_FILE = 50 * 1024 * 1024;
import { parseProject } from '@vedraopus/model';
import { pathToFileURL } from 'node:url';
import type { BrowserWindow } from 'electron';
import { ipcChannels } from '../shared/ipc';
import type { IpcArgs, IpcChannel, IpcEvent, IpcEvents, IpcResults } from '../shared/ipc';
import { findPlayerDir, publishProject } from './publish';
import type { PublishFolders } from './publish-folders';
import { workspaceDir } from './project/workspace';
import type { ProjectSessions } from './project/session';
import type { Previews } from './preview';
import { readFile, stat, writeFile } from 'node:fs/promises';
import type { SettingsStore } from './settings';

type Handlers = {
  [C in IpcChannel]: (...args: IpcArgs<C>) => IpcResults[C] | Promise<IpcResults[C]>;
};

export interface IpcContext {
  sessions: ProjectSessions;
  settings: SettingsStore;
  publishFolders: PublishFolders;
  previews: Previews;
  /** Screen recording's chosen source (P9.11). */
  screenCapture: ReturnType<typeof createScreenCapture>;
  getWindow: () => BrowserWindow | undefined;
  /** A project file passed on the command line or by the OS at launch. */
  launchPath: string | null;
}

/** A course title made safe to suggest as a file name on any system. */
function safeFileTitle(title: string): string {
  const forbidden = '<>:"/\\|?*';
  const cleaned = [...title]
    .map((char) => (forbidden.includes(char) || char.charCodeAt(0) < 32 ? ' ' : char))
    .join('')
    .trim()
    .slice(0, 100);
  return cleaned || 'Course';
}

export function registerIpcHandlers(context: IpcContext): void {
  const { sessions, settings } = context;
  let publishing: { aborted: boolean } | null = null;
  let video: { cancelled: boolean } | null = null;
  const locatePlayer = () =>
    findPlayerDir([
      join(import.meta.dirname, '../player'),
      resolve(import.meta.dirname, '../../../../packages/player/dist'),
    ]);
  // The library's licence notices, which courses that use its sets carry (P9.8).
  const licenceFolders = [
    app.isPackaged ? join(process.resourcesPath, 'licences') : undefined,
    resolve(import.meta.dirname, '../../resources/licences'),
  ];
  const notices = () => readNotices(licenceFolders);
  // Help → Third-Party Notices… (R2): the files it lists are the only ones it opens.
  let noticeFiles = new Map<string, string>();
  const thirdParty = () => {
    const player = (() => {
      try {
        return [join(locatePlayer(), NOTICES_FILE)];
      } catch {
        return [];
      }
    })();
    const ffmpeg = sessions.media?.tools.ffmpeg;
    const { notices: found, files } = thirdPartyNotices({
      lists: {
        editor: ['.', '../preload', '../renderer'].map((dir) =>
          join(import.meta.dirname, dir, NOTICES_FILE),
        ),
        player,
      },
      electronDir: findElectronDir(process.execPath, process.resourcesPath),
      electronVersion: process.versions.electron,
      ffmpegDir: ffmpeg ? dirname(dirname(ffmpeg)) : null,
      libreOfficeDir: folderWithSource(sessions.libreOffice),
      licencesDir: licenceFolders.find((dir) => dir && existsSync(dir)) ?? null,
    });
    noticeFiles = files;
    return found;
  };
  const handlers: Handlers = {
    'app:getInfo': () => ({
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      uiLocale: locale(),
    }),
    'app:getLaunchPath': () => context.launchPath,
    'app:showMenu': ({ x, y }) => {
      const window = context.getWindow();
      if (window) Menu.getApplicationMenu()?.popup({ window, x, y });
    },
    'app:setTitleBarColours': ({ color, symbolColor }) => {
      // Windows and Linux draw the window's own buttons over the bar; macOS has its traffic lights.
      if (process.platform === 'darwin') return;
      if (!drawsOverlay(process.platform, app.commandLine.getSwitchValue('ozone-platform'))) return;
      context.getWindow()?.setTitleBarOverlay({ color, symbolColor, height: TITLE_BAR_HEIGHT });
    },
    'app:thirdPartyNotices': () => thirdParty(),
    'app:donate': () => shell.openExternal(DONATE_URL),
    'app:sendFeedback': () => shell.openExternal(feedbackUrlHere(app.getVersion())),
    'app:openNotice': async (id) => {
      const path = noticeFiles.get(id);
      if (!path) return false;
      return (await shell.openPath(path)) === '';
    },

    'project:new': () => sessions.newProject(),
    'project:open': () => sessions.openWithDialog(),
    'project:openPath': (path) => sessions.openPath(path),
    'project:autosave': (json) => sessions.autosave(json),
    'project:save': (json) => sessions.save(json),
    'project:saveAs': (json) => sessions.saveAs(json),
    'project:importAssets': () => sessions.importAssets(),
    'project:importFiles': () => sessions.importFiles(),
    'project:importWebFolder': () => sessions.importWebFolder(),
    'project:storeRecording': (bytes) => sessions.storeRecording(bytes),
    'project:storeScreenRecording': (bytes) => sessions.storeScreenRecording(bytes),
    'screen:sources': () => context.screenCapture.sources(),
    'screen:choose': async (id) => context.screenCapture.choose(id),
    'speech:voices': async () => {
      const provider = sessions.speech;
      if (!provider) return { provider: null, voices: [], hint: NO_VOICES_HINT };
      const voices = await provider.voices();
      return {
        provider: { id: provider.id, name: provider.name },
        voices: [...voices].sort((a, b) => a.name.localeCompare(b.name)),
        hint: voices.length === 0 ? NO_VOICES_HINT : null,
      };
    },
    'speech:make': (request) => sessions.makeSpeech(request),
    'project:importPowerPoint': () => sessions.importPowerPoint(),
    'project:importStoryline': () => sessions.importStoryline(),
    'project:exportHandout': ({ defaultName }) => exportHandout(context.getWindow(), defaultName),
    'project:exportHandoutDocument': (request) =>
      exportHandoutDocument(context.getWindow(), request),
    'project:openSlideSource': () => sessions.openSlideSource(),
    'project:copySlideMedia': (hashes) => sessions.copySlideMedia(hashes),
    'template:list': () => sessions.listTemplates(),
    'template:saveCurrent': (projectJson, name) => sessions.saveAsTemplate(projectJson, name),
    'template:open': (path) => sessions.newFromTemplate(path),
    'template:openDemo': () => sessions.openDemoCourse(),
    'template:remove': (path) => sessions.removeTemplate(path),
    'project:openTranslation': async () => {
      const window = context.getWindow();
      const options = {
        title: 'Import translation',
        properties: ['openFile' as const],
        filters: [
          { name: 'Translations', extensions: ['xlf', 'xliff', 'docx'] },
          { name: 'XLIFF', extensions: ['xlf', 'xliff'] },
          { name: 'Word document', extensions: ['docx'] },
        ],
      };
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);
      const path = result.canceled ? undefined : result.filePaths[0];
      if (!path) return null;
      const { size } = await stat(path);
      if (size > MAX_TRANSLATION_FILE) {
        throw new Error('That translation file is too large (over 50 MB).');
      }
      const fileName = basename(path);
      if (extname(path).toLowerCase() === '.docx') {
        return { kind: 'document' as const, fileName, ...(await readTranslationDocument(path)) };
      }
      return { kind: 'xliff' as const, fileName, text: await readFile(path, 'utf8') };
    },
    'project:saveTranslationDocument': async ({ defaultName, ...document }) => {
      const window = context.getWindow();
      const options = {
        title: 'Export a document for translation',
        defaultPath: defaultName,
        filters: [{ name: 'Word document', extensions: ['docx'] }],
      };
      const result = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return null;
      const chosen = result.filePath;
      const path = extname(chosen).toLowerCase() === '.docx' ? chosen : `${chosen}.docx`;
      await writeTranslationDocument(path, document);
      return path;
    },
    'project:saveTranslation': async ({ defaultName, text }) => {
      const window = context.getWindow();
      const options = {
        title: 'Export for translation',
        defaultPath: defaultName,
        filters: [{ name: 'XLIFF', extensions: ['xlf', 'xliff'] }],
      };
      const result = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return null;
      const chosen = result.filePath;
      const ext = extname(chosen).toLowerCase();
      const path = ext === '.xlf' || ext === '.xliff' ? chosen : `${chosen}.xlf`;
      await writeFile(path, text, 'utf8');
      return path;
    },
    'project:openCaptions': async () => {
      const window = context.getWindow();
      const options = {
        title: 'Import captions',
        properties: ['openFile' as const],
        filters: [{ name: 'Captions', extensions: ['vtt', 'srt'] }],
      };
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);
      const path = result.canceled ? undefined : result.filePaths[0];
      if (!path) return null;
      const { size } = await stat(path);
      if (size > MAX_CAPTION_FILE) throw new Error('That captions file is too large (over 2 MB).');
      return { fileName: basename(path), text: await readFile(path, 'utf8') };
    },
    'project:saveCaptions': async ({ defaultName, vtt, srt }) => {
      const window = context.getWindow();
      const options = {
        title: 'Export captions',
        defaultPath: defaultName,
        filters: [
          { name: 'WebVTT', extensions: ['vtt'] },
          { name: 'SubRip', extensions: ['srt'] },
        ],
      };
      const result = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return null;
      const chosen = result.filePath;
      const srtFile = extname(chosen).toLowerCase() === '.srt';
      const path = srtFile || extname(chosen).toLowerCase() === '.vtt' ? chosen : `${chosen}.vtt`;
      await writeFile(path, srtFile ? srt : vtt, 'utf8');
      return path;
    },
    'project:listRecent': () => sessions.listRecent(),
    'project:listRecoverable': () => sessions.listRecoverable(),
    'project:recover': (workspaceId) => sessions.recover(workspaceId),
    'project:discardRecovery': (workspaceId) => sessions.discardRecovery(workspaceId),

    'publish:chooseFolder': async () => {
      const window = context.getWindow();
      const options = {
        title: 'Choose where to publish the course',
        properties: ['openDirectory', 'createDirectory'] as Array<
          'openDirectory' | 'createDirectory'
        >,
      };
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
    'publish:run': async ({ workspaceId, projectJson, folder }) => {
      if (publishing) throw new Error('A course is already being published.');
      const signal = { aborted: false };
      publishing = signal;
      try {
        const playerDir = locatePlayer();
        const project = parseProject(JSON.parse(projectJson));
        const result = await publishProject({
          project,
          workspaceDir: workspaceDir(sessions.workspacesRoot, workspaceId),
          parentFolder: folder,
          settings: project.publish,
          playerDir,
          notices: await notices(),
          signal,
          onProgress: (done, total) =>
            sendToRenderer(context.getWindow(), 'event:publishProgress', { done, total }),
        });
        if (result.status === 'done') context.publishFolders.remember(project.id, folder);
        return result;
      } finally {
        publishing = null;
      }
    },
    'project:exportVideo': async ({ workspaceId, projectJson }) => {
      if (video) throw new Error('A video is already being made.');
      const ffmpeg = sessions.media?.tools.ffmpeg;
      if (!ffmpeg) throw new Error(t('dialog.video.noTools'));
      const project = parseProject(JSON.parse(projectJson));
      const window = context.getWindow();
      const options = {
        title: t('video.title'),
        defaultPath: `${safeFileTitle(project.title)}.webm`,
        filters: [{ name: t('dialog.video.filter'), extensions: ['webm'] }],
      };
      const chosen = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options);
      if (chosen.canceled || !chosen.filePath) return null;
      const output = /\.webm$/i.test(chosen.filePath) ? chosen.filePath : `${chosen.filePath}.webm`;
      const playerDir = locatePlayer();
      const [js, css] = await Promise.all([
        readFile(join(playerDir, 'player.js'), 'utf8'),
        readFile(join(playerDir, 'player.css'), 'utf8'),
      ]);
      const signal = { cancelled: false };
      video = signal;
      try {
        await exportVideo({
          project,
          workspaceDir: workspaceDir(sessions.workspacesRoot, workspaceId),
          output,
          ffmpeg,
          player: { js, css },
          notices: await notices(),
          previews: context.previews,
          cancelled: () => signal.cancelled,
          onProgress: (fraction) =>
            sendToRenderer(context.getWindow(), 'event:videoProgress', { fraction }),
        });
        return output;
      } catch (error) {
        if (error instanceof VideoCancelled) return null;
        throw error;
      } finally {
        video = null;
      }
    },
    'project:cancelVideo': () => {
      if (video) video.cancelled = true;
    },
    'preview:open': async ({ workspaceId, projectJson, scope }) => {
      const playerDir = locatePlayer();
      const [js, css] = await Promise.all([
        readFile(join(playerDir, 'player.js'), 'utf8'),
        readFile(join(playerDir, 'player.css'), 'utf8'),
      ]);
      await context.previews.open({
        project: parseProject(JSON.parse(projectJson)),
        workspaceDir: workspaceDir(sessions.workspacesRoot, workspaceId),
        scope,
        player: { js, css },
        notices: await notices(),
      });
    },
    'publish:cancel': () => {
      if (publishing) publishing.aborted = true;
    },
    'publish:lastFolder': (projectId) => context.publishFolders.get(projectId),
    'publish:view': async ({ path, kind }) => {
      if (kind === 'zip') shell.showItemInFolder(path);
      else await shell.openExternal(pathToFileURL(join(path, 'index.html')).href);
    },

    'settings:load': () => settings.current,
    'settings:save': (next) => settings.save(next),

    'clipboard:read': () => clipboard.readText(),
    'clipboard:write': (text) => clipboard.writeText(text),
  };

  for (const channel of Object.keys(ipcChannels) as IpcChannel[]) {
    const handler = handlers[channel] as (...args: unknown[]) => unknown;
    ipcMain.handle(channel, (event, ...rawArgs: unknown[]) => {
      // Only the editor window's own page may call in — not a frame it embeds.
      const window = context.getWindow();
      if (!window || event.senderFrame !== window.webContents.mainFrame) {
        throw new Error(`Rejected ${channel} from an unexpected sender`);
      }
      // Never trust the renderer: reject anything that does not match the contract.
      const args = ipcChannels[channel].args.parse(rawArgs);
      return handler(...args);
    });
  }
}

/** Push a typed event to the renderer. */
export function sendToRenderer<E extends IpcEvent>(
  window: BrowserWindow | undefined,
  event: E,
  payload: IpcEvents[E],
): void {
  if (window && !window.isDestroyed()) window.webContents.send(event, payload);
}

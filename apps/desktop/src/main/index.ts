import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  Menu,
  nativeTheme,
  session,
  shell,
  webContents,
} from 'electron';
import { windowFrame } from './title-bar';
import { itemFor } from './accelerators';
import { findSpeechProvider } from './speech/providers';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { registerIpcHandlers, sendToRenderer } from './ipc';
import { findMediaTools, vendorFolder } from './media/ffmpeg';
import { findLibreOffice, libreOfficeVendorFolder } from './import/libreoffice';
import { crashReportsFolder, keepCrashReportsSetting, startCrashReports } from './crash-reports';
import { Updates } from './updates';
import electronUpdater from 'electron-updater';
import { buildApplicationMenu } from './menu';
import { setLocale, t } from '../shared/strings';
import { restrictPermissions } from './permissions';
import { createScreenCapture } from './screen-capture';
import { FILE_EXTENSION, LEGACY_FILE_EXTENSION } from './project/paths';
import { handleAssetRequests, registerAssetScheme } from './project/protocol';
import { ProjectSessions } from './project/session';
import { PREVIEW_PARTITION, Previews } from './preview';
import { PublishFolders } from './publish-folders';
import { SettingsStore } from './settings';
import { RELEASES_URL } from './third-party';
import { loadWindowState, trackWindowState } from './window-state';

// The editor's words (P10.4): English, or the pseudo-locale for finding words not yet in the catalogue.
setLocale(process.env['VEDRAOPUS_UI_LOCALE']?.trim() || 'en');

// Tests point this at a throwaway directory so they never touch real settings.
const userDataOverride = process.env['VEDRAOPUS_USER_DATA'];
if (userDataOverride) app.setPath('userData', userDataOverride);
// Crash reports (P11.5), if the author asked for them: started early, kept on this machine.
startCrashReports(keepCrashReportsSetting());

registerAssetScheme();

let mainWindow: BrowserWindow | undefined;
const getWindow = () => mainWindow;
const sessions = new ProjectSessions(
  getWindow,
  join(app.getPath('userData'), 'workspaces'),
  join(app.getPath('userData'), 'recent.json'),
);

/** The first existing project file named on a command line, including legacy files. */
function projectFileIn(argv: readonly string[]): string | null {
  const extensions = [FILE_EXTENSION, LEGACY_FILE_EXTENSION];
  const candidate = argv
    .slice(1)
    .find(
      (arg) =>
        extensions.some((extension) => arg.toLowerCase().endsWith(`.${extension}`)) &&
        existsSync(arg),
    );
  return candidate ? resolve(candidate) : null;
}

const previews = new Previews(getWindow, (slideId) =>
  sendToRenderer(mainWindow, 'event:previewEdit', slideId),
);

let launchPath = projectFileIn(process.argv);
let quitting = false;

function createMainWindow(): BrowserWindow {
  const { maximized, ...bounds } = loadWindowState();
  const startMaximized =
    maximized ||
    process.env['VEDRAOPUS_START_MAXIMIZED'] === '1' ||
    process.argv.includes('--maximize') ||
    process.argv.includes('--maximized');
  const startFullscreen =
    process.env['VEDRAOPUS_START_FULLSCREEN'] === '1' ||
    process.argv.includes('--fullscreen') ||
    process.argv.includes('--full-screen');

  const window = new BrowserWindow({
    ...bounds,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'Vedra Opus',
    fullscreen: startFullscreen,
    // One bar at the top: ours, with the system's own buttons at its end (B1).
    ...windowFrame(
      process.platform,
      nativeTheme.shouldUseDarkColors,
      app.commandLine.getSwitchValue('ozone-platform'),
    ),
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  mainWindow = window;
  // With no menu bar on Windows and Linux, the menu's shortcuts are matched here (B1).
  if (process.platform !== 'darwin') {
    window.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      const menu = Menu.getApplicationMenu();
      const item = menu ? itemFor(menu, input, process.platform) : null;
      if (!item) return;
      event.preventDefault();
      item.click(undefined, window, window.webContents);
    });
  }

  if (!startFullscreen && startMaximized) window.maximize();
  trackWindowState(window);
  window.once('ready-to-show', () => window.show());
  // The page's <title> must not replace the title that shows the open project.
  window.on('page-title-updated', (event) => event.preventDefault());

  // The editor never navigates away from itself and never opens child windows;
  // external links go to the system browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event) => event.preventDefault());

  // Closing with unsaved changes asks first. The answer arrives asynchronously,
  // so hold the window open and close it again once the author has decided.
  let closeConfirmed = false;
  window.on('close', (event) => {
    if (closeConfirmed) return;
    if (!sessions.isDirty) {
      sessions.discardCurrent();
      return;
    }
    event.preventDefault();
    void sessions.confirmLeavingCurrent().then((proceed) => {
      if (!proceed) {
        quitting = false;
        return;
      }
      closeConfirmed = true;
      if (quitting) app.quit();
      else window.close();
    });
  });
  window.on('closed', () => {
    // A preview belongs to the editor window and goes with it.
    previews.close();
    if (mainWindow === window) mainWindow = undefined;
  });

  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  }
  return window;
}

/** Ask the running editor to open a project file handed to us by the OS. */
function requestOpen(filePath: string): void {
  if (!mainWindow) {
    launchPath = filePath;
    if (app.isReady()) createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  sendToRenderer(mainWindow, 'event:openRequest', filePath);
}

if (!app.requestSingleInstanceLock()) {
  // The running instance receives our arguments through its `second-instance` event.
  console.error('Vedra Opus is already running; handing over to that window.');
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const filePath = projectFileIn(argv);
    if (filePath) requestOpen(filePath);
    else if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // macOS delivers double-clicked files this way, possibly before the app is ready.
  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    requestOpen(filePath);
  });

  app.on('before-quit', () => {
    quitting = true;
  });

  void app.whenReady().then(async () => {
    restrictPermissions(
      session.defaultSession,
      session.fromPartition(PREVIEW_PARTITION),
      (contents) => contents === mainWindow?.webContents,
    );
    // Screen recording (P9.11): the editor's capture gets the source the author
    // picked in its dialog, once; Preview windows never capture.
    const screenCapture = createScreenCapture((options) => desktopCapturer.getSources(options));
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
      const from = request.frame ? webContents.fromFrame(request.frame) : undefined;
      screenCapture.handle(request, callback, !!from && from === mainWindow?.webContents);
    });
    session
      .fromPartition(PREVIEW_PARTITION)
      .setDisplayMediaRequestHandler((_request, callback) => callback(null));
    // The media pipeline (P6.3): ffmpeg beside the app when packaged, or the repository's
    // vendor folder (npm run fetch:ffmpeg) in development.
    const tools = findMediaTools([
      process.env['VEDRAOPUS_FFMPEG_DIR'],
      app.isPackaged ? join(process.resourcesPath, 'ffmpeg') : undefined,
      vendorFolder(resolve(import.meta.dirname, '../../../..')),
    ]);
    if (tools) {
      sessions.media = {
        tools,
        // Our own ffmpeg has no patented decoders on any system (docs/briefs/R1-own-ffmpeg-builds.md):
        // only royalty-free formats are read, and anything else is refused, saying how to convert it.
        refusePatented: true,
        onProgress: (fileName, fraction) =>
          sendToRenderer(getWindow(), 'event:mediaProgress', { fileName, fraction }),
      };
    } else {
      console.warn('ffmpeg was not found: imported media are kept as they are.');
    }
    // An import's progress, for the cover over the window (B7).
    sessions.onImportProgress = (progress) =>
      sendToRenderer(getWindow(), 'event:importProgress', progress);
    // Templates (P11.2): the author's own in the user data folder; the built-in ones beside
    // the app when packaged, or in the app's resources folder in development.
    sessions.templates = {
      own: join(app.getPath('userData'), 'Templates'),
      builtIn: app.isPackaged
        ? join(process.resourcesPath, 'templates')
        : resolve(import.meta.dirname, '../../resources/templates'),
    };
    // LibreOffice, for a PowerPoint deck's charts and SmartArt (P11.1 part D): beside the
    // app when packaged, or the repository's vendor folder (npm run fetch:libreoffice).
    sessions.libreOffice = findLibreOffice([
      process.env['VEDRAOPUS_LIBREOFFICE_DIR'],
      app.isPackaged ? join(process.resourcesPath, 'libreoffice') : undefined,
      libreOfficeVendorFolder(resolve(import.meta.dirname, '../../../..')),
    ]);
    // Text-to-speech through the system's own voices (P6.8), if it has any.
    sessions.speech = findSpeechProvider();
    await sessions.findLeftovers();
    handleAssetRequests(sessions.workspacesRoot);
    previews.handleRequests();
    const settings = new SettingsStore(join(app.getPath('userData'), 'settings.json'));
    registerIpcHandlers({
      sessions,
      previews,
      screenCapture,
      settings,
      publishFolders: new PublishFolders(join(app.getPath('userData'), 'publish-folders.json')),
      getWindow,
      get launchPath() {
        // Handed over once; a reload must not reopen it over the author's work.
        const path = launchPath;
        launchPath = null;
        return path;
      },
    });
    const setMenu = () =>
      Menu.setApplicationMenu(
        buildApplicationMenu(
          (command) => sendToRenderer(mainWindow, 'event:menuCommand', command),
          {
            keepCrashReports: settings.current.keepCrashReports,
            setKeepCrashReports: (keep) => {
              settings.save({ ...settings.current, keepCrashReports: keep });
              setMenu();
              void dialog.showMessageBox({
                type: 'info',
                message: keep ? t('dialog.crashReports.kept') : t('dialog.crashReports.notKept'),
                detail: t('dialog.crashReports.detail'),
                buttons: [t('dialog.ok')],
              });
            },
            showCrashReports: () => void shell.openPath(crashReportsFolder()),
          },
          {
            automatic: settings.current.updates.automatic,
            channel: settings.current.updates.channel,
            checkNow: () => void updates.check(true),
            setAutomatic: (automatic) => {
              settings.save({
                ...settings.current,
                updates: { ...settings.current.updates, automatic },
              });
              setMenu();
              if (automatic) void updates.check(false);
            },
            setChannel: (channel) => {
              settings.save({
                ...settings.current,
                updates: { ...settings.current.updates, channel },
              });
              setMenu();
            },
          },
        ),
      );
    // Updates (P11.4): checked only when asked, or automatically once turned on; never in a
    // development build, unless a test gives a feed (VEDRAOPUS_UPDATE_FEED).
    const feed = process.env['VEDRAOPUS_UPDATE_FEED'];
    const { autoUpdater } = electronUpdater;
    if (feed) {
      autoUpdater.forceDevUpdateConfig = true;
      autoUpdater.setFeedURL({ provider: 'generic', url: feed });
    }
    const updates = new Updates({
      updater: autoUpdater,
      version: app.getVersion(),
      active: app.isPackaged || Boolean(feed),
      // A deb install cannot replace itself; an AppImage, Windows and macOS can.
      manualOnly: process.platform === 'linux' && !process.env['APPIMAGE'],
      settings: () => settings.current.updates,
      ask: async (message, detail, buttons) => {
        const options = {
          type: 'info' as const,
          message,
          detail,
          buttons,
          defaultId: 0,
          cancelId: buttons.length - 1,
          noLink: true,
        };
        const window = getWindow();
        const { response } = window
          ? await dialog.showMessageBox(window, options)
          : await dialog.showMessageBox(options);
        return response;
      },
      openDownloads: () => void shell.openExternal(RELEASES_URL),
    });
    setMenu();
    updates.startAutomatic((run, everyMs) => setInterval(run, everyMs));
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

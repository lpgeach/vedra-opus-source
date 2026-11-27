/**
 * The single source of truth for IPC between renderer and main.
 *
 * Every channel is listed here with a Zod schema for its arguments. Main
 * validates arguments against the schema before running the handler; preload
 * derives `window.vedraopus` from the same table. To add a channel: add an
 * entry to `ipcChannels` and `IpcResults`, add its handler in main/ipc.ts
 * (the compiler flags a missing one), and expose it in preload/index.ts.
 *
 * Preload must import this file for types only: it is sandboxed and cannot
 * carry Zod.
 */
import type { AssetMeta, Project, ProjectIssue } from '@vedraopus/model';
import { z } from 'zod';
import { settingsSchema } from './settings';
import type { Settings } from './settings';

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  /** The language of the editor's words (P10.4): `en`, or `qps-ploc` for the pseudo-locale. */
  uiLocale: string;
}

/** What Vedra Opus ships alongside its own code (docs/briefs/R2-notices-and-sources.md). */
export interface NoticeComponent {
  /** For `app:openNotice`: main opens only the files it listed. */
  id:
    | 'electron'
    | 'ffmpeg'
    | 'libreoffice'
    | 'lucide'
    | 'openDoodles'
    | 'scormSchemas'
    | 'demoCourse';
  name: string;
  version: string | null;
  licence: string;
  /** The licence or notice text shown in the page; null when there is none to show. */
  text: string | null;
  /** A larger file (Chromium's notices, LibreOffice's licence) that opens outside the app. */
  canOpen: boolean;
}

/** An npm package built into the editor or the course player. */
export interface NoticePackage {
  name: string;
  version: string;
  licence: string;
  text: string | null;
  /** The licence's standard text: the package carries no licence file. */
  standard: boolean;
  usedIn: ('editor' | 'player')[];
}

export interface ThirdPartyNotices {
  /** Where each release's source code is published (the source offer). */
  releasesUrl: string;
  components: NoticeComponent[];
  packages: NoticePackage[];
}

/** The project currently open in the window, as main sees it. */
export interface SessionInfo {
  /** Also the host of this project's asset URLs: `vedraopus-asset://<workspaceId>/<hash>`. */
  workspaceId: string;
  /** The `.vedraopus` file on disk, or null if the project has never been saved. */
  sourcePath: string | null;
  /** True when there are changes not yet written to `sourcePath`. */
  dirty: boolean;
}

/** A translation file as main read it (P10.3): XLIFF as text, a document as its rows. */
export type OpenedTranslation =
  | { kind: 'xliff'; fileName: string; text: string }
  | {
      kind: 'document';
      fileName: string;
      sourceLanguage: string;
      targetLanguage: string;
      /** Each row's words with bracket tags (`[1]…[/1]`, `[br]`). */
      rows: { id: string; source: string; target: string }[];
    };

/** One thing a PowerPoint import could not bring across as it was (P11.1). */
export interface PowerPointReportItem {
  /** From 1; null for the deck as a whole. */
  slide: number | null;
  outcome: 'approximated' | 'placeholder' | 'skipped';
  what: string;
}
export type PowerPointReport = PowerPointReportItem[];

/** How far an import is (B7, docs/briefs/B7-import-progress.md), for the cover over the window. */
export interface ImportProgress {
  source: 'storyline' | 'powerpoint';
  /** The file being imported, as the author named it. */
  name: string;
  stage: 'reading' | 'slides' | 'drawing' | 'media' | 'checking';
  /** Media: files brought in so far, and how many in all. */
  done: number;
  total: number;
  /** Media: the file being brought in now, and how far its conversion is, from 0 to 1. */
  file?: string;
  fraction?: number;
}

/** A template in the chooser (P11.2): built in, or one of the author's own. */
export interface TemplateInfo {
  path: string;
  name: string;
  builtIn: boolean;
  slides: number;
  stage: { width: number; height: number } | null;
  /** Why it cannot be used, or null. */
  problem: string | null;
}

/** A project or template chosen to import slides from (P11.2 part B). */
export type SlideSourceResult =
  | { status: 'opened'; fileName: string; project: Project }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string };

export type TemplateSaveResult = { status: 'saved'; name: string } | { status: 'cancelled' };

export type OpenResult =
  | { status: 'opened'; session: SessionInfo; project: Project }
  /** The author backed out of a dialog, or chose to keep the project that was already open. */
  | { status: 'cancelled' }
  /** `message` is written for the author; `issues` carries detail for a "more info" view. */
  | { status: 'failed'; message: string; issues: ProjectIssue[] };

export type SaveResult = { status: 'saved'; session: SessionInfo } | { status: 'cancelled' };

export interface ImportedAsset {
  hash: string;
  meta: AssetMeta;
  /** For a video that went through the media pipeline: a frame of it, stored as a picture. */
  poster?: ImportedAsset;
}

/** A screen or window the editor can record (P9.11). */
export interface ScreenSource {
  id: string;
  name: string;
  kind: 'screen' | 'window';
  /** A small picture of it as a data URL, shown in the dialog only; empty when there is none. */
  thumbnail: string;
}

export interface SpeechVoices {
  /** The system's speech engine, or null when it has none. */
  provider: { id: string; name: string } | null;
  /** Each voice's id is `<provider>:<voice>`, as saved with a sound. */
  voices: { id: string; name: string; language: string }[];
  /** With no engine: how to get one, for the author. */
  hint: string | null;
}

/** A folder of web pages copied in (P9.6), or why not; null `folder` when cancelled. */
export interface WebFolderResult {
  folder: {
    name: string;
    files: { path: string; hash: string; meta: AssetMeta }[];
    entry: string;
  } | null;
  error: string | null;
}

export interface ImportResult {
  imported: ImportedAsset[];
  /** Messages, written for the author, for files that could not be imported. */
  rejected: string[];
}

export interface RecentFile {
  path: string;
  name: string;
}

/** A project left over from a session that did not close cleanly. */
export type PublishResult =
  | {
      status: 'done';
      /** A course folder, or a zip file. */
      kind: 'folder' | 'zip';
      path: string;
      files: number;
      /** Things the author should know, such as resume detail that may not fit. */
      warnings: string[];
    }
  | { status: 'cancelled' };

export interface RecoverableProject {
  workspaceId: string;
  title: string;
  sourcePath: string | null;
  modifiedAt: string;
}

const none = z.tuple([]);
/** A serialised project (the text of project.json). */
const projectJson = z.tuple([z.string().min(2)]);
const workspaceId = z.tuple([z.string().regex(/^[0-9a-f]{32}$/)]);

export const ipcChannels = {
  'app:getInfo': { args: none },
  /** A project file the OS asked the app to open at launch, if any. */
  'app:getLaunchPath': { args: none },
  /** The title bar's hamburger (B1): the application menu, below it, in window coordinates. */
  'app:showMenu': {
    args: z.tuple([
      z.strictObject({
        x: z.number().int().min(0).max(100_000),
        y: z.number().int().min(0).max(100_000),
      }),
    ]),
  },
  /** The title bar's colours, for the window's own buttons on Windows and Linux (B1). */
  'app:setTitleBarColours': {
    args: z.tuple([
      z.strictObject({
        color: z.string().regex(/^#[0-9a-f]{6}$/i),
        symbolColor: z.string().regex(/^#[0-9a-f]{6}$/i),
      }),
    ]),
  },
  /** Help → Third-Party Notices… (R2). */
  'app:thirdPartyNotices': { args: none },
  /** Open the Ko-fi page in the browser (B9); one fixed address, so no arguments. */
  'app:donate': { args: none },
  /** Open the feedback site in the browser (B29); main builds the address, so no arguments. */
  'app:sendFeedback': { args: none },
  /** Open a component's larger notice file outside the app; by its id, never a path. */
  'app:openNotice': {
    args: z.tuple([
      z.enum([
        'electron',
        'ffmpeg',
        'libreoffice',
        'lucide',
        'openDoodles',
        'scormSchemas',
        'demoCourse',
      ]),
    ]),
  },

  'project:new': { args: none },
  /** Shows the open dialog. */
  'project:open': { args: none },
  'project:openPath': { args: z.tuple([z.string().min(1)]) },
  /** Hand main the latest document. It becomes the crash-recovery copy. */
  'project:autosave': { args: projectJson },
  /** Save to the project's file, asking for a location first if it has none. */
  'project:save': { args: projectJson },
  'project:saveAs': { args: projectJson },
  /** Shows the file dialog and copies the chosen files into the project. */
  'project:importAssets': { args: none },
  /** Shows the file dialog for the Resources tab and copies the chosen files in (P8.2). */
  'project:importFiles': { args: none },
  /** Shows the folder dialog and copies a folder of web pages into the project (P9.6). */
  'project:importWebFolder': { args: none },
  /**
   * Ask for a translation file (P10.3): an XLIFF file's text, or what a
   * translation document (.docx) holds; null when cancelled.
   */
  /** Ask for a .pptx and open a new, unsaved project made from it, with the import report (P11.1). */
  'project:importPowerPoint': { args: none },
  /** A new, unsaved project from an Articulate Storyline course (B5), and its report. */
  'project:importStoryline': { args: none },
  'project:openTranslation': { args: none },
  /** Ask where to save a translation document (.docx), adding the extension; the path, or null. */
  'project:saveTranslationDocument': {
    args: z.tuple([
      z.strictObject({
        defaultName: z.string().min(1).max(200),
        title: z.string().max(1000),
        sourceLanguage: z.string().min(1).max(40),
        targetLanguage: z.string().min(1).max(40),
        rows: z
          .array(
            z.strictObject({
              id: z.string().min(1).max(500),
              source: z.string().max(200_000),
              note: z.string().max(1000),
            }),
          )
          .max(200_000),
      }),
    ]),
  },
  /** Ask where to save a translation file (XLIFF), adding .xlf; returns the path, or null when cancelled. */
  'project:saveTranslation': {
    args: z.tuple([
      z.strictObject({ defaultName: z.string().min(1).max(200), text: z.string().max(50_000_000) }),
    ]),
  },
  /** Ask for a VTT or SRT file and return its text (P6.4); null when cancelled. */
  'project:openCaptions': { args: none },
  /**
   * Ask where to save captions; write the SRT text if the chosen name ends in
   * .srt, else the VTT text (adding .vtt). Returns the path, or null when cancelled.
   */
  'project:saveCaptions': {
    args: z.tuple([
      z.strictObject({
        defaultName: z.string().min(1).max(200),
        vtt: z.string().max(4_000_000),
        srt: z.string().max(4_000_000),
      }),
    ]),
  },
  /** The system's voices for text-to-speech (docs/briefs/P6.8-text-to-speech.md). */
  'speech:voices': { args: none },
  /** Speak text with one of those voices and keep the sound as one of the project's media. */
  'speech:make': {
    args: z.tuple([
      z.strictObject({
        text: z.string().min(1).max(5000),
        voice: z.string().min(1).max(200),
        rate: z.number().min(0.5).max(2),
      }),
    ]),
  },
  /** Keep a narration recorded in the editor (WebM/Opus bytes) as one of the project's media. */
  'project:storeRecording': {
    args: z.tuple([
      z
        .instanceof(Uint8Array)
        .refine((bytes) => bytes.byteLength > 0 && bytes.byteLength <= 256 * 1024 * 1024, {
          message: 'a recording must hold between 1 byte and 256 MB',
        }),
    ]),
  },
  /** Keep a screen recording made in the editor (WebM bytes) as a video of the project's (P9.11). */
  'project:storeScreenRecording': {
    args: z.tuple([
      z
        .instanceof(Uint8Array)
        .refine((bytes) => bytes.byteLength > 0 && bytes.byteLength <= 500 * 1024 * 1024, {
          message: 'a screen recording must hold between 1 byte and 500 MB',
        }),
    ]),
  },
  /** The screens and windows that can be recorded, each with a small picture (P9.11). */
  'screen:sources': { args: none },
  /** The source the editor's next screen capture gets, from the last list; null clears it. */
  'screen:choose': { args: z.tuple([z.string().min(1).max(200).nullable()]) },
  'project:listRecent': { args: none },
  'project:listRecoverable': { args: none },
  'project:recover': { args: workspaceId },
  'project:discardRecovery': { args: workspaceId },
  /** Ask for a project or template file to import slides from, and read its project (P11.2). */
  'project:openSlideSource': { args: none },
  /** Copy media, by hash, from the file chosen last into the open project. */
  'project:copySlideMedia': {
    args: z.tuple([z.array(z.string().regex(/^[0-9a-f]{64}$/)).max(10_000)]),
  },
  /**
   * Print the window's handout (P11.3) to a PDF where the author says; the
   * path saved to, or null when cancelled.
   */
  'project:exportHandout': {
    args: z.tuple([z.strictObject({ defaultName: z.string().min(1).max(200) })]),
  },
  /** The handout as a Word document (P11.3 part B): each slide's markup is drawn by main. */
  'project:exportHandoutDocument': {
    args: z.tuple([
      z.strictObject({
        defaultName: z.string().min(1).max(200),
        title: z.string().max(1000),
        /** The course's language tag, for the document's language and direction. */
        language: z.string().min(1).max(35),
        layout: z.enum(['notes', 'lines']),
        stage: z.strictObject({
          width: z.number().int().min(1).max(10_000),
          height: z.number().int().min(1).max(10_000),
        }),
        slides: z
          .array(
            z.strictObject({
              number: z.number().int().min(1),
              title: z.string().max(1000),
              notes: z.array(z.string().max(100_000)).max(1000),
              markup: z.string().max(20_000_000),
            }),
          )
          .max(2000),
      }),
    ]),
  },
  /**
   * The course as a WebM video (P11.3 part C): asks where to save, then plays
   * it through frame by frame. The path saved to, or null when cancelled.
   */
  'project:exportVideo': {
    args: z.tuple([
      z.strictObject({
        workspaceId: z.string().regex(/^[0-9a-f]{32}$/),
        projectJson: z.string().min(2),
      }),
    ]),
  },
  /** Stop a video export under way. */
  'project:cancelVideo': { args: none },
  /** The built-in templates and the author's own (P11.2). */
  'template:list': { args: none },
  /** Save a copy of the project as a template of this name; the open project is not changed. */
  'template:saveCurrent': { args: z.tuple([z.string().min(2), z.string().min(1).max(200)]) },
  /** A new, unsaved project from a template; null asks for any project file. */
  'template:open': { args: z.tuple([z.string().min(1).max(4096).nullable()]) },
  /** A new, unsaved copy of the demo course that ships with the app (B4). */
  'template:openDemo': { args: none },
  /** Delete one of the author's own templates, after asking; true when it was deleted. */
  'template:remove': { args: z.tuple([z.string().min(1).max(4096)]) },

  /** Shows a folder dialog; the path chosen, or null when cancelled. */
  'publish:chooseFolder': { args: none },
  /**
   * Publish the project for the target its publish settings name, into a
   * folder or zip of its own inside `folder`. Main remembers `folder` for
   * this project after a successful publish.
   */
  'publish:run': {
    args: z.tuple([
      z.strictObject({
        workspaceId: z.string().regex(/^[0-9a-f]{32}$/),
        projectJson: z.string().min(2),
        folder: z.string().min(1),
      }),
    ]),
  },
  /** Where this project was last published on this computer, if anywhere. */
  'publish:lastFolder': {
    args: z.tuple([
      z
        .string()
        .regex(/^[A-Za-z0-9_-]+$/)
        .max(200),
    ]),
  },
  /** Play the project, one scene or one slide in the preview window. */
  'preview:open': {
    args: z.tuple([
      z.strictObject({
        workspaceId: z.string().regex(/^[0-9a-f]{32}$/),
        projectJson: z.string().min(2),
        scope: z.discriminatedUnion('kind', [
          z.strictObject({ kind: z.literal('project') }),
          z.strictObject({ kind: z.literal('scene'), sceneId: z.string().min(1) }),
          z.strictObject({ kind: z.literal('slide'), slideId: z.string().min(1) }),
        ]),
      }),
    ]),
  },
  /** Stop a publish in progress. */
  'publish:cancel': { args: none },
  /** A published folder: open its page in the default browser. A zip: show it in the file manager. */
  'publish:view': {
    args: z.tuple([z.strictObject({ path: z.string().min(1), kind: z.enum(['folder', 'zip']) })]),
  },

  'settings:load': { args: none },
  /** Replace the stored settings. Main also applies the theme to native UI. */
  'settings:save': { args: z.tuple([settingsSchema]) },

  /** The text on the system clipboard, or an empty string when there is none. */
  'clipboard:read': { args: none },
  /** Replace the system clipboard's text. */
  'clipboard:write': { args: z.tuple([z.string().max(8_000_000)]) },
} as const;

/** Result type of each channel. Kept separate so results stay plain TS types. */
export interface IpcResults {
  'app:getInfo': AppInfo;
  'app:getLaunchPath': string | null;
  'app:showMenu': void;
  'app:setTitleBarColours': void;
  'app:thirdPartyNotices': ThirdPartyNotices;
  'app:donate': void;
  'app:sendFeedback': void;
  'app:openNotice': boolean;
  'project:new': OpenResult;
  'project:open': OpenResult;
  'project:openPath': OpenResult;
  'project:autosave': SessionInfo;
  'project:save': SaveResult;
  'project:saveAs': SaveResult;
  'project:importAssets': ImportResult;
  'project:importFiles': ImportResult;
  'project:importWebFolder': WebFolderResult;
  'project:storeRecording': ImportedAsset;
  'project:storeScreenRecording': ImportedAsset;
  'screen:sources': ScreenSource[];
  'screen:choose': boolean;
  'speech:voices': SpeechVoices;
  'speech:make': ImportedAsset;
  'project:importPowerPoint': { result: OpenResult; report: PowerPointReport };
  'project:importStoryline': { result: OpenResult; report: PowerPointReport };
  'project:openTranslation': OpenedTranslation | null;
  'project:saveTranslationDocument': string | null;
  'project:saveTranslation': string | null;
  'project:openCaptions': { fileName: string; text: string } | null;
  'project:saveCaptions': string | null;
  'project:listRecent': RecentFile[];
  'project:listRecoverable': RecoverableProject[];
  'project:recover': OpenResult;
  'project:discardRecovery': void;
  'project:openSlideSource': SlideSourceResult;
  'project:copySlideMedia': void;
  'project:exportHandout': string | null;
  'project:exportVideo': string | null;
  'project:cancelVideo': void;
  'project:exportHandoutDocument': string | null;
  'template:list': TemplateInfo[];
  'template:saveCurrent': TemplateSaveResult;
  'template:open': OpenResult;
  'template:openDemo': OpenResult;
  'template:remove': boolean;
  'publish:chooseFolder': string | null;
  'publish:run': PublishResult;
  'publish:lastFolder': string | null;
  'preview:open': void;
  'publish:cancel': void;
  'publish:view': void;
  'settings:load': Settings;
  'settings:save': void;
  'clipboard:read': string;
  'clipboard:write': void;
}

export type IpcChannel = keyof typeof ipcChannels;
export type IpcArgs<C extends IpcChannel> = z.infer<(typeof ipcChannels)[C]['args']>;

/** Messages main pushes to the renderer, and their payloads. */
export interface IpcEvents {
  /** An application-menu item was chosen that the renderer carries out. */
  'event:menuCommand':
    | 'new'
    | 'open'
    | 'save'
    | 'saveAs'
    | 'translation'
    | 'importPowerPoint'
    | 'importStoryline'
    | 'saveAsTemplate'
    | 'newFromTemplate'
    | 'importSlides'
    | 'exportHandout'
    | 'exportVideo'
    | 'thirdPartyNotices'
    | 'openDemo'
    | 'undo'
    | 'redo'
    | 'cut'
    | 'copy'
    | 'paste'
    | 'duplicate'
    | 'delete'
    | 'selectAll'
    | 'overview'
    | 'slideView'
    | 'newSlide'
    | 'publish'
    | 'preview'
    | 'insertTextBox'
    | 'insertShape'
    | 'insertPicture'
    | 'insertButton';
  /** The OS asked the running app to open a project file. */
  'event:openRequest': string;
  /** The author chose Edit in the preview window: show this slide. */
  'event:previewEdit': string;
  /** Files written so far by a publish in progress. */
  'event:publishProgress': { done: number; total: number };
  /** A sound or video being converted by the media pipeline, from 0 to 1. */
  'event:mediaProgress': { fileName: string; fraction: number };
  /** A video export under way (P11.3), from 0 to 1. */
  'event:videoProgress': { fraction: number };
  /** An import under way (B7), once its file is chosen. */
  'event:importProgress': ImportProgress;
}
export type IpcEvent = keyof IpcEvents;

type Unsubscribe = () => void;

/** Shape of `window.vedraopus` in the renderer. */
export interface VedraOpusApi {
  app: {
    getInfo(): Promise<AppInfo>;
    getLaunchPath(): Promise<string | null>;
    thirdPartyNotices(): Promise<ThirdPartyNotices>;
    donate(): Promise<void>;
    sendFeedback(): Promise<void>;
    openNotice(id: NoticeComponent['id']): Promise<boolean>;
    showMenu(at: { x: number; y: number }): Promise<void>;
    setTitleBarColours(colours: { color: string; symbolColor: string }): Promise<void>;
  };
  project: {
    create(): Promise<OpenResult>;
    open(): Promise<OpenResult>;
    openPath(path: string): Promise<OpenResult>;
    autosave(projectJson: string): Promise<SessionInfo>;
    save(projectJson: string): Promise<SaveResult>;
    saveAs(projectJson: string): Promise<SaveResult>;
    importAssets(): Promise<ImportResult>;
    importFiles(): Promise<ImportResult>;
    importWebFolder(): Promise<WebFolderResult>;
    storeRecording(bytes: Uint8Array<ArrayBuffer>): Promise<ImportedAsset>;
    storeScreenRecording(bytes: Uint8Array<ArrayBuffer>): Promise<ImportedAsset>;
    importPowerPoint(): Promise<{ result: OpenResult; report: PowerPointReport }>;
    importStoryline(): Promise<{ result: OpenResult; report: PowerPointReport }>;
    openTranslation(): Promise<OpenedTranslation | null>;
    saveTranslationDocument(file: {
      defaultName: string;
      title: string;
      sourceLanguage: string;
      targetLanguage: string;
      rows: { id: string; source: string; note: string }[];
    }): Promise<string | null>;
    saveTranslation(file: { defaultName: string; text: string }): Promise<string | null>;
    openCaptions(): Promise<{ fileName: string; text: string } | null>;
    saveCaptions(files: { defaultName: string; vtt: string; srt: string }): Promise<string | null>;
    listRecent(): Promise<RecentFile[]>;
    listRecoverable(): Promise<RecoverableProject[]>;
    recover(workspaceId: string): Promise<OpenResult>;
    discardRecovery(workspaceId: string): Promise<void>;
    openSlideSource(): Promise<SlideSourceResult>;
    copySlideMedia(hashes: string[]): Promise<void>;
    exportHandout(request: { defaultName: string }): Promise<string | null>;
    exportVideo(request: { workspaceId: string; projectJson: string }): Promise<string | null>;
    cancelVideo(): Promise<void>;
    exportHandoutDocument(request: {
      defaultName: string;
      title: string;
      language: string;
      layout: 'notes' | 'lines';
      stage: { width: number; height: number };
      slides: { number: number; title: string; notes: string[]; markup: string }[];
    }): Promise<string | null>;
  };
  template: {
    list(): Promise<TemplateInfo[]>;
    saveCurrent(projectJson: string, name: string): Promise<TemplateSaveResult>;
    open(path: string | null): Promise<OpenResult>;
    openDemo(): Promise<OpenResult>;
    remove(path: string): Promise<boolean>;
  };
  publish: {
    chooseFolder(): Promise<string | null>;
    run(request: {
      workspaceId: string;
      projectJson: string;
      folder: string;
    }): Promise<PublishResult>;
    lastFolder(projectId: string): Promise<string | null>;
    cancel(): Promise<void>;
    view(published: { path: string; kind: 'folder' | 'zip' }): Promise<void>;
  };
  /** Screen recording (P9.11). */
  screen: {
    sources(): Promise<ScreenSource[]>;
    choose(id: string | null): Promise<boolean>;
  };
  speech: {
    voices(): Promise<SpeechVoices>;
    make(request: { text: string; voice: string; rate: number }): Promise<ImportedAsset>;
  };
  preview: {
    open(request: {
      workspaceId: string;
      projectJson: string;
      scope:
        | { kind: 'project' }
        | { kind: 'scene'; sceneId: string }
        | { kind: 'slide'; slideId: string };
    }): Promise<void>;
  };
  settings: {
    load(): Promise<Settings>;
    save(settings: Settings): Promise<void>;
  };
  clipboard: {
    read(): Promise<string>;
    write(text: string): Promise<void>;
  };
  events: {
    onMenuCommand(listener: (command: IpcEvents['event:menuCommand']) => void): Unsubscribe;
    onOpenRequest(listener: (path: string) => void): Unsubscribe;
    onPreviewEdit(listener: (slideId: string) => void): Unsubscribe;
    onPublishProgress(
      listener: (progress: IpcEvents['event:publishProgress']) => void,
    ): Unsubscribe;
    onMediaProgress(listener: (progress: IpcEvents['event:mediaProgress']) => void): Unsubscribe;
    onVideoProgress(listener: (progress: IpcEvents['event:videoProgress']) => void): Unsubscribe;
    onImportProgress(listener: (progress: IpcEvents['event:importProgress']) => void): Unsubscribe;
  };
}

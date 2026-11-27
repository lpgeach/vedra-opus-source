/**
 * The project open in the main window, and everything that happens to it on
 * disk. One window, one project: opening another replaces the current one.
 */
import {
  createEmptyProject,
  createId,
  parseProject,
  ProjectValidationError,
} from '@vedraopus/model';
import type { Project } from '@vedraopus/model';
import { app, dialog } from 'electron';
import type { BrowserWindow, MessageBoxOptions } from 'electron';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import type {
  ImportedAsset,
  ImportProgress,
  ImportResult,
  WebFolderResult,
  OpenResult,
  PowerPointReport,
  RecentFile,
  RecoverableProject,
  SaveResult,
  SessionInfo,
  SlideSourceResult,
  TemplateInfo,
  TemplateSaveResult,
} from '../../shared/ipc';
import { t } from '../../shared/strings';
import {
  importAsset,
  IMPORTABLE_EXTENSIONS,
  MediaConversionError,
  RESOURCE_EXTENSIONS,
  storeRecording,
  UnsupportedAssetError,
} from './assets';
import type { MediaOptions } from './assets';
import { importWebFolder, WebFolderError } from './web-folder';
import { importPowerPointFile } from '../import/pptx/import-file';
import { importStorylineFile } from '../import/storyline/import-file';
import { StorylineError } from '../import/storyline/package';
import { PptxError } from '../import/pptx/xml';
import { makeSpeech } from '../speech/make';
import type { SpeechRequest } from '../speech/make';
import type { SpeechProvider } from '../speech/providers';
import {
  ContainerError,
  extractAssets,
  packContainer,
  readContainerProject,
  readMeta,
  unpackContainer,
} from './container';
import { FILE_EXTENSION, LEGACY_FILE_EXTENSION } from './paths';
import { addRecent, readRecent } from './recent';
import { starterTemplate } from './starter-templates';
import { DEMO_COURSE_FILE, isOwnTemplate, listTemplates, templateFileName } from './templates';
import type { TemplateFolders } from './templates';
import {
  createWorkspace,
  discardWorkspace,
  findRecoverableWorkspaces,
  readWorkspaceProject,
  removeWorkspace,
  workspaceDir,
  writeWorkspaceInfo,
  writeWorkspaceProject,
} from './workspace';
import type { RecoverableWorkspace, Workspace } from './workspace';

interface Session {
  workspace: Workspace;
  sourcePath: string | null;
  dirty: boolean;
  /** The latest document the renderer has sent. */
  project: Project;
}

const AUTOSAVE_DELAY_MS = 400;
const fileFilter = {
  name: 'Vedra Opus Project',
  extensions: [FILE_EXTENSION, LEGACY_FILE_EXTENSION],
};

/** Replace any existing extension, including the legacy one, with the current one. */
function withCurrentExtension(filePath: string): string {
  const extension = extname(filePath);
  const stem = extension ? filePath.slice(0, -extension.length) : filePath;
  return `${stem}.${FILE_EXTENSION}`;
}

export class ProjectSessions {
  private session: Session | null = null;
  private recoverable: RecoverableWorkspace[] = [];
  private autosaveTimer: NodeJS.Timeout | undefined;
  /** Disk writes for the working copy, run strictly one after another. */
  private writes: Promise<void> = Promise.resolve();

  constructor(
    private readonly getWindow: () => BrowserWindow | undefined,
    readonly workspacesRoot: string,
    private readonly recentFile: string,
  ) {}

  /** Call once at launch, before any project is opened. */
  async findLeftovers(): Promise<void> {
    this.recoverable = await findRecoverableWorkspaces(this.workspacesRoot);
  }

  get isDirty(): boolean {
    return this.session?.dirty ?? false;
  }

  // ------------------------------------------------------------ opening

  async newProject(): Promise<OpenResult> {
    if (!(await this.confirmLeavingCurrent())) return { status: 'cancelled' };
    const workspace = await createWorkspace(this.workspacesRoot);
    return this.adopt({ workspace, sourcePath: null, dirty: false, project: createEmptyProject() });
  }

  async openWithDialog(): Promise<OpenResult> {
    const window = this.getWindow();
    const options = { properties: ['openFile' as const], filters: [fileFilter] };
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    const [filePath] = result.filePaths;
    if (result.canceled || !filePath) return { status: 'cancelled' };
    return this.openPath(filePath);
  }

  async openPath(filePath: string): Promise<OpenResult> {
    if (!(await this.confirmLeavingCurrent())) return { status: 'cancelled' };
    const workspace = await createWorkspace(this.workspacesRoot);
    let project: Project;
    try {
      project = await unpackContainer(filePath, workspace.dir);
    } catch (error) {
      await removeWorkspace(workspace.dir);
      if (error instanceof ProjectValidationError) {
        return {
          status: 'failed',
          message: `"${basename(filePath)}" could not be opened because its contents are not valid.`,
          issues: [...error.issues],
        };
      }
      const message =
        error instanceof ContainerError
          ? error.message
          : `"${basename(filePath)}" could not be read.`;
      return { status: 'failed', message, issues: [] };
    }
    await this.remember(filePath);
    return this.adopt({ workspace, sourcePath: filePath, dirty: false, project });
  }

  async recover(workspaceId: string): Promise<OpenResult> {
    const leftover = this.recoverable.find((each) => each.id === workspaceId);
    if (!leftover) {
      return {
        status: 'failed',
        message: 'That recovered project is no longer available.',
        issues: [],
      };
    }
    if (!(await this.confirmLeavingCurrent())) return { status: 'cancelled' };
    const project = await readWorkspaceProject(leftover.dir);
    this.recoverable = this.recoverable.filter((each) => each !== leftover);
    return this.adopt({
      workspace: { id: leftover.id, dir: leftover.dir },
      sourcePath: leftover.sourcePath,
      dirty: true,
      project,
    });
  }

  /**
   * File → Import PowerPoint… (docs/briefs/P11.1-pptx-import.md): a new,
   * unsaved project made from a deck, and the report of what came across.
   */
  importPowerPoint(): Promise<{ result: OpenResult; report: PowerPointReport }> {
    return this.oneImportAtATime(() => this.importPowerPointNow());
  }

  private async importPowerPointNow(): Promise<{ result: OpenResult; report: PowerPointReport }> {
    const window = this.getWindow();
    const options = {
      title: t('dialog.importPowerPoint.title'),
      properties: ['openFile' as const],
      filters: [{ name: 'PowerPoint', extensions: ['pptx'] }],
    };
    const chosen = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    const [filePath] = chosen.filePaths;
    if (chosen.canceled || !filePath) return { result: { status: 'cancelled' }, report: [] };
    if (!(await this.confirmLeavingCurrent()))
      return { result: { status: 'cancelled' }, report: [] };
    const workspace = await createWorkspace(this.workspacesRoot);
    try {
      const { project, report } = await importPowerPointFile(
        filePath,
        workspace.dir,
        this.media,
        this.libreOffice,
        (step) =>
          this.onImportProgress?.({ source: 'powerpoint', name: basename(filePath), ...step }),
      );
      const result = await this.adopt({ workspace, sourcePath: null, dirty: true, project });
      return { result, report };
    } catch (error) {
      await removeWorkspace(workspace.dir);
      if (error instanceof PptxError) {
        return { result: { status: 'failed', message: error.message, issues: [] }, report: [] };
      }
      throw error;
    }
  }

  /**
   * File → Import Articulate Storyline Course… (docs/briefs/B5-storyline-import.md):
   * a new, unsaved project made from a `.story` course, and the report of what came across.
   */
  importStoryline(): Promise<{ result: OpenResult; report: PowerPointReport }> {
    return this.oneImportAtATime(() => this.importStorylineNow());
  }

  private async importStorylineNow(): Promise<{ result: OpenResult; report: PowerPointReport }> {
    const window = this.getWindow();
    const options = {
      title: t('dialog.importStoryline.title'),
      properties: ['openFile' as const],
      filters: [{ name: 'Articulate Storyline', extensions: ['story'] }],
    };
    const chosen = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    const [filePath] = chosen.filePaths;
    if (chosen.canceled || !filePath) return { result: { status: 'cancelled' }, report: [] };
    if (!(await this.confirmLeavingCurrent()))
      return { result: { status: 'cancelled' }, report: [] };
    const workspace = await createWorkspace(this.workspacesRoot);
    try {
      const { project, report } = await importStorylineFile(
        filePath,
        workspace.dir,
        basename(filePath, extname(filePath)),
        this.media,
        (step) =>
          this.onImportProgress?.({ source: 'storyline', name: basename(filePath), ...step }),
      );
      const result = await this.adopt({ workspace, sourcePath: null, dirty: true, project });
      return { result, report };
    } catch (error) {
      await removeWorkspace(workspace.dir);
      if (error instanceof StorylineError || error instanceof ProjectValidationError) {
        return {
          result: {
            status: 'failed',
            message:
              error instanceof StorylineError
                ? error.message
                : t('dialog.file.notValidToUse', { file: basename(filePath) }),
            issues: error instanceof ProjectValidationError ? [...error.issues] : [],
          },
          report: [],
        };
      }
      throw error;
    }
  }

  // ---------------------------------------------------------- templates

  /** Where templates are (P11.2), once main has said; none until then. */
  templates: TemplateFolders | null = null;

  listTemplates(): Promise<TemplateInfo[]> {
    return this.templates ? listTemplates(this.templates) : Promise.resolve([]);
  }

  /**
   * File → Save as Template… (docs/briefs/P11.2-templates.md): a copy of the
   * project, with its media, in the templates folder. The open project, its
   * file and its unsaved state are not changed.
   */
  async saveAsTemplate(projectJson: string, name: string): Promise<TemplateSaveResult> {
    const session = this.requireSession();
    if (!this.templates) throw new Error('The templates folder is not known');
    session.project = parseProject(JSON.parse(projectJson));
    await this.flush();
    const target = join(this.templates.own, templateFileName(name));
    if (existsSync(target)) {
      const replace = await this.ask({
        type: 'question',
        message: t('dialog.template.exists', { name: basename(target, extname(target)) }),
        buttons: [t('dialog.template.replace'), t('dialog.cancel')],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      });
      if (replace !== 0) return { status: 'cancelled' };
    }
    await mkdir(this.templates.own, { recursive: true });
    const now = new Date().toISOString();
    await packContainer(session.project, session.workspace.dir, target, {
      formatVersion: session.project.formatVersion,
      appVersion: app.getVersion(),
      createdAt: now,
      modifiedAt: now,
    });
    return { status: 'saved', name: basename(target, extname(target)) };
  }

  /**
   * File → New from Template…: a new, unsaved project made from a template
   * (or, with no path, from any project file the author chooses), with a new
   * id and nothing linking it to the template.
   */
  async newFromTemplate(path: string | null): Promise<OpenResult> {
    // A starter template (part C) is made by code, not read from a file.
    const starter = path === null ? undefined : starterTemplate(path);
    if (starter) {
      if (!(await this.confirmLeavingCurrent())) return { status: 'cancelled' };
      const workspace = await createWorkspace(this.workspacesRoot);
      return this.adopt({ workspace, sourcePath: null, dirty: true, project: starter.make() });
    }
    let filePath = path;
    if (filePath === null) {
      const window = this.getWindow();
      const options = {
        title: t('dialog.newFromTemplate.title'),
        properties: ['openFile' as const],
        filters: [fileFilter],
      };
      const chosen = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);
      if (chosen.canceled || !chosen.filePaths[0]) return { status: 'cancelled' };
      filePath = chosen.filePaths[0];
    }
    if (!(await this.confirmLeavingCurrent())) return { status: 'cancelled' };
    const workspace = await createWorkspace(this.workspacesRoot);
    let project: Project;
    try {
      project = await unpackContainer(filePath, workspace.dir);
    } catch (error) {
      await removeWorkspace(workspace.dir);
      if (error instanceof ProjectValidationError) {
        return {
          status: 'failed',
          message: t('dialog.file.notValidToUse', { file: basename(filePath) }),
          issues: [...error.issues],
        };
      }
      const message =
        error instanceof ContainerError
          ? error.message
          : t('dialog.file.unreadable', { file: basename(filePath) });
      return { status: 'failed', message, issues: [] };
    }
    project.id = createId('project');
    return this.adopt({ workspace, sourcePath: null, dirty: true, project });
  }

  /**
   * The demo course that ships with the app (B4), as a new, unsaved copy like any
   * built-in template, so the copy that ships is never changed.
   */
  async openDemoCourse(): Promise<OpenResult> {
    const folder = this.templates?.builtIn;
    if (!folder) return { status: 'failed', message: t('dialog.demo.missing'), issues: [] };
    const path = join(folder, DEMO_COURSE_FILE);
    if (!existsSync(path)) {
      return { status: 'failed', message: t('dialog.demo.missing'), issues: [] };
    }
    return this.newFromTemplate(path);
  }

  /** Delete one of the author's own templates, after asking. Built-in ones cannot be deleted. */
  async removeTemplate(path: string): Promise<boolean> {
    if (!this.templates || !isOwnTemplate(this.templates, path)) return false;
    const answer = await this.ask({
      type: 'question',
      message: t('dialog.template.delete', { name: basename(path, extname(path)) }),
      detail: t('dialog.template.deleteDetail'),
      buttons: [t('dialog.template.deleteButton'), t('dialog.cancel')],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (answer !== 0) return false;
    await rm(path, { force: true });
    return true;
  }

  // ------------------------------------------------------ importing slides

  /** The project file chosen to import slides from (P11.2 part B), whose media may be copied. */
  private slideSource: string | null = null;

  /**
   * File → Import Slides…: ask for a project or template file and read its
   * project, without unpacking it, for the author to choose slides from.
   */
  async openSlideSource(): Promise<SlideSourceResult> {
    this.requireSession();
    const window = this.getWindow();
    const options = {
      title: t('importSlides.title'),
      properties: ['openFile' as const],
      filters: [fileFilter],
    };
    const chosen = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    const [filePath] = chosen.filePaths;
    if (chosen.canceled || !filePath) return { status: 'cancelled' };
    try {
      const project = await readContainerProject(filePath);
      this.slideSource = filePath;
      return { status: 'opened', fileName: basename(filePath), project };
    } catch (error) {
      const message =
        error instanceof ProjectValidationError
          ? t('dialog.file.notValidToRead', { file: basename(filePath) })
          : error instanceof ContainerError
            ? error.message
            : t('dialog.file.unreadable', { file: basename(filePath) });
      return { status: 'failed', message };
    }
  }

  /** Copy the media the imported slides use from the file chosen last into the open project. */
  async copySlideMedia(hashes: readonly string[]): Promise<void> {
    const session = this.requireSession();
    if (!this.slideSource) throw new Error('No project was chosen to import slides from');
    await extractAssets(this.slideSource, session.workspace.dir, new Set(hashes));
  }

  /** A question for the author; the index of the button chosen. */
  private async ask(options: MessageBoxOptions): Promise<number> {
    const window = this.getWindow();
    const { response } = window
      ? await dialog.showMessageBox(window, options)
      : await dialog.showMessageBox(options);
    return response;
  }

  async discardRecovery(workspaceId: string): Promise<void> {
    const leftover = this.recoverable.find((each) => each.id === workspaceId);
    if (!leftover) return;
    this.recoverable = this.recoverable.filter((each) => each !== leftover);
    await removeWorkspace(workspaceDir(this.workspacesRoot, workspaceId));
  }

  listRecoverable(): RecoverableProject[] {
    return this.recoverable.map(({ id, title, sourcePath, modifiedAt }) => ({
      workspaceId: id,
      title,
      sourcePath,
      modifiedAt,
    }));
  }

  async listRecent(): Promise<RecentFile[]> {
    const paths = await readRecent(this.recentFile);
    return paths.map((path) => ({ path, name: basename(path, extname(path)) }));
  }

  // ------------------------------------------------------------- saving

  /** Take the renderer's latest document and schedule it to the working copy. */
  autosave(projectJson: string): SessionInfo {
    const session = this.requireSession();
    session.project = parseProject(JSON.parse(projectJson));
    session.dirty = true;
    this.updateWindow();
    clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => void this.flush(), AUTOSAVE_DELAY_MS);
    return this.info(session);
  }

  async save(projectJson: string): Promise<SaveResult> {
    const session = this.requireSession();
    session.project = parseProject(JSON.parse(projectJson));
    if (!session.sourcePath) return this.saveAs(projectJson);
    return this.saveTo(session, session.sourcePath);
  }

  async saveAs(projectJson: string): Promise<SaveResult> {
    const session = this.requireSession();
    session.project = parseProject(JSON.parse(projectJson));
    const suggested = session.sourcePath
      ? withCurrentExtension(session.sourcePath)
      : join(app.getPath('documents'), `${safeFileName(session.project.title)}.${FILE_EXTENSION}`);
    const window = this.getWindow();
    const options = { defaultPath: suggested, filters: [fileFilter] };
    const result = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { status: 'cancelled' };
    const target =
      extname(result.filePath).toLowerCase() === `.${FILE_EXTENSION}`
        ? result.filePath
        : withCurrentExtension(result.filePath);
    return this.saveTo(session, target);
  }

  private async saveTo(session: Session, target: string): Promise<SaveResult> {
    await this.flush();
    const now = new Date().toISOString();
    const previous = await readMeta(session.workspace.dir);
    await packContainer(session.project, session.workspace.dir, target, {
      formatVersion: session.project.formatVersion,
      appVersion: app.getVersion(),
      createdAt: typeof previous.createdAt === 'string' ? previous.createdAt : now,
      modifiedAt: now,
    });
    session.sourcePath = target;
    session.dirty = false;
    await this.writeInfo(session);
    await this.remember(target);
    this.updateWindow();
    return { status: 'saved', session: this.info(session) };
  }

  /** Write the working copy now, after any write already under way. */
  private flush(): Promise<void> {
    clearTimeout(this.autosaveTimer);
    const session = this.session;
    if (!session) return this.writes;
    const { project } = session;
    this.writes = this.writes
      .then(async () => {
        // The session may have been replaced while this write was queued.
        if (this.session !== session) return;
        await writeWorkspaceProject(session.workspace, project);
        await this.writeInfo(session);
      })
      .catch((error: unknown) => {
        console.error('Autosave failed', error);
      });
    return this.writes;
  }

  // ------------------------------------------------------------- assets

  async importAssets(): Promise<ImportResult> {
    const session = this.requireSession();
    const window = this.getWindow();
    const options = {
      properties: ['openFile' as const, 'multiSelections' as const],
      filters: [{ name: 'Media', extensions: IMPORTABLE_EXTENSIONS }],
    };
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    const outcome: ImportResult = { imported: [], rejected: [] };
    if (result.canceled) return outcome;

    for (const filePath of result.filePaths) {
      try {
        outcome.imported.push(await importAsset(session.workspace.dir, filePath, this.media));
      } catch (error) {
        outcome.rejected.push(
          error instanceof UnsupportedAssetError || error instanceof MediaConversionError
            ? error.message
            : `"${basename(filePath)}" could not be read.`,
        );
      }
    }
    return outcome;
  }

  /** Shows the file dialog for the Resources tab (P8.2): documents and pictures. */
  /** Shows the folder dialog for a web object's folder of pages (P9.6). */
  async importWebFolder(): Promise<WebFolderResult> {
    const session = this.requireSession();
    const window = this.getWindow();
    const options = { properties: ['openDirectory' as const] };
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    const chosen = result.filePaths[0];
    if (result.canceled || !chosen) return { folder: null, error: null };
    try {
      const imported = await importWebFolder(session.workspace.dir, chosen);
      return { folder: { name: basename(chosen), ...imported }, error: null };
    } catch (error) {
      return {
        folder: null,
        error:
          error instanceof WebFolderError
            ? error.message
            : `"${basename(chosen)}" could not be read.`,
      };
    }
  }

  async importFiles(): Promise<ImportResult> {
    const session = this.requireSession();
    const window = this.getWindow();
    const options = {
      properties: ['openFile' as const, 'multiSelections' as const],
      filters: [{ name: 'Documents and pictures', extensions: RESOURCE_EXTENSIONS }],
    };
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    const outcome: ImportResult = { imported: [], rejected: [] };
    if (result.canceled) return outcome;
    for (const filePath of result.filePaths) {
      try {
        outcome.imported.push(
          await importAsset(session.workspace.dir, filePath, undefined, 'resource'),
        );
      } catch (error) {
        outcome.rejected.push(
          error instanceof UnsupportedAssetError
            ? error.message
            : `"${basename(filePath)}" could not be read.`,
        );
      }
    }
    return outcome;
  }

  /** A narration recorded in the editor, kept with the project's media. */
  storeRecording(bytes: Uint8Array<ArrayBuffer>): Promise<ImportedAsset> {
    const session = this.requireSession();
    return storeRecording(session.workspace.dir, bytes, new Date(), this.media);
  }

  /** A screen recording made in the editor (P9.11), kept with the project's media as a video. */
  storeScreenRecording(bytes: Uint8Array<ArrayBuffer>): Promise<ImportedAsset> {
    const session = this.requireSession();
    return storeRecording(session.workspace.dir, bytes, new Date(), this.media, 'video');
  }

  /** Speak text and keep the sound in the open project (docs/briefs/P6.8-text-to-speech.md). */
  makeSpeech(request: SpeechRequest): Promise<ImportedAsset> {
    const session = this.requireSession();
    return makeSpeech(session.workspace.dir, this.speech, request, this.media);
  }

  /** The system's speech, once main has looked for it; null when it has none. */
  speech: SpeechProvider | null = null;

  /**
   * The media pipeline (P6.3), once main has found ffmpeg. Left unset where
   * there is none (macOS for now): media are then stored as imported.
   */
  media: MediaOptions | undefined;

  /**
   * LibreOffice's program (P11.1 part D), once main has found it: it draws a
   * PowerPoint deck's charts and SmartArt as pictures. Null without it.
   */
  libreOffice: string | null = null;

  /** Where an import's progress goes (B7): main sends it on to the window's cover. */
  onImportProgress: ((progress: ImportProgress) => void) | undefined;

  /** An import is under way, from its file dialog to its end: a second is refused (B7). */
  private importing = false;

  /** Run one import at a time; a second asked for meanwhile is cancelled. */
  private async oneImportAtATime(
    run: () => Promise<{ result: OpenResult; report: PowerPointReport }>,
  ): Promise<{ result: OpenResult; report: PowerPointReport }> {
    if (this.importing) return { result: { status: 'cancelled' }, report: [] };
    this.importing = true;
    try {
      return await run();
    } finally {
      this.importing = false;
    }
  }

  // ------------------------------------------------------------ closing

  /**
   * If the open project has unsaved changes, ask what to do. Returns false if
   * the author cancelled and the project must stay open.
   */
  async confirmLeavingCurrent(): Promise<boolean> {
    const session = this.session;
    if (session?.dirty) {
      const options: MessageBoxOptions = {
        type: 'warning',
        message: `Do you want to save the changes you made to "${session.project.title}"?`,
        detail: "Your changes will be lost if you don't save them.",
        buttons: ['Save', "Don't Save", 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      };
      const window = this.getWindow();
      const { response } = window
        ? await dialog.showMessageBox(window, options)
        : await dialog.showMessageBox(options);
      if (response === 2) return false;
      if (response === 0) {
        const saved = session.sourcePath
          ? await this.saveTo(session, session.sourcePath)
          : await this.saveAs(JSON.stringify(session.project));
        if (saved.status !== 'saved') return false;
      }
    }
    // An edit just before closing may still be writing to the working copy. Removing the
    // folder under that write fails on Windows, so let it finish first; a write not yet
    // started is not needed (docs/briefs/windows-close-hang.md).
    clearTimeout(this.autosaveTimer);
    await this.writes;
    this.discardCurrent();
    return true;
  }

  /**
   * Forget the open project and delete its working copy. Synchronous so it
   * completes even when called on the way out of the process; never throws.
   */
  discardCurrent(): void {
    clearTimeout(this.autosaveTimer);
    const session = this.session;
    this.session = null;
    if (session) discardWorkspace(session.workspace.dir);
    this.updateWindow();
  }

  // ------------------------------------------------------------ helpers

  private async adopt(session: Session): Promise<OpenResult> {
    this.session = session;
    await writeWorkspaceProject(session.workspace, session.project);
    await this.writeInfo(session);
    this.updateWindow();
    return { status: 'opened', session: this.info(session), project: session.project };
  }

  private requireSession(): Session {
    if (!this.session) throw new Error('No project is open');
    return this.session;
  }

  private info(session: Session): SessionInfo {
    return {
      workspaceId: session.workspace.id,
      sourcePath: session.sourcePath,
      dirty: session.dirty,
    };
  }

  private writeInfo(session: Session): Promise<void> {
    return writeWorkspaceInfo(session.workspace, {
      sourcePath: session.sourcePath,
      dirty: session.dirty,
      modifiedAt: new Date().toISOString(),
    });
  }

  private async remember(filePath: string): Promise<void> {
    await addRecent(this.recentFile, filePath);
    app.addRecentDocument(filePath);
  }

  /** Reflect the open project and its unsaved state in the window chrome. */
  private updateWindow(): void {
    const window = this.getWindow();
    if (!window || window.isDestroyed()) return;
    const session = this.session;
    if (!session) {
      window.setTitle('Vedra Opus');
      window.setDocumentEdited(false);
      window.setRepresentedFilename('');
      return;
    }
    // macOS marks unsaved documents with a dot in the close button instead of in the title.
    const marker = session.dirty && process.platform !== 'darwin' ? ' •' : '';
    window.setTitle(`${session.project.title}${marker} — Vedra Opus`);
    window.setDocumentEdited(session.dirty);
    window.setRepresentedFilename(session.sourcePath ?? '');
  }
}

/** A project title made safe to suggest as a file name on any OS. */
function safeFileName(title: string): string {
  const forbidden = '<>:"/\\|?*';
  const cleaned = [...title]
    .map((char) => (forbidden.includes(char) || char.charCodeAt(0) < 32 ? ' ' : char))
    .join('')
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 100) : 'Untitled Project';
}

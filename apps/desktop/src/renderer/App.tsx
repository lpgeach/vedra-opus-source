import { useEffect, useState } from 'react';
import { Editor } from './components/Editor';
import { ImportCover } from './components/ImportCover';
import { TemplateChooser } from './components/TemplateChooser';
import { ThirdPartyNoticesDialog } from './components/ThirdPartyNoticesDialog';
import { TitleBar } from './components/TitleBar';
import { Welcome } from './components/Welcome';
import { editor, useEditor } from './project-store';
import { stage } from './stage/actions';

function isTextField(element: Element | null): boolean {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  );
}

/**
 * Cut, copy or paste inside a field. Chromium does not allow the page to run
 * the clipboard's own paste command, so the text comes through main instead
 * and is inserted at the caret.
 */
async function editTextField(command: 'cut' | 'copy' | 'paste'): Promise<void> {
  if (command !== 'paste') {
    document.execCommand(command);
    return;
  }
  const text = await window.vedraopus.clipboard.read();
  if (text) document.execCommand('insertText', false, text);
}

/** The window: the editor when a project is open, the welcome screen when not. */
export function App() {
  const { open, error, templatesOpen, view, importing } = useEditor();
  // Help → Third-Party Notices…, with or without a project open.
  const [noticesOpen, setNoticesOpen] = useState(false);

  useEffect(() => {
    const { events, app } = window.vedraopus;
    const stopMenu = events.onMenuCommand((command) => {
      // While an import runs, the window is covered: nothing in the menu, or its shortcuts,
      // may start anything else (B7).
      if (editor.isImporting()) return;
      // Edit commands mean one thing while typing in a field and another on
      // the stage. In a field, hand them to the browser's own text editing.
      const typing = isTextField(document.activeElement);
      switch (command) {
        case 'new':
          return void editor.newProject();
        case 'open':
          return void editor.openProject();
        case 'save':
          return void editor.save();
        case 'saveAs':
          return void editor.save(true);
        case 'undo':
          return typing ? void document.execCommand('undo') : stage.undo();
        case 'redo':
          return typing ? void document.execCommand('redo') : stage.redo();
        case 'cut':
          return typing ? void editTextField('cut') : void stage.cut();
        case 'copy':
          return typing ? void editTextField('copy') : void stage.copy();
        case 'paste':
          return typing ? void editTextField('paste') : void stage.paste();
        case 'duplicate':
          return typing ? undefined : stage.duplicate();
        case 'delete':
          return typing ? void document.execCommand('delete') : stage.deleteSelection();
        case 'selectAll':
          return typing ? void document.execCommand('selectAll') : stage.selectAll();
        case 'overview':
          return editor.setView('overview');
        case 'slideView':
          return editor.setView('slide');
        case 'newSlide':
          return editor.addSlide();
        case 'publish':
          return editor.setPublishOpen(true);
        case 'translation':
          return editor.setTranslationOpen(true);
        case 'importPowerPoint':
          return void editor.importPowerPoint();
        case 'importStoryline':
          return void editor.importStoryline();
        case 'newFromTemplate':
          return editor.setTemplatesOpen(true);
        case 'saveAsTemplate':
          return editor.setSaveTemplateOpen(true);
        case 'importSlides':
          return void editor.openSlideSource();
        case 'exportHandout':
          return editor.setHandoutOpen(true);
        case 'exportVideo':
          return editor.setVideoOpen(true);
        case 'thirdPartyNotices':
          return setNoticesOpen(true);
        case 'openDemo':
          return void editor.openDemo();
        case 'preview':
          return void editor.preview('project');
        case 'insertTextBox':
          return stage.insertTextBox();
        case 'insertShape':
          return stage.insertShape({ kind: 'rect' }, 'Rectangle');
        case 'insertPicture':
          return void stage.insertPictureFromFile();
        case 'insertButton':
          return stage.insertButton();
      }
    });
    const stopImport = events.onImportProgress((progress) => editor.showImportProgress(progress));
    const stopOpen = events.onOpenRequest((path) => {
      if (!editor.isImporting()) void editor.openPath(path);
    });
    const stopPreviewEdit = events.onPreviewEdit((slideId) => editor.editSlide(slideId));
    void app.getLaunchPath().then((path) => {
      if (path) void editor.openPath(path);
    });
    return () => {
      stopMenu();
      stopImport();
      stopOpen();
      stopPreviewEdit();
    };
  }, []);

  return (
    <div className="app">
      <TitleBar open={open} view={view} />
      {error && (
        <div className="banner" role="alert" data-testid="error">
          <span>{error}</span>
          <button onClick={editor.dismissError}>Dismiss</button>
        </div>
      )}
      {open ? <Editor open={open} /> : <Welcome />}
      {templatesOpen && <TemplateChooser onClose={() => editor.setTemplatesOpen(false)} />}
      {noticesOpen && <ThirdPartyNoticesDialog onClose={() => setNoticesOpen(false)} />}
      {importing && <ImportCover progress={importing} />}
    </div>
  );
}

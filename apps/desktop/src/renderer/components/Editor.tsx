import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PanelName } from '../../shared/settings';
import { clampPanelSize, fitLayout, maxPanelSize, PANEL_MIN } from '../layout';
import type { Size } from '../layout';
import { activeStateEdit, editedSlide, editor, selectedObjects, useEditor } from '../project-store';
import type { OpenProject } from '../project-store';
import { ui, useSettings } from '../ui-store';
import { BottomPanel, LeftPanel, MasterPanel, RightPanel } from './panels';
import { Ribbon } from './Ribbon';
import { Splitter } from './Splitter';
import { Stage } from '../stage/Stage';
import { Overview } from './Overview';
import { PublishDialog } from './PublishDialog';
import { TranslationDialog } from './TranslationDialog';
import { ImportReport } from './ImportReport';
import { HandoutDialog } from './HandoutDialog';
import { VideoDialog } from './VideoDialog';
import { ImportSlidesDialog } from './ImportSlidesDialog';
import { SaveTemplateDialog } from './SaveTemplateDialog';
import { RecordDialog } from './RecordDialog';
import { LibraryDialog } from './LibraryDialog';
import { ScreenRecordDialog } from './ScreenRecordDialog';
import { SpeechDialog } from './SpeechDialog';
import { VariablesDialog } from './VariablesDialog';
import { DrawForm, describeDraw } from './DrawForm';
import { QuestionForm } from './QuestionForm';
import { ResultForm } from './ResultForm';
import { everySlide } from '@vedraopus/model';

const SPLITTER_LABELS: Record<PanelName, string> = {
  left: 'Resize slides and media panel',
  right: 'Resize triggers, format and slide panel',
  bottom: 'Resize timeline, states and notes panel',
};

/** The editor for an open project: ribbon, the current view, status bar (the title bar is above it, B1). */
export function Editor({ open }: { open: OpenProject }) {
  const {
    view,
    selectedSlideId,
    masterTargetId,
    selection,
    publishOpen,
    translationOpen,
    importReport,
    importSource,
    saveTemplateOpen,
    slideSource,
    handoutOpen,
    videoOpen,
    variablesOpen,
    recordingOpen,
    libraryOpen,
    screenRecordingOpen,
    speechDialog,
  } = useEditor();
  const current = editedSlide(open.project, view, selectedSlideId, masterTargetId);
  const selected = selectedObjects(current?.slide, selection).length;
  const stateEdit = activeStateEdit();

  return (
    <div className="editor" data-testid="editor" data-view={view}>
      <Ribbon />
      {view === 'slide' || view === 'master' ? (
        <SlideView open={open} current={current} master={view === 'master'} />
      ) : (
        <Overview open={open} current={current} />
      )}
      {publishOpen && <PublishDialog open={open} onClose={() => editor.setPublishOpen(false)} />}
      {importReport && (
        <ImportReport
          report={importReport}
          source={importSource}
          onClose={editor.closeImportReport}
        />
      )}
      {videoOpen && (
        <VideoDialog
          project={open.project}
          session={open.session}
          onClose={() => editor.setVideoOpen(false)}
        />
      )}
      {handoutOpen && (
        <HandoutDialog
          project={open.project}
          session={open.session}
          currentSceneId={
            open.project.scenes.find((scene) =>
              scene.slides.some((slide) => slide.id === selectedSlideId),
            )?.id ?? null
          }
          onClose={() => editor.setHandoutOpen(false)}
        />
      )}
      {slideSource && <ImportSlidesDialog source={slideSource} onClose={editor.closeSlideSource} />}
      {saveTemplateOpen && (
        <SaveTemplateDialog
          suggested={open.project.title}
          onClose={() => editor.setSaveTemplateOpen(false)}
        />
      )}
      {translationOpen && (
        <TranslationDialog open={open} onClose={() => editor.setTranslationOpen(false)} />
      )}
      {recordingOpen && <RecordDialog open={open} onClose={() => editor.setRecordingOpen(false)} />}
      {screenRecordingOpen && (
        <ScreenRecordDialog open={open} onClose={() => editor.setScreenRecordingOpen(false)} />
      )}
      {libraryOpen && <LibraryDialog onClose={() => editor.setLibraryOpen(false)} />}
      {speechDialog && <SpeechDialog open={open} objectId={speechDialog.objectId} />}
      {variablesOpen && (
        <VariablesDialog open={open} onClose={() => editor.setVariablesOpen(false)} />
      )}
      <footer className="status-bar">
        <span data-testid="project-status">
          {current?.isMaster
            ? `Master View: ${current.slide.title}`
            : current
              ? `Slide ${current.number} of ${current.total}`
              : 'No slides'}{' '}
          · {stateEdit && `Editing state: ${stateEdit.stateId} · `}
          {selected > 0 && `${selected} ${selected === 1 ? 'object' : 'objects'} selected · `}
          {open.session.dirty ? 'Unsaved changes' : 'Saved'}
          {open.session.sourcePath ? ` · ${open.session.sourcePath}` : ''}
        </span>
        <MediaProgress />
      </footer>
    </div>
  );
}

/** A sound or video being converted on import (P6.3): its name and how far along it is. */
function MediaProgress() {
  const [progress, setProgress] = useState<{ fileName: string; fraction: number } | null>(null);
  useEffect(() => {
    let clear: number | undefined;
    const stop = window.vedraopus.events.onMediaProgress((next) => {
      setProgress(next);
      window.clearTimeout(clear);
      // Gone a moment after it stops reporting (finished, or failed).
      clear = window.setTimeout(() => setProgress(null), 1500);
    });
    return () => {
      stop();
      window.clearTimeout(clear);
    };
  }, []);
  if (!progress) return null;
  return (
    <span className="status-progress" role="status" data-testid="media-progress">
      Converting {progress.fileName}… {Math.round(progress.fraction * 100)}%
    </span>
  );
}

/** Panels around the stage, with a divider on each panel's inner edge. */
function SlideView({
  open,
  current,
  master,
}: Pick<Parameters<typeof Stage>[0], 'open' | 'current'> & { master: boolean }) {
  const { layout } = useSettings();
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [workspace, setWorkspace] = useState<Size | null>(null);

  // Measured before the first paint, so panels never flash at the wrong size.
  useLayoutEffect(() => {
    const element = workspaceRef.current!;
    const measure = () =>
      setWorkspace({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const sizes = workspace ? fitLayout(layout, workspace) : null;

  const splitter = (panel: PanelName) =>
    workspace &&
    sizes &&
    !layout[panel].collapsed && (
      <Splitter
        panel={panel}
        label={SPLITTER_LABELS[panel]}
        size={sizes[panel]}
        min={PANEL_MIN[panel]}
        max={maxPanelSize(panel, layout, workspace)}
        onResize={(wanted) =>
          ui.resizePanel(panel, clampPanelSize(panel, wanted, layout, workspace))
        }
        onCommit={ui.commitLayout}
      />
    );

  return (
    <div className="workspace" ref={workspaceRef}>
      {sizes && workspace && (
        <>
          {master ? (
            <MasterPanel open={open} size={sizes.left} />
          ) : (
            <LeftPanel open={open} current={current} size={sizes.left} />
          )}
          {splitter('left')}
          <div className="centre">
            <QuestionOrStage open={open} current={current} master={master} />
            {splitter('bottom')}
            <BottomPanel open={open} current={current} size={sizes.bottom} />
          </div>
          {splitter('right')}
          <RightPanel open={open} current={current} size={sizes.right} height={workspace.height} />
        </>
      )}
    </div>
  );
}

/**
 * A question slide shows its form or the slide, by the switch above them
 * (docs/briefs/P7.1-question-model.md); any other slide shows the stage.
 */
function QuestionOrStage({
  open,
  current,
  master,
}: Pick<Parameters<typeof Stage>[0], 'open' | 'current'> & { master: boolean }) {
  const { questionView } = useEditor();
  // The slide as stored: while a layer is edited, `current.slide` stands in for it.
  const slide =
    !master && current
      ? everySlide(open.project).find((each) => each.slide.id === current.slide.id)?.slide
      : undefined;
  if (!slide?.question && !slide?.draw && !slide?.result) {
    return <Stage open={open} current={current} />;
  }
  const form = questionView === 'form';
  return (
    <div className="question-view">
      <div className="question-view-switch" role="group" aria-label="Question view">
        <button type="button" aria-pressed={form} onClick={() => editor.setQuestionView('form')}>
          Form
        </button>
        <button type="button" aria-pressed={!form} onClick={() => editor.setQuestionView('slide')}>
          Slide
        </button>
      </div>
      {form ? (
        slide.draw ? (
          <DrawForm open={open} slide={slide} />
        ) : slide.result ? (
          <ResultForm open={open} slide={slide} />
        ) : (
          <QuestionForm open={open} slide={slide} />
        )
      ) : (
        <>
          {slide.draw && (
            <p className="draw-note" data-testid="draw-note" role="note">
              {describeDraw(slide, open.project.banks)}
            </p>
          )}
          <Stage open={open} current={current} />
        </>
      )}
    </div>
  );
}

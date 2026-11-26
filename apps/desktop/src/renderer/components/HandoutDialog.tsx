import type { Project } from '@vedraopus/model';
import { createRenderContext, renderSlide, toMarkup } from '@vedraopus/render';
import { useState } from 'react';
import type { SessionInfo } from '../../shared/ipc';
import { t } from '../../shared/strings';
import { handoutSlides, notesParagraphs } from '../handout';
import type { HandoutOptions } from '../handout';
import { editorAssetUrl } from '../project-store';
import { takeFocus } from './dialog-focus';
import { Handout } from './Handout';

/** Wait until every picture in the handout has loaded (or failed), so the PDF has them. */
async function picturesLoaded(): Promise<void> {
  const pictures = [...document.querySelectorAll<HTMLImageElement>('.print-handout img')];
  await Promise.all(
    pictures.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          }),
    ),
  );
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
}

/**
 * File → Export Handout… (docs/briefs/P11.3-video-and-handout.md, part A): the
 * layout and slides, then a PDF printed from the handout drawn in this page.
 */
export function HandoutDialog({
  project,
  session,
  currentSceneId,
  onClose,
}: {
  project: Project;
  session: SessionInfo;
  currentSceneId: string | null;
  onClose: () => void;
}) {
  const [options, setOptions] = useState<HandoutOptions>({ layout: 'notes', sceneId: null });
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const exportPdf = async () => {
    setBusy(true);
    try {
      await picturesLoaded();
      setSaved(await window.vedraopus.project.exportHandout({ defaultName: project.title }));
    } finally {
      setBusy(false);
    }
  };
  /** The handout as a Word document: main draws each slide's markup and writes the file. */
  const exportWord = async () => {
    setBusy(true);
    try {
      const { theme, stage, assets, masters } = project;
      const context = createRenderContext(
        { theme, stage, assets, masters },
        {
          assetUrl: (hash) => editorAssetUrl(session, { assets, stage }, hash),
          idPrefix: 'word-',
        },
      );
      setSaved(
        await window.vedraopus.project.exportHandoutDocument({
          defaultName: project.title,
          title: project.title,
          language: project.player.labels.language,
          layout: options.layout,
          stage: { width: stage.width, height: stage.height },
          slides: handoutSlides(project, options.sceneId).map(({ slide, number }) => ({
            number,
            title: slide.title,
            notes: notesParagraphs(slide.notes),
            markup: toMarkup(renderSlide(slide, context)),
          })),
        }),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="dialog-backdrop" role="presentation">
        <div
          className="dialog handout-dialog"
          ref={takeFocus}
          tabIndex={-1}
          role="dialog"
          aria-label={t('handout.title')}
          data-testid="handout-dialog"
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose();
          }}
        >
          <h2>{t('handout.title')}</h2>
          <fieldset>
            <legend>{t('handout.layout')}</legend>
            <label>
              <input
                type="radio"
                name="handout-layout"
                checked={options.layout === 'notes'}
                onChange={() => setOptions({ ...options, layout: 'notes' })}
              />
              {t('handout.layoutNotes')}
            </label>
            <label>
              <input
                type="radio"
                name="handout-layout"
                checked={options.layout === 'lines'}
                onChange={() => setOptions({ ...options, layout: 'lines' })}
              />
              {t('handout.layoutLines')}
            </label>
          </fieldset>
          <fieldset>
            <legend>{t('handout.slides')}</legend>
            <label>
              <input
                type="radio"
                name="handout-scope"
                checked={options.sceneId === null}
                onChange={() => setOptions({ ...options, sceneId: null })}
              />
              {t('handout.allSlides')}
            </label>
            <label>
              <input
                type="radio"
                name="handout-scope"
                disabled={currentSceneId === null}
                checked={options.sceneId !== null}
                onChange={() => setOptions({ ...options, sceneId: currentSceneId })}
              />
              {t('handout.thisScene')}
            </label>
          </fieldset>
          {saved !== null && (
            <p role="status" className="muted">
              {t('handout.saved', { path: saved })}
            </p>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void exportPdf()}
            >
              {t('handout.export')}
            </button>
            <button type="button" disabled={busy} onClick={() => void exportWord()}>
              {t('handout.exportWord')}
            </button>
            <button type="button" onClick={onClose}>
              {t('handout.close')}
            </button>
          </div>
        </div>
      </div>
      <Handout project={project} session={session} options={options} />
    </>
  );
}

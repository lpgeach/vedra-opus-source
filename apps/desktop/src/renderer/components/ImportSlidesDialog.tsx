import type { Project } from '@vedraopus/model';
import { useState } from 'react';
import { t } from '../../shared/strings';
import { editor } from '../project-store';
import type { SlideImportSummary } from '../project-store';
import { takeFocus } from './dialog-focus';

/**
 * File → Import Slides… (docs/briefs/P11.2-templates.md, part B): another
 * project's scenes and slides, to tick and copy in after the current slide.
 */
export function ImportSlidesDialog({
  source,
  onClose,
}: {
  source: { fileName: string; project: Project };
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [summary, setSummary] = useState<SlideImportSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const allIds = source.project.scenes.flatMap((scene) => scene.slides.map((slide) => slide.id));
  const toggle = (id: string) =>
    setChosen((now) => {
      const next = new Set(now);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const run = async () => {
    setBusy(true);
    try {
      setSummary(await editor.importSlides(allIds.filter((id) => chosen.has(id))));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        className="dialog import-slides"
        ref={takeFocus}
        tabIndex={-1}
        role="dialog"
        aria-label={t('importSlides.title')}
        data-testid="import-slides"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
      >
        <h2>{t('importSlides.title')}</h2>
        {summary ? (
          <>
            <p role="status">
              {summary.slides === 1
                ? t('importSlides.doneOne')
                : t('importSlides.done', { slides: summary.slides })}
            </p>
            <p>
              {t('importSlides.added', {
                masters: summary.masters,
                variables: summary.variables,
                banks: summary.banks,
                media: summary.media,
              })}
            </p>
            {summary.dropped.length > 0 && (
              <>
                <p>{t('importSlides.dropped')}</p>
                <ul className="import-report-list" data-testid="import-slides-dropped">
                  {summary.dropped.map((line, index) => (
                    <li key={index}>{line}.</li>
                  ))}
                </ul>
              </>
            )}
            <div className="dialog-actions">
              <button type="button" onClick={onClose}>
                {t('importSlides.close')}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">{t('importSlides.from', { file: source.fileName })}</p>
            <div className="dialog-actions import-slides-quick">
              <button type="button" onClick={() => setChosen(new Set(allIds))}>
                {t('importSlides.all')}
              </button>
              <button type="button" onClick={() => setChosen(new Set())}>
                {t('importSlides.none')}
              </button>
              <span className="muted">{t('importSlides.chosen', { count: chosen.size })}</span>
            </div>
            <div className="import-slides-list">
              {source.project.scenes.map((scene) => (
                <fieldset key={scene.id}>
                  <legend>{t('importSlides.scene', { title: scene.title })}</legend>
                  {scene.slides.map((slide, index) => (
                    <label key={slide.id}>
                      <input
                        type="checkbox"
                        checked={chosen.has(slide.id)}
                        onChange={() => toggle(slide.id)}
                      />
                      {`${index + 1}. ${slide.title}`}
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
            <div className="dialog-actions">
              <button
                type="button"
                className="primary"
                disabled={chosen.size === 0 || busy}
                onClick={() => void run()}
              >
                {t('importSlides.import')}
              </button>
              <button type="button" onClick={onClose}>
                {t('importSlides.cancel')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

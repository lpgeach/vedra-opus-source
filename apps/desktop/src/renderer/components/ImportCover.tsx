import type { ImportProgress } from '../../shared/ipc';
import { t } from '../../shared/strings';
import { takeFocus } from './dialog-focus';

/**
 * The cover over the whole window while a Storyline course or a PowerPoint deck imports
 * (docs/briefs/B7-import-progress.md): what is happening, how far it is, and nothing
 * underneath can be clicked or typed into until it ends.
 */

/**
 * Where each stage starts and ends in the whole, by importer: their stages come in a different
 * order. Media fill most of it, as they take most of the time.
 */
const SHARE: Record<ImportProgress['source'], Record<ImportProgress['stage'], [number, number]>> = {
  // Reading, media, slides, checking.
  storyline: {
    reading: [0, 0.05],
    media: [0.05, 0.9],
    slides: [0.9, 0.97],
    checking: [0.97, 1],
    drawing: [0.9, 0.9],
  },
  // Reading, slides, drawing with LibreOffice, media.
  powerpoint: {
    reading: [0, 0.05],
    slides: [0.05, 0.1],
    drawing: [0.1, 0.35],
    media: [0.35, 1],
    checking: [1, 1],
  },
};

/** How far the whole import is, from 0 to 1: a stage's start, and media by files done. */
export function overallFraction(progress: ImportProgress): number {
  const [from, to] = SHARE[progress.source][progress.stage];
  if (progress.stage !== 'media' || progress.total === 0) return from;
  const files = Math.min(progress.total, progress.done + (progress.fraction ?? 0));
  return from + (to - from) * (files / progress.total);
}

function stageWords(progress: ImportProgress): string {
  // Each key in its own `t('…')`: the catalogue test finds keys by that pattern.
  switch (progress.stage) {
    case 'reading':
      return progress.source === 'storyline'
        ? t('importCover.readingStoryline')
        : t('importCover.readingPowerPoint');
    case 'slides':
      return t('importCover.slides');
    case 'drawing':
      return t('importCover.drawing');
    case 'media':
      return t('importCover.media', {
        done: Math.min(progress.total, progress.done + 1),
        total: progress.total,
      });
    case 'checking':
      return t('importCover.checking');
  }
}

export function ImportCover({ progress }: { progress: ImportProgress }) {
  const title =
    progress.source === 'storyline'
      ? t('importCover.titleStoryline')
      : t('importCover.titlePowerPoint');
  const overall = Math.round(overallFraction(progress) * 100);
  const file = progress.stage === 'media' ? progress.file : undefined;
  const fileShare = Math.round((progress.fraction ?? 0) * 100);
  return (
    <div className="import-cover" data-testid="import-cover" role="presentation">
      <div
        className="import-cover-panel"
        ref={takeFocus}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-busy="true"
        aria-label={title}
        // Nothing underneath takes keys while the import runs, and Tab stays here.
        onKeyDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <h2>{title}</h2>
        <p className="import-cover-name">{progress.name}</p>
        <p
          className="import-cover-stage"
          role="status"
          aria-live="polite"
          data-testid="import-cover-stage"
        >
          {stageWords(progress)}
        </p>
        <div
          className="import-cover-bar"
          role="progressbar"
          aria-label={t('importCover.overall')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={overall}
        >
          <span style={{ width: `${overall}%` }} />
        </div>
        {file !== undefined && (
          <>
            <p className="import-cover-file" data-testid="import-cover-file">
              {file}
            </p>
            <div
              className="import-cover-bar small"
              role="progressbar"
              aria-label={t('importCover.file')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={fileShare}
            >
              <span style={{ width: `${fileShare}%` }} />
            </div>
          </>
        )}
        <p className="import-cover-note">{t('importCover.note')}</p>
      </div>
    </div>
  );
}

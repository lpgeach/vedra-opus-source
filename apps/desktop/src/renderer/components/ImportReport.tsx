import { useState } from 'react';
import type { PowerPointReport, PowerPointReportItem } from '../../shared/ipc';
import { t } from '../../shared/strings';
import { takeFocus } from './dialog-focus';

/**
 * What an import could not bring across exactly as it was: a PowerPoint deck
 * (docs/briefs/P11.1-pptx-import.md) or a Storyline course (B5). Shown once the new
 * project is open, and copied as text for the author's notes.
 */

export type ImportSource = 'powerpoint' | 'storyline';

const outcomeWords = (outcome: PowerPointReportItem['outcome']) =>
  outcome === 'approximated'
    ? t('importReport.approximated')
    : outcome === 'placeholder'
      ? t('importReport.placeholder')
      : t('importReport.skipped');

const where = (item: PowerPointReportItem, source: ImportSource) =>
  item.slide === null
    ? source === 'storyline'
      ? t('importReport.course')
      : t('importReport.deck')
    : t('importReport.slide', { n: item.slide });

export function reportText(report: PowerPointReport, source: ImportSource = 'powerpoint'): string {
  return report
    .map((item) => `${where(item, source)}: ${outcomeWords(item.outcome)}: ${item.what}.`)
    .join('\n');
}

export function ImportReport({
  report,
  source = 'powerpoint',
  onClose,
}: {
  report: PowerPointReport;
  source?: ImportSource;
  onClose: () => void;
}) {
  // Each key in its own `t('…')`: the catalogue test finds keys by that pattern.
  const title = source === 'storyline' ? t('importReport.titleStoryline') : t('importReport.title');
  const [copied, setCopied] = useState(false);
  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        className="dialog import-report"
        ref={takeFocus}
        tabIndex={-1}
        role="dialog"
        aria-label={title}
        data-testid="import-report"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
      >
        <h2>{title}</h2>
        <p role="status">
          {report.length === 0
            ? source === 'storyline'
              ? t('importReport.allCameStoryline')
              : t('importReport.allCame')
            : report.length === 1
              ? t('importReport.one')
              : t('importReport.many', { count: report.length })}
        </p>
        {report.length > 0 && (
          <ul className="import-report-list">
            {report.map((item, index) => (
              <li key={index} data-testid="import-report-item">
                <span className="import-report-where">{where(item, source)}</span>
                <span className="import-report-outcome">{outcomeWords(item.outcome)}</span>
                <span>{item.what}.</span>
              </li>
            ))}
          </ul>
        )}
        <div className="dialog-actions">
          {report.length > 0 && (
            <button
              type="button"
              onClick={() => {
                void window.vedraopus.clipboard
                  .write(reportText(report, source))
                  .then(() => setCopied(true));
              }}
            >
              {copied ? t('importReport.copied') : t('importReport.copy')}
            </button>
          )}
          <button type="button" onClick={onClose}>
            {t('importReport.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

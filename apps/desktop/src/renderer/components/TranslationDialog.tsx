import {
  applyTranslation,
  fromTaggedText,
  LANGUAGE_TAG,
  readXliff,
  taggedText,
  TranslationFileError,
  translationUnits,
  writeXliff,
} from '@vedraopus/model';
import type { Project, TranslatedUnit, TranslationResult } from '@vedraopus/model';
import { useState } from 'react';
import type { OpenedTranslation } from '../../shared/ipc';
import type { OpenProject } from '../project-store';
import { takeFocus } from './dialog-focus';

/**
 * File → Translation… (docs/briefs/P10.3-translation.md): send the course's
 * words out as XLIFF or as a two-column Word document, and bring a translation
 * back into this project, as one undo step. The author keeps one project per
 * language.
 */

/** A message from main without Electron's "Error invoking remote method" in front. */
const messageOf = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).replace(
    /^Error invoking remote method '[^']+': (?:\w*Error: )?/,
    '',
  );

/** What an opened file holds, as units and the language it is in. */
function unitsOf(file: OpenedTranslation): { units: TranslatedUnit[]; language: string } {
  if (file.kind === 'xliff') {
    const document = readXliff(file.text);
    return { units: document.units, language: document.targetLanguage };
  }
  return {
    language: file.targetLanguage,
    units: file.rows.map((row) => ({
      id: row.id,
      source: fromTaggedText(row.source),
      target: row.target.trim() ? fromTaggedText(row.target) : null,
    })),
  };
}

type Outcome =
  | { kind: 'none' }
  | { kind: 'exported'; path: string; units: number }
  | { kind: 'imported'; fileName: string; language: string; result: TranslationResult }
  | { kind: 'failed'; message: string };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A file name from the course title and the language: `safety-at-work-fr.xlf`. */
function fileName(project: Project, language: string, extension: 'xlf' | 'docx'): string {
  const slug =
    project.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'course';
  return `${slug}-${language}.${extension}`;
}

export function resultWords(result: TranslationResult): string {
  const total =
    result.translated + result.changed + result.missing + result.untranslated + result.invalid;
  const parts = [`Translated ${result.translated} of ${plural(total, 'piece', 'pieces')} of text.`];
  if (result.changed) {
    parts.push(
      `${plural(result.changed, 'was', 'were')} changed in the course after export, so left as it is.`,
    );
  }
  if (result.missing) parts.push(`${plural(result.missing, 'is', 'are')} no longer in the course.`);
  if (result.untranslated) {
    parts.push(`${plural(result.untranslated, 'was', 'were')} not translated in the file.`);
  }
  if (result.invalid) {
    parts.push(
      `${plural(result.invalid, 'could', 'could')} not be used: unknown formatting tags, or too long or empty for where it goes.`,
    );
  }
  return parts.join(' ');
}

export function TranslationDialog({ open, onClose }: { open: OpenProject; onClose: () => void }) {
  const { project, history } = open;
  const source = project.player.labels.language;
  const [target, setTarget] = useState('');
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'none' });
  const [busy, setBusy] = useState(false);
  const targetValid = LANGUAGE_TAG.test(target) && target.toLowerCase() !== source.toLowerCase();

  const exportAs = async (format: 'xliff' | 'document') => {
    if (!targetValid) return;
    setBusy(true);
    try {
      const units = translationUnits(project);
      const path =
        format === 'xliff'
          ? await window.vedraopus.project.saveTranslation({
              defaultName: fileName(project, target, 'xlf'),
              text: writeXliff(units, {
                sourceLanguage: source,
                targetLanguage: target,
                original: project.title,
              }),
            })
          : await window.vedraopus.project.saveTranslationDocument({
              defaultName: fileName(project, target, 'docx'),
              title: project.title.trim() || 'Course',
              sourceLanguage: source,
              targetLanguage: target,
              rows: units.map((unit) => ({
                id: unit.id,
                source: taggedText(unit.source),
                note: unit.note,
              })),
            });
      if (path) setOutcome({ kind: 'exported', path, units: units.length });
    } catch (error) {
      setOutcome({ kind: 'failed', message: messageOf(error) });
    } finally {
      setBusy(false);
    }
  };

  const importTranslation = async () => {
    setBusy(true);
    try {
      const file = await window.vedraopus.project.openTranslation();
      if (!file) return;
      const { units, language } = unitsOf(file);
      if (!LANGUAGE_TAG.test(language)) {
        throw new TranslationFileError(
          `The file’s target language, “${language}”, is not a language tag.`,
        );
      }
      // What it will do, worked out on a copy; then done as one undo step.
      const result = applyTranslation(structuredClone(project), units, language);
      history.execute('project.translate', { units, language });
      setOutcome({ kind: 'imported', fileName: file.fileName, language, result });
    } catch (error) {
      setOutcome({
        kind: 'failed',
        message:
          error instanceof TranslationFileError
            ? error.message
            : `The translation could not be read: ${messageOf(error)}`,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        className="dialog translation-dialog"
        ref={takeFocus}
        tabIndex={-1}
        role="dialog"
        aria-label="Translation"
        data-testid="translation-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !busy) onClose();
        }}
      >
        <h2>Translation</h2>
        <p className="muted">
          Export the course’s words as XLIFF for a translation tool, or as a Word document with a
          column for the translation, then import the translated file. Importing replaces this
          project’s words, as one step you can undo: save the translated course under a new name to
          keep both.
        </p>
        <p>
          Course language: <strong>{source}</strong>
        </p>
        <label className="field">
          <span>Translate into</span>
          <input
            aria-label="Translate into"
            placeholder="A language tag, such as fr or pt-BR"
            value={target}
            onChange={(event) => setTarget(event.target.value.trim())}
          />
        </label>
        {target !== '' && !targetValid && (
          <p className="field-problem" role="alert">
            {LANGUAGE_TAG.test(target)
              ? 'That is the course’s own language.'
              : 'Use a language tag, such as fr, de or pt-BR.'}
          </p>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            disabled={!targetValid || busy}
            onClick={() => void exportAs('xliff')}
          >
            Export XLIFF…
          </button>
          <button
            type="button"
            disabled={!targetValid || busy}
            onClick={() => void exportAs('document')}
          >
            Export Word document…
          </button>
          <button type="button" disabled={busy} onClick={() => void importTranslation()}>
            Import translation…
          </button>
          <button type="button" disabled={busy} onClick={onClose}>
            Close
          </button>
        </div>
        {outcome.kind === 'exported' && (
          <p role="status" data-testid="translation-result">
            Exported {plural(outcome.units, 'piece', 'pieces')} of text to {outcome.path}.
          </p>
        )}
        {outcome.kind === 'imported' && (
          <p role="status" data-testid="translation-result">
            From {outcome.fileName}, into {outcome.language}: {resultWords(outcome.result)}
          </p>
        )}
        {outcome.kind === 'failed' && (
          <p role="alert" className="field-problem" data-testid="translation-error">
            {outcome.message}
          </p>
        )}
      </div>
    </div>
  );
}

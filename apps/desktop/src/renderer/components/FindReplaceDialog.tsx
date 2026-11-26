import { useState } from 'react';
import { editor } from '../project-store';
import type { OpenProject } from '../project-store';
import { findInProject, objectText, replaceIn } from '../find-replace';
import type { TextMatch } from '../find-replace';
import { everySlide, forEachObject, slideLayers } from '@vedraopus/model';
import { takeFocus } from './dialog-focus';

/**
 * Home → Find and Replace (docs/briefs/B17-ribbon-and-panels.md): the objects whose text holds
 * the words, each one a click away, and Replace All as one undoable step.
 */
export function FindReplaceDialog({ open, onClose }: { open: OpenProject; onClose: () => void }) {
  const [words, setWords] = useState('');
  const [replacement, setReplacement] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const matches = findInProject(open.project, words, matchCase);
  const total = matches.reduce((sum, match) => sum + match.count, 0);

  const show = (match: TextMatch) => {
    editor.setView('slide');
    editor.selectSlide(match.slideId);
    editor.editLayer(match.layerId);
    editor.select([match.objectId]);
  };

  const replaceAll = () => {
    const { history } = open;
    let count = 0;
    editor.beginGesture('Replace all');
    try {
      for (const { slide } of everySlide(history.project)) {
        for (const { layer } of slideLayers(slide)) {
          forEachObject(layer.objects, (object) => {
            const doc = objectText(object);
            if (!doc) return;
            const replaced = replaceIn(doc, words, replacement, matchCase);
            if (replaced.count === 0) return;
            count += replaced.count;
            history.execute('object.update', {
              objectId: object.id,
              changes: { props: { text: replaced.doc } } as never,
            });
          });
        }
      }
    } finally {
      editor.commitGesture();
    }
    setDone(`Replaced ${count} ${count === 1 ? 'time' : 'times'}.`);
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        className="dialog find-replace"
        ref={takeFocus}
        tabIndex={-1}
        role="dialog"
        aria-label="Find and Replace"
        data-testid="find-replace"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
      >
        <h2>Find and Replace</h2>
        <label className="field">
          <span>Find</span>
          <input
            aria-label="Find"
            value={words}
            autoFocus
            onChange={(event) => {
              setWords(event.target.value);
              setDone(null);
            }}
          />
        </label>
        <label className="field">
          <span>Replace with</span>
          <input
            aria-label="Replace with"
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={matchCase}
            onChange={(event) => setMatchCase(event.target.checked)}
          />
          Match case
        </label>
        <p className="muted" data-testid="find-count" aria-live="polite">
          {done ??
            (words === ''
              ? 'Type the words to find in the course’s text.'
              : total === 0
                ? 'Not found.'
                : `${total} ${total === 1 ? 'match' : 'matches'} in ${matches.length} ${
                    matches.length === 1 ? 'object' : 'objects'
                  }.`)}
        </p>
        {matches.length > 0 && (
          <ul className="find-results" aria-label="Matches">
            {matches.map((match) => (
              <li key={match.objectId}>
                <button className="menu-item" onClick={() => show(match)}>
                  <strong>{match.slideTitle}</strong> · {match.objectName}
                  <span className="muted"> · {match.text.slice(0, 60)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="dialog-actions">
          <button className="primary" disabled={total === 0} onClick={replaceAll}>
            Replace All
          </button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

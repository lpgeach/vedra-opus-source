import { notesFromText, notesText } from '@vedraopus/model';
import { useState } from 'react';
import type { CurrentSlide, OpenProject } from '../project-store';

/**
 * The slide's notes (docs/briefs/P8.2-player-tabs.md): plain text, a
 * paragraph a line, saved as one undo step when the box loses focus. The
 * course shows them in its Notes tab.
 */
export function NotesPanel({ open, current }: { open: OpenProject; current: CurrentSlide }) {
  const { slide } = current;
  const saved = notesText(slide.notes);
  const [text, setText] = useState(saved);
  const [shown, setShown] = useState({ slideId: slide.id, saved });
  // Another slide, or an undo: show what the document has now.
  if (shown.slideId !== slide.id || shown.saved !== saved) {
    setShown({ slideId: slide.id, saved });
    setText(saved);
  }
  const commit = () => {
    if (text === saved) return;
    open.history.execute('slide.setNotes', { slideId: slide.id, notes: notesFromText(text) });
  };
  return (
    <div className="notes-panel">
      <textarea
        aria-label="Slide notes"
        data-testid="slide-notes"
        placeholder="Notes for this slide. Learners see them in the course's Notes tab."
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
      />
    </div>
  );
}

import type { Editor } from '@tiptap/core';

let current: Editor | null = null;
const listeners = new Set<() => void>();
/** Goes up whenever the active editor, its content or its selection changes. */
let version = 0;

/**
 * Formatting asked for before the editor existed, for the edit about to start.
 * It is applied to each editor that opens for that edit, once: in development
 * React (and the editor library with it) opens an editor, throws it away and
 * opens another, possibly a little later. It is forgotten when the edit ends.
 */
let pending: ((editor: Editor) => void) | null = null;
let appliedTo = new WeakSet<Editor>();

/** Run `change` on the text editor as soon as one opens (it is about to). */
export function whenTextEditorOpens(change: (editor: Editor) => void): void {
  pending = change;
  appliedTo = new WeakSet();
}

/** The edit has ended: nothing is waiting any more. */
export function forgetPendingTextFormat(): void {
  pending = null;
}

/** Editors already watched for being destroyed. */
const watched = new WeakSet<Editor>();

export function setActiveTextEditor(editor: Editor | null): void {
  // A closing editor can still report a last transaction (its blur) after the
  // edit has ended. It must not become the active one again: the ribbon would
  // send its next change into an editor that is about to go, and lose it.
  if (editor?.isDestroyed) return;
  if (editor && !watched.has(editor)) {
    watched.add(editor);
    editor.on('destroy', () => {
      if (current === editor) setActiveTextEditor(null);
    });
  }
  if (editor && pending && !appliedTo.has(editor)) {
    appliedTo.add(editor);
    const change = pending;
    // After the editor has placed its caret: moving the caret would drop the formatting.
    queueMicrotask(() => {
      if (!editor.isDestroyed) change(editor);
    });
  }
  // Called on every transaction too: the editor is the same object, but what
  // the ribbon shows about it (bold on or off, font size) may have changed.
  current = editor;
  version += 1;
  for (const listener of listeners) listener();
}

/**
 * Give the editor keyboard focus now. The editor library's `focus` command
 * places the caret at once but moves focus only on the next frame, so a key
 * pressed straight after editing starts, or straight after a ribbon tool,
 * went to whatever had focus before. Call it after that command, outside render.
 */
export function focusTextNow(editor: Editor): void {
  if (!editor.isDestroyed && !editor.view.hasFocus()) editor.view.focus();
}

export function getActiveTextEditor(): Editor | null {
  return current;
}

export function subscribeActiveTextEditor(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTextEditorVersion(): number {
  return version;
}

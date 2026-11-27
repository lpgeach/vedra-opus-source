import type { RichText } from '@vedraopus/model';
import { Editor } from '@tiptap/core';
import { richTextExtensions } from './textExtensions';

let hidden: Editor | null = null;
let loaded: RichText | null = null;

/**
 * An editor that is never shown, holding `doc` with all of it selected. It
 * lets the ribbon format a whole text box that is selected but not being
 * edited: run a command on it, then save `getJSON()` to the object.
 */
export function wholeTextEditor(doc: RichText): Editor {
  hidden ??= new Editor({
    element: document.createElement('div'),
    extensions: richTextExtensions(),
  });
  if (loaded !== doc) {
    hidden.commands.setContent(doc, { emitUpdate: false });
    loaded = doc;
  }
  hidden.commands.setTextSelection(wholeRange(hidden));
  return hidden;
}

/**
 * From the first text position to the last. An ordinary text selection, not
 * "select all": list commands look for the list around the selection's ends,
 * and an all-document selection has nothing around it, so lists could be
 * turned on but never off.
 */
export function wholeRange(editor: Editor): { from: number; to: number } {
  return { from: 0, to: editor.state.doc.content.size };
}

/** Call after saving the hidden editor's content, so the next read reloads the stored document. */
export function forgetWholeText(): void {
  loaded = null;
}

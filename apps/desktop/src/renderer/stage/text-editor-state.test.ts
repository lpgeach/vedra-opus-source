// @vitest-environment happy-dom
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getActiveTextEditor,
  setActiveTextEditor,
  subscribeActiveTextEditor,
} from './text-editor-state';
import { richTextExtensions } from './textExtensions';

const editors: Editor[] = [];
const makeEditor = () => {
  const editor = new Editor({ extensions: richTextExtensions(), content: '<p>Text</p>' });
  editors.push(editor);
  return editor;
};

afterEach(() => {
  setActiveTextEditor(null);
  for (const editor of editors.splice(0)) if (!editor.isDestroyed) editor.destroy();
});

describe('the active text editor', () => {
  it('is forgotten, and the ribbon told, when it is destroyed', () => {
    const editor = makeEditor();
    setActiveTextEditor(editor);
    let told = 0;
    const stop = subscribeActiveTextEditor(() => (told += 1));
    editor.destroy();
    stop();
    expect(getActiveTextEditor()).toBeNull();
    expect(told).toBe(1);
  });

  it('is not brought back by a closing editor’s last transaction', () => {
    // The edit ends, then the closing editor reports once more (its blur), then goes.
    const editor = makeEditor();
    setActiveTextEditor(editor);
    setActiveTextEditor(null);
    setActiveTextEditor(editor);
    editor.destroy();
    expect(getActiveTextEditor()).toBeNull();
    // And a report from it after it has gone is ignored.
    setActiveTextEditor(editor);
    expect(getActiveTextEditor()).toBeNull();
  });

  it('stays when another editor, no longer active, is destroyed', () => {
    const first = makeEditor();
    const second = makeEditor();
    setActiveTextEditor(first);
    setActiveTextEditor(second);
    first.destroy();
    expect(getActiveTextEditor()).toBe(second);
  });
});

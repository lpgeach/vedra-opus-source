import type { Frame, RichText, SceneObject } from '@vedraopus/model';
import { TEXT_CLASS, applyTextAutofit, measureGrowHeight } from '@vedraopus/render';
import type { RenderContext } from '@vedraopus/render';
import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { richTextExtensions } from './textExtensions';
import { focusTextNow, getActiveTextEditor, setActiveTextEditor } from './text-editor-state';

interface TextEditorProps {
  object: SceneObject & { type: 'text' | 'shape' | 'button' | 'table' };
  doc: RichText;
  /** Padding inside the object frame, in stage units. */
  padding: number;
  /** Container alignment for shapes/buttons vs text boxes. */
  align: 'center' | 'start';
  autofit: 'none' | 'shrinkText' | 'growShape';
  context: RenderContext;
  onCommit: (doc: RichText, framePatch?: Partial<Frame>) => void;
  onCancel: () => void;
}

function baseStyle(object: SceneObject, growHeight: number | null): React.CSSProperties {
  const { x, y, width, height, rotation } = object.frame;
  const h = growHeight ?? height;
  return {
    position: 'absolute',
    left: x,
    top: y,
    width: width,
    height: h,
    transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
    transformOrigin: 'center center',
    zIndex: 5,
    cursor: 'text',
  };
}

export function TextEditor({
  object,
  doc,
  padding,
  align,
  autofit,
  context,
  onCommit,
  onCancel,
}: TextEditorProps) {
  const committed = useRef(false);
  const latest = useRef<RichText>(doc);
  const rootRef = useRef<HTMLDivElement>(null);
  const [growHeight, setGrowHeight] = useState<number | null>(null);
  const growHeightRef = useRef<number | null>(null);

  const editor = useEditor({
    extensions: richTextExtensions(),
    content: doc,
    editorProps: {
      attributes: {
        class: TEXT_CLASS,
        style: [
          `font-family:'${context.theme.fonts.body.replace(/['\\]/g, '')}', sans-serif`,
          'font-size:18px',
          'line-height:1.3',
          `color:${context.theme.colors.text}`,
          'outline:none',
          'min-height:1em',
          'width:100%',
          align === 'center' ? 'text-align:center' : '',
        ]
          .filter(Boolean)
          .join(';'),
      },
    },
    onUpdate: ({ editor: ed }) => {
      latest.current = ed.getJSON() as RichText;
      setActiveTextEditor(ed);
    },
    onSelectionUpdate: ({ editor: ed }) => {
      setActiveTextEditor(ed);
    },
    onTransaction: ({ editor: ed }) => {
      setActiveTextEditor(ed);
    },
  });

  useEffect(() => {
    if (!editor) return;
    setActiveTextEditor(editor);
    editor.commands.focus('end');
    focusTextNow(editor);
    return () => {
      if (getActiveTextEditor() === editor) setActiveTextEditor(null);
    };
  }, [editor]);

  const syncAutofit = () => {
    const root = rootRef.current;
    if (!root) return;
    const block = root.querySelector<HTMLElement>('.vo-text');
    if (autofit === 'shrinkText' && block) {
      block.setAttribute('data-autofit', 'shrinkText');
      block.setAttribute('data-align', align);
      applyTextAutofit(root);
    } else if (block) {
      block.setAttribute('data-autofit', autofit !== 'none' ? autofit : '');
      const content = root.querySelector<HTMLElement>('.vo-rich-text');
      if (content) {
        content.style.transform = '';
        content.style.transformOrigin = '';
      }
    }
    if (autofit === 'growShape' && object.type === 'text' && block) {
      const needed = measureGrowHeight(block, padding, object.frame.height);
      if (needed != null) {
        growHeightRef.current = needed;
        setGrowHeight(needed);
      }
    }
  };

  useLayoutEffect(() => {
    syncAutofit();
  });

  // Commit what was typed when the editor goes away without Escape (focus moved,
  // slide changed). In development React StrictMode mounts, unmounts and remounts
  // every component at once; that fake unmount must not end the edit, so the
  // commit waits a microtask and is skipped if the component came straight back.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      queueMicrotask(() => {
        if (mounted.current) return;
        if (!committed.current) {
          committed.current = true;
          if (getActiveTextEditor() === editor) setActiveTextEditor(null);
          const framePatch =
            autofit === 'growShape' && object.type === 'text' && growHeightRef.current
              ? { height: growHeightRef.current }
              : undefined;
          onCommit(latest.current, framePatch);
        } else if (editor && getActiveTextEditor() === editor) {
          setActiveTextEditor(null);
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!editor) return null;

  const framePatch = () =>
    autofit === 'growShape' && object.type === 'text' && growHeightRef.current
      ? { height: growHeightRef.current }
      : undefined;

  const commit = () => {
    if (committed.current) return;
    syncAutofit();
    committed.current = true;
    if (getActiveTextEditor() === editor) setActiveTextEditor(null);
    onCommit(editor.getJSON() as RichText, framePatch());
  };
  const cancel = () => {
    if (committed.current) return;
    committed.current = true;
    if (getActiveTextEditor() === editor) setActiveTextEditor(null);
    onCancel();
  };

  const style = baseStyle(object, autofit === 'growShape' ? growHeight : null);

  return (
    <div
      ref={rootRef}
      className="text-editor-overlay"
      data-testid="text-editor"
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          if (e.shiftKey) cancel();
          else commit();
        }
      }}
    >
      <div
        className="vo-text"
        data-align={align}
        data-autofit={autofit !== 'none' ? autofit : undefined}
        style={{
          position: 'absolute',
          inset: 0,
          boxSizing: 'border-box',
          padding: `${padding}px`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: align === 'center' ? 'center' : 'flex-start',
          overflow: 'hidden',
        }}
      >
        <EditorContent editor={editor} style={{ width: '100%' }} />
      </div>
    </div>
  );
}

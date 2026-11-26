import {
  BUILT_IN_VARIABLES,
  placeholdersMissingFrom,
  shapePreset,
  shapePresetLabel,
  shapePresetNames,
} from '@vedraopus/model';
import type { FreeformKind, Question, RichText, ShapeGeometry } from '@vedraopus/model';
import { closedPath } from '@vedraopus/render';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import { OFF_SLIDE, PANELS, THEMES } from '../../shared/settings';
import { t } from '../../shared/strings';
import type { OffSlide, PanelName, ThemeChoice } from '../../shared/settings';
import {
  cancelFormatPainter,
  canPickFormat,
  pickFormat,
  useFormatPainter,
} from '../format-painter';
import { currentSlide, editedSlide, editor, getEditorState, useEditor } from '../project-store';
import type { RibbonTab } from '../project-store';
import { forgetWholeText, wholeRange, wholeTextEditor } from '../stage/whole-text';
import type { Editor as TextEditorInstance } from '@tiptap/core';
import { stage } from '../stage/actions';
import { ui, useSettings } from '../ui-store';
import {
  focusTextNow,
  getActiveTextEditor,
  getTextEditorVersion,
  subscribeActiveTextEditor,
  whenTextEditorOpens,
} from '../stage/text-editor-state';
import { Icon } from './icons';
import type { IconName } from './icons';
import { AnimationsTab } from './AnimationsTab';
import { Command, Group } from './ribbon-parts';
import { Tabs } from './Tabs';
import { TransitionsTab } from './TransitionsTab';
import { PlayerDialog } from './PlayerDialog';
import { TrackingDialog } from './TrackingDialog';

/** The ribbon's tabs; their words are looked up as the ribbon draws, in the editor's language (P10.4). */
const RIBBON_TABS = [
  'home',
  'insert',
  'design',
  'transitions',
  'animations',
  'view',
] as const satisfies readonly RibbonTab[];
const tabWords = (id: RibbonTab) => ({ id, label: t(`ribbon.tab.${id}`) });

const PANEL_BUTTONS: Record<PanelName, { label: string; icon: IconName }> = {
  left: { label: 'Left Panel', icon: 'panelLeft' },
  bottom: { label: 'Bottom Panel', icon: 'panelBottom' },
  right: { label: 'Right Panel', icon: 'panelRight' },
};

const THEME_BUTTONS: Record<ThemeChoice, { label: string; icon: IconName }> = {
  system: { label: 'System', icon: 'system' },
  light: { label: 'Light', icon: 'light' },
  dark: { label: 'Dark', icon: 'dark' },
};

/** What the stage shows of objects past the slide's edges (B2). */
const OFF_SLIDE_BUTTONS: Record<OffSlide, { label: string; title: string; icon: IconName }> = {
  show: { label: 'Show', title: 'Show objects past the slide in full', icon: 'offSlideShow' },
  dim: { label: 'Dim', title: 'Show objects past the slide at half strength', icon: 'offSlideDim' },
  hide: {
    label: 'Hide',
    title: 'Hide objects past the slide, as the course does',
    icon: 'offSlideHide',
  },
};

/** The tabbed command area under the top bar. */
export function Ribbon() {
  const { ribbonTab, ribbonReturnTab } = useEditor();
  // The Text Format tab exists only while something with text is selected or
  // edited; when that ends, the ribbon goes back to the tab it came from.
  const hasText = currentTextObject() !== null;
  const tab = ribbonTab === 'text' && !hasText ? ribbonReturnTab : ribbonTab;
  const tabs = [...RIBBON_TABS, ...(hasText ? (['text'] as const) : [])].map(tabWords);
  return (
    <div className="ribbon" data-testid="ribbon">
      <Tabs
        label="Ribbon"
        className="ribbon-tabs"
        tabs={tabs}
        active={tab}
        onSelect={editor.setRibbonTab}
      />
      <div
        className="ribbon-commands"
        role="tabpanel"
        aria-label={tab}
        // In a narrow window the wheel scrolls the commands sideways (Phase 9 review).
        onWheel={(event) => {
          if (event.deltaX === 0 && event.deltaY !== 0)
            event.currentTarget.scrollLeft += event.deltaY;
        }}
      >
        {tab === 'home' && <HomeTab />}
        {tab === 'insert' && <InsertTab />}
        {tab === 'design' && <DesignTab />}
        {tab === 'transitions' && <TransitionsTab />}
        {tab === 'animations' && <AnimationsTab />}
        {tab === 'view' && <ViewTab />}
        {tab === 'text' && <TextTab />}
      </div>
    </div>
  );
}

function useActiveTextEditor() {
  // Re-render on every change inside the editor, not only when it opens or closes.
  useSyncExternalStore(subscribeActiveTextEditor, getTextEditorVersion, () => 0);
  return useSyncExternalStore(subscribeActiveTextEditor, getActiveTextEditor, () => null);
}

/** The selected (or edited) object, when it is one that carries text. */
function currentTextObject() {
  const { open, view, selectedSlideId, masterTargetId, editingTextId, selection } =
    getEditorState();
  if (!open) return null;
  const id = editingTextId ?? (selection.length === 1 ? selection[0] : null);
  if (!id) return null;
  const current = editedSlide(open.history.project, view, selectedSlideId, masterTargetId);
  const obj = current?.slide.baseLayer.objects.find((o) => o.id === id);
  if (!obj) return null;
  // Every shape can hold text (an empty one gets text when formatted or typed into).
  if (obj.type === 'text' || obj.type === 'button' || obj.type === 'shape') return obj;
  return null;
}

type Chain = ReturnType<TextEditorInstance['chain']>;

/** True when a document holds at least one character. */
function hasAnyText(doc: RichText): boolean {
  const visit = (node: { text?: string; content?: unknown[] }): boolean =>
    (typeof node.text === 'string' && node.text.length > 0) ||
    (node.content ?? []).some((child) => visit(child as { text?: string; content?: unknown[] }));
  return visit(doc as { content?: unknown[] });
}

/** The project's variables, then the built-in ones, by name. */
function variableNames(): string[] {
  const open = getEditorState().open;
  return [
    ...(open?.project.variables.map((variable) => variable.name) ?? []),
    ...BUILT_IN_VARIABLES.map((variable) => variable.name),
  ];
}

/** What a shape that has never had text starts from. */
const EMPTY_TEXT: RichText = { type: 'doc', content: [{ type: 'paragraph' }] };

/**
 * What the text tools act on: the text being edited on the stage (its current
 * selection), or, when a box is only selected, all of its text.
 */
function useTextTarget() {
  const active = useActiveTextEditor();
  void useEditor();
  const obj = currentTextObject();
  const doc = obj ? ((obj.props.text as RichText | null) ?? EMPTY_TEXT) : null;
  const ed = active ?? (doc ? wholeTextEditor(doc) : null);
  /**
   * `refocus` puts the caret back in the text afterwards. Fields the author
   * types into pass false, or each keystroke would take focus away from them.
   */
  const apply = (run: (chain: Chain) => Chain, refocus = true) => {
    if (active) {
      run(refocus ? active.chain().focus() : active.chain()).run();
      if (refocus) focusTextNow(active);
      return;
    }
    const open = getEditorState().open;
    if (!obj || !doc || !open) return;
    if (!hasAnyText(doc)) {
      // Nothing to format yet: start typing in it, with the formatting ready for
      // what is typed (as office apps do). A shape gets an empty paragraph first.
      if (obj.type === 'shape' && !obj.props.text) {
        open.history.execute('object.update', {
          objectId: obj.id,
          changes: { props: { text: EMPTY_TEXT } },
        });
      }
      whenTextEditorOpens((ed) => run(ed.chain().focus()).run());
      editor.startEditingText(obj.id);
      return;
    }
    const whole = wholeTextEditor(doc);
    run(whole.chain().setTextSelection(wholeRange(whole))).run();
    open.history.execute('object.update', {
      objectId: obj.id,
      changes: { props: { text: whole.getJSON() } },
    });
    forgetWholeText();
  };
  const refocus = () => {
    if (!active) return;
    active.commands.focus();
    focusTextNow(active);
  };
  return { ed, obj, editing: !!active, apply, refocus };
}

/**
 * A ribbon field the author types into. It shows what they are typing while it
 * has focus and the text's own value otherwise; Enter or Escape returns to the text.
 */
function RibbonField({
  label,
  value,
  onCommit,
  onDone,
  type = 'number',
  min,
  max,
  placeholder,
  list,
}: {
  label: string;
  value: string;
  /** Called with each usable value as it is typed; null means "cleared". */
  onCommit: (value: string | null) => void;
  onDone: () => void;
  type?: 'number' | 'text';
  min?: number;
  max?: number;
  placeholder?: string;
  list?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  // Applying a change can make the text editor take focus back. While that is
  // put right, the blur and focus it causes must not reset what is being typed.
  const committing = useRef(false);
  // Each keystroke applies, so the author sees the result as they type. For a
  // whole box those are document changes; they are gathered into one undo step
  // that ends when the field is left. (While editing text, the text editor
  // keeps its own history until the edit is committed.)
  const gathering = useRef(false);
  const finish = () => {
    if (gathering.current) editor.commitGesture();
    gathering.current = false;
  };
  // If the field goes away mid-entry (its tab closes), the step still has to end.
  useEffect(
    () => () => {
      if (gathering.current) editor.commitGesture();
      gathering.current = false;
    },
    [],
  );
  const commit = (input: HTMLInputElement, next: string | null) => {
    committing.current = true;
    if (!gathering.current && getActiveTextEditor() === null) {
      editor.beginGesture('Format text');
      gathering.current = true;
    }
    onCommit(next);
    if (document.activeElement !== input) input.focus();
    committing.current = false;
  };
  const usable = (text: string) => {
    if (type === 'text') return true;
    const n = Number(text);
    return Number.isFinite(n) && (min === undefined || n >= min) && (max === undefined || n <= max);
  };
  return (
    <input
      className={`ribbon-input ${type === 'number' ? 'ribbon-number' : ''}`}
      // A real number input does not take the typing caret while text is
      // selected in the editor (Chromium), so keystrokes went nowhere. A text
      // input does; it is limited to digits and a decimal point below.
      type="text"
      inputMode={type === 'number' ? 'decimal' : undefined}
      list={list}
      aria-label={label}
      placeholder={placeholder}
      value={draft ?? value}
      onFocus={() => {
        if (!committing.current) setDraft(value);
      }}
      onBlur={() => {
        if (committing.current) return;
        setDraft(null);
        finish();
      }}
      onChange={(event) => {
        const raw = event.target.value;
        const text = type === 'number' ? raw.replace(/[^0-9.]/g, '') : raw;
        setDraft(text);
        if (type === 'text') return;
        if (text === '') commit(event.currentTarget, null);
        else if (usable(text)) commit(event.currentTarget, text);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          if (type === 'text')
            onCommit(draft === null || draft.trim() === '' ? null : draft.trim());
          setDraft(null);
          finish();
          onDone();
        } else if (event.key === 'Escape') {
          setDraft(null);
          finish();
          onDone();
        }
      }}
    />
  );
}

const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72, 96];
const DEFAULT_FONT_SIZE = 18;
const LINE_HEIGHTS = ['1', '1.15', '1.3', '1.5', '2'];
/** What "add space before/after paragraph" adds, in stage units. */
const PARAGRAPH_SPACE = 12;

/** A small ribbon button that is just a picture; its name is the tooltip and the accessible name. */
function IconButton({
  label,
  icon,
  pressed,
  onClick,
  children,
}: {
  label: string;
  icon?: IconName;
  pressed?: boolean;
  onClick: () => void;
  /** Used instead of `icon` for letter-shaped buttons such as B, I and U. */
  children?: ReactNode;
}) {
  return (
    <button
      className="ribbon-button small icon-only"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {icon ? <Icon name={icon} /> : children}
    </button>
  );
}

/** An icon button that opens a small panel beneath it (a menu, or a field). */
function IconPopover({
  label,
  icon,
  pressed,
  children,
}: {
  label: string;
  icon: IconName;
  pressed?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const open = place !== null;
  const container = useRef<HTMLDivElement>(null);
  useDismiss(
    container,
    open,
    () => setPlace(null),
    () => setPlace(popupPlace(container)),
  );
  return (
    <div className="gallery" ref={container}>
      <button
        className="ribbon-button small icon-only"
        aria-label={label}
        title={label}
        aria-haspopup="true"
        aria-expanded={open}
        aria-pressed={pressed}
        onClick={() => setPlace(open ? null : popupPlace(container))}
      >
        <Icon name={icon} />
      </button>
      {place && (
        <div className="menu-panel" role="menu" aria-label={label} style={place}>
          {children(() => setPlace(null))}
        </div>
      )}
    </div>
  );
}

/** The contextual Text Format tab: shown while an object with text is selected or edited. */
function TextTab() {
  const { ed, obj, editing, apply, refocus } = useTextTarget();
  if (!ed || !obj) return null;
  const textStyle = ed.getAttributes('textStyle');
  const para = ed.getAttributes('paragraph');
  const fontFamily = (textStyle['fontFamily'] as string) || '';
  const fontSize = String(textStyle['fontSize'] ?? '').replace(/px$/, '');
  const rawColor = (textStyle['color'] as string) || '';
  const color = /^#[0-9a-f]{6}$/i.test(rawColor) ? rawColor : '#000000';
  const align = (para['textAlign'] as string) || 'left';
  const lineHeight = String(para['lineHeight'] ?? '');
  const spaceBefore = Number(para['spaceBefore'] ?? 0);
  const spaceAfter = Number(para['spaceAfter'] ?? 0);
  const href = (ed.getAttributes('link')['href'] as string) || '';

  const setSize = (size: number | null, focus: boolean) =>
    apply(
      (chain) =>
        size === null
          ? chain.setMark('textStyle', { fontSize: null }).removeEmptyTextStyle()
          : chain.setMark('textStyle', { fontSize: `${size}px` }),
      focus,
    );
  const stepSize = (by: number) =>
    setSize(Math.min(400, Math.max(6, (Number(fontSize) || DEFAULT_FONT_SIZE) + by)), true);
  const paragraph = (attrs: Record<string, unknown>) =>
    apply((chain) => chain.updateAttributes('paragraph', attrs));
  const menuItem = (label: string, checked: boolean, run: () => void, close: () => void) => (
    <button
      key={label}
      role="menuitemcheckbox"
      aria-checked={checked}
      className="menu-item"
      onClick={() => {
        close();
        run();
      }}
    >
      <span className="menu-check">{checked ? '✓' : ''}</span>
      {label}
    </button>
  );

  return (
    <>
      <Group label={editing ? 'Font (selected text)' : 'Font (whole box)'}>
        <div className="format-rows">
          <div className="format-row">
            <select
              className="ribbon-select"
              aria-label="Font"
              title="Font"
              value={fontFamily}
              onChange={(e) => {
                const v = e.target.value;
                apply((chain) => (v ? chain.setFontFamily(v) : chain.unsetFontFamily()));
              }}
            >
              <option value="">Default font</option>
              <option value="body">Theme Body</option>
              <option value="heading">Theme Heading</option>
              <option value="Inter">Inter</option>
              <option value="Arial">Arial</option>
              <option value="Georgia">Georgia</option>
              <option value="Times New Roman">Times New Roman</option>
            </select>
            <RibbonField
              label="Font size"
              value={fontSize}
              placeholder={String(DEFAULT_FONT_SIZE)}
              min={6}
              max={400}
              list="ribbon-font-sizes"
              onCommit={(v) => setSize(v === null ? null : Number(v), false)}
              onDone={refocus}
            />
            <datalist id="ribbon-font-sizes">
              {FONT_SIZES.map((size) => (
                <option key={size} value={size} />
              ))}
            </datalist>
            <IconButton label="Larger text" icon="textGrow" onClick={() => stepSize(2)} />
            <IconButton label="Smaller text" icon="textShrink" onClick={() => stepSize(-2)} />
          </div>
          <div className="format-row">
            <IconButton
              label="Bold"
              pressed={ed.isActive('bold')}
              onClick={() => apply((c) => c.toggleBold())}
            >
              <b>B</b>
            </IconButton>
            <IconButton
              label="Italic"
              pressed={ed.isActive('italic')}
              onClick={() => apply((c) => c.toggleItalic())}
            >
              <i className="serif">I</i>
            </IconButton>
            <IconButton
              label="Underline"
              pressed={ed.isActive('underline')}
              onClick={() => apply((c) => c.toggleUnderline())}
            >
              <u>U</u>
            </IconButton>
            <label className="ribbon-button small icon-only color-button" title="Text colour">
              <span aria-hidden="true">A</span>
              <span className="color-bar" style={{ background: color }} aria-hidden="true" />
              <input
                type="color"
                aria-label="Text colour"
                value={color}
                onChange={(e) => apply((chain) => chain.setColor(e.target.value), false)}
              />
            </label>
          </div>
        </div>
      </Group>
      <Group label="Paragraph">
        <div className="format-rows">
          <div className="format-row" role="radiogroup" aria-label="Alignment">
            {(
              [
                ['left', 'Align left', 'alignLeft'],
                ['center', 'Align centre', 'alignCenter'],
                ['right', 'Align right', 'alignRight'],
                ['justify', 'Justify', 'alignJustify'],
              ] as const
            ).map(([value, label, icon]) => (
              <IconButton
                key={value}
                label={label}
                icon={icon}
                pressed={align === value}
                onClick={() => apply((chain) => chain.setTextAlign(value))}
              />
            ))}
          </div>
          <div className="format-row">
            <IconButton
              label="Bulleted list"
              icon="listBullet"
              pressed={ed.isActive('bulletList')}
              onClick={() => apply((c) => c.toggleBulletList())}
            />
            <IconButton
              label="Numbered list"
              icon="listNumber"
              pressed={ed.isActive('orderedList')}
              onClick={() => apply((c) => c.toggleOrderedList())}
            />
            <IconPopover label="Line and paragraph spacing" icon="lineSpacing">
              {(close) => (
                <>
                  {LINE_HEIGHTS.map((value) =>
                    menuItem(
                      `Line spacing ${value}`,
                      (lineHeight || '1.3') === value,
                      () => paragraph({ lineHeight: value === '1.3' ? null : value }),
                      close,
                    ),
                  )}
                  <div className="menu-separator" />
                  {menuItem(
                    'Space before paragraph',
                    spaceBefore > 0,
                    () => paragraph({ spaceBefore: spaceBefore > 0 ? null : PARAGRAPH_SPACE }),
                    close,
                  )}
                  {menuItem(
                    'Space after paragraph',
                    spaceAfter > 0,
                    () => paragraph({ spaceAfter: spaceAfter > 0 ? null : PARAGRAPH_SPACE }),
                    close,
                  )}
                </>
              )}
            </IconPopover>
            <IconPopover label="Link" icon="link" pressed={href !== ''}>
              {(close) => (
                <div className="link-popover">
                  <RibbonField
                    label="Link address"
                    type="text"
                    value={href}
                    placeholder="https://… then Enter"
                    onCommit={(v) =>
                      apply(
                        (c) =>
                          v === null
                            ? c.extendMarkRange('link').unsetLink()
                            : c.extendMarkRange('link').setLink({ href: v }),
                        false,
                      )
                    }
                    onDone={() => {
                      close();
                      refocus();
                    }}
                  />
                  <button
                    className="menu-item"
                    disabled={href === ''}
                    onClick={() => {
                      close();
                      apply((c) => c.extendMarkRange('link').unsetLink());
                    }}
                  >
                    Remove link
                  </button>
                </div>
              )}
            </IconPopover>
            <IconPopover label="Insert variable" icon="variable">
              {(close) => (
                <>
                  {variableNames().map((name) =>
                    menuItem(
                      `%${name}%`,
                      false,
                      () => {
                        const text = `%${name}%`;
                        if (editing) {
                          apply((chain) => chain.insertContent(text));
                          return;
                        }
                        // Not editing: start editing, with the reference at the end of the text.
                        whenTextEditorOpens((ed) =>
                          ed.chain().focus('end').insertContent(text).run(),
                        );
                        if (obj.type === 'shape' && !obj.props.text) {
                          getEditorState().open?.history.execute('object.update', {
                            objectId: obj.id,
                            changes: { props: { text: EMPTY_TEXT } },
                          });
                        }
                        editor.startEditingText(obj.id);
                      },
                      close,
                    ),
                  )}
                  <div className="menu-separator" />
                  <button
                    className="menu-item"
                    onClick={() => {
                      close();
                      editor.setVariablesOpen(true);
                    }}
                  >
                    Manage variables…
                  </button>
                </>
              )}
            </IconPopover>
          </div>
        </div>
      </Group>
      {obj.type === 'text' && (
        <Group label="Fit">
          <div className="format-row" role="radiogroup" aria-label="Autofit">
            {(
              [
                ['none', 'Fixed size', 'fitFixed'],
                ['shrinkText', 'Shrink text to fit', 'fitShrink'],
                ['growShape', 'Grow box to fit', 'fitGrow'],
              ] as const
            ).map(([value, label, icon]) => (
              <IconButton
                key={value}
                label={label}
                icon={icon}
                pressed={obj.props.autofit === value}
                onClick={() =>
                  getEditorState().open?.history.execute('object.update', {
                    objectId: obj.id,
                    changes: { props: { autofit: value } },
                  })
                }
              />
            ))}
          </div>
        </Group>
      )}
    </>
  );
}

/** Picks the layout the current slide uses, adding the placeholders it lacks. */
function LayoutGroup() {
  const { open, view, selectedSlideId } = useEditor();
  if (!open || view !== 'slide') return null;
  const current = currentSlide(open.project, selectedSlideId);
  if (!current) return null;
  // Slides use slide masters' layouts only; the feedback master's are for feedback layers (P7.5).
  const layouts = open.project.masters
    .filter((master) => master.kind === 'slide')
    .flatMap((master) =>
      master.layouts.map((layout) => ({ layout, label: `${master.name} › ${layout.name}` })),
    );
  return (
    <Group label="Layout">
      <select
        className="ribbon-select"
        aria-label="Slide layout"
        disabled={layouts.length === 0}
        title={layouts.length === 0 ? 'Add a master in Master View first' : undefined}
        value={current.slide.layoutId ?? ''}
        onChange={(event) => {
          const chosen = layouts.find((each) => each.layout.id === event.target.value);
          open.history.execute('slide.setLayout', {
            slideId: current.slide.id,
            layoutId: chosen?.layout.id ?? null,
            objects: chosen ? placeholdersMissingFrom(chosen.layout, current.slide) : [],
          });
        }}
      >
        <option value="">No layout</option>
        {layouts.map(({ layout, label }) => (
          <option key={layout.id} value={layout.id}>
            {label}
          </option>
        ))}
      </select>
    </Group>
  );
}

function HomeTab() {
  const painter = useFormatPainter();
  const { selection } = useEditor();
  // Focus is on the ribbon button after arming, so Escape is watched on the window.
  useEffect(() => {
    if (!painter.armed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelFormatPainter();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [painter.armed]);
  const selectedOne = () => {
    const { open: o, selection: sel } = getEditorState();
    if (!o || sel.length !== 1) return undefined;
    return o.history.project.scenes
      .flatMap((sc) => sc.slides)
      .flatMap((sl) => sl.baseLayer.objects)
      .find((x) => x.id === sel[0]);
  };
  const canPick = canPickFormat(selection.length === 1 ? selectedOne() : undefined);
  const pick = (lock: boolean) => {
    const found = selectedOne();
    if (found) pickFormat(found, lock);
  };
  return (
    <>
      <Group label={t('ribbon.preview')}>
        <Command
          icon="slide"
          label={t('ribbon.thisSlide')}
          onClick={() => void editor.preview('slide')}
        />
        <Command
          icon="overview"
          label={t('ribbon.thisScene')}
          onClick={() => void editor.preview('scene')}
        />
        <Command
          icon="overview"
          label={t('ribbon.entireProject')}
          onClick={() => void editor.preview('project')}
        />
      </Group>
      <Group label={t('ribbon.slides')}>
        <Command icon="slidePlus" label={t('ribbon.newSlide')} onClick={editor.addSlide} />
      </Group>
      <Group label={t('ribbon.clipboard')}>
        <Command icon="clipboard" label={t('ribbon.paste')} />
        <Command icon="cut" label={t('ribbon.cut')} />
        <Command icon="copy" label={t('ribbon.copy')} />
        <Command
          icon="copy"
          label={painter.armed ? 'Cancel Painter' : 'Format Painter'}
          onClick={
            canPick
              ? () => (painter.armed ? cancelFormatPainter() : pick(false))
              : painter.armed
                ? cancelFormatPainter
                : undefined
          }
          onDoubleClick={canPick ? () => pick(true) : undefined}
          pressed={painter.armed}
        />
      </Group>
      <LayoutGroup />
      <Group label={t('ribbon.arrange')}>
        <Command icon="group" label={t('ribbon.group')} onClick={stage.group} />
        <Command icon="ungroup" label={t('ribbon.ungroup')} onClick={stage.ungroup} />
        <Command icon="lock" label={t('ribbon.lock')} onClick={stage.lockSelection} />
        <Command icon="unlock" label={t('ribbon.unlockAll')} onClick={stage.unlockAll} />
        <CommandMenu
          icon="align"
          label={t('ribbon.align')}
          items={[
            { label: 'Align Left', onClick: () => stage.align('left') },
            { label: 'Align Centre', onClick: () => stage.align('centre') },
            { label: 'Align Right', onClick: () => stage.align('right') },
            { label: 'Align Top', onClick: () => stage.align('top') },
            { label: 'Align Middle', onClick: () => stage.align('middle') },
            { label: 'Align Bottom', onClick: () => stage.align('bottom') },
            { label: 'Distribute Horizontally', onClick: () => stage.distribute('horizontal') },
            { label: 'Distribute Vertically', onClick: () => stage.distribute('vertical') },
          ]}
        />
        <CommandMenu
          icon="order"
          label={t('ribbon.order')}
          items={[
            { label: 'Bring to Front', onClick: () => stage.reorder('front') },
            { label: 'Bring Forward', onClick: () => stage.reorder('forward') },
            { label: 'Send Backward', onClick: () => stage.reorder('backward') },
            { label: 'Send to Back', onClick: () => stage.reorder('back') },
          ]}
        />
      </Group>
    </>
  );
}

interface MenuItem {
  label: string;
  onClick: () => void;
}

/** A ribbon command that opens a list of related commands. */
/** The question slides Insert → Question makes (docs/briefs/P7.2-graded-types.md). */
const QUESTION_KINDS: [Question['kind'], string][] = [
  ['multipleChoice', 'Multiple Choice'],
  ['multipleResponse', 'Multiple Response'],
  ['trueFalse', 'True or False'],
  ['fillInBlank', 'Fill in the Blank'],
  ['numeric', 'Numeric'],
  ['matchingDropdown', 'Matching (Dropdowns)'],
  ['sequenceDropdown', 'Sequence (Dropdowns)'],
  ['wordBank', 'Word Bank'],
  ['matchingDrag', 'Matching (Drag and Drop)'],
  ['sequenceDrag', 'Sequence (Drag and Drop)'],
  ['hotspot', 'Hotspot'],
];

/** What Insert → Convert Slide makes of the current slide (docs/briefs/P7.4-freeform-questions.md). */
const FREEFORM_KINDS: [FreeformKind, string][] = [
  ['freePickOne', 'Pick One'],
  ['freePickMany', 'Pick Many'],
  ['freeDrag', 'Drag and Drop'],
  ['freeText', 'Text Entry'],
  ['freeHotspot', 'Hotspot'],
  ['freeKey', 'Shortcut Key'],
];

/** The survey question slides Insert → Survey makes (docs/briefs/P7.3-survey-types.md). */
const SURVEY_KINDS: [Question['kind'], string][] = [
  ['likert', 'Likert'],
  ['pickOne', 'Pick One'],
  ['pickMany', 'Pick Many'],
  ['shortAnswer', 'Short Answer'],
  ['essay', 'Essay'],
  ['howMany', 'How Many'],
  ['whichWord', 'Which Word'],
  ['ranking', 'Ranking'],
];

function CommandMenu({
  icon,
  label,
  items,
}: {
  icon: IconName;
  label: string;
  items: readonly MenuItem[];
}) {
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const open = place !== null;
  const container = useRef<HTMLDivElement>(null);
  useDismiss(
    container,
    open,
    () => setPlace(null),
    () => setPlace(popupPlace(container)),
  );

  return (
    <div className="gallery" ref={container}>
      <button
        className="ribbon-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setPlace(open ? null : popupPlace(container))}
      >
        <Icon name={icon} size={20} />
        <span>{label}</span>
      </button>
      {place && (
        <div
          className="menu-panel"
          role="menu"
          aria-label={label}
          data-testid={`menu-${label.toLowerCase()}`}
          style={place}
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              className="menu-item"
              onClick={() => {
                setPlace(null);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Where a ribbon popover opens: under its button, fixed to the window, so the
 * command row (which scrolls sideways when the window is narrow) does not cut
 * it off. Near the window's right edge it opens leftwards from the button.
 */
function popupPlace(container: RefObject<HTMLElement | null>): CSSProperties {
  const box = container.current?.getBoundingClientRect();
  if (!box) return {};
  return box.left + 300 > window.innerWidth
    ? {
        position: 'fixed',
        top: box.bottom,
        left: 'auto',
        right: Math.max(4, window.innerWidth - box.right),
      }
    : { position: 'fixed', top: box.bottom, left: Math.max(4, box.left) };
}

/** Close a popover on a click elsewhere, Escape, or the ribbon scrolling under it. */
function useDismiss(
  container: RefObject<HTMLElement | null>,
  open: boolean,
  close: () => void,
  /** The command row scrolled under the open popover: put it under its button again. */
  follow?: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    // A popover is fixed to the window: when the command row scrolls, it follows its button.
    const onScroll = (event: Event) => {
      if (event.target instanceof Element && event.target.classList.contains('ribbon-commands')) {
        follow?.();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [container, open, close, follow]);
}

function InsertTab() {
  return (
    <>
      <Group label={t('ribbon.slides')}>
        <Command icon="slidePlus" label={t('ribbon.newSlide')} onClick={editor.addSlide} />
      </Group>
      <Group label={t('ribbon.media')}>
        <Command
          icon="image"
          label={t('ribbon.picture')}
          onClick={() => void stage.insertPictureFromFile()}
        />
        <Command
          icon="audio"
          label={t('ribbon.audio')}
          onClick={() =>
            void stage
              .insertAudioFromFile()
              .catch((error: unknown) =>
                editor.showError(error instanceof Error ? error.message : String(error)),
              )
          }
        />
        <Command
          icon="video"
          label={t('ribbon.video')}
          onClick={() =>
            void stage
              .insertVideoFromFile()
              .catch((error: unknown) =>
                editor.showError(error instanceof Error ? error.message : String(error)),
              )
          }
        />
        <Command
          icon="microphone"
          label={t('ribbon.recordAudio')}
          onClick={() => editor.setRecordingOpen(true)}
        />
        <Command
          icon="screen"
          label={t('ribbon.screenRecording')}
          onClick={() => editor.setScreenRecordingOpen(true)}
        />
        <Command
          icon="speech"
          label={t('ribbon.textToSpeech')}
          onClick={() => editor.openSpeech(null)}
        />
        <Command
          icon="image"
          label={t('ribbon.importMedia')}
          onClick={() => void editor.importAssets()}
        />
      </Group>
      <Group label={t('ribbon.objects')}>
        <Command icon="text" label={t('ribbon.textBox')} onClick={stage.insertTextBox} />
        <ShapeGallery />
        <Command
          icon="icons"
          label={t('ribbon.icons')}
          onClick={() => editor.setLibraryOpen(true)}
        />
        <Command icon="table" label={t('ribbon.table')} onClick={stage.insertTable} />
        <Command
          icon="panorama"
          label={t('ribbon.360Image')}
          onClick={() => void stage.insertPanoramaFromFile()}
        />
        <Command icon="button" label={t('ribbon.button')} onClick={stage.insertButton} />
        <Command
          icon="zoomRegion"
          label={t('ribbon.zoomRegion')}
          onClick={stage.insertZoomRegion}
        />
        <Command icon="hotspot" label={t('ribbon.hotspot')} onClick={stage.insertHotspot} />
        <Command icon="marker" label={t('ribbon.marker')} onClick={stage.insertMarker} />
        <Command icon="scroll" label={t('ribbon.scrollingPanel')} onClick={stage.scrollingPanel} />
        <CommandMenu
          icon="web"
          label={t('ribbon.webObject')}
          items={[
            { label: 'From a Web Address', onClick: stage.insertWebAddress },
            { label: 'From a Folder…', onClick: () => void stage.insertWebFolder() },
          ]}
        />
        <CommandMenu
          icon="field"
          label={t('ribbon.dataEntry')}
          items={[
            { label: 'Text Entry', onClick: () => stage.insertField(false) },
            { label: 'Numeric Entry', onClick: () => stage.insertField(true) },
            { label: 'Checkbox', onClick: stage.insertCheckbox },
            { label: 'Radio Button', onClick: stage.insertRadio },
            { label: 'Slider', onClick: stage.insertSlider },
            { label: 'Dial', onClick: stage.insertDial },
          ]}
        />
      </Group>
      <Group label={t('ribbon.questions')}>
        <CommandMenu
          icon="question"
          label={t('ribbon.question')}
          items={[
            ...QUESTION_KINDS.map(([kind, label]) => ({
              label,
              onClick: () => editor.addQuestionSlide(kind),
            })),
            // Questions drawn from a bank as the course plays (P7.6).
            { label: 'Draw from Question Bank', onClick: () => editor.addDrawSlide() },
            // Adds up the questions, with a score and a pass mark (P7.7).
            { label: 'Result Slide', onClick: () => editor.addResultSlide() },
          ]}
        />
        <CommandMenu
          icon="convert"
          label={t('ribbon.convertSlide')}
          items={FREEFORM_KINDS.map(([kind, label]) => ({
            label,
            onClick: () => editor.convertSlide(kind),
          }))}
        />
        <CommandMenu
          icon="survey"
          label={t('ribbon.survey')}
          items={SURVEY_KINDS.map(([kind, label]) => ({
            label,
            onClick: () => editor.addQuestionSlide(kind),
          }))}
        />
      </Group>
      <Group label={t('ribbon.interactivity')}>
        <Command
          icon="variable"
          label={t('ribbon.variables')}
          onClick={() => editor.setVariablesOpen(true)}
        />
      </Group>
    </>
  );
}

function DesignTab() {
  const { open } = useEditor();
  const [showTheme, setShowTheme] = useState(false);
  const [showStage, setShowStage] = useState(false);
  const [showTracking, setShowTracking] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  return (
    <>
      <Group label="Theme">
        <Command
          icon="palette"
          label="Colours"
          onClick={open ? () => setShowTheme(true) : undefined}
        />
        <Command icon="fonts" label="Fonts" onClick={open ? () => setShowTheme(true) : undefined} />
      </Group>
      <Group label="Stage">
        <Command
          icon="stageSize"
          label="Stage Size"
          onClick={open ? () => setShowStage(true) : undefined}
        />
      </Group>
      <Group label="Course">
        <Command
          icon="tracking"
          label="Tracking"
          onClick={open ? () => setShowTracking(true) : undefined}
        />
        <Command
          icon="player"
          label="Player…"
          onClick={open ? () => setShowPlayer(true) : undefined}
        />
        <Command
          icon="translate"
          label="Translation…"
          onClick={open ? () => editor.setTranslationOpen(true) : undefined}
        />
      </Group>
      {showTheme && open && <ThemeDialog open={open} onClose={() => setShowTheme(false)} />}
      {showStage && open && <StageSizeDialog open={open} onClose={() => setShowStage(false)} />}
      {showTracking && open && (
        <TrackingDialog open={open} onClose={() => setShowTracking(false)} />
      )}
      {showPlayer && open && <PlayerDialog onClose={() => setShowPlayer(false)} />}
    </>
  );
}

function ThemeDialog({
  open,
  onClose,
}: {
  open: NonNullable<ReturnType<typeof getEditorState>['open']>;
  onClose: () => void;
}) {
  const theme = open.history.project.theme;
  const [colors, setColors] = useState({ ...theme.colors });
  const [heading, setHeading] = useState(theme.fonts.heading);
  const [body, setBody] = useState(theme.fonts.body);
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog" role="dialog" aria-label="Theme" data-testid="theme-dialog">
        <h2>Theme</h2>
        <h3>Colours</h3>
        <div className="field-grid">
          {(Object.keys(colors) as Array<keyof typeof colors>).map((slot) => (
            <label key={slot} className="field">
              <span>{slot}</span>
              <input
                type="color"
                aria-label={`Theme colour ${slot}`}
                value={colors[slot].slice(0, 7)}
                onChange={(e) => setColors({ ...colors, [slot]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <h3>Fonts</h3>
        <label className="field">
          <span>Heading font</span>
          <input
            aria-label="Theme heading font"
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Body font</span>
          <input
            aria-label="Theme body font"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              open.history.execute('project.updateTheme', {
                colors,
                fonts: { heading: heading || 'Inter', body: body || 'Inter' },
              });
              onClose();
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

function StageSizeDialog({
  open,
  onClose,
}: {
  open: NonNullable<ReturnType<typeof getEditorState>['open']>;
  onClose: () => void;
}) {
  const stage = open.history.project.stage;
  // Kept as typed: forcing a number on every keystroke turned an emptied field into "1".
  const [width, setWidth] = useState(String(stage.width));
  const [height, setHeight] = useState(String(stage.height));
  const size = (text: string) => Math.round(Number(text));
  const valid = (text: string) =>
    /^\d+$/.test(text.trim()) && size(text) >= 1 && size(text) <= 10000;
  const [mode, setMode] = useState<'keep' | 'scale'>('scale');
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog" role="dialog" aria-label="Stage size" data-testid="stage-size-dialog">
        <h2>Stage size</h2>
        <label className="field">
          <span>Width</span>
          <input
            inputMode="numeric"
            aria-label="Stage width"
            aria-invalid={!valid(width)}
            value={width}
            onChange={(e) => setWidth(e.target.value.replace(/[^0-9]/g, ''))}
          />
        </label>
        <label className="field">
          <span>Height</span>
          <input
            inputMode="numeric"
            aria-label="Stage height"
            aria-invalid={!valid(height)}
            value={height}
            onChange={(e) => setHeight(e.target.value.replace(/[^0-9]/g, ''))}
          />
        </label>
        <fieldset>
          <legend>Existing content</legend>
          <label>
            <input
              type="radio"
              name="stage-mode"
              checked={mode === 'scale'}
              onChange={() => setMode('scale')}
            />
            Scale content to new stage
          </label>
          <label>
            <input
              type="radio"
              name="stage-mode"
              checked={mode === 'keep'}
              onChange={() => setMode('keep')}
            />
            Keep content size (crop/margins)
          </label>
        </fieldset>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid(width) || !valid(height)}
            onClick={() => {
              open.history.execute('project.setStageSize', {
                width: size(width),
                height: size(height),
                mode,
              });
              onClose();
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

function ViewTab() {
  const { layout, theme, view } = useSettings();
  return (
    <>
      <Group label="Show">
        <Command
          icon="rulers"
          label="Rulers"
          pressed={view.rulers}
          onClick={() => ui.setView({ rulers: !view.rulers })}
        />
        <Command
          icon="grid"
          label="Grid"
          pressed={view.grid}
          onClick={() => ui.setView({ grid: !view.grid })}
        />
        <Command
          icon="guide"
          label="Guides"
          pressed={view.guides}
          onClick={() => ui.setView({ guides: !view.guides })}
        />
        <Command
          icon="snap"
          label="Snap"
          pressed={view.snap}
          onClick={() => ui.setView({ snap: !view.snap })}
        />
      </Group>
      <Group label="Off the Slide">
        <div
          className="segmented"
          role="radiogroup"
          aria-label="Off the slide"
          data-testid="off-slide"
        >
          {OFF_SLIDE.map((choice) => (
            <button
              key={choice}
              role="radio"
              aria-checked={view.offSlide === choice}
              title={OFF_SLIDE_BUTTONS[choice].title}
              onClick={() => ui.setView({ offSlide: choice })}
            >
              <Icon name={OFF_SLIDE_BUTTONS[choice].icon} />
              <span>{OFF_SLIDE_BUTTONS[choice].label}</span>
            </button>
          ))}
        </div>
      </Group>
      <Group label="Panels">
        {PANELS.map((panel) => (
          <Command
            key={panel}
            {...PANEL_BUTTONS[panel]}
            pressed={!layout[panel].collapsed}
            onClick={() => ui.togglePanel(panel)}
          />
        ))}
        <Command icon="reset" label="Reset Layout" onClick={ui.resetLayout} />
      </Group>
      <Group label="Theme">
        <div className="segmented" role="radiogroup" aria-label="Theme" data-testid="theme">
          {THEMES.map((choice) => (
            <button
              key={choice}
              role="radio"
              aria-checked={theme === choice}
              onClick={() => ui.setTheme(choice)}
            >
              <Icon name={THEME_BUTTONS[choice].icon} />
              <span>{THEME_BUTTONS[choice].label}</span>
            </button>
          ))}
        </div>
      </Group>
    </>
  );
}

const BASIC_SHAPES: { label: string; geometry: ShapeGeometry }[] = [
  { label: 'Rectangle', geometry: { kind: 'rect' } },
  { label: 'Rounded Rectangle', geometry: { kind: 'roundRect', radius: 16 } },
  { label: 'Ellipse', geometry: { kind: 'ellipse' } },
  { label: 'Triangle', geometry: { kind: 'triangle' } },
  { label: 'Line', geometry: { kind: 'line' } },
  { label: 'Arrow', geometry: { kind: 'arrow' } },
];
const ALL_SHAPES = [
  ...BASIC_SHAPES,
  ...shapePresetNames.map((name) => ({
    label: shapePresetLabel(name),
    geometry: shapePreset(name) as ShapeGeometry,
  })),
];

/** A small picture of a shape, drawn with the same outline code as the stage. */
function ShapePreview({ geometry }: { geometry: ShapeGeometry }) {
  const [width, height] = [26, 18];
  const open = geometry.kind === 'line' || geometry.kind === 'arrow';
  const preview: ShapeGeometry =
    geometry.kind === 'roundRect' ? { kind: 'roundRect', radius: 4 } : geometry;
  return (
    <svg
      className="icon"
      width={width + 2}
      height={height + 2}
      viewBox={`-1 -1 ${width + 2} ${height + 2}`}
      aria-hidden="true"
    >
      {open || preview.kind === 'line' || preview.kind === 'arrow' ? (
        <path
          d={`M0 ${height / 2}H${width}${geometry.kind === 'arrow' ? `M${width - 5} ${height / 2 - 4}L${width} ${height / 2}L${width - 5} ${height / 2 + 4}` : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      ) : (
        <path
          d={closedPath(preview, width, height)}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

/** The Shape command: opens a grid of shapes; choosing one puts it on the slide. */
function ShapeGallery() {
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const open = place !== null;
  const container = useRef<HTMLDivElement>(null);
  useDismiss(
    container,
    open,
    () => setPlace(null),
    () => setPlace(popupPlace(container)),
  );

  return (
    <div className="gallery" ref={container}>
      <button
        className="ribbon-button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setPlace(open ? null : popupPlace(container))}
      >
        <Icon name="shape" size={20} />
        <span>Shape</span>
      </button>
      {place && (
        <div
          className="gallery-panel"
          role="group"
          aria-label="Shapes"
          data-testid="shape-gallery"
          style={place}
        >
          {ALL_SHAPES.map(({ label, geometry }) => (
            <button
              key={label}
              className="gallery-item"
              aria-label={label}
              title={label}
              onClick={() => {
                setPlace(null);
                stage.insertShape(geometry, label);
              }}
            >
              <ShapePreview geometry={geometry} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

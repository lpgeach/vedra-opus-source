import {
  BUILT_IN_VARIABLES,
  createId,
  feedbackMasterOf,
  placeholdersMissingFrom,
  shapePreset,
  shapePresetLabel,
  shapePresetNames,
} from '@vedraopus/model';
import type { Fill, FreeformKind, Question, RichText, ShapeGeometry } from '@vedraopus/model';
import { closedPath } from '@vedraopus/render';
import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { CSSProperties, ReactNode } from 'react';
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
import { Command, FoldedGroups, Group, Stack } from './ribbon-parts';
import { addSlideLayer } from './LayersPanel';
import { overview } from '../overview-actions';
import { popupPlace, useDismiss } from './popover';
import { Tabs } from './Tabs';
import { TransitionsTab } from './TransitionsTab';
import { PlayerDialog } from './PlayerDialog';
import { TrackingDialog } from './TrackingDialog';
import { FindReplaceDialog } from './FindReplaceDialog';
import { isPreset, THEME_PRESETS } from '../theme-presets';

/** The ribbon's tabs; their words are looked up as the ribbon draws, in the editor's language (P10.4). */
const RIBBON_TABS = [
  'home',
  'insert',
  'slides',
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
  const { ribbonTab: tab } = useEditor();
  const tabs = RIBBON_TABS.map(tabWords);
  const { ribbonCollapsed } = useSettings().layout;
  // Collapsed, a tab clicked shows its commands over the stage until one is used (B17).
  const [peek, setPeek] = useState(false);
  const ribbon = useRef<HTMLDivElement>(null);
  useDismiss(ribbon, peek, () => setPeek(false));
  const showCommands = !ribbonCollapsed || peek;
  const [attachRow, foldedLabels] = useFolding(tab);
  return (
    <div
      className={`ribbon${ribbonCollapsed ? ' ribbon-collapsed' : ''}`}
      data-testid="ribbon"
      ref={ribbon}
    >
      <div className="ribbon-tab-row" data-testid="ribbon-tab-row">
        <Tabs
          label="Ribbon"
          className="ribbon-tabs"
          tabs={tabs}
          active={tab}
          onSelect={(id) => {
            editor.setRibbonTab(id);
            if (ribbonCollapsed) setPeek(id !== tab || !peek);
          }}
        />
        {/* On every tab, in the same place (B17). */}
        <PreviewButton />
        <button
          className="ribbon-publish"
          onClick={() => editor.setPublishOpen(true)}
          data-testid="publish-button"
        >
          <Icon name="publish" size={16} />
          <span>{t('ribbon.publish')}</span>
        </button>
        <button
          className="icon-button"
          aria-label={ribbonCollapsed ? t('ribbon.expand') : t('ribbon.collapse')}
          title={ribbonCollapsed ? t('ribbon.expand') : t('ribbon.collapse')}
          aria-pressed={ribbonCollapsed}
          data-testid="ribbon-collapse"
          onClick={() => {
            setPeek(false);
            ui.setRibbonCollapsed(!ribbonCollapsed);
          }}
        >
          <Icon name={ribbonCollapsed ? 'chevronDown' : 'chevronUp'} />
        </button>
      </div>
      {showCommands && (
        <div
          ref={attachRow}
          className={`ribbon-commands${ribbonCollapsed ? ' ribbon-commands-over' : ''}`}
          role="tabpanel"
          aria-label={tab}
          onClick={(event) => {
            // Over the stage, the commands go once one is used; a menu's button keeps them.
            const button = (event.target as Element).closest('button, [role="menuitem"]');
            if (peek && button && !button.hasAttribute('aria-haspopup')) setPeek(false);
          }}
          // In a narrow window the wheel scrolls the commands sideways (Phase 9 review).
          onWheel={(event) => {
            if (event.deltaX === 0 && event.deltaY !== 0)
              event.currentTarget.scrollLeft += event.deltaY;
          }}
        >
          <FoldedGroups.Provider value={foldedLabels}>
            {tab === 'home' && <HomeTab />}
            {tab === 'insert' && <InsertTab />}
            {tab === 'slides' && <SlidesTab />}
            {tab === 'design' && <DesignTab />}
            {tab === 'transitions' && <TransitionsTab />}
            {tab === 'animations' && <AnimationsTab />}
            {tab === 'view' && <ViewTab />}
          </FoldedGroups.Provider>
        </div>
      )}
    </div>
  );
}

/**
 * Keeps the ribbon inside the window (B17): when a tab's groups are wider than the ribbon,
 * they fold into drop-downs from the right until it fits, and unfold, from the left, as room
 * comes back. Measured after every render and whenever the ribbon changes size.
 */
function useFolding(tab: RibbonTab) {
  const [row, setRow] = useState<HTMLDivElement | null>(null);
  const [folding, setFolding] = useState<{ tab: RibbonTab; labels: ReadonlySet<string> }>({
    tab,
    labels: NOTHING_FOLDED,
  });
  // Another tab starts unfolded, and is measured afresh.
  const labels = folding.tab === tab ? folding.labels : NOTHING_FOLDED;
  const [measure, remeasure] = useReducer((n: number) => n + 1, 0);
  // Each group's width unfolded, by tab and label, to know when there is room to unfold it.
  const natural = useRef(new Map<string, number>());
  useEffect(() => {
    if (!row) return;
    // The ribbon resized, or what is in it changed (a tab, a selection with text).
    const resized = new ResizeObserver(() => remeasure());
    const changed = new MutationObserver(() => remeasure());
    resized.observe(row);
    changed.observe(row, { childList: true, subtree: true });
    return () => {
      resized.disconnect();
      changed.disconnect();
    };
  }, [row]);
  useLayoutEffect(() => {
    if (!row) return;
    const groups = [...row.querySelectorAll<HTMLElement>(':scope > .ribbon-group')];
    const labelOf = (group: HTMLElement) => group.getAttribute('aria-label') ?? '';
    const key = (group: HTMLElement) => `${tab}
${labelOf(group)}`;
    for (const group of groups) {
      if (!labels.has(labelOf(group))) natural.current.set(key(group), group.offsetWidth);
    }
    // What the groups take, padding included: not `scrollWidth`, which is never less than the
    // row's own width, so it cannot tell how much room is spare.
    const style = getComputedStyle(row);
    const room = row.clientWidth;
    const used =
      groups.reduce((sum, group) => sum + group.offsetWidth, 0) +
      parseFloat(style.paddingLeft) +
      parseFloat(style.paddingRight);
    // Too wide: fold the last group still open. Room again: unfold the first folded one, if
    // it fits at its own width.
    let next: ReadonlySet<string> | null = null;
    if (used > room + 1) {
      const last = [...groups].reverse().find((group) => !labels.has(labelOf(group)));
      if (last) next = new Set([...labels, labelOf(last)]);
    } else {
      const first = groups.find((group) => labels.has(labelOf(group)));
      const width = first && natural.current.get(key(first));
      if (first && width !== undefined && used - first.offsetWidth + width <= room) {
        next = new Set([...labels].filter((label) => label !== labelOf(first)));
      }
    }
    if (next) {
      const labelsNext = next;
      setFolding(() => ({ tab, labels: labelsNext }));
    }
  }, [row, tab, labels, measure]);
  return [setRow, labels] as const;
}

const NOTHING_FOLDED: ReadonlySet<string> = new Set();

/** Preview: the whole course, or this slide or scene from its menu (B17). */
function PreviewButton() {
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const isOpen = place !== null;
  useDismiss(container, isOpen, () => setPlace(null));
  const choose = (scope: 'slide' | 'scene' | 'project') => {
    setPlace(null);
    void editor.preview(scope);
  };
  return (
    <div className="gallery ribbon-preview" ref={container}>
      <button className="ribbon-preview-main" onClick={() => void editor.preview('project')}>
        <Icon name="play" size={16} />
        <span>{t('ribbon.preview')}</span>
      </button>
      <button
        className="ribbon-preview-more"
        aria-label={t('ribbon.previewChoices')}
        title={t('ribbon.previewChoices')}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setPlace(isOpen ? null : popupPlace(container))}
      >
        <Icon name="chevronDown" size={12} />
      </button>
      {place && (
        <div className="menu-panel" role="menu" aria-label={t('ribbon.preview')} style={place}>
          <button role="menuitem" className="menu-item" onClick={() => choose('slide')}>
            {t('ribbon.thisSlide')}
          </button>
          <button role="menuitem" className="menu-item" onClick={() => choose('scene')}>
            {t('ribbon.thisScene')}
          </button>
          <button role="menuitem" className="menu-item" onClick={() => choose('project')}>
            {t('ribbon.entireProject')}
          </button>
        </div>
      )}
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
  large,
  compact,
  disabled,
  hint,
  children,
}: {
  label: string;
  icon: IconName;
  pressed?: boolean;
  /** A full-size ribbon command with its words under the icon, not a small icon (B17). */
  large?: boolean;
  /** A row with a small icon and its words, to stack (B17). */
  compact?: boolean;
  disabled?: boolean;
  /** Why it is disabled, shown on hover. */
  hint?: string;
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
        className={
          compact
            ? 'ribbon-button compact'
            : large
              ? 'ribbon-button'
              : 'ribbon-button small icon-only'
        }
        aria-label={label}
        title={disabled && hint ? hint : label}
        aria-haspopup="true"
        aria-expanded={open}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={() => setPlace(open ? null : popupPlace(container))}
      >
        <Icon name={icon} size={large ? 20 : 16} />
        {(large || compact) && <span>{label}</span>}
      </button>
      {place && (
        <div className="menu-panel" role="menu" aria-label={label} style={place}>
          {children(() => setPlace(null))}
        </div>
      )}
    </div>
  );
}

/** The characters Insert → Symbol offers (B17): punctuation, arrows, maths, currency and marks. */
const SYMBOLS = [
  '©',
  '®',
  '™',
  '°',
  '§',
  '¶',
  '†',
  '‡',
  '•',
  '…',
  '–',
  '—',
  '‘',
  '’',
  '“',
  '”',
  '«',
  '»',
  '‹',
  '›',
  '¿',
  '¡',
  '×',
  '÷',
  '±',
  '≠',
  '≈',
  '≤',
  '≥',
  '∞',
  '√',
  '∑',
  'π',
  'µ',
  'Ω',
  '∆',
  '½',
  '¼',
  '¾',
  '²',
  '³',
  '€',
  '£',
  '¥',
  '¢',
  '←',
  '→',
  '↑',
  '↓',
  '↔',
  '⇒',
  '✓',
  '✗',
  '★',
  '☆',
  '♥',
  '♦',
  '♣',
  '♠',
  '☐',
];

/**
 * Insert → Symbol (B17): a character from the grid, typed where the text cursor is, or at the
 * end of a selected object's text (which opens for editing).
 */
function SymbolCommand() {
  const { obj, editing, apply } = useTextTarget();
  const type = (symbol: string) => {
    if (editing) {
      apply((chain) => chain.insertContent(symbol));
      return;
    }
    if (!obj) return;
    whenTextEditorOpens((ed) => ed.chain().focus('end').insertContent(symbol).run());
    editor.startEditingText(obj.id);
  };
  return (
    <IconPopover
      label={t('ribbon.symbol')}
      icon="symbol"
      compact
      disabled={!obj}
      hint="Select an object with text, or edit its text"
    >
      {(close) => (
        <div className="symbol-grid" role="group" aria-label="Symbols">
          {SYMBOLS.map((symbol) => (
            <button
              key={symbol}
              className="symbol-cell"
              aria-label={`Insert ${symbol}`}
              onClick={() => {
                close();
                type(symbol);
              }}
            >
              {symbol}
            </button>
          ))}
        </div>
      )}
    </IconPopover>
  );
}

/**
 * Insert → Hyperlink (B17): while text is being edited, a link on the selected text; on a
 * selected object, a trigger that opens the address when it is clicked.
 */
function HyperlinkCommand() {
  const { ed, editing, apply, refocus } = useTextTarget();
  const { open, view, selectedSlideId, masterTargetId, selection } = useEditor();
  const current = open ? editedSlide(open.project, view, selectedSlideId, masterTargetId) : null;
  const target =
    !editing && current && !current.isMaster && selection.length === 1
      ? current.slide.baseLayer.objects.find((each) => each.id === selection[0])
      : undefined;
  const onText = editing;
  const href = onText && ed ? ((ed.getAttributes('link')['href'] as string) ?? '') : '';
  const addClickTrigger = (url: string) => {
    if (!open || !current || !target) return;
    open.history.execute('trigger.add', {
      slideId: current.slide.id,
      trigger: {
        id: createId('trigger'),
        owner: { kind: 'object', id: target.id },
        event: { type: 'click', object: target.id },
        action: { type: 'openUrl', url },
        conditions: null,
        otherwise: null,
        enabled: true,
      },
    });
  };
  return (
    <IconPopover
      label={t('ribbon.hyperlink')}
      icon="link"
      compact
      disabled={!onText && !target}
      hint="Select text or an object to link"
    >
      {(close) => (
        <div className="link-popover">
          <RibbonField
            label="Link address"
            type="text"
            value={href}
            placeholder="https://… then Enter"
            onCommit={(value) => {
              if (onText) {
                apply(
                  (c) =>
                    value === null
                      ? c.extendMarkRange('link').unsetLink()
                      : c.extendMarkRange('link').setLink({ href: value }),
                  false,
                );
              } else if (value !== null) {
                addClickTrigger(value);
              }
            }}
            onDone={() => {
              close();
              refocus();
            }}
          />
          {!onText && (
            <p className="muted link-hint">
              Opens the address when the object is clicked, as a trigger you can change in the
              Triggers panel.
            </p>
          )}
        </div>
      )}
    </IconPopover>
  );
}

/**
 * The Font, Paragraph and Fit groups, on Home (B17): for the text being edited, or the whole of
 * a selected object's text; dimmed when nothing with text is selected.
 */
function TextGroups() {
  const { ed, obj, editing, apply, refocus } = useTextTarget();
  if (!ed || !obj) return <DimmedTextGroups />;
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
            {/* Back to the theme's style: font, size, colour, bold, italic and underline go;
                links stay (B17). */}
            <IconButton
              label="Clear formatting"
              icon="clearFormat"
              onClick={() =>
                apply((c) =>
                  c
                    .unsetMark('bold')
                    .unsetMark('italic')
                    .unsetMark('strike')
                    .unsetMark('underline')
                    .unsetMark('textStyle'),
                )
              }
            />
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
function LayoutChooser() {
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
    <select
      className="ribbon-select ribbon-stack-select"
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
  );
}

function HomeTab() {
  const painter = useFormatPainter();
  const { selection, selectedSlideId, open } = useEditor();
  const [finding, setFinding] = useState(false);
  // The slide shown: the first, until another is chosen.
  const shown = open ? currentSlide(open.project, selectedSlideId) : undefined;
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
  // The Animation Painter shares the painter (B17); this button is for formatting.
  const formatArmed = painter.armed && !painter.animations;
  const pick = (lock: boolean) => {
    const found = selectedOne();
    if (found) pickFormat(found, lock);
  };
  return (
    <>
      <Group label={t('ribbon.clipboard')} icon="clipboard">
        <Command icon="clipboard" label={t('ribbon.paste')} />
        <Stack>
          <Command small icon="cut" label={t('ribbon.cut')} />
          <Command small icon="copy" label={t('ribbon.copy')} />
          <Command
            small
            icon="copy"
            label={formatArmed ? 'Cancel Painter' : 'Format Painter'}
            onClick={
              canPick
                ? () => (formatArmed ? cancelFormatPainter() : pick(false))
                : formatArmed
                  ? cancelFormatPainter
                  : undefined
            }
            onDoubleClick={canPick ? () => pick(true) : undefined}
            pressed={formatArmed}
          />
        </Stack>
      </Group>
      <Group label={t('ribbon.slides')} icon="slidePlus">
        <Command icon="slidePlus" label={t('ribbon.newSlide')} onClick={editor.addSlide} />
        <Stack>
          <Command
            small
            icon="copy"
            label={t('ribbon.duplicateSlide')}
            onClick={shown ? () => overview.duplicateSlide(shown.slide.id) : undefined}
          />
          <Command
            small
            icon="order"
            label={t('ribbon.tabOrder')}
            onClick={() => {
              ui.setCollapsed('right', false);
              editor.showSlidePanel('properties');
            }}
          />
          <LayoutChooser />
        </Stack>
      </Group>
      <TextGroups />
      <Group label={t('ribbon.editing')} icon="find">
        <Stack>
          <Command
            small
            icon="find"
            label={t('ribbon.findReplace')}
            onClick={open ? () => setFinding(true) : undefined}
          />
        </Stack>
      </Group>
      {finding && open && <FindReplaceDialog open={open} onClose={() => setFinding(false)} />}
      <Group label={t('ribbon.arrange')} icon="align">
        <Stack>
          <Command small icon="group" label={t('ribbon.group')} onClick={stage.group} />
          <Command small icon="ungroup" label={t('ribbon.ungroup')} onClick={stage.ungroup} />
          <Command small icon="lock" label={t('ribbon.lock')} onClick={stage.lockSelection} />
        </Stack>
        <Stack>
          <Command small icon="unlock" label={t('ribbon.unlockAll')} onClick={stage.unlockAll} />
          <CommandMenu
            small
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
            small
            icon="order"
            label={t('ribbon.order')}
            items={[
              { label: 'Bring to Front', onClick: () => stage.reorder('front') },
              { label: 'Bring Forward', onClick: () => stage.reorder('forward') },
              { label: 'Send Backward', onClick: () => stage.reorder('backward') },
              { label: 'Send to Back', onClick: () => stage.reorder('back') },
            ]}
          />
        </Stack>
      </Group>
    </>
  );
}

/** Font and Paragraph with no text selected: in place, so the ribbon does not jump about, but dimmed. */
function DimmedTextGroups() {
  const hint = 'Select an object with text, or edit its text';
  return (
    <>
      <Group label="Font">
        <fieldset className="ribbon-fieldset" disabled title={hint}>
          <div className="format-rows">
            <div className="format-row">
              <select className="ribbon-select" aria-label="Font">
                <option>Font</option>
              </select>
              <input className="ribbon-input" aria-label="Font size" size={3} />
            </div>
            <div className="format-row">
              <button className="ribbon-button small icon-only" aria-label="Bold">
                <strong>B</strong>
              </button>
              <button className="ribbon-button small icon-only" aria-label="Italic">
                <em>I</em>
              </button>
              <button className="ribbon-button small icon-only" aria-label="Underline">
                <u>U</u>
              </button>
            </div>
          </div>
        </fieldset>
      </Group>
      <Group label="Paragraph">
        <fieldset className="ribbon-fieldset" disabled title={hint}>
          <div className="format-rows">
            <div className="format-row">
              <button className="ribbon-button small icon-only" aria-label="Align left">
                <Icon name="alignLeft" />
              </button>
              <button className="ribbon-button small icon-only" aria-label="Centre">
                <Icon name="alignCenter" />
              </button>
              <button className="ribbon-button small icon-only" aria-label="Align right">
                <Icon name="alignRight" />
              </button>
              <button className="ribbon-button small icon-only" aria-label="Justify">
                <Icon name="alignJustify" />
              </button>
            </div>
            <div className="format-row">
              <button className="ribbon-button small icon-only" aria-label="Bulleted list">
                <Icon name="listBullet" />
              </button>
              <button className="ribbon-button small icon-only" aria-label="Numbered list">
                <Icon name="listNumber" />
              </button>
            </div>
          </div>
        </fieldset>
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
  small,
}: {
  icon: IconName;
  label: string;
  items: readonly MenuItem[];
  /** A row with a small icon, to stack (B17). */
  small?: boolean;
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
        className={small ? 'ribbon-button compact' : 'ribbon-button'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setPlace(open ? null : popupPlace(container))}
      >
        <Icon name={icon} size={small ? 16 : 20} />
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

function InsertTab() {
  const reportError = (error: unknown) =>
    editor.showError(error instanceof Error ? error.message : String(error));
  return (
    <>
      <Group label={t('ribbon.slide')} icon="slidePlus">
        <Stack>
          <Command small icon="slidePlus" label={t('ribbon.newSlide')} onClick={editor.addSlide} />
          <Command small icon="slidePlus" label={t('ribbon.slideLayer')} onClick={addSlideLayer} />
          <Command
            small
            icon="zoomRegion"
            label={t('ribbon.zoomRegion')}
            onClick={stage.insertZoomRegion}
          />
        </Stack>
      </Group>
      <Group label={t('ribbon.media')} icon="image">
        <Command
          icon="image"
          label={t('ribbon.picture')}
          onClick={() => void stage.insertPictureFromFile()}
        />
        <ShapeGallery />
        <Stack>
          <Command
            small
            icon="video"
            label={t('ribbon.video')}
            onClick={() => void stage.insertVideoFromFile().catch(reportError)}
          />
          <Command
            small
            icon="audio"
            label={t('ribbon.audio')}
            onClick={() => void stage.insertAudioFromFile().catch(reportError)}
          />
          <CommandMenu
            small
            icon="caption"
            label={t('ribbon.caption')}
            items={[
              { label: 'Rounded Callout', onClick: () => stage.insertCallout('rounded') },
              { label: 'Square Callout', onClick: () => stage.insertCallout('square') },
              { label: 'Oval Callout', onClick: () => stage.insertCallout('oval') },
              { label: 'Cloud Callout', onClick: () => stage.insertCallout('cloud') },
            ]}
          />
        </Stack>
        <Stack>
          <Command
            small
            icon="icons"
            label={t('ribbon.icons')}
            onClick={() => editor.setLibraryOpen(true)}
          />
          <CommandMenu
            small
            icon="web"
            label={t('ribbon.webObject')}
            items={[
              { label: 'From a Web Address', onClick: stage.insertWebAddress },
              { label: 'From a Folder…', onClick: () => void stage.insertWebFolder() },
            ]}
          />
          <Command
            small
            icon="image"
            label={t('ribbon.importMedia')}
            onClick={() => void editor.importAssets()}
          />
        </Stack>
        <Stack>
          <Command
            small
            icon="microphone"
            label={t('ribbon.recordAudio')}
            onClick={() => editor.setRecordingOpen(true)}
          />
          <Command
            small
            icon="speech"
            label={t('ribbon.textToSpeech')}
            onClick={() => editor.openSpeech(null)}
          />
        </Stack>
      </Group>
      <Group label={t('ribbon.text')} icon="text">
        <Command icon="text" label={t('ribbon.textBox')} onClick={stage.insertTextBox} />
        <Stack>
          <Command small icon="table" label={t('ribbon.table')} onClick={stage.insertTable} />
          <SymbolCommand />
          <HyperlinkCommand />
        </Stack>
      </Group>
      <Group label={t('ribbon.interactiveObjects')} icon="button">
        <Command icon="button" label={t('ribbon.button')} onClick={stage.insertButton} />
        <Stack>
          <CommandMenu
            small
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
          <Command small icon="hotspot" label={t('ribbon.hotspot')} onClick={stage.insertHotspot} />
          <Command small icon="marker" label={t('ribbon.marker')} onClick={stage.insertMarker} />
        </Stack>
        <Stack>
          <Command
            small
            icon="scroll"
            label={t('ribbon.scrollingPanel')}
            onClick={stage.scrollingPanel}
          />
          <Command
            small
            icon="panorama"
            label={t('ribbon.360Image')}
            onClick={() => void stage.insertPanoramaFromFile()}
          />
          <Command
            small
            icon="transition"
            label={t('ribbon.trigger')}
            onClick={() => {
              ui.setCollapsed('right', false);
              editor.askNewTrigger();
            }}
          />
        </Stack>
        <Stack>
          <Command
            small
            icon="variable"
            label={t('ribbon.variables')}
            onClick={() => editor.setVariablesOpen(true)}
          />
        </Stack>
      </Group>
    </>
  );
}

/** Slides: making them, quizzing, and recording the screen (B17). */
function SlidesTab() {
  return (
    <>
      <Group label={t('ribbon.slide')} icon="slidePlus">
        <Command icon="slidePlus" label={t('ribbon.newSlide')} onClick={editor.addSlide} />
        <Stack>
          <Command
            small
            icon="slide"
            label={t('ribbon.newFromTemplate')}
            onClick={() => editor.setTemplatesOpen(true)}
          />
          <Command
            small
            icon="overview"
            label={t('ribbon.importSlides')}
            onClick={() => void editor.openSlideSource()}
          />
        </Stack>
      </Group>
      <Group label={t('ribbon.quizzing')} icon="question">
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
        <Stack>
          <CommandMenu
            small
            icon="survey"
            label={t('ribbon.survey')}
            items={SURVEY_KINDS.map(([kind, label]) => ({
              label,
              onClick: () => editor.addQuestionSlide(kind),
            }))}
          />
          <CommandMenu
            small
            icon="convert"
            label={t('ribbon.convertSlide')}
            items={FREEFORM_KINDS.map(([kind, label]) => ({
              label,
              onClick: () => editor.convertSlide(kind),
            }))}
          />
          <Command
            small
            icon="question"
            label={t('ribbon.questionBank')}
            onClick={() => editor.addBank()}
          />
        </Stack>
      </Group>
      <Group label={t('ribbon.record')} icon="screen">
        <Command
          icon="screen"
          label={t('ribbon.screenRecording')}
          onClick={() => editor.setScreenRecordingOpen(true)}
        />
      </Group>
    </>
  );
}

/**
 * Design → Background (B17, format 41): the current slide's own background — the theme's,
 * a colour, a gradient or a picture from the project's media — and Hide Layout Objects.
 */
function BackgroundGroup() {
  const { open, view, selectedSlideId } = useEditor();
  const current =
    open && view === 'slide' ? currentSlide(open.project, selectedSlideId) : undefined;
  if (!open || !current) {
    return (
      <Group label="Background">
        <p className="ribbon-hint">Backgrounds belong to slides, in Slide View.</p>
      </Group>
    );
  }
  const { slide } = current;
  const { background, hideLayoutObjects } = slide.properties;
  const set = (properties: { background?: Fill | null; hideLayoutObjects?: boolean }) =>
    open.history.execute('slide.setProperties', { slideId: slide.id, properties });
  const pictures = Object.entries(open.project.assets).filter(([, meta]) => meta.kind === 'image');
  const kind = background?.kind ?? 'theme';
  const literal = (color: unknown, fallback: string) =>
    typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
  const solid = background?.kind === 'solid' ? literal(background.color, '#ffffff') : '#ffffff';
  const stops =
    background?.kind === 'gradient'
      ? [
          literal(background.stops[0]?.color, '#ffffff'),
          literal(background.stops.at(-1)?.color, '#000000'),
        ]
      : ['#ffffff', '#c8d3e6'];
  const angle = background?.kind === 'gradient' ? background.angle : 90;
  const gradient = (from: string, to: string, degrees: number): Fill => ({
    kind: 'gradient',
    angle: degrees,
    stops: [
      { offset: 0, color: from },
      { offset: 1, color: to },
    ],
  });
  return (
    <Group label="Background" icon="palette">
      <Stack>
        <IconPopover label="Background" icon="palette" compact>
          {() => (
            <div className="background-popover" role="group" aria-label="Slide background">
              <label className="field">
                <span>Fill</span>
                <select
                  aria-label="Background fill"
                  value={kind === 'solid' ? 'solid' : kind === 'none' ? 'theme' : kind}
                  onChange={(event) => {
                    const choice = event.target.value;
                    if (choice === 'theme') set({ background: null });
                    else if (choice === 'solid')
                      set({ background: { kind: 'solid', color: solid } });
                    else if (choice === 'gradient')
                      set({ background: gradient(stops[0]!, stops[1]!, angle) });
                    else if (choice === 'image' && pictures[0])
                      set({ background: { kind: 'image', asset: pictures[0][0] } });
                  }}
                >
                  <option value="theme">The theme’s</option>
                  <option value="solid">Colour</option>
                  <option value="gradient">Gradient</option>
                  <option value="image" disabled={pictures.length === 0}>
                    Picture
                  </option>
                </select>
              </label>
              {background?.kind === 'solid' && (
                <label className="field">
                  <span>Colour</span>
                  <input
                    type="color"
                    aria-label="Background colour"
                    value={solid}
                    onChange={(event) =>
                      set({ background: { kind: 'solid', color: event.target.value } })
                    }
                  />
                </label>
              )}
              {background?.kind === 'gradient' && (
                <>
                  <label className="field">
                    <span>From</span>
                    <input
                      type="color"
                      aria-label="Gradient from"
                      value={stops[0]}
                      onChange={(event) =>
                        set({ background: gradient(event.target.value, stops[1]!, angle) })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>To</span>
                    <input
                      type="color"
                      aria-label="Gradient to"
                      value={stops[1]}
                      onChange={(event) =>
                        set({ background: gradient(stops[0]!, event.target.value, angle) })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Direction</span>
                    <select
                      aria-label="Gradient direction"
                      value={angle}
                      onChange={(event) =>
                        set({
                          background: gradient(stops[0]!, stops[1]!, Number(event.target.value)),
                        })
                      }
                    >
                      <option value={0}>Left to right</option>
                      <option value={90}>Top to bottom</option>
                      <option value={45}>Diagonal</option>
                    </select>
                  </label>
                </>
              )}
              {background?.kind === 'image' && (
                <label className="field">
                  <span>Picture</span>
                  <select
                    aria-label="Background picture"
                    value={background.asset}
                    onChange={(event) =>
                      set({ background: { kind: 'image', asset: event.target.value } })
                    }
                  >
                    {pictures.map(([hash, meta]) => (
                      <option key={hash} value={hash}>
                        {meta.fileName}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {pictures.length === 0 && (
                <p className="muted link-hint">
                  For a picture, bring one in first with Insert → Import Media.
                </p>
              )}
            </div>
          )}
        </IconPopover>
        <Command
          small
          icon="offSlideHide"
          label="Hide Layout Objects"
          pressed={hideLayoutObjects}
          onClick={() => set({ hideLayoutObjects: !hideLayoutObjects })}
        />
      </Stack>
    </Group>
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
      <Group label="Stage" icon="stageSize">
        <Command
          icon="stageSize"
          label="Stage Size"
          onClick={open ? () => setShowStage(true) : undefined}
        />
      </Group>
      <Group label="Theme" icon="palette">
        {open && (
          <div className="theme-presets" role="radiogroup" aria-label="Ready-made themes">
            {THEME_PRESETS.map((preset) => (
              <button
                key={preset.name}
                role="radio"
                className="theme-preset"
                aria-checked={isPreset(open.project.theme, preset)}
                aria-label={`${preset.name} theme`}
                title={`${preset.name}: ${preset.theme.fonts.heading} and ${preset.theme.fonts.body}`}
                style={{ background: preset.theme.colors.background }}
                onClick={() =>
                  open.history.execute('project.updateTheme', {
                    colors: { ...preset.theme.colors },
                    fonts: { ...preset.theme.fonts },
                  })
                }
              >
                {(['accent1', 'accent2', 'accent3', 'accent4'] as const).map((slot) => (
                  <span key={slot} style={{ background: preset.theme.colors[slot] }} />
                ))}
              </button>
            ))}
          </div>
        )}
        <Stack>
          <Command
            small
            icon="palette"
            label="Colours"
            onClick={open ? () => setShowTheme(true) : undefined}
          />
          <Command
            small
            icon="fonts"
            label="Fonts"
            onClick={open ? () => setShowTheme(true) : undefined}
          />
        </Stack>
      </Group>
      <BackgroundGroup />
      <Group label="Course" icon="tracking">
        <Stack>
          <Command
            small
            icon="tracking"
            label="Tracking"
            onClick={open ? () => setShowTracking(true) : undefined}
          />
          <Command
            small
            icon="player"
            label="Player…"
            onClick={open ? () => setShowPlayer(true) : undefined}
          />
          <Command
            small
            icon="translate"
            label="Translation…"
            onClick={open ? () => editor.setTranslationOpen(true) : undefined}
          />
        </Stack>
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
  const { open } = useEditor();
  const feedbackMaster = open ? feedbackMasterOf(open.project) : undefined;
  return (
    <>
      {/* Overview, Slide View and Master View are always in the title bar. */}
      <Group label={t('ribbon.views')} icon="master">
        <Stack>
          <Command
            small
            icon="master"
            label={t('ribbon.feedbackMaster')}
            onClick={feedbackMaster ? () => editor.openMaster(feedbackMaster.id) : undefined}
          />
        </Stack>
      </Group>
      <Group label="Show" icon="grid">
        <Stack>
          <Command
            small
            icon="rulers"
            label="Rulers"
            pressed={view.rulers}
            onClick={() => ui.setView({ rulers: !view.rulers })}
          />
          <Command
            small
            icon="grid"
            label="Grid"
            pressed={view.grid}
            onClick={() => ui.setView({ grid: !view.grid })}
          />
        </Stack>
        <Stack>
          <Command
            small
            icon="guide"
            label="Guides"
            pressed={view.guides}
            onClick={() => ui.setView({ guides: !view.guides })}
          />
          <Command
            small
            icon="snap"
            label="Snap"
            pressed={view.snap}
            onClick={() => ui.setView({ snap: !view.snap })}
          />
        </Stack>
      </Group>
      <Group label="Off the Slide" icon="offSlideDim">
        <div
          className="ribbon-stack"
          role="radiogroup"
          aria-label="Off the slide"
          data-testid="off-slide"
        >
          {OFF_SLIDE.map((choice) => (
            <button
              key={choice}
              className="ribbon-button compact"
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
      <Group label="Panels" icon="panelLeft">
        <Stack>
          {PANELS.map((panel) => (
            <Command
              key={panel}
              small
              {...PANEL_BUTTONS[panel]}
              pressed={!layout[panel].collapsed}
              onClick={() => ui.togglePanel(panel)}
            />
          ))}
        </Stack>
        <Stack>
          <Command small icon="reset" label="Reset Layout" onClick={ui.resetLayout} />
        </Stack>
      </Group>
      <Group label="Theme" icon="light">
        <div className="ribbon-stack" role="radiogroup" aria-label="Theme" data-testid="theme">
          {THEMES.map((choice) => (
            <button
              key={choice}
              className="ribbon-button compact"
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

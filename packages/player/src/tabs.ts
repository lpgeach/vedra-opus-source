import { labelText, notesText } from '@vedraopus/model';
import type { GlossaryTerm, LabelKey, Project, RichText } from '@vedraopus/model';

/**
 * The player's tabs (docs/briefs/P8.2-player-tabs.md): Resources, Glossary
 * and Notes open a panel over the course; the author's custom tabs fire
 * `playerTab` triggers.
 */

export type BuiltInTab = 'resources' | 'glossary' | 'notes';

/** One tab button in the bar. */
export type TabEntry =
  | { kind: BuiltInTab; id: BuiltInTab; label: string }
  | { kind: 'custom'; id: string; label: string };

/** Each built-in tab's label key (P8.3). */
const LABELS: Record<BuiltInTab, LabelKey> = {
  resources: 'resources',
  glossary: 'glossary',
  notes: 'notes',
};

/** Whether any slide has notes with words in them. */
function hasNotes(notes: RichText): boolean {
  return notesText(notes).trim() !== '';
}

/**
 * The tabs the bar shows, in order: the three built-ins that are switched on
 * and have something in them, then the custom tabs.
 */
export function visibleTabs(project: Project): TabEntry[] {
  const { tabs } = project.player;
  const slides = [...project.scenes, ...project.banks].flatMap((scene) => scene.slides);
  const shown: Record<BuiltInTab, boolean> = {
    resources: tabs.resources.show && tabs.resources.items.length > 0,
    glossary: tabs.glossary.show && tabs.glossary.terms.length > 0,
    notes: tabs.notes.show && slides.some((slide) => hasNotes(slide.notes)),
  };
  return [
    ...(['resources', 'glossary', 'notes'] as const)
      .filter((kind) => shown[kind])
      .map((kind): TabEntry => ({
        kind,
        id: kind,
        label: labelText(project.player.labels, LABELS[kind]),
      })),
    ...tabs.custom.map((tab): TabEntry => ({ kind: 'custom', id: tab.id, label: tab.label })),
  ];
}

/** The glossary in the order a learner looks things up: by term, ignoring case and accents. */
export function sortedGlossary(terms: readonly GlossaryTerm[]): GlossaryTerm[] {
  return [...terms].sort((a, b) =>
    a.term.localeCompare(b.term, undefined, { sensitivity: 'base' }),
  );
}

/** A slide's notes as the paragraphs the Notes panel shows; none when it has no words. */
export function notesParagraphs(notes: RichText): string[] {
  return hasNotes(notes) ? notesText(notes).split('\n') : [];
}

export interface TabEvents {
  /** The learner clicked a custom tab. */
  custom(tabId: string): void;
}

/**
 * The tab buttons for the bar and the panel they open, for the player to
 * place; `update` follows the current slide, and `close` shuts an open panel
 * (returning whether one was open), for Escape.
 */
export function createTabs(
  document: Document,
  project: Project,
  assetUrl: (hash: string, ext: string) => string,
  notesOf: (slideId: string) => RichText | undefined,
  events: TabEvents,
) {
  const make = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text?: string,
  ) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const panel = make('section', 'vo-player-tab-panel');
  panel.hidden = true;
  let open: BuiltInTab | null = null;
  let slideId: string | null = null;
  const buttons = new Map<string, HTMLButtonElement>();

  const fill = (kind: BuiltInTab) => {
    const { tabs } = project.player;
    const name = labelText(project.player.labels, LABELS[kind]);
    const heading = make('h2', 'vo-player-tab-title', name);
    if (kind === 'resources') {
      const list = make('ul', 'vo-player-resources');
      for (const item of tabs.resources.items) {
        const link = make('a', '', item.title);
        if (item.target.kind === 'link') {
          link.href = item.target.url;
        } else {
          const meta = project.assets[item.target.asset];
          link.href = assetUrl(item.target.asset, meta?.ext ?? '');
          link.dataset['file'] = meta?.fileName ?? '';
          if (meta) link.setAttribute('download', meta.fileName);
        }
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        const li = make('li', '');
        li.append(link);
        list.append(li);
      }
      panel.replaceChildren(heading, list);
    } else if (kind === 'glossary') {
      const list = make('dl', 'vo-player-glossary');
      for (const term of sortedGlossary(tabs.glossary.terms)) {
        list.append(make('dt', '', term.term), make('dd', '', term.definition));
      }
      panel.replaceChildren(heading, list);
    } else {
      const notes = slideId ? notesOf(slideId) : undefined;
      const paragraphs = notes ? notesParagraphs(notes) : [];
      panel.replaceChildren(
        heading,
        ...(paragraphs.length > 0
          ? paragraphs.map((line) => make('p', '', line))
          : [make('p', 'vo-player-tab-empty', labelText(project.player.labels, 'noNotes'))]),
      );
    }
    panel.setAttribute('aria-label', name);
  };

  const setOpen = (kind: BuiltInTab | null) => {
    open = kind;
    for (const [id, button] of buttons) {
      if (button.dataset['kind'] !== 'custom') {
        button.setAttribute('aria-expanded', String(id === kind));
      }
    }
    panel.hidden = kind === null;
    if (kind === null) {
      panel.removeAttribute('role');
      panel.replaceChildren();
    } else {
      panel.setAttribute('role', 'region');
      fill(kind);
    }
  };

  for (const tab of visibleTabs(project)) {
    const button = make('button', 'vo-player-tab', tab.label);
    button.type = 'button';
    button.dataset['kind'] = tab.kind;
    button.dataset['tab'] = tab.id;
    if (tab.kind === 'custom') {
      button.addEventListener('click', () => events.custom(tab.id));
    } else {
      const kind = tab.kind;
      button.setAttribute('aria-expanded', 'false');
      button.addEventListener('click', () => setOpen(open === kind ? null : kind));
    }
    buttons.set(tab.id, button);
  }

  return {
    buttons: [...buttons.values()],
    panel,
    /** Follow the slide: the Notes panel shows the current slide's notes. */
    update(current: string | null) {
      if (current === slideId) return;
      slideId = current;
      if (open === 'notes') fill('notes');
    },
    /** Close an open panel, giving focus back to its tab. True when one was open. */
    close(): boolean {
      if (open === null) return false;
      const button = buttons.get(open);
      setOpen(null);
      button?.focus();
      return true;
    },
  };
}

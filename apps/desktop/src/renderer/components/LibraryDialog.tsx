import type { GraphicNode } from '@vedraopus/model';
import { createElement, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { loadLibrary, searchLibrary } from '../library/library';
import type { LibraryItem, LibraryKind } from '../library/library';
import { stage } from '../stage/actions';
import { takeFocus } from './dialog-focus';

/** How many results are drawn at once; a search narrows the rest. */
export const SHOWN_AT_ONCE = 240;

const KINDS: [LibraryKind, string][] = [
  ['icons', 'Icons'],
  ['illustrations', 'Illustrations'],
];

/** `stroke-width` → `strokeWidth`, as React names SVG attributes. */
const reactName = (name: string) =>
  name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

/** A library item drawn small: ink in the text colour, accent in the theme's accent. */
function Preview({ item }: { item: LibraryItem }) {
  const paint = (value: string) =>
    value === 'ink' ? 'currentColor' : value === 'accent' ? 'var(--accent)' : value;
  const draw = (node: GraphicNode, index: number): ReactElement => {
    const props: Record<string, string | number> = { key: index };
    for (const [name, value] of Object.entries(node.attrs)) {
      if (value === undefined) continue;
      props[reactName(name)] = name === 'fill' || name === 'stroke' ? paint(value) : value;
    }
    return createElement(node.tag, props, ...node.children.map(draw));
  };
  return (
    <svg
      viewBox={`0 0 ${item.viewBox.width} ${item.viewBox.height}`}
      preserveAspectRatio="xMidYMid meet"
      strokeWidth={item.strokeWidth ?? undefined}
      aria-hidden="true"
      focusable="false"
    >
      {item.nodes.map(draw)}
    </svg>
  );
}

/**
 * Insert → Icons and Illustrations (docs/briefs/P9.8-icons-library.md): Lucide's
 * icons and the Open Doodles, searched by name and tag. Choosing one puts a copy
 * of its drawing on the slide.
 */
export function LibraryDialog({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<LibraryKind>('icons');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Record<LibraryKind, LibraryItem[] | undefined>>({
    icons: undefined,
    illustrations: undefined,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (items[kind]) return;
    let live = true;
    loadLibrary(kind).then(
      (loaded) => {
        if (live) setItems((known) => ({ ...known, [kind]: loaded }));
      },
      (problem: unknown) => {
        if (live) setError(problem instanceof Error ? problem.message : String(problem));
      },
    );
    return () => {
      live = false;
    };
  }, [kind, items]);

  const all = items[kind];
  const found = useMemo(() => (all ? searchLibrary(all, query) : []), [all, query]);
  const shown = found.slice(0, SHOWN_AT_ONCE);
  const noun = kind === 'icons' ? 'icon' : 'illustration';

  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        className="dialog library-dialog"
        ref={takeFocus}
        tabIndex={-1}
        role="dialog"
        aria-label="Icons and Illustrations"
        data-testid="library-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
      >
        <h2>Icons and Illustrations</h2>
        <div className="library-tabs" role="tablist" aria-label="Library">
          {KINDS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={kind === value}
              className={kind === value ? 'active' : undefined}
              onClick={() => setKind(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="library-search"
          aria-label="Search the library"
          placeholder={
            kind === 'icons' ? 'Search icons, such as “heart” or “arrow”' : 'Search illustrations'
          }
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <p className="muted" data-testid="library-count" aria-live="polite">
          {error
            ? error
            : !all
              ? 'Loading…'
              : found.length === 0
                ? `No ${noun}s match.`
                : found.length > shown.length
                  ? `Showing ${shown.length} of ${found.length} ${noun}s. Search to find others.`
                  : `${found.length} ${found.length === 1 ? noun : `${noun}s`}`}
        </p>
        <div className={`library-grid ${kind}`} role="list" data-testid="library-grid">
          {shown.map((item) => (
            <div role="listitem" key={item.key}>
              <button
                type="button"
                className="library-item"
                title={item.title}
                aria-label={item.title}
                onClick={() => {
                  stage.insertGraphic(item);
                  onClose();
                }}
              >
                <Preview item={item} />
                {kind === 'illustrations' && <span>{item.title}</span>}
              </button>
            </div>
          ))}
        </div>
        <p className="muted library-credit">
          Icons: Lucide (ISC licence). Illustrations: Open Doodles by Pablo Stanley (CC0).
        </p>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

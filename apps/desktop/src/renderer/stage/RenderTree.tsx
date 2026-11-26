/**
 * Draws what @vedraopus/render describes, with React. The render package
 * returns plain data so that it need not depend on React; this is the editor's
 * back end for it, alongside the package's own `toMarkup` and `toDom`.
 */
import type { SceneObject } from '@vedraopus/model';
import { renderObject } from '@vedraopus/render';
import type { RenderChild, RenderContext } from '@vedraopus/render';
import { createElement, memo } from 'react';
import type { CSSProperties, ReactNode } from 'react';

/** `stroke-width` → `strokeWidth`, as React names attributes and styles. */
const camel = (name: string) =>
  name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

function attributeName(name: string): string {
  if (name === 'class') return 'className';
  // These two families keep their hyphens in React.
  if (name.startsWith('data-') || name.startsWith('aria-')) return name;
  return camel(name);
}

export function toReact(
  node: RenderChild,
  key?: string | number,
  options?: { hideText?: boolean; hideCell?: string },
): ReactNode {
  if (typeof node === 'string') return node;
  if (options?.hideText && node.attrs['class']?.includes('vo-text')) return null;
  // Editing one table cell (P9.9): only that cell's text gives way to the editor.
  if (options?.hideCell !== undefined && node.attrs['data-cell'] === options.hideCell) {
    options = { hideText: true };
  }
  const props: Record<string, unknown> = { key };
  for (const [name, value] of Object.entries(node.attrs)) props[attributeName(name)] = value;
  const style: Record<string, string> = {};
  for (const [property, value] of Object.entries(node.style)) style[camel(property)] = value;
  if (Object.keys(style).length > 0) props['style'] = style as CSSProperties;
  return createElement(
    node.tag,
    props,
    ...node.children.map((child, index) => toReact(child, index, options)),
  );
}

/**
 * One object on the stage. Projects are immutable, so an object that has not
 * changed is the same object as last time and React skips it: dragging one
 * shape does not redraw the others.
 */
export const ObjectView = memo(function ObjectView({
  object,
  context,
  editingText,
  editingCell,
  state = 'normal',
}: {
  object: SceneObject;
  context: RenderContext;
  editingText?: boolean;
  /** A table's cell being edited, as "row:column" (P9.9). */
  editingCell?: string | undefined;
  /** The state it is drawn in, for objects whose drawing depends on it. */
  state?: string;
}) {
  return toReact(
    renderObject(object, context, state),
    undefined,
    editingCell !== undefined
      ? { hideCell: editingCell }
      : editingText
        ? { hideText: true }
        : undefined,
  );
});

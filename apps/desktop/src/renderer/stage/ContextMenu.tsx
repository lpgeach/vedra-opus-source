/**
 * The menu a right-click on the stage opens. Built in the page rather than as a
 * native menu so it can be tested, drawn and dismissed like the ribbon's menus.
 */
import type { SceneObject } from '@vedraopus/model';
import { useEffect, useRef } from 'react';
import type { Point } from './geometry';

export type ContextAction =
  | 'cut'
  | 'copy'
  | 'paste'
  | 'duplicate'
  | 'delete'
  | 'front'
  | 'forward'
  | 'backward'
  | 'back'
  | 'group'
  | 'ungroup'
  | 'lock';

interface ContextMenuProps {
  /** Where the right-click was, in client pixels. */
  at: Point;
  selection: readonly SceneObject[];
  onAction: (action: ContextAction) => void;
  onClose: () => void;
}

export function ContextMenu({ at, selection, onAction, onClose }: ContextMenuProps) {
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const editable = selection.filter((object) => !object.locked);
  const any = editable.length > 0;
  const canGroup = editable.length >= 2;
  const canUngroup = selection.some((object) => object.type === 'group');

  const choice = (label: string, action: ContextAction, enabled = any) => (
    <button
      key={label}
      role="menuitem"
      className="menu-item"
      disabled={!enabled}
      onClick={() => {
        onAction(action);
        onClose();
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      ref={menu}
      className="menu-panel context-menu"
      role="menu"
      aria-label="Stage"
      data-testid="stage-context-menu"
      style={{
        left: Math.min(at.x, window.innerWidth - 200),
        top: Math.min(at.y, Math.max(0, window.innerHeight - 380)),
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {choice('Cut', 'cut')}
      {choice('Copy', 'copy')}
      {choice('Paste', 'paste', true)}
      {choice('Duplicate', 'duplicate')}
      {choice('Delete', 'delete')}
      <div className="menu-separator" role="separator" />
      {choice('Bring to Front', 'front')}
      {choice('Bring Forward', 'forward')}
      {choice('Send Backward', 'backward')}
      {choice('Send to Back', 'back')}
      <div className="menu-separator" role="separator" />
      {choice('Group', 'group', canGroup)}
      {choice('Ungroup', 'ungroup', canUngroup)}
      {choice('Lock', 'lock')}
    </div>
  );
}

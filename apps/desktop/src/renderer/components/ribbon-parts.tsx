import { createContext, useContext, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Icon } from './icons';
import type { IconName } from './icons';
import { popupPlace, useDismiss } from './popover';

/** Pieces every ribbon tab is built from. */

/**
 * How each group fits the window (B17), by label: tight (its small commands show only their
 * icons) or folded into a drop-down. The ribbon measures itself and decides (`useFolding`).
 */
export interface GroupFit {
  tight: ReadonlySet<string>;
  folded: ReadonlySet<string>;
}
export const FoldedGroups = createContext<GroupFit>({ tight: new Set(), folded: new Set() });

export function Group({
  label,
  icon = 'chevronDown',
  children,
}: {
  label: string;
  /** Shown on the group's button when it is folded. */
  icon?: IconName;
  children: ReactNode;
}) {
  const fit = useContext(FoldedGroups);
  const folded = fit.folded.has(label);
  const tight = fit.tight.has(label);
  return (
    <div
      className={`ribbon-group${folded ? ' ribbon-group-folded' : ''}${tight ? ' ribbon-group-tight' : ''}`}
      role="group"
      aria-label={label}
    >
      {folded ? (
        <FoldedGroup label={label} icon={icon}>
          {children}
        </FoldedGroup>
      ) : (
        <div className="ribbon-group-items">{children}</div>
      )}
      <div className="ribbon-group-label">{label}</div>
    </div>
  );
}

/** A group folded to one button, its commands in a panel under it. */
function FoldedGroup({
  label,
  icon,
  children,
}: {
  label: string;
  icon: IconName;
  children: ReactNode;
}) {
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const open = place !== null;
  useDismiss(container, open, () => setPlace(null));
  return (
    <div className="gallery ribbon-group-items" ref={container}>
      <button
        className="ribbon-button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setPlace(open ? null : popupPlace(container))}
      >
        <Icon name={icon} size={20} />
        <span>
          {label} <Icon name="chevronDown" size={10} />
        </span>
      </button>
      {place && (
        <div
          className="menu-panel ribbon-group-panel"
          role="group"
          aria-label={label}
          style={place}
          // A command used closes the panel; a menu's own button keeps it open.
          onClick={(event) => {
            const button = (event.target as Element).closest('button, [role="menuitem"]');
            if (button && !button.hasAttribute('aria-haspopup')) setPlace(null);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Up to three small commands, one above the other (B17). */
export function Stack({ children }: { children: ReactNode }) {
  return <div className="ribbon-stack">{children}</div>;
}

export interface CommandProps {
  icon: IconName;
  label: string;
  /** Leave out for a command that is not built yet: it shows disabled. */
  onClick?: () => void;
  onDoubleClick?: () => void;
  /** For on/off commands. */
  pressed?: boolean;
  /** Small: a row with a small icon, to stack in a `Stack` (B17). Large by default. */
  small?: boolean;
  /** Shown on hover, when the label is not enough. */
  title?: string;
}

export function Command({
  icon,
  label,
  onClick,
  onDoubleClick,
  pressed,
  small,
  title,
}: CommandProps) {
  return (
    <button
      className={small ? 'ribbon-button compact' : 'ribbon-button'}
      disabled={!onClick}
      // A small command keeps its name when a tight group shows only its icon.
      aria-label={small ? label : undefined}
      title={
        onClick
          ? (title ?? (small ? label : undefined))
          : `${label.replace('…', '')} is not available yet`
      }
      aria-pressed={pressed}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <Icon name={icon} size={small ? 16 : 20} />
      <span>{label}</span>
    </button>
  );
}

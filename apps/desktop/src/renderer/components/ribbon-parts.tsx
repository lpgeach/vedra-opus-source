import type { ReactNode } from 'react';
import { Icon } from './icons';
import type { IconName } from './icons';

/** Pieces every ribbon tab is built from. */

export function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ribbon-group" role="group" aria-label={label}>
      <div className="ribbon-group-items">{children}</div>
      <div className="ribbon-group-label">{label}</div>
    </div>
  );
}

export interface CommandProps {
  icon: IconName;
  label: string;
  /** Leave out for a command that is not built yet: it shows disabled. */
  onClick?: () => void;
  onDoubleClick?: () => void;
  /** For on/off commands. */
  pressed?: boolean;
}

export function Command({ icon, label, onClick, onDoubleClick, pressed }: CommandProps) {
  return (
    <button
      className="ribbon-button"
      disabled={!onClick}
      title={onClick ? undefined : `${label.replace('…', '')} is not available yet`}
      aria-pressed={pressed}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <Icon name={icon} size={20} />
      <span>{label}</span>
    </button>
  );
}

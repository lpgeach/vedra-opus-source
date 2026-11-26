import type { KeyboardEvent } from 'react';

interface TabsProps<T extends string> {
  /** What the tabs choose between, for screen readers. */
  label: string;
  tabs: readonly { id: T; label: string }[];
  active: T;
  onSelect: (id: T) => void;
  className?: string;
}

/**
 * A row of tabs. Left and Right move between them, as in any desktop tab
 * strip; only the active tab is in the Tab order.
 */
export function Tabs<T extends string>({ label, tabs, active, onSelect, className }: TabsProps<T>) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.id === active);
    const next = tabs[(index + step + tabs.length) % tabs.length]!;
    onSelect(next.id);
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons[tabs.indexOf(next)]?.focus();
  };

  return (
    <div
      className={`tabs ${className ?? ''}`}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          className="tab"
          aria-selected={tab.id === active}
          tabIndex={tab.id === active ? 0 : -1}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

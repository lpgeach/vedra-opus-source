import { useEffect, useRef, useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { editor } from '../project-store';

interface NumericInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'min' | 'max'
> {
  /** What the field shows when it is not being typed into. */
  value: string;
  /** Called with each usable number as it is typed, or null when the field is emptied. */
  onValue: (value: number | null) => void;
  min?: number;
  max?: number;
  /** Called when Enter or Escape ends the entry (for example, to put focus back in the text). */
  onDone?: () => void;
  /** Label of the undo step the entry makes. */
  undoLabel?: string;
}

/**
 * A field for a number that applies as the author types.
 *
 * It is a text input, not `type="number"`: Chromium gives a number input no
 * typing at all while text is selected in the on-stage editor. It keeps what
 * is typed while it has focus (so "-" or "1." are not thrown away), and all
 * the changes made from one entry become one undo step.
 */
export function NumericInput({
  value,
  onValue,
  min,
  max,
  onDone,
  undoLabel = 'Change value',
  ...rest
}: NumericInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const gathering = useRef(false);
  const finish = () => {
    if (gathering.current) editor.commitGesture();
    gathering.current = false;
  };
  // If the field goes away mid-entry, the undo step still has to end.
  useEffect(
    () => () => {
      if (gathering.current) editor.commitGesture();
      gathering.current = false;
    },
    [],
  );
  const usable = (text: string) => {
    if (!/^-?(\d+\.?\d*|\.\d+)$/.test(text)) return false;
    const n = Number(text);
    return Number.isFinite(n) && (min === undefined || n >= min) && (max === undefined || n <= max);
  };
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      className={`numeric-input ${rest.className ?? ''}`}
      value={draft ?? value}
      onFocus={() => setDraft(value)}
      onBlur={() => {
        setDraft(null);
        finish();
      }}
      onChange={(event) => {
        const text = event.target.value.replace(/[^0-9.-]/g, '');
        setDraft(text);
        if (text !== '' && !usable(text)) return;
        if (!gathering.current) {
          editor.beginGesture(undoLabel);
          gathering.current = true;
        }
        onValue(text === '' ? null : Number(text));
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter' || event.key === 'Escape') {
          setDraft(null);
          finish();
          onDone?.();
        }
      }}
    />
  );
}

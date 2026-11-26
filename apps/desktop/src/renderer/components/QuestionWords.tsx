/** Words typed in and kept on leaving the field (or Enter, for one line). */
export function Words({
  label,
  value,
  rows,
  placeholder,
  onCommit,
}: {
  label: string;
  value: string;
  rows?: number;
  placeholder?: string;
  onCommit: (text: string) => void;
}) {
  const common = {
    'aria-label': label,
    defaultValue: value,
    placeholder,
    onBlur: (event: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => {
      if (event.currentTarget.value !== value) onCommit(event.currentTarget.value);
    },
  };
  // Remount when the words change from elsewhere (undo, Slide View).
  const key = `${label}/${value}`;
  return rows ? (
    <textarea key={key} {...common} rows={rows} className="question-words" />
  ) : (
    <input
      key={key}
      {...common}
      className="question-words"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

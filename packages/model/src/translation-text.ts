/**
 * Translation units as plain text with bracket tags, for the two-column
 * document (docs/briefs/P10.3-translation.md, part B): formatting as
 * `[1]…[/1]`, a line break as `[br]`. Word keeps them as typed.
 */
import type { Inline } from './translation';

const TAG = /\[(\/?)(\d+)\]|\[br\]/g;

/** Inlines as text with bracket tags. */
export function taggedText(inlines: readonly Inline[]): string {
  return inlines
    .map((each) =>
      'text' in each
        ? each.text
        : 'open' in each
          ? `[${each.open}]`
          : 'close' in each
            ? `[/${each.close}]`
            : '[br]',
    )
    .join('');
}

/**
 * Text with bracket tags as inlines. A new line counts as `[br]`, as a
 * translator may press Enter instead of typing it. A closing tag that closes
 * nothing is kept as a tag, so that `applyTranslation` refuses the unit.
 */
export function fromTaggedText(text: string): Inline[] {
  const out: Inline[] = [];
  const words = (part: string) => {
    part.split(/\r?\n/).forEach((line, index) => {
      if (index > 0) out.push({ br: true });
      if (line) out.push({ text: line });
    });
  };
  let at = 0;
  for (const match of text.matchAll(TAG)) {
    words(text.slice(at, match.index));
    if (match[0] === '[br]') out.push({ br: true });
    else if (match[1] === '/') out.push({ close: Number(match[2]) });
    else out.push({ open: Number(match[2]) });
    at = match.index + match[0].length;
  }
  words(text.slice(at));
  return out;
}

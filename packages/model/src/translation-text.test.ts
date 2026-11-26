import { describe, expect, it } from 'vitest';
import { fromTaggedText, taggedText } from './translation-text';
import type { Inline } from './translation';

/** Units as text with bracket tags, for the two-column document (P10.3, part B). */

describe('bracket tags', () => {
  it('write formatting as [n]…[/n] and line breaks as [br], and read them back', () => {
    const inlines: Inline[] = [
      { text: 'Read the ' },
      { open: 1 },
      { text: 'safety' },
      { close: 1 },
      { br: true },
      { text: 'notes [sic], %Name%.' },
    ];
    const text = taggedText(inlines);
    expect(text).toBe('Read the [1]safety[/1][br]notes [sic], %Name%.');
    expect(fromTaggedText(text)).toEqual(inlines);
  });

  it('read a new line as a break, and keep stray tags for the import to refuse', () => {
    expect(fromTaggedText('One\r\nTwo')).toEqual([{ text: 'One' }, { br: true }, { text: 'Two' }]);
    expect(fromTaggedText('[/2]x[12]')).toEqual([{ close: 2 }, { text: 'x' }, { open: 12 }]);
    expect(fromTaggedText('')).toEqual([]);
  });
});

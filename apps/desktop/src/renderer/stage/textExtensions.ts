// Named imports only: in TipTap 3 some packages' default export is another extension
// (`@tiptap/extension-font-family`'s is the TextStyle kit).
import { Color } from '@tiptap/extension-color';
import { FontFamily } from '@tiptap/extension-font-family';
import { Link } from '@tiptap/extension-link';
import { TextAlign } from '@tiptap/extension-text-align';
import { Underline } from '@tiptap/extension-underline';
import { StarterKit } from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import { Paragraph } from '@tiptap/extension-paragraph';

/** Extend TextStyle to carry font size and line height in marks' attrs. */
export const TextStyleExtended = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (element) => element.style.fontSize || null,
        renderHTML: (attributes) =>
          attributes.fontSize ? { style: `font-size: ${attributes.fontSize}` } : {},
      },
      lineHeight: {
        default: null,
        parseHTML: (element) => element.style.lineHeight || null,
        renderHTML: (attributes) =>
          attributes.lineHeight ? { style: `line-height: ${attributes.lineHeight}` } : {},
      },
    };
  },
});

/** Paragraph with alignment/spacing/line-height attributes compatible with our serializer. */
export const ParagraphExtended = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      textAlign: {
        default: null,
        parseHTML: (element) => element.style.textAlign || null,
        renderHTML: (attributes) =>
          attributes.textAlign ? { style: `text-align: ${attributes.textAlign}` } : {},
      },
      lineHeight: {
        default: null,
        parseHTML: (element) => element.style.lineHeight || null,
        renderHTML: (attributes) =>
          attributes.lineHeight ? { style: `line-height: ${attributes.lineHeight}` } : {},
      },
      spaceBefore: {
        default: null,
        parseHTML: () => null,
        renderHTML: (attributes) =>
          typeof attributes.spaceBefore === 'number'
            ? { style: `margin-top: ${attributes.spaceBefore}px` }
            : {},
      },
      spaceAfter: {
        default: null,
        parseHTML: () => null,
        renderHTML: (attributes) =>
          typeof attributes.spaceAfter === 'number'
            ? { style: `margin-bottom: ${attributes.spaceAfter}px` }
            : {},
      },
    };
  },
});

/**
 * Every extension rich text uses. The on-stage editor and the hidden editor
 * that formats a whole box (`whole-text.ts`) must agree, so both take it from here.
 */
export function richTextExtensions() {
  return [
    StarterKit.configure({
      paragraph: false,
      heading: false,
      code: false,
      codeBlock: false,
      blockquote: false,
      horizontalRule: false,
      // TipTap 3's kit also brings these. Link and Underline are added below with our own
      // settings; a trailing paragraph and the list keys would change documents and keys
      // from what authors had with TipTap 2.
      link: false,
      underline: false,
      trailingNode: false,
      listKeymap: false,
    }),
    ParagraphExtended,
    Underline,
    TextStyleExtended,
    Color,
    FontFamily,
    Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
    TextAlign.configure({ types: ['paragraph'] }),
  ];
}

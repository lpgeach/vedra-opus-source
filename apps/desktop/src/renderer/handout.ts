/**
 * What a handout holds (docs/briefs/P11.3-video-and-handout.md, part A): the
 * course's slides in order, each with its number, title and notes.
 */
import { opensAsLightbox } from '@vedraopus/model';
import type { Project, RichText, RichTextNode, Slide } from '@vedraopus/model';

export type HandoutLayout = 'notes' | 'lines';

export interface HandoutOptions {
  layout: HandoutLayout;
  /** Every scene, or only this one. */
  sceneId: string | null;
}

export interface HandoutSlide {
  slide: Slide;
  /** Its number in the course, counting every scene's slides. */
  number: number;
}

/**
 * The slides a handout shows: the scenes' slides in order (all, or one
 * scene's), without slides that only ever open as lightboxes. Question banks
 * are not scenes, so their slides never show.
 */
export function handoutSlides(project: Project, sceneId: string | null): HandoutSlide[] {
  let number = 0;
  const found: HandoutSlide[] = [];
  for (const scene of project.scenes) {
    for (const slide of scene.slides) {
      number += 1;
      if (sceneId !== null && scene.id !== sceneId) continue;
      if (opensAsLightbox(project, slide.id)) continue;
      found.push({ slide, number });
    }
  }
  return found;
}

/** Slides a page for each layout: one with its notes, or three with lines to write on. */
export const SLIDES_PER_PAGE: Record<HandoutLayout, number> = { notes: 1, lines: 3 };

/** The handout's slides in pages. */
export function handoutPages(
  slides: readonly HandoutSlide[],
  layout: HandoutLayout,
): HandoutSlide[][] {
  const size = SLIDES_PER_PAGE[layout];
  const pages: HandoutSlide[][] = [];
  for (let i = 0; i < slides.length; i += size) pages.push(slides.slice(i, i + size));
  return pages;
}

/** A node's words, run together. */
function textOf(node: RichTextNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  return (node.content ?? []).map(textOf).join('');
}

/**
 * Notes as plain paragraphs for the Word handout (part B): one per paragraph,
 * a bulleted item starting "• " and a numbered one with its number.
 */
export function notesParagraphs(doc: RichText): string[] {
  const out: string[] = [];
  const block = (node: RichTextNode) => {
    if (node.type === 'bulletList' || node.type === 'orderedList') {
      const start = typeof node.attrs?.['start'] === 'number' ? node.attrs['start'] : 1;
      (node.content ?? []).forEach((item, index) => {
        const marker = node.type === 'bulletList' ? '• ' : `${start + index}. `;
        out.push(marker + (item.content ?? []).map(textOf).join(' ').trim());
      });
    } else {
      out.push(textOf(node));
    }
  };
  for (const node of doc.content) block(node);
  // Trailing empty paragraphs are not notes.
  while (out.length > 0 && out[out.length - 1]!.trim() === '') out.pop();
  return out;
}

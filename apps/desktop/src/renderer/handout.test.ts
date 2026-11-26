import { createEmptyProject, createId, createScene, createSlide } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { handoutPages, handoutSlides, notesParagraphs } from './handout';

/** Which slides a handout shows, and how they are paged (P11.3 part A). */

function course() {
  const project = createEmptyProject('Course');
  const first = project.scenes[0]!;
  first.slides[0]!.title = 'Welcome';
  first.slides.push(createSlide('Exits'));
  const second = createScene('Part two');
  second.slides = [createSlide('Alarms'), createSlide('Help')];
  project.scenes.push(second);
  return { project, first, second };
}

describe('the handout’s slides', () => {
  it('are every scene’s slides in order, numbered through the course', () => {
    const { project } = course();
    expect(handoutSlides(project, null).map(({ slide, number }) => [number, slide.title])).toEqual([
      [1, 'Welcome'],
      [2, 'Exits'],
      [3, 'Alarms'],
      [4, 'Help'],
    ]);
  });

  it('can be one scene’s, keeping their numbers in the course', () => {
    const { project, second } = course();
    expect(handoutSlides(project, second.id).map(({ number }) => number)).toEqual([3, 4]);
  });

  it('leave out slides that only open as lightboxes', () => {
    const { project } = course();
    const [welcome, exits] = project.scenes[0]!.slides;
    welcome!.triggers.push({
      id: createId('trigger'),
      owner: { kind: 'slide', id: welcome!.id },
      event: { type: 'keyPress', key: 'h' },
      action: { type: 'openLightbox', slide: exits!.id, controls: true },
      conditions: null,
      otherwise: null,
      enabled: true,
    });
    expect(handoutSlides(project, null).map(({ slide }) => slide.title)).toEqual([
      'Welcome',
      'Alarms',
      'Help',
    ]);
  });

  it('go one to a page with notes, or three with lines', () => {
    const { project } = course();
    const slides = handoutSlides(project, null);
    expect(handoutPages(slides, 'notes').map((page) => page.length)).toEqual([1, 1, 1, 1]);
    expect(handoutPages(slides, 'lines').map((page) => page.length)).toEqual([3, 1]);
  });
});

describe('notes as plain paragraphs, for the Word handout', () => {
  it('keeps paragraphs, marks bullets and numbers, and drops trailing empty lines', () => {
    const doc = {
      type: 'doc' as const,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Say ' },
            { type: 'text', text: 'hello.' },
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Exits' }] }],
            },
          ],
        },
        {
          type: 'orderedList',
          attrs: { start: 3 },
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Call' }] }],
            },
          ],
        },
        { type: 'paragraph', content: [] },
      ],
    };
    expect(notesParagraphs(doc)).toEqual(['Say hello.', '• Exits', '3. Call']);
  });
});

import {
  createButtonObject,
  createCheckboxObject,
  createGroupObject,
  createId,
  createImageObject,
  createShapeObject,
  createSlide,
  createTextObject,
} from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { clickableObjects, richTextWords, semanticsOf } from './semantics';

/** What objects are to screen readers and the keyboard (docs/briefs/P10.1-accessibility.md). */

describe('object semantics in a course', () => {
  it('makes buttons and anything a click trigger names a named, pressable button', () => {
    const slide = createSlide('One');
    const button = createButtonObject('Go on');
    const picture = createShapeObject({ kind: 'triangle' });
    picture.a11y.altText = 'Gold star';
    const words = createTextObject('Read more');
    slide.baseLayer.objects.push(button, picture, words);
    slide.triggers.push({
      id: createId('trigger'),
      owner: { kind: 'object', id: picture.id },
      event: { type: 'click', object: picture.id },
      action: { type: 'jumpToSlide', target: { kind: 'next' } },
      conditions: null,
      otherwise: null,
      enabled: true,
    });
    const clickable = clickableObjects(slide);
    expect([...clickable].sort()).toEqual([button.id, picture.id].sort());
    expect(semanticsOf(button, true)).toEqual({ role: 'button', label: 'Go on', pressable: true });
    expect(semanticsOf(picture, true)).toEqual({
      role: 'button',
      label: 'Gold star',
      pressable: true,
    });
    // A clickable object marked decorative is still a button: it does something.
    picture.a11y.visibleToAssistiveTech = false;
    expect(semanticsOf(picture, true).role).toBe('button');
    expect(semanticsOf(words, false)).toEqual({});
  });

  it('hides decoration, names a wordless picture, and leaves the rest as they are', () => {
    const plain = createShapeObject({ kind: 'rect' });
    plain.a11y.visibleToAssistiveTech = false;
    expect(semanticsOf(plain, false)).toEqual({ hidden: true });
    const named = createShapeObject({ kind: 'ellipse' });
    named.a11y.altText = 'A blue circle';
    expect(semanticsOf(named, false)).toEqual({ role: 'img', label: 'A blue circle' });
    // An image's alt text is its own <img alt>.
    const image = createImageObject('a'.repeat(64));
    image.a11y.altText = 'A view';
    expect(semanticsOf(image, false)).toEqual({});
    const group = createGroupObject([createShapeObject({ kind: 'rect' }), named], 'Pair');
    expect(semanticsOf(group, false)).toEqual({});
    group.a11y.altText = 'Two shapes';
    expect(semanticsOf(group, false)).toEqual({ role: 'group', label: 'Two shapes' });
    // Objects with their own semantics are left alone.
    expect(semanticsOf(createCheckboxObject('Tick'), true)).toEqual({});
  });

  it('reads rich text as words', () => {
    expect(
      richTextWords({
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'One' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'two' }] },
        ],
      }),
    ).toBe('One two');
  });
});

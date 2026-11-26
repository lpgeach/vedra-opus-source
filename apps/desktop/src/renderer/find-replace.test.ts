import {
  createEmptyProject,
  createShapeObject,
  createTextObject,
  shapePreset,
} from '@vedraopus/model';
import type { RichText } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { countIn, findInProject, plainText, replaceIn } from './find-replace';

const doc = (...paragraphs: (string | { text: string; bold?: boolean }[])[]): RichText =>
  ({
    type: 'doc',
    content: paragraphs.map((runs) => ({
      type: 'paragraph',
      content: (typeof runs === 'string' ? [{ text: runs }] : runs).map((run) => ({
        type: 'text',
        text: run.text,
        ...('bold' in run && run.bold ? { marks: [{ type: 'bold' }] } : {}),
      })),
    })),
  }) as RichText;

describe('find and replace (B17)', () => {
  it('counts matches in every run, with or without case', () => {
    const text = doc('Safety first. safety always.', [{ text: 'SAFETY', bold: true }]);
    expect(countIn(text, 'safety', false)).toBe(3);
    expect(countIn(text, 'safety', true)).toBe(1);
    expect(countIn(text, '', false)).toBe(0);
    // Characters with a meaning in patterns are only themselves.
    expect(countIn(doc('a.b a+b (a)'), 'a.b', false)).toBe(1);
    expect(countIn(doc('a.b a+b (a)'), '(a)', false)).toBe(1);
  });

  it('replaces in every run, keeping the formatting, and leaves the original alone', () => {
    const text = doc('Old name, old name', [{ text: 'old', bold: true }]);
    const { doc: changed, count } = replaceIn(text, 'old', 'new', false);
    expect(count).toBe(3);
    expect(plainText(changed)).toBe('new name, new name new');
    expect(plainText(text)).toBe('Old name, old name old');
    const bold = (changed.content![1] as { content: { marks?: unknown[] }[] }).content[0]!;
    expect(bold.marks).toEqual([{ type: 'bold' }]);
    // "$" in the replacement is only a dollar sign.
    expect(plainText(replaceIn(doc('price'), 'price', '$1', true).doc)).toBe('$1');
  });

  it('finds the objects that hold the words, on every slide, with their slide and count', () => {
    const project = createEmptyProject();
    const slide = project.scenes[0]!.slides[0]!;
    const text = createTextObject('', { x: 0, y: 0, width: 100, height: 40 });
    text.props.text = doc('Hello world', 'world');
    const shape = createShapeObject(shapePreset('diamond'), {
      x: 0,
      y: 0,
      width: 100,
      height: 40,
    });
    shape.props.text = doc('Nothing here');
    slide.baseLayer.objects.push(text, shape);
    const matches = findInProject(project, 'WORLD', false);
    expect(matches).toEqual([
      {
        slideId: slide.id,
        slideTitle: slide.title,
        layerId: null,
        objectId: text.id,
        objectName: text.name,
        count: 2,
        text: 'Hello world world',
      },
    ]);
    expect(findInProject(project, 'WORLD', true)).toEqual([]);
  });
});

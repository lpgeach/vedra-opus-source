import {
  createButtonObject,
  createImageObject,
  createShapeObject,
  createTextObject,
} from '@vedraopus/model';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cancelFormatPainter,
  clearFormatPainter,
  consumeFormatFor,
  getFormatPainterState,
  pickFormat,
} from './format-painter';

afterEach(() => clearFormatPainter());

const HASH = 'a'.repeat(64);

describe('format painter', () => {
  it('copies shape appearance onto a button without touching its text or radius source', () => {
    const source = createShapeObject({ kind: 'rect' });
    source.props.appearance.opacity = 0.4;
    const target = createButtonObject('Go');
    pickFormat(source);
    expect(getFormatPainterState()).toMatchObject({ armed: true, locked: false });
    const changes = consumeFormatFor(target) as { props: Record<string, unknown> };
    expect(Object.keys(changes.props)).toEqual(['appearance']);
    expect((changes.props['appearance'] as { opacity: number }).opacity).toBe(0.4);
  });

  it('is single-use: it disarms after landing, and stays armed over an unsuitable target', () => {
    pickFormat(createShapeObject({ kind: 'rect' }));
    expect(consumeFormatFor(createImageObject(HASH))).toBeNull();
    expect(getFormatPainterState().armed).toBe(true);
    expect(consumeFormatFor(createShapeObject({ kind: 'rect' }))).not.toBeNull();
    expect(getFormatPainterState().armed).toBe(false);
    expect(consumeFormatFor(createShapeObject({ kind: 'rect' }))).toBeNull();
  });

  it('stays armed when locked until cancelled', () => {
    pickFormat(createShapeObject({ kind: 'rect' }), true);
    expect(consumeFormatFor(createShapeObject({ kind: 'rect' }))).not.toBeNull();
    expect(consumeFormatFor(createShapeObject({ kind: 'rect' }))).not.toBeNull();
    expect(getFormatPainterState()).toMatchObject({ armed: true, locked: true });
    cancelFormatPainter();
    expect(consumeFormatFor(createShapeObject({ kind: 'rect' }))).toBeNull();
  });

  it('copies image opacity and text-box settings only to their own kind', () => {
    const image = createImageObject(HASH);
    image.props.opacity = 0.3;
    pickFormat(image);
    expect(consumeFormatFor(createTextObject('x'))).toBeNull();
    expect(consumeFormatFor(createImageObject(HASH))).toEqual({ props: { opacity: 0.3 } });

    const text = createTextObject('x');
    text.props.autofit = 'shrinkText';
    text.props.padding = 20;
    pickFormat(text);
    expect(consumeFormatFor(createTextObject('y'))).toEqual({
      props: { autofit: 'shrinkText', padding: 20 },
    });
  });
});

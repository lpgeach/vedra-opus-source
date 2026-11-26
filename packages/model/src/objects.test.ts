import { describe, expect, it } from 'vitest';
import {
  createButtonObject,
  createEmptyProject,
  createGroupObject,
  createImageObject,
  createShapeObject,
  createTextObject,
  parseProject,
  plainRichText,
  sceneObjectSchema,
  serializeProject,
  shapeGeometrySchema,
  shapePreset,
  shapePresetLabel,
  shapePresetNames,
} from './index';

const HASH = 'a'.repeat(64);

describe('object factories', () => {
  it('produce objects the schema accepts', () => {
    const objects = [
      createShapeObject({ kind: 'rect' }),
      createShapeObject({ kind: 'roundRect', radius: 12 }),
      createShapeObject({ kind: 'arrow' }),
      createShapeObject(shapePreset('star')),
      createImageObject(HASH),
      createButtonObject('Continue'),
      createTextObject('Hello\nworld'),
    ];
    for (const object of [...objects, createGroupObject(objects)]) {
      expect(sceneObjectSchema.safeParse(object).success, object.name).toBe(true);
    }
  });

  it('give every object its own id', () => {
    const ids = Array.from({ length: 50 }, () => createShapeObject({ kind: 'rect' }).id);
    expect(new Set(ids).size).toBe(50);
  });

  it('apply the frame asked for over the defaults', () => {
    const shape = createShapeObject({ kind: 'ellipse' }, { x: 40, y: 50, rotation: 30 });
    expect(shape.frame).toEqual({ x: 40, y: 50, width: 200, height: 120, rotation: 30 });
  });

  it('start a line as an outline with no fill and no height', () => {
    const line = createShapeObject({ kind: 'line' }, { width: 300 });
    expect(line.props.appearance.fill).toEqual({ kind: 'none' });
    expect(line.props.appearance.stroke).toMatchObject({ width: 2, dash: 'solid' });
    expect(line.frame.height).toBe(0);
  });

  it('frame a group around its children', () => {
    const group = createGroupObject([
      createShapeObject({ kind: 'rect' }, { x: 10, y: 20, width: 100, height: 50 }),
      createShapeObject({ kind: 'rect' }, { x: 200, y: 5, width: 40, height: 300 }),
    ]);
    expect(group.frame).toEqual({ x: 10, y: 5, width: 230, height: 300, rotation: 0 });
    expect(createGroupObject([]).frame).toMatchObject({ width: 0, height: 0 });
  });

  it('survive a save and load inside a project', () => {
    const project = createEmptyProject();
    project.assets[HASH] = {
      kind: 'image',
      fileName: 'a.png',
      ext: 'png',
      mimeType: 'image/png',
      byteLength: 10,
    };
    project.scenes[0]!.slides[0]!.baseLayer.objects.push(
      createGroupObject([createImageObject(HASH), createButtonObject()]),
      createShapeObject(shapePreset('callout')),
    );
    expect(parseProject(JSON.parse(serializeProject(project)))).toEqual(project);
  });
});

describe('plainRichText', () => {
  it('makes one paragraph per line and an empty document for no text', () => {
    expect(plainRichText('')).toEqual({ type: 'doc', content: [] });
    expect(plainRichText('a\n\nb').content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
      { type: 'paragraph', content: [] },
      { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
    ]);
  });
});

describe('shape presets', () => {
  it.each(shapePresetNames)('%s is a valid polygon filling the unit box', (name) => {
    const geometry = shapePreset(name);
    expect(shapeGeometrySchema.safeParse(geometry).success).toBe(true);
    expect(shapePresetLabel(name)).not.toBe('');
    const xs = geometry.points.map((point) => point.x);
    const ys = geometry.points.map((point) => point.y);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([0, 1]);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([0, 1]);
  });

  it('hands out a fresh copy each time', () => {
    const first = shapePreset('diamond');
    first.points[0]!.x = 0.9;
    expect(shapePreset('diamond').points[0]!.x).toBe(0.5);
  });
});

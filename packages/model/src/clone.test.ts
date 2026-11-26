import { describe, expect, it } from 'vitest';
import {
  cloneScene,
  cloneSlide,
  createEmptyProject,
  createId,
  createResultSlide,
  createShapeObject,
  createSlide,
  createTextObject,
  createHistory,
  forEachObject,
  findReferenceIssues,
  normalState,
  slideLayers,
} from './index';
import type { Slide } from './index';

function slideWithTrigger(): Slide {
  const project = createEmptyProject();
  const slide = project.scenes[0]!.slides[0]!;
  const shape = createShapeObject({ kind: 'rect' });
  slide.baseLayer.objects.push(shape);
  slide.triggers.push({
    id: createId('trigger'),
    owner: { kind: 'object', id: shape.id },
    event: { type: 'click', object: shape.id },
    action: { type: 'changeState', object: shape.id, state: normalState().id },
    conditions: null,
    otherwise: null,
    enabled: true,
  });
  return slide;
}

describe('cloning slides and scenes', () => {
  it('gives every slide, layer, object and trigger a new id', () => {
    const slide = slideWithTrigger();
    const copy = cloneSlide(slide);
    const ids = (s: Slide) => {
      const out: string[] = [s.id, ...s.triggers.map((t) => t.id)];
      for (const { layer } of slideLayers(s)) {
        out.push(layer.id);
        forEachObject(layer.objects, (o) => out.push(o.id));
      }
      return out;
    };
    const before = new Set(ids(slide));
    expect(ids(copy).filter((id) => before.has(id))).toEqual([]);
    expect(copy.title).toBe(`${slide.title} copy`);
  });

  it('points the copy’s triggers at the copy’s objects and leaves the original alone', () => {
    const slide = slideWithTrigger();
    const original = JSON.parse(JSON.stringify(slide));
    const copy = cloneSlide(slide);
    const object = copy.baseLayer.objects[0]!;
    const trigger = copy.triggers[0]!;
    expect(trigger.owner.id).toBe(object.id);
    expect(trigger.event).toMatchObject({ object: object.id });
    expect(trigger.action).toMatchObject({ object: object.id, state: 'normal' });
    expect(slide).toEqual(original);
  });

  it('a duplicated scene is a valid project part with its own slides', () => {
    const project = createEmptyProject();
    project.scenes[0]!.slides[0] = slideWithTrigger();
    const history = createHistory(project);
    history.execute('scene.add', { scene: cloneScene(project.scenes[0]!) });
    expect(history.project.scenes).toHaveLength(2);
    expect(history.project.scenes[1]!.title).toContain('copy');
    expect(findReferenceIssues(history.project)).toEqual([]);
  });
});

describe('what a copy names inside itself (found in P11.2)', () => {
  it('a duplicated result slide’s Passed and Failed layers are its own, and the project stays valid', () => {
    const project = createEmptyProject('Results');
    const result = createResultSlide(project.stage);
    project.scenes[0]!.slides.push(result);
    const copy = cloneSlide(result);
    project.scenes[0]!.slides.push(copy);
    const layerIds = copy.layers.map((layer) => layer.id);
    expect(layerIds).toContain(copy.result!.layers.passed);
    expect(layerIds).toContain(copy.result!.layers.failed);
    expect(copy.result!.layers.passed).not.toBe(result.result!.layers.passed);
    expect(findReferenceIssues(project)).toEqual([]);
  });

  it('a copy’s Tab order lists the copy’s objects', () => {
    const slide = createSlide('Ordered');
    const first = createTextObject('One');
    const second = createTextObject('Two');
    slide.baseLayer.objects.push(first, second);
    slide.properties.focusOrder = [second.id, first.id];
    const copy = cloneSlide(slide);
    const [copyFirst, copySecond] = copy.baseLayer.objects;
    expect(copy.properties.focusOrder).toEqual([copySecond!.id, copyFirst!.id]);
  });
});

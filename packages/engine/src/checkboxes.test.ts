import {
  createCheckboxObject,
  createEmptyProject,
  createRadioObject,
  createScene,
  createSlide,
} from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { createEngine } from './index';

/** Stock checkboxes and radio buttons (docs/briefs/P9.3-checkboxes-radios.md). */

function setup(startChecked: boolean) {
  const project = createEmptyProject();
  const slide = createSlide('One');
  const box = createCheckboxObject('Agree', { x: 10, y: 10 });
  const [a, b] = [
    createRadioObject('A', 'G', { x: 10, y: 80 }),
    createRadioObject('B', 'G', { x: 10, y: 140 }),
  ];
  if (startChecked) {
    box.initialState = 'selected';
    a!.initialState = 'selected';
  }
  slide.baseLayer.objects.push(box, a!, b!);
  project.scenes = [{ ...createScene(), slides: [slide] }];
  const engine = createEngine(project);
  const state = (id: string) =>
    engine
      .getView()
      .layers.flatMap((layer) => layer.objects)
      .find((object) => object.id === id)?.state;
  return { engine, box, a: a!, b: b!, state };
}

describe('stock checkboxes and radio buttons', () => {
  it('a checkbox toggles; one that starts checked unchecks on its first click', () => {
    const plain = setup(false);
    plain.engine.pointer('click', plain.box.id);
    expect(plain.state(plain.box.id)).toBe('selected');
    plain.engine.pointer('click', plain.box.id);
    expect(plain.state(plain.box.id)).toBe('normal');

    const checked = setup(true);
    expect(checked.state(checked.box.id)).toBe('selected');
    checked.engine.pointer('click', checked.box.id);
    expect(checked.state(checked.box.id)).toBe('normal');
  });

  it('radio buttons of a group select one at a time, from one that starts checked too', () => {
    const { engine, a, b, state } = setup(true);
    expect([state(a.id), state(b.id)]).toEqual(['selected', 'normal']);
    engine.pointer('click', b.id);
    expect([state(a.id), state(b.id)]).toEqual(['normal', 'selected']);
    // Clicking the selected one keeps it selected, as a radio does.
    engine.pointer('click', b.id);
    expect(state(b.id)).toBe('selected');
  });
});

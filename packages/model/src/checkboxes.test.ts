import { describe, expect, it } from 'vitest';
import { createCheckboxObject, createEmptyProject, createRadioObject, parseProject } from './index';

/** Stock checkboxes and radio buttons (docs/briefs/P9.3-checkboxes-radios.md). */

describe('stock checkboxes and radio buttons', () => {
  it('are choice objects with Normal and Selected; a radio button is in a group, given or new', () => {
    const box = createCheckboxObject('Agree');
    expect(box).toMatchObject({ type: 'choice', name: 'Checkbox', buttonSet: null });
    expect(box.props.mark).toBe('checkbox');
    expect(box.states.map((state) => state.id)).toEqual(['normal', 'selected']);
    const one = createRadioObject('Red', 'Colours');
    const two = createRadioObject('Blue');
    const three = createRadioObject('Green');
    expect(one).toMatchObject({ name: 'Radio Button', buttonSet: 'Colours' });
    expect(one.props.mark).toBe('radio');
    // A radio button given no group starts one of its own.
    expect(two.buttonSet).not.toBeNull();
    expect(two.buttonSet).not.toBe(three.buttonSet);
  });

  it('may be on any slide, starting checked', () => {
    const project = createEmptyProject();
    const box = createCheckboxObject();
    box.initialState = 'selected';
    project.scenes[0]!.slides[0]!.baseLayer.objects.push(box, createRadioObject());
    expect(() => parseProject(JSON.parse(JSON.stringify(project)))).not.toThrow();
  });
});

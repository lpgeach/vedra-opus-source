import { createGroupObject, createShapeObject, sceneObjectSchema } from '@vedraopus/model';
import type { Frame } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { centreOf, moveFrame, rotateFrame, scaleFrame, unionBounds } from './geometry';
import { changedOnly, leavesOf, selectionFrame, transformObjects } from './transform';

const rect = (x: number, y: number, width = 100, height = 50, rotation = 0) =>
  createShapeObject({ kind: 'rect' }, { x, y, width, height, rotation });

describe('leavesOf and selectionFrame', () => {
  it('treats a plain object as its own only leaf', () => {
    const shape = rect(10, 20);
    expect(leavesOf(shape)).toEqual([shape]);
    expect(selectionFrame(shape)).toBe(shape.frame);
  });

  it('finds every drawn object inside nested groups', () => {
    const [a, b, c] = [rect(0, 0), rect(200, 0), rect(0, 300)];
    const nested = createGroupObject([createGroupObject([a, b]), c]);
    expect(leavesOf(nested).map((leaf) => leaf.id)).toEqual([a.id, b.id, c.id]);
  });

  it('measures a group by the box around its contents, whatever its stored frame says', () => {
    const group = createGroupObject([rect(100, 100), rect(300, 200, 50, 50)]);
    group.frame = { x: 0, y: 0, width: 1, height: 1, rotation: 0 };
    expect(selectionFrame(group)).toEqual({ x: 100, y: 100, width: 250, height: 150, rotation: 0 });
  });
});

describe('transformObjects', () => {
  it('moves a group by moving everything in it and re-boxing the group', () => {
    const [a, b] = [rect(100, 100), rect(300, 200)];
    const group = createGroupObject([a, b]);
    const updates = transformObjects([group], (frame) => moveFrame(frame, 10, -5));

    const byId = new Map(updates.map((update) => [update.objectId, update.frame]));
    expect(byId.get(a.id)).toMatchObject({ x: 110, y: 95 });
    expect(byId.get(b.id)).toMatchObject({ x: 310, y: 195 });
    expect(byId.get(group.id)).toEqual({ x: 110, y: 95, width: 300, height: 150, rotation: 0 });
  });

  it('updates inner groups before the groups that contain them', () => {
    const inner = createGroupObject([rect(0, 0), rect(200, 0)]);
    const outer = createGroupObject([inner, rect(0, 300)]);
    const order = transformObjects([outer], (frame) => frame).map((update) => update.objectId);
    expect(order.indexOf(inner.id)).toBeLessThan(order.indexOf(outer.id));
    expect(order.at(-1)).toBe(outer.id);
  });

  it('rotates a group about its centre: children turn and travel, the box follows', () => {
    const [a, b] = [rect(100, 100, 100, 50), rect(300, 100, 100, 50)];
    const group = createGroupObject([a, b]);
    const pivot = centreOf(selectionFrame(group));
    const updates = transformObjects([group], (frame) => rotateFrame(frame, pivot, 90));
    const byId = new Map(updates.map((update) => [update.objectId, update.frame]));

    // Side by side becomes one above the other, each turned a quarter.
    expect(centreOf(byId.get(a.id)!)).toEqual({ x: 250, y: 25 });
    expect(centreOf(byId.get(b.id)!)).toEqual({ x: 250, y: 225 });
    expect(byId.get(a.id)!.rotation).toBe(90);
    // The group's box is the old one turned on its side, and is itself upright.
    expect(byId.get(group.id)).toEqual({ x: 225, y: -25, width: 50, height: 300, rotation: 0 });
  });

  it('resizes a group by scaling its contents into the new box', () => {
    const [a, b] = [rect(100, 100, 100, 50), rect(300, 150, 100, 50)];
    const group = createGroupObject([a, b]);
    const from = selectionFrame(group);
    const to = { x: 100, y: 100, width: 600, height: 300 };
    const updates = transformObjects([group], (frame) => scaleFrame(frame, from, to));
    const byId = new Map(updates.map((update) => [update.objectId, update.frame]));

    expect(byId.get(a.id)).toEqual({ x: 100, y: 100, width: 200, height: 150, rotation: 0 });
    expect(byId.get(b.id)).toEqual({ x: 500, y: 250, width: 200, height: 150, rotation: 0 });
    expect(byId.get(group.id)).toEqual({ ...to, rotation: 0 });
  });

  it('produces frames the model accepts', () => {
    const group = createGroupObject([rect(100, 100, 100, 50, 30), rect(300, 150)]);
    const pivot = centreOf(unionBounds(leavesOf(group).map((leaf) => leaf.frame))!);
    for (const { frame } of transformObjects([group], (each) => rotateFrame(each, pivot, 123))) {
      const candidate = { ...rect(0, 0), frame };
      expect(sceneObjectSchema.safeParse(candidate).success).toBe(true);
    }
  });
});

describe('changedOnly', () => {
  it('keeps only updates that differ from the current frames', () => {
    const same: Frame = { x: 1, y: 2, width: 3, height: 4, rotation: 0 };
    const current = new Map([
      ['a', same],
      ['b', same],
    ]);
    const updates = [
      { objectId: 'a', frame: { ...same } },
      { objectId: 'b', frame: { ...same, x: 9 } },
      { objectId: 'unknown', frame: same },
    ];
    expect(changedOnly(updates, current).map((update) => update.objectId)).toEqual([
      'b',
      'unknown',
    ]);
  });
});

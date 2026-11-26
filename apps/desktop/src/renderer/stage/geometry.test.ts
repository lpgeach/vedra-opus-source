import type { Frame } from '@vedraopus/model';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  alignMoves,
  angleFrom,
  boundsOf,
  centreOf,
  cornersOf,
  distributeMoves,
  handlePoint,
  HANDLES,
  moveFrame,
  snapBox,
  snapValue,
  needsEvenScale,
  normaliseAngle,
  pointInFrame,
  rectFromPoints,
  rectsTouch,
  resizeFrame,
  rotateFrame,
  rotatePoint,
  rotationDelta,
  scaleFrame,
  unionBounds,
} from './geometry';
import type { Handle, Point } from './geometry';

const frame = (x: number, y: number, width: number, height: number, rotation = 0): Frame => ({
  x,
  y,
  width,
  height,
  rotation,
});

function expectPoint(actual: Point, expected: Point): void {
  expect(actual.x).toBeCloseTo(expected.x, 5);
  expect(actual.y).toBeCloseTo(expected.y, 5);
}
function expectFrame(actual: Frame, expected: Frame): void {
  for (const key of ['x', 'y', 'width', 'height', 'rotation'] as const) {
    expect(actual[key], key).toBeCloseTo(expected[key], 5);
  }
}

const OPPOSITE: Record<Handle, Handle> = {
  nw: 'se',
  n: 's',
  ne: 'sw',
  e: 'w',
  se: 'nw',
  s: 'n',
  sw: 'ne',
  w: 'e',
};

const frameArbitrary = fc.record({
  x: fc.integer({ min: -500, max: 1500 }),
  y: fc.integer({ min: -500, max: 1500 }),
  width: fc.integer({ min: 20, max: 800 }),
  height: fc.integer({ min: 20, max: 800 }),
  rotation: fc.integer({ min: 0, max: 359 }),
});

describe('rotation basics', () => {
  it('turns clockwise on screen, where y points down', () => {
    // A point to the right of the centre, turned 90°, ends up below it.
    expectPoint(rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, 90), { x: 0, y: 10 });
    expectPoint(rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, 180), { x: -10, y: 0 });
    expectPoint(rotatePoint({ x: 5, y: 5 }, { x: 5, y: 5 }, 73), { x: 5, y: 5 });
  });

  it('normalises angles into 0–360', () => {
    expect(normaliseAngle(0)).toBe(0);
    expect(normaliseAngle(360)).toBe(0);
    expect(normaliseAngle(-90)).toBe(270);
    expect(normaliseAngle(725)).toBe(5);
    expect(normaliseAngle(-0.0000000001)).toBe(0);
  });

  it('measures angles from straight up, clockwise', () => {
    const centre = { x: 100, y: 100 };
    expect(angleFrom(centre, { x: 100, y: 0 })).toBe(0);
    expect(angleFrom(centre, { x: 200, y: 100 })).toBe(90);
    expect(angleFrom(centre, { x: 100, y: 200 })).toBe(180);
    expect(angleFrom(centre, { x: 0, y: 100 })).toBe(270);
  });
});

describe('corners, handles and bounds', () => {
  it('finds the handles of an upright frame', () => {
    const upright = frame(100, 50, 200, 100);
    expectPoint(handlePoint(upright, 'nw'), { x: 100, y: 50 });
    expectPoint(handlePoint(upright, 'n'), { x: 200, y: 50 });
    expectPoint(handlePoint(upright, 'se'), { x: 300, y: 150 });
    expectPoint(handlePoint(upright, 'w'), { x: 100, y: 100 });
  });

  it('moves the handles with the rotation', () => {
    // 200×100 about (200, 100), turned a quarter: the top edge now faces right.
    const turned = frame(100, 50, 200, 100, 90);
    expectPoint(handlePoint(turned, 'n'), { x: 250, y: 100 });
    expectPoint(handlePoint(turned, 'nw'), { x: 250, y: 0 });
    expectPoint(handlePoint(turned, 'se'), { x: 150, y: 200 });
  });

  it('boxes a rotated frame', () => {
    expect(boundsOf(frame(100, 50, 200, 100))).toEqual({ x: 100, y: 50, width: 200, height: 100 });
    expect(boundsOf(frame(100, 50, 200, 100, 90))).toEqual({
      x: 150,
      y: 0,
      width: 100,
      height: 200,
    });
    const diagonal = boundsOf(frame(0, 0, 100, 100, 45));
    expect(diagonal.width).toBeCloseTo(141.421356, 4);
    expect(diagonal.x).toBeCloseTo(-20.710678, 4);
  });

  it('boxes several frames together, and nothing as null', () => {
    expect(unionBounds([])).toBeNull();
    expect(unionBounds([frame(10, 20, 100, 50), frame(200, 5, 40, 300)])).toEqual({
      x: 10,
      y: 5,
      width: 230,
      height: 300,
    });
  });

  it('keeps the centre of the corners at the centre of the frame', () => {
    fc.assert(
      fc.property(frameArbitrary, (given) => {
        const corners = cornersOf(given);
        const centre = centreOf(given);
        expect(corners.reduce((sum, corner) => sum + corner.x, 0) / 4).toBeCloseTo(centre.x, 6);
        expect(corners.reduce((sum, corner) => sum + corner.y, 0) / 4).toBeCloseTo(centre.y, 6);
      }),
    );
  });
});

describe('rectangles', () => {
  it('builds a rectangle from two corners in any order', () => {
    const expected = { x: 10, y: 20, width: 30, height: 40 };
    expect(rectFromPoints({ x: 10, y: 20 }, { x: 40, y: 60 })).toEqual(expected);
    expect(rectFromPoints({ x: 40, y: 60 }, { x: 10, y: 20 })).toEqual(expected);
    expect(rectFromPoints({ x: 40, y: 20 }, { x: 10, y: 60 })).toEqual(expected);
  });

  it('knows when rectangles touch', () => {
    const a = { x: 0, y: 0, width: 100, height: 100 };
    expect(rectsTouch(a, { x: 50, y: 50, width: 100, height: 100 })).toBe(true);
    expect(rectsTouch(a, { x: 100, y: 0, width: 10, height: 10 })).toBe(true);
    expect(rectsTouch(a, { x: 101, y: 0, width: 10, height: 10 })).toBe(false);
    expect(rectsTouch(a, { x: 20, y: 20, width: 10, height: 10 })).toBe(true);
    expect(rectsTouch(a, { x: 0, y: 150, width: 100, height: 10 })).toBe(false);
  });
});

describe('pointInFrame', () => {
  it('tests against the frame as rotated, not its bounding box', () => {
    const diamond = frame(0, 0, 100, 100, 45);
    expect(pointInFrame({ x: 50, y: 50 }, diamond)).toBe(true);
    // Inside the original square's corner, but outside once it is turned.
    expect(pointInFrame({ x: 5, y: 5 }, diamond)).toBe(false);
    // Outside the original square, inside the turned one's point.
    expect(pointInFrame({ x: 50, y: -15 }, diamond)).toBe(true);
  });

  it('lets a line with no height be hit, given some slop', () => {
    const line = frame(100, 100, 200, 0);
    expect(pointInFrame({ x: 150, y: 103 }, line)).toBe(false);
    expect(pointInFrame({ x: 150, y: 103 }, line, 4)).toBe(true);
    expect(pointInFrame({ x: 150, y: 110 }, line, 4)).toBe(false);
  });
});

describe('moveFrame', () => {
  it('shifts position and nothing else', () => {
    expect(moveFrame(frame(10, 20, 30, 40, 50), 5, -7)).toEqual(frame(15, 13, 30, 40, 50));
  });
});

describe('resizeFrame on an upright frame', () => {
  const start = frame(100, 100, 200, 100);

  it('drags the bottom-right corner with the top-left staying put', () => {
    expectFrame(resizeFrame(start, 'se', { x: 350, y: 250 }), frame(100, 100, 250, 150));
  });

  it('drags the top-left corner with the bottom-right staying put', () => {
    expectFrame(resizeFrame(start, 'nw', { x: 50, y: 80 }), frame(50, 80, 250, 120));
  });

  it('moves only one side from an edge handle', () => {
    expectFrame(resizeFrame(start, 'e', { x: 400, y: 999 }), frame(100, 100, 300, 100));
    expectFrame(resizeFrame(start, 'n', { x: -999, y: 60 }), frame(100, 60, 200, 140));
  });

  it('stops at the minimum size instead of flipping through the other side', () => {
    expectFrame(resizeFrame(start, 'se', { x: 0, y: 0 }), frame(100, 100, 1, 1));
    expectFrame(
      resizeFrame(start, 'w', { x: 900, y: 0 }, { minSize: 10 }),
      frame(290, 100, 10, 100),
    );
  });

  it('keeps proportions with keepRatio, following the further direction', () => {
    // 2:1 frame; pointer asks for 400 wide but only 120 tall → width wins.
    expectFrame(
      resizeFrame(start, 'se', { x: 500, y: 220 }, { keepRatio: true }),
      frame(100, 100, 400, 200),
    );
    // From an edge, the other dimension follows and stays centred on the anchor side.
    expectFrame(
      resizeFrame(start, 'e', { x: 500, y: 0 }, { keepRatio: true }),
      frame(100, 50, 400, 200),
    );
  });

  it('keeps proportions at the minimum size too', () => {
    const tiny = resizeFrame(start, 'se', { x: 0, y: 0 }, { keepRatio: true, minSize: 10 });
    expect(tiny.width / tiny.height).toBeCloseTo(2, 6);
    expect(tiny.height).toBeCloseTo(10, 6);
  });

  it('grows both ways about the centre with fromCentre', () => {
    expectFrame(
      resizeFrame(start, 'se', { x: 350, y: 250 }, { fromCentre: true }),
      frame(50, 50, 300, 200),
    );
    expectFrame(
      resizeFrame(start, 'e', { x: 350, y: 0 }, { fromCentre: true }),
      frame(50, 100, 300, 100),
    );
  });

  it('leaves a line its zero height when resized from an end', () => {
    const line = frame(100, 100, 200, 0);
    expectFrame(resizeFrame(line, 'e', { x: 400, y: 130 }), frame(100, 100, 300, 0));
  });
});

describe('resizeFrame on a rotated frame', () => {
  it('keeps the opposite handle exactly where it was on stage', () => {
    fc.assert(
      fc.property(
        frameArbitrary,
        fc.constantFrom(...HANDLES),
        fc.integer({ min: -600, max: 2000 }),
        fc.integer({ min: -600, max: 2000 }),
        fc.boolean(),
        (given, handle, px, py, keepRatio) => {
          const resized = resizeFrame(given, handle, { x: px, y: py }, { keepRatio });
          expect(resized.rotation).toBe(given.rotation);
          // With keepRatio an edge handle grows the frame evenly either side of
          // its axis, so its anchor is the middle of the opposite edge: still fixed.
          expectPoint(handlePoint(resized, OPPOSITE[handle]), handlePoint(given, OPPOSITE[handle]));
          expect(resized.width).toBeGreaterThanOrEqual(1 - 1e-6);
          expect(resized.height).toBeGreaterThanOrEqual(1 - 1e-6);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('keeps the centre where it was with fromCentre', () => {
    fc.assert(
      fc.property(
        frameArbitrary,
        fc.constantFrom(...HANDLES),
        fc.integer({ min: -600, max: 2000 }),
        fc.integer({ min: -600, max: 2000 }),
        (given, handle, px, py) => {
          const resized = resizeFrame(given, handle, { x: px, y: py }, { fromCentre: true });
          expectPoint(centreOf(resized), centreOf(given));
        },
      ),
      { numRuns: 300 },
    );
  });

  it('puts the dragged corner under the pointer', () => {
    fc.assert(
      fc.property(
        frameArbitrary,
        fc.constantFrom('nw', 'ne', 'se', 'sw' as const),
        (given, handle) => {
          // Aim at a point that makes the frame bigger, so no minimum interferes:
          // where the handle would be if the frame were 1.5× the size about its anchor.
          const anchor = handlePoint(given, OPPOSITE[handle]);
          const corner = handlePoint(given, handle);
          const target = {
            x: anchor.x + (corner.x - anchor.x) * 1.5,
            y: anchor.y + (corner.y - anchor.y) * 1.5,
          };
          const resized = resizeFrame(given, handle, target);
          expectPoint(handlePoint(resized, handle), target);
          expect(resized.width).toBeCloseTo(given.width * 1.5, 4);
          expect(resized.height).toBeCloseTo(given.height * 1.5, 4);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('is undone by dragging the handle back', () => {
    fc.assert(
      fc.property(
        frameArbitrary,
        fc.constantFrom(...HANDLES),
        fc.integer({ min: 30, max: 300 }),
        fc.integer({ min: 30, max: 300 }),
        (given, handle, dx, dy) => {
          const from = handlePoint(given, handle);
          const away = rotatePoint({ x: from.x + dx, y: from.y + dy }, from, given.rotation);
          const resized = resizeFrame(given, handle, away);
          // Skip drags that hit the minimum size: those are not reversible by design.
          fc.pre(resized.width > 1.001 && resized.height > 1.001);
          expectFrame(resizeFrame(resized, handle, from), given);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('works through a known case: a quarter-turned frame dragged from its "east" handle', () => {
    // 200×100 centred at (200, 150), turned 90°: its east handle points down the stage.
    const turned = frame(100, 100, 200, 100, 90);
    expectPoint(handlePoint(turned, 'e'), { x: 200, y: 250 });
    // Drag it 50 further down: the frame gets 50 wider, and its west end stays at (200, 50).
    const resized = resizeFrame(turned, 'e', { x: 200, y: 300 });
    expect(resized.width).toBeCloseTo(250, 6);
    expect(resized.height).toBeCloseTo(100, 6);
    expectPoint(handlePoint(resized, 'w'), { x: 200, y: 50 });
    expectPoint(centreOf(resized), { x: 200, y: 175 });
  });
});

describe('scaleFrame (resizing a selection or group)', () => {
  const from = { x: 100, y: 100, width: 200, height: 100 };

  it('scales position and size with the selection box', () => {
    const to = { x: 100, y: 100, width: 400, height: 300 };
    // A child in the right half of the box, a quarter of its width.
    expectFrame(scaleFrame(frame(200, 100, 50, 50), from, to), frame(300, 100, 100, 150));
  });

  it('leaves a frame that fills the box filling the new box', () => {
    const to = { x: 40, y: 60, width: 500, height: 20 };
    expectFrame(scaleFrame(frame(100, 100, 200, 100), from, to), frame(40, 60, 500, 20));
  });

  it('swaps the axes for a frame turned a quarter', () => {
    const to = { x: 100, y: 100, width: 400, height: 100 };
    // Turned 90°, the frame's 40 "width" runs down the stage, so only its
    // height (which runs across) doubles.
    const scaled = scaleFrame(frame(150, 130, 40, 60, 90), from, to);
    expect(scaled.width).toBeCloseTo(40, 6);
    expect(scaled.height).toBeCloseTo(120, 6);
    expect(scaled.rotation).toBe(90);
  });

  it('keeps a rotated frame in the same relative place under even scaling', () => {
    fc.assert(
      fc.property(frameArbitrary, fc.double({ min: 0.25, max: 4, noNaN: true }), (given, scale) => {
        const box = boundsOf(given);
        const to = { x: box.x, y: box.y, width: box.width * scale, height: box.height * scale };
        const scaled = scaleFrame(given, box, to);
        // Its own bounding box is exactly the new selection box.
        const result = boundsOf(scaled);
        expect(result.x).toBeCloseTo(to.x, 3);
        expect(result.y).toBeCloseTo(to.y, 3);
        expect(result.width).toBeCloseTo(to.width, 3);
        expect(result.height).toBeCloseTo(to.height, 3);
      }),
      { numRuns: 300 },
    );
  });

  it('scales every child of a group so the group box becomes the new box', () => {
    const children = [
      frame(100, 100, 50, 50),
      frame(250, 150, 50, 50, 180),
      frame(180, 120, 40, 20),
    ];
    const box = unionBounds(children)!;
    const to = { x: 0, y: 0, width: box.width * 2, height: box.height * 3 };
    const scaled = children.map((child) => scaleFrame(child, box, to));
    const result = unionBounds(scaled)!;
    expect(result.x).toBeCloseTo(0, 6);
    expect(result.y).toBeCloseTo(0, 6);
    expect(result.width).toBeCloseTo(to.width, 6);
    expect(result.height).toBeCloseTo(to.height, 6);
  });

  it('says which frames can only be scaled evenly', () => {
    expect(needsEvenScale(frame(0, 0, 10, 10, 0))).toBe(false);
    expect(needsEvenScale(frame(0, 0, 10, 10, 90))).toBe(false);
    expect(needsEvenScale(frame(0, 0, 10, 10, 270))).toBe(false);
    expect(needsEvenScale(frame(0, 0, 10, 10, 30))).toBe(true);
  });
});

describe('rotating', () => {
  it('measures how far the handle has been turned', () => {
    const centre = { x: 100, y: 100 };
    expect(rotationDelta(centre, { x: 100, y: 0 }, { x: 200, y: 100 })).toBe(90);
    expect(rotationDelta(centre, { x: 200, y: 100 }, { x: 100, y: 0 })).toBe(-90);
  });

  it('snaps the resulting rotation, not the movement, to the step', () => {
    const centre = { x: 100, y: 100 };
    const up = { x: 100, y: 0 };
    // About 40° of turn on an object already at 10°: 50° snaps to 45°, so the turn is 35°.
    const pointer = rotatePoint(up, centre, 40);
    expect(rotationDelta(centre, up, pointer, 10, 15)).toBeCloseTo(35, 6);
  });

  it('turns a frame about its own centre without moving it', () => {
    const given = frame(100, 100, 200, 100, 10);
    expectFrame(rotateFrame(given, centreOf(given), 35), frame(100, 100, 200, 100, 45));
  });

  it('carries a frame around a pivot that is not its centre', () => {
    // Centre (150, 100), pivot (100, 100): a quarter turn puts the centre below the pivot.
    const turned = rotateFrame(frame(100, 75, 100, 50), { x: 100, y: 100 }, 90);
    expectPoint(centreOf(turned), { x: 100, y: 150 });
    expect(turned.rotation).toBe(90);
    expect([turned.width, turned.height]).toEqual([100, 50]);
  });

  it('returns to the start when turned there and back', () => {
    fc.assert(
      fc.property(
        frameArbitrary,
        fc.integer({ min: -720, max: 720 }),
        fc.integer({ min: -300, max: 1300 }),
        fc.integer({ min: -300, max: 1300 }),
        (given, degrees, px, py) => {
          const pivot = { x: px, y: py };
          expectFrame(rotateFrame(rotateFrame(given, pivot, degrees), pivot, -degrees), given);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('turns a group as one: children keep their distances from each other', () => {
    const children = [
      frame(100, 100, 50, 50),
      frame(300, 100, 80, 40, 20),
      frame(200, 250, 30, 90),
    ];
    const pivot = centreOf(unionBounds(children)!);
    const turned = children.map((child) => rotateFrame(child, pivot, 77));
    const distance = (a: Frame, b: Frame) =>
      Math.hypot(centreOf(a).x - centreOf(b).x, centreOf(a).y - centreOf(b).y);
    for (let i = 0; i < children.length; i++) {
      for (let j = i + 1; j < children.length; j++) {
        expect(distance(turned[i]!, turned[j]!)).toBeCloseTo(
          distance(children[i]!, children[j]!),
          // Frames are tidied to a millionth of a unit, so distances agree to a little less.
          4,
        );
      }
      expect(turned[i]!.rotation).toBeCloseTo(normaliseAngle(children[i]!.rotation + 77), 6);
    }
  });
});

describe('alignMoves', () => {
  const boxes = [
    { x: 100, y: 50, width: 100, height: 40 },
    { x: 400, y: 200, width: 60, height: 80 },
    { x: 250, y: 300, width: 200, height: 20 },
  ];
  const container = { x: 0, y: 0, width: 800, height: 600 };

  it('lines up each edge and centre without moving along the other axis', () => {
    for (const [align, at] of [
      ['left', (box: (typeof boxes)[number]) => box.x],
      ['centre', (box: (typeof boxes)[number]) => box.x + box.width / 2],
      ['right', (box: (typeof boxes)[number]) => box.x + box.width],
    ] as const) {
      alignMoves(boxes, align, container).forEach((move, index) => {
        expect(move.y).toBe(0);
        const box = boxes[index]!;
        const wanted = align === 'left' ? container.x : align === 'centre' ? 400 : 800;
        expect(at(box) + move.x).toBeCloseTo(wanted, 6);
      });
    }
    for (const [align, wanted] of [
      ['top', 0],
      ['middle', 300],
      ['bottom', 600],
    ] as const) {
      alignMoves(boxes, align, container).forEach((move, index) => {
        expect(move.x).toBe(0);
        const box = boxes[index]!;
        const at =
          align === 'top'
            ? box.y
            : align === 'middle'
              ? box.y + box.height / 2
              : box.y + box.height;
        expect(at + move.y).toBeCloseTo(wanted, 6);
      });
    }
  });

  it('keeps the moves in the order the boxes came in', () => {
    const shuffled = [boxes[2]!, boxes[0]!, boxes[1]!];
    const moves = alignMoves(shuffled, 'left', container);
    shuffled.forEach((box, index) => {
      expect(box.x + moves[index]!.x).toBeCloseTo(container.x, 6);
    });
  });
});

describe('distributeMoves', () => {
  it('evens out the gaps, leaving the outermost two where they are', () => {
    const boxes = [
      { x: 0, y: 0, width: 100, height: 10 },
      { x: 300, y: 0, width: 50, height: 10 },
      { x: 500, y: 0, width: 100, height: 10 },
    ];
    const moves = distributeMoves(boxes, 'horizontal');
    expect(moves[0]).toEqual({ x: 0, y: 0 });
    expect(moves[2]).toEqual({ x: 0, y: 0 });
    // The span is 600 wide, the boxes take 250, so each gap is 175.
    // The middle box starts at 275, so it moves by -25.
    expect(moves[1]!.x).toBeCloseTo(-25, 6);
  });

  it('works vertically, and returns moves in the boxes’ own order', () => {
    const boxes = [
      { x: 0, y: 500, width: 10, height: 100 },
      { x: 0, y: 0, width: 10, height: 50 },
      { x: 0, y: 250, width: 10, height: 50 },
    ];
    const moves = distributeMoves(boxes, 'vertical');
    // Laid out: 0–50, 250–300, 500–600. Span 600, used 200, gaps 200 each.
    // The middle box belongs at 250, so it stays; the others are the ends.
    expect(moves[1]!.y).toBeCloseTo(0, 6);
    expect(moves[0]!.y).toBeCloseTo(0, 6);
    expect(moves[2]!.y).toBeCloseTo(0, 6);
  });

  it('moves nothing with fewer than three boxes', () => {
    const boxes = [
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 100, y: 0, width: 10, height: 10 },
    ];
    expect(distributeMoves(boxes, 'horizontal')).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
  });
});

describe('snapBox', () => {
  const box = { x: 100, y: 100, width: 100, height: 50 };
  const threshold = 6;

  it('snaps whichever edge or centre is closest to a line', () => {
    expect(snapBox(box, { x: [103], y: [] }, threshold)).toEqual({
      dx: 3,
      dy: 0,
      lines: [{ axis: 'x', at: 103 }],
    });
    // The centre is at 150.
    expect(snapBox(box, { x: [153], y: [] }, threshold)).toEqual({
      dx: 3,
      dy: 0,
      lines: [{ axis: 'x', at: 153 }],
    });
    // The right edge is at 200.
    expect(snapBox(box, { x: [197], y: [] }, threshold)).toEqual({
      dx: -3,
      dy: 0,
      lines: [{ axis: 'x', at: 197 }],
    });
  });

  it('takes the closer of two nearby lines', () => {
    expect(snapBox(box, { x: [104, 103], y: [] }, threshold).dx).toBe(3);
    expect(snapBox(box, { x: [98, 96], y: [] }, threshold).dx).toBe(-2);
  });

  it('leaves the box alone when no line is within the threshold', () => {
    expect(snapBox(box, { x: [110], y: [160] }, threshold)).toEqual({ dx: 0, dy: 0, lines: [] });
    expect(snapBox(box, { x: [], y: [] }, threshold)).toEqual({ dx: 0, dy: 0, lines: [] });
  });

  it('snaps each axis on its own and reports every line it lands on', () => {
    expect(snapBox(box, { x: [100, 200], y: [147] }, threshold)).toEqual({
      dx: 0,
      dy: -3,
      lines: [
        { axis: 'x', at: 100 },
        { axis: 'x', at: 200 },
        { axis: 'y', at: 147 },
      ],
    });
  });
});

describe('snapValue', () => {
  it('moves a coordinate onto a close line, or leaves it be', () => {
    expect(snapValue(103, [100], 6)).toEqual({ value: 100, lines: [100] });
    expect(snapValue(103, [110], 6)).toEqual({ value: 103, lines: [] });
    // Exactly on a line still counts as snapped, so the guide shows.
    expect(snapValue(100, [100], 6)).toEqual({ value: 100, lines: [100] });
  });
});

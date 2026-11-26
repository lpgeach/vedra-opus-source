# B13: path shapes, for the callouts, cloud, can and frame of imported courses

**Asked by Luke, 2026-11-25:** "if we need to add more features and functions to make it work do it". After B12, Sample B's report is 23 lines, and 17 of them are shapes drawn as rectangles:

- callouts: the rounded, oval and cloud ones (60 shapes);
- the can (59);
- the frame (3);
- the line callout with an accent bar (2).

## Saved format version 39

A new shape geometry, **`{ kind: 'path', paths: { d, fill, stroke }[] }`**:

- **`d`:** SVG path data with only absolute `M`, `L`, `C` and `Z`.
  - Every coordinate is in the 0–1 box a polygon's points use, stretched to the object's frame. So every value is an x, y pair, and scaling is one multiplication each.
  - Points may lie outside the box, as a callout's tail does.
  - Arcs are written as curves by whoever makes the shape.
- **Fill:** non-zero. A hole, as in a frame, is an outline wound the other way.
- **`fill` and `stroke`:** say whether each outline is filled and outlined, with the shape's own fill and outline. A line callout's box is filled but not outlined, and its bar and line are outlined but not filled, as Office draws them.
- **Limits:** 1–16 outlines, each at most 20,000 characters, checked by `isPathData` (`packages/model/src/path-data.ts`).
- **Migration 38 → 39:** none, as a v38 file is valid as it is. Legacy fixture `v38-two-slides`.

## Drawing

- The render package draws each outline as its own `<path>`, stretched to the frame (`scaledPath`).
- The editor's stage, the player and published courses all draw through it.
- A tail outside the box shows, as the shape's canvas does not clip. Clicking it does not select the shape, as selection is by the frame.
- Path shapes come only from import for now. The editor draws, moves, resizes and styles them like any shape. It has no tool to make or reshape one.

## Import

The outlines are our own, after the preset shapes of Office Open XML (ECMA-376), whose names and settings Storyline's follow. Each is worked out in pixels at the object's size, so corners and ellipses keep their proportions, then written in the 0–1 box (`apps/desktop/src/main/import/storyline/path-shapes.ts`).

- **Rounded and square callouts** (`roundRectCallout`, `rectCallout`): the box, rounded by a sixth of its shorter side or not. A wedge runs out to the tip (`v`, a fraction of the box) from the side facing it. Its base is 7/12–10/12 or 2/12–5/12 along that side, by which half the tip is in.
- **Oval callout:** an ellipse with a wedge out to the tip, its base a little either side of the direction to it.
- **Cloud callout:** scallops around an ellipse, fitted to the box. Its tail is three small ellipses shrinking toward the tip.
- **Can:** its body, and its top's ellipse over it, wound alike so it is not a hole. The ellipse's depth comes from `offset` and the shorter side.
- **Frame:** the box with a hole, its thickness `cx` of the shorter side.
- **Line callouts** (`lnCall1…`): the box, outlined unless it has no border; the accent bar at the line's start, if it has one; and the line from its start (`pts`) to the tip.

## Done when

- [x] Path data is read and refused as it should be, and a path shape validates (model unit).
- [x] Each outline is stretched and drawn with its own fill and outline (render unit), and a hole, a tail outside the box, an unfilled line and an unoutlined fill look right in Chromium and Firefox (visual test).
- [x] The importer draws each kind as a path shape: wedge, bubbles, can, hole, line callout (unit, a course made by our code). Sample B's report loses those lines, and the project validates (scratch import).

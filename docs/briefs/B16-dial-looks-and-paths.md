# B16: dials drawn their own way, and arc and turn paths as Storyline plays them

**Asked by Luke, 2026-11-25:** "i want you to resolve the last 4 import issues". For the two the `.story` file could not settle, he gave Sample B's published Storyline output (a copy Luke provided). Its slide data (`html5/data/js/*.js`) shows exactly what Storyline draws and plays. Everything here was matched against it, and nothing is copied from it: the importer reads only the `.story`.

## What the published course showed

- **An arc path** is published as 9 points the object moves straight between. In the path's own frame, before its turn:
  - it runs from (`l`, `t`) across to (`r`, `t`), rising or falling to `b` in the middle;
  - the whole is turned by `rot` degrees about the middle of that box (`(l + r) / 2`, `(t + b) / 2`).
  - As fractions across the chord and of the depth, the points are always the same:
    - (0, 0), (0.2681, 0.7424), (0.3243, 0.9097), (0.4042, 1), (0.5, 1);
    - then back down symmetrically to (1, 0).
  - Sample B's arc matches them to within 0.05 px.
- **A turn path** is published as 6 points:
  - straight for half the way along `dir`'s first letter;
  - two points that are the controls of a quarter-circle curve, at (1 + 0.5523) / 2 and 1 − that, along each side;
  - the corner's end, then straight on to the end.
  - B14's quarter ellipse was close, but not this.
- **A dial with the built-in pointer** (`prstGeom` `dial`) is published as a needle that turns, over a round face that does not:
  - **The needle** is a diamond in the dial's box: the tip at the top, the tail at the bottom, widest at the pivot height, 2/26 of the width in from each side, filled with the dial's colour.
  - **The pivot** is `dialData` `rotationPoint`, an offset from the box's middle.
  - **The turn** is `rotation` hundredths of a degree (9720: 97.2°). The dial is drawn at its starting value, so it runs from −sweep × (start − min) / (max − min) to that plus the sweep. For Sample B that is −50.4° to 46.8°, the published numbers exactly.
  - **The face** is the picture of the face's picture fill (here on the Normal state's copy), a circle the dial's width across, centred on the pivot.

## Saved format version 40

**`DialObject.props.look`:** null, which draws ours as before, or:

- `pointer`: path data in the 0–1 box;
- `pivot`: a point in that box;
- `from` and `to`: the turn at the least and the most value, in degrees;
- `face`: `{ asset, size }`, a picture, or null.

`from` and `to` must differ; the face must be a picture. Migration 39 → 40 sets `look: null` on every dial. Legacy fixture `v39-two-slides`.

## Drawing and playing

- **Render:** a dial with a look draws its face, clipped round at the pivot, then its pointer turned about the pivot (`dialLookAngle`). A tiny `.vo-dial-pivot` marks the pivot.
- **Player:** keeps the pointer turned to the value about its pivot. A press or drag reads the angle from the pivot on screen, less the dial's own rotation; past either end, it takes the nearer end (`lookedDialValue`). Keys work as for any dial.
- **Editor:** draws it through the renderer, and moves, resizes and binds it like any dial. There is no tool yet to give a dial a look of its own: it comes from import.

## Import

- The arc and the turn become freeform paths of exactly these points, with nothing reported.
- A built-in-pointer dial gets its look and its colour (the fill of the dial or its Normal state). Any other dial is still drawn as ours and reported.

## Done when

- [x] The look validates and migrates; its errors are refused (model unit).
- [x] The pointer is drawn turned about its pivot over its round face (render unit), and looks right in Chromium and Firefox (visual test).
- [x] The player turns it by keys and by a press, about its pivot, on a dial turned upside down (player browser test, Chromium and Firefox).
- [x] The importer gives Sample B's dial its look, its arc and turns their published points (unit, against the published numbers). Sample B's report loses the arc and dial lines, and the project validates (scratch import).

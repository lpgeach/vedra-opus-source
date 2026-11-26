# B14: turn motion paths followed exactly

**Asked by Luke, 2026-11-25:** "if we need to add more features and functions to make it work do it". After B13, Sample B's report has 5 lines. One is "The turn motion path … is drawn as an arc (24 times)".

## What

- A Storyline turn path (`turnPath`) is a quarter turn from its start (`loc` l, t) to its end (r, b). It sets off along the first letter of `dir`: `d` or `u` sets off up or down and ends going across, `l` or `r` the other way round.
- Ours drew it as an arc, which the engine follows as a quadratic curve through the turn's middle. That is close, but not the same curve, so the importer reported it.
- **Now it is a freeform path:** 33 points along the quarter of an ellipse from start to end, which the engine follows by length. The object takes the turn's own curve, setting off and arriving as Storyline's does. Nothing is reported.
- **Importer only:** the format, engine and editor are unchanged. In the editor it is an ordinary freeform path.

**Not changed:** arc paths (`arcPath`). How much they curve is not clearly stored (a rotation and a rotation point whose meaning is not yet known), so they stay reported.

## Done when

- [x] A turn becomes a freeform path along its quarter ellipse, setting off the way `dir` says, with nothing reported (unit).
- [x] Sample B's report loses its turn-path line, and the project validates (scratch import).

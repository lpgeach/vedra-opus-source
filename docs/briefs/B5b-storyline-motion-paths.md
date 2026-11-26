# B5 part B, first slice: motion paths, sliders and tables from Storyline courses

**Asked by Luke, 2026-11-24.** He sent the report from importing Sample A:

- motion paths drawn as rectangles;
- "move along a motion path" triggers left out;
- sliders and a table left out.

He then asked whether it was fixed. The agreed order:

1. motion paths and their triggers, because they put wrong things on the slide;
2. sliders;
3. tables.

Each goes in as its own commit on `wp/b5b-story-motion-paths`. The clean-room rules of `docs/briefs/B5-storyline-import.md` still hold. The samples stay in `samples/` and are never committed; notes about them stay vague.

## 1. Motion paths

**As found in the two samples:** a motion path is an element of its own in a shape list. Its name ends in `Path`, and `shapeG` is the GUID of the object it moves:

| Element      | `loc`                                                   | Ours                                      |
| ------------ | ------------------------------------------------------- | ----------------------------------------- |
| `linePath`   | start (l, t), end (r, b), offsets of the object's place | `line`, exact                             |
| `customPath` | its bounding box; `pts/pt` hold fractions of it         | `freeform`, exact (at most 500 points)    |
| `turnPath`   | start and end; `dir` (`dr`…) is the way it sets off     | `arc` through the turn's middle, reported |
| `arcPath`    | start and end; `dir` is the way it bows                 | `arc`, bowing as ours does, reported      |

- `aniDur` is the duration (`PT5S`). `easingDir` (`none`, `in`, `out`, `inOut`) is the easing. `relativeStart` is the same as ours.
- `reverse="true"` runs the path end to start, so the points are reversed.
- **No counterpart, so reported:** `orientShape` (turning with the path) and `autoReverse` (coming back).
- **Triggers:**
  - `action="Move"` with `other moveG` (the object) and `motionPathG` (the path) becomes our `moveAlongPath`.
  - `event="OnAnimationComplete"` with `other animationG` naming a path becomes our `animationCompletes` with `{ kind: 'path' }`. In the other sample, 28 of its 46 such triggers name a path; the rest are entrances and exits, as before.
- **Paths are no longer drawn as shapes.** Each object picks up its paths as it is converted, so a group whose members move is still split up.
- **A path whose object was not imported** is reported and left out.
- **Paths on masters or layouts** are not imported. The samples have none.

## 2. Sliders and dials

**As found:** a top-level `slider` element. Copies inside `stateLst` are its states, not sliders.

| Storyline                                  | Ours                                          |
| ------------------------------------------ | --------------------------------------------- |
| `track start` / `end`                      | `min` / `max`                                 |
| `ticks step`                               | `step`                                        |
| `varG` (a user number variable, `Slider1`) | `variable`; it starts at the variable's value |
| its shape (wider than tall)                | `orientation`                                 |
| `track/bg/solidFill`                       | `trackColor`                                  |
| `OnSliderMoves`, on the slider             | `controlMoves`                                |

- **A dial** (only in the other sample) keeps its range, step and variable in `dialData` (`values start/end`, `increment`, `varG`). `OnDialTurns` becomes `controlMoves`. Its own face, often a picture, is not kept, and the report says so.
- **A range with no width** gets ten steps, reported. **A variable that is not a number** is not bound, reported.

## 3. Tables

**As found:** `table/table` holds `columns/tableColumn width` and `rows/tableRow height`. Each `cells/tableCell` keeps its words in a `text` attribute (the same document a text box holds), and `style/background/fillColor` for its fill.

- Widths and heights become our shares. `headerRow` and `firstColumn` become our header row and header column.
- The first cell's `bottomBorder` gives the border colour and weight, and its `margins l` the padding.
- Each cell keeps its own fill, so there is no banding over them.
- **Merged cells** (`rowSpan`, `columnSpan`, `verticalMerge`, `horizontalMerge`) are shown unmerged, and reported. The Sample A table has none.
- More than 20 columns or 100 rows are cut, reported.

## 4. Found on the way

- **A group whose parts are split up** (because one of them animates) used to lose its own entrance and exit. Each part without one of its own now gets the group's.
- **Media matching.** The report's "matched to one of several identical-looking files" line was not one thing; it hid three:
  - **Slide thumbnails** (`thumbG`, no recorded size), which are never imported, were matched against every picture on their slide. They are no longer looked for.
  - **n items sharing the same n same-sized files** (two animation frames of 26,850 bytes) both got the first file. A part lists its media relationships in the order it uses them, so they are now paired in that order: the first used takes the first listed. On Sample A this was checked against the pictures themselves (each frame against its neighbours).
  - **A pasted picture with no recorded size** (`bytes="0"`) was given the first of the slide's pictures. Its `source` holds its pixel size, `Pasted Image (1522x786)`. The candidates are now taken out of the zip with the rest, and the one of that size is it (the Sample A one was confirmed at 1522 × 786). Where no size is recorded, an item with no recorded size takes the one fitting file no other item could be.
  - The zip's CRC-32 is kept for each media file; same size and CRC means the same bytes, which is no guess.

## Done when

- [x] Line, freeform, turn and arc paths come through with their points, duration, easing, reversal and relative start; turn and arc are reported as approximated (unit).
- [x] Move triggers become "move along path", and path-complete events name the path (unit).
- [x] The test course gains a moving object, and its path plays in Preview (e2e `storyline-import.spec.ts`).
- [x] Sliders keep their range, step, variable, way and track colour, and their move triggers; dials their range, step and variable (unit; e2e: the slider shows).
- [x] Tables keep their grid, words, fills, header row, padding and border; merged cells are reported (unit; e2e: the table shows with its words).
- [x] Sample A, imported as the app does, reports only the group it splits up.

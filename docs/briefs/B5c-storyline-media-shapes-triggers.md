# B5 part C: media, shapes, triggers and captions from Storyline courses

**Asked by Luke, 2026-11-25.** He sent Sample B's report (106 lines), after parts A and B and B8.

The report groups into:

1. media that failed or was guessed;
2. shapes drawn as rectangles;
3. triggers left out;
4. closed captions;
5. quiz questions;
6. honest approximations (turn and arc paths, a dial's face).

**This part does 1 to 4.** Questions (5) are part D, to be agreed with Luke before it starts; 6 stays as it is. The clean-room rules of `docs/briefs/B5-storyline-import.md` hold. The samples stay out of the repository, and notes about them stay vague.

## 1. Media

- **A video or sound listed as `<media>`.** Storyline lists some MP4s under `<media>` (pictures) with `type="Mp4"`, and the kind came from the element's name, so they were imported as pictures and refused. **The kind now comes from the type:** MP4, MPEG, MOV, M4V, FLV, WMV, AVI and WebM are video; MP3, WAV, M4A, AAC, OGG and WMA are sound.
- **A picture type the app does not take** (TIFF, BMP). With the media tools, it is converted to PNG with ffmpeg (our build decodes both) and imported. Without them, it is reported and left out.
- **Ties broken by the slide's order.** A part lists one media relationship per use, in the order it uses its media; its sound, captions and thumbnail sit among them.
  - Walking the uses and that list together, each use votes for the next listed file that could be it. Where an item's files still tie after the size and elimination rules, the file with the most votes wins.
  - It is evidence, not a rule, so it only breaks ties.
  - A picture whose course recorded its pixel size is left for the size check (part B), which is surer.
  - On Sample B: guesses 27 → 1. Pictures whose file has the wrong proportions for its object went 174 → 160 (the rest are crops, the same before and after), checked with a scratch script.

## 2. Shapes

Shapes are drawn as polygons where we have one, by the proportions the course stores in `prstGeom` where it stores them:

| Storyline                                                                                   | Ours                                                         |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `polygon` (`sides`, `offset`)                                                               | a hexagon with its corners `offset` in; other counts regular |
| `trapezoid` (`offset`)                                                                      | the top corners `offset` in                                  |
| `chevron` (`cx`)                                                                            | the point from `cx` of the width                             |
| `pentagonArrow` (`cx`)                                                                      | a point `cx` long                                            |
| `upArrow`, `downArrow`, `leftArrow` (`cx`, `cy`)                                            | shaft `cx` wide, head `cy` deep, turned                      |
| `rightArrow`, `diamond`, `pentagon`, `hexagon`, `octagon`, `star5`, `parallelogram`, `plus` | our preset                                                   |
| `multiply`, `corner`                                                                        | an X and an L at default proportions                         |

Frames (they have a hole), cans, and callouts with rounded, cloud or line outlines stay as before, reported.

## 3. Triggers

- **"Jump to scene"** names the scene (`scene jumpG`) and the slide it lands on (`slide jumpG`). It becomes our "jump to slide", to that slide, or to the scene's first slide.
- **"When state changes":** the objects to watch are in `shape/stateLst/g`, and the trigger can belong to the slide or a layer. With `stateInclude="all"` it fires when all of them are in the state.
  - It becomes one `stateChange` trigger per object.
  - For several objects, each trigger has a condition that the others are in that state too, joined with "and" to the trigger's own.
  - Where the trigger's own conditions are joined with "or", they cannot be joined so; that is reported.
- **"Open a file"** (`jumpToFileUrl`) naming a file that is not in the course (`external_files/…`, published beside it): reported, saying so.
- **"When an animation completes" naming an animation the course no longer has:** its `animationG` matches no path, and its object has no entrance or exit. A deleted animation leaves these behind; Storyline never runs them. They are left out without a report line, as nothing is lost.
- **"Between"** (`op="btw"`) becomes two conditions, ≥ the low value and ≤ the high one. Where the trigger's other conditions are joined with "or", it cannot be expressed (ours do not nest), and is reported as before.
- **"Equal, ignoring case"** (`op="eqIgnore"`) becomes our `==`, which compares text exactly. That is reported.
- **Jump to scene** falls back to the scene's first slide when the slide it names is not a course slide.

## 4. Closed captions

A video or sound names its caption file with `ccG`. The import reads the caption files (`parseCaptions`, P6.4), and the converter puts the cues on their media's `props.captions`. Lines that could not be read are reported. The old "closed-caption files are not imported yet" line is gone.

## Done when

- [x] An MP4 listed as `<media>` comes in as video; a TIFF comes in as a PNG (unit, and Sample B).
- [x] Shapes with a preset are drawn as it (unit).
- [x] Jump to scene, and slide- and layer-owned state-change triggers over one or several objects, come across (unit).
- [x] Captions come in on their media (unit, and Sample B).
- [x] Sample B's report holds part D's questions, approximations with no counterpart, and a few lines that need part D or cannot be helped (106 → 75 lines):
  - drop triggers and a layer shown from a question;
  - one condition naming a variable the course does not have;
  - one media guess;
  - the PDF outside the course.

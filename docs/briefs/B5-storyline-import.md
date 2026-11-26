# B5: importing Articulate Storyline courses (`.story`)

**Asked by Luke, 2026-11-24:** "build the .story importer".

- **His decisions:**
  - core first, with a report;
  - the importer names its source plainly (an exception to pitfall #18);
  - it is built from two sample courses he supplied, kept in `samples/` and never committed.
- **Clean-room:** we study the files only, never Storyline's program. No Articulate content is committed; test files are made by our own code. Nothing writes `.story` files (`AGENTS.md`).
- **Legal advice** on reading the format was recommended and is Luke's to take.

## The format, as found in the two samples (Storyline 3, 2018–19)

A `.story` file is an Open Packaging Conventions zip (like `.pptx`): `[Content_Types].xml`, `_rels/.rels`, `docProps/`, and `story/`, all plain XML, not encrypted.

- **`story/story.xml`**, the course:
  - `varLst/var`: `name`, `dataType` (`bool`, `num`, `text`), `val`, `type` (`user` or `builtIn`).
  - `sceneLst/scene`: `name`, and `sldIdLst/sldId`, which are relationship ids in `story/_rels/story.xml.rels` naming `story/slides/slideN.xml`.
  - `mediaLst`: every media item as `media` (pictures), `audio` or `video`, each with its GUID `g`, `type`, `displayName` and `bytes`.
  - `quizMgr`: question banks and quiz defaults (part B).
- **`story/slides/*.xml`**, one `sld` each:
  - **Slide:** `name`, `tmProps min` (the timeline, in ms), `bg` (`solidFill`, `picFill assetG=…`), `trigLst`, `navData`.
  - **`shapeLst`:** the objects, in z-order:
    - `pic` (`assetG`), `textBox`;
    - `rect`, `roundRect`, `oval`, `triangle`, `line`, callouts and other shapes;
    - `sound` and `video` (`assetG`), `group` (`childLst`), hotspots (`clkAreaRect`);
    - sliders, dials, and question parts (`…Intr`).
  - **`sldLayerLst/sldLayer`:** layers, each with its own `shapeLst`, `trigLst` and `tmProps`. `modal` means base clicks are blocked; `pause` means the base timeline pauses.
  - **Each object:**
    - `loc l t r b`, in stage pixels;
    - `tmCtxLst/*TmCtx start dur untilEnd`, in ms;
    - `animEffect/entr|exit/<kind> dur="PT0.75S" dir=…`;
    - `bG` (`solidFill`, `noFill`, `solidLine`, `noLine` with `srgbClr` or `schemeClr`, and `shade`/`tint`);
    - `text`, a rich-text document as an escaped string, plus `plain`, its words;
    - `stateLst/state name=…`: a copy of the object per state, with that state's look;
    - `initState`.
- **Rich text** (`<Document><Content><Block><Span Text=… /></Block>…`):
  - `Block/Style` has `Justification`, spacing, and `ListStyle ListType`;
  - `Span/Style` has `FontIsBold`, `FontIsItalic`, `FontIsUnderline`, `FontFamily`, `FontSize` (points) and `ForegroundColor` (`#RRGGBB`, or a scheme name such as `lt1,00`).
- **Triggers:** `trig/data event=… action=… actSubType=…`, plus children:
  - `shape setStateG` (a state's GUID, which names its object);
  - `sldLayer showG`;
  - `other varG op varVal1`;
  - the slide target.
  - `condLst/trigCond` holds variable or state conditions, combined `andOr`.
  - The trigger's owner is the object, layer or slide whose `trigLst` holds it.
- **Theme colours:** a slide master's `clrLst` (`dk1`, `lt1`, `dk2`, `lt2`, `accent1`–`6`).
- **Slide notes:** in `docProps/summary.xml`, as a rich-text document, by slide GUID.

### Which media file is which

No part says which `story/media/R….ext` file holds an asset. Slides list their media as relationships, but no part refers to the relationship ids.

What works, across both samples, with no file claimed twice:

- An asset's file is among the media relationships of every part that uses it, and of a fitting type.
- A stored original keeps the `bytes` the course records for it.
- A file settled on one asset is no other's.

This resolves 96% and 93% of the two samples' media to one file. The rest have a few candidates of the same size and type, almost certainly copies of the same picture; the first is taken. Generated files (thumbnails, renders) are simply never chosen.

## Part A (this brief): the course's structure, look and behaviour

| Storyline                                                                 | Vedra Opus                                                                                                                                                                        |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| scenes, slides (names, order), stage size                                 | scenes, slides, `project.stage`                                                                                                                                                   |
| slide timeline length                                                     | base layer timeline                                                                                                                                                               |
| background (colour or picture)                                            | a full-slide shape at the back                                                                                                                                                    |
| `pic`, `textBox`, `rect`/`roundRect`/`oval`/`triangle`/`line`             | image, text, shape (other shapes: a rectangle, reported)                                                                                                                          |
| `sound`, `video`                                                          | audio, video (through the media pipeline)                                                                                                                                         |
| `group`                                                                   | group                                                                                                                                                                             |
| `clkAreaRect`                                                             | hotspot                                                                                                                                                                           |
| object timing, entrance and exit                                          | timing, effects (fade, fly, wipe, zoom, swivel, …)                                                                                                                                |
| states (Normal, Hover, Down, Selected, Visited, Disabled, Hidden, custom) | states, overriding picture, fill and text                                                                                                                                         |
| layers (name, objects, timeline, `modal`, `pause`)                        | overlay layers                                                                                                                                                                    |
| variables (user)                                                          | variables                                                                                                                                                                         |
| triggers                                                                  | events: click, timeline start and end, variable change, hover, state change. Actions: jump, show/hide layer, change state, adjust variable, pause/resume, media. With conditions. |
| notes                                                                     | slide notes                                                                                                                                                                       |
| anything else                                                             | left out or approximated, in the import report                                                                                                                                    |

**Part B, later:** questions and result slides, question banks, sliders and dials, motion paths, the player's settings, masters and layouts, and slide transitions.

## UI

- **File → Import Articulate Storyline Course…** (`project:importStoryline`): choose a `.story` file. A new, unsaved project opens, with the import report.
- **The report:** the same dialog as PowerPoint's. Its wording follows the source.

## Done when

- **`convert.test.ts`:** a `.story` file made by our own test code (`test-story.ts`) converts to the slides, objects, text, states, layers, variables, triggers and notes it holds, and the project passes `parseProject`. The media resolver is tested on its own.
- **`e2e/storyline-import.spec.ts`:** the menu imports such a file. The slides and the report show, and Preview plays it.
- **By hand:** both samples import. What is reported, and how slides look, is recorded in the log, without naming them.

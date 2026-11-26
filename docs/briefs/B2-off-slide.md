# B2: objects past the slide's edges

**Asked by Luke, 2026-11-23, testing alpha 1:** an option for objects placed partly or wholly off the slide, "so that it doesnt show or that it is like 50 percent hidden". Having tried it in the dev build, he asked for Dim as the default.

## What it does

The View tab has a group **Off the Slide** with three choices:

| Choice        | What the editor's stage shows past the slide's edges          |
| ------------- | ------------------------------------------------------------- |
| Show          | everything in full: the editor as it was before B2            |
| Dim (default) | everything at half strength against the pasteboard            |
| Hide          | nothing but the pasteboard, as a published course cuts it off |

- **The editor's view only.** The course is unchanged: the player's stage has always cut its content off at the slide's edges (`.vo-player-stage { overflow: hidden }`).
- **Objects stay pickable and movable** by their dimmed or hidden parts. An author has to be able to grab an object that is off the slide to bring it back. The selection's outline and handles are drawn over the mask as before.
- **An installation setting** (`view.offSlide` in `settings.json`), like the rulers and the grid: the same in every project, and kept between runs. An older or damaged value reads as Dim.

## How

- `.stage-off-slide` is a `div` over the slide (`inset: 0`) in the stage canvas. Its spread `box-shadow`, in the pasteboard's colour (`--bg`), covers everything outside the slide: fully for Hide, `color-mix(… 50%, transparent)` for Dim. Show draws no mask.
- The mask takes no pointer events (`pointer-events: none`). It sits at `z-index: 1`: above the slide and its objects, and under the grid, guides, selection, motion paths and the ribbon's pop-ups, which are all higher.
- The stage viewport's `overflow: auto` clips the shadow to the stage, and a box shadow adds nothing to the scrollable area.

## Done when

- `e2e/off-slide.spec.ts`, by the colours drawn on screen (`e2e/pixels.ts`):
  - a shape moved across the slide's right edge is half way to the pasteboard past the edge by default (Dim), the same as inside with Show, and the pasteboard with Hide;
  - the slide itself is untouched in every mode;
  - the hidden part still selects the shape;
  - the choice is kept after a restart.
- `settings.test.ts`: the default, an old settings file and a damaged value give Dim; Show and Hide are kept.

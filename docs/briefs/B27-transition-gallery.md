# B27: the Transitions tab as a gallery

**Luke (2026-11-27):** "the transitions ribbon needs work now, make it more like this so we have visuals of the transitions as well please", with a screenshot of another authoring tool's Transitions tab: a row of named tiles, one per transition, then effect options, duration and Apply to All. We match the layout and capability, with our own pictures and words.

**Before:** a drop-down of transition names, a second for the direction, a duration box, and Preview and "Apply to all slides" buttons.

## What it is

The tab's groups, in order:

1. **Preview:** a large Play command that plays the transition on the stage (`previewTransition`, unchanged).
2. **Transition to This Slide:** a gallery of tiles, None, Fade, Push, Cover, Uncover, Wipe, Split, Iris and Zoom, each a picture over its name.
   - **Pictures:** each is a small old slide (lines of text) and new slide (the accent colour, with a sun).
     - They move with the **player's own keyframes**, `transitionKeyframes` from `@vedraopus/render`, on a 44 × 30 stage, so a picture cannot show something the course does not.
     - At rest, a picture stands about halfway through its movement. While the pointer or keyboard focus is on its tile, it plays, pauses and plays again.
     - With the computer's "reduce motion" setting on, it stays still (`prefers-reduced-motion`).
     - The chosen tile shows the chosen direction.
   - **The chosen tile** is outlined and shaded.
   - **A radio group** ("Slide transition", or "Layer transition"): one tab stop, and the arrow keys, Home and End move through it and choose, as radio buttons do. Each choice is one undo step.
   - **Changing kind** keeps the duration, and the direction when the new kind takes it: Push from the left becomes Cover from the left.
3. **Effect Options:** the direction, disabled for a transition without one.
4. **Timing:** Duration (seconds, 0.1 to 5, disabled with no transition), and **Apply to All Slides** (the slide's transition, not a layer's).

**Layers:** while a slide layer is being edited, the tab sets **that layer's** transition, and its gallery group is named after the layer ("Transition to Layer 1"). Before, the slide's and the layer's fields showed side by side; now the tab follows what is being edited, as the stage does.

**Narrow windows:** like any group, the gallery goes tight (narrower tiles) and then folds into a drop-down. Nothing folds at 960 px or wider (`ribbon-tabs.spec.ts`).

## Tests

- **`e2e/transitions.spec.ts`:**
  - the existing test now chooses from the gallery; what it checks is unchanged (a transition set, previewed, applied to all, undone, a layer's, saved, reopened, published, played);
  - a new test covers the gallery: every tile in order; None disabling the direction and duration; the direction carried from Push to Cover; the arrow keys, End and wrapping round; one undo step per choice; a picture running only while pointed at.
- **`e2e/phase6-course.spec.ts`:** chooses from the gallery.
- **`e2e/ribbon-tabs.spec.ts`:** unchanged; it already checks nothing on the tab folds or overflows at 960 px.
- **`help/shots.spec.ts`:** pictures of the tab in both themes (`help/images/transitions-*.png`).

## Not in this package

- **New kinds of transition:** the gallery shows the eight the model has.
- **Pictures drawn from the slide itself:** the tiles use a stand-in old and new slide.

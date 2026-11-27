# B28: the Animations tab as galleries

**Luke (2026-11-27):** "yes animations as galary as well", after B27 made the Transitions tab a gallery of moving pictures.

**Before:** the Entrance and Exit effects were drop-downs of names, and Motion Paths three plain word buttons.

## What it is

- **A shared tile gallery** (`TileGallery`, `components/tile-gallery.tsx`): B27's gallery, taken out of the Transitions tab so both tabs use the same tiles, keys and look.
  - It is a radio group with a picture over each tile's name.
  - A picture plays while the pointer or keyboard focus is on its tile.
  - The arrow keys, Home and End move through the tiles and choose.
  - The Transitions tab is unchanged to look at and use.
- **Effect pictures** (`EffectPicture`): a small stage with a stand-in object, moved by the course's own `effectKeyframes` (`@vedraopus/render`).
  - An exit plays them backwards, as the player does, so each picture shows what the course will do.
  - At rest it stands partway through.
  - It stays still when the computer asks for less motion.
- **Entrance and Exit** groups each hold:
  - **a gallery button:** the chosen effect's picture and name, playing while pointed at. Pressing it opens a grid of every effect, None first: Fade, Fly, Float, Wipe, Split, Iris, Grow, Zoom, Spin, Spin and grow, Bounce and Swivel, each a tile with its picture.
    - Clicking a tile chooses it and closes the grid.
    - The arrow keys choose as they move.
    - Escape or a click elsewhere closes it.
    - A grid, not a row on the ribbon: two rows of 13 tiles would not fit beside Motion Paths, and nothing may fold at 960 px (`ribbon-tabs.spec.ts`).
  - **beside it:** the direction (disabled for an effect without one), the duration, and By paragraph for objects with text, as before.
  - **Changing effect** keeps the duration, By paragraph, and the direction when the new effect takes it.
- **Motion Paths:** **Line**, **Arc** and **Freeform** become buttons with a small picture of each path. The chosen path's fields are unchanged.

The names, undo steps and commands are the same as before. Only the controls changed.

## Tests

- **`e2e/animation-gallery.spec.ts`:**
  - the grid lists every effect in order;
  - choosing closes it, and the button shows the effect;
  - a direction carries over (Fly from the left becomes Float from the left);
  - None disables the fields;
  - the keys choose;
  - Escape closes the grid;
  - an entrance picture and an exit picture run only while pointed at.
- **The specs that used the drop-downs** (`animations`, `group-members`, `phase6-course`, `ribbon-commands`) choose through the gallery with a shared helper (`e2e/animation.ts`). What they check is unchanged.
- **`ribbon-tabs.spec.ts`,** unchanged, checks that the tab fits at 960 px without folding.
- **`e2e/transitions.spec.ts`,** unchanged, checks the Transitions gallery still works after the move to `TileGallery`.

## Not in this package

- **Motion path presets** beyond Line, Arc and Freeform.
- **Pictures drawn from the selected object itself.**

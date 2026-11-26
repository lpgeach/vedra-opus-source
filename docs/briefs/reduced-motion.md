# Reduced motion in courses

**Follow-up to Phase 6**, asked for by Luke after the Phase 6 review (2026-11-18): courses follow the learner's "reduce motion" setting. This is WCAG 2.3.3 (Animation from Interactions, AAA), and good practice for learners with vestibular disorders.

## When it applies

- **When the learner's system asks for less motion** (`prefers-reduced-motion: reduce`), read as the course starts, in preview and in published courses alike.
  - A change part way through a course takes effect the next time it is opened, so the engine and the drawing never disagree.
- **The editor's own stage and scrubbing are not affected,** so authors see the full effects.
- **`PlayerOptions.reducedMotion`** can force it either way (for embedding, and for tests).

## What changes

| Feature                                  | Normally                          | With reduced motion                                                          |
| ---------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------- |
| Entrance and exit effects (every kind)   | fly, spin, wipe, …                | a **fade** of the same duration (by paragraph: each paragraph fades in turn) |
| Motion paths                             | the object travels along the path | the object is shown **at the path's end** as the run starts                  |
| Slide and layer transitions (every kind) | push, cover, zoom, …              | a **fade** of the same duration (the new slide fades in over the old)        |
| Zoom regions                             | the view eases in and out         | the view **cuts** to the region as its bar starts, and back as it ends       |

- **What stays the same:**
  - the timing: effects, runs and transitions take as long as they normally do;
  - triggers: `animation completes` fires when the path's run would have ended;
  - the timeline and everything in plan §5.
  - Only what is drawn changes.
- **Fades are kept,** because they are not motion.

## How

- **Engine:** `EngineOptions.reducedMotion`. With it on, the view reports a running path's end as the object's offset, and the camera without its zoom travel (as if every region's speed were 0). Times and events are unchanged.
- **Render:**
  - `effectKeyframes(…, { reduced: true })` gives an effect's fade instead;
  - `transitionKeyframes(…, { reduced: true })` gives a transition's fade (incoming only);
  - the animator takes `reduced` when it is made.
- **Player:** reads `matchMedia('(prefers-reduced-motion: reduce)')` (or the option) once, and passes it to the engine, the animator and the transitions.

## Done when

- **Engine:** with the option, a path's object is at its end as soon as the run starts, and `animationComplete` still fires at the run's real end; the camera is the region at its start and the whole stage at its end; without the option, nothing changes.
- **Render:** every effect kind and every transition kind gives a fade when reduced.
- **Player browser test (Chromium and Firefox),** with the system setting emulated (`page.emulateMedia({ reducedMotion: 'reduce' })`):
  - a fly-in stays in place and fades;
  - a path's object is at the path's end at once;
  - a push leaves the slides in place while the new one fades in;
  - a zoom region's scale is the full zoom as soon as it starts;
  - without the setting, the same course moves as before.

# B8: a group's members with their own timing and animations

**Asked by Luke, 2026-11-24.** Sample A's last report line was "The group “Group” is ungrouped, so its parts keep their animations":

- the group flies in;
- one of its two pictures then fades out on its own.

Our groups could not animate a member (P6.5: "Top-level objects only"), so the importer split the group. Each picture then flew in separately, and they drift apart in flight because they start at different heights.

Luke chose to lift that rule ("Let groups' members animate"). When it turned out that members' own timing was ignored too (a member showed whenever its group did), he chose the full package: "Yes, do the full B8".

## The rules, from now on

- **A member's own timing counts.** A member is on stage while its group is on stage **and** its own time on the layer has started and not ended. Its `timing` is in layer time, as a top-level object's is.
- **A member can have an entrance, an exit and motion paths**, played by its own timing, as a top-level object's are. Inside a moving or animating group, it moves with the group too: transforms compose.
- **Triggers work for members as for any object:** "move along path" runs a member's path, and "animation completes" waits for a member's entrance, exit or path. A member that is not on stage cannot be clicked.
- **Grouping keeps** its members' timing and animations; it no longer clears them. **Ungrouping** keeps them too.
- Unchanged: a zoom region still cannot be in a group or animate. Only a top-level object can be dragged (P9.7).

## The saved format: 35 → 36

- Validation no longer refuses animations on members.
- **Migration 35 → 36:** until now a member's own timing was ignored, so every member in an older project is set to `{ start: 0, duration: 'untilEnd' }`. It then plays exactly as before: whenever its group does.
- Legacy fixture `v35-two-slides` (with its group), as the format's other legacy fixtures are named. The migration itself is tested on a v35 project built in the test, with members whose timings used to be ignored.

## The engine

- A layer's on-stage set holds objects **at any depth**. A member is on stage when its group is and its own window is open.
- Enter and leave events, `animationComplete` events, and exits at the member's end all work for members, as for top-level objects.
- A member's view (`ObjectPart`) gains `onStage`, and its `effect` and `offset`. Its `visible` takes in its own time.
- Input reaches an object only if every group around it is on stage, and it is too.

## The player

The animator applies each member's effect and offset to that member's element, as it does for top-level objects. A member inside an animating group moves with it, as the transforms nest.

## The editor

Selection stays top-level (P2.2: clicking inside a group selects the group). Members are reached through their group:

- **Timeline:** a selected group shows its members as indented rows under it, each with its own bar, which can be dragged and trimmed like any other.
- **Animations tab:** with a group selected, a **Part** chooser picks the group itself or one of its members. The entrance, exit and motion paths shown are then that part's.
- **Timeline preview:** members' effects play as the timeline is scrubbed.

## The importer

- A group whose members animate is **kept whole**. The group keeps its own entrance and exit, and each member keeps its own timing and animations.
- **The report line goes.** The group-split code and its note are removed.
- **Not settled from the file alone:** what Storyline shows when a group's entrance starts before its members appear. The Sample A group's entrance starts at 0 s, and its pictures at 4 s. We play the timings as stored: the group's fly-in runs from 0 s with nothing yet shown, and the pictures appear at 4 s. Checking that against Storyline itself is Luke's to do, if he wants it.

## Done when

- [x] Validation accepts members' animations; grouping and ungrouping keep them; the migration sets old members to the whole timeline; the legacy fixture loads (unit, model).
- [x] A member's own timing decides when it shows; its entrance, exit and paths play; its events fire; input needs it on stage (unit, engine).
- [x] A member's entrance and exit play in the player, by its own time, with its own path, inside a group that also moves (player browser test, Chromium and Firefox).
- [x] The timeline shows a selected group's members and moves their bars; the Animations tab edits a member chosen as the part (e2e).
- [x] Sample A keeps its group whole and reports nothing (scratch import); the test course's group does too (unit).

# B17: the ribbon in the usual places, a Slide Properties panel, and the zoom bar

**Asked by Luke, 2026-11-26.** He sent screenshots of the ribbon of the authoring tool we match: "make sure we have feature parity and that everything is in roughly the same place". Then: "slide properties needs its own tab on the right … we can have two tabs on the right above each other", and "Zoom tool box gets hidden when zoomed out … like its getting cropped".

**Our own design throughout:**

- We match where things are and what they do: tabs, groups, the commands in them.
- Icons, wording and look stay ours. Nothing is copied from its artwork or help, and nothing is named after its product: its "Story View" is our Overview (AGENTS.md).
- File and Help stay as the title bar's menus.

**Not in this package:** a library of illustrated characters, and an animated mouse pointer for screen recordings. Both are large features of their own. A character library would need artwork we may use.

## 1. The ribbon

Seven tabs. The Text Format tab goes: its groups are on Home, always there, and dimmed when nothing with text is selected. Editing text opens Home instead.

| Tab              | Groups, left to right                                                                                                                                                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Home**         | Clipboard (Paste, Cut, Copy, Format Painter) · Slide (New Slide, Layout, Duplicate, Tab Order) · Font · Paragraph (with Find and Replace, and Fit) · Arrange (Group, Ungroup, Align, Order, Lock, Unlock All)                                                                                                      |
| **Insert**       | Slide (Slide Layer, Convert Slide, Zoom Region) · Media (Picture, Shape, Caption, Icons, Video, Audio, Web Object, Record Audio, Text to Speech) · Text (Text Box, Table, Symbol, Hyperlink) · Interactive Objects (Button, Slider, Dial, Hotspot, Input, Marker, Trigger, Scrolling Panel, 360° Image, Variables) |
| **Slides** (new) | Slide (Templates, New Slide, Import) · Quizzing (Graded Question, Survey Question, Freeform Question, Result Slide, Question Banks) · Record (Screen Recording)                                                                                                                                                    |
| **Design**       | Stage Size · Themes (ready-made themes, Colours, Fonts) · Background (Background, Hide Layout Objects) · Course (Tracking, Player…, Translation…)                                                                                                                                                                  |
| **Transitions**  | as now, plus **Apply to All**                                                                                                                                                                                                                                                                                      |
| **Animations**   | **Animation Painter**, then as now                                                                                                                                                                                                                                                                                 |
| **View**         | Views (Overview, Slide View, Master View, Feedback Master) · Show (Rulers, Grid, Guides, Snap, Off the Slide) · Zoom (Zoom In, Zoom Out, Fit) · Window (Panels, Reset Layout) · Theme                                                                                                                              |

**Always at the tab row's right end** (Luke approved, 2026-11-26): **Preview**, with a menu for this slide, this scene or the whole course, and **Publish…**. They leave the title bar and the Home tab, so no tab repeats them.

**A contextual tab** would name the kind of object it is for, as a small tag on the tab. With the Text Format tab's groups moved to Home there is no contextual tab left, so this waits until one is added. A button at the end of the tab row **collapses the ribbon** to its tab row, remembered; a tab clicked while collapsed opens over the stage until a command is used.

**New features the ribbon needs:**

- **Find and Replace** across the project's text.
- **Clear Formatting**, which takes selected text back to the theme's style.
- **Symbol:** a picker of special characters, typed into the text being edited.
- **Hyperlink:**
  - on text being edited, its link;
  - on a selected object, a click trigger that opens the address.
- **Caption:** callout shapes (rounded, square, oval, cloud), made as path shapes (B13), their tails pointing below.
- **Slide Layer:** adds a layer to the slide.
- **Trigger:** opens the new trigger dialog.
- **Apply to All:** the current slide's transition on every slide.
- **Animation Painter:** copies a selected object's entrance and exit to the next object clicked. Double-click keeps it on, as Format Painter does.
- **Ready-made themes:** a few colour-and-font sets of our own.
- **Background** and **Hide Layout Objects** for a slide: its own fill (colour, gradient or picture), and leaving out the objects its layout and master would show. **Saved format version 41.**

**As built** (session 117), where it differs from the table:

- **Home:** Clipboard · Slides (New Slide, Duplicate Slide, Tab Order) · Layout · Font · Paragraph · Editing (Find and Replace…) · Arrange. Find and Replace has a group of its own; Fit joins Paragraph when a text box is selected.
- **Insert:** Slide (Slide Layer, Zoom Region) · Media (Picture, Shape, Caption, Icons, Video, Audio, Web Object, Record Audio, Text to Speech, Import Media) · Text (Text Box, Table, Symbol, Hyperlink) · Interactive Objects (Button, Data Entry, Hotspot, Marker, Scrolling Panel, 360° Image, Trigger, Variables). Sliders, dials and inputs stay in the Data Entry menu. Convert Slide is on Slides, with the other question commands.
- **Slides:** Slide (New Slide, From Template…, Import Slides…) · Quizzing (Question, Survey, Convert Slide, Question Bank) · Record (Screen Recording…). The commands keep their names (Question, not "Graded Question"), and Result Slide stays in the Question menu.
- **Design:** Stage · Theme (five ready-made themes, Colours, Fonts) · Background (Background, Hide Layout Objects) · Course.
- **Transitions:** Apply to All was there already ("Apply to all slides").
- **View:** Views holds Feedback Master only. Overview, Slide View and Master View are always in the title bar, and the zoom is in the stage toolbar (part 3), so they are not repeated here.
- **Hyperlink:** while text is being edited, a link on the selected text; otherwise a click trigger on the selected object, a text box included.
- **Background:** drawn beneath the layout's and master's objects, so a layout that covers the stage with its own picture hides it; Hide Layout Objects removes those.

**Compact, and never off the side** (Luke, 2026-11-26: "I never want the ribbon to go off the side of the screen … reduce the size of the buttons … and group them"):

- Each group's main command is large (Paste, New Slide, Picture, Shape, Text Box, Button, Question, Stage Size, Screen Recording…). The rest are small, an icon and their words in a row, three to a column, as the two tools Luke showed lay theirs out. Layout is a list in Home's Slides group; Off the Slide and the editor's Theme are small choices one above the other.
- New Slide is on Insert too, first, as in the tool we match.
- When a tab is still wider than the window, its groups fold into drop-downs from the right until it fits (`useFolding` in `Ribbon.tsx`), and unfold, from the left, as room comes back. A folded group is one button with the group's name; its commands open in a panel under it and work as before.
- At 1280 px and wider nothing folds; at 960 px, the narrowest the window goes, Home folds Arrange and Insert folds Interactive Objects.

## 2. The right of the window: two panels, one above the other

- **Top:** Triggers · Format · Check.
- **Bottom:** Slide Layers · Slide Properties.
- **The split** between them is a divider that can be dragged, remembered with the rest of the layout. Reset Layout puts it back.
- **Slide Properties** is the slide's settings, now with a tab of its own instead of below the Format panel's placeholder: when it moves on, when revisited, its player buttons, its tab order.

## 3. Above the stage, and on it (Luke approved, 2026-11-26)

- **A toolbar above the stage:** the slide's number and name, the layer being edited (a menu of the slide's layers), the slide's size, and the zoom (Zoom Out, the zoom level with a menu of levels, Zoom In, Fit, 100%). It replaces the zoom bar that floated over the stage.
- **On the stage,** the selected object's name in a tag at its top left, and its size at its bottom right. Both are for the author only, never published.

## 4. The zoom bar (done before the toolbar replaced it)

- **Before:** it sat over the stage's bottom-right corner with nothing keeping it on top, so the scrollbars and objects past the slide drew over it.
- **Now:** it stays above the stage, clear of its scrollbars, whatever the zoom.

## Done when

- [x] Each tab has its groups and commands in the order above (as built); the commands moved still work; the Text Format tab is gone, and text is formatted from Home (e2e: `ribbon-tabs.spec.ts`, `text-edit.spec.ts`).
- [x] Each new feature works and is undoable where it changes the project (unit: `find-replace.test.ts`, `callouts.test.ts`, `slide-background.test.ts`, `render.test.ts`; e2e: `ribbon-commands.spec.ts`). Format 41 migrates and validates (model unit, legacy fixture `v40-two-slides`).
- [x] The right of the window shows the two panels, split by a divider that is remembered, with Slide Properties on its own tab (e2e).
- [x] The zoom bar is visible and usable when zoomed right out and right in, with objects past the slide (e2e). Now kept for the stage toolbar's zoom.
- [x] Preview and Publish are at the tab row's end on every tab, and nowhere else; the ribbon collapses and stays collapsed after a restart (e2e: `ribbon-tab-row.spec.ts`).
- [x] The ribbon never runs off the side: no tab overflows at 960 px, a folded group's commands work, and everything unfolds when the window is wide again (e2e: `ribbon-tabs.spec.ts`, `editor-shell.spec.ts`).
- [x] The stage toolbar shows the slide, its layer (and switches it), the size and the zoom; the selection's name and size show on the stage (e2e: `stage-toolbar.spec.ts`, `zoom-bar.spec.ts`).

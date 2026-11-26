# Project Vedra Opus - Specific Skill
**Last Updated**: 2026-11-22
**Status**: Active

Project-specific knowledge that is not obvious from the code. Update it whenever something surprises you.

## Current State
- **Product**: Electron desktop app (Linux, macOS, Windows). The earlier web/Express/Postgres/Vercel direction was dropped on 2026-11-14.
- **Other repositories** (session 115, 2026-11-24):
  - `lpgeach/vedra-opus-releases` (**public**) holds the downloads to send people: a README, and the GitHub releases (installer and third-party sources) copied from here. See `docs/releasing.md`, "Where people download it".
  - **B5 part B, first slice** (`wp/b5b-story-motion-paths`, session 115): motion paths, sliders, dials and tables from `.story` courses, the group fix and better media matching (`docs/briefs/B5b-storyline-motion-paths.md`). Sample A reports only the group it splits up. Questions, feedback layers, results and captions are the next slice. **No builds or releases until Luke asks**; he checks the import with `npm run dev`.
  - **B9, Donate** (`wp/b9-donate`, session 116): a Donate button in the title bar (Welcome screen and editor) and Help → Donate…, opening https://ko-fi.com/lukegeach through `app:donate`; the feedback site's header has one too (`docs/briefs/B9-donate.md`).
  - **B10, renames that Windows briefly refuses** (`wp/b10-rename-retries`, session 116): publishing, saving, the working copy and video export rename with `renameWithRetry` (pitfall #171). The intermittent `project.test.ts` save failure (sessions 114 and 116) is probably this; if it is seen again after B10, it is something else.
  - **Alpha 4** (`wp/alpha-4`, session 116): version `0.1.0-alpha.4`; the update feed and Help links on the public `vedra-opus-releases`; Windows installer and macOS installers for Intel and Apple Silicon (the arm64 one cross-built on the Intel VM, `VEDRAOPUS_TARGET_ARCH=arm64`, and not run anywhere yet). `docs/releasing.md` says how.
  - **B16, dial looks and Storyline's own path points** (`wp/b16-dial-looks-and-path-shapes`, session 116, format 40): dials can have a pointer, pivot, turn and face of their own; imported arc and turn paths move through the points Storyline's published course does (pitfall #173, `docs/briefs/B16-dial-looks-and-paths.md`).
  - **B15, linked files and proportions** (`wp/b15-last-import-lines`, session 116): a file a trigger opens by a relative path is brought in from beside the `.story` (`openFile`), or opened by the same path beside the published course; a recompressed picture still guessed is settled by its pictures' proportions (`docs/briefs/B15-linked-files-and-proportions.md`). Sample B's report is 3 lines: the arc's curve and the dial's face (both need a reference from Storyline), and where to put the PDF.
  - **B14, turn paths** (`wp/b14-turn-paths`, session 116): a Storyline turn path is now a freeform path along its quarter ellipse, not an arc (`docs/briefs/B14-turn-paths.md`). Sample B's report is 4 lines: an arc's curve, the dial's face, one media guess, the PDF not in the file.
  - **B13, path shapes** (`wp/b13-path-shapes`, session 116, format 39): a shape geometry of outlines (path data in the 0–1 box, each filled, outlined or both). Imported callouts, clouds, cans, frames and line callouts use it (`docs/briefs/B13-path-shapes.md`). There is no editor tool to make one yet.
  - **B12, the Sample B report's behaviour leftovers** (`wp/b12-story-leftovers`, session 116, format 38): `==i` and `!=i` comparisons, "is not" state-change triggers, and Storyline's own `fakeTrigger` left out (`docs/briefs/B12-storyline-leftovers.md`). The rest of Sample B's report is shapes (B13) and the PDF that is not in the file.
  - **B11, drag-and-drop and retry options** (`wp/b11-drag-and-retry-options`, session 116, format 37): one item per target, drop states held until Submit, a question item's "dragged over" and "dropped on" triggers, and Retry of only the wrong answers. In the engine, Form View, the result form and the importer (`docs/briefs/B11-drag-and-retry-options.md`).
  - **B5 part D** (`wp/b5d-story-questions`, session 116): pick-many and drag-and-drop questions as `freePickMany` and `freeDrag`, feedback layers as layers, Submit and "dropped on" triggers, and result slides with their quiz's questions, pass mark, timer, layers and Retry button (`docs/briefs/B5d-storyline-questions.md`, pitfall #172). Sample B's report is 75 → 34 lines; B11 takes it lower.
  - **B5 part C** (`wp/b5c-story-media-shapes-triggers`, session 116): media kinds by type, TIFF and BMP to PNG, ties settled by each slide's order of use, captions on their media, shapes as polygons by their stored proportions, and scene jumps, multi-object state changes, "between" and "ignoring case" conditions (`docs/briefs/B5c-storyline-media-shapes-triggers.md`). Sample B's report is 106 → 75 lines; the rest is mostly part D's questions, which waits on Luke.
  - **B8, a group's members with their own timing and animations** (`wp/b8-group-member-animations`, session 115, **format 36**): lifts P6.5's "top-level objects only". The engine, player, timeline (members' rows under a selected group) and Animations tab (a Part chooser) all handle members; the importer keeps such groups whole, so Sample A reports nothing (`docs/briefs/B8-group-member-animations.md`).
  - **B7, the import cover** (`wp/b7-import-progress`, session 115): while a Storyline course or PowerPoint deck imports, a cover over the whole window shows the stage, the media count and the file being converted, and nothing underneath (buttons, menu, shortcuts, a second import) can start anything (`docs/briefs/B7-import-progress.md`).
  - `lpgeach/vedra-opus-feedback` (private) is the feedback website: Next.js on Vercel's Hobby plan, with a private Blob store. Help → Send Feedback… opens it (B6, `docs/briefs/B6-feedback-link.md`). It is not deployed yet; that needs Luke's Vercel account.
- **Plan**: `docs/PLAN.md` is the source of truth for what to build next and tracks progress with checkboxes.
- **Stage**: Phases 0 to 4 are complete (milestones M1 and M2); Phase 4 was reviewed in session 27. Phase 5: P5.1 (tracking model), P5.2 (SCORM 1.2), P5.3 (SCORM 2004, 2nd to 4th editions), P5.4 (xAPI), P5.5 (cmi5) and P5.6 (Publish UI) done, so Phase 5 is complete (milestone M3, apart from the external checks) and was reviewed in session 35. Outstanding: the checks on SCORM Cloud, a real LRS and a real cmi5 LMS (Luke, later). Decided: SCORM 2004 3rd-edition packages stay without schema files (Luke, 2026-11-17). Phase 6: P6.1 (audio) and P6.2 (video) done. P6.3 (media pipeline: ffmpeg, WebM/MP3) done; Luke approved bundling ffmpeg. P6.4 (closed captions), P6.5 (animations), P6.6 (transitions), P6.7 (zoom regions, cue points) and P6.8 (text-to-speech) done, so Phase 6 is complete (milestone M4) and was reviewed in session 44; courses follow reduced motion (session 45). Phase 7 (Quizzing): P7.1 (question model and Form View) and P7.2 (graded types, PR #53) done and merged. P7.3 (survey types, PR #56) and P7.4 (freeform questions, PR #57) done and merged. P7.5 (feedback, PR #58), P7.6 (banks and draws, PR #59) and P7.7 (result slides, PR #60) done and merged, so Phase 7 is complete (milestone M5, apart from the external LMS checks) and was reviewed in session 56 (`check/phase-7`, PR #61). Phase 8 (Player): P8.1 (player frame, session 57, PR #62) and P8.2 (player tabs, session 58, PR #63) and P8.3 (player appearance and labels, session 59, PR #64) and P8.4 (lightbox slides, session 60, PR #65) and P8.5 (responsive behaviour, session 61, PR #66) and P8.6 (restart, exit and the last actions, session 62, PR #67) done, so Phase 8 is complete (milestone M6) and was reviewed in session 63 (`check/phase-8`). Phase 9: P9.1 (hotspots and markers, format 26, PR #69) is done (session 65). The full technical rename to Vedra Opus (session 66, PR #70) is merged; `.eloquent` is a legacy-open extension and `.vedraopus` is the new save extension, with no saved-format change. P9.2 (data-entry fields, format 27, session 67, PR #71) P9.3 (stock checkboxes and radio buttons, no format change, session 67, PR #72) P9.4 (sliders and dials, format 28, session 68, PR #73) P9.5 (scrolling panels, format 29, session 69, PR #74) P9.6 (web objects, format 30, session 70, PR #75) P9.7 (dragging and intersections, format 31, session 71, PR #76) P9.8 (icons and illustrations, format 32, session 72, PR #77) P9.9 (tables, format 33, session 73, PR #78) P9.10 (360° images, format 34, session 74, PR #79) and P9.11 (screen recording, no format change, session 75, PR #80) done, so Phase 9 is complete (the first part of milestone M7, which spans Phases 9 to 11) and was reviewed in session 76 (`check/phase-9`). Phase 10 (Luke said to go on, session 77): P10.1 (accessibility) is built in three parts (`docs/briefs/P10.1-accessibility.md`): part A (roles, focus, skip link, announcements, axe-core, session 78, PR #83) and part B (keyboard dragging and the Tab order, format 35, session 79, PR #84) and part C (the text view, remembered learner settings, the player's contrast, session 80) done, so P10.1 is ticked. Still outstanding for P10.1: the NVDA and VoiceOver pass (Luke's) and axe-core in CI (no CI until December). P10.2 (the accessibility checker, the right panel's Check tab, and the Format panel's alt text and decoration, session 81) done. Waiting for Luke: whether text on a solid fill should default to black or white for contrast (the default button is 3.6 : 1; see the session 81 log). P10.3 (translation) is built in three parts (`docs/briefs/P10.3-translation.md`): part A (translation units, XLIFF 1.2, File → Translation…, session 82, PR #87), part B (the two-column Word document, session 83, PR #88) and part C (right to left, the player's words by language, session 84) done, so P10.3 is ticked. P10.4 (the editor's string catalogue and the pseudo-locale, session 85) done, so Phase 10 is built (milestone M7's second part), and it was reviewed in session 86 (`check/phase-10`, PR #91). Phase 11: P11.1 (PowerPoint import) is built in four parts (`docs/briefs/P11.1-pptx-import.md`). Luke chose (2026-11-22) to bundle LibreOffice, only the part the import needs, to draw unsupported content as pictures. Part A (the reader, File → Import PowerPoint…, the report, session 87, PR #92) part B (masters, layouts, backgrounds, session 88, PR #93) and part C (transitions, animations, media, session 89, PR #94) and part D (LibreOffice, trimmed, draws charts, SmartArt and other pictures, session 90) done, so P11.1 is ticked. LibreOffice for macOS (P11.1 part E, session 102) done: the fetch handles the dmg. P11.2 (templates) is built in three parts (`docs/briefs/P11.2-templates.md`): part A (Save as Template, New from Template, session 91, PR #96) and part B (File → Import Slides, session 92, PR #97) and part C (built-in starter templates, session 93) done, so P11.2 is ticked. P11.5 (hardening) is planned in three parts (`docs/briefs/P11.5-hardening.md`): part A (the performance budget as a test, session 96, PR #101) and part B (large media, session 97, PR #102) and part C (local crash reports, proof of no telemetry, session 98) done, so P11.5 is ticked. P11.3 part C (the WebM video, Luke's choice, session 99) done, so P11.3 is ticked. P11.4 is planned in two parts (`docs/briefs/P11.4-signing-and-updates.md`): part A (signing-ready, session 100, PR #105) and part B (opt-in updates, session 101) done, so P11.4 is ticked. LibreOffice for macOS done (session 102). macOS made feature-ready (session 103, PR #108): our own LGPL ffmpeg, and the full checks run in the macOS VM. Phase 11 was reviewed in session 104 (`check/phase-11`). **Every work package in the plan is now built and every phase reviewed**; what comes next is Luke's to say (see the session 104 log). Release work Luke asked for since: R1 (our own LGPL ffmpeg on every system, Windows refusing H.264/AAC too, session 105, PR #110) and R2 (Help → Third-Party Notices…, the npm notices collected at build time, courses carrying their player's notices, and `npm run collect:sources` for the source offer, session 106, PR #111) and R3 (Windows and macOS read H.264, AAC and the like through their own decoders with `vo-decode`; Linux still refuses; session 107, PR #112). **This is alpha 1** (Luke, 2026-11-23); the beta's list, icons and branding first, is in `docs/release-stages.md`. The packaged app was checked on all three systems in session 108. Since then (beta work, as Luke tests): B1, one title bar with the menu behind a hamburger and the window's own buttons on the same row (session 109); the same session fixed video playing in Preview, the stage's video playing with the timeline, Space playing the timeline, and an mp4's poster listed as a second item in Media. B2: objects past the slide's edges dimmed by default, or shown or hidden (View → Off the Slide, session 110). Alpha 2 published (session 111). B3: a 360° image from `file://` drawn (session 112). B4: the UK space demo course ships in `apps/desktop/resources/templates/`, opened from the Welcome screen and Help (session 113). B5 part A: File → Import Articulate Storyline Course… (session 114); part B (questions, sliders, motion paths, captions, the player) is next. P11.3 was built in three parts (`docs/briefs/P11.3-video-and-handout.md`): part A (the handout as PDF, session 94, PR #99), part B (the handout as Word, session 95, PR #100) and part C (the video, WebM by Luke's choice, session 99). Luke chose Lucide and a CC0 illustration set for P9.8 (session 71). Luke asked (session 67) to go through all of Phase 9 and then review it, stopping only where the rules say to ask. See the newest log in `logs/`.
- **Saved format**: version 36 once B8 is merged (36: a group's members keep their own timing and animations, older members migrated to the whole timeline; 35: a slide's Tab order, `properties.focusOrder`; 34: 360° images; 33: tables; 32: graphic objects; 28: sliders, dials and `controlMoves`; 29: groups that scroll; 30: web objects; 31: `drag` on objects and the drag and intersection events) (26 hotspots and markers, PR #69; 27 text entries bound to variables and the `controlLosesFocus` event) (2 added text placeholders, 3 per-slide player buttons, 4 tracking, 5 publish settings, 6 audio, 7 video, 8 captions, 9 animations, 10 transitions, 11 zoom regions, 12 speech, 13 questions, 14 graded question kinds with text entries and dropdowns, 15 survey kinds and multiline text entries, 16 freeform kinds, 17 the feedback master and feedback layers, 18 question banks and draw slides, 19 result slides and tracking by result, 20 the player frame settings, 21 the player tabs and the `playerTab` trigger event, 22 the player look and labels, 23 lightbox actions and lightbox tabs, 24 the responsive player's label words, 25 restart, exit, email, print, open file, focus and seek actions).
- **Merged**: everything through the Phase 7 review (PRs #8 to #61, all with CI not run), P8.1 (PR #62), P8.2 (PR #63), P8.3 (PR #64), P8.4 (PR #65), P8.5 (PR #66), P8.6 (PR #67), the Phase 8 review (PR #68), P9.1 (PR #69), the Vedra Opus rename (PR #70), P9.2 (PR #71), P9.3 (PR #72), P9.4 (PR #73), P9.5 (PR #74), P9.6 (PR #75), P9.7 (PR #76), P9.8 (PR #77), P9.9 (PR #78), P9.10 (PR #79), P9.11 (PR #80), the Phase 9 review (PR #81), the Phase 9 follow-ups (PR #82), P10.1 part A (PR #83), P10.1 part B (PR #84), P10.1 part C (PR #85), P10.2 (PR #86), P10.3 part A (PR #87), P10.3 part B (PR #88), P10.3 part C (PR #89), P10.4 (PR #90), the Phase 10 review (PR #91), P11.1 part A (PR #92), P11.1 part B (PR #93), P11.1 part C (PR #94), P11.1 part D (PR #95), P11.2 part A (PR #96), P11.2 part B (PR #97), P11.2 part C (PR #98), P11.3 part A (PR #99), P11.3 part B (PR #100), P11.5 part A (PR #101), P11.5 part B (PR #102), P11.5 part C (PR #103), P11.3 part C (PR #104), P11.4 part A (PR #105), P11.4 part B (PR #106), P11.1 part E (LibreOffice for macOS, PR #107), macOS feature-ready (PR #108), and the Phase 11 review once its PR is merged. On Linux, install espeak-ng for text-to-speech (it is on Luke's machine). Run `npm run fetch:ffmpeg` and `npm run fetch:libreoffice` once on a new checkout. Check `gh pr list` before branching.
- **Windows** (session 48): the full checks also run on Windows now; see pitfalls #6a and #97 to #100. **WSL** (session 50): a headless Linux test bed on the Windows machine; `~/vedraopus-checks.sh` in WSL runs every Linux check (`docs/HANDOVER.md` §2b).
- **Rules in force**: CI is on again, with no `[skip ci]` (pitfall #44, from 2026-11-26); no uploads to SCORM Cloud or any outside LMS (Luke checks later).
- **Repository**: https://github.com/lpgeach/project-eloquent.git, main branch `master`.

## Known Issues & Solutions

### 1. `ELECTRON_RUN_AS_NODE` breaks Electron in editor terminals
**Issue**: Terminals inside VS Code (and other Electron-based editors, and agents launched from them) export `ELECTRON_RUN_AS_NODE=1`. With it set, the `electron` binary behaves as plain Node: `electron --version` prints a Node version, and the app fails to start with errors like `app` being undefined.
**Solution**: Unset it for the command: `env -u ELECTRON_RUN_AS_NODE npm run dev`. `e2e/launch.ts` already strips it, so `npm run e2e` works anywhere.

### 2. TypeScript is held at 6.x
**Issue**: `typescript-eslint` declares `typescript <6.1`; TypeScript 7 is the npm `latest`.
**Solution**: Root `package.json` pins `typescript@6`. Upgrade both together when `typescript-eslint` supports 7.

### 3. electron-builder needs an exact Electron version
**Issue**: Packaging fails with "Electron version is a range" if `apps/desktop/package.json` has `"electron": "^x.y.z"`.
**Solution**: Keep Electron pinned to an exact version (no caret). `npm install -D electron@latest -w vedraopus-desktop` re-adds a caret — remove it.

### 4. The desktop app's package name must not be scoped
**Issue**: electron-builder derives the Linux executable name and the `.deb` file path from the package name. With `@vedraopus/desktop` the AppImage build rejected the executable name and the deb build tried to write into a non-existent `release/@vedraopus/` folder.
**Solution**: The app package is named `vedraopus-desktop` (the library packages stay `@vedraopus/*`). `executableName` and `artifactName` are also set explicitly in `electron-builder.yml`.

### 5. Sandboxed preload must be one CommonJS file
**Issue**: With `sandbox: true`, a preload script cannot be ESM and cannot `require` anything but `electron`.
**Solution**: The preload build in `electron.vite.config.ts` outputs `index.cjs` with everything inlined. Do not import heavy libraries (including Zod schemas at runtime) into preload; import types only.

### 6. Window-size tests on tiling window managers
**Issue**: On tiling compositors (Luke's machine runs Hyprland), the window manager ignores `setSize`, so exact-size assertions are meaningless and racy.
**Solution**: The e2e test detects this and skips the exact round-trip check. It runs for real in CI. Apply the same pattern to any future test that depends on window geometry.

### 6a. Local e2e runs are windowless on Linux
**Why**: Luke does not want test windows appearing on his desktop.
**How**: `e2e/launch.ts` passes `--ozone-platform=headless` on Linux outside CI. The window-size test is skipped in that mode (the off-screen surface has no real screen) and still runs in CI on all three systems. On Windows and macOS (no off-screen surface) it loads `e2e/transparent-windows.cjs` into the main process with `-r`, placed before the app folder because it is a Node option (Electron refuses `--import`). Windows are transparent, click-through, out of the taskbar and shown without focus, and the app's `clipboard.readText`/`writeText` use a clipboard of its own, so a run leaves the developer's clipboard alone. `windowsTransparent` says so; the two-instance paste test skips in that mode. `launchApp` also turns on focus emulation for every window, as Playwright does for browser pages. Use `VEDRAOPUS_E2E_SHOW=1 npm run e2e` to see the windows. If you ever need to launch the app visibly for a manual check, tell Luke first or open it on another workspace (`hyprctl dispatch exec "[workspace 9 silent] <command>"`).

### 7. CI displays are small
**Issue**: The Windows CI runner's screen is 1024×768. A window created larger than the screen is clamped, so a test that saved 1111×777 got 1024×720 back on relaunch.
**Solution**: Keep window sizes in tests within 1000×650 (the app's minimum is 960×600).

### 8. npm install-script warnings
**Issue**: npm 11 reports `electron-winstaller` has an install script not covered by `allowScripts`.
**Status**: Harmless on Linux/macOS. If Windows packaging fails in CI on a missing 7z binary, approve it with `npm install-scripts approve electron-winstaller`.

### 9. Never add Claude/AI co-author or attribution lines
**Rule (Luke, 2026-11-14)**: No `Co-Authored-By` trailers and no "generated with" lines in commits, pull requests, files or the app. Four commits had to be rewritten to remove them.

### 10. Long shell commands can be killed
**Issue**: A single command chaining push, PR creation, branch creation and `npm install` was killed part-way (exit 137), leaving the install undone.
**Solution**: Keep installs and network operations in separate commands and check state (`git status`, `git branch --show-current`) after any interruption before continuing.

### 11. TypeScript interfaces cannot have a method called `new`
**Issue**: `new(): Promise<…>` in an interface is a constructor signature, not a method, so `window.vedraopus.project.new` could not be typed.
**Solution**: The bridge method is `project.create()` (the IPC channel is still `project:new`).

### 12. Tests that close a dirty project must answer the prompt
**Issue**: Closing the app with unsaved changes shows a Save / Don't Save / Cancel box. In an e2e test with no answer queued, `answerDialogs` makes that throw rather than hang, but a test that never called `answerDialogs` would hang on a real dialog.
**Solution**: Any e2e test that ends with unsaved changes calls `answerDialogs(app, { message: [1] })` (Don't Save) before closing.

### 13. macOS keeps running with no windows
**Issue**: On macOS closing the last window does not quit the app, so a test waiting for the app to exit after closing its window waits forever.
**Solution**: Wait for the effect you care about (a file on disk, window count), then call `app.close()`.

### 14. Killing the app on Windows leaves the profile locked
**Issue**: After `process.kill()` on the main process, Electron's helper processes stay alive on Windows and keep the single-instance lock. Every new launch then exits at once with code 0 (it believes it is a second instance); Playwright reports `electron.launch: WebSocket error: read ECONNRESET`. Waiting 20 seconds did not clear it in CI.
**Solution**: To simulate a crash in a test, kill the whole process tree on Windows (`taskkill /pid <pid> /T /F`) — see `crash()` in `e2e/project-files.spec.ts`. When the lock is refused the app now prints "Vedra Opus is already running" to stderr, which shows up in Playwright's launch log.

### 15. `prefers-color-scheme` does not follow `nativeTheme` in headless runs
**Issue**: Setting `nativeTheme.themeSource = 'dark'` in main did not change the page's `prefers-color-scheme` under `--ozone-platform=headless` (how e2e runs locally), so a dark-theme test failed.
**Solution**: The page applies the theme itself: `ui-store.ts` sets `data-theme` on `<html>`, CSS switches `color-scheme`, and every colour is `light-dark(light, dark)`. Main still sets `nativeTheme` for native menus and dialogs.

### 16. No counters mutated during render
**Issue**: `let n = 0` incremented inside a `.map()` in JSX fails lint (`react-hooks/immutability`, part of the React Compiler rules in this version of the plugin).
**Solution**: Compute the values first (see `slideNumbers` in `project-store.ts`).

### 17. Playwright matches accessible names by substring
**Issue**: `getByRole('button', { name: 'Left Panel' })` also matches a button labelled "Hide left panel" (case-insensitive substring), and the test fails as ambiguous. The same control appearing in two visible places (ribbon and panel) fails the same way.
**Solution**: Pass `exact: true`, or use a `data-testid` for controls whose names overlap. Keep each command in one visible place.

### 18. Keep names away from "Storyline"
**Rule (Luke, 2026-11-15)**: Nothing in the app may be named so that it echoes the product we are matching. The all-slides view was first called "Story View" and was renamed **Overview**. Do not use "Story…" for any feature, file, test id or menu item. `docs/PLAN.md` was updated to match (P2.6, P4.5, the feature map).
**Exception (Luke, 2026-11-24, B5)**: the importer of `.story` files names its source plainly: "Import Articulate Storyline Course…", the code in `apps/desktop/src/main/import/storyline/`. Our own features still never take Storyline's names.

### 19. WebKit visual tests cannot run on Arch
**Issue**: Playwright's WebKit needs Ubuntu/Debian system libraries (`libicu74`, `libmanette`, …). On Luke's machine it fails to launch with "Host system is missing dependencies". Docker is installed but this user is not allowed to use it.
**Solution**: Locally run `npm run test:visual -- --project=chromium --project=firefox`. CI's `Visual` job runs all three. Say in the log that WebKit was verified in CI only.

### 20. Engines disagree about SVG pictures inside SVG
**Issue**: `<image preserveAspectRatio="xMidYMid slice">` covering a shape works for bitmaps everywhere, but when the picture is itself an SVG, Chromium letterboxes it while Firefox covers. The cross-engine visual test caught this.
**Solution**: When the picture's size is known, the renderer computes the placement itself (`coverPlacement`) so no engine has to interpret `preserveAspectRatio`. Prefer explicit geometry over browser fitting rules in renderers.

### 21. An SVG with a zero side draws nothing
**Issue**: `<svg height="0">` disables rendering even with `overflow: visible`, so a perfectly horizontal line (frame height 0) vanished.
**Solution**: The renderer's `canvas()` makes each side at least 1 px. Lines are drawn along the vertical middle of their frame.

### 22. The undo property test needs more than the default time limit
**Issue**: `undo/redo invariant` in `packages/model/src/history.test.ts` runs 300 random edit sequences and takes about five seconds alone. Once more test files ran in parallel it hit Vitest's 5-second default and failed with "Test timed out", not with a counterexample.
**Solution**: That one test has an explicit 60-second limit. Its assertions and run count are unchanged. A timeout there is about load, a counterexample is about a bug — read the message.

### 23. Edit-menu roles only act on text fields
**Issue**: Electron's built-in `undo`, `redo`, `delete` and `selectAll` menu roles undo typing in a text field. They do nothing for the document, and their accelerators swallow Ctrl+Z before the page sees it.
**Solution**: Those items are ordinary menu commands sent to the renderer (`menu.ts`), and `App.tsx` decides: in a text field it calls the browser's own editing command, otherwise the stage action. Cut, Copy, Paste and Duplicate are done the same way. The page cannot run the clipboard's own paste command, so a paste inside a field reads the text through IPC and calls `document.execCommand('insertText')`.

### 24. Keys the author holds must be watched on the window
**Issue**: Space+drag to pan only worked while the stage had keyboard focus. After clicking a ribbon button, Space went to that button instead (and pressed it).
**Solution**: `Stage.tsx` listens for Space on `window`, counts it only while the pointer is over the stage and the author is not typing in a field, and calls `preventDefault`.

### 25. No assigning to refs during render
**Issue**: `ref.current = () => …` in a component body fails lint (`react-hooks/refs`).
**Solution**: For a listener attached once that must see current values, use `useEffectEvent` (see the wheel listener in `Stage.tsx`).

### 26. Stage tests work in stage units, and scroll positions are whole pixels
**How**: `e2e/stage.spec.ts` reads an object's frame from its inline style (`frameOf`) and converts stage points to screen points with the canvas's `data-zoom` (`onScreen`), so tests do not depend on window size. Anything compared after scrolling (zoom about the pointer, panning) can be off by up to one pixel and must allow for it; panning also stops at the scroll limit.

### 27. Dragging and autosave
**How**: A drag is a history gesture. While one is open the store does not send the document to main; `editor.commitGesture()` sends it once at the end. Always use `editor.beginGesture` / `commitGesture` / `cancelGesture` (or `asOneStep` in `stage/actions.ts`), not the history's own methods, or autosave will miss the change.

### 28. Scripted edits after Prettier
**Issue**: A search-and-replace script failed because Prettier had re-wrapped the line it was looking for.
**Solution**: Look at the file as it is now before editing by exact text; after formatting, line breaks may not be where you wrote them.

### 29. One wheel turn is many events on macOS
**Issue**: Ctrl+wheel zoom keeps the stage point under the pointer in place. On macOS CI the point crept by just over a pixel: one wheel turn arrives as a burst of events, and re-reading the point from whole-pixel scroll positions for each event let rounding errors add up.
**Solution (verified on Linux and in CI)**: `onWheel` in `Stage.tsx` keeps the first event's stage point for as long as the pointer has not moved, the zoom is the one last asked for, and nothing else has scrolled the stage. A time limit was tried first and failed when events arrived slowly. Also: wheel events report the pointer in whole pixels, so a test must park the pointer on a whole pixel.

### 30. `npx playwright test` does not rebuild
**Issue**: Running one e2e test with `npx playwright test …` after changing app code tests the previous build in `apps/desktop/out`.
**Solution**: `npm run build` first, or use `npm run e2e`, which builds.

**Also**: Playwright strips TypeScript without checking it, so a spec with a type error still runs green. Run `npm run typecheck` before trusting a passing e2e run (session 39).
### 31. Hidden windows have no shared system clipboard
**Issue**: Locally `e2e/launch.ts` passes `--ozone-platform=headless`, so two app instances have no shared X/Wayland clipboard: copying in one and pasting in the other cannot work. The Linux CI job runs under xvfb and macOS/Windows have a real session, so the test does run there.
**Solution**: The cross-instance clipboard e2e skips when `windowsHidden` is true (`e2e/stage.spec.ts`). Do not "fix" it by making the test visible locally; confirm it in CI. Use `VEDRAOPUS_E2E_SHOW=1` only if Luke agrees to windows.

### 32. Clicking an already-selected object keeps the whole selection
**Issue**: In a multi-selection, clicking one of the selected objects does not narrow the selection — that would break dragging several objects together. An e2e test that wants to act on just one must first click empty stage.
**Solution**: Click an empty part of the stage (or press Escape) before clicking the single object. The context-menu tests do this explicitly.

### 33. Rulers shrink the stage viewport and change Fit zoom
**Issue**: Turning rulers on takes 20 px from the top and left of the viewport, so Fit chooses a smaller zoom. Screen coordinates read before the toggle no longer match object frames afterwards.
**Solution**: Re-read the canvas's `data-zoom` (via `onScreen`) after toggling rulers or changing the view, and use `toHaveCount` for SVG `<line>` elements, which Playwright does not treat as visible.

### 34. A guide lands within a unit, and the canvas can move first
**Issue**: The guides e2e flaked on macOS (passed on Playwright's CI retry), including in the packaged smoke test where the guide landed 11 stage units off. A guide is rounded to whole stage units and screen-to-stage mapping is only exact to a fraction of a pixel, so the value can be 399 or 401. More importantly, showing rulers or focusing the stage can move the canvas (ResizeObserver/layout), so a stage point measured before the press can be stale.
**Solution**: Wait for layout to settle (two animation frames) after showing rulers and after each press that can move the canvas, then read stage points from the settled canvas. Read the guide's `data-guide-x` / `data-guide-y`, allow one unit either way, and use that value in later assertions. Drive guide drags with `{ steps: 4 }` so moves are not coalesced. Treat a CI "flaky" as something to fix before calling a package done.

### 35. Render visual parity tests can depend on network when loading editor libs in-page
**Issue**: `packages/render/visual/text-parity.spec.ts` proves static-vs-editor text parity by rendering static markup and mounting a TipTap editor in the Playwright page via `esm.sh` module imports, then comparing screenshots. This requires network access at test time and is slower than pure local rendering.
**Solution**: Keep the test deterministic in content/CSS/fonts and ensure environments running it can reach the module CDN. If CI/offline constraints appear, replace with an equivalent local TipTap rendering harness (e.g. bundled editor markup generation) that preserves the same “editor rendering vs static rendering” comparison.

### 36. Text autofit and grow-shape are partly runtime/layout concerns
**How**: `shrinkText` is represented in render output (`data-autofit`, scale/attrs support) but final fit depends on measured layout with real fonts; `@vedraopus/render` provides `applyTextAutofit` to apply DOM post-processing after render. `growShape` text boxes commit a frame height change via `object.update` when the edit is committed (not every keystroke) so undo/history stays sensible. The in-place editor mirrors these behaviours while editing.

### 37. Local e2e runs leave temp folders, and /tmp is a small tmpfs
**Issue**: Each `npm run e2e` leaves about 49 `/tmp/vedraopus-e2e-*` profile folders. After a day of runs there were 1,310 of them (2.4 GB) on Luke's 3.9 GB tmpfs `/tmp`, which hit its quota; every Bash call then failed with EDQUOT and a long chained command was killed (exit 137).
**Solution** (fixed in the Phase 5 review, session 35): every Playwright config has a global setup and teardown (`e2e/temp-dir.ts`). It points `TMPDIR`, `TMP` and `TEMP` at one folder per run, and removes that folder at the end. Tests and the apps they launch inherit it. A full run used to leave about 1.3 GB, and twice that filled `/tmp` mid-review, failing 8 tests. If a run is killed before teardown, `/tmp/vedraopus-test-run-*` may be left: remove it when no test is running. New tests must make temporary folders with `os.tmpdir()`, never a hard-coded `/tmp`.

### 38. Format edits go through the store's gesture helpers
**How**: The Format panel changes several objects in one undo step with `editor.beginGesture` / `editor.commitGesture` (see #27); calling the history's own methods skips autosave. `object.update` merges `props` one level deep, so a change to `appearance` replaces the whole appearance: merge it per object (as `FormatPanel` does) or a multi-selection gets the first object's values.

### 39. Theme fonts in text are the names `heading` and `body`
**How**: A text mark with `fontFamily: 'heading'` or `'body'` resolves through `context.theme.fonts` in `@vedraopus/render` (`text.ts`), the same for editor and static output. Theme colours are `{ theme: slot }` objects. No schema change was needed for P2.5.

### 40. The model package has no `structuredClone`
**Issue**: `@vedraopus/model` compiles without DOM or Node typings, so `structuredClone` is a type error there.
**Solution**: Project data is plain JSON, so clone with `JSON.parse(JSON.stringify(x))` (see `clone.ts`). The renderer may use `structuredClone`.

### 41. Overview cards are not `<button>` elements
**Issue**: A card holds its own action buttons (Rename, Duplicate, Delete) and a draggable list item, and buttons cannot nest. Cards are `div role="button"`.
**Solution**: Select cards in tests with `.overview-card`, not by counting `getByRole('button')`. `window.prompt` does not work in Electron, so renames are inline inputs.

### 42. Format versions: 2 added text placeholders, 3 added slide controls, 4 added tracking
**How**: `FORMAT_VERSION` is 2: text boxes carry `props.placeholder` (`'title' | 'content' | null`). Migration 1→2 fills null; `fixtures/legacy/v1-two-slides` is the frozen v1 shape. Hand-written text objects in tests need `placeholder: null` (use `createTextObject`).

### 43. Master View edits a stand-in slide
**How**: `editedSlide()` in `project-store.ts` returns, in Master View, a stand-in slide whose `baseLayer` is the master's or layout's own layer (`isMaster`, `underlay`). The Stage and `stage/actions.ts` use it, so all object commands work unchanged because `findObject` searches master layers. Use `editedSlide`, not `currentSlide`, anywhere that acts on "the layer being edited". The Layout picker lives in the Home tab, so an e2e test must open that tab before `selectOption` or it waits forever (a Playwright action with no timeout shows only "Test timeout").

### 44. CI: off from 2026-11-16, on again from 2026-11-26
**Now**: the source is public (`lpgeach/vedra-opus-source`), where Actions minutes are free: commits no longer carry `[skip ci]`, and a work package waits for CI before it is merged.
**Before** (history only): GitHub Actions minutes were used up, and the workflow runs on every push to `master` and `wp/**` and every pull request. Until December 2026, end every commit message with `[skip ci]` (GitHub then skips both push and pull-request runs) and merge PRs with a subject that also contains `[skip ci]`: `gh pr merge N --merge --subject "Merge pull request #N from lpgeach/wp/... [skip ci]"`. Never start a run by hand. Say "CI not run" in logs and PR bodies. Check the `[skip ci]` is honoured with `gh run list --limit 3` after a push.

### 45. The engine's clock reference
**How**: `engine.tick(nowMs)` only moves time on by the difference from the previous tick; the first tick of a new (or restored) engine just sets the reference. Tests that compare a restored engine with the original must tick it once at the original's time first. Engine tests use plain numbers as the clock, never `Date`.

### 46. Player bundle and its browser tests
**How**: `npm run test:player` builds `packages/player/dist` (git-ignored) and plays the `two-slides` fixture from a plain page in three engines (WebKit cannot launch locally, pitfall #19). Tests use `autoStart: false` and `clock: () => 0` so time moves only with `player.tick(ms)`; mounting with the real clock makes small manual times look like the clock running backwards. Vite library mode leaves `process.env.NODE_ENV` in the bundle, so `vite.config.ts` defines it; without that the script throws at load and `window.VedraOpusPlayer` is undefined. A Playwright `page.evaluate` that fails with "undefined" there means the bundle threw: print `pageerror`.

### 47. A new top-bar control must go in a wrapper
**Issue**: `.top-bar` is a 3-column grid. A fourth direct child wraps to a new row, makes the bar taller and shortens the workspace, which broke the panel-size and drag tests. Put new controls inside `.top-bar-right`.

### 48. Publishing, folders and the app bridge
**How**: `publishProject` (main; `publishToFolder` before P5.6) builds in a hidden staging folder and renames it into `<parent>/<slug>`; it refuses a same-named folder that has no `content/data.js`. The Playwright e2e plays the published folder in a separate headless Chromium (`chromium.launch()`), over HTTP and from `file://`. `window.vedraopus`'s key list is asserted in `e2e/shell.spec.ts`: adding a bridge group means updating it on purpose. `npm run build` now builds the player first; `apps/desktop/out/player` must exist for Publish to work.

### 49. StrictMode and effect cleanups (typing did nothing under `npm run dev`)
**Issue**: In development React StrictMode mounts, unmounts and remounts each component. `TextEditor`'s unmount cleanup committed the edit and set `committed`, so in `npm run dev` the editor closed the moment it opened and text could not be changed. The built app (and `npm run e2e`) does not double-mount, so every test passed.
**Solution**: Cleanups with side effects (committing, saving, sending) must tolerate a fake unmount: defer to a microtask and skip if the component remounted (see `mounted` in `TextEditor.tsx`). To test dev behaviour headlessly: serve the renderer with `vite` (root `apps/desktop/src/renderer`, the react plugin, a fixed port) and run Playwright with `ELECTRON_RENDERER_URL=http://127.0.0.1:<port>` so the built main process loads it. Without a fix that run showed 0 editors; with it, typing works.

### 50. Commit text edits by object id, not from the store
**Issue**: Clicking outside a text box cleared `editingTextId` first, and the editor then committed on unmount; the commit read the id from the store, found null and dropped the typed text. `commitTextEdit(id, doc)` now takes the id from the object being edited. Tests: the "clicking outside" and "switching view" cases in `e2e/text-edit.spec.ts`, run in both the built and dev (StrictMode) renderers.

### 51. Preview window: sessions, navigation and Playwright
**How**: `protocol.handle` on the default session does not serve a window that uses a `partition`; register on `session.fromPartition(...)`. An unhandled custom scheme fails with `ERR_FAILED` and Electron hands the URL to `xdg-open`. After a navigation refused by `will-navigate`, Playwright's view of that page stalls ("waiting for navigation to finish") although the page is fine: check it from the main process with `app.evaluate` and `webContents.executeJavaScript`. A group element is a 0x0 container, so use `toHaveCount`, not `toBeVisible`.

### 52. Visible runs go to workspace 9
**How**: Luke allows visible app runs on another workspace. This Hyprland (0.56, Lua config) rejects `hyprctl dispatch exec "[workspace 9 silent] …"`. Add a session rule first, `hyprctl eval 'hl.window_rule({ name = "vedraopus-dev-ws9", match = { class = "^vedraopus$" }, workspace = "9 silent" })'`, then launch with `hyprctl eval "hl.exec_cmd('<script>')"`. A rule on the launching process alone does not follow Electron's window. To run the whole e2e suite against the dev renderer, see #49.

### 53. Scrolling panels and pointer tests
**Issue**: The e2e window's bottom panel is about 450 x 186 px. A wrapping toolbar took the rows' room, and bar handles lay outside the visible area, so presses landed on other elements (a drag "worked" on the wrong part, with no error).
**Solution**: Keep panel toolbars to one line (`flex-wrap: nowrap; overflow-x: auto`). In tests call `scrollIntoViewIfNeeded()` before pressing, and when a pointer test gives a wrong value rather than an error, print `document.elementFromPoint` for the point pressed.

### 54. Ribbon text tools: the Text Format tab
**How**: Text tools live in a contextual ribbon tab, `text` ("Text Format"), shown only while an object with text is selected or edited (`currentTextObject` in `Ribbon.tsx`). `editor.startEditingText` switches to it; when no text object is selected the ribbon falls back to `ribbonReturnTab`. The ribbon tab is in the editor store (`ribbonTab`), not component state. While editing, tools act on the selection; with a box only selected they act on all its text through a hidden TipTap editor (`stage/whole-text.ts`) and save with `object.update`. Both editors take their extensions from `richTextExtensions()`.

### 55. `type="number"` inputs do not work while text is selected in the editor
**Issue**: With a range selected in the TipTap editor, clicking an `<input type="number">` focuses it but Chromium leaves the selection in the editor; keys produce no `beforeinput`/`input` at all, with nothing calling `preventDefault`. A `type="text"` input takes the caret normally. This is why font size "did not work".
**Solution**: Ribbon fields are `RibbonField`: `type="text"` with `inputMode="decimal"`, filtered to digits, committing each usable value as typed without calling `chain().focus()` (which would steal focus after one keystroke); Enter or Escape returns to the text. The Format panel's and Timeline's number inputs still use `type="number"` and will have the same problem if used mid-edit. Also: `window.prompt` does nothing in Electron, so the link field is inline. The ribbon re-renders on every editor transaction via `getTextEditorVersion`.

### 56. Text Format tab is icon buttons in two rows
**How**: `IconButton` and `IconPopover` in `Ribbon.tsx`; icons are our own drawings in `icons.tsx` (never copied from another product). Each group stacks two `.format-row`s inside `.format-rows`. Every icon button has an `aria-label` and `title`, which tests select by. Whole-box formatting selects with `wholeRange` (a text selection), not `selectAll`: with an all-document selection TipTap could turn a list on but not off. To look at the UI without a window, a test can save `locator.screenshot()` and the image can be read back.

### 57. Edit-states mode is routed in one place
**How**: `editor.editState(objectId, stateId)` sets `stateEdit`. `editedSlide()` then returns the slide with that object resolved in that state, and the history proxy in `adopt` adds `stateId` to every `object.update` for it. Do not add state handling at call sites. Read the mode through `activeStateEdit()` (it also checks the object is still the selection). Because the store's `history` is a Proxy, methods are bound to the real history.

### 58. Redrawing an element under the pointer
**Issue**: The player redraws an object when its state changes. Replacing the node a press landed on means the browser fires no `click`; and after a redraw `event.target` is detached, so `closest('[data-object-id]')` on it finds nothing.
**Solution**: Keep the object's own element and replace only its children; recognise a click as press and release on the same object id; pass the id along instead of re-reading it from the event. After a click the pointer is still over the object, so it shows hover, not selected, until the pointer leaves: tests must move the pointer away.

### 59. `getByRole('option')` also matches `<select>` options
**Solution**: Use a class or test id for custom listbox items (`.state-chip`).

### 60. "Grow box to fit" is enforced where commands are sent, not in the editor
**Issue**: Only the on-stage text editor measured and grew a `growShape` box, so restyling a selected (not edited) box from the ribbon left the text overflowing.
**Solution**: The history proxy in `adopt` (`project-store.ts`) calls `heightToGrowTo` (`stage/grow-box.ts`) for every `object.update`: when the change touches a grow-to-fit box's text, padding, autofit or width, the box is drawn off screen as it will be, measured with `measureGrowHeight`, and the needed height is added to the same command (one undo step). The box is made exactly as tall as the text needs, so it grows and shrinks (Luke, 2026-11-16: "it should shrink as well"); the box is measured drawn one unit tall so the text's own height is read, with a floor of one line. The on-stage editor still grows its overlay live while typing, and the commit is then fitted by this rule. Choosing grow mode fits the box at once. Skipped in edit-states mode. In the e2e window (zoom about 19%) a one-line box is a few pixels tall and its handles cover its centre: double-click a quarter of the way along. Also: `RibbonField` gathers the changes typed into it into one undo step (a gesture from the first keystroke to blur/Enter), since each keystroke applies.

### 61. Theme colours: every control takes them from the tokens
**Issue**: Dialogs used undefined variables (`--panel-bg`, `--text`) with white fallbacks, and inputs and dropdowns had no colours at all, so they kept the browser's light look in dark mode (Luke, 2026-11-16: the theme menu for fonts and colours ignored dark mode).
**Solution**: `index.css` styles every `input`, `select` and `textarea` from `--surface`, `--fg` and `--border`, and dialogs use the same tokens. Only use variables defined in `:root`; check with a grep of `var(--` against the definitions. `e2e/audit.spec.ts` checks the background behind each dialog, field and menu in both themes (walking up past transparent elements). To review visually, a throwaway spec can take `page.screenshot()` of each screen and `montage` (ImageMagick) puts them on one sheet.

### 62. Number fields are `NumericInput`; gestures nest
**How**: `components/NumericInput.tsx` is the one number field (text input, typed value kept while focused, one undo step per entry). `type="number"` is not used anywhere (pitfall #55). `editor.beginGesture` inside an open gesture now joins it instead of throwing (counter in `project-store.ts`).

### 63. Formatting an empty text box starts typing in it
**How**: With no text in the box, a Text Format command opens the editor and applies itself once the editor is open (`whenTextEditorOpens` in `text-editor-state.ts`), so what is typed has that format. It is applied once to each editor that opens for that edit, because in dev React and TipTap open and discard an editor first; `stopEditingText` forgets it.

### 64. Variables: names in text, values only in the course
**How**: `%Name%` references are plain text in rich text; the editor never substitutes them (no `variables` in its render context), the player does. A rename rewrites references (`mapProjectText`), so anything new that holds rich text must be reached by `forEachRichText` in `packages/model/src/variables.ts`. Engine tests: the `record` helper in `engine.test.ts` drops the built-in `ElapsedSeconds` ticks; a test about them listens directly.

### 65. Engine operations: internal versions do not tell listeners
**How**: Triggers call `showOverlay`, `hideOverlay`, `applyState`, `assignVariable`, `goTo` and so on directly; the public methods are those plus `flush()`. `flush` runs the trigger queue first (`runTriggers`), then tells listeners, running triggers again after each listener in case it changed something. Anything new that changes runtime state needs an internal version without `flush` if a trigger action will use it. Every `emit` goes to both queues.

### 66. Triggers in the editor
**How**: `apps/desktop/src/renderer/triggers/`: `describe.ts` (sentences, owner from event), `TriggerWizard.tsx`, `TriggersPanel.tsx`. The panel's paste is "Paste trigger" because the ribbon already has "Paste" (pitfall #17).

### 67. Editing an overlay layer is a stand-in slide too
**How**: With `editingLayerId` set, `editedSlide()` returns `{ ...slide, baseLayer: <the overlay> }` plus `alsoBeneath` and `layerId`. Code that needs the stored slide (its `layers`, its `triggers` list for building choices) must look it up with `findSlide(project, current.slide.id)`, or it sees the overlay twice. `selectSlide` resets the layer being edited.

### 68. Golden runs
**How**: A fixture may have `golden.json` (script and expectations, `fixtures/golden.ts` for the types). Add the fixture's name to the loops in `fixtures/golden.test.ts` and `e2e/golden.spec.ts`. The engine run sends enter, down, up, click, leave for each click, and the e2e moves the pointer away after each click, so hover never differs between them. Write expectations from the design, not by copying the engine's output, or the test proves nothing.

### 69. A parent's ref is not set in a child's layout effect
**Issue**: The Overview's arrow layer measured cards in its `useLayoutEffect` using a ref on the parent `<main>`. React attaches refs child-first, so the parent's ref was still null; the effect returned early and never ran again, and no arrows appeared (no error).
**Solution**: A component that measures its surroundings renders its own marker element and measures `marker.current.parentElement`. Drawings like this are checked by screenshot, not only by counting elements: the first arrow drawn crossed the scene's buttons.

### 70. Memory on Luke's machine is tight
**How**: With his editor and apps open, about 1 GB is free. Commands running Prettier, typecheck and lint together, or typecheck followed by both browsers' player tests, were killed (exit 137) in sessions 25 and 28. Run formatting, typecheck, lint and each test suite (and each browser) as separate commands, and check `git status` after any kill.

### 71. Course JavaScript
**How**: The engine only calls `options.runScript`; the player supplies it. Never give the editor's engines a runner. The script API is public and stable (`docs/player-api.md`): extend it, do not change it. Preview's CSP allows `'unsafe-eval'` for this.

### 72. Objects inside groups are first-class in the engine
**How**: `objectsOf(rt)` returns every object at any depth; `treeOf(rt)` gives each object's parent group and layer; `chainOf` the object and its groups. Presses and clicks apply to the chain innermost first (so the object's triggers run before the group's); `enter`/`leave` are exact and the player sends them from its own record of what the pointer is over (`over` in `player.ts`), because redraws replace the elements browser events refer to. Group views carry `parts` (state and visibility of everything inside); the player redraws a group when any part changes. Before this, triggers on grouped objects silently never ran.

### 73. A hover state that moves the object away flickers
**How**: If Hover moves or shrinks an object so the pointer is no longer over it, hover ends, it moves back, and so on, in any player. Tests of hover must change something that keeps the object under the pointer (opacity, a wider width). An e2e that set X in the Hover state passed only by catching the flicker at the right moment.

### 74. After an interrupted session, look for work you do not remember
**How**: A session that ends mid-command may have continued further than your notes. Before redoing anything, run `git diff --stat` and read new or changed tests and functions; in session 27 a duplicate fix for the same bug made triggers fire twice.

### 75. Tracking (P5.1)
**How**: `project.tracking` (format 4) holds the completion rule, reporting pair and resume choice. The engine's `getTracking()` and `trackingChange` event give completion; `reportStatus(reporting, tracking)` (engine) is the one place statuses are mapped for every LMS standard: drivers must use it, not their own mapping. Success is `unknown` until quizzes (P7). The player handles resume: with `prompt` it shows its own question before creating an engine, so `player.engine` is `null` until the learner answers.

### 76. LMS runtime lives in the player; packaging in publish
**How**: The course-side LMS code (`packages/player/src/lms/`: driver interface, SCORM 1.2 driver, API discovery, suspend codec, `startCourse`) ships in the player bundle; `packages/publish` writes packages (`publishScorm12`, manifest, worst-case estimate) and imports the codec through `@vedraopus/player/suspend`, which has no DOM or CSS. Published `index.html` always calls `VedraOpusPlayer.startCourse(…)`, with `lms: 'scorm12'` for SCORM. The codec is pure (its own UTF-8, no `TextEncoder`) so publish can use it without DOM types. Suspend data starts `E1.`; ids are positions plus a course fingerprint, so a republish with different slides drops resume detail but keeps completion and variables (by name).

### 77. Testing LMS packages
**How**: `npm run test:lms` builds the player and runs `packages/publish/browser/*.spec.ts` (config `playwright.lms.config.ts`). The mock LMS page and the course must share an origin, so the test serves them over HTTP (file:// frames cannot reach each other's `window`). Ending a session is `iframe.remove()`, which fires `pagehide` in the course. Run each browser separately (memory).

### 78. When the shell's safety check gives no verdict
**How**: Sometimes Bash calls fail with "the auto mode classifier gave no verdict". Read, Edit and Write still work: do file edits with them and come back to commands later. Never retry a command more than once as-is.

### 79. The SCORM 1.2 schema files, and checking a manifest against them
**How**: The four `.xsd` files live as strings in `packages/publish/src/scorm12-schemas.ts`, because publish code has no disk access. They come from the Rustici bundle (CC BY 3.0; source and SHA-256 hashes are in the file's header). They were converted to LF line endings and are otherwise unchanged. Do not reformat them. `publishScorm12` writes them at the package root, and they are not listed in the SCO's files.
**Checking**: `xmllint` can check a manifest against them (it is installed here, but it is not a repo dependency). Two quirks of these 2001 files: `ims_xml.xsd` gives a "namespace error" warning, which is harmless, and `imsmd_rootv1p2p1.xsd` will not compile in libxml2 ("content model is not determinist"). So validate with a wrapper schema that imports only `imscp_rootv1p1p2.xsd` and `adlcp_rootv1p2.xsd`, since the manifest uses no metadata elements. `--schema imscp_rootv1p1p2.xsd` on its own fails on `adlcp:scormtype`, because the ADL schema is not loaded.

### 80. SCORM 2004 schema files, and the 3rd edition's licence
**How**: The 2nd and 4th editions' "no metadata" schema sets live in `packages/publish/src/scorm2004-schemas.ts`. Files the two editions share are stored once. The 3rd edition's `imsss_*.xsd` carry an IMS notice that anyone distributing them must register with IMS first, so they are **not** shipped. Luke decided (2026-11-17) to leave it that way: no IMS registration. Do not add them. The 2nd and 4th editions' copies have no such notice. Before bundling any third-party file, read its header for licence terms, not just the copyright line.
**Checking**: all three editions' manifests validate with `xmllint --nonet` against a wrapper importing imscp, adlcp, adlseq, adlnav and imsss. Unlike 1.2's metadata schema, these compile cleanly.

### 81. LMS saves happen in `onStart`, and completion never goes backwards
**How**: `startCourse` saves the starting point in the player's `onStart`, which fires once the course is actually playing: at once, or after the learner answers the resume question. Saving right after `mountPlayer` returns does nothing while the question is showing, because the engine is null. Both drivers remember the finished status the LMS held at start-up, and any written since, and never write a lower one. A learner who starts over, is given a new attempt, or takes a course whose resume setting is "never" keeps the completion they earned.

### 82. xAPI: saved state arrives late, statements go out in order of cause
**How**: The xAPI driver's `ready()` loads the State API document before the course mounts (`startCourse` shows "Loading…" meanwhile). If the LRS errors or takes more than 8 s, the course starts fresh and **never writes state that session**, so a slow LRS cannot wipe saved progress.
The engine reports a tracking change *before* the slide change that caused it. `startCourse` therefore reports status in a microtask, so the LRS sees "experienced slide 2" before "completed".
**Testing**: the mock LRS (`packages/publish/browser/mock-lrs.ts`) runs on a second port, so requests are cross-origin and preflighted, as with a real LRS. It validates every statement. The last requests on leaving use `fetch` with `keepalive`; that works through a preflight in both Chromium and Firefox here. The driver's unit tests use a fake `setTimeout`. Its state-load timeout is a timer too, so tests must look at *pending* timers, not all of them.

### 83. cmi5 shares the xAPI driver; its rules live in a profile
**How**: `lrsDriver` in `lms/xapi.ts` does the transport for both standards. `cmi5Profile` (`lms/cmi5.ts`) trades the one-use fetch URL for a token (kept in `sessionStorage`, so a reload works), reads `LMS.LaunchData`, and returns the session rules: context template, categories, launch mode, `moveOn`, return URL. Add a standard rule to the profile's session, not as a branch inside the driver's transport.
**Testing**: `mock-lrs.ts` also plays the cmi5 LMS: `fetchUrl()` hands out one-use URLs, and `putState()` leaves `LMS.LaunchData`. State keys compare agents by content, because the course re-serialises the actor. After a reload with saved progress the resume question appears; tests must answer it.

### 84. Publishing: the settings live in the project, the folder on the computer
**How**: `project.publish` (format 5) holds the target, edition, title, identifier, version, description and zip choice. The dialog saves them with `project.setPublishSettings` when Publish is pressed, and `publish:run` reads them from the project it is sent, so there is one source of truth. The output folder is kept by main in `publish-folders.json` (`PublishFolders`), never in `settings.json`, because the renderer saves that file whole and would overwrite it.
**Zip output** builds into the staging folder first, then streams those files into a zip with `yazl.addFile`, so large media never sits in memory. `publishCourse` in the publish package is the one entry point for every target; `checkPublishSettings` gives the dialog its per-field reasons.

### 85. Audio: the engine decides, the player follows and reports
**How**: Each audio object has a media state in the engine (`follow`, `free`, `paused`, `stopped`; `docs/briefs/P6.1-audio.md`), and `LayerView.media` says what should be playing. The player's soundboard (`packages/player/src/audio.ts`) works in three steps. Before each tick it reports the playing elements' `currentTime` (`engine.mediaTime`), so the time-master audio moves its layer's playhead. After drawing, it plays, pauses and seeks the elements to match. A refused `play()` (autoplay rules) pauses the slide behind a Play button.
**Editor**: sounds are decoded in the renderer with Web Audio (`audio-analysis.ts`) for length and waveform. That needs `fetch` of `vedraopus-asset://`, so the scheme is `corsEnabled`, sends `access-control-allow-origin`, and the page's CSP allows `connect-src vedraopus-asset:`. Without them you get "Failed to fetch". Imported `.webm` counts as video. A recording is stored through `project:storeRecording` as audio/webm.

### 86. Electron grants every permission unless told otherwise
**How**: until P6.1 no permission handler was set, so any page (Preview's authored content included) could have had the microphone or camera without asking. `main/permissions.ts` now allows the editor window only the microphone (audio only, with the macOS system prompt first), plus fullscreen and clipboard writes. Preview gets fullscreen only. A new feature that needs a permission must be added there on purpose.
**Testing a microphone**: launch the app with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` (Chromium's beeping stand-in device). Player and LMS test configs allow autoplay (`--autoplay-policy=no-user-gesture-required`, Firefox `media.autoplay.default: 0`). The blocked case is faked in the page on purpose.

### 87. Mock-LRS tests can leak into the next test
**Issue**: a course page still open when a test ends sends its last statements with keepalive as Playwright closes it, and in Firefox they arrived during the next test, after `lrs.reset()`. Two different tests failed on different runs.
**Solution**: `xapi.spec.ts` and `cmi5.spec.ts` leave the page in `afterEach` and wait for `terminated` before the next test starts. Any new spec sharing a mock server across tests needs the same.

### 88. Video plays in the element the renderer drew
**How**: `render` draws a video as a `<video data-media-id>`. In the editor it is a still: poster or the frame at the trim start (`#t=`), with no controls and no pointer input. In a course (`liveMedia: true`) it is the element that plays. The player's redraw keeps a video's element when its state changes, so playback never restarts, and the board in `player/src/audio.ts` drives it. Element time is `trimStart` plus engine time.
**The learner's controls** are detected by state, not events. Each frame the board remembers each video's playing state and time. A video with controls found playing or paused differently, or more than 1 s away, was changed by the learner, and the board reports it (`engine.mediaControl`) instead of correcting it. Events arrive too late: the board's next frame could undo the press first. With controls showing, the engine leaves clicks to the browser, which already plays and pauses a video with controls when it is clicked.
**Stalls**: a time master that reports without moving on holds its timeline for at most `MAX_STALL` (2 s). Firefox cannot play on after a seek in a WebM without cues, which is what Chromium records, our own narration recordings included. Without the limit, such a file froze the course. P6.3 will normalise media.
**Test media**: `fixtures/make-media.ts` makes a WAV, and a WebM recorded in Chromium (canvas and tone), per test run. Nothing binary is kept in the repo for this.

### 89. The media pipeline: ffmpeg in main, found at start-up
**How**: `main/media/ffmpeg.ts` finds `bin/ffmpeg` and `bin/ffprobe` in this order: `VEDRAOPUS_FFMPEG_DIR`, then `resources/ffmpeg` when packaged, then `vendor/ffmpeg/<os>-<arch>` (`npm run fetch:ffmpeg`). It runs them as child processes. `normalise.ts` decides: MP3 is kept; other sound becomes MP3; WebM VP8/VP9 is remuxed (giving it a seek index and duration); other video becomes VP9/Opus WebM. A video also gets a PNG poster frame. `importAsset` and `storeRecording` take the pipeline as an option, and `ProjectSessions.media` is set when ffmpeg was found. Imports report progress with `event:mediaProgress`.
**Formats**: Luke's choice, WebM and MP3, not H.264/AAC (memory: media-pipeline-decisions). Since session 105 the build is our own on every system (`scripts/build-ffmpeg.sh`, #153), with no H.264 or AAC code; patented formats are refused everywhere.
**Testing**: the integration tests in `main/media/media.test.ts` make their own inputs with ffmpeg's `lavfi` sources. When ffmpeg writes to a pipe it leaves no seek index and no length, exactly like a browser recording. They require ffmpeg on every system. Our macOS build has no H.264 or AAC encoder, so there the samples are made in royalty-free codecs, and the H.264 refusal test runs on Linux only (session 103). `fixtures/make-media.ts` has `vendorFfmpeg()` and `makeSeekableWebm()`. The packaged app was checked with `electron-builder --linux dir` plus the audio e2e spec run through `VEDRAOPUS_E2E_EXECUTABLE`.
**On Linux only royalty-free formats are read** (Luke, after P6.3: "anything that requires a patent on linux should be refused"). It is an allow-list (`ROYALTY_FREE` in `normalise.ts`): VP8, VP9, AV1, Theora, Opus, Vorbis, FLAC, MP3, PCM. Everything else is refused through `refusePatented` in `planFor`, set on Linux in `main/index.ts`, with a message naming the format. Do not turn it into a deny-list. Windows and macOS are to read them through the OS decoders later (`docs/licences.md`). Tests that need a video conversion on Linux must use non-patented input, such as VP9 in mp4.
**Watch**: `cpSync(..., { dereference: true })` on a symlink to a file failed in Node 26 (EISDIR); use `copyFileSync`, which follows links.

### 90. Captions are in the file's time, and edited rows must not move
**How**: `props.captions` on audio and video holds `{ id, start, end, text }` in the media file's own seconds, as VTT and SRT files are. The engine shows the cue at `trimStart + time played` for a video (`captionOf` in `engine.ts`), and `MediaView.caption` is null when the media is stopped, completed or waiting for its place. Parsing and formatting are in `model/src/captions.ts`. The player's CC button only appears when the course has captions. The caption band is `aria-hidden`.
**Watch (any list sorted by a field a `NumericInput` edits)**: `NumericInput` applies on every keystroke. If the list re-sorts as it does, the row being typed in moves, React moves its DOM node, and the field loses focus mid-number. The Captions tab holds the rows' order while a time field has focus (`held`) and keeps the saved list sorted. Also make each field clamp only itself: clamping the *other* end to fit a half-typed number (the "2" of "2.5") throws its value away. `e2e/captions.spec.ts` fails without the hold.
**Waveform dragging**: `renderer/caption-drag.ts` (`gripAt`, `dragCue`) is pure and unit-tested; the panel only maps pixels to seconds. A drag opens one gesture on its first real move (3 px) and closes it on pointer up, cancel or lost capture; `setCaptions`' own gesture nests inside it. When choosing the grip, "the press landed inside this cue" must come before "this cue is chosen": with the chosen cue first, a press just inside the next cue took the chosen cue's end instead (found by the e2e test).
**Silent media**: `useAudioAnalysisState` tells a decode failure (`failed`, for example a video with no sound track) from still decoding; `useAudioAnalysis` keeps returning null for both.
**Watch**: source text with a literal BOM or no-break space fails lint (`no-irregular-whitespace`). Write `\uFEFF` and `\u00a0`; heredocs pasted with such characters carry them in silently.

### 91. Animations: engine times, paused Web Animations, and `translate` for paths
**How**: the engine says what each object is doing (`ObjectView.effect` = phase and seconds in; `ObjectView.offset` = motion in stage units) and nothing else. `render/src/animation.ts` turns an effect into keyframes (`effectKeyframes`, pure and unit-tested) and `createAnimator()` holds one paused `Animation` per element (per paragraph, by paragraph), setting `currentTime` from the engine every frame. The browser never runs those clocks, so pause, seek and scrub are exact. The player calls the animator before its drawing-signature check (times change every frame). The editor stage calls it from a layout effect while `timelinePreview` is on, using `previewAt` (was `visibleAt`).
**Watch**: keyframes that set `transform` must keep the object's own `rotate(θ)` inside them, or WAAPI replaces the inline rotation. A group's element is 0×0 at the stage corner: give it `transformOrigin` and clip shapes in stage pixels (`objectBounds`). Motion uses the separate `translate` property, which applies outside `transform`, so it adds to fly/float and stays on the stage's axes. Browsers write `translate: 100px 0px` back as `100px`: compare positions, not strings. Exits finish at the object's end (Luke, 2026-11-18); an `untilEnd` object whose exit has played takes no input.
**Watch (engine)**: a run started by an event gets credited the playhead time since that event (`eventTime`), and a path that finished mid-tick reports `lateBy`, so chained paths and seeks land exactly. Only the new run gets that credit: crediting every run on the layer was a bug the unit tests caught. Seeking forward advances runs; seeking back leaves them.
**Resume through an LMS**: motion offsets are `SavedSlide.m`, and the suspend codec (`player/src/lms/suspend.ts`) carries them as `[object, x, y]` (fixed in the Phase 6 review; until then a resumed SCORM/xAPI course forgot them). The SCORM 1.2 publish estimate counts them too.
**Ids**: captions and motion paths have project-wide ids. Copies go through `renewObjectIds` (clone and paste); `idsInObject` lists them, so `object.add` refuses duplicates. Before session 40 a duplicated slide or pasted sound kept its caption ids and made the project invalid.

### 92. Transitions: the player draws each slide in its own container
**How**: the engine reports `EngineView.transition` (a slide's, from the slide left) and `LayerView.transition` (`in` or `out`) with seconds in, on its clock; a layer being hidden stays in `view.layers` with `shown: false` and the objects it showed until its transition ends. `render/src/transition.ts` gives the keyframes (`transitionKeyframes`, `layerTransitionKeyframes`). The player draws a slide inside `.vo-player-slide`; on arrival with a transition it keeps the old one as `.vo-player-leaving` (media paused, `data-media-id` removed so the sound board ignores it) until the transition ends.
**Watch**: layer containers (`.vo-player-layer`) are now the stage's size so a wipe, split, iris or zoom works on them; they take no clicks themselves (`pointer-events: none`, their children `auto`), and `.vo-player-closing` turns their children off while they leave. Tests that read the published page must look inside `.vo-player-slide:not(.vo-player-leaving)`. The editor's Preview draws a copy over the stage (`stage/transition-preview.ts`) rather than touching what React draws: many e2e tests rely on `.stage-slide > [data-object-id]`.

### 93. Zoom regions and sound in the editor's timeline
**How**: a `zoomRegion` object draws nothing in a course (a dashed "Zoom" frame on the editor stage, through `mediaMarkers`, which now means "editor markers"). `engine/src/camera.ts` works out the view (`viewAt`, `fitView`): the latest-starting region on stage wins, zooming in over its first `speed` seconds and out over its last, from and to whatever the view is without it. The topmost shown layer with a region decides. The player puts the camera on `.vo-player-slide` with the `scale` and `translate` properties, which apply outside the `transform` that slide transitions animate.
**Editor sound**: `renderer/timeline-sound.ts` plays the layer's timeline-started sounds (and videos' sound, from their trim start) while the editor's timeline plays, in hidden `audio[data-timeline-sound]` elements, put back in step past 0.15 s. C adds a cue point while playing (a capture listener on the window, ignored in fields).
**Watch**: `createEmptyProject` makes a 1280 × 720 stage, not 960 × 540. Tests whose numbers assume a stage must set `project.stage` themselves.

### 94. Text-to-speech runs the system's own engine
**How**: `main/speech/providers.ts` has a provider per system (`espeakProvider`, `sayProvider`, `sapiProvider`) and `findSpeechProvider` picks one at start-up (`sessions.speech`); `VEDRAOPUS_SPEECH=none` hides it for tests. The text goes in on **standard input**, never as an argument, and nothing runs through a shell. `main/speech/make.ts` speaks into a WAV in the workspace and imports it through the media pipeline, so it becomes an MP3 with its length. Voice ids are `<provider>:<voice>`. The renderer's `SpeechDialog` inserts with `stage.insertAudio(hash, { name, speech })` inside one gesture, or swaps a sound's asset, length and speech.
**Watch**: espeak-ng is GPL and not shipped: only run if installed (Luke's machine has it; CI installs it on Linux). macOS and Windows providers are untested until December. The bridge's group keys are listed in `e2e/shell.spec.ts`; a new group means updating that list on purpose.

### 95. Reduced motion is read once, and changes only the drawing
**How**: the player reads `prefers-reduced-motion: reduce` (or `PlayerOptions.reducedMotion`) as the course starts and passes it to the engine (`EngineOptions.reducedMotion`), the animator (`createAnimator(stage, { reduced })`) and the transition keyframes (`{ reduced }`). Effects and transitions become fades of the same length; a running path's object is *shown* at its end (`shownOffsetOf`); zoom regions cut (speed 0). The root says `data-reduced-motion="true"`. See `docs/briefs/reduced-motion.md`.
**Watch**: only the view changes. `offsetOf` (runs, relative starts, saved `m`) stays the real position; a test checks the saved offset mid-run is the real one. Tests emulate the setting with `page.emulateMedia({ reducedMotion: 'reduce' })`. The editor's stage ignores it, so authors see the full effects.

### 96. Questions: the slide's objects are the words, the question is the rest
**How**: `slide.question` (format 13) names its prompt (a text object), its Submit (a button) and its choices (`choice` objects), all on the slide's base layer; the words live in those objects, so the form edits them with `object.update`, and everything else with `slide.setQuestion`. Multiple choice gives its choice objects one `buttonSet`, so the engine's ordinary `selected` behaviour makes them exclusive; multiple response gives them none. `renderObject(object, context, state)` draws a choice's mark filled in `selected`; the player and the stage pass the state. The engine (`quiz.ts` for marking, `submitQuestion` in `engine.ts`) records answers in `SessionState.q`, which the suspend codec carries and drops last. `object.remove` takes a deleted object out of its question; `cloneSlides` gives copied questions new choice ids.
**Watch**: every control in Form View needs a name of its own: a labelled group called "Attempts" and a select called "Attempts" are two elements of the same name even with `exact: true`. `createQuestionSlide` (model) makes the whole default slide, for the editor and for tests. Feedback text is kept but not shown until P7.5.

### 97. On Windows, run vitest from `C:\`, not VS Code's `c:\`
**Issue**: VS Code's terminals (and agents started from them) begin in `c:\Users\…` with a lower-case drive letter. Vitest then loads itself twice, and every suite fails at its first `describe` with `Cannot read properties of undefined (reading 'config')`.
**Solution**: change to the upper-case path first: `Set-Location 'C:\Users\…\project-eloquent'` (PowerShell) or `cd "C:/Users/…"` (Git Bash). `ELECTRON_RUN_AS_NODE` (#1) is set there too; in PowerShell, `Remove-Item Env:ELECTRON_RUN_AS_NODE` before `npm run dev`.

### 98. The text editor's `focus` command moves focus a frame later
**Issue**: TipTap's `commands.focus()` and `chain().focus()` place the caret at once but call `view.focus()` in `requestAnimationFrame`. A key pressed straight after editing starts, or straight after a ribbon tool, went to whatever had focus before. Linux headless frames come at once, so only Windows (60 Hz frames) showed it, as five e2e failures.
**Solution**: after the command, call `focusTextNow(editor)` (`stage/text-editor-state.ts`), as `TextEditor`'s mount effect and the ribbon's `apply` and `refocus` do. Only outside render.

### 99. A closing editor must not become the active one again
**Issue**: after an edit ends, the closing TipTap editor can report one last transaction (its blur), register itself as the ribbon's active editor again, and then be destroyed. The ribbon then sent the next Insert variable into the dead editor, and it was lost (3 runs in 12 on Windows).
**Solution**: `setActiveTextEditor` ignores destroyed editors, and an editor destroyed while active clears itself and tells listeners (`text-editor-state.test.ts`).

### 100. Gestures go through `editor`, never `history` directly, in the renderer
**Issue**: the model's `history.commitGesture()` does not notify listeners, and changes made inside a gesture are held back, so main never heard of them. The Publish dialog's settings and Import Media left the project saying "Saved", and closing it would not ask. The e2e publish test passed on Linux only because Save happened to finish before the app closed.
**Solution**: use `editor.beginGesture` and `editor.commitGesture` (`project-store.ts`), which send the change to main when the gesture ends. An e2e test that changes something and then saves should first see "Unsaved changes".

### 101. Questions are a union on `kind`; `questions.ts` knows each kind's parts
**How**: from format 14 (P7.2), `Question` is a discriminated union. The choice kinds (`multipleChoice`, `multipleResponse`, `trueFalse`) have `choices`, by-choice scoring and feedback; the others score and give feedback by question only. Code that is not about one kind should go through `model/src/questions.ts` (`questionObjects`, `questionPartIds`, `withoutObjects`, `renewPartIds`) and `isChoiceQuestion`, so a new kind is added in one place plus its own switch cases (the compiler lists them). The engine's `markAnswer(question, { chosen, values })` takes choice ids, or values by part position: typed and chosen text, and for the drag kinds the object ids where things were dropped. Text entries and dropdowns are live only with `liveMedia`; the player's `drawFields` keeps them in step, and typing in them is not a key press.

### 102. A hotspot's mark is an answer, not an object state
**How**: `engine.mark(x, y)` resolves the spot under the point and stores `[spot id, x, y]` in `SavedQuestion.v`; the suspend codec already carries `v`. `markAnswer` only checks the spot id, so the same mark survives resume and is drawn from the view's `ObjectView.mark`. The picture is a **shape** (the author can give it an image fill), and spots are shapes shown in the editor but hidden in the course through `ObjectView.visible = false` — they must stay on the base layer because they are answer objects. The player draws the mark as a sibling of the layers inside the slide root, so it follows the stage fit, transition and camera.

### 103. Stage points in browser tests go stale when the page scrolls
**Issue**: clicking Submit in the 1280×800 player page made the browser scroll; a point measured before the click was then negative and the click landed outside the stage. A hotspot test appeared to have the wrong spot id for this reason, though the engine was right.
**Solution**: fit the player to the viewport (`#app` to `100vw`/`100vh`) and wait for the stage width before measuring points, as the drag browser test does. In an e2e published course, measure the stage box after the navigation that could scroll.

### 104. The first dev-renderer e2e run can time out while Vite optimises
**Issue**: with `ELECTRON_RENDERER_URL=http://127.0.0.1:5199`, the first `e2e/graded.spec.ts` run waited 30 s for New Project while Vite re-optimised dependencies; the two later tests passed.
**Watch**: start Vite and let it become ready before running the spec, and rerun once from cold before calling a dev-renderer failure a product bug. The warm rerun passed all three graded tests.

## Mistakes I keep making (read before editing)

These cost time more than once in sessions 10 to 22. Each has a rule.

0. **On Windows, Python's text mode writes CRLF.** Session 48's scripted edits turned five files to CRLF, and a heredoc with `\U` in it did not run at all. **Rule:** open files for writing with `newline='\n'` (or in binary), watch `git diff` for line-ending warnings, and write text with backslashes (Windows paths) with the Edit tool.
1. **Python `str.replace` edits that silently do nothing.** After Prettier re-wraps a file, an exact-text `replace` matches nothing and the script carries on, so a "fix" was never applied and a test ran the old code (the theme audit's `lightness` check, the Ribbon link anchor). **Rule:** every scripted edit asserts all its anchors before writing any file (`assert old in s` for each, then write), or edit with the Edit tool after reading the current text. Re-read the region after formatting.
2. **Killing my own shell.** `pkill -f vite.dev.config` and `pgrep -f "[v]ite.dev.config"` in a command that also *contains* that text match the shell running it, which ends with exit 144 and skips everything after it (happened three times). **Rule:** start background servers in one command, write their PIDs to a file, and stop them in a separate command with `kill <pid>`. Never put pattern-kills in the same command line as the pattern. Recipe that worked (session 23): `nohup npx vite --config <cfg> > log 2>&1 & echo $! > vite.pid`, run the tests, then in a new command `pkill -P $(cat vite.pid); kill $(cat vite.pid)`.
3. **Saying something works from the built app alone.** Typing into text "worked" in tests but not in `npm run dev` (React StrictMode). **Rule:** anything touching effects, mounting or the text editor is checked in both renderers (pitfall #49) before reporting it works, and say which ones were run.
4. **Heredoc and escape mangling.** Python heredocs turned `\u2028` into a raw character and `\d` into a literal backslash; in sessions 51 and 53 a `'\n'` in TypeScript came out as a real newline three times, and four more times in session 58. A JavaScript string written as `'\\n'` (or a regex with `\\S`) in a `node -` heredoc reached the file as a real newline (or a bare `S`), even inside `<<'EOF'`, while a plain `cat <<'EOF'` kept a single `\n` as written. **Rule:** use `<<'EOF'` with raw strings (`r'''…'''`) for code containing backslashes, and grep the result; better, put any line with a backslash escape in with the Edit tool.
5. **Locators that match more than meant.** `getByRole('option')` also matched `<select>` options; `getByRole('button', { name: theme })` missed radio buttons; a tiny box's handles covered its centre. **Rule:** when a locator fails or over-matches, read the error-context snapshot and the role actually used before changing app code.
6. **Long chained commands lose results.** A failure or kill midway hides later output, and `/tmp` filling up broke every command. **Rule:** run independent suites in separate commands; clear `/tmp/vedraopus-e2e-*` and Playwright profiles after e2e runs (pitfall #37).
7. **`str.replace` replaces every occurrence.** Removing ", vars }" from a line also removed it from the inner destructure on the same line, breaking nine tests. **Rule:** for a change that must hit one place, give `replace` a count of 1 and an anchor unique to that place, or edit by line after checking which occurrence it is.
8. **Not checking the pitfall list for names.** A second "Paste" button repeated pitfall #17. **Rule:** before naming a new control, search the app for the same accessible name.
9. **Redoing work after an interruption without checking what exists** (pitfall #74).
10. **Writing a test that asserts the bug.** A session-time test accepted `0000:00:60.00` for 59.999 s (an invalid time) and passed. **Rule:** before accepting an expected value, check it is right by the standard or the design, not just what the code produced.
11. **Updating a test to fit new behaviour without saying so.** Twice an old placeholder assertion failed after a feature replaced the placeholder; that is fine, but the log must say the test was changed and why, and the full suite must be rerun or the log must say it was not.
12. **Expected values worked out in my head.** The same kind of mistake has happened again and again: a loop-cap count, a truncation count, and in session 31 the scaled score of −20 on −10…10, which I wrote down as −1 when it is −0.5. Each time the code was right and the test was wrong. **Rule:** for any number in an expectation, write the arithmetic out (in a comment, or in the reasoning) before writing the value. When such a test fails, recompute by hand before touching the code.
13. **Skipping the start-of-package steps when moving straight on.** In session 33, going from one merged package to the next in the same sitting, I wrote P5.5's code on `master`, and before its brief. **Rule:** the first two actions of every package are `git switch -c wp/<id>-<slug>` and writing `docs/briefs/<id>-….md`; check `git branch --show-current` before the first edit.
14. **A wildcard removal after `cd`.** In session 37 I ran `cd "$T" && rm -rf *` to empty a scratch folder; had the `cd` failed, it would have deleted the repository's files. The safety check stopped it. **Rule:** never `rm` with a wildcard or a variable path after `cd`. Make a fresh folder with `mktemp -d` and leave old scratch folders alone, or remove one named path you have just checked exists.
15. **Names that match by substring, again.** Pitfall #17 bit twice in sessions 39 and 40: `getByRole('status')` found two regions, `getByLabel('Motion path')` found the overlay's "Motion paths". **Rule:** in Playwright, pass `{ exact: true }` to every `getByLabel`/`getByRole` name that is a word or two, and give status messages their own test id. In session 46 it happened again in Form View, and `exact` was not enough: a group and its select had the same name. Give controls names that are not also their group's.
16. **Changing a structure without looking for who reads it.** In session 41 the player's slides moved into a container, and the golden e2e test, which reads `:scope > .vo-player-layer`, failed in the full run. **Rule:** before changing the DOM a package produces, `grep -rn` the class or selector across `e2e/`, `packages/*/browser/` and the other packages, and fix the readers in the same change.
17. **A new saved field that does not reach everything that copies or encodes it.** `SavedSlide.m` (P6.5) was kept by the engine but dropped by the LMS suspend codec, which packs each field by name; found only in the Phase 6 review. **Rule:** when adding a field to a saved type (`SessionState`, `SavedSlide`, the project schema), grep for an existing sibling field's key (`saved.t`, `.h`) across all packages, and add the new one everywhere that one appears, with a round-trip test.
18. **Committing on a check I did not read.** In session 53 the typecheck step printed an error count of 2 and I committed anyway, reading only the tests' line. **Rule:** before every commit, every check's line must say pass or 0; a number is not a pass until it is read as one.
19. **Running `git stash` without meaning to.** Twice (sessions 57 and 63) I typed `git stash` while meaning to compare with the last commit or to set work aside for a moment, and it took uncommitted work with it; both times I popped it at once. **Rule:** never type `git stash`. To compare with the last commit, copy the working file to the scratchpad, `git checkout HEAD -- <file>`, run, then copy it back and grep that the change is there.
20. **Skipping the starting checks, then misreading the drive-letter failure.** In session 115 every Vitest suite failed ("reading 'config'"). I took it for a broken `node_modules` and ran `npm install` before finding pitfalls #97 and #142: the working directory was the lower-case `c:\`. **Rule:** run the checks before changing anything, as `AGENTS.md` says. On Windows run them from `C:\` (PowerShell: `Set-Location 'C:\Users\lukeg\Repositories\project-eloquent'`), and search this file for an error's text before trying a fix.

## Ways of Working

### Git
- Main branch is `master`.
- One work package per branch, named `wp/<id>-<slug>`.
- Descriptive commit messages, one logical change per commit.

### Session logs
- `logs/YYYY-MM-DD-session-N.md`: objectives, decisions, deliverables, verification results, next steps.

### End of a phase: review the whole phase before starting the next
Luke's standing rule (2026-11-17): when the last work package of a phase is merged, the next phase does not start until the whole phase has been checked. Do it on a branch `check/phase-<n>`, as its own session with its own log ("Session N: review of Phase n"). The method, first used for Phase 4 (session 27):
1. **Against the plan and briefs.** Re-read the phase in `docs/PLAN.md` section 8 and every brief of the phase. For each package, check the code does what its "Done when" and brief say, and that its tests prove it. Watch for things the packages built separately but never checked *together*, such as a feature added in one package that a later one quietly bypasses.
2. **Rules.** Check the engine and players against plan section 5 where the phase touched them, and the model's invariants (`skills/model-package.md`).
3. **Undo and redo.** Every command the phase added is in the random undo/redo property test in `history.test.ts`.
4. **End to end, through the UI only.** One e2e test that builds a course using the phase's features as an author would. It saves the course, reopens it in a fresh app, checks everything survived, then plays it in preview and as a published course. Name it `e2e/phase<n>-*.spec.ts`.
5. **Looks.** Screenshots of the phase's panels and dialogs in both themes, kept off Luke's desktop (pitfall #6a).
6. **Full checks.** Format, typecheck, lint and unit tests; e2e with the built renderer *and* the dev renderer; every browser suite the phase touched (player, LMS, visual), in Chromium and Firefox, each browser run separately.
7. **Report.** Fix what is wrong on the same branch, with tests. In the log, list what was found and fixed, what was checked and how, and what is still unverified (other operating systems, CI, external services). Then tick nothing new in the plan; the review is not a work package. Merge, then start the next phase.

### Where things go
```
apps/desktop/  → Electron app (main, preload, renderer, shared IPC contract)
packages/      → model, engine, render, player, publish
e2e/           → Playwright tests
fixtures/      → sample projects for tests
docs/          → PLAN.md, development.md, adr/
skills/        → these notes
logs/          → session logs
```

### Commands
See the table in `README.md`.

## Technical Decisions
Recorded in `docs/PLAN.md` section 3 (architecture and stack) and section 10 (open decisions and their defaults). Decisions made later go in `docs/adr/`.

## Lessons Learned

### 2026-11-14
1. **Check installed versions, not memory.** The ecosystem had moved several major versions (Vite 8, ESLint 10, TypeScript 7, electron-vite 6). Read the installed package's types or docs before writing config.
2. **Test the packaged build, not only the dev build.** The first packaging attempt surfaced three config problems the dev build never would have.

### 2026-09-13
1. Session logs are worth the time for tracking progress.
2. Plan the distribution model early; it shapes the architecture. (It was later changed from hosted web app to desktop app.)

### 105. Survey questions: answered, never right; marks by position over `choiceMarks`
**How**: the survey kinds (`surveyKinds`, `isSurveyQuestion`) have no `attempts` or `scoring`, a single thank-you (`feedback.answered`) and one branch (`branch.answered`); narrow to `GradedQuestion` before reading the graded fields. `markAnswer` gives a survey `{ answered, correct: false, score: 0 }`; Submit finishes it on the first answered try with `SavedQuestion.r = 'a'` (codec value 3) and `questionSubmit.result = 'answered'`. Every choice object the learner marks (graded choices, pick one/many, a Likert grid's points row by row) comes from `choiceMarks(question)`, and the engine keeps chosen marks (`c`) by position in that list; `pickedFrom` gives only the picks that have ids. Ranking reuses sequence (drag) but is never shuffled. `likertGrid` lays a Likert grid out for the factory and for Form View's add/delete.
**Watch**: code that walks `pickedFrom` to find what is chosen misses Likert points (an `answerOf` bug the Likert engine test caught). Paragraph alignment in rich text is the TipTap attribute `textAlign`, not `align`; an unknown key is silently ignored by the renderer. An essay entry keeps 4000 characters, which can push SCORM 1.2's 4096-character suspend data over, and then the codec drops question answers (last).

### 106. Freeform questions: the author's own objects, any type; drag states come from places
**How**: `convertToQuestion(kind, stage)` (model) gives a freeform question with no parts and, except for a shortcut key, a Submit button and its trigger; the store's `convertSlide` adds them as one gesture. Freeform parts have `QuestionObject.type === 'onStage'`: any object but audio and zoom regions. Pick choices use the engine's ordinary selection (an object with a Selected state; `withSelectedState` adds one; pick one shares a button set). Drag placements are `target|x|y` strings in `SavedQuestion.v` (`freePlace` reads them); Drop Correct/Incorrect are worked out from them in `shownState`, Drag Over from `engine.carry`, which the player calls while an item moves. A freeform hotspot's mark is `EngineView.mark`, not an object's. `engine.key(key, modifiers)` returns true when a shortcut-key question took the press; the player then stops (and `preventDefault`s) it.
**Watch**: objects inserted from the gallery share their name ("Rectangle"), so Form View's freeform lists number repeats (`listNames`) and every control's name stays unique. The Electron app's menu accelerators may take a key combination before the page sees it, so the shortcut-key editor also has a key-name field and modifier checkboxes. A freeform hotspot's click is read from the stage's box and the camera; a press on the question's Submit never moves the mark.

### 107. Feedback layers are ordinary overlays; the feedback master is a master of kind `feedback`
**How**: `project.masters` holds slide masters (`kind: 'slide'`) and exactly one feedback master whose four layouts have `role`s (`correct`, `incorrect`, `tryAgain`, `answered`); slides can only use slide masters' layouts, and the master commands refuse to delete or add to the feedback master. `createFeedbackLayer(master, role, words)` copies the master's and the layout's objects into a new overlay (the message is the layout's content-placeholder text, the button its first button, which gets a `continueQuestion` trigger); `addFeedbackLayers` gives a question slide the ones `feedbackRolesFor` says it needs (try again only with a try to spare). A question's `feedback` holds `FeedbackPart`s (`layer`, `message`, `button`); `feedbackParts` lists them, `withoutObjects` and `layer.remove` clear them. Submit shows the result's layer (`showFeedback`) and waits; `continueQuestion` hides it and branches, or leaves a try. By-choice words reach the player as `ObjectView.text`. Review (`reviewQuiz`) sets `reviewing`, which `questionClosed` folds into every input gate; `reviewMarks` gives `ObjectView.review`, `reviewResult` the banner.
**Watch**: generated question slides now have hidden overlay layers full of shapes and buttons, so tests that count a course's shapes, or click "Continue", must look at what is visible (`.filter({ visible: true })`), and a course's Submit waits for Continue (`e2e/course.ts`'s `submitAnswer`). Engine and browser tests about marking build questions with feedback `none` (`quizSlide`). The 16 → 17 migration copies the default master from frozen data (`migration-v17-data.ts`), scaled to the stage; never regenerate that file.

### 108. Banks are scene-shaped; `allSlides` is the course, `everySlide` is everything
**How**: `project.banks` holds question slides only, in scene-shaped containers; `findScene`/`findSlide`/`allLayers`/`idsInProject` look in banks too (a `SceneLocation` says `bank: true`), so slide and object commands work on bank slides unchanged. `allSlides` stays the scenes' slides in course order; `everySlide` adds the banks' and is what validation, references, the suspend codec's indexing and the SCORM estimate use. A draw slide (`slide.draw`) is replaced in the engine's `order` by `drawAll`'s questions, made once per session and kept in `SessionState.d`; its id maps to where its questions start, so jumps to it land there.
**Watch**: anything that builds a slide map from `project.scenes` alone misses drawn questions (the player's `slideById` did: "No slides"). Jump targets may only name scene slides. A bank slide previews on its own (`scopeProject`).

### 109. Results are worked out on arrival; interactions are parts the drivers write
**How**: `slide.result` (format 19) is the third slide role, beside `question` and `draw`. The engine's `resultQuestions` follows `include` (all, or chosen question, draw and result slides, each question once), `scoreResult` adds the saved `s` against `bestScore`, and `enterResult` keeps `{s, m}` in `results` (`SessionState.res`), shows the Passed or Failed layer and, for `tracking.completion.kind === 'result'`, completes with `success` and `score` (the LMS gets `setScore` before `setStatus`). The `Result*` built-ins describe this slide's result, or the tracked one elsewhere. `retryQuiz` redraws and `rebuildOrder()`s, which changes the course order mid-session. `printResults` emits a `ResultSummary`; the player prints `resultsPage(summary)` or hands it to `onPrintResults`. `interactionsOf` turns a finished question into `LmsInteraction`s whose `response`/`correct` are `InteractionAnswer` parts; `formatAnswer` writes them per standard.
**Watch**: the timer's `ResultTimeLeft` is 0 away from a result slide when nothing is tracked (by design). Letters by position cap at 36 parts for SCORM 1.2. A timer is checked in `tick`, so a test must tick to see it run out.

### 117. Hotspots and markers are buttons; their labels are the player's
**How**: format 26 adds `hotspot` and `marker` objects. In a course, `createMarkers` (`packages/player/src/markers.ts`) gives both button semantics and draws a marker's label over the stage: one at a time, with its own title, plain-text body, picture or video and sound. The sound follows the learner's volume and speed. A slide change, a lightbox or leaving the course closes the label; reduced motion turns off the pulse. The editor has no object-drawing tool, so Insert creates a default frame (200 × 120 for a hotspot, 36 × 36 for a marker) that can then be moved and resized.
**Watch**: the marker's plain text is `props.body`; `props.text` means rich text elsewhere. Redrawing replaces the button nodes, so the runtime keeps the open marker's element and resets `aria-expanded` when another opens. In the published-course e2e, a hotspot whose trigger completes the course made Playwright's `click` hang after the course ended; use `press('Enter')` there. The player browser tests cover clicks. The known WSL WebKit video-timing failure at `video.spec.ts:234` predates this package.

### 118. The product rename kept one legacy project extension
**How**: the full Vedra Opus rename (session 66) changed the display name, packages, executable, protocols, bridge, environment variables and CSS prefix, but not the saved JSON schema or its version. `FILE_EXTENSION` is `vedraopus`; `LEGACY_FILE_EXTENSION` is `eloquent`. Command-line project detection, the open/save dialog filter and the open path accept both, `.gitattributes` marks both binary, and both are registered as openable. Save As replaces any chosen extension with `.vedraopus`; plain Save in place keeps an existing file's path. `e2e/project-files.spec.ts` proves an old `.eloquent` file opens and Save As writes `.vedraopus`. The GitHub repository URL and clone directory were deliberately left alone.
**Watch**: do not add a model migration for the extension change. A file's extension is packaging, not format; compatibility belongs in the desktop project layer.

### 169. A hidden layer stays in the page: test that its text is hidden, not gone
**Issue**: In session 115 an e2e step `await expect(stage).not.toContainText('…')` failed after a layer was hidden, and an afternoon went on suspecting the importer, then the player. The engine had hidden the layer. The player keeps a hidden layer's elements, hidden, and `toContainText` reads all text, shown or not.
**Rule**: to check something on the stage went away, use `expect(locator).toBeHidden()` on it. Before blaming the player, drive the engine alone (`createEngine(project)`, `pointer`, `tick`, `getView().layers`): it separates the two in a minute.

### 174. An unsigned Apple Silicon app is "damaged": sign it ad hoc
**Issue**: Without a Developer ID, electron-builder skips signing. The Intel app is then simply unsigned, but the arm64 one keeps Electron's own ad-hoc signature, which packaging breaks (`code has no resources but signature indicates they must be present`). Apple Silicon refuses to run arm64 code without a valid signature, so it would say the app is damaged.
**Rule**: package unsigned Mac builds with `-c.mac.identity=-` on the command line (never in `electron-builder.yml`, where it would override a real certificate). Check both apps with `codesign --verify --deep --strict`.

### 173. A course's published Storyline output shows what Storyline really draws and plays
**What**: Storyline's HTML5 output (`html5/data/js/*.js`, one file a slide, and `paths.js`) is `window.globalProvideData('slide', '<JSON in a JS string>')`. Undo the JS string's escapes, then parse it as JSON.
- **Motion paths** are position `tweens` of straight `segment`s between absolute points.
- **Dials** are a `stategroup` with a `_pointer` and a `_face`, and `dragrotation` gives the turn (hundredths of a degree) and the pivot.
- It settled the arc and turn paths and the dial in B16, where the `.story` alone could not. Positions there are rounded to whole pixels, so expect differences of a fraction of a pixel.
- Never import from it, and never commit it: it is for checking only.

### 172. A `.story` question is an invisible object; its settings are in two places (B5 part D)
**What**: a freeform question (`freePickManyIntr`, `dragDropIntr`) is an object in the base layer's `shapeLst`, not drawn. It holds `intrProps` (score, attempts as a word, feedback layer GUIDs) and `choices` (`shpG`, and `matchShpG` for a drag target). Its feedback layers are `feedBackLayer`s beside the `sldLayer`s. A result slide's `rsltsIntr` names only its layers; its pass mark, timer and questions are in `story.xml` (`quizMgr/quizLst/quiz`, by `resultSldG`).
- A result button (`rsltBtn`) keeps its words on its states only, and its triggers are not `trig`s. Its `btnType` says what it does.
- Our question parts must be top-level base-layer objects, and `submit` must be a button object. Sample B submits from a shape, so `submit` stays null and the shape keeps its own Submit trigger.

### 171. On Windows, a rename can be refused for a moment: use `renameWithRetry`
**Issue**: Publishing builds beside its target and renames into place; saving does the same with its file. On Windows the rename fails with `EPERM`, `EACCES` or `EBUSY` while antivirus or the indexer has a new file open for a moment. In session 116, five publishing e2e tests failed this way on an idle machine.
**Rule**: rename with `renameWithRetry` (`apps/desktop/src/main/fs-retry.ts`), never `rename` from `node:fs/promises`, wherever the app moves a freshly written file or folder into place.

### 170. A `.story` part lists one media relationship per use, in order (B5 part C)
**What**: a slide's `.rels` has a media relationship for each use of a picture or sound, in the order the slide's XML uses them, with its sound, captions and thumbnails among them. So it is evidence for which file is which, not a rule: `media.ts` walks the uses and the list together and lets each use vote, and the votes only break ties left by size and elimination. Pairing a whole part by position failed (pitfall #167): the odd swap and extras break it.
- Storyline also stores **recompressed** pictures: a recorded `bytes` that no stored file has. Those were the bulk of the guesses.
- A picture with a recorded pixel size (`source="Pasted Image (WxH)"`) is left to the size check, which is surer than the votes.
- A scratch check of each picture's file against its object's proportions (in session 116's log) is a good test of any change here.

### 168. Matching `.story` media: thumbnails, ties and pasted pictures (B5 part B)
**What**: `media.ts` (with `import-file.ts`). The report's "matched to one of several identical-looking files" hid three different things on Sample A:
- **Slide thumbnails** (`thumbG`, `bytes="0"`) were matched against every picture on their slide. They are never imported, so they are not looked for.
- **n items sharing the same n same-sized files** (animation frames) all took the first. A part lists its relationships in the order it uses its media, so tied items are paired in that order. It was checked against the pictures themselves.
- **A pasted picture** has `bytes="0"` but `source="Pasted Image (1522x786)"`. `import-file.ts` takes its candidates out of the zip with the rest and keeps the one of that pixel size (`readImageSize`). Without a size, it takes the one fitting file no other item could be.
- `package.ts` keeps each media file's zip CRC-32: same size and CRC is the same bytes, which is no guess.
**How to check**: the scratch scripts that list the candidates of each guess are described in `logs/2026-11-24-session-115.md`. Run the sample import through `importStorylineFile` with `findMediaTools`, as the app does.

### 167. Reading `.story` files: what is not where it looks (B5)
**How**: `apps/desktop/src/main/import/storyline/`, with the format written up in `docs/briefs/B5-storyline-import.md`.
- **Media:** nothing says which `story/media/R….ext` file is which media item.
  - `media.ts` works it out: the files every using part lists, the type, the exact recorded `bytes`, and elimination. That resolves over 90%.
  - Never pair a whole part by order: extras (thumbnails, renders) sit in the middle of the lists. Only items already tied to the same files are paired by order (#168).
- **Slides' `layoutG`** is the layout's `internalG`, not its `g`.
- **`showMasterSp`** is false everywhere, even where master objects plainly show. Master and layout objects are always placed, without their placeholders.
- **Groups:** members sit in the same flat list as everything else, each with `parentG`. The group's `childLst` only names them (`<g>GUID</g>`).
  - Our groups cannot hold animated members, so such a group is unpicked and reported.
- **Built-in states:** triggers name states the object never defined (Hidden, Visited, Disabled) and expect them to exist. `stateFor` adds them.
- **Text:** an escaped XML document; `plain` holds the words.
  - Text with no colour takes the master's commonest `defaultFont` colour.
  - Font sizes are in points (×4/3 for stage pixels).
- **Fidelity checks:** `docProps/summary.xml` has a thumbnail of every slide (base64 PNG). Comparing them with the player's pictures is how fidelity was checked.
**Watch**:
- **The samples** are real courses Luke supplied in `samples/` (git-ignored). Never commit them, and keep notes vague about them.
- **Test files** are made by our code (`test-story.ts`).
- **Escapes:** writing `﻿` or ` ` in an edit can turn it into the literal character, which breaks a regex and trips `no-irregular-whitespace`. Build such regexes with `new RegExp('…\\uXXXX…')`.

### 166. Authoring traps the demo course hit (B4)
**How**:
- **Scrolling panel:** it scrolls through its inner object's whole frame, not its words. Size the inner text box to its content, or the learner scrolls into blank space.
- **Lightbox:** a lightbox already has the player's own Close, so a Close button on the slide makes two.
- **Message layers:** an overlay layer with `hideOtherLayers: false` stays up when another is shown. For mutually exclusive messages, make each one hide the others.
- **Object leaving with another:** to carry one object with another (the satellite with the rocket), give it the same path with `relativeStart: true` and run both from one trigger.
- **Matching drop boxes:** a tile dropped on a target covers the target's words. Leave targets empty and label them beside the box.
**Watch**: `apps/desktop/resources/templates/` ships in the installer. Anything put there is a built-in template for every user, and adds to the installer's size.

### 165. A canvas keeps the first kind of context it gives out (B3)
**Issue**: the 360° image's flat fallback drew nothing from `file://`. WebGL had been tried on the canvas first, so `getContext('2d')` was null.
**Solution**: `paint()` in `packages/player/src/panorama.ts` swaps in a fresh copy of the canvas before drawing flat.
**Watch**:
- Any fallback from WebGL to 2D needs a canvas WebGL never touched.
- Test what a canvas draws, not just which painter was chosen.
- From `file://` a drawn course picture taints the canvas, so "reading it back throws SecurityError" is the proof it was drawn (`e2e/panoramas.spec.ts`).

### 164. A packaged app checks the real update feed: give it a local one in tests
**Issue**: in a package (`app.isPackaged`), Help → Check for Updates asks the configured feed, this repository's GitHub releases. Session 111 ran `e2e/updates.spec.ts` against the package. Its first test expects a development build's answer, so it failed, and it most likely sent one request to github.com.
**Watch**:
- Never run `updates.spec.ts` against a package (`VEDRAOPUS_E2E_EXECUTABLE`).
- For any packaged test that may check for updates, pass `VEDRAOPUS_UPDATE_FEED=http://127.0.0.1:9/`, as `phase11-course.spec.ts` does.
- While the repository is private, installed copies cannot read its releases, so their update check reports an error.

### 163. What is past the slide is masked over, not clipped (B2)
**How**: View → Off the Slide (`view.offSlide`, Dim by default, Luke) draws `.stage-off-slide` over the slide. Its spread `box-shadow` is in the pasteboard's colour (`--bg`): half strength for Dim, solid for Hide. The objects themselves are untouched, so they are still picked and dragged by their off-slide parts, and the selection is drawn over the mask.
**Watch**:
- Do not clip `.stage-slide` (`overflow: hidden`) instead: objects off the slide could then no longer be grabbed to bring them back.
- The mask is `z-index: 1` in the page's stacking. Anything new drawn on the stage that must stay visible off the slide (like the motion paths at 4) needs a higher z-index.
- The pasteboard's colour comes from `body` (`--bg`). If the stage area ever gets a background of its own, the mask must use that colour.
- `e2e/pixels.ts` reads colours on screen without a PNG library.

### 162. In the editor, the stage's videos follow the timeline; Space plays it
**How**: `useTimelineSound` plays sound (a video's too) through hidden audio elements; the stage's `<video data-media-id>` is muted. `useTimelinePictures` (`renderer/timeline-sound.ts`) plays those videos while the timeline plays and the playhead is in their bar, kept within `DRIFT` of it, and shows the frame at the playhead when stopped or scrubbed. Before session 109 the picture never moved (Luke, alpha 1). Space, pressed and let go, plays or pauses the timeline (`Timeline.tsx`). It acts on release, because holding Space and dragging pans the stage: `Stage.tsx` sets `spaceKey.panned` (`renderer/space-key.ts`), and the release is then ignored. Space in fields and on buttons (`spaceBelongsTo`) is left to them.
**Watch**: Playwright's click puts the caret mid-text in a field, so press End before typing in a test. An mp4 becomes a WebM plus `<name> poster.png`. The Media list shows the poster as the video's thumbnail, not as an item of its own (`renderer/media-posters.ts`); the poster is still an ordinary asset in the project.

### 161. The preview scheme needs `stream: true` and byte ranges for video
**Issue**: Luke's video stopped in Preview. `vedraopus-preview:` answered each media request with the whole file and no `accept-ranges`, and the scheme was not registered with `stream: true`. Chromium then gives up on a longer video partway with `MEDIA_ERR_SRC_NOT_SUPPORTED` (error 4, "Format error"). A short clip played, so a test that watched 0.3 s passed on the broken build.
**Solution**: the scheme is registered `{ standard, secure, stream }`, and `main/preview.ts` answers `Range` with 206 and `content-range` (416 past the end) through `parseRange`, like the editor's project scheme (#148).
**Watch**: `e2e/preview-video.spec.ts` plays a 3 s 1280×720 VP9 file to its end and expects no error; it failed (error 4) before the fix. Any new scheme that serves media needs both.

### 160. Electron 45 crashes making a window with `titleBarOverlay` under `--ozone-platform=headless`
**Issue**: after B1, every Linux e2e in WSL failed at `app.firstWindow()`: "Target page, context or browser has been closed". The app died with SIGSEGV. A bare Electron script reproduces it: the overlay with headless crashes (exit 139), the overlay under xvfb (X11) is fine, and headless without the overlay is fine.
**Solution**: `drawsOverlay(platform, ozonePlatform)` in `main/title-bar.ts`: with no screen (`app.commandLine.getSwitchValue('ozone-platform') === 'headless'`) the window gets `titleBarStyle: 'hidden'` alone, and `app:setTitleBarColours` does nothing. On a real display, CI's xvfb included, the overlay is there.
**Watch**: the local Linux e2e (headless) cannot check the overlay; `title-bar.spec.ts` expects it only when `windowsHidden` is false. Before adding any other native window chrome, try it headless in WSL first: a crash there takes the whole Linux suite with it.

### 159. With the title bar hidden, Windows and Linux send no keys to the menu's shortcuts
**Issue**: B1 gave the window `titleBarStyle: 'hidden'` (our own bar, the system's buttons over its end). There is then no menu bar on Windows and Linux, and Ctrl+S, Ctrl+Z, Ctrl+M and every other menu shortcut silently stopped.
**Solution**: `main/accelerators.ts` matches each key press against the application menu's items in the main window's `before-input-event`, and runs the item (not on macOS, whose menu bar works as always). Letters and digits are matched by `input.code`, so another keyboard layout still works.
**Watch**: Playwright's `keyboard.press` never reaches menu shortcuts, with or without a menu bar. To test a shortcut, send the key through Electron (`webContents.sendInputEvent`) on Windows and Linux; on macOS only a real key press reaches the system menu. The menu itself opens from the hamburger with `Menu.popup`, which tests stub so nothing shows on the desktop.

### 158. Windows and macOS read H.264 through their own decoders: `vo-decode`
**How**: our helper beside ffmpeg (`apps/desktop/native/decoder/`, C with Media Foundation on Windows, Swift with AVFoundation on macOS; `scripts/build-decoder.sh`, run by `npm run fetch:ffmpeg`). `info` says what the system can read; `audio` writes a WAV; `video` streams YUV4MPEG2 at a constant frame rate into our ffmpeg. `normalise` uses it when `planFor` would refuse and `tools.decoder` is there (`main/media/system-decoder.ts`). Linux has no helper and still refuses.
**Watch**: Media Foundation pads frames (36 rows in a taller buffer, 1080 in 1088) and announces it with `MF_SOURCE_READERF_CURRENTMEDIATYPECHANGED` after the first frame. Read the layout again then, and take the plane height from the buffer's length, or the colour plane is read from the wrong place (a green picture). Both systems report rotation as degrees to turn clockwise (ffmpeg's `display_rotation 90` comes out 270), so `uprightFilter(270)` is `transpose=cclock`, checked against ffmpeg's own upright frame. YUV4MPEG2 carries no colour standard, so the WebM is tagged BT.709 from 720 lines (`colourArgs`). On macOS, `swiftc` warns that the synchronous track API is deprecated; it is kept so the helper runs on macOS 11.

### 157. Third-party notices come from the bundles' module graphs; nothing to list by hand
**How**: `scripts/third-party-notices.mjs` (a Vite plugin in the app's three bundles and the player's) writes `third-party-notices.json` beside each bundle: every npm package built in, with its licence files' text. Help → Third-Party Notices… shows them (`main/third-party.ts`), and every published course's `THIRD-PARTY-NOTICES.txt` carries the player's (`playerLibraries` in `main/publish.ts`). A new dependency is listed by the next build.
**Watch**: the packaged app ships no `node_modules` (everything is bundled), so this is the only place npm notices reach users. A package with no licence file gets its licence's standard text only for licences in `STANDARD_TEXT` (MIT now); add one there rather than writing text by hand. Every course now has one more file, which publish tests that count files must allow for. The source offer's archives: `npm run collect:sources` (`docs/releasing.md`); LibreOffice's pin there must follow `fetch-libreoffice.mjs` (a test holds them together).

### 156. Phase 11 review: check new features against the earlier phases' rules
**Issue**: each Phase 11 package passed its own tests, but four things only showed against earlier phases: `slides.import` was not in the undo/redo property test; main's new dialogs bypassed P10.4's string catalogue; the starter templates failed P10.2's contrast check (2.3 : 1); and the handout ignored P10.3's course language, printing an Arabic course left to right.
**Watch**: a new feature that makes a course, prints it or shows words must go through the earlier phases' rules: `t()` for editor words (main's dialogs too), `accessibilityIssues` on anything we ship as content, `isRightToLeft(project.player.labels.language)` for anything that lays out the course outside the player. A slide drawn inside a right-to-left page keeps `dir="ltr"`, or a stage-sized box scaled from its top left overflows out of its frame. Tests that watch for requests leaving the machine must let through the dev renderer's own server (`leavingRequests` in `e2e/launch.ts`).

### 155. In the macOS VM, finish the desktop user's first-login setup, or Electron and LibreOffice hang
**Issue**: after `wsm gui prewarm -n full`, every Electron e2e timed out and LibreOffice took over 120 s. Electron's main thread sat in `-[NSApplication finishLaunching]` waiting for `talagentd`, because the session was still in the per-user Setup Assistant (no Dock, no Finder). `app.whenReady()` never resolved; `--disable-gpu` and `ApplePersistenceIgnoreState` made no difference. A plain Swift `NSApplication` did launch, which hid the cause.
**Solution**: in the VM, as `dev`: `defaults write com.apple.SetupAssistant DidSee… -bool YES` for each first-login screen (plus `LastSeenCloudProductVersion` and the build), `killall "Setup Assistant"`, `killall talagentd`. Dock and Finder come up, and the e2e, WebKit and LibreOffice run from SSH. Script: `mac-finish-setup.sh` in session 103's log. `sample <pid> 3` is how to see where a Mac process is stuck.

### 154. Keys differ on macOS: select-all is Cmd, and WebKit's Tab skips links and buttons
**Issue**: e2e `press('Control+a')` moves to the start of the line on macOS, so typing "300" into a field holding "80" gave "30080". In WebKit on macOS a plain Tab skips native links and buttons (as Safari does unless "Press Tab to highlight each item" is on); elements with `tabindex=0` are still reached.
**Solution**: `ControlOrMeta+a` for select-all in every test. The player's a11y spec uses `nextKey(browserName)`, `Alt+Tab` for WebKit on macOS. `Control+k` in `freeform.spec.ts` is a recorded shortcut, not select-all, and stays.

### 153. ffmpeg is ours on every system, built from source; it has no H.264 or AAC
**How**: `npm run fetch:ffmpeg` runs `scripts/build-ffmpeg.sh <mac|linux|win>` (about ten minutes; pinned, checksummed sources; LGPL 2.1+; `--disable-autodetect`). macOS since session 103, Linux and Windows since session 105 (Windows cross-compiled in WSL with mingw-w64). Our ffmpeg refuses patented formats everywhere (`refusePatented: true`), naming the system; on Windows and macOS `vo-decode` reads them through the system instead (#158). It is packaged as `resources/ffmpeg`; CI caches `vendor/ffmpeg` by the script's hash.
**Watch**: no test can make an H.264/AAC sample: make samples in VP9/Opus, and use `fixtures/media/h264-aac.mp4` to test a refusal. ffprobe still names H.264 without a decoder for it. In the VM, WebKit decodes no WebM at all (`MEDIA_ERR_DECODE` for VP9 and VP8 alike, though `canPlayType` says "probably"); three WebKit video player tests fail there. Whether Safari on a real Mac plays our VP9 is unverified.

### 152. Updates are electron-updater behind our own wrapper, off until asked
**How**: `Updates` (`main/updates.ts`) wraps `autoUpdater`.
- Nothing downloads or installs unasked.
- Help → Check for Updates… always reports what it found; automatic checks (opt-in, `settings.updates.automatic`) speak only of an update.
- Beta sets `allowPrerelease`.
- It is active only when packaged, or when `VEDRAOPUS_UPDATE_FEED` gives a generic feed (the e2e serves one on localhost).

**Watch**:
- electron-updater appends `?noCache=…` to feed requests.
- `import electronUpdater from 'electron-updater'` (it is CommonJS), then `electronUpdater.autoUpdater`.
- The privacy e2e must stay green: no check at start unless the author turned automatic checks on.

### 151. Signing comes from the environment, and is proved with a throwaway certificate
**How**: `electron-builder.yml` signs Windows builds (SHA-256, timestamped) and macOS builds (hardened runtime, `signing/entitlements.mac.plist`, notarised when `APPLE_API_*` is set). It does so when `CSC_LINK`/`CSC_KEY_PASSWORD` are set; otherwise builds are unsigned. `npm run check:signing` makes a certificate with OpenSSL, packages with it offline (`ELECTRON_BUILDER_OFFLINE=true`: no timestamp request), checks `Get-AuthenticodeSignature`, and deletes the certificate. `docs/releasing.md` is the guide for a real release.
**Watch**:
- `build/` is git-ignored at the root, so nothing for packaging goes in `apps/desktop/build/`.
- electron-builder signs every `.exe` in `extraResources`, LibreOffice's included.
- Passing args with `shell: true` warns (DEP0190); give npm one command line.

### 150. The course video is the real player, ticked frame by frame
**How**: `video/export.ts` builds the course as Preview does and hosts it under its own token (`Previews.host`). It plays it in a hidden offscreen window (muted, sized with `setContentSize`), with `autoStart: false` and a clock main sets. Each frame it ticks, waits two animation frames, captures the stage box and pipes BGRA to ffmpeg. Sounds come from `videoSounds` and are mixed by ffmpeg (`adelay`, `amix`); the page's media never play.
**Watch**:
- Media that played would move timelines in real time (the engine follows a playing sound's time) and could be heard.
- A 1 × 1 ffmpeg crop fails on yuv420p; crop 2 × 2.
- The video is the same however fast the machine is, but a slow machine is slower to make it.

### 149. Crash reports stay on the machine, and nothing else leaves it
**How**: `keepCrashReports` in `settings.json` (off by default) is read before the app is ready. `crashReporter.start({ uploadToServer: false })` runs only when it is on. Help → Keep Crash Reports (a checkbox) and Show Crash Reports (the `crashDumps` folder). `e2e/privacy.spec.ts` proves both: a deliberate window crash leaves a report only when the setting is on; and a session of editing, previewing and publishing makes no `http(s)`, `ws` or `ftp` request.
**Watch**: the crash e2e stubs `shell.openPath`, so no file manager opens on the desktop. `webRequest.onBeforeRequest` takes one listener per session; the app uses none, so the test can add its own. Do not add telemetry, update checks or uploads without Luke (`AGENTS.md`).

### 148. Media are served as ranges, and huge pictures as scaled copies
**How**: the `vedraopus-asset` scheme streams from the file and answers `Range` (`range.ts`). `?fit=<px>` on a picture larger than that serves a copy made once by `nativeImage` into `<workspace>/previews/`. The renderer's `editorAssetUrl` adds `fit` (twice the stage's longer side) for pictures whose stored size is larger.
**Watch**: the published course never uses previews; only the editor's drawings do. A picture imported before its size was recorded (no `width`/`height` in its meta) is drawn from the file itself.

### 147. The performance budget is a test
**How**: `e2e/performance.spec.ts` opens a generated 200-slide course: under 3 s. It then drags a shape and types into a text box, timing frames with `requestAnimationFrame`: the median within one 60 Hz frame, the 95th percentile within two. The numbers are printed, and each session that changes the editor should note them.
**Watch**: the test checks the drag moved and the typing landed, or a broken gesture would measure an idle page. If CI's runners are slower, set their limits from what they measure; do not loosen this machine's.

### 146. PowerShell 5.1 mangles UTF-8 files and quoted arguments
**Issue**:
- `Get-Content -Raw` without `-Encoding utf8` reads UTF-8 files as the system code page, so `…` and `’` in a spec file became other characters, and its locators stopped matching. `Set-Content` writes them back wrong.
- A native command's argument containing double quotes (a PR body with "quoted words") is split apart, so `gh pr create --body` failed with "unknown argument".
**How**: read with `Get-Content -Raw -Encoding utf8` and write with `[IO.File]::WriteAllText`. Pass PR bodies with `--body-file`.

### 145. The handout prints the editor's own page
**How**: File → Export Handout… draws `.print-handout` (the `Handout` component) in the editor's page while its dialog is open. Main prints the window to PDF (`webContents.printToPDF`). `@media print` hides everything else with `visibility` (the handout is deep in the tree, so `display: none` on its ancestors would hide it too) and makes the page white.
**Word (part B):** main draws each slide's markup in one hidden offscreen window (`pictureSlides`, scripts off) and captures it. The window is held to the screen's size, so the slide is zoomed to fit, up to 2×. On headless Linux a window that is never shown stays 1 × 1 until `setContentSize` gives it a size, and every capture of it is 1 × 1. The trimmed LibreOffice cannot open `.docx` (it has no Writer); the full build in the study folder can, which is how the document was checked.
**Watch**: the export waits for the handout's images to load. An e2e can count a PDF's pages with `/Type /Page` (not `/Pages`), since Chromium writes page objects uncompressed. The Read tool shows a PDF's pages, which is how the layout was checked.

### 144. Importing slides: the model prepares, main copies media, one command applies
**How**: `prepareSlideImport(target, source, slideIds)` (model) returns copies with new ids, and the banks (for draw slides), masters, variables and media details they need, and what it dropped. The renderer asks main to copy the media files (`project:copySlideMedia`), allowed only from the file chosen last in `project:openSlideSource`. Then it runs `slides.import`, one undo step.
**Watch**:
- `cloneSlides` now maps every reference inside each copy (`remap` over the whole slide). Before session 92 it mapped only triggers and the question, so a duplicated result slide named the original's Passed and Failed layers, and the project was invalid.
- The import pairs old and new ids by walking each original beside its copy (`pairIds`), since `cloneSlides` keeps its map to itself.
- Variables are matched by name ignoring case, and only where the type is the same.
- A source's feedback master is never added; its layouts map to this project's feedback layouts by role.

### 143. Templates are project files in a folder
**How**: a template is an ordinary `.vedraopus` file. The author's own are in `<userData>/Templates`; the built-in ones are in `resources/templates` (packaged) or `apps/desktop/resources/templates` (development). `ProjectSessions.templates` holds both folders, set in `index.ts`. `template:list` reads each file's `project.json` only (`readContainerProject`). `template:open` unpacks into a new workspace, gives a new project id, and opens it unsaved with no source path. `template:saveCurrent` packs the session's project and workspace media to the folder without touching the session.
**Starters (part C):** the built-in starter templates are code in `starter-templates.ts`, built from the model's factories when listed or used (`builtin:<key>` paths). A format change reaches them with no regeneration; `starter-templates.test.ts` checks each is valid.
**Watch**: e2e runs get their own user data folder (`VEDRAOPUS_USER_DATA`), so each test starts with no templates of its own. `template:remove` deletes only through `isOwnTemplate`.

### 142. On Windows, run Vitest from `C:\`, never `c:\`
**Issue**: every Vitest suite failed at its first `describe` with "Cannot read properties of undefined (reading 'config')" (or "failed to find the current suite") once the Bash tool's working directory had become `c:\Users\…` (lower-case drive). Vitest then loads two copies of itself, one per spelling of the path.
**How**: run Vitest from PowerShell after `Set-Location C:\Users\lukeg\Repositories\project-eloquent`, or check the `RUN` line shows `C:/`. Nothing in the code or the cache is wrong; moving `node_modules/.vitest-cache` aside does not help.

### 141. LibreOffice draws what the PowerPoint reader cannot, from a deck of its own
**How**: `npm run fetch:libreoffice` (`scripts/fetch-libreoffice.mjs`) puts a trimmed LibreOffice 26.8.3 in `vendor/libreoffice/<os>-<arch>` (Linux, Windows and macOS). It checks the download's SHA-256 and unpacks it without installing (Windows `msiexec /a`; on Linux it reads each `.deb` itself; on macOS `hdiutil attach` and `ditto`). It copies all but the drop list, removes links left dangling, and checks that no kept library loads a dropped one (PE imports, ELF `DT_NEEDED`, Mach-O load commands). On macOS it re-signs the bundle ad hoc and checks `codesign --verify`. Then it draws `fixtures/libreoffice/smoke.pptx`.

The converter leaves a stand-in and a `PendingDrawing` for each chart, SmartArt, embedded object and picture in another format (on slides only). `importPowerPointFile` gives each a deck of its own (`drawingDeck`). It draws them in one run per group of about the same width (`widthGroups`, `drawDecks`: a transparent PNG two to three times the frame's width) and swaps the stand-ins.
**Watch**:
- A graphic frame's transform is `p:xfrm`, but its `off` and `ext` are DrawingML (`a:`). With `p:off`, LibreOffice draws an empty chart and says nothing.
- SmartArt's data names its drawing through the slide's relationships (`dsp:dataModelExt relId`), so keeping only the frame's own relationships loses the drawing.
- LibreOffice draws content it cannot read as nothing on a clear background: `isBlankPng` decides it was not drawn.
- Without `PixelWidth`, the PNG follows the screen's density: 2× on a Windows machine scaled 200 %, 1× on headless Linux. A test that passed on Windows failed in WSL for that reason.
- A LibreOffice run takes about 7 s to start in WSL, warm profile or not; group the work into few runs.
- `soffice.com` on Windows, `soffice` on Linux. Always pass `-env:UserInstallation=<file URL>` to a throwaway profile, so the author's own LibreOffice is neither used nor changed.
- The trimmed Windows build has the Visual C++ runtime in `program/`; Windows' own fonts are used, not LibreOffice's.
- An e2e that imports a deck must answer the close prompt (`message: [1]`): the new project is unsaved, and the app waits on the question.
- macOS (session 102): the lite VM image lacks AVFoundation, which LibreOffice links, so the work needs the `full` image (hide its window at once: `skills/macos-vm.md`). macOS keeps files compressed: `du` shows about half the size the script reports. 0xCAFEBABE starts both universal Mach-O files and Java classes, so the Mach-O reader runs only on macOS.
- The study's scripts (trial trims, the PE and ELF readers) are outside the repo, in `C:\Users\lukeg\vedraopus-libreoffice-work\` and `~/lo-work/` in WSL.

### 140. The PowerPoint reader is pure, in main, and tested on decks it builds itself
**How**: `apps/desktop/src/main/import/pptx/` holds the reader:
- `convertPptx(parts, { fileName, storePicture })` turns a deck's parts (by name) into a project and a report;
- `importPowerPointFile` reads the zip within limits and stores the pictures in the workspace;
- `ProjectSessions.importPowerPoint` opens the result unsaved.

XML is read with the model's `parseXml`, by local name (`one`, `all`, `path`, `attr` in `xml.ts`). Units are 9525 EMU a pixel and points times 4/3. Placeholders take their position from the layout, else the master, and their text defaults from the master's text styles. Tests build decks with `test-deck.ts` in the shape PowerPoint writes. No copy of PowerPoint is used, and nothing is taken from real decks.
**Watch**:
- `_rels/.rels` belongs to the package (part name `''`), not to a part.
- A slide id has two `id` attributes: use `relAttr` for `r:id`.
- A menu command sent before the window has drawn is lost: an e2e must wait for the Welcome screen first.
- Our line is drawn across the middle of its frame and turned, so a diagonal PowerPoint line becomes its diagonal's length, centred and rotated.
- Keys used through a lookup table look unused to the catalogue test: write `t('…')` calls out.
- **Masters (part B):** our master layer holds only the PowerPoint master's background. The master's own shapes are read afresh into each layout that does not hide them (`showMasterSp="0"`), as PowerPoint draws them. A layout gets its background, those shapes, its own shapes, then our title and content placeholders. A slide's title and body text boxes are marked as copies of them (`props.placeholder`). Render never draws a layout's placeholders under a slide, but draws everything on a master's layer, so placeholders must never go on a master's layer.
- **Motion (part C):** `motion.ts` lays PowerPoint's main sequence on our timeline as if every click came at once. Clicks go after everything before them; "with" starts with the previous effect; "after" starts at its end; delays are added. Entrances set `timing.start`, exits `timing.duration`. Only top-level objects are registered by their deck shape id (`ctx.register`), since only they may have animations. Media is two-step: the converter leaves a stand-in and a `PendingMedia`, and `importPowerPointFile` runs the file through `importAsset` (the media pipeline) and swaps the stand-in.

### 139. After a machine crash, check Git in both clones before anything else
**How**: the Windows machine stopped at 2026-11-21 19:26 (Luke saw a `HYPERVISOR_ERROR`; Kernel-Power 41, and no dump was written), during a WSL run. Files written in the seconds before it were left as zeros or empty:
- on Windows, `.git/refs/heads/check/phase-10` and its remote-tracking copy were zeroed. Every file then showed as "added" and `HEAD` would not resolve;
- in WSL, eleven object files from the last pull were empty;
- screenshots taken just before it were empty files.

The fix:
- **Windows:** write the pushed commit's id back into the ref files (`git ls-remote origin <branch>` gives it), then `git fsck --no-dangling`.
- **WSL:** move the empty object files aside (`find .git/objects -type f -empty`) into a quarantine folder, not deleting them, then `git fetch` and reset to the branch.

**Watch**: since the crash, a heartbeat runs hidden. `C:\Users\lukeg\vedraopus-crash-watch\heartbeat.ps1` writes CPU, free memory and the VM processes every 30 s to `heartbeat-<date>.log`, flushed to disk. Heavy steps (WSL runs, builds, test suites) are written to `steps.log` in the same folder, at their start and end. If it crashes again, read both first. Push often: what was pushed survived.

### 138. The editor's words come from the catalogue, looked up as they are drawn
**How**: `apps/desktop/src/shared/strings/` holds `en.ts` and `t()`, which main (the menu) and the renderer both use. `VEDRAOPUS_UI_LOCALE=qps-ploc` shows catalogue words as `⟦Pséüdö ·⟧`, so anything still written in a component stands out. Main reads it and the renderer gets it from `app.getInfo().uiLocale` before its first draw. `docs/development.md`, "Adding words to the editor", has the rules.
**Watch**: never call `t()` in a module-level constant, which is evaluated before `setLocale` (the ribbon's tab list was one). `strings.test.ts` fails on a key used but missing, and on a key unused. A key built from a template counts by its fixed start. Keep the English the same when moving a string, or the e2e tests that find it by name break.

### 137. A right-to-left course mirrors its frame, never its slide
**How**: `isRightToLeft(tag)` (model, `labels.ts`) goes by the primary subtag, unless a script subtag says otherwise. `applyLook` sets the player root's `dir`, so flex rows and the text view's grid run right to left. Render gives every `p` and `li` `dir="auto"`, so each paragraph runs and aligns by its own words, in any course. The editor's text uses `unicode-bidi: plaintext` for the same. The stage is placed absolutely and keeps the author's layout. The Player dialog's "Words for" chooser edits `labels.words` for any language that has some.
**Watch**: never put `dir="rtl"` on the stage or a slide: it would turn every unaligned English paragraph to the right. Leave direction to `dir="auto"`. The arrow keys are not swapped in a right-to-left course (Right is still the next slide).

### 136. Translation units have stable ids, and formatting goes out as numbered tags
**How**: `translationUnits(project)` (`packages/model/src/translation.ts`) gives every learner-facing text a unit, with an id path such as `object/<id>/text/2.0.0` (the paragraph's place in the document) or `label/next`. A unit's `source` is `Inline[]`: text, `{ open: n }` and `{ close: n }` round runs with the n-th distinct mark set, and `{ br: true }`. `applyTranslation(draft, units, language)` puts targets back into the same paragraph, rebuilding the marks from the numbers, and makes `language` the course's. The player words go into `labels.words[language]`. It is the `project.translate` command (one undo step). `writeXliff` and `readXliff` (`xliff.ts`) are XLIFF 1.2, with the model's own small XML reader. The Translation dialog works the result out on a copy first, because commands return nothing.
The two-column Word document (part B) is written and read in main (`apps/desktop/src/main/translation-document.ts`), with yazl, yauzl and the model's `parseXml`. Its table's header row is `Id`, the source language and the target language, and tags are `[1]…[/1]` and `[br]` (`taggedText`, `fromTaggedText`). One Import button takes XLIFF or a document; `project.openTranslation` returns `{ kind: 'xliff' | 'document' }`.
**Watch**: a unit is skipped when its source no longer matches the project: never apply over words the author changed after exporting. Model tests cannot use `node:fs`, since the model's tsconfig has no Node types: they import fixture JSON directly (`resolveJsonModule`). So a new fixture must be added to `FIXTURES` in `translation.test.ts`. Labels for `en` equal to the defaults are left out of `words`, so a round trip changes nothing.

### 135. The accessibility checker is the model's, with the course's own rules
**How**: `accessibilityIssues(project)` in `packages/model/src/a11y-check.ts` lists alt text, Tab order, contrast and caption problems for every scene and bank slide. It uses the course's rules: `courseName` (alt text, words, object name), `tabbableObjects`, and `questionObjects` for a question's answers. The right panel's Check tab (`AccessibilityCheck.tsx`) shows them by slide, and Show goes to the slide, the layer and the top-level object. The Format panel's Accessibility section (`format-a11y`) sets alt text and decoration for one selected object.
**Watch**: axe-core did not see the default button's 3.6 : 1, because the fill is SVG drawn behind the words. The model check measures it from the colours instead; trust it over axe for text on shapes. A wordless shape is not listed (most are panels), and duplicate Tab names count only on one overlay and the base beneath it, or every feedback layer's Continue is a clash. Escape does not clear the stage selection: e2e clicks empty stage.

### 134. The player's colours live in the model too; the text view and learner settings are the player's
**How**: `PLAYER_SCHEMES` in `packages/model/src/player-look.ts` holds each scheme's colours, and `player.css` must define the same; `a11y.spec.ts` reads the computed custom properties in each scheme (`auto` on a light and a dark system) and compares. `accentFor(accent, scheme)` is the accent a course shows: the author's when it reaches 3 : 1 against the scheme's background, chrome and sheets, else mixed toward the scheme's text colour. `applyLook` sets `--vo-accent-dark` and `--vo-accent-light` (and their text colours), and the stylesheet picks one per scheme as `--vo-accent`. The Player dialog says when a shade was changed (`accent-note`). The text view (`text-view.ts`): `slideTextBlocks` gives the slide's text in reading order from the model and the engine's view; `drawTextBlocks` draws it in the `aside` named "Slide text". The learner's settings (`settings.ts`) are kept in `localStorage` under the course's id, and anything refused or unknown falls back to the defaults.
**Watch**: change a scheme's colour in both places, or the browser test fails. Vitest returns CSS files empty, even with `?raw`: read the stylesheet in a browser test. The built stylesheet is minified (`#ffffff` becomes `#fff`). The text view updates in `draw` before the signature check, because the signature leaves out what is typed in fields. Settings are per course id, so a test that remounts a course must reuse the same project. At 320 pixels the Accessibility button is behind More. A disabled button cannot take focus: the single-slide test course's Next cannot show a focus ring.

### 133. The player moves focus itself on Tab inside the slide, and drags by keyboard through the engine
**How**: format 35 adds `slide.properties.focusOrder` (ids, or `null` for the layout). `tabOrder(slide)` in `packages/model/src/tab-order.ts` is the order: the author's list first, then the rest by layout (rows within 4 units, then left to right). The Slide panel's `TabOrder.tsx` edits it with "Move … earlier/later" buttons. In a course, `tabStops()` in `player.ts` groups the stage's focusable elements by their outermost `[data-object-id]` and sorts them the same way, and `tabKey` moves focus among them; at the ends it focuses the next or previous focusable element outside the stage. Tabbing in from outside sets `tabbingIn`, and the stage's `focusin` sends focus to the first or last stop. Keyboard dragging (`dragKey`): Space or Enter picks up, the arrows go through `engine.dropTargets(id)` (10 px, Shift 1 px, when there are none), Space or Enter drops with `engine.drop`, and Escape or Tab puts it back, so triggers and marking are the pointer's own.
**Watch**: the root's keydown runs `dragKey`, then `tabKey`, before `sliders.key`; a key one of them takes must stop there. The drag hint is `.vo-player-sr-only`, not a second `.vo-player-announcer`; tests find the announcer as `.vo-player-announcer`. Removing, ungrouping or removing a layer prunes `focusOrder` (`pruneFocusOrder`), or validation fails on the next load. In e2e, the list's rows carry `data-tab-object`, because every new button is named "Button".

### 132. A course's objects get their roles in `semantics.ts`; axe-core checks every fixture
**How**: `packages/player/src/semantics.ts` decides each object's role, name and decoration (`semanticsOf`, `clickableObjects`), and `applySemantics` sets them after every draw, from `markObjects`:
- buttons, and anything a click, double-click or right-click trigger names, are `role="button"`, named by alt text, words or name, reached with Tab (`data-press`, so Space and Enter press them), and `aria-disabled` when disabled;
- a decorative object is `aria-hidden`;
- a wordless shape with alt text is `role="img"`;
- a group with alt text is a named group.

Types with semantics of their own (choices, fields, controls, hotspots, markers, web objects, graphics, tables, 360° images, media) are left alone. The root is `role="region"`, not `application`, so screen readers keep their reading keys. The stage is a region named by the slide's title. The footer is a named group. A "Skip to slide" link is the first Tab stop. `.vo-player-announcer`, a polite status region, says each new slide's title, each layer shown and a question's result. Focus on slide objects is a white ring inside a dark one. `packages/player/browser/a11y.spec.ts` runs axe-core (a dev dependency; WCAG 2.0 to 2.2, A and AA) on every slide of every fixture and of an all-types course.
**Watch**: there are now two `status` regions when the course has ended, so tests find the notice by its words. Shapes start decorative (`visibleToAssistiveTech: false`), so `applySemantics` must skip a question's answer objects (`questionObjects`, all but the prompt and Submit) and draggable objects, or it hides radio buttons. A focusable slide button takes focus when pressed: when the slide it was on goes, the player moves focus to the new slide's region (`stage.focus`), or the course's keys stop reaching it. axe-core does not see keyboard reach or announcements: those have their own tests in the same spec.

### 131. A group's view carries what its parts need drawn
**How**: `ObjectView.parts` is `Record<id, ObjectPart>`: state and visibility, plus a field's `value` and `options`, a slider's or dial's `controlValue`, and a 360° image's `visitedSpots`. The player's `liveParts` lists top-level objects and those parts, and finds each part's element inside its group's. `drawFields`, `sliders.sync` and `panoramas.sync` take that list, so they work inside groups (Phase 9 review).
**Watch**: a new object type that the player draws live (beyond its state) must add its data to `ObjectPart` too, or it will not work inside a group. Paste uses `assetsOfObject` (model, `find.ts`) to leave out objects whose media the receiving project lacks: a new type with an asset must be listed there.

### 130. The ribbon's command row scrolls by itself; its popovers are fixed to the window
**How**: `.ribbon-commands` has `overflow-x: auto` and no visible scrollbar (`scrollbar-width: none`). The wheel scrolls it sideways, as do Tab and a command scrolling into view. The ribbon is 76 pixels high on every tab, so the stage's fit does not change from tab to tab. `IconPopover`, `CommandMenu` and `ShapeGallery` open at `popupPlace(container)`: `position: fixed` under the button, and leftwards from its right side near the window's right edge. `useDismiss`'s `follow` moves an open one with its button when the row scrolls.
**Watch**: a wider ribbon used to make the *page* wider than a narrow window, and Playwright's click on a far command scrolled the whole editor sideways. Headless Linux windows are 960 pixels wide and ignore `setSize`, which is where it showed (Phase 9 review, session 75). Do not close a popover on the row's scroll event: Playwright scrolls a button into view before clicking it, and the scroll event arrives after the menu has opened.

### 129. Screen recording: main hands the chosen source to one capture, and tests never capture
**How**: Insert → Screen Recording… (`ScreenRecordDialog`) lists sources through `screen:sources` (`desktopCapturer`, 320 × 180 pictures, shown in the dialog only) and sends the author's choice with `screen:choose`. `main/screen-capture.ts` keeps it, and the editor session's `setDisplayMediaRequestHandler` gives it to the next `getDisplayMedia` from the editor's own frame, once; anything else gets `callback(null)`, and Preview's session always refuses. The dialog counts 3 seconds, records with MediaRecorder (VP9 or VP8, Opus when narration is on), stops at 10 minutes, plays the take back, and `project:storeScreenRecording` puts it through the pipeline (`storeRecording(…, 'video')`: WebM with a poster, at most 500 MB), then `stage.insertVideo`. No saved-format change.
**Watch**: the e2e must not record the real screen. It replaces main's `screen:sources` and `screen:choose` handlers with `app.evaluate(({ ipcMain }) => …)` (`removeHandler`, then `handle`), and `navigator.mediaDevices.getDisplayMedia` in the page with a canvas `captureStream`. So the real handler path (Electron's display-media request) is covered only by `screen-capture.test.ts`, not end to end. The permission handler still refuses screen and camera `media` requests; capture goes through the display-media handler alone.

### 128. A 360° image draws a sphere with WebGL, or pans flat where WebGL may not read the picture
**How**: format 34 adds `panorama` objects (`asset`, `mode` free or guided, `start { yaw, pitch, fov }`, `spots` with ids of their own, kind `marker` or `hotspot`) and the events `spotClicked` and `panoramaVisited`. Changing `props.spots` through `object.update` checks new spot ids and removes triggers waiting for removed ones; `renewObjectIds` renews spot ids. The engine's `openSpot` marks a spot visited (`rt.spots`, saved as the slide's `p`), emits `spotClicked`, and `panoramaVisited` once when the last is opened; the view's `visitedSpots` lists them. Render: in a course a `.vo-panorama` (focusable, its start in `data-*`) with a canvas and a button per spot; elsewhere the whole picture flat with dots (`panoramaPoint`, numbered with `mediaMarkers`). `packages/player/src/panorama.ts` draws, places spots (`projectSpot` for the sphere, `projectFlat` for the flat pan), turns the view by drag, keys and wheel, opens markers' labels and the guided Previous and Next (label keys `spotPrevious`, `spotNext`). The editor: Insert → 360° Image…, the Format panel's `PanoramaFormat`, and double-clicking the flat picture adds a spot there (`panoramaDirection`).
**Watch**: from `file://`, Chromium will not let WebGL read the picture (another origin): `texImage2D` throws and the course pans flat. The e2e checks that. Served (an LMS, a web server), it draws the sphere. The view's `data-painter` says which. The player browser tests use a data-URL SVG picture, which WebGL may read, and turn WebGL off with an init script to test the flat pan.

### 127. A table is one object; its cells are edited one at a time over the stage
**How**: format 33 adds `table` objects: `columns` (shares), `rows` (`height` share and one `{ text, fill }` cell per column, checked in validate.ts), header row and column, header fill and text colour, `bandFill`, border and padding. `packages/model/src/table.ts` has the pure helpers (`withRowAdded`, `withRowRemoved`, `withColumnAdded`, `withColumnRemoved`, `withCell`, `parseShares`, `tableLayout`); the editor saves their result with `object.update` (`props.columns` and `props.rows` replace). Render draws a real `<table>` (`table-layout: fixed`, `colgroup` widths, `th scope`), each cell's text by `renderTextBlock`, whose new `color` option gives header text its colour; `col` is a void tag in `toMarkup`. `forEachRichText` visits cells, so variable renames and usage count them. In the editor, double-click a cell: the store's `editingCell` says which, `TextEditor` sits over `cellFrame`, `toReact`'s `hideCell` hides only that cell's text, and the commit replaces that one cell in the table as it is then. The Format panel's `TableFormat` picks a row and column for inserting, deleting and the cell fill.
**Watch**: in Playwright, `selectOption('3')` on the row picker matched the option *labelled* 3 (index 2), not value 3: pick by `{ label }`. Text formatting from the ribbon without a cell being edited does not reach a table's cells.

### 126. The icons and illustrations library is generated data, and a graphic holds its own drawing
**How**: format 32 adds `graphic` objects: `library` (`lucide` or `openDoodles`), `key`, `viewBox`, `nodes` (a tree of `g`, `path`, `circle`, `ellipse`, `rect`, `line`, `polyline`, `polygon`, at most 5,000), `ink`, `accent` and `strokeWidth`. `graphicAttrsSchema` allows only geometry, paint and line-style attributes, each by pattern; a paint is `ink`, `accent`, `none` or a hex colour (`GRAPHIC_PAINT`). Render draws an inline SVG (`xMidYMid meet`), `role="img"` named by the alt text, or `aria-hidden` when decorative. The library is `apps/desktop/src/renderer/library/lucide.json` and `open-doodles.json`, made by `scripts/build-library.mjs` from pinned npm tarballs (SHA-512 checked); the doodles are read with the TypeScript parser, never run. `loadLibrary` imports them with `?raw` only when Insert → Icons… first opens. Licences: `apps/desktop/resources/licences/`, shipped by electron-builder's top-level `extraResources`; `docs/licences.md`. A published course that uses a set carries its notice in `THIRD-PARTY-NOTICES.txt` (Luke, session 76). `main/notices.ts` reads them for Publish and Preview; `publishWeb`'s `notices` option; `graphicLibraries` and `noticesText` in publish.
**Watch**: do not add either package as an npm dependency: `react-open-doodles` wants React 16, and `--legacy-peer-deps` dropped the Windows installer's optional packages from the lockfile. The data files are in `.prettierignore`; prettier would spread them over 90,000 lines. Renderer unit tests cannot use `node:fs`; import data with `?raw`. A script that runs code from a downloaded package was refused by the tool's safety check: parse it instead.

### 125. Dragging any object, and intersections, run on the drag tiles' calls
**How**: format 31 gives every object `drag: { returnToStart } | null` (top-level only) and adds the events `draggedOver` / `droppedOn` (object, target) and `intersects` / `stopsIntersecting` (object, other). The engine's `carry` and `drop` take a draggable object that is not a question's tile (`freeObject`): its view says `draggable`, so the player's existing pointer dragging carries it. The object under its middle (`objectUnder`: top-level, shown, a group as a whole) shows Drag Over and gets the events; a drop sets its offset in `rt.offsets`, so it is saved in `m` and resumed as a motion path's end is. Intersections are checked at the start of every `flush` (`checkIntersections`), only for the pairs triggers name, with boxes where they are drawn (`boxOf`: paths, drops, placing, or the carried position); a slide's first check only notes what overlaps. The engine emits `objectsIntersect` / `objectsSeparate` with the pair in sorted order; `listensFor` matches either order.
**Watch**: only objects that the dragged object's `draggedOver` and `droppedOn` triggers name are targets (Luke, session 76): `objectUnder` ignores the rest, so a large object drawn above a target cannot catch the drop. A change a trigger makes (hiding an object) is noticed at the next flush, usually the next tick, not inside the same cascade, so two triggers cannot loop through intersections. Boxes ignore rotation. Dragging is pointer and touch only; keyboard moving is P10's.

### 124. Web objects: sandboxed, and the app itself never loads an address
**How**: format 30 adds `web` objects: `source` is `{ kind: 'url', url }` (http or https, `WEB_URL`) or `{ kind: 'folder', files: Record<path, hash>, entry }` (paths by `WEB_PATH`); `display` is inline or window. Render gives a course a frame with `sandbox="allow-scripts allow-forms allow-popups"` (never `allow-same-origin`) or, for a window, a `.vo-web-open` button the player opens with `noopener`. A folder's `src` comes from `context.webUrl`; the player encodes each path part and defaults to `web/<id>/`; the published `index.html` passes `content/web/<id>/`. `publishWeb` writes folders there, and not again under `content/assets/` unless something else uses a file; SCORM manifests list them. The editor and Preview never load an address: render shows a placeholder, and in Preview (`publishWeb({ preview: true })` → `remoteWeb: false`) it has an "Open in browser" button that Preview's window-open handler sends to the system browser. Folders are copied in by `main/project/web-folder.ts` (`project:importWebFolder`), at most 2,000 files and 200 MB, starting at `index.html` or another top-level page, and are hidden from the Media panel.
**Watch**: opened straight from disk (`file://`), Chromium does not let a sandboxed page load its own other files: a folder page's separate scripts run only when the course is served (an LMS, a web server, Preview). Browser tests refuse every address but 127.0.0.1 (`page.route`), so nothing leaves the machine.

### 123. A scrolling panel is a group with `scroll: { height }`
**How**: format 29 gives every group `scroll: { height } | null`. Render draws a scrolling group as a window, its frame's width and `min(height, frame.height)` high (`overflow-y: auto` in a course, `hidden` in thumbnails), around its content at full height, with the children in a layer moved back by the group's position, as they keep stage coordinates. With `mediaMarkers` (the editor) it draws everything plus a dashed "Scroll window". In a course the window is a focusable region; the player leaves Up, Down, Page Up and Down, Home and End to the browser while it has focus. `redraw` keeps `scrollTop` when a part's state changes. Insert → Scrolling Panel groups the selection with a window half its height.
**Watch**: the window is clamped at draw time, not validated against the group's frame, because the editor re-boxes a group's frame whenever its children move. `ObjectChanges` has `scroll` for groups. After a fresh start no slide is chosen, so an e2e must click one before Select All.

### 122. Sliders and dials: values snap to steps; the variable follows each step
**How**: format 28 adds `slider` and `dial` objects (range, step, initial, a number variable, two colours; a slider's orientation) and the `controlMoves` event. `snapToStep` (model) keeps a value in range and a whole number of steps from the least, clearing floating-point dust both before rounding the step count (0.35 / 0.1) and after. `engine.moveControl` writes a bound variable at each new step, then raises `controlMoves`; unbound controls keep `rt.controls`. The view's `controlValue` comes from the variable when bound, so a trigger moves the control. In a course a slider is an `<input type="range">`; a dial is our SVG with `role="slider"`, and `packages/player/src/controls.ts` drags it (`dialValue`: angle from straight up, the bottom gap to the nearer end) and keys it (`keyedValue`).
**Watch**: the player's own Volume control (P8.1) is a slider named "Volume", so tests find a course's slider inside `.vo-player-stage`. Inside `player.ts`'s key handler a local `controls` (the slide's player buttons) already exists; the module is `sliders` there. New visual references are made in WSL with `--update-snapshots=missing` and copied to Windows to commit.

### 121. Checkboxes and radio buttons are choice objects outside questions
**How**: P9.3 adds no object type: `createCheckboxObject` is a square choice with no button set, and `createRadioObject` a round one whose `buttonSet` is its group. Insert → Data Entry → Radio Button joins the group of a selected radio, else names a new `Group n`. The engine's §5 rules already toggle `selected` and keep one per button set. The player's `markChoices` now makes every choice on a slide a checkbox or radio (`aria-checked`, tab order, Space and Enter), not only a question's. Arrow keys move along a radio group (`data-group`) and select, instead of changing slides.
**Watch**: inserted objects cascade from the middle of the stage, so in an e2e the later ones overlap the earlier, and a centre click hangs on "intercepts pointer events". Click a clear corner, or move them first. Starting checked is `initialState: 'selected'`; the engine unchecks it on the first click, which `checkboxes.test.ts` proves.

### 120. Data-entry fields write their variable when focus leaves
**How**: format 27 gives text entries `props.variable` (a text variable, or a number variable for a numeric field) and `min`/`max` (numeric only). The engine's view shows a bound field's variable unless the learner is typing in it (`rt.inputs`). `engine.blur(id)`, which the player calls on `focusout` (and Enter in a one-line field causes), writes the variable (`fieldValue`: numbers read locale-neutrally, blank as 0, clamped, words refused), forgets the typed text (except for a question's own fields), then raises `controlLosesFocus`. `takeInput` now takes fields on any layer. `variable.update` (type) and `variable.remove` unbind fields that no longer match (`unbindFields`).
**Watch**: `eachSavedObject` in `migrations.ts` does not walk question banks; migrations from 26 on use `eachSavedObjectV27`, which does. The property test's `variableRename` step gave every variable a number default; with text variables about (`fieldBind`) it now gives one only to number variables.

### 119. Browser-suite failures need a baseline check before being called regressions
**Issue**: Windows has no Playwright WebKit executable, so the player, LMS and visual WebKit projects cannot launch there. WSL has WebKit but the player's `video.spec.ts:234` timing case still fails (`playhead` moves 0 after `playbackRate = 0.5`). On Windows, the Firefox media-complete case `audio.spec.ts:149` also failed during the rename checks, at different points on different runs.
**How**: use WSL for WebKit coverage and record its one known failure instead of loosening the assertion. For any other media failure, run the same spec from a clean worktree at the previous master commit before attributing it to the change; `audio.spec.ts:149` failed the same way on untouched `c26e496`.

### 116. Where Phase 8 features meet: preview scope, banks, lightboxes and the Preview window
**How**: the Phase 8 review found four gaps between packages, each now tested:
- `scopeProject` (Preview → This Slide) clears menu entries and lightbox tabs for slides it leaves out, for a bank question too (`playerWithout`).
- `slide.move` from a scene into a bank treats the slide as leaving the course: other slides' jumps and lightboxes to it go, and so do branches, results, menu entries and tabs (`forgetResultsOf`). Its own triggers stay.
- During a lightbox the menu marks the slide under it, and focus moves to the lightbox's Close (and back to the player on closing).
- The Preview window opens a course file (Resources, Open a file) with `shell.openPath` on the project's own copy, only for its own `content/assets/<hash>.<ext>` of a resource type (`previewFile`).

**Watch**: any new reference from the player settings to a slide must be cleared in all three places: `forgetResultsOf` (removal and moves to banks), `scopeProject`, and validation.

### 115. Plan 4.2's last actions: restart and exit are the engine's and the player's
**How**: `restartCourse` (P8.6) is `engine.restart()`: it leaves the slide, clears variables, slides seen, memory, answers, results, timers and review, draws again, and enters the first slide. `completed` and `elapsed` stay. `exitCourse`, `printSlide`, `openFile` and `setFocus` raise the events `exitCourse`, `print`, `openFile` and `focus` for the player. `sendEmail` raises `openUrl` with a `mailto:` link, its `%Variable%`s filled in. `seekTimeline` shares `seekLayer` with `engine.seek`. The player's exit calls `options.onExit` (`startCourse` gives it: `finish()`, then cmi5's return address), then `window.close()`, then shows `courseEnded` over an inert frame.
**Watch**: publishing writes the publish settings into the project, so an e2e that publishes and then closes the app must answer the "save changes?" prompt (`message: [1]`).

### 114. The compact frame, swipes and the rotation hint are the player's, not the project's
**How**: `packages/player/src/responsive.ts` (P8.5): a ResizeObserver on the root sets `data-compact` (below 640 px) and `data-orientation`; `attachResponsive` turns touch swipes (`swipeOf`: 60 px, more than twice as far across as down, within 600 ms) into Next and Previous, by the same rules as the arrow keys. When compact, the footer's extras (`.vo-player-extra`: everything from the frame but Submit) hide behind More. The viewport has `touch-action: pan-y pinch-zoom`.
**Watch**: an overlay given `width: 100%` needs `box-sizing: border-box`, or its padding pushes it past a phone's edge (the menu was 399 px in a 375 px viewport). A swipe that starts on a drag tile, a field or a frame panel is ignored (`ownsPointer`). An e2e that publishes without saving must answer the close prompt (`message: [1]`), or `app.close()` waits for ever.

### 113. A lightbox sets the current slide aside, frozen, and plays another as `current`
**How**: the engine keeps the slide under a lightbox in `under` (P8.4); only `current`, the lightbox, ticks and runs triggers, so the slide under it is untouched, as plan section 5 asks. `closeLightbox` leaves the lightbox (saving it per its revisit setting) and puts `under` back as `current` with no new `timeline starts`. `goTo` closes a lightbox first, so every jump (trigger, menu, branch) leaves from the slide under it. `view.lightbox` says one is open; `view.slideIndex` and the saved session's `s` are the slide under it. The player clones the slide under it into `.vo-player-lightbox-under` when the lightbox opens, and draws the lightbox at 80% of the stage.
**Watch**: `slide.setDraw` refuses a slide that opens as a lightbox (`opensAsLightbox`); the property test found that a draw made of a lightbox's slide left the project invalid. A trigger action that opens a slide is a reference to it (`triggerReferences`), so deleting the slide deletes the trigger, as for jumps.

### 112. The player's look and words: `labelText` for every word, CSS variables for every colour
**How**: `project.player.look` and `project.player.labels` (format 22). The player calls `applyLook` (`packages/player/src/look.ts`) on its root and on the resume prompt: `data-scheme`, `data-controls`, `data-menu-side`, `--vo-accent`, `--vo-accent-text`, `--vo-font` and `lang`. `player.css` takes every frame colour from variables (`--vo-bg`, `--vo-chrome`, `--vo-control`, `--vo-sheet-bg`…), with a light set and `prefers-color-scheme` for `auto`. Every word the player shows comes from `labelText(labels, key, values)`; the English is `DEFAULT_LABELS` in `packages/model/src/labels.ts`. Presets are `Settings.playerPresets` in `settings.json`, made with `presetOf` and applied with `withPreset`.
**Watch**: a new word in the player needs a new label key, or it will not follow the course's language. A new colour in `player.css` must be a variable with a light value too. `textOnAccent` prefers white when it reaches 4.5:1 (the default blue is 4.55 with white, 4.62 with black).

### 111. The player's tabs: resources, glossary, notes, and custom tabs that fire triggers
**How**: `project.player.tabs` (format 21). A built-in tab shows only when switched on and filled (`visibleTabs` in `packages/player/src/tabs.ts`); Notes shows when any slide has notes. A custom tab fires the `playerTab` event for the current slide's triggers (`engine.playerTab`); `project.setPlayer` deletes the triggers of a custom tab it removes. Links must match `RESOURCE_URL` (http, https, mailto). Resource files come in through `project:importFiles`, whose allow-list (`RESOURCE_TYPES` in `main/project/assets.ts`) is documents and pictures, never HTML or SVG. Slide notes are edited as plain text (`notesFromText` / `notesText`), a paragraph a line.
**Watch**: `createId` takes only the prefixes in `IdPrefix`; P8.2 added `tab`, `res` and `term`. Escape closes an open tab panel before the player's other keys see it. Player unit tests that need a DOM use `// @vitest-environment happy-dom` (there is no jsdom).

### 110. The player frame is `project.player`; speed is the player's clock, volume and rate are the soundboard's
**How**: `project.player` (format 20) holds the frame's settings; `project.setPlayer` merges a partial record at the top level, so pass a whole `menu` or `controls` object. `menu.entries` holds only what the author changed (an entry back to the slide's own title and shown is dropped) and may name only scene slides; deleting a slide drops its entry (`forgetResultsOf`). In the course, `packages/player/src/frame.ts` builds the menu, seekbar and controls; navigation limits apply to the menu only. Speed is `speedClock` wrapped round the player's clock, and the soundboard's `setRate`; volume is `setLevel`, times each media's own.
**Watch**: set an element's `playbackRate` only when the learner's speed changes (`rateApplied`): setting it every frame undoes a video's own speed control and makes Firefox stutter. The Player dialog names its fields by slide number ("Menu title for slide 2"), because new slides are all "Untitled Slide". The menu button toggles: a test that clicks it again while the menu is open closes it.

## Evolution Log

### 2026-11-23 - Release work: H.264 through the system's decoders (session 107)
- R3: `vo-decode` (Media Foundation, AVFoundation) decodes on Windows and macOS, our ffmpeg encodes WebM (#158). Linux refuses as before.

### 2026-11-23 - Release work: our ffmpeg everywhere, notices and the source offer (sessions 105, 106)
- R1: `scripts/build-ffmpeg.sh` builds our minimal LGPL ffmpeg on Linux, Windows (cross, in WSL) and macOS; BtbN's builds retired; patented formats refused on every system (#153).
- R2: Help → Third-Party Notices…; npm notices collected from the bundles (#157); courses carry their player's notices; `npm run collect:sources` and `docs/releasing.md` for the source offer.

### 2026-11-23 - Review of Phase 11 (session 104)
- Found and fixed (#156): `slides.import` in the undo/redo property test; main's Phase 11 dialogs through the string catalogue; the starter templates' contrast; the handout's language and direction (PDF and Word).
- `e2e/phase11-course.spec.ts`: template, PowerPoint, imported slides, Arabic, saved and reopened, handout, video, Preview, published, nothing sent. The plan is now built end to end.

### 2026-11-23 - macOS feature-ready (session 103)
- Our own LGPL ffmpeg for macOS (#153), packaged in the app; patented formats refused on macOS as on Linux.
- The macOS VM's desktop session finished (#155): the Electron e2e (159 of 166 first time, the test fixes after), LMS, visual and the player suites ran on macOS for the first time. Keys differ there (#154).
- A real `say` test on macOS. Open: Safari and VP9 on a real Mac; the 200-slide open time in the VM (5.1 s).

### 2026-11-23 - LibreOffice for macOS (P11.1 part E)
- `npm run fetch:libreoffice` on macOS: the dmg unpacked, trimmed (715 MB of 1,450 MB), link-checked, re-signed ad hoc and smoke-tested in the headless VM (#141).

### 2026-11-23 - Opt-in updates (P11.4 part B)
- Help → Check for Updates…, automatic checks (off by default), Stable and Beta channels, GitHub releases as the feed; P11.4 ticked (#152).

### 2026-11-22 - Signing-ready (P11.4 part A)
- Windows and macOS signing from environment variables, a throwaway-certificate check, and `docs/releasing.md` (#151).

### 2026-11-22 - Course video (P11.3 part C)
- File → Export Video…: the course played straight through, frame by frame, into WebM (VP9, Opus); P11.3 ticked (#150).

### 2026-11-22 - Crash reports and no telemetry (P11.5 part C)
- Opt-in crash reports kept on this machine, and an e2e proving no request leaves it; P11.5 ticked (#149).

### 2026-11-22 - Large media (P11.5 part B)
- Byte ranges for media, scaled copies of huge pictures for the editor, and a failed save reported (#148).

### 2026-11-22 - Performance budget (P11.5 part A)
- The budget as an e2e: 200 slides open in about 0.6 s, and dragging and typing hold 60 fps on Windows and Linux (#147).

### 2026-11-22 - Handout as Word (P11.3 part B)
- Export Word…: a .docx of slide pictures (drawn offscreen) with headings and notes, or three a page with lines (#145).

### 2026-11-22 - Handout as PDF (P11.3 part A)
- File → Export Handout…: a PDF of each slide with its notes, or three a page with lines, printed from the editor's own page (#145). PowerShell encoding and quoting (#146).

### 2026-11-22 - Templates, part C (P11.2)
- Four starter templates of our own design (blank, short course, branching scenario, quiz), made by code; P11.2 ticked (#143).

### 2026-11-22 - Templates, part B (P11.2)
- File → Import Slides…: slides from another project or template with their masters, variables, banks and media, as one step (#144). Duplicating a result slide no longer leaves it naming the original's layers.

### 2026-11-22 - Templates, part A (P11.2)
- File → Save as Template… and New from Template…, the template chooser with Browse…, and the templates folder (#143).

### 2026-11-22 - PowerPoint import, part D (P11.1)
- `npm run fetch:libreoffice`: LibreOffice trimmed to what the import needs (Windows 402 MB of 1,605 MB; Linux 365 MB of 731 MB), link-checked and smoke-tested; charts, SmartArt, embedded objects and pictures in other formats drawn as pictures (#141). Vitest and the lower-case drive (#142).

### 2026-11-22 - PowerPoint import, part C (P11.1)
- Slide transitions, the animation sequence on the timeline, motion paths, and sound and video through the media pipeline (#140).

### 2026-11-22 - PowerPoint import, part B (P11.1)
- The deck's masters and layouts become ours, with their placeholders and shapes; slides use their layouts; slide, layout and master backgrounds (#140).

### 2026-11-22 - PowerPoint import, part A (P11.1)
- File → Import PowerPoint…: slides, theme, text, shapes, lines, pictures, tables, groups and notes into a new project, with a report of what did not come across as it was (#140).

### 2026-11-22 - Phase 10 review
- Translation in the undo property test; the Tab order named as learners hear it; the text view's lines in their own direction; the accessibility panel's rows; the Phase 10 e2e; 18 screenshots. A machine crash during the review and its recovery, with a heartbeat and step log since (#139).

### 2026-11-21 - The editor's string catalogue (P10.4); Phase 10 built
- `t()` and the English catalogue for the menu, Welcome screen, top bar, ribbon tabs, Home and Insert commands and right panel tabs; the `qps-ploc` pseudo-locale (#138).

### 2026-11-21 - Translation, part C (P10.3); P10.3 built
- Right-to-left courses run the frame right to left; every paragraph takes its own words' direction; the Player dialog edits the words of any language (#137).

### 2026-11-21 - Translation, part B (P10.3)
- Export a two-column Word document (id, source, translation) and import it back; Word's split runs and tracked changes are read as Word means them (#136).

### 2026-11-21 - Translation, part A (P10.3)
- Every learner-facing text as translation units; XLIFF 1.2 export and import from File → Translation… (or Design → Translation…), as one undo step, with changed and missing units skipped (#136).

### 2026-11-21 - The accessibility checker (P10.2)
- The right panel's Check tab: alt text, Tab order, contrast and captions, by slide, with Show; the Format panel's alt text and Decorative (#135).

### 2026-11-21 - Accessibility, part C (P10.1); P10.1 built
- The text view beside the slide, at 100 to 200 %, reflowing at 320 pixels; the accessibility panel's settings remembered per course; the player's colours tested for contrast, with a faint accent strengthened and the Player dialog saying so (#134).

### 2026-11-21 - Accessibility, part B (P10.1)
- Format 35: a slide's Tab order, edited in the Slide panel and followed in the course; drag questions and draggable objects operated by keyboard through the engine's own calls (#133).

### 2026-11-20 - Accessibility, part A (P10.1)
- Roles, names and decoration for every object, slide buttons reached and pressed by keyboard, a named course region, skip link, announcements, visible focus, axe-core on every fixture (#132).

### 2026-11-20 - Phase 9 follow-ups (Luke's decisions)
- Courses that use Lucide icons carry its licence notice (`THIRD-PARTY-NOTICES.txt`); a drop counts only on the targets its triggers name (#125, #126).

### 2026-11-20 - Phase 9 review
- Fields, sliders, dials and 360° images work inside groups (#131); paste leaves out any object whose media is missing; the phase 9 e2e; 45 screenshots looked at.

### 2026-11-20 - Screen recording (P9.11); Phase 9 built
- Insert → Screen Recording…: choose a screen or window, record with optional narration, watch back, insert as a video through the pipeline; the chosen source is handed to one capture only (#129). The ribbon scrolls itself in a narrow window, its menus fixed to the window (#130).

### 2026-11-20 - 360° images (P9.10)
- Format 34: `panorama` objects with marker and hotspot spots, free or guided, the spot events, WebGL with a flat fallback, Insert → 360° Image…, the Format panel's section and double-click to add a spot (#128).

### 2026-11-20 - Tables (P9.9)
- Format 33: `table` objects (rich-text cells, shares, header row and column, bands, borders, cell fills), Insert → Table, cell editing on the stage and the Format panel's Table section (#127).

### 2026-11-20 - Icons and illustrations (P9.8)
- Format 32: `graphic` objects from Lucide (ISC) and Open Doodles (CC0), Insert → Icons… with search, the Format panel's ink, accent and line width, licences shipped (#126).

### 2026-11-20 - Dragging and intersections (P9.7)
- Format 31: any top-level object can be made draggable (stays, or goes back), "dragged over", "dropped on", "intersects" and "stops intersecting" triggers, the Format panel's Dragging section and the wizard's events (#125).

### 2026-11-20 - Web objects (P9.6)
- Format 30: web objects from an address or a folder, in the slide or a new window, always sandboxed; folders published under content/web/; nothing loaded off the machine by the app (#124).

### 2026-11-20 - Scrolling panels (P9.5)
- Format 29: groups that scroll in a window, Insert → Scrolling Panel, the Format panel's group section, keys and redraws in the course (#123).

### 2026-11-20 - Sliders and dials (P9.4)
- Format 28: sliders and dials bound to number variables with range and step, the `controlMoves` event, keyboard and pointer control, Insert → Data Entry, and the Format panel's control section (#122).

### 2026-11-20 - Checkboxes and radio buttons (P9.3)
- No format change: stock checkboxes and radio buttons from choice objects, groups, Starts checked, and every choice a keyboard control in the course (#121).

### 2026-11-20 - Data-entry fields (P9.2)
- Format 27: text entries bound to variables with numeric limits, the `controlLosesFocus` event, Insert → Data Entry, and the Format panel's field section (#120).

### 2026-11-20 - Vedra Opus rename
- Full technical rename: `Eloquent` to `Vedra Opus`, `@eloquent/*` to `@vedraopus/*`, `eloquent-desktop` to `vedraopus-desktop`, `.eloquent` to `.vedraopus`, `EloquentApi`/`EloquentPlayer` to `VedraOpusApi`/`VedraOpusPlayer`, `window.eloquent` to `window.vedraopus`, `ELOQUENT_*` to `VEDRAOPUS_*`, `elo-` to `vo-`, and the protocol, app-id and executable names.
- Legacy `.eloquent` files still open, and new Save/Save As uses `.vedraopus`; no saved-format version bump. The new e2e case covers that path. Repository URL and clone directory are unchanged.
- WSL helper script, notes and log folder were renamed outside the repo to match; the clone path stayed `/home/lukeg/project-eloquent`.

### 2026-11-20 - Hotspots and markers (P9.1)
- Format 26: hotspot shape, marker icon/colour/title/body/media/audio/opens-on/pulse, with asset-kind validation and a no-op migration (#117). The player owns the label; the editor gets Insert commands and Format controls. Visual references cover all five icons and the marked hotspot.
- The WSL player suite still has the known WebKit `video.spec.ts:234` failure; all P9.1 browser cases passed in all three engines.

### 2026-11-19 - Phase 8 review
- Fixed: preview scope and slides moved into banks leaving player references behind, the lightbox's menu and focus, course files in the Preview window, and looks (a light divider, the speed menu, phone bar buttons, the Player dialog's width, numbered lightbox choices) (#116). Mistakes rule 19. `e2e/phase8-course.spec.ts`.

### 2026-11-19 - Restart, exit and the last actions (P8.6); every Phase 8 package built
- Format 25: `restartCourse`, `exitCourse`, `sendEmail`, `printSlide`, `openFile`, `setFocus` and `seekTimeline` (#115). The trigger wizard offers each; exit tells the LMS and ends the course on screen.

### 2026-11-19 - Responsive behaviour (P8.5)
- Format 24 (label words only): a compact frame below 640 px with More, full-width menu and panels, 44 px touch targets on coarse pointers, touch swipes for Next and Previous, and a hint to turn a phone for a landscape course (#114).

### 2026-11-19 - Lightbox slides (P8.4)
- Format 23: `openLightbox` (with or without Previous and Next) and `closeLightbox` actions, and custom tabs that open a lightbox (#113). The engine freezes the slide under it; the player draws it behind the lightbox.

### 2026-11-19 - Player appearance and labels (P8.3)
- Format 22: the player's look (scheme, accent, font, controls and menu side) and its words per language (#112), and presets in the app's settings. The Player dialog's Look and Words sections edit them.

### 2026-11-19 - Player tabs (P8.2)
- Format 21: Resources (links and files), Glossary, Notes and custom tabs that fire the new `playerTab` trigger event (#111). The Player dialog edits them; the bottom panel's Notes tab is a real editor now.

### 2026-11-19 - Player frame (P8.1)
- Format 20: `project.player`, with the menu (author titles, hidden entries, free, restricted or locked navigation), the seekbar (off, view, drag), the learner's Submit, volume, speed, captions, accessibility panel (caption size, shortcuts), full screen, the title and a logo (#110). Design → Player… edits it, one undo step per change.

### 2026-11-19 - Phase 7 review
- Preview scoping kept references to slides it left out; question branches were unchecked and survived deletion; question choices had no role, name, state or keyboard access (now radio buttons and checkboxes, Likert points named by statement and scale point). Looks fixes to the player bar, feedback colours and the feedback master. `e2e/phase7-course.spec.ts`.

### 2026-11-19 - Result slides (P7.7); Phase 7 complete
- Format 19: result slides (graded or survey, all or chosen questions, pass mark, timer, Passed/Failed layers), tracking by result with success and score, review of a result's questions, retry with redraws, print, built-in Result* variables, and interactions to SCORM 1.2, SCORM 2004, xAPI and cmi5 (#109).

### 2026-11-19 - Question banks and draws (P7.6), merged in PR #59

- Format 18: question banks in the slide list, draw slides from Insert → Question with a Draw form (bank, count, order, locked), draws made per session and kept on resume (#108).

### 2026-11-19 - Feedback (P7.5), merged in PR #58

- Format 17: an editable feedback master (Master View), feedback layers made from it on every question slide, Form View editing their words or remaking them; Submit shows the result's layer and its button goes on; by-choice words on the layer; review mode with right and wrong answers marked (#107).

### 2026-11-19 - Freeform questions (P7.4), merged in PR #57

- Format 16: Insert → Convert Slide turns the current slide into a freeform pick one, pick many, text entry, shortcut key, drag and drop or hotspot question built from the slide's own objects (#106). Drag and drop has snapping, return to start and the three drag states; the hotspot marks the whole slide.

### 2026-11-19 - Survey types (P7.3), merged in PR #56

- Format 15: eight survey kinds with no score or attempts, one thank-you and one branch (#105); multiline text entries (essays, a `<textarea>` in a course). Insert → Survey lists them; Form View edits each; Likert is a grid of choice objects that Form View lays out again as points and statements are added or deleted. Form View's words keep a paragraph's alignment.

### 2026-11-18 - Graded types (P7.2), all three steps
- Format 14 on the P7.2 branch: the question union, text entries and dropdowns, every graded kind marked and answerable, drag placement with snapping and swapping, and hotspots with a click-placed mark (#101–#103). Insert and Form View cover all eleven kinds; e2e authors and plays them.

### 2026-11-18 - Graded types (P7.2), steps A and part of B; handover
- Format 14 on the P7.2 branch: the question union, text entries and dropdowns, every step-A kind marked and answerable; the drag kinds in the model and marking only (#101). `docs/HANDOVER.md` for carrying on from another computer.

### 2026-11-18 - Question model and Form View (P7.1)
- Format 13: `slide.question` naming its prompt, `choice` objects and Submit; marking, attempts, branching, required, shuffle and answers in the session and suspend data; Insert → Multiple Choice / Multiple Response; Form View with a Form/Slide switch (#96).

### 2026-11-18 - Reduced motion in courses
- Courses follow the learner's reduced-motion setting: fades for effects and transitions, paths shown at their end, zoom regions cut (#95).

### 2026-11-18 - Phase 6 review
- Suspend data carries motion offsets; dialogs take the focus; Master View keeps animations and zoom regions off masters; a zoom-region visual test; migration 7 restored as written; `e2e/phase6-course.spec.ts`.

### 2026-11-18 - Text-to-speech (P6.8); Phase 6 complete
- Format 12: `props.speech` on sounds; speech providers in main (espeak-ng on Linux if installed, `say`, SAPI), `speech:voices` and `speech:make`; the Text to Speech dialog and Edit speech (#94).

### 2026-11-18 - Zoom regions and cue points (P6.7)
- Format 11: `zoomRegion` objects; `EngineView.camera` from the playheads; the player zooms the slide with `scale`/`translate`; the editor's Play plays the layer's sound, C adds cues while it plays, Align to cue point (#93).

### 2026-11-18 - Transitions (P6.6)
- Format 10: slide and overlay-layer transitions (eight kinds); the engine reports their times on its clock and keeps a hiding layer drawn but closed; the player keeps the old slide drawn; the Transitions tab with Preview and Apply to all (#92).

### 2026-11-18 - Animations (P6.5)
- Format 9: entrance and exit effects and motion paths on top-level objects; engine effect times, path runs on its clock, `animationComplete`; render keyframes and the animator; the Animations tab, paths on the stage, timeline shading, the wizard's new action and event (#91).

### 2026-11-18 - Closed captions (P6.4)
- Format 8 captions on audio and video; VTT/SRT parsing and writing; the Captions tab (waveform, cursor, rows, import, export); the player's CC button and caption band (#90).

### 2026-11-17 - Media pipeline (P6.3)
- Pinned LGPL ffmpeg fetched into `vendor/` and packaged for Linux and Windows. Imports and recordings normalised to WebM (VP9, Opus) and MP3, with seek indexes, lengths and poster frames. `docs/licences.md` (#89).

### 2026-11-17 - Video (P6.2)
- Video objects (format 7), trim, poster, controls, start on click; the learner's controls detected by state; timeline grows to fit media; stall limit for time masters (#88).

### 2026-11-17 - Audio (P6.1)
- Audio objects (format 6), the engine's media states and time master, player soundboard with blocked-autoplay Play button, Insert → Audio… and Record Audio…, waveform in the timeline, audio properties, media triggers, permission handlers (#85–#87).

### 2026-11-17 - Phase 5 review
- Review method written down as a standing rule ("End of a phase"). Phase 5 end-to-end test; CI now runs the player and LMS browser suites; e2e temp folders cleaned per run (#37); Publish dialog layout fixes; `scorm-xapi.md` rewritten.

### 2026-11-17 - Publish UI (P5.6); Phase 5 complete
- Publish dialog for every target, with identifier, version, description, reporting, folder or zip output; settings kept in the project (format 5), folder remembered per computer (#84).

### 2026-11-17 - cmi5 (P5.5)
- cmi5 profile on the shared LRS driver: fetch-URL token, `LMS.LaunchData`, context template and categories, launch modes, `moveOn`, return URL through the new `CoursePlayer.exit()`. `publishCmi5` with `cmi5.xml`. Mock cmi5 LMS browser tests (#83).

### 2026-11-17 - xAPI (P5.4)
- xAPI driver: launch parsing (the older actor form too), statements with fixed ids and timestamps, a queue with retry and backoff, State API resume, `keepalive` on leaving. `publishXapi` with `tincan.xml`. Mock LRS browser tests (#82).

### 2026-11-17 - SCORM 2004 (P5.3)
- SCORM 2004 driver (`API_1484_11`, ISO durations, scaled score, URN interaction ids), discovery shared with 1.2, `publishScorm2004` for the 2nd, 3rd and 4th editions with single-SCO sequencing. Schema files for the 2nd and 4th editions (#80). Fixed two problems that predated this work: the start was not saved after the resume question, and completion could be overwritten with incomplete (#81).

### 2026-11-17 - SCORM 1.2 schema files
- The four ADL and IMS schema files now ship in every SCORM 1.2 package, and the manifest names them in `xsi:schemaLocation`. Checked with xmllint (#79).

### 2026-11-17 - SCORM 1.2 (P5.2)
- LMS driver interface, SCORM 1.2 driver and API discovery, suspend-data codec (a 100-slide session in 1,697 characters), `startCourse`, `publishScorm12` with manifest and publish-time size warning; mock-LMS browser tests.

### 2026-11-17 - Tracking model (P5.1)
- Format version 4 (`tracking`, Complete the course action); completion and status mapping in the engine; resume always/never/prompt in the player; Tracking dialog.

### 2026-11-17 - Phase 4 review
- Objects inside groups take input and run their triggers; 0 s timeline events fire; every Phase 4 command in the undo/redo property test; an end-to-end course survives save and reopen.

### 2026-11-17 - JavaScript trigger (P4.6); Phase 4 complete
- Run JavaScript action with a stable player API, run by the player at its place among the triggers.

### 2026-11-17 - Slide properties and Overview links (P4.5)
- Format version 3 (per-slide player buttons); slide properties in the Format panel; Overview arrows for jumps and unreachable-slide flags.

### 2026-11-17 - Slide layers (P4.4)
- Layers panel and layer editing on the stage; layer commands; the first golden run (`states-and-triggers`) agreeing across engine, preview and published course.

### 2026-11-17 - Triggers (P4.3)
- Engine trigger evaluation per section 5 with breadth-first cascades and a loop cap; trigger commands; Triggers panel and sentence wizard; click-to-reveal plays in preview.

### 2026-11-17 - Theme audit, Variables (P4.2)
- Every control follows the theme; number fields work mid-edit; menu bar Insert works. Variables manager, `%Name%` references with rename tracking, built-in variables, live values in the player.

### 2026-11-16 - States (P4.1)
- Engine state machine with pointer input and button sets; states drawn and interactive in the player, preview and published courses; States panel and edit-states mode; state commands.

### 2026-11-16 - Text Format tab
- Contextual ribbon tab for text, opening automatically on edit; font size typing fixed; whole-box formatting; inline link field; A−/A+ size steps.

### 2026-11-16 - Timeline panel (P3.3)
- Timeline with object rows and bars, playhead scrub and play backed by the engine, cue points, length and zoom; `layer.setDuration` and `cuePoint.*` commands. Phase 3 complete.

### 2026-11-16 - Preview (P3.4) and text-editing fixes
- Sandboxed preview window fed by the publish path, with slide, scene and project scope. Typing under `npm run dev` and keeping text on click-away fixed.

### 2026-11-16 - Web publish (P3.5)
- `publishWeb` in `@vedraopus/publish`; Publish dialog and menu item; safe staging and replacement; the player bundle ships in the app. The published course plays over HTTP and from `file://`.

### 2026-11-16 - Player (P3.2)
- `packages/player`: `mountPlayer`, frame loop, stage scaling, input forwarding, Previous/Next frame, single-file IIFE bundle plus CSS, three-engine browser tests.

### 2026-11-16 - Engine core (P3.1)
- `packages/engine`: `createEngine` with tick clock, layer timelines, object lifecycle, navigation, revisit rules, overlay layers, object states, variables, event bus and `SessionState` save/restore. No triggers yet.

### 2026-11-16 - Masters and layouts (P2.7)
- Format version 2, master/layout commands, Master View, Layout picker, placeholders, master and layout layers drawn beneath slides in `@vedraopus/render`.

### 2026-11-16 - Overview (P2.6)
- Rendered slide thumbnails (Overview and slide list), slide and scene management, drag between scenes, starting scene. `cloneSlide`/`cloneScene` in the model.

### 2026-11-16 - Format and theme (P2.5)
- Format panel (position, size, opacity, fill/stroke/shadow with theme or literal colours), theme colours and fonts dialog, format painter, Stage Size dialog with scale or keep.

### 2026-11-16 - Text editing (P2.4)
- In-place TipTap text editing on stage for text boxes, shapes and buttons, with formatting controls and autofit modes.
- Static rich-text serializer in `@vedraopus/render`, bundled Inter fonts, and render visual parity test comparing editor and static rendering of the same document.

### 2026-11-15 - Phase 1 and the editor shell
- Commands and undo (P1.2), project files (P1.3), editor layout with persisted panels and themes (P2.1), object renderers with three-browser visual tests (P2.3).
- Stage (P2.2) finished: direct manipulation, snapping, rulers/grid/guides, arrange commands, clipboard across slides and app instances, and the stage context menu.

### 2026-11-14 - Desktop pivot and Phase 0
- Wrote `docs/PLAN.md`.
- Restructured to `apps/` + `packages/`; removed the Express backend, cert scripts and LMS-style shared types.
- Added the Electron shell (sandboxed renderer, typed and validated IPC, menu skeleton, window-state persistence).
- Added ESLint with package-boundary rules, Prettier, Vitest, Playwright, a three-OS CI workflow and electron-builder config.

### 2026-09-13 - Initial creation and monorepo setup
- Created the original web scaffold, npm workspaces and skill documents.

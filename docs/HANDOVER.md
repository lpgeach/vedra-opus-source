# Handover: picking the work up on another computer

**Written:** 2026-11-18, at the end of session 47; updated at the end of session 50 with the WSL Linux test bed, at the end of sessions 51 to 55 (P7.3 to P7.7), and at the end of sessions 65 (P9.1) and 66 (the Vedra Opus rename), and since at the end of each session, so Luke can carry on from another computer with the same Claude account.

Claude's memory files stay on the computer they were made on. Everything a new machine needs is therefore here, in the repository: the standing instructions, the setup, and where the work stopped.

## 1. Where the work is

- **`master`:** all of Phase 8 and its review (PRs #62 to #68), P9.1 (PR #69), the Vedra Opus rename (PR #70), P9.2 (PR #71), P9.3 (PR #72), P9.4 (PR #73), P9.5 (PR #74), P9.6 (PR #75), P9.7 (PR #76), P9.8 (PR #77), P9.9 (PR #78), P9.10 (PR #79) and P9.11 (PR #80).
- **The Phase 9 review** (PR #81): `logs/2026-11-20-session-76.md`.
- **Phase 9 follow-ups** (Luke's decisions on icon notices and drop targets, PR #82): `logs/2026-11-20-session-77.md`.
- **P10.1 accessibility**, in three parts (`docs/briefs/P10.1-accessibility.md`):
  - part A (PR #83): `logs/2026-11-20-session-78.md`;
  - part B (keyboard dragging, the Tab order, format 35, PR #84): `logs/2026-11-21-session-79.md`;
  - part C (the text view, remembered settings, contrast, PR #85): `logs/2026-11-21-session-80.md`.
  - P10.1 is ticked. Outstanding: the NVDA and VoiceOver pass (Luke's), and axe-core in CI from December.
- **P10.2, the accessibility checker** (PR #86): `logs/2026-11-21-session-81.md`. It has a question for Luke about default text colours on fills.
- **P10.3, translation,** in three parts (`docs/briefs/P10.3-translation.md`):
  - part A (units and XLIFF, PR #87): `logs/2026-11-21-session-82.md`;
  - part B (the two-column Word document, PR #88): `logs/2026-11-21-session-83.md`;
  - part C (right to left, the player's words by language, PR #89): `logs/2026-11-21-session-84.md`. P10.3 is ticked.
- **P10.4, the editor's string catalogue** (PR #90): `logs/2026-11-21-session-85.md`. Phase 10 is built.
- **The Phase 10 review** (PR #91): `logs/2026-11-22-session-86.md`. It also covers the machine crash of 21 November and the logging since (pitfall #139).
- **P11.1, PowerPoint import,** in four parts (`docs/briefs/P11.1-pptx-import.md`). Luke chose to bundle only the part of LibreOffice the import needs.
  - part A (the reader, PR #92): `logs/2026-11-22-session-87.md`;
  - part B (masters, layouts, backgrounds, PR #93): `logs/2026-11-22-session-88.md`;
  - part C (transitions, animations, media, PR #94): `logs/2026-11-22-session-89.md`;
  - part D (LibreOffice, trimmed, draws charts and SmartArt as pictures, PR #95): `logs/2026-11-22-session-90.md`. P11.1 is ticked.
  - LibreOffice for macOS (session 102) on `wp/p11.1e-libreoffice-mac`, once its PR is merged: `logs/2026-11-23-session-102.md`.
- **P11.2, templates,** in three parts (`docs/briefs/P11.2-templates.md`):
  - part A (Save as Template, New from Template, PR #96): `logs/2026-11-22-session-91.md`;
  - part B (File → Import Slides, PR #97): `logs/2026-11-22-session-92.md`;
  - part C (built-in starter templates, PR #98): `logs/2026-11-22-session-93.md`. P11.2 is ticked.
- **P11.3, handout and video,** in three parts (`docs/briefs/P11.3-video-and-handout.md`):
  - part A (the handout as PDF, PR #99): `logs/2026-11-22-session-94.md`;
  - part B (the handout as Word, PR #100): `logs/2026-11-22-session-95.md`;
  - part C (the video, **WebM only** as Luke chose, PR #104): `logs/2026-11-22-session-99.md`. P11.3 is ticked.
- **P11.4, signing and updates,** in two parts (`docs/briefs/P11.4-signing-and-updates.md`), signing-ready as Luke chose:
  - part A (signing): `logs/2026-11-22-session-100.md`;
  - part B (opt-in updates) on `wp/p11.4b-updates`, once its PR is merged: `logs/2026-11-23-session-101.md`. P11.4 is ticked.
  - `docs/releasing.md` says what certificates and accounts a real release needs.
- **P11.5, hardening,** in three parts (`docs/briefs/P11.5-hardening.md`):
  - part A (the performance budget as a test, PR #101): `logs/2026-11-22-session-96.md`;
  - part B (large media, PR #102): `logs/2026-11-22-session-97.md`;
  - part C (local crash reports; proof of no telemetry) on `wp/p11.5c-crash-reports`, once its PR is merged: `logs/2026-11-22-session-98.md`. P11.5 is ticked.
  - Sending crash reports anywhere is Luke's decision.
- **Luke decided (session 98):**
  - P11.3 C (the video, **WebM only**), P11.4 (**signing-ready**, tested with test certificates) and LibreOffice for macOS come before the Phase 11 review;
  - the order is: P11.3 C, P11.4, LibreOffice for macOS, then the review.
- **LibreOffice for macOS** is done (session 102): the fetch makes, checks, re-signs and smoke-tests the trim on a Mac.
- **Luke (2026-11-23): every system must be feature-ready before the Phase 11 review.** macOS was made so in session 103 (PR #108, `logs/2026-11-23-session-103.md`). Luke approved:
  - **building our own LGPL ffmpeg for macOS from source** in the VM (VP9, Opus, MP3, royalty-free decoders; no H.264/AAC), shipped like the Windows and Linux one;
  - **logging in the VM's hidden desktop session** (`wsm gui prewarm`) so the Electron e2e, WebKit and text-to-speech run on macOS. The session also needed its first-login setup finished (pitfall #155).
- **The Phase 11 review** (PR #109): `logs/2026-11-23-session-104.md`. It found and fixed four things (pitfall #156). **With it, every work package in the plan is built and every phase reviewed.**
- **Release work Luke asked for after the plan** (the parts that need neither CI nor accounts):
  - **R1, our own ffmpeg on every system** (PR #110, `logs/2026-11-23-session-105.md`). Luke decided to build our own on Linux and Windows too, instead of collecting BtbN's ~80 libraries' source, and that Windows refuses H.264/AAC as the others do, until a Media Foundation helper exists.
  - **R2, the third-party notices page and the source offer** (PR #111): `logs/2026-11-23-session-106.md`.
  - **R3, H.264 and the like on Windows and macOS** through the systems' own decoders (PR #112): `logs/2026-11-23-session-107.md`. Luke asked for it when R1 had made Windows refuse them.
- **Alpha 1** (Luke, 2026-11-23): what is built now is our first alpha; icons and branding come in the beta. `docs/release-stages.md` says what each stage holds. The packaged app was checked on all three systems (`logs/2026-11-23-session-108.md`).
- **Beta work as Luke tests:** B1, one title bar (`wp/title-bar`): `logs/2026-11-23-session-109.md`. B2, objects past the slide dimmed, shown or hidden (`wp/b2-off-slide`, from `wp/title-bar`): `logs/2026-11-23-session-110.md`. **Alpha 2**, the first published build: the Windows installer as the GitHub pre-release `v0.1.0-alpha.2`, and the new README (`wp/alpha-2`): `logs/2026-11-24-session-111.md`. A sample course on the UK space industry (in Luke's Documents, not the repository) and B3, a black 360° view from `file://` fixed (`wp/b3-panorama-flat`): `logs/2026-11-24-session-112.md`. That course checked through and shipped with the app as the demo course (B4, `wp/b4-demo-course`), version `0.1.0-alpha.3`: `logs/2026-11-24-session-113.md`. B5 part A, importing Articulate Storyline `.story` courses (`wp/b5-story-import`; the one exception to the Articulate rules, `AGENTS.md`): `logs/2026-11-24-session-114.md`. Part B (questions, sliders, motion paths, captions) is next if Luke wants it.
- **Two new repositories** (session 115, `logs/2026-11-24-session-115.md`):
  - **`lpgeach/vedra-opus-releases`, public:** the downloads to send people. Alpha 3's installer and its third-party sources are copied there, with a README.
  - **`lpgeach/vedra-opus-feedback`, private:** the feedback website (Next.js, Vercel Hobby, private Blob store, password-protected inbox). **Deployed on Vercel** at https://vedra-opus-feedback.vercel.app/ (answering, checked 2026-11-26), which is `FEEDBACK_URL`.
  - **B6** (`wp/b6-feedback-link`): Help → Send Feedback… opens that site with the version and computer filled in.
- **B5 part B, first slice** (`wp/b5b-story-motion-paths`, session 115): motion paths, sliders, dials and tables from `.story` courses, and better media matching. Sample A now reports only one group it splits up. Brief: `docs/briefs/B5b-storyline-motion-paths.md`.
- **B7, a cover while importing** (`wp/b7-import-progress`, session 115): Luke asked for a full-window overlay with progress, as nothing showed during a 3–4 minute import and the Welcome screen stayed usable. Brief: `docs/briefs/B7-import-progress.md`.
- **B8, group members with their own timing and animations** (`wp/b8-group-member-animations`, session 115, format 36): Luke chose it so imported groups play exactly. Sample A now imports with an empty report. Brief: `docs/briefs/B8-group-member-animations.md`.
- **B5 part C** (`wp/b5c-story-media-shapes-triggers`, session 116, `logs/2026-11-25-session-116.md`): media, shapes, triggers and captions from Sample B's report.
- **B9, a Donate button** (title bar and Help, and the feedback site's header), and **B10, renames Windows briefly refuses** retried (session 116).
- **B5 part D** (`wp/b5d-story-questions`, session 116): quiz questions, feedback layers and result slides from `.story` courses. Sample B's report is 75 → 34 lines.
- **Alpha 4** (`wp/alpha-4`, session 116): Windows and macOS (Intel and Apple Silicon) installers, published on `vedra-opus-releases`, whose releases are now the update feed. The Apple Silicon build has not run on an Apple Silicon Mac.
- **B16, dial looks and Storyline's path points** (`wp/b16-dial-looks-and-path-shapes`, session 116, format 40): checked against Sample B's published course, which Luke provided.
- **B15, linked files and proportions** (`wp/b15-last-import-lines`, session 116).
- **B14, turn paths** (`wp/b14-turn-paths`, session 116): followed along their own curve.
- **B13, path shapes** (`wp/b13-path-shapes`, session 116, format 39): imported callouts, clouds, cans and frames drawn as they were.
- **B12, the Sample B report's behaviour leftovers** (`wp/b12-story-leftovers`, session 116, format 38): case-insensitive comparisons, "is not" state changes, Storyline's own triggers left out.
- **B11, drag-and-drop and retry options** (`wp/b11-drag-and-retry-options`, session 116, format 37): what part D could not import, which Luke asked for ("if we need to add more features and functions to make it work do it").
- **Session 117 (2026-11-26, `logs/2026-11-26-session-117.md`):**
  - **B18, the brand** (`wp/b18-brand`): Luke's logo as SVGs (`brand/`), on the Welcome screen and as the app icon, and Outfit as the app's typeface.
  - **B17, the ribbon and panels** (`wp/b17-ribbon-and-panels`, format 41): the ribbon in seven tabs with its new commands, Preview and Publish at the tab row's end, a collapsible ribbon, two stacked panels on the right, a toolbar above the stage, and a slide's own background (`docs/briefs/B17-ribbon-and-panels.md`).
  - **Queued after B17**, from a review of another authoring tool's interface that Luke approved ("yes do that you suggested"). Each gets a brief when it starts; our own names, look and wording throughout:
    - **B19, settings that summarise themselves:** the right panel's sections collapse to one line saying what is set ("Link · none"), with a "Find a setting" box.
    - **B20, File as a full-height sheet:** Project, Publish, Translation, History, Options and Recent, each item with a line saying what it does.
    - **B21, Course settings as a page:** a list of sections on the left, a search, and a mark on sections that need attention (such as completion not set).
    - **B22, the Slides panel and timeline:** a search box, scenes as collapsible groups with counts, badges on thumbnails (triggers, length); on the timeline, narration as the top row, a type tag on each row, and Timeline and Notes as tabs down the panel's edge.
    - **B23, the title bar:** a pill saying whether the project is saved, and a list of recent steps beside Undo.
    - **B24, finding things:** search slides, and a search for any command by name.
    - **B25, the Overview:** a legend for link types (next, on click, jump, unresolved), what a slide leads to and arrives from, Preview from here, a minimap, and a list view.
  - **Ideas from the same review that wait for Luke:** object styles and defaults for new objects; accessibility (focus order, headings, missing alt text count) in the slide's own panel; script and course-data export and review comments; version history; layouts per device (desktop, tablet, phone), which is large; and connecting an AI assistant to the open course, which needs his decision under the rule on sending data off the machine.
  - **Luke's brand identity:** he pointed to a Dribbble shot ("Glass Brand identity"); the page could not be read, so its colours and effects wait for his screenshots.
- **Luke (2026-11-24): no builds or releases until he says.** He checks the Storyline import himself with `npm run dev`.

- **Questions waiting for Luke:**
  - the default text colour on fills (session 81);
  - the arrow keys in right-to-left courses (session 84);
  - what comes after the plan;
  - Safari and VP9 on a real Mac, and the performance budget on a real Mac (session 103);
  - real PowerPoint decks (charts, SmartArt, animations, media) to try the import on; it has only seen decks its tests build;
  - real signing certificates and accounts for P11.4, when the time comes;
  - whether the next release points the update feed, the notices' source link and Help → Project Repository at the public `vedra-opus-releases` (session 115; `docs/releasing.md`);
- The WSL player suite still has the known WebKit `video.spec.ts:234` media-timing failure.

To pick up:

```bash
git fetch origin
git switch master
git pull --ff-only
gh pr list            # nothing open is expected
```

## 2. Setting up the new computer

1. **Node and npm:** the versions in the root `package.json`.
2. Run `npm install`.
3. Run `npm run fetch:ffmpeg` once. It builds our own LGPL ffmpeg from pinned sources into `vendor/ffmpeg/` (about ten minutes); on Windows it builds through WSL, which needs `build-essential` and `mingw-w64` (`docs/development.md`). The media-pipeline tests need it. Then `npm run fetch:libreoffice`, which downloads the pinned LibreOffice (a few hundred MB), trims it to what PowerPoint import needs, and smoke-tests it into `vendor/libreoffice/`.
4. **On Linux,** install espeak-ng for text-to-speech (`sudo pacman -S espeak-ng`, or `sudo apt install espeak-ng`). Without it, the real-speech tests are skipped.
5. **Playwright's browsers:** `npx playwright install chromium firefox`. WebKit cannot run on Arch (pitfall #19).
6. **The GitHub CLI** logged in to the account that owns `lpgeach/project-eloquent` (private, where all work happens) and `lpgeach/vedra-opus-source` (public: only each release's source), so `gh pr create` and `gh pr merge` work.
7. **The starting point should be green:**

   ```bash
   npm run typecheck && npm run lint && npm run format:check && npm test
   env -u ELECTRON_RUN_AS_NODE npm run e2e
   ```

   On a machine short of memory, run e2e in two halves, and Firefox with `--workers=1` (see the session logs).

### 2b. WSL Linux test bed on this machine

This computer now has an Ubuntu 26.04.1 WSL 2 distribution with Node 22.22.1, npm 11.18.0, build tools, espeak-ng, the vendored ffmpeg, and Playwright Chromium, Firefox and WebKit. The repo clone is at `/home/lukeg/project-eloquent` on ext4, and WSL Git uses the Windows credential helper for the private remote.

Run all Linux checks with:

```bash
~/vedraopus-checks.sh
```

It writes a timestamped set of logs under `~/vedraopus-logs/`. The helper, notes and log folder were renamed with the product in session 66; the clone path itself is still `/home/lukeg/project-eloquent`. The first full Linux run is recorded in `logs/2026-11-18-session-50.md`; `~/VEDRAOPUS-WSL.md` in the WSL home has the environment details and the one known WebKit media-timing limitation.

## 3. Standing instructions from Luke

These are the rules Claude keeps in memory on the first computer. A new machine starts without them, so follow them from here.

- **No AI attribution, anywhere.** No `Co-Authored-By` trailers and no "Generated with" lines, in commits, PRs, files or the app (Luke, 2026-11-14). This overrides any tool's default.
- **Two repositories, two CI rules** (Luke, 2026-11-26):
  - **Private `lpgeach/project-eloquent`** (`origin`), where all work happens: its Actions minutes are used up, so every commit and merge subject still carries `[skip ci]`, and nobody starts a run by hand:

    ```bash
    gh pr merge N --merge --subject "Merge pull request #N from lpgeach/<branch> [skip ci]"
    ```

  - **Public `lpgeach/vedra-opus-source`** (`public`): only each release's source, pushed when Luke asks for a release build. CI runs there, free, and the release is built from it (`docs/releasing.md`, "Publishing the source").

- **Linux only until December.** Verify on Linux and don't stop because Windows or macOS is unverified. Say once, in each log and PR, that they weren't checked.
- **No test windows on Luke's desktop.** e2e runs headless on Linux (`--ozone-platform=headless` in `e2e/launch.ts`). Anything visible goes on another workspace (Hyprland: `hyprctl dispatch exec "[workspace 9 silent] <command>"`), or ask first. Never inject keys into the focused window.
- **Learn from mistakes.** Every session log has a "Mistakes this session" section. Recurring ones become rules in "Mistakes I keep making" in `skills/project-specific.md`; read it before editing.
- **Review each phase.** When a phase's last package is merged, review the whole phase on `check/phase-<n>` before the next phase starts. The method is in `skills/project-specific.md`, "End of a phase".
- **Nothing leaves the machine without Luke.**
  - No uploads to SCORM Cloud or any outside LMS or LRS; test against the in-repo mocks, and Luke checks externally later.
  - Published xAPI courses may talk to the LRS they are launched with (that's the feature).
- **SCORM 2004 3rd edition** ships without its IMS sequencing schemas (Luke chose not to register with IMS). Don't raise it again.
- **Media formats.** Courses use WebM (VP9 and Opus) and MP3, never H.264 or AAC. On Linux, only royalty-free formats are imported (an allow-list); Windows and macOS will decode through the operating system later. Claude may fetch and run the pinned LGPL ffmpeg builds. Licence notes are in `docs/licences.md`.
- **Text-to-speech.** espeak-ng on Linux, only if installed; nothing is bundled. Piper and cloud voices were not chosen. On the first computer, passwordless sudo was turned on only to install espeak-ng; don't use sudo for anything else without asking.
- **Accessibility.** Courses follow the learner's reduced-motion setting (Luke asked, 2026-11-18).

`AGENTS.md` also says to stop and ask Luke before:

- changing the trigger and runtime rules in plan §5;
- changing package boundaries;
- adding native modules;
- bundling third-party binaries;
- anything that sends data off the machine.

It also says not to copy from Articulate, and not to name anything "Story…".

## 4. How each session goes

As `AGENTS.md` says:

1. Read `skills/project-specific.md` and the newest log in `logs/`.
2. Continue the open branch, or take the next unticked package in `docs/PLAN.md` §8.
3. The first two actions of a package are creating its branch (`wp/<id>-<slug>`) and writing its brief (`docs/briefs/`).
4. Write tests for every "Done when" item, and run the full checks:
   - format, typecheck, lint and unit tests;
   - e2e with the built renderer and with the dev renderer;
   - the player, LMS and visual suites in Chromium and Firefox, each browser run on its own.
5. Tick the plan, update the skills file's Current State and pitfalls, and write the session log.
6. Commit, PR and merge on the private repository, all with `[skip ci]`.

Delete or rewrite this file once the work is back on one computer, or when it falls out of date.

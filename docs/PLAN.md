# Project Vedra Opus — Build Plan

**Status:** active · **Written:** 2026-11-14 · **Owner:** Luke

This is the working plan for building Vedra Opus: a cross-platform desktop eLearning authoring tool with feature parity, over time, with Articulate Storyline. Any agent picking up work should read sections 1–6 once, then go to section 8, pick the first unblocked work package, and build it.

---

## 1. Mission and ground rules

**What we are building.** A slide-based authoring tool where an author places objects on slides, gives them states, wires them up with triggers and variables, syncs them on a timeline, builds quizzes, and publishes a self-contained HTML5 course that reports to an LMS over SCORM, xAPI or cmi5.

**Where it runs.** An Electron desktop app for Linux, macOS and Windows. It is local-first: no server, no account, no database. Projects are files on the author's disk.

**What "cloning Storyline" means here.**

- We match its _capabilities and authoring model_ (slides, layers, states, triggers, variables, timeline, question types, player, publish formats). An author who knows Storyline should feel at home.
- We do **not** copy Articulate's name, logos, icons, UI artwork, characters, templates, stock content, or help text. All visual design and assets are our own or openly licensed.
- We do **not** read or write the `.story` file format. Interchange with other tools goes through open formats (PPTX import, XLIFF, SCORM).

**Engineering rules for every work package.**

1. The published course must behave exactly like the preview. Preview and publish use the same player code and the same serialised project data; there is no second implementation.
2. Runtime behaviour lives in a headless engine with no DOM dependency, driven by an injectable clock, so it is unit-testable. Views only render engine state and forward input.
3. Every change to the project goes through the command system (section 4.3). Nothing mutates the document directly. This gives undo/redo and autosave for free.
4. The project schema is versioned. Any change to the saved shape ships with a migration and a fixture that proves old files still open.
5. The renderer process has no Node access. Everything that touches disk or the OS goes through typed IPC.
6. A package is done when its "Done when" checks pass on all three operating systems in CI, not when the code is written.

---

## 2. Where the repo is today

The repo is a three-session-old scaffold for a _web_ app. Nothing in it is product code yet.

| Path                                 | What it is                                                                                         | What happens to it                                                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/`                          | Unmodified Vite + React + TS starter (counter demo; references two SVGs that were never committed) | Becomes the Electron renderer under `apps/desktop/`                                                                                |
| `backend/`                           | Express server with `/health` and `/api` only                                                      | **Removed.** A desktop app has no server.                                                                                          |
| `generate-certs.*`, `backend/certs/` | Self-signed HTTPS for the dev server                                                               | **Removed.**                                                                                                                       |
| `shared/types.ts`                    | LMS-style model: `User`, `Course → Module → Lesson → ContentBlock`, `Progress`                     | **Replaced.** Storyline's model is `Project → Scene → Slide → Layer → Object`; there are no users or server-side progress.         |
| `shared/scorm-manifest.ts`           | JS-object sketch of a manifest, not valid `imsmanifest.xml`                                        | **Replaced** by real XML generation in `packages/publish`.                                                                         |
| `shared/xapi-statements.ts`          | Statement types and verb IDs. Has a duplicate `definition` key in `xAPIObject` (type error).       | Verb and activity-type IDs carry over into `packages/publish`; the rest is rewritten.                                              |
| `skills/*.md`                        | Generic guides (React, Node backend, DB design, SCORM, git, UI)                                    | `nodejs-backend.md` and `database-design.md` are obsolete; delete. Update `project-specific.md` and `scorm-xapi.md` as work lands. |
| `docs/development.md`, `README.md`   | Describe the web/Postgres/Vercel setup                                                             | Rewritten in P0.1.                                                                                                                 |
| `logs/`                              | Session logs, `YYYY-MM-DD-session-N.md`                                                            | Convention continues.                                                                                                              |

**Superseded decisions.** Vercel deployment, serverless backend, PostgreSQL, JWT auth and the "Short-term / Medium-term" lists in `skills/project-specific.md` are all void. The React + TypeScript + Vite choice stands.

---

## 3. Architecture

### 3.1 Repository layout (target)

```
project-eloquent/
├── apps/
│   └── desktop/              Electron app
│       ├── src/main/         Main process: windows, menus, file I/O, publish jobs, protocols
│       ├── src/preload/      contextBridge API (typed)
│       └── src/renderer/     React editor UI
├── packages/
│   ├── model/                Project schema, validation, migrations, commands. Pure TS.
│   ├── engine/               Headless runtime: timeline, states, triggers, variables, quiz scoring. Pure TS.
│   ├── player/               Browser view over the engine + player frame. Ships inside published courses.
│   ├── render/               Shared object renderers (shape/text/image → DOM/SVG) used by editor stage and player.
│   └── publish/              Bundling, manifests, LMS drivers (SCORM 1.2/2004, xAPI, cmi5), zip.
├── fixtures/                 Sample projects and golden outputs used by tests
├── e2e/                      Playwright tests (Electron app and published output)
├── docs/                     This plan, format specs, ADRs
├── skills/                   Agent guides
└── logs/                     Session logs
```

Dependency direction is one-way: `model` ← `engine` ← `render` ← `player` ← `publish` ← `apps/desktop`. `model` and `engine` must never import DOM, React, Node or Electron APIs.

### 3.2 Stack

| Concern           | Choice                                                                               | Why                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Shell             | Electron, built with `electron-vite`, packaged with `electron-builder`               | Keeps the existing Vite/React setup; one toolchain produces AppImage/deb, dmg, and NSIS installers                                 |
| UI                | React + TypeScript (strict)                                                          | Already chosen                                                                                                                     |
| Editor state      | Zustand store over an immutable document; Immer patches for undo                     | Patches give cheap inverse operations and a change stream for autosave                                                             |
| Schema validation | Zod                                                                                  | Runtime validation on open, types inferred from one source                                                                         |
| Stage rendering   | DOM + SVG, absolutely positioned inside a scaled stage                               | Text stays real text (selectable, accessible, crisp when scaled); identical markup in editor and published course. Not `<canvas>`. |
| Rich text         | TipTap (ProseMirror) in the editor; a small static JSON→HTML serializer in `render`  | The player must not ship an editor                                                                                                 |
| Animation         | Web Animations API, driven by the engine clock                                       | Seekable and pausable, which CSS animations are not                                                                                |
| Zip               | `yazl`/`yauzl` in main process                                                       | Streaming, no native modules                                                                                                       |
| Language          | TypeScript 6.x (not 7 yet)                                                           | `typescript-eslint` does not support TypeScript 7 at the time of writing; move when it does                                        |
| Unit tests        | Vitest                                                                               |                                                                                                                                    |
| E2E               | Playwright (Electron mode for the app, Chromium/Firefox/WebKit for published output) |                                                                                                                                    |

Install current stable versions when a package is first added and let the lockfile pin them. Avoid native Node modules unless a work package explicitly calls for one; they complicate three-OS packaging.

### 3.3 Process model and security

- `BrowserWindow` with `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- Preload exposes one object, `window.vedraopus`, whose methods map 1:1 to `ipcMain.handle` channels. The channel list and payload types live in one file shared by main and preload. Main validates every payload with Zod.
- Project assets are served to the renderer through a custom protocol (`vedraopus-asset://<projectId>/<hash>`), never via `file://` paths.
- Preview runs the real player in a separate sandboxed window (or iframe) served from a second custom protocol (`vedraopus-preview://`), so authored JavaScript triggers and web objects cannot reach the editor or IPC.
- Strict CSP on the editor window. No remote content loads in the editor.

### 3.4 Project file

A project is a single file, `*.vedraopus`, which is a zip:

```
project.json        the document (section 4)
assets/<sha256>.<ext>   media, content-addressed, deduplicated
thumbs/<slideId>.png    slide thumbnails (cache; safe to delete)
meta.json           { formatVersion, appVersion, createdAt, modifiedAt }
```

- **Open:** unzip into a working directory under the OS app-data path, validate, migrate, load.
- **Save:** write the zip to a temp file next to the target, fsync, atomic rename.
- **Autosave:** the working directory's `project.json` is rewritten (debounced) after every command. On launch, any working directory without a clean-close marker is offered for recovery.
- Assets are copied into the store on import. The document refers to assets by hash only.

---

## 4. Document model

The authoritative schema is Zod in `packages/model`. This is the shape to implement; field lists are the starting point, not exhaustive.

### 4.1 Structure

```ts
Project {
  formatVersion: number
  id, title
  stage: { width: number, height: number }      // default 1280×720; author-changeable
  theme: { colors: ThemeColors, fonts: { heading, body } }
  scenes: Scene[]                                // ordered; first scene's first slide is the start slide unless overridden
  masters: SlideMaster[]                         // each has layouts: SlideLayout[]
  feedbackMasters: SlideMaster[]
  variables: Variable[]                          // project-scoped
  questionBanks: QuestionBank[]
  assets: Record<Hash, AssetMeta>                // type, original filename, dimensions/duration, alt text
  player: PlayerConfig                           // section 8, P8
  tracking: TrackingConfig                       // section 8, P5
}

Scene  { id, title, slides: Slide[] }

Slide {
  id, title, layoutId
  baseLayer: Layer
  layers: Layer[]                                // overlay layers, ordered
  notes: RichText
  transition?: Transition
  properties: {
    advance: 'auto' | 'user'
    onRevisit: 'auto' | 'resume' | 'reset'
    controls: { prev, next, submit, seekbar, menu, ... : boolean }   // per-slide player overrides
  }
  triggers: Trigger[]                            // slide-level; object triggers live here too, keyed by owner
  question?: Question                            // present when the slide is a question (P7)
  kind: 'content' | 'question' | 'result' | 'lightbox-only'
}

Layer {
  id, name
  objects: SceneObject[]                         // array order = z-order, back to front
  timeline: { duration: number, cuePoints: CuePoint[] }
  properties: {                                  // overlay layers only
    hideOtherLayers, hideBaseObjects, pauseBaseTimeline, blockBaseClicks, allowSeek: boolean
    onRevisit: 'auto' | 'resume' | 'reset'
  }
}
```

### 4.2 Objects, states, triggers, variables

```ts
SceneObject {
  id, name
  type: 'text' | 'shape' | 'image' | 'button' | 'group' | 'video' | 'audio'
      | 'hotspot' | 'marker' | 'slider' | 'dial' | 'textInput' | 'numericInput'
      | 'checkbox' | 'radio' | 'scrollPanel' | 'webObject' | 'caption'
  frame: { x, y, width, height, rotation }       // stage units
  timing: { start: number, duration: number | 'untilEnd' }
  locked, hiddenInEditor: boolean
  initialState: StateId                          // 'normal' by default; may be 'hidden'
  states: ObjectState[]                          // always contains 'normal'
  a11y: { altText, visibleToAT: boolean, tabOrder? }
  animations: { entrance?, exit?, motionPaths: MotionPath[] }
  buttonSet?: string                             // radio-style mutual exclusion for 'selected'
  props: <per-type payload>                      // e.g. shape geometry, text doc, asset hash, slider range
  children?: SceneObject[]                       // groups, scroll panels
}

ObjectState {
  id                                             // built-ins below, or a custom id
  name
  overrides: Partial<visual props + frame>       // diff against 'normal'
  extraObjects?: SceneObject[]                   // objects that exist only in this state
}
// Built-in ids: normal, hover, down, selected, visited, disabled, hidden,
//               dragOver, dropCorrect, dropIncorrect

Variable {
  id, name                                       // name unique per project, used in %name% references
  type: 'text' | 'number' | 'boolean'
  default: string | number | boolean
}
// Built-in read-only variables are provided by the engine, not stored: slide number,
// slide count, slides viewed, percent complete, elapsed times, quiz score/percent/pass per result slide.

Trigger {
  id
  owner: { kind: 'slide' | 'layer' | 'object' | 'player', id }
  order: number                                  // evaluation order among triggers sharing an event
  event: TriggerEvent
  action: TriggerAction
  conditions?: { combine: 'and' | 'or', items: Condition[] }
  else?: TriggerAction
  enabled: boolean
}
```

**Events** (the "when"): user clicks / double-clicks / right-clicks object · mouse enters / leaves · key pressed · timeline starts / ends / reaches time / reaches cue point (per layer or per object) · object state becomes X · variable changes · media completes · slider or dial moves · control loses focus · object dragged over / dropped on · objects intersect / stop intersecting · object enters or leaves slide · animation completes · player button clicked (prev, next, submit).

**Actions** (the "what"): change state of object · show layer · hide layer · jump to slide / scene / next / previous · open lightbox slide · close lightbox · set variable (assign, add, subtract, multiply, divide, toggle, concatenate) · play / pause / stop media · pause / resume / seek timeline · move object along motion path · submit interaction · submit / review / reset / print results · complete course · exit course · open URL or file · send email · set focus · restart course · execute JavaScript.

**Conditions:** compare a variable, an object's state, or a window property against a literal, a variable, or a state, with `==, !=, <, <=, >, >=, between, contains`, and `==` and `!=` ignoring case (B12).

### 4.3 Commands

Every edit is a command: `{ type, payload }` handled by a pure function `(doc, payload) → patches`. The store applies patches, pushes inverse patches on the undo stack, and emits a change event. Drag gestures coalesce into one undo step (begin/update/commit). Commands are the only public write API of `packages/model` and are the seam that tests, future scripting and future collaboration will use.

---

## 5. Runtime semantics

`packages/engine` implements these rules. They are the specification; write the tests from them.

**Clock.** The engine receives `tick(nowMs)` from outside. It never calls timers itself. Each visible layer owns a timeline with a playhead, a duration, and a paused flag. If a layer has audio or video that spans the timeline, that media element is the time master and the view reports its `currentTime` into the engine; otherwise wall-clock deltas advance the playhead.

**Slide entry.** On entering a slide: resolve revisit behaviour (`reset` rebuilds from the document; `resume` restores saved object states, layer visibility and playhead; `auto` resets unless the slide has interactive objects in non-initial states, in which case it resumes). Then start the base-layer timeline at 0 and fire `timeline starts`.

**Object lifecycle.** An object is _on stage_ while the playhead is inside `[start, start+duration)`. Crossing `start` fires `enters slide` and plays the entrance animation. The exit animation plays during the last part of the object's time, finishing as the playhead reaches its end; crossing the end fires `leaves slide` (Luke, 2026-11-18). Animations are timed by the playhead, so they pause, seek and scrub with it. A motion path started by a trigger runs on the engine clock: it pauses while its layer is paused or hidden, and carries on after the timeline ends. An object whose current state is `hidden` is not rendered and receives no input even while on stage.

**States.** Each object has exactly one current state. Built-in states have automatic behaviour with no trigger needed:

- `hover` while the pointer is over the object, `down` while pressed; both revert when the condition ends.
- `selected` toggles on click when the state exists. Within a `buttonSet`, selecting one deselects the others.
- `visited` is applied after the first click and persists (it combines with `selected`: the rendered look is the last applied of the two).
- `disabled` blocks all input and all of the above. `hidden` removes the object.
- `dragOver`, `dropCorrect`, `dropIncorrect` are applied by the drag-and-drop interaction (P9).

A state renders as `normal` plus that state's overrides. A `change state` action to a state the object does not have is a no-op.

**Trigger evaluation.** When an event fires, collect every enabled trigger listening for it, sort by owner scope (object, then layer, then slide, then master) and then by `order`, and run them one at a time. Each trigger's conditions are evaluated at the moment it runs, so an earlier trigger's variable change is visible to a later one. If conditions fail and `else` is set, the else action runs. A `jump to slide` action ends evaluation of the remaining triggers for that event. Events raised by actions (for example `variable changes`) are queued and processed after the current event's triggers finish, breadth-first, with a hard cap on cascade depth to stop infinite loops (log a warning in preview when hit).

**Variables.** Project-scoped, live for the whole session, restored on resume. Text containing `%Name%` re-renders whenever that variable changes. Number-to-text formatting is locale-neutral unless the author formats it.

**Layers.** The base layer is always shown. `show layer` starts that layer's timeline from 0 (or resumes, per its revisit setting) and applies its properties: optionally hide other overlay layers, hide base objects, pause the base timeline, block clicks on the base. `hide layer` reverses those effects. Layers stack in document order.

**Lightbox.** Opens another slide in an overlay over the current one with its own engine scope for timeline and layers; variables are shared; closing returns to the untouched underlying slide.

**Completion and resume state.** The engine exposes one serialisable `SessionState`: current slide, variables, per-slide visited flag, saved object states and layer visibility for slides set to resume, quiz responses and scores. `packages/publish` drivers persist this to the LMS. Its encoding must be compact (short keys, only non-default values, then compression) because SCORM 1.2 allows only 4,096 characters of suspend data.

---

## 6. How agents work on this plan

The working rules, session checklist and definition of done are in [`AGENTS.md`](../AGENTS.md) at the repo root. In short: take the first unticked work package in section 8 whose dependencies are ticked, check `docs/briefs/` for a brief with its id, work on a `wp/<id>-<slug>` branch, prove the "Done when" line with tests, and get CI green on all three operating systems before ticking the box.

If a package needs a decision this plan does not make, choose the simplest option consistent with section 1, record it as a short ADR in `docs/adr/NNNN-title.md`, and continue. If the decision would change the saved file format in a way a migration cannot cover, the runtime rules in section 5, or the package boundaries in section 3, stop and ask Luke.

---

## 7. Milestones

| Milestone               | Reached at end of | What a person can do                                                                               |
| ----------------------- | ----------------- | -------------------------------------------------------------------------------------------------- |
| **M0 Shell**            | P0                | Launch the installed app on all three OSes                                                         |
| **M1 Walking skeleton** | P3                | Make slides with text, shapes and images; preview; publish to a folder that plays in a browser     |
| **M2 Interactive**      | P4                | Build a branching, click-to-reveal course with states, layers, triggers and variables              |
| **M3 LMS-ready**        | P5                | Publish SCORM/xAPI/cmi5 packages that track completion and resume                                  |
| **M4 Rich media**       | P6                | Narrated, animated slides with synced timelines and captions                                       |
| **M5 Assessments**      | P7                | Graded quizzes with result slides reporting scores to the LMS                                      |
| **M6 Full player**      | P8                | Menu, resources, glossary, seekbar, branded player                                                 |
| **M7 Parity push**      | P9–P11            | Advanced interactions, accessibility conformance, import, translation, signed auto-updating builds |

---

## 8. Work packages

### Phase 0 — Foundation

- [x] **P0.1 Restructure the repo.** Move to the layout in 3.1 using npm workspaces. Delete `backend/`, cert scripts, and obsolete skills. Rewrite `README.md` and `docs/development.md` for the desktop app. Add root scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `e2e`, `package`. Add `.gitattributes` to normalise line endings.
      _Done when:_ fresh clone → `npm install && npm run typecheck && npm test` passes; no reference to Express, Postgres or Vercel remains.
- [x] **P0.2 Electron shell.** _(needs P0.1)_ `electron-vite` app with main, preload and renderer; security settings from 3.3; typed IPC with one round-trip example (`app.getVersion`); native application menu skeleton (File, Edit, View, Insert, Help) with platform-correct shortcuts; window state persistence.
      _Done when:_ `npm run dev` opens a window with hot reload; an e2e test launches the app and reads the version through IPC; the renderer has no `require` or `process`.
- [x] **P0.3 Quality tooling and CI.** _(needs P0.1)_ TypeScript strict everywhere, ESLint with an import-boundary rule enforcing the dependency direction in 3.1, Prettier, Vitest, Playwright. GitHub Actions matrix on Ubuntu, macOS and Windows running typecheck, lint, unit and e2e.
      _Done when:_ CI is green on all three; a deliberate `engine → react` import fails lint.
- [x] **P0.4 Packaging smoke test.** _(needs P0.2, P0.3)_ `electron-builder` config producing AppImage + deb, dmg (unsigned for now), and NSIS installer; CI uploads them as artifacts.
      _Done when:_ each artifact installs and launches on its OS. Signing and auto-update are P11.

> **Phase 0 status (2026-11-15):** complete. CI is green on Linux, macOS and Windows for verify and package jobs; each packaged app is launched by the e2e suite in CI.

### Phase 1 — Model and project file

- [x] **P1.1 Schema.** Zod schema for section 4.1–4.2 limited to what P2–P4 need (project, scenes, slides, layers, text/shape/image/button/group objects, states, triggers, variables, assets, theme). ID generation, `createEmptyProject()`, `formatVersion = 1`, and a migration runner (ordered functions `vN → vN+1`).
      _Done when:_ round-trip test (create → serialise → parse → deep-equal); invalid documents fail with a path-specific error; a dummy v0→v1 migration is exercised by a fixture.
- [x] **P1.2 Commands and undo.** _(needs P1.1)_ Command registry, patch-based undo/redo, gesture coalescing, change events. First commands: add/remove/reorder scene and slide; add/remove/update/reorder object; rename; set stage size.
      _Done when:_ property-based test — any random command sequence followed by the same number of undos yields the original document.
- [x] **P1.3 Project container and asset store.** _(needs P1.1, P0.2)_ Main-process implementation of 3.4: new, open, save, save-as, recent files, dirty tracking with close confirmation, autosave, crash recovery, asset import by hash, the `vedraopus-asset://` protocol, OS file association for `.vedraopus`.
      _Done when:_ e2e — create project, import an image, save, quit, reopen, image present; kill the process mid-edit, relaunch, recovery restores the edit; importing the same file twice stores it once.
- [x] **P1.4 Fixtures.** _(needs P1.1)_ `fixtures/` with hand-written sample projects that grow with each phase (`minimal`, `two-slides`, later `states-and-triggers`, `quiz-basic`, …) plus a script that validates every fixture against the current schema in CI.

### Phase 2 — Editor core

- [x] **P2.1 Application shell.** _(needs P0.2, P1.2)_ Layout: top toolbar/ribbon with tabs (Home, Insert, Design, Transitions, Animations, View); left scenes-and-slides panel; centre stage; bottom tabbed panel (Timeline, States, Notes); right panel (Triggers, Slide Layers). Resizable, collapsible, layout persisted. Two top-level views: Overview and Slide View. Light and dark themes. Our own visual design.
      _Done when:_ panels render placeholder content, resize, and restore after restart.
- [x] **P2.2 Stage and direct manipulation.** _(needs P2.1, P2.3 renderers)_ Scaled stage with zoom (fit, percent, Ctrl+wheel) and pan; click, shift-click and marquee selection; move, resize from 8 handles (shift = keep ratio, alt = from centre), rotate; arrow-key nudge; smart guides and snapping to objects, stage edges and centre; rulers, grid, draggable guides; align, distribute, z-order; group/ungroup; lock; cut/copy/paste/duplicate, including across slides and app instances via the system clipboard; context menu. All geometry maths in a pure, unit-tested module.
      _Done when:_ e2e covers draw → move → resize → rotate → undo each; geometry tests cover rotated-resize and group transforms.
- [x] **P2.3 Object renderers v1.** _(needs P1.1)_ In `packages/render`: shapes (rectangle, rounded rectangle, ellipse, triangle, line, arrow, a starter set of polygons and callouts) as SVG with fill (solid, gradient, image), outline (colour, width, dash), shadow, opacity; images with crop and fit; buttons; groups.
      _Done when:_ visual snapshot tests for each type pass in Chromium, Firefox and WebKit.
- [x] **P2.4 Text.** _(needs P2.2)_ TipTap-based in-place editing on stage for text boxes and text inside shapes/buttons: font, size, bold/italic/underline, colour, alignment, lists, line and paragraph spacing, links, autofit modes (shrink text, grow shape, fixed). Static serializer in `render` producing identical output without the editor. Bundled open-licence fonts; system fonts allowed with a publish-time warning.
      _Done when:_ snapshot test — editor rendering and static rendering of the same document are pixel-equal within tolerance. Visual parity covered by `packages/render/visual/text-parity.spec.ts` (Chromium/Firefox verified locally 2026-11-16; WebKit/CI unverified — no Actions minutes this month).
- [x] **P2.5 Format and theme.** _(needs P2.3)_ Format panel for the selected object(s); theme colours and theme fonts with objects referencing theme slots; format painter; stage size change with scale/crop options.
- [x] **P2.6 Overview.** _(needs P2.1)_ Scenes as containers of slide thumbnails; add, rename, reorder, duplicate, delete scenes and slides; drag slides between scenes; set starting scene; thumbnails generated off-screen and cached. Link arrows between slides appear once triggers exist (P4).
- [x] **P2.7 Slide masters and layouts.** _(needs P2.2)_ Master view; masters own layouts; slides pick a layout; master objects render beneath slide objects and are not selectable in Slide View; placeholders (title, content).
      _Done when:_ editing a master updates every slide using it; fixture `masters` round-trips.

### Phase 3 — Engine, player, preview, web publish → **M1**

- [x] **P3.1 Engine core.** _(needs P1.1)_ `packages/engine`: session, slide entry/exit, layer timelines, injectable clock, object lifecycle per section 5, navigation (next, previous, jump), event bus, `SessionState` serialise/restore. No triggers yet beyond built-in prev/next.
      _Done when:_ unit tests with a fake clock assert object enter/leave times, pause/resume/seek, and navigation history.
- [x] **P3.2 Player view.** _(needs P3.1, P2.3)_ `packages/player`: mounts the engine, renders the current slide with `render`, scales the stage to fit the viewport, runs the rAF loop, forwards pointer and keyboard input. Minimal frame: title, previous/next. Built as a single self-contained JS + CSS bundle with no network dependencies.
      _Done when:_ the `two-slides` fixture plays in a plain HTML page in all three browser engines.
- [x] **P3.3 Timeline panel.** _(needs P2.1, P3.1)_ One row per object with a draggable bar for start and duration; row order = z-order and is reorderable; show/hide and lock toggles; rename; playhead with scrub; play/pause; zoom; "show until end"; align to playhead; cue points (add, move, delete).
      _Done when:_ scrubbing the playhead shows the stage exactly as the engine would at that time (test compares against engine output).
- [x] **P3.4 Preview.** _(needs P3.2, P1.3)_ Preview this slide / this scene / entire project in the sandboxed preview window, using the export data path from P3.5. Replay, close, and "edit" returns to the previewed slide.
- [x] **P3.5 Web publish.** _(needs P3.2)_ `packages/publish`: `publish(project, target, options) → folder`. Output: `index.html`, the player bundle, `content/data.js` (project data assigned to a global, so the course runs from `file://` and inside any LMS without fetch), `content/assets/…`. Publish dialog with title, output folder, and a "view published course" action. Runs in a worker or utility process with progress and cancel.
      _Done when:_ e2e publishes `two-slides`, serves the folder, and Playwright navigates the course; the same output opens from `file://`.

### Phase 4 — Interactivity → **M2**

- [x] **P4.1 States.** _(needs P3.1, P2.5)_ Engine state machine per section 5. States panel: add (built-in or custom), duplicate, delete, reset; "edit states" mode where stage edits write into the selected state's overrides; initial state picker; button sets.
      _Done when:_ engine tests cover every built-in state's automatic behaviour, including button sets and visited+selected.
- [x] **P4.2 Variables.** _(needs P3.1)_ Variables manager (create, rename with reference update, delete with usage check, default value, usage count); `%Name%` references in text with an insert picker; built-in variables.
- [x] **P4.3 Triggers.** _(needs P4.1, P4.2)_ Engine trigger evaluation exactly per section 5. Trigger panel grouped by owner (slide, each object, player buttons), with ordering controls, enable/disable, copy/paste. Trigger wizard: action → target → event → conditions, written as an editable sentence. First events and actions: click, hover in/out, key press, timeline start/end/reaches, state changes, variable changes; change state, show/hide layer, jump to slide, set variable, pause/resume timeline, open URL. The remaining events and actions in 4.2 land with the feature that needs them.
      _Done when:_ engine tests cover ordering, condition timing, else branches, cascade queueing and the loop cap; e2e builds a click-to-reveal interaction and plays it in preview.
- [x] **P4.4 Slide layers.** _(needs P4.3)_ Layers panel: add, duplicate, rename, reorder, delete, per-layer visibility in the editor; each layer has its own timeline; layer properties per section 5.
      _Done when:_ fixture `states-and-triggers` (tabs interaction built from layers) plays identically in preview and web publish.
- [x] **P4.5 Slide properties and Overview links.** _(needs P4.3)_ Advance, revisit behaviour, per-slide player controls; Overview draws arrows from jump triggers and flags unreachable slides.
- [x] **P4.6 JavaScript trigger.** _(needs P4.3)_ "Execute JavaScript" action with a documented, stable player API: `getVar`, `setVar`, `object(name)` with state and visibility access. Runs only in the player, never in the editor process.

### Phase 5 — LMS publishing and tracking → **M3**

All drivers implement one interface so the engine is unaware of the LMS: `init()`, `getBookmark()/setBookmark()`, `getSuspendData()/setSuspendData()`, `setCompletion()`, `setSuccess()`, `setScore()`, `recordInteraction()`, `commit()`, `terminate()`.

- [x] **P5.1 Tracking model.** _(needs P3.1)_ Completion by: number of slides viewed, a result slide (from P7; stub until then), or a "complete course" trigger. Reporting status pair options (passed/failed, completed/incomplete, and so on). Resume: always, never, or prompt.
- [x] **P5.2 SCORM 1.2.** _(needs P5.1, P3.5)_ Valid `imsmanifest.xml` with schema files, single SCO. API discovery (`API`, walking `parent` and `opener`). Writes `cmi.core.lesson_status`, `score.raw/min/max`, `lesson_location`, `suspend_data`, `session_time`, `exit`, and `cmi.interactions.n.*`. Commit on slide change and on unload. Suspend-data encoder with compression and a size guard that degrades gracefully (drops per-slide resume detail before dropping variables) and warns at publish time.
      _Done when:_ Playwright runs the package against an in-repo mock SCORM 1.2 API and asserts the call sequence, completion and resume; a 100-slide fixture stays under 4,096 characters; manual check on SCORM Cloud recorded in the log.
      _Outstanding:_ the SCORM Cloud check (Luke, later). The schema files were added in session 30. See `logs/2026-11-17-session-29.md` and `-30.md`.
- [x] **P5.3 SCORM 2004.** _(needs P5.2)_ 3rd and 4th editions (2nd as a manifest variant). `API_1484_11`, `cmi.completion_status`, `cmi.success_status`, `cmi.score.scaled`, `cmi.location`, `cmi.suspend_data`, `cmi.exit = suspend`, interactions. Simple single-SCO sequencing only.
      _Decided:_ 3rd-edition packages ship without schema files, because IMS requires anyone distributing them to register first (Luke, 2026-11-17: leave as is). _Outstanding:_ the SCORM Cloud check (Luke, later). See `docs/briefs/P5.3-scorm-2004.md` and `logs/2026-11-17-session-31.md`.
- [x] **P5.4 xAPI.** _(needs P5.1)_ `tincan.xml` package; launch parameters (`endpoint`, `auth`, `actor`, `registration`, `activity_id`); statements for initialized, experienced (per slide), answered, passed/failed, completed, terminated; resume via the State API; statement queue with retry.
      _Done when:_ tests run against a mock LRS and validate statement shape.
      _Outstanding:_ a check against a real LRS (Luke, later). See `docs/briefs/P5.4-xapi.md` and `logs/2026-11-17-session-32.md`.
- [x] **P5.5 cmi5.** _(needs P5.4)_ `cmi5.xml`, fetch-URL auth token exchange, required statement order and context, `moveOn` criteria, return URL.
      _Outstanding:_ a check against a real cmi5 LMS (Luke, later). See `docs/briefs/P5.5-cmi5.md` and `logs/2026-11-17-session-33.md`.
- [x] **P5.6 Publish UI.** _(needs P5.2)_ Targets: Web, LMS (choose standard and edition), with identifier, version, description, reporting options, zip output, and a remembered configuration per project.
      Done in session 34: `docs/briefs/P5.6-publish-ui.md`. Saved format 5 keeps the settings with the project; the output folder is remembered per computer.

AICC is deliberately omitted unless a customer needs it.

### Phase 6 — Media and animation → **M4**

- [x] **P6.1 Audio.** Import (mp3, m4a, wav, ogg); waveform row in the timeline; audio as time master; volume; play/pause/stop media actions and `media completes` event; record narration from the microphone.
      Done in session 36: `docs/briefs/P6.1-audio.md`. Saved format 6 adds audio objects, media actions and the media-completes event.
- [x] **P6.2 Video.** Import mp4/webm; poster; trim in/out; show controls or not; play on timeline start or on click; picture-in-picture off by default.
      Done in session 37: `docs/briefs/P6.2-video.md`. Saved format 7 adds video objects; media longer than the timeline now lengthens it on insert.
- [x] **P6.3 Media pipeline.** Bundle an LGPL build of ffmpeg as a side binary, invoked from the main process, to normalise imports and recordings to widely playable formats (H.264/AAC mp4, mp3) and to produce waveforms and posters. Record the licence obligations in `docs/licences.md`. _(Confirm with Luke before bundling — see section 10.)_
      Done in session 38: `docs/briefs/P6.3-media-pipeline.md`. Luke chose WebM (VP9, Opus) and MP3 instead of H.264/AAC. _Outstanding before public release:_ a minimal LGPL build of our own for each platform, macOS included, with no H.264/AAC code; reading H.264/AAC on Windows and macOS through the operating system's decoders (Linux reads only royalty-free formats and refuses the rest, Luke's decision); the source offer; and third-party notices in the app (`docs/licences.md`).
- [x] **P6.4 Closed captions.** Import and export VTT/SRT; caption editor synced to the waveform; captions toggle in the player.
      Done in session 39: `docs/briefs/P6.4-captions.md`. Saved format 8 (`props.captions` on audio and video, in the file's own time), a Captions tab in the bottom panel, and a CC button in the player.
- [x] **P6.5 Animations.** Entrance and exit effects (fade, fly, float, wipe, grow, spin, and the rest of a standard set) with duration, direction, and by-paragraph sequencing for text; motion paths (line, arc, freeform, relative start) with the `move along path` action and `animation completes` event. All driven through WAAPI by the engine clock so scrubbing works.
      Done in session 40: `docs/briefs/P6.5-animations.md`. Saved format 9; twelve effects, three path shapes, the Animations tab, paths edited and drawn on the stage. Luke settled the exit timing (it finishes at the object's end) and the path clock (§5 reworded). Motion offsets are applied with the CSS `translate` property from the engine's numbers rather than as WAAPI animations.
- [x] **P6.6 Slide and layer transitions.** Fade, push, cover, uncover, and similar, with duration and direction.
      Done in session 41: `docs/briefs/P6.6-transitions.md`. Saved format 10; eight kinds for slides and overlay layers, the Transitions tab with Preview and Apply to all. Transitions only draw: §5 is unchanged.
- [x] **P6.7 Zoom regions and cue-point workflow.** Zoom region objects on the timeline; "align to cue point"; add cue points while audio plays (keyboard shortcut).
      Done in session 42: `docs/briefs/P6.7-zoom-and-cues.md`. Saved format 11 (`zoomRegion` objects); the engine's camera; the editor's Play now plays the layer's sound, C adds a cue while it plays, and objects align to cue points.
- [x] **P6.8 Text-to-speech.** Pluggable provider interface; ships with OS voices only. Cloud voices are an opt-in later decision.
      Done in session 43: `docs/briefs/P6.8-text-to-speech.md`. Saved format 12 (`props.speech` on sounds). Luke chose espeak-ng on Linux when installed (nothing bundled); macOS `say` and Windows SAPI are written but not checked until December.

### Phase 7 — Quizzing → **M5**

- [x] **P7.1 Question model and Form View.** Question slides with a form editor alongside Slide View: prompt, choices, correct answers, score (by question or by choice), attempts, shuffle, feedback (by question, by choice, none), branching per feedback, required/optional.
      Done in session 46: `docs/briefs/P7.1-question-model.md`. Saved format 13 (`slide.question`, `choice` objects, `submitInteraction`). Luke chose linked objects, multiple choice and multiple response first, and a working Submit (feedback layers stay in P7.5).
- [x] **P7.2 Graded types.** True/false, multiple choice, multiple response, fill in the blank, word bank, matching (drag and drop, dropdown), sequence (drag and drop, dropdown), numeric, hotspot.
      Done in session 49: `docs/briefs/P7.2-graded-types.md`. Saved format 14; all eleven kinds are inserted, edited in Form View, marked, kept and answered in the course, with drag placement and click-to-mark hotspots.
- [x] **P7.3 Survey types.** Likert, pick one, pick many, which word, short answer, essay, ranking, how many.
      Done in session 51: `docs/briefs/P7.3-survey-types.md`. Saved format 15; all eight kinds are inserted from Insert → Survey, edited in Form View, answered (never right or scored) and kept in the course; essays are multiline text entries.
- [x] **P7.4 Freeform questions.** Convert any slide into a question: pick one, pick many, drag and drop (with drop targets, snapping, return-to-start options, and the three drag states), text entry, hotspot, shortcut key.
      Done in session 52: `docs/briefs/P7.4-freeform-questions.md`. Saved format 16; Insert → Convert Slide makes any of the six kinds from the slide's own objects, chosen in Form View.
- [x] **P7.5 Feedback.** Correct / incorrect / try again layers generated from feedback masters; Submit behaviour and `submit interaction` action; review mode showing the learner's and the correct answers.
      Done in session 53: `docs/briefs/P7.5-feedback.md`. Saved format 17; Luke chose an editable feedback master, words in the layers, review as an engine mode with a `reviewQuiz` action, and by-choice words on the shared layer.
- [x] **P7.6 Question banks and draws.** Banks; draw N questions randomly or in order; lock specific questions into a draw.
      Done in session 54: `docs/briefs/P7.6-banks-and-draws.md`. Saved format 18; banks in the slide list, draw slides with a Draw form, draws made once per session and kept on resume.
- [x] **P7.7 Result slides.** Graded and survey results; choose which questions or other result slides to combine; pass mark; timer; show score, review quiz, retry quiz, print results; built-in score variables; hook into P5 tracking and `cmi.interactions` / `answered` statements with correct interaction types.
      Done in session 55: `docs/briefs/P7.7-result-slides.md`. Saved format 19; result slides with pass mark, timer, review, retry and print, tracking by result, and interactions to every LMS standard. Phase 7 is complete (milestone M5).
      _Done when:_ fixture `quiz-basic` reports the expected score, status and per-question interactions to the mock SCORM 1.2, SCORM 2004 and xAPI harnesses, and resumes mid-quiz.

### Phase 8 — Player and course-level features → **M6**

- [x] **P8.1 Player frame.** Menu (auto-generated from scenes and slides, editable titles, hide items, free / restricted / locked navigation), seekbar (with drag enable/disable), previous/next/submit, volume, captions toggle, playback speed, full screen, accessibility controls, course title, logo.
- [x] **P8.2 Player tabs.** Resources (files and links), glossary, slide notes, custom tabs that open a lightbox slide or fire triggers.
- [x] **P8.3 Player appearance and text labels.** Colours, fonts, light/dark, layout of controls, editable label strings per language (foundation for P10 localisation), saved player presets.
- [x] **P8.4 Lightbox slides.** `open lightbox` / `close lightbox` actions per section 5, with optional navigation controls.
- [x] **P8.5 Responsive behaviour.** Scale to fit any viewport; touch input and gestures; mobile chrome that collapses the sidebar; orientation handling.
- [x] **P8.6 Resume prompt, course restart, exit behaviour, and remaining trigger actions** from 4.2 (send email, print, restart).

### Phase 9 — Advanced objects and interactions

- [x] **P9.1 Hotspots and markers** (markers with title, text, media, audio; pulse animation).
- [x] **P9.2 Data-entry fields** (text and numeric entry bound to variables; `control loses focus` event).
- [x] **P9.3 Checkboxes and radio buttons** as stock stateful objects.
- [x] **P9.4 Sliders and dials** bound to number variables, with range, step and their move events.
- [x] **P9.5 Scrolling panels.**
- [x] **P9.6 Web objects** (URL or local folder embedded in a sandboxed iframe; in-slide or new window).
- [x] **P9.7 Intersection events** (`objects intersect` / `stop intersecting`) and drag-and-drop outside quiz slides.
- [x] **P9.8 Icons and illustrations library** using an openly licensed icon set; searchable insert dialog.
- [x] **P9.9 Tables.**
- [x] **P9.10 360° images** with hotspots and markers (guided or free exploration).
- [x] **P9.11 Screen recording** inserted as video (step-by-step "try/test" modes are a later stretch).

### Phase 10 — Accessibility and localisation

- [x] **P10.1 Published-output accessibility to WCAG 2.2 AA.** Semantic roles for every object type, alt text, a focus-order editor, visible focus, full keyboard operation including a keyboard alternative for drag-and-drop, skip navigation, live-region announcements for layer and feedback changes, reduced-motion support, learner-adjustable text (accessible text mode), contrast checks.
      _Done when:_ axe-core runs clean on every fixture in CI and a manual screen-reader pass (NVDA, VoiceOver) is logged.
- [x] **P10.2 Authoring-side accessibility checker** listing missing alt text, focus-order problems, low contrast, missing captions.
- [x] **P10.3 Translation.** Export all text (slides, states, layers, notes, player labels, quiz content) to XLIFF and to a two-column document; re-import; right-to-left support; per-language player label sets.
- [x] **P10.4 Editor UI localisation** scaffolding (string catalogue; English only at first).

### Phase 11 — Import, templates, distribution

- [x] **P11.1 PowerPoint import.** Parse PPTX: slides, masters and layouts, text, shapes, images, notes, basic animations and transitions mapped to ours; unsupported content rasterised with a report.
- [x] **P11.2 Templates and reusable content.** Save project as template; import slides from another project or template; built-in starter templates of our own design.
- [x] **P11.3 Additional publish targets.** Video (mp4 render of a linear run-through), printable handout (PDF/Word of slides and notes). _As built: the video is WebM (VP9, Opus), not mp4, by Luke's decision; see `docs/briefs/P11.3-video-and-handout.md`._
- [x] **P11.4 Signing and auto-update.** macOS Developer ID signing and notarisation, Windows code signing, `electron-updater` with a release channel; Linux AppImage update.
- [x] **P11.5 Hardening.** Performance budget (200-slide project opens in under 3 s and edits at 60 fps on a mid-range laptop), large-asset handling, crash reporting (opt-in), telemetry off by default.

---

## 9. Verification strategy

| Layer                | Tool                                                   | What it proves                                                   |
| -------------------- | ------------------------------------------------------ | ---------------------------------------------------------------- |
| `model`              | Vitest, property-based tests                           | Schema round-trips, migrations, command/undo correctness         |
| `engine`             | Vitest with a fake clock                               | Every rule in section 5, written as executable cases             |
| `render`             | Playwright screenshot tests in three browser engines   | Objects look the same everywhere, editor and static text match   |
| `player` + `publish` | Playwright against published fixtures                  | The actual shipped output plays, in Chromium, Firefox and WebKit |
| LMS drivers          | In-repo mock SCORM 1.2 / 2004 API hosts and a mock LRS | Correct call sequences, data-model values, resume                |
| App                  | Playwright in Electron mode on the CI matrix           | Real authoring flows on Linux, macOS, Windows                    |
| Manual               | SCORM Cloud plus one real LMS per milestone from M3    | Nothing mocks reality perfectly; results go in the session log   |

**The parity rule in practice:** each fixture project has a recorded "golden run" (a scripted sequence of inputs and the expected engine state after each). The same script runs against the engine alone, against preview, and against the published web build. All three must agree.

---

## 10. Decisions for Luke

Agents proceed on the default in each row until Luke says otherwise.

| #   | Question                                                                                                                                                                                                   | Default                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 1   | Electron confirmed? (Tauri is the main alternative: smaller installers, but the player would be tested against three different system webviews in the editor and media/recording support is less uniform.) | **Electron**                            |
| 2   | Delete `backend/` and the Vercel/Postgres direction entirely?                                                                                                                                              | **Yes**, in P0.1. Git history keeps it. |
| 3   | Default stage size                                                                                                                                                                                         | **1280×720**                            |
| 4   | Bundle ffmpeg (LGPL build) for media normalisation?                                                                                                                                                        | **Yes, at P6.3**, after a check-in      |
| 5   | AICC support                                                                                                                                                                                               | **No**                                  |
| 6   | Any cloud features (review links, team libraries, AI-assisted content)?                                                                                                                                    | **None planned.** Local-first only.     |
| 7   | Product licence — README says MIT. Open source for real?                                                                                                                                                   | **Unchanged** until told                |
| 8   | Product name in the UI                                                                                                                                                                                     | **Vedra Opus**                          |

---

## 11. Feature map

Where each Storyline-equivalent capability lands.

| Capability                                                                   | Phase                       |
| ---------------------------------------------------------------------------- | --------------------------- |
| Overview, scenes, Slide View                                                 | P2                          |
| Text, shapes, images, buttons, groups                                        | P2                          |
| Slide masters, layouts, themes                                               | P2                          |
| Timeline, cue points                                                         | P3, P6                      |
| Preview (slide, scene, project)                                              | P3                          |
| Publish to web                                                               | P3                          |
| States, button sets                                                          | P4                          |
| Variables and references in text                                             | P4                          |
| Triggers and conditions                                                      | P4 (core), then per feature |
| Slide layers                                                                 | P4                          |
| JavaScript triggers                                                          | P4                          |
| SCORM 1.2, SCORM 2004, xAPI, cmi5; resume                                    | P5                          |
| Audio, video, recording, captions                                            | P6                          |
| Animations, motion paths, transitions, zoom regions                          | P6                          |
| Text-to-speech                                                               | P6                          |
| Graded, survey and freeform questions; banks; results                        | P7                          |
| Feedback masters and layers                                                  | P7                          |
| Player menu, seekbar, resources, glossary, notes, branding                   | P8                          |
| Lightbox slides                                                              | P8                          |
| Mobile and touch                                                             | P8                          |
| Hotspots, markers, sliders, dials, data entry, scrolling panels, web objects | P9                          |
| Icons library, tables, 360° images, screen recording                         | P9                          |
| Accessibility (output and checker)                                           | P10                         |
| Translation export/import, RTL                                               | P10                         |
| PowerPoint import                                                            | P11                         |
| Templates, slide import                                                      | P11                         |
| Video and handout publishing                                                 | P11                         |
| Signed installers, auto-update                                               | P11                         |
| Hosted review/commenting service, stock content library, AI assistant        | Not planned                 |

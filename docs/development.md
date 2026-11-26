# Development Guide

Read [PLAN.md](PLAN.md) first: it explains what is being built, in what order, and the rules every change follows. This guide covers the mechanics.

## Prerequisites

- Node.js 22.12 or newer (CI uses 24)
- Git

No database, no services, no environment variables.

## Setup

```bash
git clone https://github.com/lpgeach/vedra-opus-source.git
cd vedra-opus-source
npm install
npm run dev
```

`npm install` at the root installs every workspace. Add a dependency to a specific workspace with `npm install -D <pkg> -w @vedraopus/<name>`.

Then `npm run fetch:ffmpeg` once: it builds our own LGPL ffmpeg for the media pipeline from pinned sources into `vendor/ffmpeg/` (`scripts/build-ffmpeg.sh`, about ten minutes). It needs:

- **macOS:** the Xcode Command Line Tools (`xcode-select --install`);
- **Linux:** `build-essential`;
- **Windows:** WSL, with `build-essential` and `mingw-w64` installed in it (`sudo apt install build-essential mingw-w64`). The Windows build is cross-compiled there.

On Windows and macOS it also builds `vo-decode` (`scripts/build-decoder.sh`), our small program that reads H.264, AAC and the like through the system's own decoders (`docs/briefs/R3-os-decoders.md`). Without it, imported media are kept as they are, and the pipeline's tests fail. See `docs/briefs/R1-own-ffmpeg-builds.md` and `docs/licences.md`.

And `npm run fetch:libreoffice` once: it downloads the pinned LibreOffice (Linux, Windows and macOS), keeps only what drawing a PowerPoint deck's charts and SmartArt needs, checks the trim and draws a smoke deck with it, into `vendor/libreoffice/`. It is a few hundred MB to download, and takes a minute or two. Without it, imported charts and SmartArt stay as placeholders, and the test that draws them is skipped. See `docs/briefs/P11.1-pptx-import.md` (part D).

On Linux, install espeak-ng for text-to-speech (`sudo pacman -S espeak-ng` or `sudo apt install espeak-ng`). Without it, Text to Speech says no voices are installed, and the real-speech tests are skipped. macOS and Windows use their own voices. See `docs/briefs/P6.8-text-to-speech.md`.

## Everyday commands

```bash
npm run dev          # app with hot reload (renderer) and restart-on-change (main)
npm run typecheck
npm run lint
npm test             # unit tests
npm run e2e          # builds, then drives the real Electron app
npm run format
```

Run all four checks (typecheck, lint, test, e2e) before calling a work package done. CI runs them on Linux, macOS and Windows.

## How the app is put together

Three processes, three build targets (configured in `apps/desktop/electron.vite.config.ts`):

| Part           | Runs in              | Can use                             | Notes                                              |
| -------------- | -------------------- | ----------------------------------- | -------------------------------------------------- |
| `src/main`     | Node (Electron main) | Node, Electron                      | Owns windows, menus, disk and OS access            |
| `src/preload`  | Sandboxed preload    | `contextBridge`, `ipcRenderer` only | Built as one CommonJS file — a sandbox requirement |
| `src/renderer` | Chromium, sandboxed  | Browser APIs, React                 | No `require`, no `process`, no Node                |

The renderer talks to main only through `window.vedraopus`.

### Adding an IPC call

1. In `apps/desktop/src/shared/ipc.ts`: add the channel to `ipcChannels` with a Zod schema for its arguments, add its result type to `IpcResults`, and add the method to `VedraOpusApi`.
2. In `src/main/ipc.ts`: add the handler. The compiler errors until you do. Arguments are validated against the schema before your handler runs.
3. In `src/preload/index.ts`: expose the method.
4. Cover it with an e2e test.

### Dependencies are bundled

Everything except Electron and Node built-ins is bundled into the build output, so the packaged app ships no `node_modules`. Keep all dependencies in `devDependencies`. Avoid native Node modules; they complicate packaging on three platforms.

## Project files

A project is one `.vedraopus` file: a zip of `project.json`, `meta.json` and `assets/<sha256>.<ext>`. The code is in `apps/desktop/src/main/project/`.

| File           | Does                                                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `container.ts` | Reads and writes the zip. Saves are built beside the target and renamed over it. Only known entry names are ever extracted.  |
| `workspace.ts` | The unpacked working copy under `<userData>/workspaces/<id>/` while a project is open; finds crash leftovers at launch.      |
| `assets.ts`    | Imports media by content hash; the allow-list of file types.                                                                 |
| `protocol.ts`  | Serves `vedraopus-asset://<workspaceId>/<hash>` to the renderer.                                                             |
| `recent.ts`    | Recent-files list.                                                                                                           |
| `session.ts`   | The one open project: open, autosave, save, unsaved-changes prompt, recovery. The only file here that uses Electron dialogs. |

How it flows: the renderer owns the document (`createHistory` in `src/renderer/project-store.ts`) and sends the serialised project to main after every change. Main keeps the latest copy, marks the project dirty, and writes the working copy shortly after. Save packs the working copy into the `.vedraopus` file. A working copy still on disk at the next launch with unsaved changes is offered for recovery.

In e2e tests, native dialogs are replaced with canned answers by `answerDialogs` in `e2e/launch.ts`.

## The editor window

The renderer's editor lives in `apps/desktop/src/renderer/`. Design decisions are in `docs/briefs/P2.1-application-shell.md`.

| File                      | Does                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `project-store.ts`        | The open project: its edit history, file status, which view is showing and which slide is current.                           |
| `ui-store.ts`             | How the editor is arranged: panel sizes, collapsed panels, panel tabs, theme. Loaded from main at start-up, saved on change. |
| `layout.ts`               | Pure rules for panel sizes (minimums, keeping room for the stage). Unit tested; no DOM.                                      |
| `components/Editor.tsx`   | Top bar, ribbon, Slide View (panels around the stage) or Overview, status bar.                                               |
| `components/panels.tsx`   | The left, bottom and right panels and their collapsed rails.                                                                 |
| `components/Ribbon.tsx`   | Ribbon tabs and commands. A command with no `onClick` shows disabled until its work package builds it.                       |
| `components/Splitter.tsx` | The draggable, keyboard-operable divider beside each panel.                                                                  |
| `components/icons.tsx`    | The icon set, drawn for this project. Add icons here; do not add an icon library.                                            |
| `index.css`               | All styling. Colours are custom properties defined once as `light-dark(light, dark)`.                                        |

Settings (`src/shared/settings.ts`) are stored by main in `<userData>/settings.json`. They are application state and never go in a project file. Reading tolerates a missing, damaged or partly invalid file by falling back to defaults part by part.

The theme is applied twice from the same setting: main sets `nativeTheme.themeSource` for native menus and dialogs, and the page sets `data-theme` on `<html>`, which switches `color-scheme`. Do not rely on `prefers-color-scheme` following `nativeTheme` — it does not in headless test runs.

To add a panel tab, ribbon command or menu command that the renderer carries out: menu items send `event:menuCommand` (add the name to the union in `shared/ipc.ts` and handle it in `App.tsx`); give the menu item an `id` so an e2e test can choose it.

### Adding words to the editor

The editor's own words come from the string catalogue (`src/shared/strings/`, `docs/briefs/P10.4-ui-strings.md`), so the editor can be translated later.

- **New or changed editor text goes through `t()`:** add the English to `en.ts` under a dotted key named by place (`menu.file.save`, `ribbon.textBox`), and write `t('ribbon.textBox')` where it is shown. `{name}` placeholders are filled by `t('welcome.version', { version, platform })`.
- **Call `t()` where the words are drawn,** never in a module-level constant: the language is set at start-up, after modules load.
- **A key made from a template** (``t(`ribbon.tab.${id}`)``) is typed by TypeScript, and the catalogue test counts its keys as used by their fixed start.
- `strings.test.ts` fails on a key used but missing, and on a key nothing uses.
- **To see what is not yet in the catalogue,** start the app with `VEDRAOPUS_UI_LOCALE=qps-ploc`. Catalogue words show as `⟦Pséüdö · ·⟧`, a third longer; anything else is still written in its component.
- So far the menu, the Welcome screen, the top bar, the ribbon's tabs, the Home and Insert tabs and the right panel's tabs are in the catalogue. The rest moves as those surfaces are touched.
- The course's own words are not here: they are the player's (`labelText` in the model).

## Packages

`packages/*` are consumed as TypeScript source (each `package.json` exports `./src/index.ts`); there is no per-package build step.

Dependency direction is `model ← engine ← render ← player ← publish ← apps/desktop`, and `model` and `engine` must not import React, Node or Electron. Two things enforce this:

- ESLint `no-restricted-imports` rules generated in `eslint.config.js`
- `model`, `engine` and `publish` compile without DOM types, so using `document` there is a type error

### The stage

`apps/desktop/src/renderer/stage/` is where objects are drawn and manipulated. The rule that keeps it testable: **maths in pure modules, events in `Stage.tsx`**.

| File             | Does                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| `geometry.ts`    | Pure maths in stage units: rotation, hit testing, bounds, resize, scale, rotate. Unit and property tested. |
| `transform.ts`   | Pure: applies a frame change to objects, descending into groups and re-boxing them.                        |
| `actions.ts`     | What the ribbon, menu and keyboard call: insert, nudge, delete, select all, undo, redo.                    |
| `RenderTree.tsx` | Draws a `RenderNode` from `@vedraopus/render` with React; one memoised component per object.               |
| `Selection.tsx`  | Selection outline, handles and marquee, in screen pixels so they do not scale with zoom.                   |
| `Stage.tsx`      | Viewport, zoom, pan, and turning pointer and key events into calls to the modules above.                   |

Every change goes through a history command. A drag opens a gesture (`editor.beginGesture`), sends `object.update` on each pointer move, and commits on release, so it is one undo step; Escape cancels it. Selection and zoom live in `project-store.ts`, not in the project. Decisions, and what is still to build, are in `docs/briefs/P2.2-stage.md`.

### The render package

`@vedraopus/render` draws objects. `renderObject(object, context)` is a pure function returning a `RenderNode` — plain data describing markup — and three thin back ends make it real: `toMarkup` (an escaped HTML string), `toDom` (DOM nodes, for the player), and a React adapter the editor will add in P2.2. Keep renderers pure and free of React: the player ships this package.

| File          | Does                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------- |
| `node.ts`     | `RenderNode`, the `h()` builder, `toMarkup`, `toDom`.                                    |
| `context.ts`  | `RenderContext`: theme, stage size, asset URLs, id prefix. `resolveColor`.               |
| `geometry.ts` | Pure maths: shape outlines as SVG paths, gradient lines, crop and cover placement.       |
| `objects.ts`  | The wrapper every object shares, and the renderer for each object type, layer and slide. |
| `text.ts`     | Provisional plain-text drawing. P2.4 replaces it with the rich-text serializer.          |

Design decisions (how lines use their frame, gradient angles, why groups have no size) are in `docs/briefs/P2.3-object-renderers.md`. To add an object type: add its renderer and a `case` in `renderObject` (the compiler flags a missing one), unit tests for its structure, and visual cases.

## Testing

| Kind       | Where                                                    | Tool                         |
| ---------- | -------------------------------------------------------- | ---------------------------- |
| Unit       | `packages/*/src/**/*.test.ts`, `apps/*/src/**/*.test.ts` | Vitest                       |
| End-to-end | `e2e/*.spec.ts`                                          | Playwright driving Electron  |
| Visual     | `packages/render/visual/*.spec.ts`                       | Playwright in three browsers |

E2E tests launch the app through `e2e/launch.ts`, which gives each run a throwaway user-data directory. On a Linux desktop the tests run without showing any window; set `VEDRAOPUS_E2E_SHOW=1` to watch them. To run the same tests against a packaged build:

```bash
npm run package
VEDRAOPUS_E2E_EXECUTABLE=apps/desktop/release/linux-unpacked/vedraopus npx playwright test
```

### Visual tests

`npm run test:visual` draws each case in `packages/render/visual/` in Chromium, Firefox and WebKit and compares every one with the same reference image in `packages/render/visual/__snapshots__/`. Sharing one reference across engines is the point: it shows objects look the same everywhere. A small tolerance (set in `playwright.render.config.ts`) allows for engines smoothing edges differently.

- First time: `npx playwright install chromium firefox webkit`. WebKit needs system libraries that Playwright only supports on Ubuntu and Debian; where it cannot start (Arch, for one), run the other two with `npm run test:visual -- --project=chromium --project=firefox`, and WebKit in the WSL test bed or on Linux.
- After an intended change to how something is drawn: `npm run test:visual:update` regenerates references with Chromium. Look at the changed images before committing them, then run the other engines against them.
- Cases contain no text, because fonts differ between systems. Text gets its own snapshots with bundled fonts in P2.4.
- CI does not run them (Luke, 2026-11-26: CI checks the app on Windows, Linux and macOS only). Run them locally, and the player and LMS suites (`npm run test:player`, `npm run test:lms`), when `packages/render`, `player` or `publish` change.

## Packaging

```bash
npm run package      # installers for the OS you are on → apps/desktop/release
```

Linux produces an AppImage and a deb, macOS a dmg, Windows an NSIS installer. Builds are unsigned for now. macOS and Windows installers are built by CI on their own runners.

## Workflow

- One work package per branch: `wp/<id>-<slug>`.
- Tick the package's box in `docs/PLAN.md` when its "Done when" checks pass.
- Record anything surprising in `skills/project-specific.md`.
- Write a session log in `logs/YYYY-MM-DD-session-N.md`.
- A decision the plan does not cover goes in `docs/adr/NNNN-title.md`.

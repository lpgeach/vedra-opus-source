# R2 Third-party notices in the app, and the source offer

**Not a plan package:** release work Luke asked for after the plan was built (2026-11-23). It follows R1, which made our own ffmpeg on every system, so the source we offer is a handful of archives.

## Why

- **`docs/licences.md` asks for an "About / third-party notices" page,** crediting ffmpeg and LibreOffice and saying where their source is. It is not built yet.
- **A gap found while planning this:** `docs/licences.md` said npm libraries' licences "travel in `node_modules`". But the app bundles them into its own files and ships no `node_modules`, so their copyright and permission notices are not in the package. MIT, BSD, ISC and the like ask for exactly those notices to go with copies, minified ones included.

## The notices, collected at build time

- **`scripts/third-party-notices.mjs`,** a Vite plugin, lists every npm package with code or styles in a bundle: its name, version, licence (from `package.json`), and the text of its licence and notice files (`LICENSE`, `LICENCE`, `COPYING`, `NOTICE`, whatever their extension). It reads the bundle's module graph, so what is listed is exactly what was built in. It writes `third-party-notices.json` beside the bundle. Our own workspace packages are left out.
- It runs in the app's three bundles (main, preload, renderer) and in the course player's.
- **A package with no licence file** keeps its licence name, and the page says the text is not in the package.

## In the app: Help → Third-Party Notices…

A dialog, its words in the string catalogue:

- **The source offer** (below), first.
- **What Vedra Opus ships alongside its own code,** each with its version and licence, and its text shown or opened:
  - Electron, with Chromium: Electron's MIT licence shown, and Chromium's notices (`LICENSES.chromium.html`, several MB) opened in the browser;
  - ffmpeg: the LGPL 2.1 shown, and its `SOURCE.txt`;
  - LibreOffice: MPL 2.0, its `NOTICE` shown, and its full `LICENSE.html` opened;
  - the Lucide icons and Open Doodles illustrations: their notices from `resources/licences/`;
  - the SCORM schema files: their CC BY 3.0 credit.
- **The libraries built into the editor and the course player,** from the collected lists: name, version and licence, with the text shown on request.

**How main finds the files:**

- Electron's files are beside the program on Windows and Linux, in `Contents/Resources` on macOS, and in `node_modules/electron/dist` in development.
- ffmpeg's and LibreOffice's are found as the app finds the programs.
- The renderer names a notice by an id; main opens only the files it listed itself, never a path the renderer sends.

## The source offer

**The page says:**

> Vedra Opus includes ffmpeg (LGPL 2.1 or later) and LibreOffice (MPL 2.0). Their complete source code, exactly as built for this version, with the scripts that build them, is published with each release of Vedra Opus at https://github.com/lpgeach/project-eloquent/releases and kept there for at least three years after that release.

**`npm run collect:sources`** gathers it for a release, into `release-sources/` (git ignores it):

- **ffmpeg:** the seven archives `scripts/build-ffmpeg.sh` pins. The script's own list is the only list, and each archive is checked against its SHA-256. A copy of `build-ffmpeg.sh` goes with them.
- **LibreOffice:** `libreoffice-26.8.3.1.tar.xz` from The Document Foundation, checked against their published SHA-256 (`83006a81…de28`). Its build downloads further third-party archives of its own, listed in its `download.lst`; LibreOffice's own source is what the MPL asks for. The page also names The Document Foundation's source folder.
- A `README.txt` saying what each file is, for which version, and how it is built.

**`docs/releasing.md`** gains the steps: run it, attach the files to the GitHub release, and never delete a release's files within three years.

## Published courses

The course player's npm notices go into a course's `THIRD-PARTY-NOTICES.txt`, as the Lucide and Open Doodles notices already do, so a course carries the notices for the code it is made of.

## Tests

- **Unit:**
  - the plugin's helpers: a module id to its package, a scoped package, licence files found and read, our own packages left out;
  - the assembled notices: components found in a packaged layout and in development, an id opening only a listed file;
  - `collect:sources` reading the ffmpeg list from `build-ffmpeg.sh`;
  - the catalogue test covers the new words.
- **Build:** after `npm run build`, the app's and the player's `third-party-notices.json` list React and Zod with their MIT text, and the Inter font's OFL.
- **e2e:**
  - Help → Third-Party Notices… shows the source offer, ffmpeg (LGPL), LibreOffice when fetched, Electron, and React with its licence text;
  - opening Chromium's notices goes through `shell.openPath`, stubbed;
  - a published course's `THIRD-PARTY-NOTICES.txt` lists the player's libraries.

## Done when

The tests above pass, the full checks pass on Windows and Linux, and `docs/licences.md` and `docs/releasing.md` say what is done. Running `collect:sources` in full (about 300 MB) is done once and recorded; it is not part of the tests.

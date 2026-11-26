# B7: a full-window cover while a course or deck imports

**Asked by Luke, 2026-11-24:**

> "we need a full screen cover when importing a storyline course cos currently from main screen there is no way to know its happening and i can click import again or new project etc, full screen overlay please telling the user what is going on and informing them of progress"

Importing Sample A takes 3–4 minutes, almost all of it converting media. Until now nothing showed during that time, and the Welcome screen's buttons, the menu and its shortcuts all still worked.

**Decided here:** PowerPoint import has the same gap (LibreOffice and media can take minutes), so it gets the same cover, with its own stages. Nothing else changes in either import.

## What the author sees

From the moment the file is chosen until the new project opens (or the import fails), a cover over the whole window, title bar included, shows:

- **The heading:** "Importing a Storyline course" or "Importing a PowerPoint presentation", and the file's name.
- **The stage, in words:**

| Stage      | Storyline                    | PowerPoint                                    |
| ---------- | ---------------------------- | --------------------------------------------- |
| `reading`  | Reading the course…          | Reading the presentation…                     |
| `slides`   | Building the slides…         | Building the slides…                          |
| `drawing`  | —                            | Drawing charts and diagrams with LibreOffice… |
| `media`    | Bringing in media: 12 of 201 | Bringing in media: 3 of 9                     |
| `checking` | Checking the project…        | —                                             |

- **The media file** being brought in, with its own bar while ffmpeg converts it.
- **An overall bar.** The two importers' stages come in a different order, so each has its own shares (`SHARE` in `ImportCover.tsx`):
  - Storyline: reading to 5%, media from 5% to 90%, slides to 97%, checking to 100%;
  - PowerPoint: reading to 5%, slides to 10%, drawing to 35%, media from 35% to 100%.
  - Media count by files done, plus the current file's part. A stage with no measure of its own holds the bar at its start.
- **A note** that it can take a few minutes, and that the window must stay open.

**Accessibility:** the cover is a modal `dialog` (`aria-modal`, `aria-busy`) and takes focus. The stage line is a polite live region, so a screen reader hears each stage, not every percentage. The bars are `progressbar`s with their values.

## What it blocks

- **Pointer and keyboard:** the cover is over everything and holds focus, and Tab stays on it.
- **Menu commands** (the title bar's menu, and shortcuts such as Ctrl+N and Ctrl+O, which arrive the same way) are ignored while an import runs.
- **In main:** a second import while one runs is refused (`cancelled`). That's a backstop, in case anything gets past the renderer.

## How it works

- **The progress event:** `event:importProgress` (`ImportProgress` in `shared/ipc.ts`), sent by main through a hook on the session (`sessions.onImportProgress`, set in `index.ts` like `media`). It's sent only after the file is chosen and leaving the current project is confirmed.
- **Where it comes from:** `importStorylineFile` and `importPowerPointFile` take an optional `onProgress(step)`. The media pipeline's own per-file fraction feeds the current file's bar.
- **In the renderer:** the project store holds `importing: ImportProgress | null`. It shows the cover on the first event, but only while its own import call is in flight, so a late event cannot bring it back. It clears when the call returns, whatever the outcome.

## Done when

- [x] The Storyline import reports its stages in order, with media counted file by file (unit).
- [x] The PowerPoint import reports its stages (unit).
- [x] A second import while one runs is refused (e2e: two asked for at once give "opened" and "cancelled"; the session itself needs Electron, so it is not a unit test).
- [x] During a Storyline import from the Welcome screen, the cover shows, fills the window, names the course and a stage, and holds focus; it goes when the project opens (e2e).
- [x] Menu commands are ignored while it shows (e2e: a menu command sent as the file is chosen never opens its dialog).
- [x] The overall bar only goes forward, for each importer's order of stages (unit).

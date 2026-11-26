# Vedra Opus rename

**Task:** rename the product from Eloquent to Vedra Opus, including internal identifiers.

**Branch:** `fix/vedraopus-rename`, from `master` after P9.1 (PR #69).

## Name mapping

| Existing                                                       | New                                             |
| -------------------------------------------------------------- | ----------------------------------------------- |
| `Eloquent`, `Project Eloquent` (display/prose)                 | `Vedra Opus`                                    |
| `@eloquent/*`                                                  | `@vedraopus/*`                                  |
| `project-eloquent`, `eloquent-desktop`                         | `project-vedraopus`, `vedraopus-desktop`        |
| `.eloquent` project files and `application/x-eloquent-project` | `.vedraopus`, `application/x-vedraopus-project` |
| `EloquentApi`, `EloquentPlayer`                                | `VedraOpusApi`, `VedraOpusPlayer`               |
| `window.eloquent`                                              | `window.vedraopus`                              |
| `ELOQUENT_*` environment variables                             | `VEDRAOPUS_*`                                   |
| `eloquent-asset://`, `eloquent-preview://`                     | `vedraopus-asset://`, `vedraopus-preview://`    |
| `elo-` CSS prefix and `--elo-*` variables                      | `vo-`, `--vo-*`                                 |
| `eloquent-e2e-*`, `eloquent-ffmpeg-*`, `eloquent-test-run-*`   | `vedraopus-*`                                   |
| `app.eloquent.desktop`, `eloquent.invalid`                     | `app.vedraopus.desktop`, `vedraopus.invalid`    |
| `urn:eloquent:*`                                               | `urn:vedraopus:*`                               |
| Executable `eloquent` / `Eloquent`                             | `vedraopus` / `Vedra Opus`                      |

The GitHub repository URL and the on-disk clone directory stay as they are: renaming the remote is a separate decision with effects outside this repository. This brief and the compatibility test are historical/deliberate exceptions that may mention the old name.

## Compatibility

- Existing `.eloquent` project files must still open. New Save/Save As uses `.vedraopus`; Save As replaces a chosen legacy extension with the current one, while plain Save in place keeps the existing path.
- The saved JSON schema and its version do not change: this is a packaging and naming rename, not a model-format change.
- A test must prove that an old-extension project still opens and that a newly saved project uses the new extension.

## Done when

- No user-visible text, package name, executable, protocol, bridge, environment variable, CSS prefix or test fixture still uses the old name, apart from a deliberate legacy `.eloquent` compatibility path, unchanged repository URLs, and this brief's rename table.
- Typecheck, lint, format check, unit tests, e2e, player, LMS and visual suites pass on Windows and in WSL, with the known WebKit limitations recorded rather than worked around.
- Docs, handover and a session log describe the rename and the compatibility rule.

## Verification notes

- Windows: typecheck, lint, format check, unit and built-renderer e2e pass. All runnable Chromium/Firefox cases pass except `packages/player/browser/audio.spec.ts:149`, which fails identically on untouched `c26e496`. WebKit cannot launch on this machine because its Playwright executable is not installed.
- WSL: the full helper run passes every suite except the known WebKit `video.spec.ts:234` player-timing failure (`233 passed, 1 failed`). Logs: `/home/lukeg/vedraopus-logs/20261120-103334`.
- CI is not run until December 2026; commits carry `[skip ci]`.

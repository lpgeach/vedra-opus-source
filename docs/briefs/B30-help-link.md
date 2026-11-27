# B30: Help → Vedra Opus Help

**Luke, 2026-11-27:** asked "have we added a help section to the app?" (there was none), and agreed to the suggested menu link ("do it").

## What

- **Help → Vedra Opus Help**, first in the Help menu, opens the published guide's contents page (B26) in the author's browser:
  `https://github.com/lpgeach/vedra-opus-releases/blob/main/help/README.md`.
- The address is `HELP_URL` in `apps/desktop/src/main/feedback.ts`. The app itself sends nothing.

## Done when

- [x] The item is first in the Help menu and opens that address (e2e `help-link.spec.ts`, the browser stubbed).

## Not in this package

- **Help shown inside the app, or offline.**
- **A keyboard shortcut or a title-bar button.**
- **A guide per version:** the link shows the latest published help, whichever version is running.

# B29: a Feedback button in the title bar

**Asked by Luke, 2026-11-27:** "i also want feedback button to open the feedback page next to the dontate button".

## What

- A **Feedback** button in the title bar, just before **Donate**, wherever Donate shows: the Welcome screen and the editor.
- It opens the same page as **Help → Send Feedback…** (B6): the feedback site, with the app's version and the computer filled in. The app itself sends nothing.
- It is outlined, as the bar's other buttons are, so Donate stays the one in the accent colour.

## How

- The renderer asks main with **`app:sendFeedback`**, which takes no arguments. Main builds the address (`feedbackUrlHere`, also used by the menu), so the renderer cannot ask it to open any other page.

## Done when

- [x] The button shows on the Welcome screen and in the editor, just before Donate and within the bar, and opens the same address as Help → Send Feedback… (e2e `feedback-link.spec.ts`, the browser stubbed).

## Not in this package

- **Help inside the app.**
- **New help pictures:** `npm run help:shots` retakes them before the help is next published.

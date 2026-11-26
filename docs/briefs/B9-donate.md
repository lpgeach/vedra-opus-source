# B9: a Donate button

**Asked by Luke, 2026-11-25:**

> "i need a kofi button adde to the app in all instances and the feedback page here is hte kofi page, the button should say donate https://ko-fi.com/lukegeach"

## What

- **In the app:** a **Donate** button in the title bar, at its right, shown on the Welcome screen and in the editor alike: that is, wherever the app's window is. Also **Help → Donate…**.
  - Both open https://ko-fi.com/lukegeach in the author's browser. The app itself sends nothing.
  - Not in the Preview window, which shows the course as a learner will see it.
- **On the feedback site** (`lpgeach/vedra-opus-feedback`): a **Donate** link in the header, on every page. It opens in a new tab.

## How

- The address is `DONATE_URL` in `apps/desktop/src/main/feedback.ts`, beside the feedback site's.
- The renderer asks main with **`app:donate`**, which takes no arguments. Main opens only that one address, so the renderer cannot ask it to open any other page.

## Done when

- [x] The title bar's Donate button shows on the Welcome screen and in the editor, and opens the Ko-fi page; so does Help → Donate… (e2e, the browser stubbed).
- [x] The feedback site's header has the Donate link to the Ko-fi page (checked in a browser; pushed to its repository).

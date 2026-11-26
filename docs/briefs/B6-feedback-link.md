# B6: Help → Send Feedback…

**Asked by Luke, 2026-11-24:** a website to capture feedback about the app, hosted on Vercel, with the feedback kept in blob storage.

- **His decisions:**
  - the site lives in its own private repository, `lpgeach/vedra-opus-feedback`, not in this one;
  - anyone with the link may send feedback (spam is caught by a hidden field, a minimum time and a rate limit);
  - the team reads it on a password-protected page on the site, with no third-party services;
  - Vercel's free Hobby plan, after he asked about GitHub Pages (Pages serves only static files, so it cannot keep feedback by itself);
  - the app links to the site in this piece of work.

## What the app does

- **Help → Send Feedback…** (`help.sendFeedback`), first in the Help menu, opens the site in the author's browser:
  `https://vedra-opus-feedback.vercel.app/?v=<version>&os=<computer>`.
- `v` is `app.getVersion()`. `os` is "Windows 10", "Windows 11" (build 22000 and up), "macOS <version>" or "Linux", from `process.getSystemVersion()`. Nothing else goes in the address.
- **The app sends nothing.** It only opens the browser; the author chooses what to send from the page. The e2e privacy check (no request leaves the machine) is unaffected.
- The address is `FEEDBACK_URL` in `apps/desktop/src/main/feedback.ts`. It assumes the Vercel project keeps the name `vedra-opus-feedback`; if Vercel gives another address, change it there.

## What the site does

Its `README.md` has the detail. In short:

- `/` is the form: kind, area of the app, summary, details, steps for bugs, up to three screenshots (scaled in the browser, checked by their bytes on the server), a rating, version, computer, and optional name and email.
- Each submission is `feedback/<reference>.json` in a **private** Vercel Blob store, with its screenshots under `attachments/<reference>/`. The IP address is not kept.
- `/admin` is the inbox, behind `ADMIN_PASSWORD`: filter, read, mark new, read or done, delete, export CSV or JSON.

## Done when

- [x] The Help menu has Send Feedback…, and it opens the site with the version and computer (e2e `feedback-link.spec.ts`, the browser stubbed).
- [x] The address carries only `v` and `os`, and the computer is named as the form shows it (unit `feedback.test.ts`).
- [ ] The site is deployed on Vercel, with a private Blob store and `ADMIN_PASSWORD` (Luke, with his Vercel account; steps in the site's README).

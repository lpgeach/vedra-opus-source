# Privacy policy

_Last updated: 26 November 2026_

**Vedra Opus does not collect any data.** There is no account, no telemetry, no analytics and no tracking. Nothing about you, your computer or your courses is sent to us or to anyone else.

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.

## The app

- **Your work stays on your computer.** Projects, media, templates and published courses are files on your own disk. We never see them.
- **No background connections.** The app makes no network requests while you edit, preview or publish. An automated test (`e2e/privacy.spec.ts`) goes through all three and fails if a single request leaves the computer.
- **Crash reports** are off unless you turn on **Help → Keep Crash Reports**. They are then kept on your computer and never sent. **Help → Show Crash Reports** opens their folder, so you decide whether to share one.
- **Text-to-speech** uses the voices built into your operating system, on your computer.
- **Web pages placed on a slide** are never loaded by the editor or by Preview. Both show a placeholder naming the address instead.

## When the app connects, because you asked

- **Updates.** **Help → Check for Updates…** asks the [Releases page](https://github.com/lpgeach/vedra-opus-releases/releases) on GitHub whether there is a newer version. It does so only when you choose it, or regularly once you turn on **Check for Updates Automatically** (off by default). GitHub receives that request as it would any visit to its website.
- **Links in the Help menu and title bar** (**Send Feedback…**, **Donate…**, **Project Repository** and the like) open the page in your web browser. The app itself sends nothing.
  - **Send Feedback…** fills in the app's version and the name of your operating system (for example "Windows 11") on the feedback form. Nothing is sent unless you send the form yourself.

## Courses you publish

A published course is a set of plain HTML files. It connects only to what its author set up:

- **an LMS** (SCORM or cmi5), which the course reports progress and scores to when it is launched from one;
- **an LRS** (xAPI) that the course is launched with;
- **web pages, files and links** the author put in it.

What a course reports goes to that LMS or LRS, run by whoever publishes the course. It never comes to us.

## The feedback website

If you send feedback through the [feedback website](https://vedra-opus-feedback.vercel.app/), that site keeps what you type and attach, and your browser's description of itself (its "user agent"). It does not keep your IP address.

- Only the Vedra Opus team can read your feedback.
- Your name and email are optional, and we only email you if you tick the box to say we may.
- To have your feedback deleted, send another note quoting its reference.
- The site is hosted by Vercel, whose own [privacy policy](https://vercel.com/legal/privacy-policy) covers the hosting.

## Downloads and this website

Installers and this source code are hosted on GitHub. GitHub's own [privacy statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement) covers your visits and downloads there.

## Questions and changes

Questions about privacy are welcome as an [issue](https://github.com/lpgeach/vedra-opus-source/issues). If this policy changes, the change and its date will be here, and in the history of this file.

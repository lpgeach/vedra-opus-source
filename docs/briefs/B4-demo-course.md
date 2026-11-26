# B4: the demo course in the app

**Asked by Luke, 2026-11-24:** after the UK space course was made (session 112) and checked through: "package it in the installer as a demo course".

## What it does

- **Where it lives:** the course ships as a built-in template file, `apps/desktop/resources/templates/The UK Space Industry in 2026.vedraopus`.
  - The packaged app reads built-in template files from `<resources>/templates` (P11.2), and `electron-builder.yml` now copies the folder there.
  - So the course is also listed in New from Template…, after the starter templates.
- **Two ways to open it:**
  - the Welcome screen's **Explore the Demo Course** button;
  - **Help → Open Demo Course**.
- **What opening it does:** both run `template:openDemo`, which opens the course as a **new, unsaved copy**, as any template opens. The shipped file is never written. Saving asks where, like a new project.
- **If the file is missing**, as in a build without it, the author is told so (`dialog.demo.missing`).

## Credits

- **Music:** CC BY 4.0, credited on the course's Credits slide and in Help → Third-Party Notices… ("Demo course media").
- **Everything else:** NASA public domain, or made in the app.
- See `docs/licences.md`, "The demo course".

## How the course is made, and changed

It was built in sessions 112 and 113 by a one-off script that used the app's own code:

- the model's factories, validated by `parseProject`;
- `importAsset` for media;
- `makeSpeech` with Windows SAPI;
- `packContainer` to save it.

**The script is not in the repository.** It was written for this one course, with loose types this repository's rules do not allow. The session logs say what it did and where each piece of media came from.

**To change the course:** open it in Vedra Opus (Help → Open Demo Course), save it, and copy the saved file over `resources/templates/The UK Space Industry in 2026.vedraopus`. It is an ordinary project, about 12 MB.

## Done when

- `e2e/demo-course.spec.ts`:
  - the Welcome button opens the course as an unsaved copy with its slides;
  - Help → Open Demo Course opens it again over it;
  - the notices list its media.
- `e2e/templates.spec.ts`: the course is listed among the built-in templates.
- `third-party.test.ts`: the notices carry the music's credit.

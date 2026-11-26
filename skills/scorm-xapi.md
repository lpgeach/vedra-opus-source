# SCORM, xAPI and cmi5 in Vedra Opus

How published courses talk to an LMS, and what to know before changing it. The design decisions are in the briefs: `docs/briefs/P5.1-tracking-model.md` through `P5.6-publish-ui.md`. Read the one for the standard you are touching.

## The standards, briefly

| Standard   | The course talks to                                                           | Saved progress                                | Package file                   |
| ---------- | ----------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------ |
| SCORM 1.2  | `window.API` on a parent or opener frame: `LMSInitialize`, `LMSSetValue`, …   | `cmi.suspend_data`, at most 4,096 characters  | `imsmanifest.xml` + 4 XSDs     |
| SCORM 2004 | `window.API_1484_11`: `Initialize`, `SetValue`, …                             | `cmi.suspend_data`, 4,000 (2nd) / 64,000      | `imsmanifest.xml` (+ XSDs)     |
| xAPI       | An LRS over HTTP: statements, and the State API; details in the launch URL    | A State API document                          | `tincan.xml`                   |
| cmi5       | An LRS, after trading a one-use fetch URL for a token; `LMS.LaunchData` rules | A State API document                          | `cmi5.xml`                     |

## Where the code is

- **`packages/engine/src/tracking.ts`**: what the course knows: complete, success, progress. `reportStatus` maps that to each standard's words for the course's reporting pair.
- **`packages/player/src/lms/`**: everything that runs in the learner's browser.
  - `driver.ts` holds the one `LmsDriver` interface.
  - `scorm12.ts` and `scorm2004.ts` are the SCORM drivers.
  - `xapi.ts` holds `lrsDriver`, the transport shared by xAPI and cmi5, plus the xAPI profile. `cmi5.ts` is the cmi5 profile.
  - `suspend.ts` is the suspend-data codec.
  - `start.ts` has `startCourse`, which connects a course to its LMS, resumes it, saves it and finishes it.
- **`packages/publish/src/`**: building packages.
  - `publishCourse` (`course.ts`) picks the target.
  - `scorm12.ts`, `scorm2004.ts`, `xapi.ts` and `cmi5.ts` write the manifests.
  - `*-schemas.ts` hold the bundled XSDs, with their sources and hashes.
- **Tests:**
  - Unit tests sit beside each file.
  - `packages/publish/browser/` runs published packages in mock LMSs and a mock LRS (`npm run test:lms`).
  - `e2e/phase5-course.spec.ts` goes from the app to the LMS.

## Rules that cost time to learn

- **Completion never goes backwards.** Every driver refuses to report a lower status than the LMS already holds (pitfall #81).
- **Save after the resume question,** in `onStart`, not straight after mounting (#81).
- **Report status after the slide change that caused it** (a microtask, #82).
- **Never send a malformed value.** A bad `registration` makes an LRS refuse every statement, so the driver drops it with a warning instead.
- **Retry only what can succeed.** Network errors, 429 and 5xx are retried with backoff; any other 4xx is dropped with a warning. Statement ids are fixed, so a retry is safe.
- **Leaving the page:** the last requests use `fetch(…, { keepalive: true })`, and browsers allow about 64 KB in flight for those. That is why the xAPI suspend limit is 32,000.
- **Third-party files carry licences.** Read a file's header before bundling it. The SCORM 2004 3rd-edition schemas need IMS registration to distribute, so they are not shipped (#80).
- **Checking a manifest:** `xmllint` with a wrapper schema (#79, #80). The 2001 IMS metadata schema does not compile in libxml2.

## What is not done yet

- Quizzes (P7) will drive score, interactions, `passed` and `failed`, and cmi5's `masteryScore`.
- The "exit course" trigger (P8.6) will call `CoursePlayer.exit()`.
- Real LMS and LRS checks: Luke does those (SCORM Cloud and others). Never upload a package yourself.

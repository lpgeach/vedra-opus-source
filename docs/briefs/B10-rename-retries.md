# B10: retry a rename that Windows briefly refuses

**Found in session 116**, running the full e2e suite for B9 with nothing else running. Five publishing tests failed:

> `EPERM: operation not permitted, rename '…\out\.vedraopus-publish-…' -> '…\out\untitled-project'`

## Why

Publishing builds the course in a staging folder beside its target, then renames it into place. Saving a project, writing the working copy and exporting a video do the same with a file.

On Windows, a rename fails with `EPERM`, `EACCES` or `EBUSY` while another program has one of the new files open for a moment: antivirus (Windows Defender) and the search indexer both open new files to look at them. The code tried the rename once and gave up, so the author saw an error. That is likely also behind the intermittent `project.test.ts` failure, "leaves the existing file intact when a save fails" (sessions 114 and 116): saving renames too.

## What

- One helper, **`renameWithRetry`** (`apps/desktop/src/main/fs-retry.ts`).
  - It retries a rename refused with `EPERM`, `EACCES` or `EBUSY`, waiting a little longer each time: about four seconds in all.
  - Any other error, or still refused at the end, is thrown as before.
- It replaces `rename` in:
  - publishing (both renames in `publish.ts`);
  - the project container (`container.ts`);
  - the working copy (`workspace.ts`);
  - the video export (`video/export.ts`).

## Done when

- [x] A rename refused twice with `EPERM` then allowed succeeds; any other error, or a refusal that lasts, throws (unit, with the rename stubbed).
- [x] Full e2e passes on Windows with nothing else running: 183 passed, 2 skipped (session 116).

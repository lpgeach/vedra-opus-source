# Closing with unsaved changes never hangs (Windows)

**Why:** On Windows CI, the packaged app's smoke test sometimes spent ~28 s in Playwright's "Close context", after tests that had just changed the project (`ribbon-tabs.spec.ts:75` in run 45900875886; `layers.spec.ts:76` in the run before). The test body was done in under 2 s. Session 117's log left this as the next step on CI.

## The cause

Closing the editor window with unsaved changes runs `ProjectSessions.confirmLeavingCurrent()`, and on "Don't Save" it calls `discardCurrent()`, which deletes the working copy with a synchronous `rmSync`.

- **Autosave still writing:** an edit made just before closing starts an autosave write 400 ms later (`flush()`). That write keeps a temporary file open and, through `renameWithRetry`, can take up to about 4 s. `discardCurrent()` did not wait for it.
- **Windows refuses the folder:** a folder with an open file in it cannot be removed, so `rmSync` throws (`ENOTEMPTY`, `EPERM` or `EBUSY`). The antivirus or the search indexer can hold a file open the same way.
- **The window never closes:** the throw rejects the promise in the window's `close` handler (`index.ts`), so the handler never sets `closeConfirmed` or calls `close()` again. The app stays open until it is killed.

Linux lets a folder go while its files are open, so the race does not show there.

## The change

1. **Wait for the working copy's writes** before removing it: `confirmLeavingCurrent()` waits for any write already under way, and cancels the one not yet started.
2. **Removing the working copy never throws:** `discardCurrent()` retries briefly (`rmSync`'s own `maxRetries`). If the folder still cannot go, it marks the working copy as having no unsaved changes, so the next launch deletes it instead of offering it for recovery. A discarded project is never offered back.
3. **The close handler survives a failure:** if leaving the project fails for any other reason (a failed save), the error is logged and the window stays open, as for Cancel, so a quit can be tried again. Before, the window was stuck in a half-closed state.

## Done when

- A unit test shows closing during an autosave write waits for it, removes the working copy, and logs no failed autosave.
- A unit test shows a working copy that cannot be removed does not stop the close, and is not offered for recovery at the next launch.
- The full checks pass on Windows. The CI smoke test is the real proof; it runs only when Luke asks for a CI run.

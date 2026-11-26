/** How far up the frames to look, as the standards' own discovery code does. */
const MAX_DEPTH = 500;

/** Look for `name` on this window and its parents; frames from other sites are skipped. */
function searchUp<T>(start: Window, name: string, isApi: (value: unknown) => value is T): T | null {
  let at: Window | null = start;
  for (let depth = 0; at && depth <= MAX_DEPTH; depth++) {
    try {
      const api = (at as unknown as Record<string, unknown>)[name];
      if (isApi(api)) return api;
    } catch {
      // A frame from another site cannot be read; keep going up.
    }
    if (at.parent === at) break;
    at = at.parent;
  }
  return null;
}

/**
 * An LMS's run-time API, which it puts on one of the course's ancestor
 * windows: on this window or a parent, else on the window that opened it or
 * that window's parents.
 */
export function findApi<T>(
  start: Window,
  name: string,
  isApi: (value: unknown) => value is T,
): T | null {
  const found = searchUp(start, name, isApi);
  if (found) return found;
  try {
    return start.opener ? searchUp(start.opener as Window, name, isApi) : null;
  } catch {
    return null;
  }
}

/** An object with a method of this name. */
export const hasMethod =
  <T>(method: string) =>
  (value: unknown): value is T =>
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>)[method] === 'function';

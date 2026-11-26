import { systemPreferences } from 'electron';
import type { Session, WebContents } from 'electron';

/**
 * Electron allows every permission a page asks for unless told otherwise.
 * The editor asks for one thing, the microphone, to record narration (P6.1);
 * everything else is refused. Preview windows play authored content, which
 * gets no devices at all.
 */
export function restrictPermissions(
  editorSession: Session,
  previewSession: Session,
  isEditor: (contents: WebContents) => boolean,
): void {
  editorSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    if (permission === 'fullscreen' || permission === 'clipboard-sanitized-write') {
      return callback(true);
    }
    if (permission !== 'media' || !isEditor(contents)) return callback(false);
    // Sound only: never the camera or the screen.
    const types = 'mediaTypes' in details ? (details.mediaTypes ?? []) : [];
    if (types.length === 0 || types.some((type) => type !== 'audio')) return callback(false);
    if (process.platform === 'darwin') {
      // The system's own question comes first; its answer is the answer.
      void systemPreferences.askForMediaAccess('microphone').then(callback, () => callback(false));
      return;
    }
    callback(true);
  });
  editorSession.setPermissionCheckHandler((contents, permission, _origin, details) => {
    if (permission === 'fullscreen' || permission === 'clipboard-sanitized-write') return true;
    if (permission !== 'media' || !contents || !isEditor(contents)) return false;
    return details.mediaType === undefined || details.mediaType === 'audio';
  });

  previewSession.setPermissionRequestHandler((_contents, permission, callback) =>
    callback(permission === 'fullscreen'),
  );
  previewSession.setPermissionCheckHandler((_contents, permission) => permission === 'fullscreen');
}

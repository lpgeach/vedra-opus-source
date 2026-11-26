/**
 * Screen recording's main-process half (docs/briefs/P9.11-screen-recording.md).
 * The editor lists what can be recorded, the author picks one, and the
 * editor's next screen capture gets that source, once. Any other capture is
 * refused: nothing chosen, a second request, or a page other than the editor.
 */
import type { ScreenSource } from '../shared/ipc';

/** What `desktopCapturer.getSources` gives, as far as this needs it. */
export interface CaptureSource {
  id: string;
  name: string;
  thumbnail: { isEmpty(): boolean; toDataURL(): string };
}

export type GetSources = (options: {
  types: ('screen' | 'window')[];
  thumbnailSize: { width: number; height: number };
  fetchWindowIcons: boolean;
}) => Promise<CaptureSource[]>;

/** What the display-media request handler is given and answers with. */
export interface CaptureRequest {
  videoRequested: boolean;
}
export type CaptureAnswer = (streams: { video: { id: string; name: string } } | null) => void;

export function createScreenCapture(getSources: GetSources) {
  /** The last list the editor was shown, so it can only choose from that. */
  let listed = new Map<string, { id: string; name: string }>();
  let chosen: { id: string; name: string } | null = null;

  return {
    async sources(): Promise<ScreenSource[]> {
      const found = await getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: false,
      });
      listed = new Map(found.map((source) => [source.id, { id: source.id, name: source.name }]));
      return found.map((source) => ({
        id: source.id,
        name: source.name,
        kind: source.id.startsWith('screen:') ? 'screen' : 'window',
        thumbnail: source.thumbnail.isEmpty() ? '' : source.thumbnail.toDataURL(),
      }));
    },

    /** The source the next capture gets; false when it was not in the last list. */
    choose(id: string | null): boolean {
      chosen = id === null ? null : (listed.get(id) ?? null);
      return id === null || chosen !== null;
    },

    /** Answer a capture request: the chosen source once, from the editor, else refused. */
    handle(request: CaptureRequest, answer: CaptureAnswer, fromEditor: boolean): void {
      const source = chosen;
      chosen = null;
      if (!source || !fromEditor || !request.videoRequested) return answer(null);
      answer({ video: source });
    },
  };
}

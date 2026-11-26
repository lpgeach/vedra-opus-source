import { useEffect, useRef, useState } from 'react';
import type { ScreenSource } from '../../shared/ipc';
import { editor } from '../project-store';
import type { OpenProject } from '../project-store';
import { stage } from '../stage/actions';
import { takeFocus } from './dialog-focus';

type Phase =
  | { kind: 'choosing' }
  | { kind: 'counting'; left: number }
  | { kind: 'recording'; started: number }
  | { kind: 'recorded'; blob: Blob; url: string; seconds: number; stoppedAtLimit: boolean }
  | { kind: 'saving' }
  | { kind: 'failed'; message: string };

/** The longest take, in seconds; it stops by itself there. */
export const MAX_SECONDS = 10 * 60;
/** Seconds counted down before recording starts, to move to what is recorded. */
export const COUNT_FROM = 3;

/** What Chromium records the screen in: VP9 if it can, else VP8; Opus for narration. */
function format(withSound: boolean): string {
  for (const codecs of withSound ? ['vp9,opus', 'vp8,opus'] : ['vp9', 'vp8']) {
    const type = `video/webm;codecs=${codecs}`;
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return 'video/webm';
}

const clock = (seconds: number) => {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

function explain(error: unknown): string {
  const name = (error as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Vedra Opus is not allowed to record the screen or the microphone. Allow it in your system settings, then try again.';
  }
  if (name === 'NotFoundError') return 'That screen or window is no longer there. Choose again.';
  return error instanceof Error ? error.message : 'The recording could not be made.';
}

/**
 * Insert → Screen Recording (docs/briefs/P9.11-screen-recording.md): choose a
 * screen or window, record it (with narration if wanted) after a short count,
 * stop, watch it back, and insert it on the slide as a video.
 */
export function ScreenRecordDialog({ open, onClose }: { open: OpenProject; onClose: () => void }) {
  const [sources, setSources] = useState<ScreenSource[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [narration, setNarration] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'choosing' });
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const streams = useRef<MediaStream[]>([]);
  const objectUrl = useRef<string | null>(null);
  const timers = useRef<number[]>([]);
  const atLimit = useRef(false);

  const release = () => {
    for (const stream of streams.current) stream.getTracks().forEach((track) => track.stop());
    streams.current = [];
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  };
  const forget = () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
  };

  /** Ask main what can be recorded; a choice no longer there is dropped. */
  const fetchSources = () =>
    window.vedraopus.screen.sources().then(
      (found) => {
        setSources(found);
        setChosen((was) => (found.some((source) => source.id === was) ? was : null));
      },
      (error: unknown) => setPhase({ kind: 'failed', message: explain(error) }),
    );
  /** List again, showing that it is looking. */
  const list = () => {
    setSources(null);
    void fetchSources();
  };
  useEffect(() => {
    void fetchSources();
    // Closing the dialog stops recording, lets go of the take and of the choice.
    return () => {
      if (recorder.current?.state === 'recording') recorder.current.stop();
      release();
      forget();
      void window.vedraopus.screen.choose(null);
    };
  }, []);

  useEffect(() => {
    if (phase.kind !== 'recording') return;
    const timer = window.setInterval(() => setElapsed((Date.now() - phase.started) / 1000), 200);
    return () => window.clearInterval(timer);
  }, [phase]);

  const start = async () => {
    if (!chosen) return;
    forget();
    setElapsed(0);
    atLimit.current = false;
    try {
      if (!(await window.vedraopus.screen.choose(chosen))) {
        list();
        throw new Error('That screen or window is no longer there. Choose again.');
      }
      const screen = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
      });
      streams.current.push(screen);
      const tracks = [...screen.getVideoTracks()];
      if (narration) {
        const voice = await navigator.mediaDevices.getUserMedia({ audio: true });
        streams.current.push(voice);
        tracks.push(...voice.getAudioTracks());
      }
      const take = new MediaRecorder(new MediaStream(tracks), {
        mimeType: format(narration),
        videoBitsPerSecond: 4_000_000,
      });
      const chunks: Blob[] = [];
      let started = 0;
      take.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      take.onstop = () => {
        release();
        const blob = new Blob(chunks, { type: take.mimeType || 'video/webm' });
        const url = URL.createObjectURL(blob);
        objectUrl.current = url;
        setPhase({
          kind: 'recorded',
          blob,
          url,
          seconds: (Date.now() - started) / 1000,
          stoppedAtLimit: atLimit.current,
        });
      };
      // The capture ending by itself (the window closed) ends the take.
      screen.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (take.state === 'recording') take.stop();
      });
      recorder.current = take;
      // A short count, so the author can turn to what is being recorded.
      for (let left = COUNT_FROM; left > 0; left--) {
        setPhase({ kind: 'counting', left });
        await new Promise<void>((done) => timers.current.push(window.setTimeout(done, 1000)));
      }
      if (streams.current.length === 0) return; // Closed while counting.
      started = Date.now();
      take.start(1000);
      setPhase({ kind: 'recording', started });
      timers.current.push(
        window.setTimeout(() => {
          atLimit.current = true;
          if (take.state === 'recording') take.stop();
        }, MAX_SECONDS * 1000),
      );
    } catch (error) {
      release();
      void window.vedraopus.screen.choose(null);
      setPhase({ kind: 'failed', message: explain(error) });
    }
  };

  const stop = () => recorder.current?.stop();

  const insert = async (blob: Blob) => {
    setPhase({ kind: 'saving' });
    try {
      const asset = await window.vedraopus.project.storeScreenRecording(
        new Uint8Array(await blob.arrayBuffer()),
      );
      editor.beginGesture('Insert screen recording');
      try {
        open.history.execute('asset.add', { hash: asset.hash, meta: asset.meta });
        if (asset.poster) {
          open.history.execute('asset.add', { hash: asset.poster.hash, meta: asset.poster.meta });
        }
      } finally {
        editor.commitGesture();
      }
      await stage.insertVideo(asset.hash, asset.poster?.hash);
      onClose();
    } catch (error) {
      setPhase({ kind: 'failed', message: explain(error) });
    }
  };

  const busy = phase.kind === 'counting' || phase.kind === 'recording' || phase.kind === 'saving';
  const group = (kind: ScreenSource['kind'], heading: string) => {
    const found = (sources ?? []).filter((source) => source.kind === kind);
    if (found.length === 0) return null;
    return (
      <>
        <h3>{heading}</h3>
        <div className="screen-sources" role="group" aria-label={heading}>
          {found.map((source) => (
            <button
              key={source.id}
              type="button"
              className="screen-source"
              aria-pressed={chosen === source.id}
              disabled={busy}
              onClick={() => setChosen(source.id)}
            >
              {source.thumbnail ? (
                <img src={source.thumbnail} alt="" />
              ) : (
                <span className="screen-source-blank" />
              )}
              <span>{source.name}</span>
            </button>
          ))}
        </div>
      </>
    );
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        className="dialog screen-record-dialog"
        ref={takeFocus}
        tabIndex={-1}
        role="dialog"
        aria-label="Screen recording"
        data-testid="screen-record-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !busy) onClose();
        }}
      >
        <h2>Screen recording</h2>
        {phase.kind === 'recorded' ? (
          <>
            <video
              controls
              src={phase.url}
              aria-label="Watch the recording"
              className="screen-take"
            />
            {phase.stoppedAtLimit && (
              <p className="muted">The recording stopped at its limit of 10 minutes.</p>
            )}
          </>
        ) : (
          <>
            <p className="muted">
              Choose what to record. It stays on this computer, and goes into the project when you
              insert it.
            </p>
            {sources === null ? (
              <p className="muted">Finding screens and windows…</p>
            ) : sources.length === 0 ? (
              <p className="muted">There is nothing that can be recorded.</p>
            ) : (
              <>
                {group('screen', 'Screens')}
                {group('window', 'Windows')}
              </>
            )}
            <label className="field-check">
              <input
                type="checkbox"
                checked={narration}
                disabled={busy}
                onChange={(e) => setNarration(e.target.checked)}
              />
              Record narration from the microphone too
            </label>
          </>
        )}
        <p className="record-time" data-testid="screen-record-status" aria-live="polite">
          {phase.kind === 'counting'
            ? `Recording in ${phase.left}…`
            : phase.kind === 'recording'
              ? `Recording ${clock(elapsed)}`
              : phase.kind === 'recorded'
                ? `Recorded ${clock(phase.seconds)}`
                : phase.kind === 'saving'
                  ? 'Saving…'
                  : ''}
        </p>
        {phase.kind === 'failed' && (
          <p className="field-problem" role="alert">
            {phase.message}
          </p>
        )}
        <div className="dialog-actions">
          {phase.kind === 'recording' || phase.kind === 'counting' ? (
            <button type="button" disabled={phase.kind === 'counting'} onClick={stop}>
              Stop
            </button>
          ) : (
            <button
              type="button"
              disabled={phase.kind === 'saving' || !chosen}
              onClick={() => {
                if (phase.kind === 'recorded') setPhase({ kind: 'choosing' });
                void start();
              }}
            >
              {phase.kind === 'recorded' ? 'Record again' : 'Record'}
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              forget();
              onClose();
            }}
          >
            {phase.kind === 'recorded' ? 'Discard' : 'Cancel'}
          </button>
          <button
            type="button"
            disabled={phase.kind !== 'recorded'}
            onClick={() => phase.kind === 'recorded' && void insert(phase.blob)}
          >
            Insert
          </button>
        </div>
      </div>
    </div>
  );
}

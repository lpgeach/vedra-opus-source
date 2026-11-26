import { useEffect, useRef, useState } from 'react';
import type { OpenProject } from '../project-store';
import { stage } from '../stage/actions';
import { takeFocus } from './dialog-focus';

type Phase =
  | { kind: 'ready' }
  | { kind: 'recording'; started: number }
  | { kind: 'recorded'; blob: Blob; url: string; seconds: number }
  | { kind: 'saving' }
  | { kind: 'failed'; message: string };

/** What Chromium records sound in; the player and every current browser play it. */
const FORMAT = 'audio/webm;codecs=opus';

const clock = (seconds: number) => {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

function explain(error: unknown): string {
  const name = (error as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Vedra Opus is not allowed to use the microphone. Allow it in your system settings, then try again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return 'No microphone was found.';
  return error instanceof Error ? error.message : 'The recording could not be made.';
}

/**
 * Record narration from the microphone: record, stop, listen, then insert it
 * on the slide like an imported sound, or throw it away.
 */
export function RecordDialog({ open, onClose }: { open: OpenProject; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'ready' });
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const listening = useRef<{ context: AudioContext; frame: number } | null>(null);
  const objectUrl = useRef<string | null>(null);

  const release = () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (listening.current) {
      cancelAnimationFrame(listening.current.frame);
      void listening.current.context.close();
      listening.current = null;
    }
    setLevel(0);
  };
  const forget = () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
  };
  // Closing the dialog stops the microphone and lets go of the take.
  useEffect(
    () => () => {
      if (recorder.current?.state === 'recording') recorder.current.stop();
      release();
      forget();
    },
    [],
  );

  useEffect(() => {
    if (phase.kind !== 'recording') return;
    const timer = window.setInterval(() => setElapsed((Date.now() - phase.started) / 1000), 200);
    return () => window.clearInterval(timer);
  }, [phase]);

  const start = async () => {
    forget();
    setElapsed(0);
    try {
      const input = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = input;
      const take = new MediaRecorder(
        input,
        MediaRecorder.isTypeSupported(FORMAT) ? { mimeType: FORMAT } : {},
      );
      const chunks: Blob[] = [];
      const started = Date.now();
      take.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      take.onstop = () => {
        release();
        const blob = new Blob(chunks, { type: take.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        objectUrl.current = url;
        setPhase({ kind: 'recorded', blob, url, seconds: (Date.now() - started) / 1000 });
      };
      recorder.current = take;
      take.start(250);
      // A level meter, so the author can see the microphone hears them.
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(input).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const measure = () => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const value of samples) sum += value * value;
        setLevel(Math.min(1, Math.sqrt(sum / samples.length) * 4));
        if (listening.current) listening.current.frame = requestAnimationFrame(measure);
      };
      listening.current = { context, frame: requestAnimationFrame(measure) };
      setPhase({ kind: 'recording', started });
    } catch (error) {
      release();
      setPhase({ kind: 'failed', message: explain(error) });
    }
  };

  const stop = () => recorder.current?.stop();

  const insert = async (blob: Blob) => {
    setPhase({ kind: 'saving' });
    try {
      const asset = await window.vedraopus.project.storeRecording(
        new Uint8Array(await blob.arrayBuffer()),
      );
      open.history.execute('asset.add', asset);
      await stage.insertAudio(asset.hash);
      onClose();
    } catch (error) {
      setPhase({ kind: 'failed', message: explain(error) });
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        className="dialog record-dialog"
        ref={takeFocus}
        tabIndex={-1}
        role="dialog"
        aria-label="Record audio"
        data-testid="record-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && phase.kind !== 'saving') onClose();
        }}
      >
        <h2>Record audio</h2>
        <div className="record-status">
          <span className="record-time" data-testid="record-time">
            {clock(phase.kind === 'recorded' ? phase.seconds : elapsed)}
          </span>
          <span className="record-meter" aria-hidden="true">
            <span style={{ width: `${Math.round(level * 100)}%` }} />
          </span>
        </div>
        {phase.kind === 'recorded' && (
          <audio controls src={phase.url} aria-label="Listen to the recording" />
        )}
        {phase.kind === 'failed' && (
          <p className="field-problem" role="alert">
            {phase.message}
          </p>
        )}
        <div className="dialog-actions">
          {phase.kind === 'recording' ? (
            <button type="button" onClick={stop}>
              Stop
            </button>
          ) : (
            <button type="button" disabled={phase.kind === 'saving'} onClick={() => void start()}>
              {phase.kind === 'recorded' ? 'Record again' : 'Record'}
            </button>
          )}
          <button
            type="button"
            disabled={phase.kind === 'recording' || phase.kind === 'saving'}
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

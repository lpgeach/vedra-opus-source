import { createId, formatSrt, formatVtt, parseCaptions } from '@vedraopus/model';
import type { AudioObject, CaptionCue, VideoObject } from '@vedraopus/model';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { PEAK_STEP, useAudioAnalysisState, waveformPath } from '../audio-analysis';
import { SHORTEST, dragCue, gripAt, hundredth } from '../caption-drag';
import type { CueGrip } from '../caption-drag';
import { assetUrl, editor, selectedObjects, useEditor } from '../project-store';
import type { CurrentSlide, OpenProject } from '../project-store';
import { NumericInput } from './NumericInput';

type Media = AudioObject | VideoObject;
/** How long a caption added at the cursor lasts, at most. */
const NEW_CAPTION = 2;
/** How near, in pixels, a press must be to a caption's edge to take hold of it. */
const EDGE_REACH = 6;
/** How far, in pixels, the pointer must move before a press becomes a drag. */
const DRAG_START = 3;
const clock = (seconds: number) => {
  const whole = Math.max(0, seconds);
  const m = Math.floor(whole / 60);
  return `${m}:${(whole - m * 60).toFixed(2).padStart(5, '0')}`;
};

/**
 * Closed captions for the selected sound or video (docs/briefs/P6.4-captions.md):
 * its waveform with the captions over it, a cursor that playback moves, and
 * the captions as rows to edit. Times are in the media file's own seconds.
 */
export function CaptionsPanel({
  open,
  current,
}: {
  open: OpenProject;
  current: CurrentSlide | undefined;
}) {
  const { selection } = useEditor();
  const selected = selectedObjects(current?.slide, selection);
  const media =
    selected.length === 1 && (selected[0]!.type === 'audio' || selected[0]!.type === 'video')
      ? (selected[0] as Media)
      : null;
  if (!media) {
    return (
      <p className="placeholder" data-testid="captions-empty">
        Select a sound or a video to write its captions.
      </p>
    );
  }
  // A fresh editor for each object, so its cursor and playback start afresh.
  return <MediaCaptions key={media.id} open={open} media={media} />;
}

function MediaCaptions({ open, media }: { open: OpenProject; media: Media }) {
  const url = assetUrl(open.session, media.props.asset);
  const { analysis, failed: silent } = useAudioAnalysisState(url);
  const isVideo = media.type === 'video';
  const length = media.props.length;
  const cues = media.props.captions;
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const player = useRef<HTMLMediaElement | null>(null);
  const focusNew = useRef<string | null>(null);

  const setCaptions = (next: CaptionCue[], label = 'Edit captions') => {
    editor.beginGesture(label);
    try {
      open.history.execute('object.update', {
        objectId: media.id,
        changes: { props: { captions: [...next].sort((a, b) => a.start - b.start) } } as never,
      });
    } finally {
      editor.commitGesture();
    }
  };
  const change = (id: string, edit: (cue: CaptionCue) => CaptionCue) =>
    setCaptions(cues.map((cue) => (cue.id === id ? edit(cue) : cue)));
  // Each time field moves only its own end, kept inside the file and after the
  // other end, so typing a number digit by digit never pushes the other one.
  const setStart = (id: string, seconds: number) =>
    change(id, (cue) => ({
      ...cue,
      start: hundredth(Math.min(Math.max(0, seconds), cue.end - SHORTEST)),
    }));
  const setEnd = (id: string, seconds: number) =>
    change(id, (cue) => ({
      ...cue,
      end: hundredth(Math.max(Math.min(length, seconds), cue.start + SHORTEST)),
    }));
  // While a time is being typed, the rows keep their places (the saved list is
  // always in order), so the row being edited does not jump away from the typing.
  const [held, setHeld] = useState<string[] | null>(null);
  const rows = held
    ? [
        ...held.flatMap((id) => cues.filter((cue) => cue.id === id)),
        ...cues.filter((cue) => !held.includes(cue.id)),
      ]
    : cues;
  const hold = () => setHeld((was) => was ?? cues.map((cue) => cue.id));
  const release = () => setHeld(null);

  // Playback: the cursor follows the sound.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const follow = () => {
      const element = player.current;
      if (element) setCursor(element.currentTime);
      frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  useEffect(() => () => player.current?.pause(), []);

  const play = () => {
    const element = player.current;
    if (!element) return;
    if (playing) {
      element.pause();
      return;
    }
    element.currentTime = cursor >= length - 0.01 ? 0 : cursor;
    void element.play().catch(() => setPlaying(false));
  };

  const moveCursor = (at: number) => {
    const to = Math.min(length, Math.max(0, at));
    setCursor(to);
    if (player.current) player.current.currentTime = to;
  };

  // Pressing the waveform moves the cursor there. Pressed on a caption, it
  // also chooses it; dragged, it moves the caption, or the edge pressed. A
  // drag is one undo step. Dragged elsewhere, the cursor follows.
  const drag = useRef<{
    pointer: number;
    fromX: number;
    fromAt: number;
    hold: { original: CaptionCue; grip: CueGrip } | null;
    moved: boolean;
  } | null>(null);
  const [hover, setHover] = useState<CueGrip | null>(null);
  const timeAt = (event: ReactPointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      at: Math.min(length, Math.max(0, ((event.clientX - box.left) / box.width) * length)),
      reach: (EDGE_REACH / Math.max(1, box.width)) * length,
    };
  };
  const endDrag = () => {
    const was = drag.current;
    drag.current = null;
    if (was?.hold && was.moved) editor.commitGesture();
  };
  useEffect(() => () => endDrag(), []);

  const pressWave = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const { at, reach } = timeAt(event);
    const grip = gripAt(cues, at, reach, chosen);
    const original = grip ? cues.find((cue) => cue.id === grip.id) : undefined;
    endDrag();
    drag.current = {
      pointer: event.pointerId,
      fromX: event.clientX,
      fromAt: at,
      hold: original && grip ? { original, grip: grip.grip } : null,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    moveCursor(at);
    setChosen(grip?.id ?? null);
  };
  const moveOnWave = (event: ReactPointerEvent<SVGSVGElement>) => {
    const { at, reach } = timeAt(event);
    const now = drag.current;
    if (!now || now.pointer !== event.pointerId) {
      const grip = gripAt(cues, at, reach, chosen)?.grip ?? null;
      if (grip !== hover) setHover(grip);
      return;
    }
    if (!now.moved && Math.abs(event.clientX - now.fromX) < DRAG_START) return;
    if (!now.hold) {
      now.moved = true;
      moveCursor(at);
      return;
    }
    if (!now.moved) {
      now.moved = true;
      editor.beginGesture(
        now.hold.grip === 'move'
          ? 'Move caption'
          : now.hold.grip === 'start'
            ? 'Change caption start'
            : 'Change caption end',
      );
    }
    const { original, grip } = now.hold;
    const next = dragCue(original, grip, at - now.fromAt, length);
    setCaptions(cues.map((cue) => (cue.id === original.id ? next : cue)));
    moveCursor(grip === 'end' ? next.end : next.start);
  };
  const keyOnWave = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    const step = event.shiftKey ? 1 : 0.1;
    const to =
      event.key === 'ArrowLeft'
        ? cursor - step
        : event.key === 'ArrowRight'
          ? cursor + step
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? length
              : null;
    if (to === null) return;
    event.preventDefault();
    moveCursor(hundredth(to));
  };

  const add = () => {
    const start = hundredth(Math.min(cursor, length - SHORTEST));
    const end = hundredth(Math.min(length, start + NEW_CAPTION));
    const cue: CaptionCue = { id: createId('caption'), start, end, text: '' };
    focusNew.current = cue.id;
    setChosen(cue.id);
    setCaptions([...cues, cue], 'Add caption');
  };

  const importFile = async () => {
    try {
      const file = await window.vedraopus.project.openCaptions();
      if (!file) return;
      const { cues: read, problems } = parseCaptions(file.text);
      const fits = read.filter((cue) => cue.start < length);
      const trimmed = fits.map((cue) => ({ ...cue, end: Math.min(cue.end, length) }));
      const dropped = read.length - fits.length;
      setCaptions(trimmed, 'Import captions');
      const parts = [
        `${trimmed.length} caption${trimmed.length === 1 ? '' : 's'} from ${file.fileName}${cues.length > 0 ? `, in place of the ${cues.length} there were (undo brings them back)` : ''}.`,
        dropped > 0 ? `${dropped} started after the media ends and were left out.` : '',
        ...problems,
      ].filter(Boolean);
      setNotice(parts.join(' '));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const exportFile = async () => {
    try {
      // A caption still waiting for its words would make an unreadable file.
      const written = cues.filter((cue) => cue.text.trim() !== '');
      const saved = await window.vedraopus.project.saveCaptions({
        defaultName: `${media.name}.vtt`,
        vtt: formatVtt(written),
        srt: formatSrt(written),
      });
      if (saved) setNotice(`Saved ${written.length} captions to ${saved}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const wave = analysis ? waveformPath(analysis.peaks, 0, analysis.length) : null;
  const width = Math.max(1, Math.ceil(length / PEAK_STEP));
  const underCursor = cues.find((cue) => cue.start <= cursor && cursor < cue.end)?.id;

  return (
    <div className="captions" data-testid="captions-panel">
      {!isVideo && (
        <audio
          ref={(element) => {
            player.current = element;
          }}
          src={url}
          preload="auto"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          hidden
        />
      )}
      <div className="captions-toolbar" role="toolbar" aria-label="Captions">
        <button type="button" onClick={play} aria-pressed={playing}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <span className="captions-time" data-testid="captions-cursor">
          {clock(cursor)} / {clock(length)}
        </span>
        <button type="button" onClick={add}>
          Add caption
        </button>
        <button type="button" onClick={() => void importFile()}>
          Import captions…
        </button>
        <button type="button" disabled={cues.length === 0} onClick={() => void exportFile()}>
          Export captions…
        </button>
      </div>
      <div className="captions-track">
        {isVideo && (
          // The picture, to caption what is seen as well as heard; it is what plays.
          <video
            className="captions-video"
            data-testid="captions-video"
            ref={(element) => {
              player.current = element;
            }}
            src={url}
            poster={media.props.poster ? assetUrl(open.session, media.props.poster) : undefined}
            preload="auto"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
          />
        )}
        <svg
          className={`captions-wave${hover ? ` grip-${hover}` : ''}`}
          data-testid="captions-wave"
          viewBox={`0 0 ${width} 100`}
          preserveAspectRatio="none"
          role="slider"
          tabIndex={0}
          aria-label="Caption position"
          aria-valuemin={0}
          aria-valuemax={length}
          aria-valuenow={hundredth(cursor)}
          aria-valuetext={clock(cursor)}
          onPointerDown={pressWave}
          onPointerMove={moveOnWave}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
          onPointerLeave={() => setHover(null)}
          onKeyDown={keyOnWave}
        >
          {silent && <line className="captions-wave-flat" x1={0} x2={width} y1={50} y2={50} />}
          {wave && (
            <path
              className="captions-wave-shape"
              d={wave.d}
              transform={`scale(${width / Math.max(1, wave.points)} 1)`}
            />
          )}
          {cues.map((cue) => (
            <rect
              key={cue.id}
              className="captions-block"
              data-testid="captions-block"
              aria-selected={cue.id === chosen}
              x={cue.start / PEAK_STEP}
              width={Math.max(1, (cue.end - cue.start) / PEAK_STEP)}
              y={4}
              height={92}
            />
          ))}
          <line
            className="captions-cursor"
            x1={cursor / PEAK_STEP}
            x2={cursor / PEAK_STEP}
            y1={0}
            y2={100}
          />
        </svg>
      </div>
      {silent && (
        <p className="muted captions-silent" data-testid="captions-silent">
          {isVideo
            ? 'This video has no sound track, so there is no waveform to show. Play it to see where each caption goes.'
            : 'This sound could not be read to draw its waveform.'}
        </p>
      )}
      {notice && (
        <p className="captions-notice" role="status" data-testid="captions-notice">
          {notice}
        </p>
      )}
      {cues.length === 0 ? (
        <p className="muted">
          No captions yet. Play the sound, then Add caption where it should start, or import a VTT
          or SRT file.
        </p>
      ) : (
        <ol className="captions-list">
          {rows.map((cue, index) => (
            <li
              key={cue.id}
              data-testid="caption-row"
              aria-current={cue.id === underCursor ? 'true' : undefined}
              className={cue.id === chosen ? 'chosen' : undefined}
            >
              <label onFocus={hold} onBlur={release}>
                <span>Start</span>
                <NumericInput
                  aria-label={`Caption ${index + 1} start`}
                  value={String(cue.start)}
                  undoLabel="Change caption start"
                  onValue={(n) => n !== null && setStart(cue.id, n)}
                />
              </label>
              <label onFocus={hold} onBlur={release}>
                <span>End</span>
                <NumericInput
                  aria-label={`Caption ${index + 1} end`}
                  value={String(cue.end)}
                  undoLabel="Change caption end"
                  onValue={(n) => n !== null && setEnd(cue.id, n)}
                />
              </label>
              <input
                className="caption-text"
                aria-label={`Caption ${index + 1} text`}
                // Remount when the text changes from elsewhere (undo, import).
                key={`${cue.id}/${cue.text}`}
                defaultValue={cue.text}
                placeholder="What is said"
                ref={(element) => {
                  if (element && focusNew.current === cue.id) {
                    focusNew.current = null;
                    element.focus();
                  }
                }}
                onFocus={() => {
                  setChosen(cue.id);
                  setCursor(cue.start);
                  if (player.current) player.current.currentTime = cue.start;
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
                onBlur={(event) => {
                  const text = event.currentTarget.value;
                  if (text !== cue.text) change(cue.id, (each) => ({ ...each, text }));
                }}
              />
              <button
                type="button"
                aria-label={`Delete caption ${index + 1}`}
                onClick={() =>
                  setCaptions(
                    cues.filter((each) => each.id !== cue.id),
                    'Delete caption',
                  )
                }
              >
                Delete
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

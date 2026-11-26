import { effectLength } from '@vedraopus/engine';
import { createId } from '@vedraopus/model';
import type { SceneObject, Timing } from '@vedraopus/model';
import { Fragment, useEffect, useEffectEvent, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useAudioAnalysis, waveformPath } from '../audio-analysis';
import { assetUrl, editor, getEditorState, useEditor } from '../project-store';
import { useTimelinePictures, useTimelineSound } from '../timeline-sound';
import { spaceBelongsTo, spaceKey } from '../space-key';
import { NumericInput } from './NumericInput';
import type { CurrentSlide, OpenProject } from '../project-store';

const ZOOM_STEPS = [20, 40, 80, 160, 320];
const MIN_DURATION = 0.1;
/** Times set by dragging land on tenths of a second. */
const tenth = (seconds: number) => Math.round(seconds * 10) / 10;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Track pointer movement until release, reporting how far it has moved in pixels. */
function trackDrag(
  event: ReactPointerEvent,
  onMove: (dx: number) => void,
  onEnd: (moved: boolean) => void,
): void {
  event.preventDefault();
  event.stopPropagation();
  const startX = event.clientX;
  let moved = false;
  const move = (e: PointerEvent) => {
    const dx = e.clientX - startX;
    if (Math.abs(dx) >= 2) moved = true;
    if (moved) onMove(dx);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    onEnd(moved);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

/**
 * An audio object's sound, drawn across its bar. The bar may be shorter than
 * the sound (it stops early) or longer (silence after it ends).
 */
function Waveform({ url, seconds }: { url: string; seconds: number }) {
  const analysis = useAudioAnalysis(url);
  if (!analysis || seconds <= 0) return null;
  const shown = Math.min(seconds, analysis.length);
  const { d, points } = waveformPath(analysis.peaks, 0, shown);
  return (
    <svg
      className="timeline-waveform"
      data-testid="timeline-waveform"
      viewBox={`0 0 ${points} 100`}
      preserveAspectRatio="none"
      style={{ width: `${(shown / seconds) * 100}%` }}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

/** A group's members at any depth, each with how deep it is (B8). */
function membersOf(group: SceneObject): { member: SceneObject; depth: number }[] {
  const found: { member: SceneObject; depth: number }[] = [];
  const walk = (children: readonly SceneObject[], depth: number) => {
    for (const child of [...children].reverse()) {
      found.push({ member: child, depth });
      if (child.type === 'group') walk(child.children, depth + 1);
    }
  };
  if (group.type === 'group') walk(group.children, 1);
  return found;
}

/**
 * The slide's timeline: a row per object (top row = front), each with a bar for
 * when it is on stage; a ruler with the playhead and cue points. Dragging the
 * playhead or pressing Play shows the stage as the engine would at that time.
 */
export function Timeline({ open, current }: { open: OpenProject; current: CurrentSlide }) {
  const { selection, playhead: rawPlayhead, timelinePreview, groupPart } = useEditor();
  const { history } = open;
  const layer = current.slide.baseLayer;
  const duration = layer.timeline.duration;
  const playhead = Math.min(rawPlayhead, duration);
  const [pps, setPps] = useState(80);
  const [playing, setPlaying] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [selectedCue, setSelectedCue] = useState<string | null>(null);
  const rows = [...layer.objects].reverse();
  const selected = layer.objects.filter((object) => selection.includes(object.id));
  const width = duration * pps;

  // Play: move the playhead with the clock until the end of the timeline.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    let at = playhead >= duration ? 0 : playhead;
    editor.setTimelinePreview(true);
    const step = (now: number) => {
      at = Math.min(duration, at + (now - last) / 1000);
      last = now;
      editor.setPlayhead(at);
      if (at >= duration) setPlaying(false);
      else frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      editor.setTimelinePreview(false);
    };
    // Starting point is read once, when Play is pressed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, duration]);

  // The layer's sound plays with it (docs/briefs/P6.7-zoom-and-cues.md), and its videos' pictures.
  useTimelineSound(open, layer, playing, playhead);
  useTimelinePictures(layer, playing, playhead);

  // Space plays and pauses the timeline when it is let go (Luke, testing alpha 1), unless the
  // author is typing or on a control, or held it to pan the stage (space-key.ts).
  useEffect(() => {
    let pressed = false;
    const down = (event: KeyboardEvent) => {
      if (event.key !== ' ' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.repeat) {
        if (pressed) event.preventDefault();
        return;
      }
      pressed = !spaceBelongsTo(event.target);
      if (!pressed) return;
      spaceKey.panned = false;
      event.preventDefault();
    };
    const up = (event: KeyboardEvent) => {
      if (event.key !== ' ' || !pressed) return;
      pressed = false;
      event.preventDefault();
      if (!spaceKey.panned) setPlaying((now) => !now);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // While it plays, C drops a cue point where the playhead is, so cues can be
  // placed on what is heard.
  const addCueHere = useEffectEvent(() => {
    history.execute('cuePoint.add', {
      layerId: layer.id,
      cuePoint: {
        id: createId('cue'),
        name: `Cue ${layer.timeline.cuePoints.length + 1}`,
        time: Math.round(Math.min(getEditorState().playhead, duration) * 100) / 100,
      },
    });
  });
  useEffect(() => {
    if (!playing) return;
    const press = (event: KeyboardEvent) => {
      if (event.key !== 'c' && event.key !== 'C') return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.closest('input, textarea, select') || target.isContentEditable)) return;
      event.preventDefault();
      event.stopPropagation();
      addCueHere();
    };
    window.addEventListener('keydown', press, true);
    return () => window.removeEventListener('keydown', press, true);
  }, [playing]);

  const update = (
    objectId: string,
    changes: Parameters<typeof history.execute<'object.update'>>[1]['changes'],
  ) => history.execute('object.update', { objectId, changes });

  const endOf = (timing: Timing) =>
    timing.duration === 'untilEnd' ? duration : timing.start + timing.duration;

  const dragBar = (
    event: ReactPointerEvent,
    object: SceneObject,
    part: 'body' | 'start' | 'end',
    /** A click without a drag: selects the object, unless the row says otherwise. */
    onClick: () => void = () => editor.select([object.id]),
  ) => {
    if (event.button !== 0) return;
    const original = object.timing;
    const originalEnd = endOf(original);
    let began = false;
    trackDrag(
      event,
      (dx) => {
        if (!began) {
          editor.beginGesture('Change timing');
          began = true;
        }
        const delta = dx / pps;
        let timing: Timing;
        if (part === 'body') {
          const length = originalEnd - original.start;
          const start = tenth(
            clamp(original.start + delta, 0, Math.max(0, duration - MIN_DURATION)),
          );
          timing =
            original.duration === 'untilEnd'
              ? { start, duration: 'untilEnd' }
              : { start, duration: tenth(length) };
        } else if (part === 'start') {
          const start = tenth(clamp(original.start + delta, 0, originalEnd - MIN_DURATION));
          timing =
            original.duration === 'untilEnd'
              ? { start, duration: 'untilEnd' }
              : { start, duration: tenth(originalEnd - start) };
        } else {
          const end = tenth(Math.max(original.start + MIN_DURATION, originalEnd + delta));
          // Dragged to the end of the timeline or past it: stay until the end.
          timing =
            end >= duration
              ? { start: original.start, duration: 'untilEnd' }
              : { start: original.start, duration: tenth(end - original.start) };
        }
        update(object.id, { timing });
      },
      (moved) => {
        if (began) editor.commitGesture();
        if (!moved) onClick();
      },
    );
  };

  /** An object's bar on the timeline: its time on stage, its effects and its handles. */
  const barFor = (object: SceneObject, onClick?: () => void) => {
    const end = endOf(object.timing);
    return (
      <div className="timeline-track" style={{ width }}>
        <div
          className="timeline-bar"
          data-testid="timeline-bar"
          data-start={object.timing.start}
          data-duration={object.timing.duration}
          style={{
            left: object.timing.start * pps,
            width: Math.max(4, (end - object.timing.start) * pps),
          }}
          onPointerDown={(event) => dragBar(event, object, 'body', onClick)}
        >
          {object.type === 'audio' && (
            <Waveform
              url={assetUrl(open.session, object.props.asset)}
              seconds={end - object.timing.start}
            />
          )}
          {(['entrance', 'exit'] as const).map((phase) => {
            const effect = object.animations[phase];
            if (!effect) return null;
            // As long as it plays, within the bar (the exit finishes at its end).
            const span = end - object.timing.start;
            const seconds = Math.min(span, effectLength(object, effect));
            return (
              <span
                key={phase}
                className={`timeline-effect timeline-effect-${phase}`}
                data-testid={`timeline-${phase}`}
                data-seconds={seconds}
                title={`${phase === 'entrance' ? 'Entrance' : 'Exit'}: ${effect.kind}, ${seconds} s`}
                style={{ width: `${(seconds / Math.max(span, 0.001)) * 100}%` }}
              />
            );
          })}
          <span
            className="timeline-handle timeline-handle-start"
            data-testid="timeline-bar-start"
            onPointerDown={(event) => dragBar(event, object, 'start', onClick)}
          />
          <span
            className="timeline-handle timeline-handle-end"
            data-testid="timeline-bar-end"
            onPointerDown={(event) => dragBar(event, object, 'end', onClick)}
          />
        </div>
      </div>
    );
  };

  const scrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const left = event.currentTarget.getBoundingClientRect().left;
    const timeAt = (clientX: number) => clamp((clientX - left) / pps, 0, duration);
    setPlaying(false);
    editor.setPlayhead(timeAt(event.clientX));
    editor.setTimelinePreview(true);
    const startX = event.clientX;
    trackDrag(
      event,
      (dx) => editor.setPlayhead(timeAt(startX + dx)),
      () => editor.setTimelinePreview(false),
    );
  };

  const dragCue = (event: ReactPointerEvent, cueId: string, time: number) => {
    if (event.button !== 0) return;
    setSelectedCue(cueId);
    let began = false;
    trackDrag(
      event,
      (dx) => {
        if (!began) {
          editor.beginGesture('Move cue point');
          began = true;
        }
        history.execute('cuePoint.update', {
          cuePointId: cueId,
          changes: { time: tenth(clamp(time + dx / pps, 0, duration)) },
        });
      },
      () => {
        if (began) editor.commitGesture();
      },
    );
  };

  const forSelected = (label: string, timing: (object: SceneObject) => Timing) => {
    if (selected.length === 0) return;
    editor.beginGesture(label);
    for (const object of selected) update(object.id, { timing: timing(object) });
    editor.commitGesture();
  };

  const zoomIndex = ZOOM_STEPS.indexOf(pps);
  const finishRename = (object: SceneObject, value: string | null) => {
    setRenaming(null);
    const name = value?.trim();
    if (name && name !== object.name)
      history.execute('object.rename', { objectId: object.id, name });
  };

  return (
    <div className="timeline" data-testid="timeline">
      <div className="timeline-toolbar" role="toolbar" aria-label="Timeline">
        <button onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</button>
        <span className="timeline-time" data-testid="timeline-time">
          {playhead.toFixed(1)} s
        </span>
        <label>
          Length
          <NumericInput
            aria-label="Timeline length in seconds"
            min={0.1}
            undoLabel="Change timeline length"
            value={String(duration)}
            onValue={(value) => {
              if (value !== null && value > 0) {
                history.execute('layer.setDuration', { layerId: layer.id, duration: value });
              }
            }}
          />
        </label>
        <button
          disabled={zoomIndex <= 0}
          onClick={() => setPps(ZOOM_STEPS[zoomIndex - 1]!)}
          aria-label="Zoom timeline out"
        >
          −
        </button>
        <button
          disabled={zoomIndex >= ZOOM_STEPS.length - 1}
          onClick={() => setPps(ZOOM_STEPS[zoomIndex + 1]!)}
          aria-label="Zoom timeline in"
        >
          +
        </button>
        <button
          aria-label="Show until end"
          title="Show until end"
          disabled={selected.length === 0}
          onClick={() =>
            forSelected('Show until end', (object) => ({
              start: object.timing.start,
              duration: 'untilEnd',
            }))
          }
        >
          Until end
        </button>
        <button
          aria-label="Align to playhead"
          title="Align to playhead"
          disabled={selected.length === 0}
          onClick={() =>
            forSelected('Align to playhead', (object) => ({
              start: tenth(playhead),
              duration: object.timing.duration,
            }))
          }
        >
          To playhead
        </button>
        <select
          aria-label="Align to cue point"
          title="Start the selected objects at a cue point"
          disabled={selected.length === 0 || layer.timeline.cuePoints.length === 0}
          value=""
          onChange={(event) => {
            const cue = layer.timeline.cuePoints.find((each) => each.id === event.target.value);
            if (!cue) return;
            forSelected('Align to cue point', (object) => ({
              start: cue.time,
              duration: object.timing.duration,
            }));
          }}
        >
          <option value="">To cue…</option>
          {[...layer.timeline.cuePoints]
            .sort((a, b) => a.time - b.time)
            .map((cue) => (
              <option key={cue.id} value={cue.id}>
                {cue.name} ({cue.time} s)
              </option>
            ))}
        </select>
        <button
          aria-label="Add cue point"
          title="Add cue point (or press C while playing)"
          onClick={() => {
            const cue = {
              id: createId('cue'),
              name: `Cue ${layer.timeline.cuePoints.length + 1}`,
              time: tenth(playhead),
            };
            history.execute('cuePoint.add', { layerId: layer.id, cuePoint: cue });
            setSelectedCue(cue.id);
          }}
        >
          + Cue
        </button>
        <button
          aria-label="Delete cue point"
          title="Delete cue point"
          disabled={!layer.timeline.cuePoints.some((cue) => cue.id === selectedCue)}
          onClick={() => {
            if (selectedCue) history.execute('cuePoint.remove', { cuePointId: selectedCue });
            setSelectedCue(null);
          }}
        >
          − Cue
        </button>
      </div>
      <div className="timeline-scroll">
        <div className="timeline-grid">
          <div className="timeline-corner" />
          <div
            className="timeline-ruler"
            data-testid="timeline-ruler"
            data-pps={pps}
            style={{ width }}
            onPointerDown={scrub}
          >
            {Array.from({ length: Math.floor(duration) + 1 }, (_, second) => (
              <span key={second} className="timeline-tick" style={{ left: second * pps }}>
                {second}s
              </span>
            ))}
            {layer.timeline.cuePoints.map((cue) => (
              <button
                key={cue.id}
                className="timeline-cue"
                data-testid="timeline-cue"
                data-time={cue.time}
                aria-label={`${cue.name} at ${cue.time} seconds`}
                aria-pressed={cue.id === selectedCue}
                title={cue.name}
                style={{ left: cue.time * pps }}
                onPointerDown={(event) => dragCue(event, cue.id, cue.time)}
              />
            ))}
            <div
              className="timeline-playhead"
              data-testid="timeline-playhead"
              data-time={playhead}
              data-previewing={timelinePreview ? 'true' : undefined}
              style={{ left: playhead * pps }}
            />
          </div>
          {rows.length === 0 && <p className="placeholder">No objects on this slide yet.</p>}
          {rows.map((object, rowIndex) => {
            const index = layer.objects.length - 1 - rowIndex;
            return (
              <Fragment key={object.id}>
                <div
                  className="timeline-row"
                  data-testid="timeline-row"
                  data-object-id={object.id}
                  aria-current={selection.includes(object.id) ? 'true' : undefined}
                >
                  <div className="timeline-label" onClick={() => editor.select([object.id])}>
                    <button
                      aria-label={`${object.hiddenInEditor ? 'Show' : 'Hide'} ${object.name}`}
                      aria-pressed={object.hiddenInEditor}
                      title={object.hiddenInEditor ? 'Show in editor' : 'Hide in editor'}
                      onClick={(event) => {
                        event.stopPropagation();
                        update(object.id, { hiddenInEditor: !object.hiddenInEditor });
                      }}
                    >
                      {object.hiddenInEditor ? '○' : '●'}
                    </button>
                    <button
                      aria-label={`${object.locked ? 'Unlock' : 'Lock'} ${object.name}`}
                      aria-pressed={object.locked}
                      title={object.locked ? 'Unlock' : 'Lock'}
                      onClick={(event) => {
                        event.stopPropagation();
                        update(object.id, { locked: !object.locked });
                      }}
                    >
                      {object.locked ? '🔒' : '🔓'}
                    </button>
                    {renaming === object.id ? (
                      <input
                        className="overview-rename"
                        aria-label="Object name"
                        defaultValue={object.name}
                        autoFocus
                        onFocus={(event) => event.currentTarget.select()}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                          if (event.key === 'Enter')
                            finishRename(object, event.currentTarget.value);
                          else if (event.key === 'Escape') finishRename(object, null);
                        }}
                        onBlur={(event) => finishRename(object, event.currentTarget.value)}
                      />
                    ) : (
                      <span
                        className="timeline-name"
                        title="Double-click to rename"
                        onDoubleClick={() => setRenaming(object.id)}
                      >
                        {object.name}
                      </span>
                    )}
                    <button
                      aria-label={`Bring ${object.name} forward`}
                      title="Bring forward"
                      disabled={index >= layer.objects.length - 1}
                      onClick={(event) => {
                        event.stopPropagation();
                        history.execute('object.reorder', {
                          objectId: object.id,
                          index: index + 1,
                        });
                      }}
                    >
                      ▲
                    </button>
                    <button
                      aria-label={`Send ${object.name} backward`}
                      title="Send backward"
                      disabled={index <= 0}
                      onClick={(event) => {
                        event.stopPropagation();
                        history.execute('object.reorder', {
                          objectId: object.id,
                          index: index - 1,
                        });
                      }}
                    >
                      ▼
                    </button>
                  </div>
                  {barFor(object)}
                </div>
                {selection.length === 1 &&
                  selection[0] === object.id &&
                  object.type === 'group' &&
                  membersOf(object).map(({ member, depth }) => (
                    <div
                      key={member.id}
                      className="timeline-row timeline-member"
                      data-testid="timeline-member-row"
                      data-object-id={member.id}
                      aria-current={groupPart === member.id ? 'true' : undefined}
                    >
                      <div
                        className="timeline-label"
                        style={{ paddingLeft: depth * 16 }}
                        onClick={() => editor.chooseGroupPart(member.id)}
                      >
                        <span className="timeline-name" title={`In ${object.name}`}>
                          {member.name}
                        </span>
                      </div>
                      {barFor(member, () => editor.chooseGroupPart(member.id))}
                    </div>
                  ))}
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

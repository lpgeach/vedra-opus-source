import { forEachObject } from '@vedraopus/model';
import type { AudioObject, Layer, VideoObject } from '@vedraopus/model';
import { useEffect, useRef } from 'react';
import { assetUrl } from './project-store';
import type { OpenProject } from './project-store';

/** How far a sound may drift from the playhead before it is put back in step, in seconds. */
export const DRIFT = 0.15;

type Media = AudioObject | VideoObject;

/**
 * Where in its file a sound should be with the playhead at `playhead`, or null
 * when it should be silent: before its bar, after its bar or its end, or when
 * a trigger starts it rather than the timeline.
 */
export function soundTimeAt(object: Media, playhead: number): number | null {
  if (object.props.startOn !== 'timeline') return null;
  const into = playhead - object.timing.start;
  const played =
    object.type === 'video' ? object.props.trimEnd - object.props.trimStart : object.props.length;
  const bar = object.timing.duration === 'untilEnd' ? Infinity : object.timing.duration;
  if (into < 0 || into >= Math.min(played, bar)) return null;
  return (object.type === 'video' ? object.props.trimStart : 0) + into;
}

/**
 * While the timeline plays in the editor, play its layer's sound with it
 * (docs/briefs/P6.7-zoom-and-cues.md): each sound and each video's sound
 * that starts with the timeline, while the playhead is in its bar, at its
 * own volume. The elements are hidden in the page (`data-timeline-sound`).
 */
export function useTimelineSound(
  open: OpenProject,
  layer: Layer,
  playing: boolean,
  playhead: number,
): void {
  const elements = useRef(new Map<string, HTMLAudioElement>());

  // Stopped: silence, and let the elements go.
  useEffect(() => {
    if (playing) return;
    for (const element of elements.current.values()) {
      element.pause();
      element.remove();
    }
    elements.current.clear();
  }, [playing]);
  useEffect(
    () => () => {
      for (const element of elements.current.values()) element.remove();
      elements.current.clear();
    },
    [],
  );

  useEffect(() => {
    if (!playing) return;
    const media: Media[] = [];
    forEachObject(layer.objects, (object) => {
      if (object.type === 'audio' || object.type === 'video') media.push(object);
    });
    for (const object of media) {
      const time = soundTimeAt(object, playhead);
      let element = elements.current.get(object.id);
      if (time === null) {
        if (element && !element.paused) element.pause();
        continue;
      }
      if (!element) {
        element = document.createElement('audio');
        element.dataset['timelineSound'] = object.id;
        element.hidden = true;
        element.src = assetUrl(open.session, object.props.asset);
        document.body.append(element);
        elements.current.set(object.id, element);
      }
      element.volume = object.props.volume;
      if (element.paused) {
        element.currentTime = time;
        void element.play().catch(() => undefined);
      } else if (Math.abs(element.currentTime - time) > DRIFT) {
        element.currentTime = time;
      }
    }
  }, [open.session, layer.objects, playing, playhead]);
}

/**
 * Each video's picture on the stage follows the playhead (found by Luke testing
 * alpha 1: Play on the timeline moved everything but the video). While the
 * timeline plays, a video that starts with it plays, muted (its sound plays
 * above), kept within `DRIFT` of the playhead; stopped or scrubbed, it shows its
 * frame at the playhead.
 */
export function useTimelinePictures(layer: Layer, playing: boolean, playhead: number): void {
  useEffect(() => {
    forEachObject(layer.objects, (object) => {
      if (object.type !== 'video') return;
      const element = document.querySelector<HTMLVideoElement>(
        `[data-testid="stage-canvas"] video[data-media-id="${object.id}"]`,
      );
      if (!element) return;
      const time = soundTimeAt(object, playhead);
      element.muted = true;
      if (!playing || time === null) {
        if (!element.paused) element.pause();
        const frame = time ?? object.props.trimStart;
        if (Math.abs(element.currentTime - frame) > 0.04) element.currentTime = frame;
        return;
      }
      if (element.paused) {
        element.currentTime = time;
        void element.play().catch(() => undefined);
      } else if (Math.abs(element.currentTime - time) > DRIFT) {
        element.currentTime = time;
      }
    });
  }, [layer.objects, playing, playhead]);
}

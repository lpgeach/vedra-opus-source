import type { Engine, EngineView } from '@vedraopus/engine';
import { forEachObject } from '@vedraopus/model';
import type { AudioObject, Project, VideoObject } from '@vedraopus/model';

/** An element more than this far from where the engine says it should be is moved. */
const DRIFT = 0.3;

export interface Soundboard {
  /** Tell the engine where each playing element is (before `engine.tick`). */
  report(engine: Engine): void;
  /** Make the elements do what the view says: play or pause, at the right place and volume. */
  sync(view: EngineView): void;
  /** The learner's volume, 0 to 1, times every element's own (P8.1). */
  setLevel(value: number): void;
  /** The learner's playback speed, for every element (P8.1). */
  setRate(value: number): void;
  /** After the learner allowed sound: play again what should be playing. */
  retry(view: EngineView): void;
  destroy(): void;
}

/**
 * An element as the board last left it: playing or not, where, and when.
 * A video with controls that is found otherwise was changed by the learner.
 * (Its events would come too late: by then the board may already have undone
 * the learner's press.)
 */
interface Seen {
  playing: boolean;
  time: number;
  stamp: number;
}

/** A jump further than this within one frame is a seek, not playing on. */
const JUMP = 1;

/**
 * The sound and video of the current slide. Audio gets one element for each
 * audio object, kept in a hidden container (not on the stage, so clicks never
 * reach them). Video plays in the `<video>` the renderer drew on the stage.
 * The engine decides what plays (docs/briefs/P6.1-audio.md, P6.2-video.md);
 * this follows it, reports the elements' times back so media can keep time,
 * and tells the engine when the learner uses a video's own controls.
 */
export function createSoundboard(
  project: Project,
  container: HTMLElement,
  stage: HTMLElement,
  assetUrl: (hash: string, ext: string) => string,
  events: {
    /** The browser refused to play sound before the learner did something. */
    onBlocked(): void;
    onWarning(message: string): void;
    /** The learner played, paused or moved a video with its controls. */
    onControl(objectId: string, playing: boolean, seconds: number): void;
  },
): Soundboard {
  const document = container.ownerDocument;
  const holder = document.createElement('div');
  holder.className = 'vo-player-media';
  holder.hidden = true;
  container.append(holder);

  const slides = new Map(
    [...project.scenes, ...project.banks]
      .flatMap((scene) => scene.slides)
      .map((slide) => [slide.id, slide]),
  );
  /** Every audio and video object, by id: where its element's time starts in its file. */
  const offsets = new Map<string, number>();
  for (const slide of slides.values()) {
    for (const layer of [slide.baseLayer, ...slide.layers]) {
      forEachObject(layer.objects, (object) => {
        if (object.type === 'video')
          offsets.set(object.id, (object as VideoObject).props.trimStart);
        if (object.type === 'audio') offsets.set(object.id, 0);
      });
    }
  }
  let slideId: string | null = null;
  let sounds = new Map<string, HTMLAudioElement>();
  const seen = new WeakMap<HTMLMediaElement, Seen>();
  const now = () => container.ownerDocument.defaultView?.performance.now() ?? Date.now();
  const note = (element: HTMLMediaElement, playing = !element.paused, time = element.currentTime) =>
    seen.set(element, { playing, time, stamp: now() });
  const warned = new Set<string>();

  const clear = () => {
    for (const element of sounds.values()) {
      element.pause();
      element.removeAttribute('src');
      element.load();
    }
    holder.replaceChildren();
    sounds = new Map();
  };

  const load = (id: string | null) => {
    clear();
    slideId = id;
    const slide = id ? slides.get(id) : undefined;
    if (!slide) return;
    for (const layer of [slide.baseLayer, ...slide.layers]) {
      forEachObject(layer.objects, (object) => {
        if (object.type !== 'audio') return;
        const audio = object as AudioObject;
        const meta = project.assets[audio.props.asset];
        if (!meta) return;
        const element = document.createElement('audio');
        element.preload = 'auto';
        element.dataset['mediaId'] = audio.id;
        element.src = assetUrl(audio.props.asset, meta.ext);
        holder.append(element);
        sounds.set(audio.id, element);
      });
    }
  };

  /** A video with controls the learner has played, paused or moved since the board last looked. */
  const learnerChanged = (element: HTMLMediaElement): boolean => {
    if (!(element instanceof HTMLVideoElement) || !element.controls) return false;
    const last = seen.get(element);
    if (!last) return false;
    if (!element.ended && last.playing !== !element.paused) return true;
    const expected =
      last.time + (last.playing ? ((now() - last.stamp) / 1000) * element.playbackRate : 0);
    return Math.abs(element.currentTime - expected) > JUMP;
  };

  /** The elements of the current slide, by object id. */
  const elements = (): Map<string, HTMLMediaElement> => {
    const all = new Map<string, HTMLMediaElement>(sounds);
    for (const video of stage.querySelectorAll<HTMLVideoElement>('video[data-media-id]')) {
      const id = video.dataset['mediaId']!;
      all.set(id, video);
    }
    return all;
  };

  const play = (id: string, element: HTMLMediaElement) => {
    element.muted = false;
    const started = element.play();
    note(element, true);
    started?.catch((error: unknown) => {
      note(element, false);
      const name = (error as { name?: string } | null)?.name;
      // Paused again before it started: nothing went wrong.
      if (name === 'AbortError') return;
      if (name === 'NotAllowedError') {
        events.onBlocked();
        return;
      }
      if (!warned.has(id)) {
        warned.add(id);
        events.onWarning(
          `A sound or video on this slide could not be played (${name ?? 'unknown error'}).`,
        );
      }
    });
  };
  const pause = (element: HTMLMediaElement) => {
    element.pause();
  };
  const seek = (element: HTMLMediaElement, seconds: number) => {
    element.currentTime = seconds;
  };

  /** The learner's volume (0 to 1) and playback speed, for every element (P8.1). */
  let level = 1;
  let rate = 1;
  /** The speed last given each element, so it is set once a change, not every frame. */
  const rateApplied = new WeakMap<HTMLMediaElement, number>();

  const sync = (view: EngineView) => {
    if (view.slideId !== slideId) load(view.slideId);
    const wanted = new Map(view.layers.flatMap((layer) => layer.media).map((m) => [m.id, m]));
    for (const [id, element] of elements()) {
      const offset = offsets.get(id) ?? 0;
      const media = wanted.get(id);
      if (media && learnerChanged(element)) {
        // The learner's doing: tell the engine, and do not undo it.
        note(element);
        events.onControl(id, !element.paused, element.currentTime - offset);
        continue;
      }
      if (!media || !media.playing) {
        if (!element.paused) pause(element);
        // A stopped one starts again from the beginning; a paused one from where it is.
        const at = offset + (media ? media.time : 0);
        if (Math.abs(element.currentTime - at) > DRIFT) seek(element, at);
        note(element, false);
        continue;
      }
      // The learner's volume and speed (P8.1), times the media's own.
      const volume = media.volume * level;
      // WebKit keeps volume as a 32-bit float, so an exact compare would set it every frame.
      if (Math.abs(element.volume - volume) > 0.001) element.volume = volume;
      // Only when the learner's speed changes: a video's own controls may set its rate too.
      if (rateApplied.get(element) !== rate) {
        element.playbackRate = rate;
        rateApplied.set(element, rate);
      }
      const at = offset + media.time;
      if (Math.abs(element.currentTime - at) > DRIFT) seek(element, at);
      if (element.paused) play(id, element);
      else note(element);
    }
  };

  return {
    report(engine) {
      for (const [id, element] of elements()) {
        if (!element.paused && !element.ended) {
          engine.mediaTime(id, element.currentTime - (offsets.get(id) ?? 0));
        }
      }
    },
    sync,
    setLevel(value: number) {
      level = Math.min(1, Math.max(0, value));
    },
    setRate(value: number) {
      rate = value;
    },
    retry(view) {
      for (const element of elements().values()) if (!element.paused) pause(element);
      sync(view);
    },
    destroy() {
      for (const element of elements().values()) element.pause();
      clear();
      holder.remove();
    },
  };
}

import { forEachObject } from '@vedraopus/model';
import type { MarkerObject, Project, SceneObject, Slide } from '@vedraopus/model';

/**
 * Hotspots and markers in a course (docs/briefs/P9.1-hotspots-markers.md):
 * both are buttons to the keyboard and to screen readers; a marker opens a
 * label of its own (title, text, a picture or video, a sound), one at a time.
 * The label is the player's, drawn on the stage so it scales with it.
 */

/** How wide a label may be, in stage pixels, and its gap from the marker. */
export const LABEL_WIDTH = 320;
const MEDIA_WIDTH = LABEL_WIDTH - 28;
const MEDIA_HEIGHT = Math.round((MEDIA_WIDTH * 9) / 16);
const GAP = 8;

/**
 * Where a label goes, in stage pixels: beside the marker on its right, or on
 * its left when there is no room; level with its top; always inside the stage.
 */
export function labelPlace(
  marker: { x: number; y: number; width: number; height: number },
  label: { width: number; height: number },
  stage: { width: number; height: number },
): { x: number; y: number } {
  const right = marker.x + marker.width + GAP;
  const left = marker.x - GAP - label.width;
  const x =
    right + label.width <= stage.width
      ? right
      : left >= 0
        ? left
        : Math.max(0, stage.width - label.width);
  const y = Math.min(Math.max(0, marker.y), Math.max(0, stage.height - label.height));
  return { x, y };
}

/** Plain text as paragraphs: a line a paragraph, blank lines left out. */
export function bodyParagraphs(body: string): string[] {
  return body
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => line.trim() !== '');
}

export interface MarkerEvents {
  assetUrl(hash: string, ext: string): string;
  /** The learner's volume and speed (P8.1), for a label's sound. */
  level(): number;
  rate(): number;
}

export function createMarkers(
  document: Document,
  project: Project,
  stage: HTMLElement,
  events: MarkerEvents,
) {
  /** Every hotspot and marker in the course, by id. */
  const objects = new Map<string, SceneObject>();
  const slides: Slide[] = [...project.scenes, ...project.banks].flatMap((scene) => scene.slides);
  for (const slide of slides) {
    for (const layer of [slide.baseLayer, ...slide.layers]) {
      forEachObject(layer.objects, (object) => {
        if (object.type === 'hotspot' || object.type === 'marker') objects.set(object.id, object);
      });
    }
  }

  let open: {
    marker: MarkerObject;
    label: HTMLElement;
    sound: HTMLAudioElement | null;
    element: HTMLElement | null;
  } | null = null;
  let elements = new Map<string, HTMLElement>();

  const make = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text?: string,
  ) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  const close = (): boolean => {
    if (!open) return false;
    open.sound?.pause();
    open.label.remove();
    open.element?.setAttribute('aria-expanded', 'false');
    open = null;
    return true;
  };

  const show = (marker: MarkerObject) => {
    close();
    const { props } = marker;
    const label = make('div', 'vo-marker-label');
    label.setAttribute('role', 'region');
    label.setAttribute('aria-label', props.title || marker.name);
    label.dataset['markerId'] = marker.id;
    label.style.width = `${LABEL_WIDTH}px`;
    if (props.title) label.append(make('h2', 'vo-marker-title', props.title));
    for (const line of bodyParagraphs(props.body)) label.append(make('p', '', line));
    const media = props.media ? project.assets[props.media] : undefined;
    if (props.media && media) {
      const url = events.assetUrl(props.media, media.ext);
      if (media.kind === 'video') {
        const video = make('video', 'vo-marker-media');
        video.src = url;
        video.controls = true;
        video.playsInline = true;
        video.width = MEDIA_WIDTH;
        video.height = MEDIA_HEIGHT;
        label.append(video);
      } else {
        const picture = make('img', 'vo-marker-media');
        picture.src = url;
        picture.alt = '';
        picture.width = MEDIA_WIDTH;
        picture.height = MEDIA_HEIGHT;
        label.append(picture);
      }
    }
    // Measured in stage pixels: the stage's scale does not change offset sizes.
    label.style.visibility = 'hidden';
    stage.append(label);
    const at = labelPlace(
      marker.frame,
      { width: LABEL_WIDTH, height: label.offsetHeight },
      project.stage,
    );
    label.style.left = `${at.x}px`;
    label.style.top = `${at.y}px`;
    label.style.visibility = '';
    let sound: HTMLAudioElement | null = null;
    const audio = props.audio ? project.assets[props.audio] : undefined;
    if (props.audio && audio) {
      sound = make('audio', 'vo-marker-sound');
      sound.src = events.assetUrl(props.audio, audio.ext);
      sound.volume = Math.min(1, Math.max(0, events.level()));
      sound.playbackRate = events.rate();
      label.append(sound);
      void sound.play().catch(() => undefined);
    }
    const element = elements.get(marker.id) ?? null;
    open = { marker, label, sound, element };
    element?.setAttribute('aria-expanded', 'true');
  };

  /** A click, or Enter or Space, on a marker that opens on click: open or close its label. */
  const activate = (id: string): void => {
    const object = objects.get(id);
    if (object?.type !== 'marker' || object.props.opensOn !== 'click') return;
    if (open?.marker.id === id) close();
    else show(object);
  };

  // Hover markers open while pointed at or focused, and close when left.
  const hoverMarker = (target: EventTarget | null): MarkerObject | null => {
    if (!(target instanceof stage.ownerDocument.defaultView!.Element)) return null;
    const element = target.closest<HTMLElement>('[data-object-type="marker"]');
    const object = element ? objects.get(element.dataset['objectId'] ?? '') : undefined;
    return object?.type === 'marker' && object.props.opensOn === 'hover' ? object : null;
  };
  const enter = (event: Event) => {
    const marker = hoverMarker(event.target);
    if (marker && open?.marker.id !== marker.id) show(marker);
  };
  const leave = (event: Event) => {
    const marker = hoverMarker(event.target);
    const to = (event as MouseEvent | FocusEvent).relatedTarget;
    if (!marker || open?.marker.id !== marker.id) return;
    if (to instanceof Node && (elements.get(marker.id)?.contains(to) || open.label.contains(to))) {
      return;
    }
    close();
  };
  stage.addEventListener('mouseover', enter);
  stage.addEventListener('focusin', enter);
  stage.addEventListener('mouseout', leave);
  stage.addEventListener('focusout', leave);
  // A press anywhere but the open marker or its label closes it.
  const outside = (event: Event) => {
    if (!open) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (open.label.contains(target) || elements.get(open.marker.id)?.contains(target)) return;
    close();
  };
  document.addEventListener('pointerdown', outside, true);

  return {
    activate,
    close,
    /** Whether `id` is a hotspot or a marker: something to press with Enter or Space. */
    isPressable: (id: string) => objects.has(id),
    /**
     * After the slide is drawn (or redrawn, which replaces attributes): button
     * semantics on its hotspots and markers, and the label closed if its
     * marker went (another slide, hidden, off stage).
     */
    mark(drawn: Map<string, HTMLElement>, visible: (id: string) => boolean) {
      elements = drawn;
      for (const [id, element] of drawn) {
        const object = objects.get(id);
        if (!object) continue;
        element.setAttribute('role', 'button');
        element.tabIndex = 0;
        element.dataset['press'] = 'true';
        if (object.type === 'marker') {
          element.setAttribute(
            'aria-label',
            object.props.title || object.a11y.altText || object.name,
          );
          element.setAttribute('aria-expanded', String(open?.marker.id === id));
        } else {
          element.setAttribute('aria-label', object.a11y.altText || object.name);
        }
      }
      if (open && (!drawn.has(open.marker.id) || !visible(open.marker.id))) close();
      if (open && !open.label.isConnected) {
        open.sound?.pause();
        open.element?.setAttribute('aria-expanded', 'false');
        open = null;
      }
    },
    destroy() {
      close();
      stage.removeEventListener('mouseover', enter);
      stage.removeEventListener('focusin', enter);
      stage.removeEventListener('mouseout', leave);
      stage.removeEventListener('focusout', leave);
      document.removeEventListener('pointerdown', outside, true);
    },
  };
}

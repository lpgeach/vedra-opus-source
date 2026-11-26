import { forEachObject } from '@vedraopus/model';
import type { PanoramaObject, PanoramaSpot, Project } from '@vedraopus/model';
import { bodyParagraphs } from './markers';

/**
 * 360° images in a course (docs/briefs/P9.10-panoramas.md). Render leaves a
 * `.vo-panorama` with a canvas and a button per spot; this draws the picture
 * into the canvas as the inside of a sphere (WebGL), or, where WebGL cannot use
 * the picture (a course opened from `file://` in Chromium), pans it flat with a
 * 2D canvas. It places the spot buttons over the view, turns the view by drag,
 * keys and wheel, opens markers' labels, and in guided mode adds Previous and
 * Next buttons that turn to each spot in order.
 */

export interface View {
  /** Degrees round from the picture's middle (right is positive). */
  yaw: number;
  /** Degrees up from the horizon. */
  pitch: number;
  /** How wide the view sees, in degrees. */
  fov: number;
}

const RAD = Math.PI / 180;
export const MIN_FOV = 30;
export const MAX_FOV = 100;
/** How far a key press turns the view, and zooms it. */
export const KEY_STEP = 5;

/** A yaw kept within −180° to 180°. */
export const wrapYaw = (yaw: number) => ((((yaw + 180) % 360) + 360) % 360) - 180;
const clampPitch = (pitch: number) => Math.min(90, Math.max(-90, pitch));
const clampFov = (fov: number) => Math.min(MAX_FOV, Math.max(MIN_FOV, fov));

/** The vertical angle seen, for a view of this width and height. */
export const verticalFov = (fov: number, width: number, height: number) =>
  (2 * Math.atan(Math.tan((fov * RAD) / 2) * (height / Math.max(width, 1)))) / RAD;

/**
 * Where a direction appears in a perspective view of this size, in pixels from
 * the top left; null when it is behind the viewer or outside the view.
 */
export function projectSpot(
  spot: { yaw: number; pitch: number },
  view: View,
  size: { width: number; height: number },
): { x: number; y: number } | null {
  const y = spot.yaw * RAD;
  const p = spot.pitch * RAD;
  // The direction, then turned so the view looks along +z.
  const dx = Math.cos(p) * Math.sin(y);
  const dy = Math.sin(p);
  const dz = Math.cos(p) * Math.cos(y);
  const y0 = view.yaw * RAD;
  const p0 = view.pitch * RAD;
  const x1 = dx * Math.cos(y0) - dz * Math.sin(y0);
  const z1 = dx * Math.sin(y0) + dz * Math.cos(y0);
  const y2 = dy * Math.cos(p0) - z1 * Math.sin(p0);
  const z2 = dy * Math.sin(p0) + z1 * Math.cos(p0);
  if (z2 <= 1e-6) return null;
  const focal = size.width / 2 / Math.tan((view.fov * RAD) / 2);
  const x = size.width / 2 + (focal * x1) / z2;
  const top = size.height / 2 - (focal * y2) / z2;
  if (x < 0 || x > size.width || top < 0 || top > size.height) return null;
  return { x, y: top };
}

/**
 * Where a direction appears when the picture is panned flat (no WebGL): yaw
 * and pitch move it evenly across and up; null outside the view.
 */
export function projectFlat(
  spot: { yaw: number; pitch: number },
  view: View,
  size: { width: number; height: number },
): { x: number; y: number } | null {
  const across = wrapYaw(spot.yaw - view.yaw) / view.fov;
  const up = (spot.pitch - view.pitch) / verticalFov(view.fov, size.width, size.height);
  const x = size.width / 2 + across * size.width;
  const y = size.height / 2 - up * size.height;
  if (x < 0 || x > size.width || y < 0 || y > size.height) return null;
  return { x, y };
}

/** A view turned by a drag of (dx, dy) screen pixels across a view `width` wide. */
export function dragged(view: View, dx: number, dy: number, width: number): View {
  const perPixel = view.fov / Math.max(width, 1);
  return {
    yaw: wrapYaw(view.yaw - dx * perPixel),
    pitch: clampPitch(view.pitch + dy * perPixel),
    fov: view.fov,
  };
}

/** A view after a key: arrows turn it, + and − zoom; null for other keys. */
export function keyed(view: View, key: string): View | null {
  switch (key) {
    case 'ArrowLeft':
      return { ...view, yaw: wrapYaw(view.yaw - KEY_STEP) };
    case 'ArrowRight':
      return { ...view, yaw: wrapYaw(view.yaw + KEY_STEP) };
    case 'ArrowUp':
      return { ...view, pitch: clampPitch(view.pitch + KEY_STEP) };
    case 'ArrowDown':
      return { ...view, pitch: clampPitch(view.pitch - KEY_STEP) };
    case '+':
    case '=':
      return { ...view, fov: clampFov(view.fov - KEY_STEP) };
    case '-':
    case '_':
      return { ...view, fov: clampFov(view.fov + KEY_STEP) };
    default:
      return null;
  }
}

const VERTEX = `attribute vec2 p; varying vec2 v; void main() { v = p; gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAGMENT = `precision highp float;
varying vec2 v;
uniform sampler2D picture;
uniform float yaw;
uniform float pitch;
uniform vec2 halfTan;
const float PI = 3.141592653589793;
void main() {
  vec3 d = normalize(vec3(v.x * halfTan.x, v.y * halfTan.y, 1.0));
  float cp = cos(pitch); float sp = sin(pitch);
  vec3 e = vec3(d.x, d.y * cp + d.z * sp, -d.y * sp + d.z * cp);
  float cy = cos(yaw); float sy = sin(yaw);
  vec3 w = vec3(e.x * cy + e.z * sy, e.y, -e.x * sy + e.z * cy);
  float lon = atan(w.x, w.z);
  float lat = asin(clamp(w.y, -1.0, 1.0));
  gl_FragColor = texture2D(picture, vec2((lon + PI) / (2.0 * PI), (PI / 2.0 - lat) / PI));
}`;

/** Something that draws a picture into a canvas for a view. */
interface Painter {
  readonly flat: boolean;
  draw(view: View, width: number, height: number): void;
}

/** A WebGL painter, or null when WebGL is missing or may not use the picture. */
function sphere(canvas: HTMLCanvasElement, picture: HTMLImageElement): Painter | null {
  const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
  if (!gl) return null;
  const shader = (type: number, source: string) => {
    const made = gl.createShader(type)!;
    gl.shaderSource(made, source);
    gl.compileShader(made);
    return gl.getShaderParameter(made, gl.COMPILE_STATUS) ? made : null;
  };
  const vertex = shader(gl.VERTEX_SHADER, VERTEX);
  const fragment = shader(gl.FRAGMENT_SHADER, FRAGMENT);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const at = gl.getAttribLocation(program, 'p');
  gl.enableVertexAttribArray(at);
  gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  try {
    // Throws for a picture WebGL may not read (file:// counts as another origin).
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, picture);
  } catch {
    return null;
  }
  if (gl.getError() !== gl.NO_ERROR) return null;
  // Any size of picture: no mipmaps, edges clamped (WebGL 1 and non-power-of-two sizes).
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const yaw = gl.getUniformLocation(program, 'yaw');
  const pitch = gl.getUniformLocation(program, 'pitch');
  const halfTan = gl.getUniformLocation(program, 'halfTan');
  return {
    flat: false,
    draw(view, width, height) {
      gl.viewport(0, 0, width, height);
      gl.uniform1f(yaw, view.yaw * RAD);
      gl.uniform1f(pitch, view.pitch * RAD);
      const across = Math.tan((view.fov * RAD) / 2);
      gl.uniform2f(halfTan, across, (across * height) / Math.max(width, 1));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}

/** The picture panned flat with a 2D canvas: the part of it the view covers, wrapping round. */
function flatPainter(canvas: HTMLCanvasElement, picture: HTMLImageElement): Painter {
  const context = canvas.getContext('2d');
  return {
    flat: true,
    draw(view, width, height) {
      if (!context) return;
      const w = picture.naturalWidth;
      const h = picture.naturalHeight;
      if (!w || !h) return;
      const across = (view.fov / 360) * w;
      const up = (verticalFov(view.fov, width, height) / 180) * h;
      let left = ((view.yaw + 180) / 360) * w - across / 2;
      const top = Math.min(
        Math.max(0, ((90 - view.pitch) / 180) * h - up / 2),
        Math.max(0, h - up),
      );
      left = ((left % w) + w) % w;
      context.clearRect(0, 0, width, height);
      const first = Math.min(across, w - left);
      context.drawImage(picture, left, top, first, up, 0, 0, (first / across) * width, height);
      if (first < across) {
        const rest = across - first;
        context.drawImage(
          picture,
          0,
          top,
          rest,
          up,
          (first / across) * width,
          0,
          (rest / across) * width,
          height,
        );
      }
    },
  };
}

export interface PanoramaEvents {
  /** The learner opened a spot: tell the engine. */
  open(objectId: string, spotId: string): void;
  /** The player's words. */
  say(key: 'spotPrevious' | 'spotNext' | 'close'): string;
  /** With reduced motion, guided turns jump instead of gliding. */
  reducedMotion(): boolean;
}

interface Live {
  element: HTMLElement;
  canvas: HTMLCanvasElement;
  painter: Painter | null;
  picture: HTMLImageElement;
}

export function createPanoramas(
  document: Document,
  project: Project,
  stage: HTMLElement,
  events: PanoramaEvents,
) {
  const objects = new Map<string, PanoramaObject>();
  for (const scene of [...project.scenes, ...project.banks]) {
    for (const slide of scene.slides) {
      for (const layer of [slide.baseLayer, ...slide.layers]) {
        forEachObject(layer.objects, (object) => {
          if (object.type === 'panorama') objects.set(object.id, object);
        });
      }
    }
  }
  /** Where each image is looking, kept across redraws; and the guided place. */
  const views = new Map<string, View>();
  const guided = new Map<string, number>();
  const live = new Map<string, Live>();
  let label: { objectId: string; element: HTMLElement } | null = null;
  let glide = 0;

  const viewOf = (object: PanoramaObject): View => {
    let view = views.get(object.id);
    if (!view) {
      view = { ...object.props.start };
      views.set(object.id, view);
    }
    return view;
  };

  /** Draw one image's view, and put its spots where they are now. */
  const paint = (id: string) => {
    const object = objects.get(id);
    const shown = live.get(id);
    if (!object || !shown) return;
    const { element, picture } = shown;
    let { canvas } = shown;
    const width = element.clientWidth;
    const height = element.clientHeight;
    if (!width || !height) return;
    const ratio = Math.min(2, document.defaultView?.devicePixelRatio ?? 1);
    if (
      canvas.width !== Math.round(width * ratio) ||
      canvas.height !== Math.round(height * ratio)
    ) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    if (!shown.painter && picture.complete && picture.naturalWidth > 0) {
      shown.painter = sphere(canvas, picture);
      if (!shown.painter) {
        // A canvas keeps the first kind of context it gives out, and WebGL has just been
        // tried on this one, so its 2D context is null and a flat painter on it draws
        // nothing (a course opened from file://). Pan flat on a fresh copy in its place.
        const flat = canvas.cloneNode(false) as HTMLCanvasElement;
        canvas.replaceWith(flat);
        canvas = flat;
        shown.canvas = flat;
        shown.painter = flatPainter(flat, picture);
      }
      element.dataset['painter'] = shown.painter.flat ? 'flat' : 'sphere';
    }
    const view = viewOf(object);
    shown.painter?.draw(view, canvas.width, canvas.height);
    element.dataset['yaw'] = view.yaw.toFixed(1);
    element.dataset['pitch'] = view.pitch.toFixed(1);
    element.dataset['fov'] = view.fov.toFixed(1);
    const project = shown.painter?.flat === false ? projectSpot : projectFlat;
    for (const button of element.querySelectorAll<HTMLElement>('.vo-panorama-spot')) {
      const spot = object.props.spots.find((each) => each.id === button.dataset['spotId']);
      const at = spot && project(spot, view, { width, height });
      button.hidden = !at;
      if (at) button.style.translate = `${at.x}px ${at.y}px`;
    }
  };

  const closeLabel = (): boolean => {
    if (!label) return false;
    label.element.remove();
    label = null;
    return true;
  };

  /** A marker spot's label, over the bottom of its image. */
  const showLabel = (objectId: string, spot: PanoramaSpot) => {
    closeLabel();
    const shown = live.get(objectId);
    if (!shown || spot.kind !== 'marker') return;
    const box = document.createElement('div');
    box.className = 'vo-panorama-label';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', spot.title || spot.name);
    const title = document.createElement('h3');
    title.textContent = spot.title || spot.name;
    box.append(title);
    for (const line of bodyParagraphs(spot.body)) {
      const paragraph = document.createElement('p');
      paragraph.textContent = line;
      box.append(paragraph);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'vo-panorama-label-close';
    close.textContent = events.say('close');
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      closeLabel();
    });
    box.append(close);
    shown.element.append(box);
    label = { objectId, element: box };
  };

  const open = (objectId: string, spotId: string) => {
    const object = objects.get(objectId);
    const spot = object?.props.spots.find((each) => each.id === spotId);
    if (!object || !spot) return;
    events.open(objectId, spotId);
    showLabel(objectId, spot);
    live
      .get(objectId)
      ?.element.querySelector(`[data-spot-id="${CSS.escape(spotId)}"]`)
      ?.setAttribute('data-visited', 'true');
  };

  /** Turn to a guided spot (gliding, unless motion is reduced) and open it. */
  const goTo = (objectId: string, index: number) => {
    const object = objects.get(objectId);
    const spot = object?.props.spots[index];
    if (!object || !spot) return;
    guided.set(objectId, index);
    const from = { ...viewOf(object) };
    const to: View = { yaw: spot.yaw, pitch: spot.pitch, fov: from.fov };
    const turn = wrapYaw(to.yaw - from.yaw);
    const window = document.defaultView;
    const finish = () => {
      views.set(objectId, to);
      paint(objectId);
      open(objectId, spot.id);
    };
    if (events.reducedMotion() || !window) return finish();
    const started = window.performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / 400);
      const eased = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
      views.set(objectId, {
        yaw: wrapYaw(from.yaw + turn * eased),
        pitch: from.pitch + (to.pitch - from.pitch) * eased,
        fov: from.fov,
      });
      paint(objectId);
      if (t < 1) glide = window.requestAnimationFrame(step);
      else finish();
    };
    window.cancelAnimationFrame(glide);
    glide = window.requestAnimationFrame(step);
  };

  /** The guided Previous and Next buttons. */
  const guide = (objectId: string, element: HTMLElement) => {
    const object = objects.get(objectId);
    if (!object || object.props.mode !== 'guided' || object.props.spots.length === 0) return;
    const bar = document.createElement('div');
    bar.className = 'vo-panorama-guide';
    for (const [which, step] of [
      ['spotPrevious', -1],
      ['spotNext', 1],
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset['guide'] = which === 'spotNext' ? 'next' : 'previous';
      button.textContent = events.say(which);
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const count = object.props.spots.length;
        const at = guided.get(objectId);
        const next = at === undefined ? (step > 0 ? 0 : count - 1) : (at + step + count) % count;
        goTo(objectId, next);
      });
      bar.append(button);
    }
    element.append(bar);
  };

  let dragging: { id: string; pointerId: number; x: number; y: number; moved: boolean } | null =
    null;
  const panoramaOf = (target: EventTarget | null) => {
    const Element = document.defaultView?.Element;
    if (!Element || !(target instanceof Element)) return null;
    const element = target.closest<HTMLElement>('.vo-panorama');
    const id = element?.closest<HTMLElement>('[data-object-id]')?.dataset['objectId'];
    return element && id && objects.has(id) ? { element, id } : null;
  };

  const down = (event: PointerEvent) => {
    const found = panoramaOf(event.target);
    if (!found || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, .vo-panorama-label')) return;
    event.preventDefault();
    found.element.focus();
    dragging = {
      id: found.id,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
    found.element.setPointerCapture?.(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    if (!dragging || event.pointerId !== dragging.pointerId) return;
    const object = objects.get(dragging.id);
    const shown = live.get(dragging.id);
    if (!object || !shown) return;
    // Screen pixels to the view's own pixels, through the stage's scale.
    const scale =
      shown.element.getBoundingClientRect().width / (shown.element.clientWidth || 1) || 1;
    const dx = (event.clientX - dragging.x) / scale;
    const dy = (event.clientY - dragging.y) / scale;
    dragging.x = event.clientX;
    dragging.y = event.clientY;
    dragging.moved = true;
    views.set(dragging.id, dragged(viewOf(object), dx, dy, shown.element.clientWidth));
    paint(dragging.id);
  };
  const up = (event: PointerEvent) => {
    if (dragging && event.pointerId === dragging.pointerId) dragging = null;
  };
  const click = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest?.<HTMLElement>('.vo-panorama-spot');
    const found = panoramaOf(target);
    if (!button || !found) return;
    open(found.id, button.dataset['spotId'] ?? '');
  };
  const wheel = (event: WheelEvent) => {
    const found = panoramaOf(event.target);
    if (!found) return;
    const object = objects.get(found.id)!;
    event.preventDefault();
    const view = viewOf(object);
    views.set(found.id, { ...view, fov: clampFov(view.fov + Math.sign(event.deltaY) * KEY_STEP) });
    paint(found.id);
  };
  stage.addEventListener('pointerdown', down);
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', up);
  stage.addEventListener('click', click);
  stage.addEventListener('wheel', wheel, { passive: false });
  const resize = () => {
    for (const id of live.keys()) paint(id);
  };
  document.defaultView?.addEventListener('resize', resize);

  return {
    /**
     * After a redraw: take up the images drawn now (a redraw makes new
     * elements), mark their visited spots, and draw them.
     */
    sync(
      view: readonly { id: string; visitedSpots?: string[] }[],
      elements: ReadonlyMap<string, HTMLElement>,
    ) {
      for (const each of view) {
        const object = objects.get(each.id);
        const wrapper = elements.get(each.id);
        const element = wrapper?.querySelector<HTMLElement>('.vo-panorama');
        if (!object || !element) {
          live.delete(each.id);
          continue;
        }
        const known = live.get(each.id);
        if (known?.element !== element) {
          const canvas = element.querySelector<HTMLCanvasElement>('.vo-panorama-view')!;
          const picture = known?.picture ?? new document.defaultView!.Image();
          if (!known) {
            picture.decoding = 'async';
            picture.addEventListener('load', () => paint(each.id));
            picture.src = element.dataset['panoramaSrc'] ?? '';
          }
          live.set(each.id, { element, canvas, picture, painter: null });
          guide(each.id, element);
          if (label?.objectId === each.id) label = null;
        }
        for (const button of element.querySelectorAll<HTMLElement>('.vo-panorama-spot')) {
          if (each.visitedSpots?.includes(button.dataset['spotId'] ?? ''))
            button.dataset['visited'] = 'true';
        }
        paint(each.id);
      }
    },
    /** A key for a focused image: arrows turn it, + and − zoom, Escape closes its label. */
    key(event: KeyboardEvent): boolean {
      if (event.key === 'Escape' && closeLabel()) return true;
      const found = panoramaOf(event.target);
      if (!found || (event.target as HTMLElement).closest('button')) return false;
      const object = objects.get(found.id)!;
      const next = keyed(viewOf(object), event.key);
      if (!next) return false;
      event.preventDefault();
      views.set(found.id, next);
      paint(found.id);
      return true;
    },
    /** Leaving the slide: labels close and views start again next time. */
    reset() {
      closeLabel();
      views.clear();
      guided.clear();
    },
    destroy() {
      closeLabel();
      stage.removeEventListener('pointerdown', down);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      stage.removeEventListener('click', click);
      stage.removeEventListener('wheel', wheel);
      document.defaultView?.removeEventListener('resize', resize);
    },
  };
}

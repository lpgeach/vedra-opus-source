import { createEngine } from '@vedraopus/engine';
import type {
  Engine,
  EngineView,
  ObjectPart,
  ObjectView,
  ScriptApi,
  SessionState,
  ResultSummary,
  TrackingState,
} from '@vedraopus/engine';

type Parts = NonNullable<ObjectView['parts']>;
import {
  choiceMarks,
  forEachObject,
  labelText,
  plainRichText,
  questionObjects,
  resolveObjectState,
  variableValueText,
} from '@vedraopus/model';
import type { LabelKey, LabelSettings, Project, SceneObject, Slide } from '@vedraopus/model';
import {
  applyTextAutofit,
  createAnimator,
  createRenderContext,
  layerTransitionKeyframes,
  renderInheritedLayers,
  renderObject,
  toDom,
  transitionKeyframes,
} from '@vedraopus/render';
import type { RenderContext } from '@vedraopus/render';
import { createSoundboard } from './audio';
import { createMarkers } from './markers';
import { createTabs } from './tabs';
import { applyLook } from './look';
import { attachResponsive } from './responsive';
import { createControls } from './controls';
import { createPanoramas } from './panorama';
import { applySemantics, richTextWords } from './semantics';
import { createFrame, speedClock } from './frame';
import { browserStore, loadSettings, saveSettings } from './settings';
import { drawTextBlocks, slideTextBlocks } from './text-view';
import './player.css';

/** What the learner did, in terms triggers will understand (P4.3). */
export type PlayerInput =
  | {
      type: 'click' | 'doubleClick' | 'rightClick' | 'mouseEnter' | 'mouseLeave';
      slideId: string;
      objectId: string;
    }
  | { type: 'keyPress'; key: string };

export interface PlayerOptions {
  /** Where the browser finds an asset. Default: `assets/<hash>.<ext>`, relative to the page. */
  assetUrl?: (hash: string, ext: string) => string;
  /**
   * Where a web object's folder page is (P9.6), its path already URL-encoded.
   * Default: `web/<id>/<path>` beside the page.
   */
  webUrl?: (objectId: string, path: string) => string;
  /** False in the editor's Preview (P9.6): a web page from an address is not loaded. */
  remoteWeb?: boolean;
  /** A saved session to continue. */
  restore?: SessionState;
  /** Milliseconds from a steady clock. Default: `performance.now`. */
  clock?: () => number;
  /**
   * Draw effects, transitions, motion paths and zoom regions with less motion
   * (docs/briefs/reduced-motion.md). Default: the learner's own setting
   * (`prefers-reduced-motion: reduce`), read as the course starts.
   */
  reducedMotion?: boolean;
  /** Run the frame loop (requestAnimationFrame). Turn off to drive time with `tick`. Default true. */
  autoStart?: boolean;
  onInput?: (input: PlayerInput) => void;
  /** Called with the session state whenever the slide changes. */
  onSlideChange?: (state: SessionState) => void;
  /** Something the author should know, such as a trigger loop that was stopped. Default: the console. */
  onWarning?: (message: string) => void;
  /** Completion changed: LMS drivers report and commit on this. */
  onTrackingChange?: (tracking: TrackingState) => void;
  /**
   * The learner asked to print a result (P7.7), with the page to print. Default:
   * a new window showing it, and the browser's print.
   */
  onPrintResults?: (summary: ResultSummary, page: string) => void;
  /**
   * The course is playing, on its first slide or the one resumed: at once, or
   * once the learner has said whether to continue. LMS drivers save here.
   */
  onStart?: (engine: Engine) => void;
  /**
   * The learner left with an "exit course" trigger (P8.6), before the player
   * tries to close the window. `startCourse` tells the LMS here.
   */
  onExit?: () => void;
}

export interface Player {
  /** Null only while the learner is being asked whether to resume. */
  readonly engine: Engine | null;
  /** The player's root element. */
  readonly element: HTMLElement;
  /** Advance time to `nowMs` (default: the clock) and draw. The frame loop calls this. */
  tick(nowMs?: number): void;
  destroy(): void;
}

interface SlideDom {
  slideId: string;
  /** Everything the slide draws, in one container a transition can move. */
  root: HTMLElement;
  /** layer id → its container. */
  layers: Map<string, HTMLElement>;
  /** object id → its element. */
  objects: Map<string, HTMLElement>;
  /** object id → the object and the state it is drawn in. */
  drawn: Map<
    string,
    { object: SceneObject; state: string; refersToVariables: boolean; parts: string }
  >;
  /** The learner's hotspot mark, drawn over the picture. */
  mark: HTMLElement;
}

function el<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/**
 * Plays a project inside `container`: the engine drives what is on stage, the
 * render package draws it, and a small frame gives previous and next. The stage
 * is scaled to fit whatever room it has.
 */
/**
 * Plays a project inside `container`. With a saved session, the course's
 * resume setting decides: `always` continues it, `never` starts over, and
 * `prompt` asks the learner first (nothing plays until they answer).
 */
export function mountPlayer(
  container: HTMLElement,
  project: Project,
  options: PlayerOptions = {},
): Player {
  const { resume } = project.tracking;
  if (!options.restore || resume === 'always') return mountCourse(container, project, options);
  const { restore: _saved, ...fresh } = options;
  if (resume === 'never') return mountCourse(container, project, fresh);

  const document = container.ownerDocument;
  const ask = document.createElement('div');
  ask.className = 'vo-player vo-resume';
  applyLook(ask, project);
  const say = (key: LabelKey) => labelText(project.player.labels, key);
  ask.setAttribute('role', 'dialog');
  ask.setAttribute('aria-label', say('resumeQuestion'));
  const question = document.createElement('p');
  question.textContent = say('resumeQuestion');
  const yes = document.createElement('button');
  yes.type = 'button';
  yes.textContent = say('resumeContinue');
  const no = document.createElement('button');
  no.type = 'button';
  no.textContent = say('resumeStartOver');
  const choices = document.createElement('div');
  choices.className = 'vo-resume-choices';
  choices.append(yes, no);
  ask.append(question, choices);
  container.append(ask);

  let inner: Player | null = null;
  const start = (withSession: boolean) => {
    ask.remove();
    inner = mountCourse(container, project, withSession ? options : fresh);
  };
  yes.addEventListener('click', () => start(true));
  no.addEventListener('click', () => start(false));
  yes.focus();
  return {
    get engine() {
      return inner?.engine ?? null;
    },
    get element() {
      return inner?.element ?? ask;
    },
    tick: (nowMs) => inner?.tick(nowMs),
    destroy: () => {
      ask.remove();
      inner?.destroy();
    },
  };
}

function mountCourse(container: HTMLElement, project: Project, options: PlayerOptions): Player {
  const document = container.ownerDocument;
  const window = document.defaultView!;
  /**
   * The course's own "execute JavaScript" triggers. The code gets one argument,
   * `player`, with the API in docs/player-api.md. It runs in the page, like any
   * script the course's author could have put there.
   */
  const runScript = (code: string, api: ScriptApi) => {
    const run = new window.Function('player', code) as (player: ScriptApi) => void;
    run(api);
  };
  // Read once, so the engine and the drawing agree for the whole visit.
  const reducedMotion =
    options.reducedMotion ??
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
    false;
  const engine = createEngine(project, {
    ...(options.restore ? { restore: options.restore } : {}),
    runScript,
    reducedMotion,
  });
  // The learner's playback speed scales the course's clock (P8.1).
  const timing = speedClock(options.clock ?? (() => window.performance.now()));
  const clock = () => timing.now();
  // The frame's starting values; a marker's sound follows later changes (P9.1).
  let learnerLevel = 1;
  let learnerRate = 1;
  const assetUrl = options.assetUrl ?? ((hash, ext) => `assets/${hash}.${ext}`);
  const context: RenderContext = createRenderContext(project, {
    assetUrl: (hash) => assetUrl(hash, project.assets[hash]?.ext ?? ''),
    // A web folder's pages (P9.6), each part of the path encoded.
    webUrl: (objectId, path) =>
      (options.webUrl ?? ((id: string, p: string) => `web/${id}/${p}`))(
        objectId,
        path.split('/').map(encodeURIComponent).join('/'),
      ),
    remoteWeb: options.remoteWeb !== false,
    idPrefix: 'play-',
    // Video plays here: in its own element, with its controls if it has them.
    liveMedia: true,
    // `%Name%` in text shows the variable's value as the engine has it now.
    variables: (name) => {
      const value = engine.getVariable(name);
      return value === undefined ? undefined : variableValueText(value);
    },
  });
  const { stage: size } = project;

  // ------------------------------------------------------------------ frame
  const root = el(document, 'div', 'vo-player');
  // The look and words the author chose (P8.3).
  applyLook(root, project);
  const say = (key: LabelKey, values?: Record<string, string | number>) =>
    labelText(project.player.labels, key, values);
  // Says so, for styles and for tests.
  if (reducedMotion) root.dataset['reducedMotion'] = 'true';
  root.tabIndex = 0;
  // A named region, not an application: screen readers keep their reading keys (P10.1).
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', project.title || say('course'));
  // The first Tab stop: straight to the slide, past the frame (WCAG 2.4.1, P10.1).
  const skip = el(document, 'a', 'vo-skip-link', say('skipToSlide'));
  skip.href = '#';
  // Polite announcements of what changed (P10.1): a new slide, a layer, a result.
  // How to drag by keyboard, which draggable objects point to (P10.1).
  const dragHint = el(document, 'div', 'vo-player-sr-only', say('dragHint'));
  dragHint.id = `vo-drag-hint-${Math.random().toString(36).slice(2, 10)}`;
  const announcer = el(document, 'div', 'vo-player-announcer');
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', 'polite');
  let announced = 0;
  const announce = (words: string) => {
    if (!words.trim()) return;
    // Emptied first, so the same words said twice are heard twice.
    announcer.textContent = '';
    const at = ++announced;
    window.setTimeout(() => {
      if (at === announced) announcer.textContent = words;
    }, 50);
  };
  const bar = el(document, 'div', 'vo-player-bar');
  // The learner's own settings, remembered in this browser (P10.1, part C).
  const settingsStore = browserStore(window);
  let learner = loadSettings(settingsStore, project.id);
  // The text view: the slide's text beside it, to read at the learner's size.
  const textPanel = el(document, 'aside', 'vo-player-text-view');
  textPanel.setAttribute('aria-label', say('slideText'));
  // It scrolls, so the keyboard must reach it (WCAG 2.1.1).
  textPanel.tabIndex = 0;
  let textKey = '';
  /** Objects read even when marked decorative: a question's answers and drag tiles. */
  const alwaysReadOf = (slide: Slide) => {
    const read = new Set(
      (slide.question ? questionObjects(slide.question) : [])
        .filter((part) => part.role !== 'prompt' && part.role !== 'submit button')
        .map((part) => part.id),
    );
    for (const layer of [slide.baseLayer, ...slide.layers]) {
      for (const object of layer.objects) if (object.drag !== null) read.add(object.id);
    }
    return read;
  };
  const drawTextView = (slide: Slide | undefined, view: EngineView) => {
    if (!learner.textView) return;
    const blocks = slide
      ? slideTextBlocks(slide, view, slide.title.trim() || say('untitledSlide'), {
          variable: (name) => context.variables?.(name),
          alwaysRead: alwaysReadOf(slide),
        })
      : [];
    const key = JSON.stringify(blocks);
    if (key === textKey) return;
    textKey = key;
    textPanel.replaceChildren(
      ...drawTextBlocks(document, blocks, (key, values) => say(key, values)),
    );
  };
  const applyTextView = () => {
    textPanel.hidden = !learner.textView;
    if (learner.textView) root.dataset['textView'] = 'on';
    else delete root.dataset['textView'];
    textPanel.style.setProperty('--vo-text-scale', String(learner.textSize / 100));
    textKey = '';
    if (learner.textView) {
      const view = engine.getView();
      drawTextView(view.slideId ? slideById.get(view.slideId) : undefined, view);
    }
  };
  // The frame the author set up (docs/briefs/P8.1-player-frame.md).
  const logo = project.player.logo;
  const chrome = createFrame(
    document,
    project,
    root,
    logo ? assetUrl(logo, project.assets[logo]?.ext ?? '') : null,
    {
      jump: (slideId) => {
        engine.jumpToSlide(slideId);
        draw();
      },
      seek: (seconds) => {
        const base = engine.getView().layers.find((layer) => layer.isBase);
        if (base) engine.seek(base.id, seconds);
        draw();
      },
      submit: () => {
        engine.submitQuestion();
        draw();
      },
      volume: (level) => {
        learnerLevel = level;
        sound.setLevel(level);
        sound.sync(engine.getView());
      },
      speed: (rate) => {
        learnerRate = rate;
        timing.setRate(rate);
        sound.setRate(rate);
        sound.sync(engine.getView());
      },
      settings: (settings) => {
        learner = settings;
        saveSettings(settingsStore, project.id, settings);
        applyTextView();
      },
    },
    learner,
  );
  bar.append(...chrome.barStart);
  if (project.player.title) bar.append(el(document, 'span', 'vo-player-title', project.title));
  // The player's tabs (P8.2), after the title.
  const tabs = createTabs(document, project, assetUrl, (slideId) => slideById.get(slideId)?.notes, {
    custom: (tabId) => {
      // A tab that opens a slide as a lightbox (P8.4), or one that runs the slide's triggers.
      const lightbox = project.player.tabs.custom.find((tab) => tab.id === tabId)?.lightbox;
      if (lightbox) engine.openLightbox(lightbox.slide, lightbox.controls);
      else engine.playerTab(tabId);
      draw();
    },
  });
  if (tabs.buttons.length > 0) {
    const tabBar = el(document, 'div', 'vo-player-tabs');
    tabBar.setAttribute('role', 'group');
    tabBar.setAttribute('aria-label', say('courseTabs'));
    tabBar.append(...tabs.buttons);
    bar.append(tabBar);
  }
  // Under review (P7.5): the question slide's result, said in words.
  const timerLabel = el(document, 'span', 'vo-result-timer');
  timerLabel.setAttribute('role', 'timer');
  timerLabel.hidden = true;
  bar.append(timerLabel);
  const reviewBanner = el(document, 'span', 'vo-review-banner');
  reviewBanner.setAttribute('role', 'status');
  reviewBanner.hidden = true;
  bar.append(reviewBanner);
  const viewport = el(document, 'div', 'vo-player-viewport');
  const stage = el(document, 'div', 'vo-player-stage');
  stage.style.width = `${size.width}px`;
  stage.style.height = `${size.height}px`;
  stage.style.background = project.theme.colors.background;
  stage.setAttribute('data-testid', 'player-stage');
  viewport.append(stage);
  // Hotspots and markers, and the label a marker opens (P9.1).
  const markers = createMarkers(document, project, stage, {
    assetUrl,
    level: () => learnerLevel,
    rate: () => learnerRate,
  });
  // Sliders and dials (P9.4).
  const sliders = createControls(project, stage, {
    move: (objectId, value) => {
      if (engine.moveControl(objectId, value)) draw();
    },
  });
  // 360° images (P9.10).
  const panoramas = createPanoramas(document, project, stage, {
    open: (objectId, spotId) => {
      if (engine.openSpot(objectId, spotId)) draw();
    },
    say: (key) => say(key),
    reducedMotion: () => reducedMotion,
  });
  const footer = el(document, 'div', 'vo-player-footer');
  const previous = el(document, 'button', 'vo-player-previous', say('previous'));
  const next = el(document, 'button', 'vo-player-next', say('next'));
  const position = el(document, 'span', 'vo-player-position');
  previous.type = 'button';
  next.type = 'button';
  // Closed captions (P6.4): a CC button when the course has any, off until pressed.
  const hasCaptions = project.scenes.some((scene) =>
    scene.slides.some((slide) =>
      [slide.baseLayer, ...slide.layers].some((layer) => {
        let found = false;
        forEachObject(layer.objects, (object) => {
          if (
            (object.type === 'audio' || object.type === 'video') &&
            object.props.captions.length > 0
          ) {
            found = true;
          }
        });
        return found;
      }),
    ),
  );
  const captionsButton = el(document, 'button', 'vo-player-cc', say('captionsShort'));
  captionsButton.type = 'button';
  captionsButton.setAttribute('aria-label', say('captions'));
  captionsButton.setAttribute('aria-pressed', 'false');
  captionsButton.hidden = !hasCaptions || !project.player.controls.captions;
  // On a small screen (P8.5): More shows the controls that do not fit, on a row of their own.
  const more = el(document, 'button', 'vo-player-more', say('more'));
  more.type = 'button';
  const extras = chrome.footer.filter((each) => !each.classList.contains('vo-player-submit'));
  const extrasBreak = el(document, 'span', 'vo-player-break');
  footer.append(previous, position, captionsButton, ...chrome.footer, more, extrasBreak, next);
  // A landscape course on a portrait phone: a hint to turn it (P8.5).
  const rotateHint = el(document, 'div', 'vo-player-rotate');
  rotateHint.setAttribute('role', 'status');
  rotateHint.append(el(document, 'span', '', say('rotateHint')));
  const rotateDismiss = el(document, 'button', 'vo-player-rotate-dismiss', say('dismiss'));
  rotateDismiss.type = 'button';
  rotateHint.append(rotateDismiss);
  /** Where captions show: on the stage, so they scale with it. For the eye only; screen readers have the media. */
  const captionBand = el(document, 'div', 'vo-player-captions');
  captionBand.setAttribute('aria-hidden', 'true');
  captionBand.dataset['testid'] = 'player-captions';
  captionBand.hidden = true;
  let captionsOn = false;
  viewport.append(...chrome.overlays, tabs.panel);
  // The lightbox's own bar (P8.4): Previous and Next when it has them, and Close.
  const lightboxBar = el(document, 'div', 'vo-player-lightbox-bar');
  lightboxBar.setAttribute('role', 'group');
  lightboxBar.setAttribute('aria-label', say('lightbox'));
  lightboxBar.hidden = true;
  const lightboxPrevious = el(document, 'button', 'vo-player-lightbox-previous', say('previous'));
  const lightboxNext = el(document, 'button', 'vo-player-lightbox-next', say('next'));
  const lightboxClose = el(document, 'button', 'vo-player-lightbox-close', say('close'));
  for (const button of [lightboxPrevious, lightboxNext, lightboxClose]) button.type = 'button';
  lightboxBar.append(lightboxPrevious, lightboxNext, lightboxClose);
  viewport.append(lightboxBar, rotateHint);
  root.append(skip, announcer, dragHint, bar, viewport, textPanel, footer);
  footer.setAttribute('role', 'group');
  footer.setAttribute('aria-label', say('courseControls'));
  stage.setAttribute('role', 'region');
  stage.tabIndex = -1;
  // On the player's own element: it goes when the player does.
  skip.addEventListener('click', (event) => {
    event.preventDefault();
    // The first stop in the slide's Tab order (P10.1, part B), or the slide itself.
    (tabStops()[0] ?? stage).focus();
  });
  container.append(root);

  // ------------------------------------------------------------------ sound
  /**
   * When the browser will not play sound before the learner does something,
   * the course waits behind a Play button rather than going on silently.
   */
  const unblock = el(document, 'button', 'vo-player-unblock', say('play'));
  unblock.type = 'button';
  unblock.setAttribute('aria-label', say('playSound'));
  unblock.hidden = true;
  viewport.append(unblock);
  /** Layers the Play button paused, to set going again. */
  let heldLayers: string[] = [];
  const sound = createSoundboard(project, root, stage, assetUrl, {
    // The next frame draws it; drawing here would run the board inside itself.
    onControl: (id, playing, seconds) => engine.mediaControl(id, playing, seconds),
    onBlocked: () => {
      if (!unblock.hidden) return;
      const view = engine.getView();
      heldLayers = view.layers.filter((layer) => !layer.paused).map((layer) => layer.id);
      for (const id of heldLayers) engine.setPaused(id, true);
      unblock.hidden = false;
      unblock.focus();
    },
    onWarning: (message) => options.onWarning?.(message),
  });

  // ---------------------------------------------------------------- scaling
  let scale = 1;
  /** A lightbox is drawn smaller than the stage, centred over the slide under it (P8.4). */
  const LIGHTBOX_SIZE = 0.8;
  let inLightbox = false;
  /** The slide under a lightbox, as it was when the lightbox opened: drawn, still, behind it. */
  let underlay: HTMLElement | null = null;
  const fit = () => {
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    if (width === 0 || height === 0) return;
    const whole = Math.min(width / size.width, height / size.height);
    const place = (element: HTMLElement, factor: number) => {
      const s = whole * factor;
      const left = (width - size.width * s) / 2;
      const top = (height - size.height * s) / 2;
      element.style.transform = `translate(${left}px, ${top}px) scale(${s})`;
      return { s, top };
    };
    const placed = place(stage, inLightbox ? LIGHTBOX_SIZE : 1);
    scale = placed.s;
    stage.dataset['scale'] = String(scale);
    if (underlay) place(underlay, 1);
    // The Lightbox bar sits just above the lightbox.
    lightboxBar.style.top = `${Math.max(0, placed.top - 40)}px`;
  };
  const resizeObserver = new window.ResizeObserver(fit);
  resizeObserver.observe(viewport);

  // ------------------------------------------------------------- transitions
  // (docs/briefs/P6.6-transitions.md) Paused animations whose time is the engine's.

  /** The slide left, while the transition to this one plays. */
  let leaving: HTMLElement | null = null;
  /** The slide transition's animations, and which arrival they are for. */
  let slideAnimations: Animation[] = [];
  let slideKey = '';
  /** Each layer container's transition animation, and what it is for. */
  const layerAnimations = new Map<HTMLElement, { key: string; animation: Animation }>();

  const endTransition = () => {
    for (const animation of slideAnimations) animation.cancel();
    slideAnimations = [];
    slideKey = '';
    leaving?.remove();
    leaving = null;
    for (const { animation } of layerAnimations.values()) animation.cancel();
    layerAnimations.clear();
  };

  /** Keep the slide left drawn beneath the stage's new contents, silent and out of reach. */
  const keepLeaving = (old: HTMLElement) => {
    old.classList.add('vo-player-leaving');
    old.setAttribute('aria-hidden', 'true');
    old.style.pointerEvents = 'none';
    for (const media of old.querySelectorAll<HTMLMediaElement>('audio, video')) {
      media.pause();
      media.removeAttribute('data-media-id');
    }
    leaving = old;
    stage.prepend(old);
  };

  const hold = (
    element: HTMLElement,
    keyframes: Keyframe[],
    seconds: number,
    easing: string,
    reverse = false,
  ) => {
    const animation = element.animate(keyframes, {
      duration: seconds * 1000,
      fill: 'both',
      easing,
      direction: reverse ? 'reverse' : 'normal',
    });
    animation.pause();
    return animation;
  };

  const drawTransitions = (view: EngineView, slideDom: SlideDom) => {
    const transition = view.transition;
    if (transition) {
      const key = `${transition.fromSlideId}>${view.slideId}`;
      if (key !== slideKey) {
        for (const animation of slideAnimations) animation.cancel();
        const frames = transitionKeyframes(transition, project.stage, { reduced: reducedMotion });
        slideAnimations = [];
        if (frames.incoming) {
          slideAnimations.push(
            hold(slideDom.root, frames.incoming, transition.duration, frames.easing),
          );
        }
        if (frames.outgoing && leaving) {
          slideAnimations.push(hold(leaving, frames.outgoing, transition.duration, frames.easing));
        }
        // The old slide is what moves away, so it goes on top.
        if (leaving && frames.oldOnTop) slideDom.root.after(leaving);
        slideKey = key;
      }
      for (const animation of slideAnimations) animation.currentTime = transition.time * 1000;
    } else if (slideKey || leaving) {
      for (const animation of slideAnimations) animation.cancel();
      slideAnimations = [];
      slideKey = '';
      leaving?.remove();
      leaving = null;
    }

    for (const layer of view.layers) {
      const container = slideDom.layers.get(layer.id);
      if (!container) continue;
      // A layer on its way out is still drawn, but nothing on it can be pressed.
      container.classList.toggle('vo-player-closing', !layer.shown);
      const was = layerAnimations.get(container);
      const now = layer.transition;
      if (!now) {
        if (was) {
          was.animation.cancel();
          layerAnimations.delete(container);
        }
        continue;
      }
      const key = JSON.stringify([now.phase, now.kind, now.direction, now.duration]);
      let held = was;
      if (!held || held.key !== key) {
        held?.animation.cancel();
        const { keyframes, easing } = layerTransitionKeyframes(now, project.stage, {
          reduced: reducedMotion,
        });
        held = {
          key,
          animation: hold(container, keyframes, now.duration, easing, now.phase === 'out'),
        };
        layerAnimations.set(container, held);
      }
      held.animation.currentTime = now.time * 1000;
    }
    // A layer that has gone altogether keeps nothing.
    const drawn = new Set(view.layers.map((layer) => slideDom.layers.get(layer.id)));
    for (const [container, held] of layerAnimations) {
      if (drawn.has(container)) continue;
      held.animation.cancel();
      layerAnimations.delete(container);
    }
  };

  /**
   * Keep text entries and dropdowns as the engine says (P7.2): their values
   * (not while the learner is typing in one), a dropdown's shuffled options,
   * and closed once their question is finished.
   */
  /**
   * The objects with something live to draw (a field's text, a control's
   * value, a 360° image's visited spots), groups' parts too, and their
   * elements: a part's is found inside its group's (the Phase 9 review).
   */
  const liveParts = (view: EngineView, slideDom: SlideDom) => {
    const live: (ObjectPart & { id: string; locked?: boolean })[] = [];
    for (const layer of view.layers) {
      for (const object of layer.objects) {
        live.push(object);
        for (const [id, part] of Object.entries(object.parts ?? {})) {
          const drawn =
            part.value !== undefined ||
            part.controlValue !== undefined ||
            part.visitedSpots !== undefined;
          if (drawn) live.push({ id, ...part });
        }
      }
    }
    const elements = new Map(slideDom.objects);
    for (const each of live) {
      if (elements.has(each.id)) continue;
      const element = slideDom.root.querySelector<HTMLElement>(
        `[data-object-id="${CSS.escape(each.id)}"]`,
      );
      if (element) elements.set(each.id, element);
    }
    return { live, elements };
  };

  const drawFields = (
    live: readonly (ObjectPart & { id: string; locked?: boolean })[],
    elements: ReadonlyMap<string, HTMLElement>,
  ) => {
    for (const object of live) {
      if (object.value === undefined) continue;
      const field = elements
        .get(object.id)
        ?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
          'input, textarea, select',
        );
      if (!field) continue;
      if (field instanceof window.HTMLSelectElement && object.options) {
        const shown = [...field.options].slice(1).map((option) => option.value);
        if (shown.join('\n') !== object.options.join('\n')) {
          const first = field.options[0]!;
          field.replaceChildren(
            first,
            ...object.options.map((option) => {
              const element = document.createElement('option');
              element.value = option;
              element.textContent = option;
              return element;
            }),
          );
        }
      }
      if (field !== document.activeElement && field.value !== object.value) {
        field.value = object.value;
      }
      const locked = object.locked === true;
      if (field.disabled !== locked) field.disabled = locked;
    }
  };

  /**
   * The marks a question is answered with, made accessible (the Phase 7
   * review): radio buttons (in a set) or checkboxes, checked when selected,
   * named by their words, or a Likert point by its statement and scale point,
   * and reached with Tab. Redrawing replaces attributes, so this follows it.
   */
  const markChoices = (slide: Slide, view: EngineView, slideDom: SlideDom) => {
    // Stock checkboxes and radio buttons (P9.3): every choice on the slide that
    // is not a question's is a control too, a radio by its round mark.
    const marked = new Set(slide.question ? choiceMarks(slide.question) : []);
    const shownStates = new Map(
      view.layers.flatMap((layer) => layer.objects).map((object) => [object.id, object.state]),
    );
    for (const layer of [slide.baseLayer, ...slide.layers]) {
      forEachObject(layer.objects, (object) => {
        if (object.type !== 'choice' || marked.has(object.id)) return;
        const element = slideDom.objects.get(object.id);
        if (!element) return;
        element.dataset['choice'] = 'true';
        element.setAttribute('role', object.props.mark === 'radio' ? 'radio' : 'checkbox');
        element.setAttribute('aria-checked', String(shownStates.get(object.id) === 'selected'));
        element.setAttribute(
          'aria-label',
          object.a11y.altText || richTextWords(object.props.text) || object.name,
        );
        if (object.buttonSet) element.dataset['group'] = object.buttonSet;
        element.tabIndex = 0;
      });
    }
    const question = slide.question;
    if (!question) return;
    const objects = new Map(slide.baseLayer.objects.map((object) => [object.id, object]));
    const wordsOf = (id: string | null | undefined) => {
      const object = id ? objects.get(id) : undefined;
      return object && object.type !== 'group' && 'text' in object.props && object.props.text
        ? richTextWords(object.props.text)
        : '';
    };
    const names = new Map<string, string>();
    if (question.kind === 'likert') {
      question.statements.forEach((statement) => {
        statement.points.forEach((point, column) => {
          names.set(point, `${wordsOf(statement.text)}: ${wordsOf(question.labels[column])}`);
        });
      });
    }
    const states = new Map(
      view.layers.flatMap((layer) => layer.objects).map((object) => [object.id, object]),
    );
    for (const id of choiceMarks(question)) {
      const element = slideDom.objects.get(id);
      const object = objects.get(id);
      if (!element || !object) continue;
      const shown = states.get(id);
      element.dataset['choice'] = 'true';
      element.setAttribute('role', object.buttonSet ? 'radio' : 'checkbox');
      element.setAttribute('aria-checked', String(shown?.state === 'selected'));
      element.setAttribute(
        'aria-label',
        names.get(id) || object.a11y.altText || wordsOf(id) || object.name,
      );
      element.tabIndex = 0;
    }
  };

  /**
   * Button semantics for hotspots and markers (P9.1), and every other object's
   * role, name or decoration (P10.1), reapplied after every redraw.
   */
  const markObjects = (slide: Slide | undefined, view: EngineView, slideDom: SlideDom) => {
    const shown = new Map<string, { visible: boolean; state: string }>();
    for (const object of view.layers.flatMap((layer) => layer.objects)) {
      shown.set(object.id, { visible: object.visible, state: object.state });
      for (const [id, part] of Object.entries(object.parts ?? {})) {
        shown.set(id, { visible: object.visible && part.visible, state: part.state });
      }
    }
    markers.mark(slideDom.objects, (id) => shown.get(id)?.visible ?? false);
    // Draggable objects are buttons that keyboard dragging picks up (P10.1).
    for (const [id, element] of slideDom.objects) {
      if (element.dataset['draggable'] === 'true') {
        element.tabIndex = shown.get(id)?.visible ? 0 : -1;
        element.setAttribute('role', 'button');
        element.setAttribute('aria-label', nameOf(id));
        element.setAttribute('aria-describedby', dragHint.id);
        element.dataset['keyDrag'] = 'true';
      } else if (element.dataset['keyDrag'] === 'true') {
        // No longer draggable (the question was answered): not a button any more.
        delete element.dataset['keyDrag'];
        element.removeAttribute('role');
        element.removeAttribute('aria-describedby');
        element.removeAttribute('tabindex');
      }
    }
    if (!slide) return;
    applySemantics(
      slide,
      (id) =>
        slideDom.objects.get(id) ??
        slideDom.root.querySelector<HTMLElement>(`[data-object-id="${CSS.escape(id)}"]`) ??
        undefined,
      (id) => shown.get(id)?.visible ?? false,
      (id) => shown.get(id)?.state === 'disabled',
    );
  };

  /** Show the learner's hotspot mark where the engine says it is. */
  const drawMark = (view: EngineView, slideDom: SlideDom) => {
    // A picture's mark (P7.2), or a freeform hotspot's on the slide itself (P7.4).
    const at =
      view.mark ??
      view.layers.flatMap((layer) => layer.objects).find((object) => object.mark)?.mark;
    slideDom.mark.hidden = !at;
    if (at) {
      slideDom.mark.style.left = `${at.x}px`;
      slideDom.mark.style.top = `${at.y}px`;
    }
  };

  /**
   * Zoom the slide to the engine's camera (docs/briefs/P6.7-zoom-and-cues.md),
   * with the `scale` and `translate` properties, which apply outside the
   * `transform` a slide transition animates. Scaling about the middle, the
   * camera's middle moves to the stage's.
   */
  const drawCamera = (view: EngineView, slideDom: SlideDom) => {
    const { root } = slideDom;
    const camera = view.camera;
    if (!camera) {
      root.style.scale = '';
      root.style.translate = '';
      return;
    }
    const { width, height } = project.stage;
    const scale = width / camera.width;
    const x = scale * (width / 2 - (camera.x + camera.width / 2));
    const y = scale * (height / 2 - (camera.y + camera.height / 2));
    root.style.scale = String(scale);
    root.style.translate = `${x}px ${y}px`;
  };

  // ----------------------------------------------------------- slide drawing
  let dom: SlideDom | null = null;
  const animator = createAnimator(project.stage, { reduced: reducedMotion });
  /** Objects the animator has moved or animated, so it can put them back. */
  const animated = new Set<string>();
  let dirty = true;
  let lastSignature = '';
  /** A variable changed: text that refers to variables must be drawn again. */
  let variablesChanged = false;

  const slideById = new Map<string, Slide>();
  // The banks' slides too: drawn questions are played from there (P7.6).
  for (const scene of [...project.scenes, ...project.banks])
    for (const slide of scene.slides) slideById.set(slide.id, slide);

  const build = (slide: Slide): SlideDom => {
    markers.close();
    const root = el(document, 'div', 'vo-player-slide');
    // Opaque, so a slide covering another hides it.
    root.style.background = project.theme.colors.background;
    stage.replaceChildren(root);
    animated.clear();
    const result: SlideDom = {
      slideId: slide.id,
      root,
      layers: new Map(),
      objects: new Map(),
      drawn: new Map(),
      mark: el(document, 'div', 'vo-hotspot-mark'),
    };
    // What the slide inherits from its master and layout, beneath everything.
    for (const node of renderInheritedLayers(slide, context)) {
      const layer = toDom(node, document) as HTMLElement;
      layer.style.pointerEvents = 'none';
      root.append(layer);
    }
    for (const layer of [slide.baseLayer, ...slide.layers]) {
      const container = el(document, 'div', 'vo-player-layer');
      container.dataset['layerId'] = layer.id;
      for (const object of layer.objects) {
        const element = toDom(renderObject(object, context), document) as HTMLElement;
        container.append(element);
        // Which state it is drawn in, for scripts, styling and tests.
        element.dataset['state'] = 'normal';
        result.objects.set(object.id, element);
        result.drawn.set(object.id, {
          object,
          state: 'normal',
          parts: '',
          // Cheap and safe: any percent sign anywhere in the object might be a reference.
          refersToVariables: JSON.stringify(object).includes('%'),
        });
      }
      root.append(container);
      result.layers.set(layer.id, container);
    }
    // Above every layer, so the learner's mark is never hidden behind one.
    result.mark.hidden = true;
    root.append(result.mark);
    applyTextAutofit(stage);
    return result;
  };

  /**
   * Draw an object in another state. The element itself is kept and only its
   * contents and styling replaced: a press and its release must land on the
   * same element for the browser to call it a click.
   */
  /** Play a group's members' own effects and paths on their elements (B8). */
  const animateParts = (element: HTMLElement, group: SceneObject, parts: Parts | undefined) => {
    for (const [id, part] of Object.entries(parts ?? {})) {
      if (!part.effect && !part.offset && !animated.has(id)) continue;
      const inner = element.querySelector<HTMLElement>(`[data-object-id="${CSS.escape(id)}"]`);
      const member = memberOf(group, id);
      if (!inner || !member) continue;
      animator.apply(inner, resolveObjectState(member, part.state), part);
      if (part.effect || part.offset) animated.add(id);
      else animated.delete(id);
    }
  };

  /** The object with this id inside a group, at any depth. */
  const memberOf = (object: SceneObject, id: string): SceneObject | undefined => {
    if (object.type !== 'group') return undefined;
    for (const child of object.children) {
      if (child.id === id) return child;
      const deeper = memberOf(child, id);
      if (deeper) return deeper;
    }
    return undefined;
  };

  /** A group as drawn: each thing inside it in its own state. */
  const resolveTree = (object: SceneObject, state: string, parts?: Parts): SceneObject => {
    const resolved = resolveObjectState(object, state);
    if (resolved.type !== 'group' || !parts) return resolved;
    return {
      ...resolved,
      children: resolved.children.map((child) =>
        resolveTree(child, parts[child.id]?.state ?? 'normal', parts),
      ),
    };
  };
  const drawnParts = new Map<string, Parts>();

  /** Words the engine puts in place of an object's own (P7.5), by object id. */
  const drawnText = new Map<string, string>();
  /** The object with `text` as its words, when it has words. */
  const withText = (object: SceneObject, text: string | undefined): SceneObject =>
    text === undefined || object.type === 'group' || !('text' in object.props)
      ? object
      : ({ ...object, props: { ...object.props, text: plainRichText(text) } } as SceneObject);

  const redraw = (element: HTMLElement, object: SceneObject, state: string, parts?: Parts) => {
    const shown = withText(resolveTree(object, state, parts), drawnText.get(object.id));
    const fresh = toDom(renderObject(shown, context, state), document);
    for (const name of element.getAttributeNames()) element.removeAttribute(name);
    for (const name of fresh.getAttributeNames()) {
      element.setAttribute(name, fresh.getAttribute(name)!);
    }
    // A playing video keeps its element: replacing it would start it again.
    if (object.type === 'video' && element.querySelector('video')) return;
    // A scrolling panel (P9.5) stays where the learner scrolled it.
    const scrolled = element.scrollTop;
    element.replaceChildren(...fresh.childNodes);
    if (scrolled) element.scrollTop = scrolled;
    // Hidden parts of a group hide only themselves.
    for (const [id, part] of Object.entries(parts ?? {})) {
      const inner = element.querySelector<HTMLElement>(`[data-object-id="${id}"]`);
      if (inner) {
        inner.style.display = part.visible ? '' : 'none';
        inner.dataset['state'] = part.state;
      }
    }
    applyTextAutofit(element);
  };

  /**
   * A group's parts without what moves every frame (B8): members' effects and paths are
   * played by the animator, as top-level objects' are, not by drawing the group again.
   */
  const stillParts = (parts: Parts | undefined) =>
    parts &&
    Object.fromEntries(
      Object.entries(parts).map(([id, part]) => {
        const { effect: _effect, offset: _offset, ...rest } = part;
        return [id, rest];
      }),
    );

  const signature = (view: EngineView) =>
    JSON.stringify([
      view.slideId,
      view.slideIndex,
      view.canNext,
      view.canPrevious,
      view.controls.previous,
      view.controls.next,
      view.review,
      view.timer?.left,
      view.layers.map((l) => [
        l.id,
        l.objects.map((o) => [o.visible ? 1 : 0, o.state, stillParts(o.parts), o.text, o.review]),
      ]),
    ]);

  /** What the menu needs of the session: slides seen and what was drawn, as of the last slide change. */
  let seen = { visited: new Set<string>(), draws: {} as Record<string, readonly string[]> };
  const refreshSeen = () => {
    const state = engine.getState();
    seen = { visited: new Set(state.vis ?? []), draws: state.d ?? {} };
  };
  const draw = () => {
    const view = engine.getView();
    sound.sync(view);
    const slide = view.slideId ? slideById.get(view.slideId) : undefined;
    chrome.update(view, seen.visited, seen.draws, !!slide?.question);
    tabs.update(view.slideId);
    if (!slide) {
      markers.close();
      stage.replaceChildren();
      dom = null;
      position.textContent = say('noSlides');
      previous.disabled = next.disabled = true;
      return;
    }
    // A lightbox (P8.4): keep the slide under it drawn, still, behind it.
    const lightbox = view.lightbox ?? null;
    if (lightbox && !underlay && dom && dom.slideId === lightbox.underSlideId) {
      underlay = el(document, 'div', 'vo-player-lightbox-under');
      underlay.style.width = `${size.width}px`;
      underlay.style.height = `${size.height}px`;
      const copy = dom.root.cloneNode(true) as HTMLElement;
      for (const media of copy.querySelectorAll('video, audio')) media.remove();
      underlay.append(copy);
      underlay.inert = true;
      viewport.insertBefore(underlay, stage);
    }
    if (!lightbox && underlay) {
      underlay.remove();
      underlay = null;
    }
    if (inLightbox !== !!lightbox) {
      markers.close();
      inLightbox = !!lightbox;
      if (inLightbox) root.dataset['lightbox'] = 'true';
      else delete root.dataset['lightbox'];
      lightboxBar.hidden = !inLightbox;
      fit();
      // Keyboard focus goes with it (the Phase 8 review): into the lightbox, whose
      // slide replaces the one the learner pressed, and back to the course after.
      if (inLightbox) {
        window.queueMicrotask(() => lightboxClose.focus());
      } else if (
        !root.contains(document.activeElement) ||
        document.activeElement === document.body
      ) {
        root.focus();
      }
    }
    lightboxPrevious.hidden = lightboxNext.hidden = !lightbox?.controls;
    lightboxPrevious.disabled = !view.canPrevious;
    lightboxNext.disabled = !view.canNext;
    if (!dom || dom.slideId !== slide.id || dirty) {
      if (dom?.slideId !== slide.id) panoramas.reset();
      // Arriving with a transition: the slide left stays drawn, still, until it ends.
      const old = dom && view.transition?.fromSlideId === dom.slideId ? dom.root : null;
      endTransition();
      // Focus on the slide that is going moves to the new slide's region, so the
      // course's keys still reach it and a screen reader starts there (P10.1).
      const focusWasOnSlide = !!dom && dom.root.contains(document.activeElement);
      dom = build(slide);
      if (focusWasOnSlide && !stage.contains(document.activeElement)) {
        stage.focus({ preventScroll: true });
      }
      if (old) keepLeaving(old);
      dirty = false;
      lastSignature = '';
      fit();
    }
    // Captions follow the media's time, which the drawing signature does not.
    const caption = view.layers
      .flatMap((layer) => layer.media)
      .map((media) => media.caption)
      .filter((text): text is string => text !== null)
      .join('\n');
    if (captionBand.textContent !== caption) captionBand.textContent = caption;
    captionBand.hidden = !captionsOn || caption === '';
    if (captionBand.parentElement !== stage) stage.append(captionBand);
    drawTransitions(view, dom);
    drawCamera(view, dom);
    // Fields, sliders and dials, and 360° images: inside groups too.
    const { live, elements } = liveParts(view, dom);
    drawFields(live, elements);
    sliders.sync(live, elements);
    panoramas.sync(live, elements);
    drawMark(view, dom);
    // Entrances, exits and motion paths move with the engine's time on every frame: a
    // group's members' too (B8), inside their group as it moves.
    for (const layer of view.layers) {
      for (const object of layer.objects) {
        const element = dom.objects.get(object.id);
        const drawn = dom.drawn.get(object.id);
        if (!element || !drawn) continue;
        if (object.effect || object.offset || animated.has(object.id)) {
          animator.apply(element, resolveObjectState(drawn.object, drawn.state), object);
          if (object.effect || object.offset) animated.add(object.id);
          else animated.delete(object.id);
        }
        animateParts(element, drawn.object, object.parts);
      }
    }
    // Drag questions' tiles: which can be picked up, and the one being carried.
    for (const layer of view.layers) {
      for (const object of layer.objects) {
        const element = dom.objects.get(object.id);
        if (!element) continue;
        if (object.draggable) element.dataset['draggable'] = 'true';
        else delete element.dataset['draggable'];
      }
    }
    placeCarried();
    if (variablesChanged) {
      variablesChanged = false;
      for (const [id, drawn] of dom.drawn) {
        const element = dom.objects.get(id);
        if (element && drawn.refersToVariables) {
          redraw(element, drawn.object, drawn.state, drawnParts.get(id));
          element.dataset['state'] = drawn.state;
        }
      }
    }
    if (slide) markChoices(slide, view, dom);
    markObjects(slide, view, dom);
    // Before the signature, which leaves out what is typed in fields.
    drawTextView(slide, view);
    const sig = signature(view);
    if (sig === lastSignature) return;
    lastSignature = sig;
    const shown = new Map(view.layers.map((layer) => [layer.id, layer]));
    for (const [layerId, container] of dom.layers) {
      container.style.display = shown.has(layerId) ? '' : 'none';
    }
    for (const layer of view.layers) {
      for (const object of layer.objects) {
        const element = dom.objects.get(object.id);
        if (!element) continue;
        const drawn = dom.drawn.get(object.id);
        // Members' effects and paths are played by the animator, not by drawing again (B8).
        const parts = object.parts ? JSON.stringify(stillParts(object.parts)) : '';
        const textChanged = (drawnText.get(object.id) ?? null) !== (object.text ?? null);
        if (textChanged) {
          if (object.text === undefined) drawnText.delete(object.id);
          else drawnText.set(object.id, object.text);
        }
        if (drawn && (drawn.state !== object.state || drawn.parts !== parts || textChanged)) {
          redraw(element, drawn.object, object.state, object.parts);
          drawn.state = object.state;
          drawn.parts = parts;
          if (object.parts) drawnParts.set(object.id, object.parts);
          element.dataset['state'] = object.state;
          // Drawing again rewrote its style and made its members' elements new: its own
          // effect and path go back on, and its members' go on the new elements (B8).
          if (object.effect || object.offset || animated.has(object.id)) {
            animator.apply(element, resolveObjectState(drawn.object, drawn.state), object);
          }
          if (object.parts) animateParts(element, drawn.object, object.parts);
        }
        element.style.display = object.visible ? '' : 'none';
        if (object.review) element.dataset['review'] = object.review;
        else delete element.dataset['review'];
      }
    }
    if (slide) markChoices(slide, view, dom);
    markObjects(slide, view, dom);
    // A running result timer (P7.7): the time left, as minutes and seconds.
    timerLabel.hidden = !view.timer;
    if (view.timer) {
      const minutes = Math.floor(view.timer.left / 60);
      const seconds = String(view.timer.left % 60).padStart(2, '0');
      timerLabel.textContent = say('timeLeft', { time: `${minutes}:${seconds}` });
    }
    reviewBanner.hidden = !view.review;
    reviewBanner.dataset['result'] = view.review ?? '';
    reviewBanner.textContent = view.review
      ? {
          correct: say('reviewCorrect'),
          incorrect: say('reviewIncorrect'),
          answered: say('reviewAnswered'),
          unanswered: say('reviewUnanswered'),
        }[view.review]
      : '';
    position.textContent = say('slideOf', { n: view.slideIndex + 1, total: view.slideCount });
    previous.disabled = !view.canPrevious;
    next.disabled = !view.canNext;
    // A slide can hide either button; its triggers can still move on.
    previous.hidden = !view.controls.previous;
    next.hidden = !view.controls.next;
  };

  // ------------------------------------------------------------------ events
  /** Web addresses only, in a new tab or window that cannot reach back into the course. */
  const openUrl = (url: string) => {
    let address: URL;
    try {
      address = new URL(url, window.location.href);
    } catch {
      return;
    }
    if (
      address.protocol !== 'https:' &&
      address.protocol !== 'http:' &&
      address.protocol !== 'mailto:'
    ) {
      return;
    }
    window.open(address.href, '_blank', 'noopener,noreferrer');
  };
  options.onWarning ??= (message) => window.console.warn(`[Vedra Opus] ${message}`);

  /** A result as a page of its own, printed from a new window (P7.7). */
  const printResults = (summary: ResultSummary) => {
    const page = resultsPage(summary, project.player.labels);
    if (options.onPrintResults) {
      options.onPrintResults(summary, page);
      return;
    }
    const printed = window.open('', '_blank');
    if (!printed) {
      options.onWarning?.('The browser did not open a window to print the results in.');
      return;
    }
    printed.document.write(page);
    printed.document.close();
    printed.focus();
    printed.print();
  };

  /** Leave (P8.6): the LMS is told, then the window closes, or says the course has ended. */
  let ended = false;
  const exitCourse = () => {
    if (ended) return;
    ended = true;
    markers.close();
    options.onExit?.();
    window.close();
    // A browser lets a page close only a window it opened: otherwise, say so.
    for (const part of [bar, viewport, footer]) part.inert = true;
    sound.sync({ ...engine.getView(), layers: [] });
    const notice = el(document, 'div', 'vo-player-ended');
    notice.setAttribute('role', 'status');
    notice.textContent = say('courseEnded');
    root.append(notice);
    root.dataset['ended'] = 'true';
  };
  /** Move focus to an object on the slide (P8.6); a hidden one is skipped. */
  const focusObject = (slideId: string, objectId: string) => {
    if (dom?.slideId !== slideId) return;
    const element = dom.objects.get(objectId);
    if (!element) return;
    const shown = engine
      .getView()
      .layers.flatMap((layer) => layer.objects)
      .find((object) => object.id === objectId);
    if (!shown?.visible) return;
    if (!element.hasAttribute('tabindex')) element.tabIndex = -1;
    element.focus();
  };

  // The learner's text view, as they left it (P10.1, part C).
  applyTextView();
  // The first slide was entered as the engine was made, before this listened.
  refreshSeen();
  const stopEngineEvents = engine.on((event) => {
    if (event.type === 'variableChange') variablesChanged = true;
    if (event.type === 'openUrl') openUrl(event.url);
    if (event.type === 'warning') options.onWarning?.(event.message);
    if (event.type === 'printResults') printResults(event.summary);
    // The rest of plan 4.2's actions (docs/briefs/P8.6-course-actions.md).
    if (event.type === 'exitCourse') exitCourse();
    if (event.type === 'print') window.print();
    if (event.type === 'openFile') {
      const meta = project.assets[event.asset];
      if (meta) window.open(assetUrl(event.asset, meta.ext), '_blank', 'noopener,noreferrer');
    }
    if (event.type === 'focus') focusObject(event.slideId, event.objectId);
    if (event.type === 'trackingChange') options.onTrackingChange?.(event.tracking);
    if (event.type === 'slideEnter') {
      dirty = true;
      refreshSeen();
      options.onSlideChange?.(engine.getState());
      // The slide's title, as its region's name and said aloud (P10.1).
      const title = slideById.get(event.slideId)?.title.trim() || say('untitledSlide');
      stage.setAttribute('aria-label', title);
      announce(title);
    }
    // A layer shown, feedback included, and a question's result (P10.1).
    if (event.type === 'layerShow') {
      const layer = slideById.get(event.slideId)?.layers.find((each) => each.id === event.layerId);
      if (layer) announce(layer.name);
    }
    if (event.type === 'questionSubmit') {
      const words = {
        correct: say('resultCorrect'),
        incorrect: say('resultIncorrect'),
        tryAgain: say('resultIncorrect'),
        answered: say('resultAnswered'),
      }[event.result];
      announce(words);
    }
  });

  const listeners: Array<() => void> = [];
  // Small screens and touch (P8.5): swipes do what the arrow keys do.
  listeners.push(
    attachResponsive({
      root,
      viewport,
      stage: size,
      more,
      extras,
      hint: rotateHint,
      dismiss: rotateDismiss,
      ownsPointer: (target) =>
        chainOf(target).some((id) => objectView(id)?.draggable) ||
        (target instanceof window.Element &&
          target.closest(
            'input, select, textarea, .vo-player-menu, .vo-player-tab-panel, .vo-player-a11y, .vo-player-lightbox-bar',
          ) !== null),
      onSwipe: (direction) => {
        const { controls } = engine.getView();
        if (direction === 'next' && controls.next) engine.next();
        else if (direction === 'previous' && controls.previous) engine.previous();
        draw();
      },
    }),
  );
  const listen = <T extends Event>(
    target: EventTarget,
    type: string,
    handler: (event: T) => void,
  ) => {
    target.addEventListener(type, handler as EventListener);
    listeners.push(() => target.removeEventListener(type, handler as EventListener));
  };

  /** The object under an element, then each group around it, outermost last. */
  const chainOf = (target: EventTarget | null): string[] => {
    const chain: string[] = [];
    let at = (target as Element | null)?.closest?.('[data-object-id]') ?? null;
    while (at && stage.contains(at)) {
      chain.push(at.getAttribute('data-object-id')!);
      at = at.parentElement?.closest('[data-object-id]') ?? null;
    }
    return chain;
  };

  /** `slideId` is read before the engine handles the input, which may move to another slide. */
  const report = (
    type: Exclude<PlayerInput['type'], 'keyPress'>,
    slideId: string | null,
    objectId: string,
  ) => {
    if (slideId) options.onInput?.({ type, slideId, objectId });
  };

  /**
   * What the pointer is over, innermost first. Kept here rather than read from
   * each event, because redrawing an object under the pointer replaces the
   * elements the browser's events refer to.
   */
  let over: string[] = [];
  const pointerAt = (target: EventTarget | null) => {
    const slideId = engine.getView().slideId;
    const now = chainOf(target);
    const left = over.filter((id) => !now.includes(id));
    const entered = now.filter((id) => !over.includes(id)).reverse();
    over = now;
    let changed = false;
    for (const id of left) {
      if (engine.pointer('leave', id)) {
        report('mouseLeave', slideId, id);
        changed = true;
      }
    }
    for (const id of entered) {
      if (engine.pointer('enter', id)) {
        report('mouseEnter', slideId, id);
        changed = true;
      }
    }
    if (changed) draw();
  };
  listen<MouseEvent>(stage, 'mouseover', (event) => pointerAt(event.target));
  listen<MouseEvent>(stage, 'mouseout', (event) => {
    // Out of the stage altogether: off everything.
    if (!stage.contains(event.relatedTarget as Node | null)) pointerAt(null);
  });

  /** A click on a hotspot picture places the learner's mark at that point on the slide. */
  const markHotspot = (objectId: string, at: MouseEvent) => {
    const slide = engine.getView().slideId;
    const source = slide ? slideById.get(slide) : undefined;
    const question = source?.question;
    if (!source || !question || question.kind !== 'hotspot' || question.picture !== objectId)
      return;
    const object = source.baseLayer.objects.find((each) => each.id === objectId);
    const element = dom?.objects.get(objectId);
    if (!object || !element) return;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = object.frame.x + ((at.clientX - rect.left) / rect.width) * object.frame.width;
    const y = object.frame.y + ((at.clientY - rect.top) / rect.height) * object.frame.height;
    engine.mark(x, y);
  };

  /**
   * A freeform hotspot (P7.4): a click anywhere on the stage marks the slide
   * there, except on the question's Submit button. Stage units come from the
   * stage's box and the camera, so a zoomed-in slide marks where it is shown.
   */
  let markFrom: { x: number; y: number } | null = null;
  listen<MouseEvent>(stage, 'mousedown', (event) => {
    markFrom = event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
  });
  listen<MouseEvent>(stage, 'mouseup', (event) => {
    const from = markFrom;
    markFrom = null;
    if (!from || Math.hypot(event.clientX - from.x, event.clientY - from.y) > DRAG_FROM_PX) return;
    const view = engine.getView();
    const question = view.slideId ? slideById.get(view.slideId)?.question : undefined;
    if (question?.kind !== 'freeHotspot') return;
    if (question.submit && chainOf(event.target).includes(question.submit)) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const camera = view.camera ?? {
      x: 0,
      y: 0,
      width: project.stage.width,
      height: project.stage.height,
    };
    const x = camera.x + ((event.clientX - rect.left) / rect.width) * camera.width;
    const y = camera.y + ((event.clientY - rect.top) / rect.height) * camera.height;
    if (engine.mark(x, y)) draw();
  });

  /** A press, release or click on the innermost object; the engine passes it out through its groups. */
  const press = (
    kind: 'down' | 'up' | 'click' | 'doubleClick' | 'rightClick',
    objectId: string,
    at?: MouseEvent,
  ) => {
    const slideId = engine.getView().slideId;
    if (!engine.pointer(kind, objectId)) return;
    if (kind === 'click') markers.activate(objectId);
    if (kind === 'click' && at) markHotspot(objectId, at);
    const reported = {
      click: 'click',
      doubleClick: 'doubleClick',
      rightClick: 'rightClick',
    } as const;
    if (kind in reported) report(reported[kind as keyof typeof reported], slideId, objectId);
    draw();
  };

  // A click is a press and a release on the same object. The browser's own
  // click event cannot be used: drawing the pressed state replaces the node the
  // press landed on, and browsers then do not report a click at all.
  let pressed: string | null = null;
  listen<MouseEvent>(stage, 'mousedown', (event) => {
    if (event.button !== 0) return;
    pressed = chainOf(event.target)[0] ?? null;
    if (pressed) press('down', pressed);
  });
  listen<MouseEvent>(document, 'mouseup', (event) => {
    const released = chainOf(event.target)[0] ?? null;
    const wasPressed = pressed;
    pressed = null;
    // A tile carried and let go is a drop, not a click.
    const wasDropped = dropped;
    dropped = false;
    if (event.button !== 0 || !wasPressed) return;
    press('up', wasPressed);
    if (released === wasPressed && !wasDropped) press('click', wasPressed, event);
  });

  // ---------------------------------------------------------------- dragging (P7.2)
  // A drag question's tile, or an object the author made draggable (P9.7),
  // follows the pointer once it has moved a few pixels,
  // and is dropped where it is let go (`engine.drop`); a press that does not move
  // is still a click. Pointer events, so that touch can drag too. Dragging by
  // keyboard is `dragKey`, below (P10.1).
  const DRAG_FROM_PX = 4;
  let carried: {
    id: string;
    pointerId: number;
    fromX: number;
    fromY: number;
    /** How far it has come, in stage units. */
    dx: number;
    dy: number;
    moving: boolean;
  } | null = null;
  /** Set when a drag ends, so the mouseup that follows does not also click. */
  let dropped = false;

  const objectView = (id: string) =>
    engine
      .getView()
      .layers.flatMap((layer) => layer.objects)
      .find((object) => object.id === id);

  /** Draw the carried tile where the pointer has taken it, over its place in the course. */
  const placeCarried = () => {
    if (!carried?.moving) return;
    const element = dom?.objects.get(carried.id);
    if (!element) return;
    const offset = objectView(carried.id)?.offset ?? { x: 0, y: 0 };
    element.style.translate = `${offset.x + carried.dx}px ${offset.y + carried.dy}px`;
  };

  listen<PointerEvent>(stage, 'pointerdown', (event) => {
    if (event.button !== 0 || carried) return;
    const id = chainOf(event.target).find((each) => objectView(each)?.draggable);
    if (!id) return;
    carried = {
      id,
      pointerId: event.pointerId,
      fromX: event.clientX,
      fromY: event.clientY,
      dx: 0,
      dy: 0,
      moving: false,
    };
  });
  listen<PointerEvent>(document, 'pointermove', (event) => {
    if (!carried || event.pointerId !== carried.pointerId) return;
    const element = dom?.objects.get(carried.id);
    if (!element) return;
    const screenX = event.clientX - carried.fromX;
    const screenY = event.clientY - carried.fromY;
    if (!carried.moving && Math.hypot(screenX, screenY) < DRAG_FROM_PX) return;
    carried.moving = true;
    element.dataset['dragging'] = 'true';
    // Screen pixels per stage unit, as drawn: the stage's fit and any camera zoom.
    const shown = element.getBoundingClientRect().width / (element.offsetWidth || 1) || scale;
    carried.dx = screenX / shown;
    carried.dy = screenY / shown;
    // A freeform target under the item shows its Drag Over state (P7.4).
    const object = dom?.drawn.get(carried.id)?.object;
    if (object) {
      const offset = objectView(carried.id)?.offset ?? { x: 0, y: 0 };
      const x = object.frame.x + object.frame.width / 2 + offset.x + carried.dx;
      const y = object.frame.y + object.frame.height / 2 + offset.y + carried.dy;
      if (engine.carry(carried.id, x, y)) draw();
    }
    placeCarried();
  });
  const letGo = (event: PointerEvent, drop: boolean) => {
    if (!carried || event.pointerId !== carried.pointerId) return;
    const { id, dx, dy, moving } = carried;
    carried = null;
    if (!moving) return;
    if (!drop) engine.carry(null);
    dropped = true;
    const element = dom?.objects.get(id);
    if (element) {
      delete element.dataset['dragging'];
      element.style.translate = '';
    }
    const object = dom?.drawn.get(id)?.object;
    const offset = objectView(id)?.offset ?? { x: 0, y: 0 };
    if (drop && object) {
      // The tile's middle, where it was let go.
      const x = object.frame.x + object.frame.width / 2 + offset.x + dx;
      const y = object.frame.y + object.frame.height / 2 + offset.y + dy;
      engine.drop(id, x, y);
    }
    draw();
  };
  // ------------------------------------------------- the Tab order (P10.1)
  /**
   * The slide's focusable elements in the order Tab reaches them: the author's
   * order of objects first (`slide.properties.focusOrder`), then the rest by
   * where they are, top to bottom and left to right. An object's own controls
   * (a 360° image's spots) stay together, in their own order.
   */
  const tabStops = (): HTMLElement[] => {
    if (!dom) return [];
    const slide = slideById.get(dom.slideId);
    const focusable = [
      ...dom.root.querySelectorAll<HTMLElement>(
        '[tabindex="0"], button:not([tabindex="-1"]), input, select, textarea, a[href], iframe',
      ),
    ].filter(
      (element) => !element.closest('[aria-hidden="true"]') && element.getClientRects().length > 0,
    );
    // Each element by the outermost object it is in.
    const owner = (element: HTMLElement) => {
      let found: HTMLElement | null = null;
      for (let at = element.closest<HTMLElement>('[data-object-id]'); at;) {
        found = at;
        at = at.parentElement?.closest<HTMLElement>('[data-object-id]') ?? null;
      }
      return found;
    };
    const groups = new Map<HTMLElement, HTMLElement[]>();
    for (const element of focusable) {
      const top = owner(element) ?? element;
      groups.set(top, [...(groups.get(top) ?? []), element]);
    }
    const order = slide?.properties.focusOrder ?? [];
    const rank = (top: HTMLElement) => {
      // The first listed object inside this one, the object itself included.
      const ids = [
        top.dataset['objectId'],
        ...[...groups.get(top)!].map(
          (each) => each.closest<HTMLElement>('[data-object-id]')?.dataset['objectId'],
        ),
      ];
      const listed = ids.map((id) => (id ? order.indexOf(id) : -1)).filter((index) => index >= 0);
      return listed.length > 0 ? Math.min(...listed) : Infinity;
    };
    const tops = [...groups.keys()].map((top) => ({
      top,
      rank: rank(top),
      box: top.getBoundingClientRect(),
    }));
    tops.sort((a, b) => {
      // The author's listed objects first, in their order (unlisted rank Infinity).
      if (a.rank !== b.rank) return a.rank < b.rank ? -1 : 1;
      // Then by place: tops within a few pixels are one row, then left to right.
      if (Math.abs(a.box.top - b.box.top) > 4) return a.box.top - b.box.top;
      return a.box.left - b.box.left;
    });
    return tops.flatMap(({ top }) => groups.get(top)!);
  };

  /** A Tab from outside the slide, until focus lands: it enters at the first or last stop. */
  let tabbingIn: { backward: boolean } | null = null;
  stage.addEventListener('focusin', (event) => {
    const from = event.relatedTarget;
    const entering = tabbingIn;
    tabbingIn = null;
    if (!entering || (from instanceof window.Node && stage.contains(from))) return;
    const stops = tabStops();
    const target = entering.backward ? stops.at(-1) : stops[0];
    if (target && event.target !== target) target.focus();
  });

  /** Tab and Shift+Tab inside the slide follow `tabStops`; at either end they leave it. */
  const tabKey = (event: KeyboardEvent): boolean => {
    if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) return false;
    const active = document.activeElement;
    if (!(active instanceof window.HTMLElement) || !stage.contains(active)) {
      // The browser moves focus; if it lands in the slide, `focusin` places it.
      tabbingIn = { backward: event.shiftKey };
      window.setTimeout(() => (tabbingIn = null), 0);
      return false;
    }
    const stops = tabStops();
    if (stops.length === 0) return false;
    const at = active === stage ? -1 : stops.indexOf(active);
    if (at < 0 && active !== stage) return false;
    const next = event.shiftKey ? at - 1 : at + 1;
    event.preventDefault();
    if (next >= 0 && next < stops.length) {
      stops[next]!.focus();
      return true;
    }
    // Past either end: out of the slide, to what comes after or before it in
    // the player, not to whatever the drawing order puts next.
    const outside = [
      ...root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex="0"]',
      ),
    ].filter((element) => !stage.contains(element) && element.getClientRects().length > 0);
    const after = (element: HTMLElement) =>
      (stage.compareDocumentPosition(element) & window.Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    const target = event.shiftKey
      ? outside.filter((element) => !after(element)).at(-1)
      : outside.find(after);
    (target ?? root).focus();
    return true;
  };

  // ------------------------------------------------- dragging by keyboard (P10.1)
  // A draggable object is a button: Space or Enter picks it up; the arrow keys
  // move it from one drop target to the next (the place it started is one of
  // them), or, for an object with no targets, 10 stage pixels at a time (Shift:
  // 1); Space or Enter drops it, Escape puts it back. The same engine calls as a
  // pointer's drag, so triggers and states behave the same.
  let keyCarried: {
    id: string;
    /** Where it can go, in stage units: its start first, then each target. */
    stops: { x: number; y: number; name: string }[];
    at: number;
    /** Where its middle is now, in stage units. */
    x: number;
    y: number;
    free: boolean;
  } | null = null;

  /** An object's middle where it is drawn now, in stage units. */
  const middleNow = (id: string) => {
    const object = dom?.drawn.get(id)?.object;
    if (!object) return null;
    const offset = objectView(id)?.offset ?? { x: 0, y: 0 };
    return {
      x: object.frame.x + object.frame.width / 2 + offset.x,
      y: object.frame.y + object.frame.height / 2 + offset.y,
    };
  };
  const nameOf = (id: string) => {
    const object = dom?.drawn.get(id)?.object;
    if (!object) return '';
    const words =
      object.type !== 'group' && 'text' in object.props && object.props.text
        ? richTextWords(object.props.text)
        : '';
    return object.a11y.altText.trim() || words || object.name;
  };
  /** Draw the carried object where the keys have taken it. */
  const placeKeyCarried = () => {
    if (!keyCarried) return;
    const element = dom?.objects.get(keyCarried.id);
    const object = dom?.drawn.get(keyCarried.id)?.object;
    if (!element || !object) return;
    element.dataset['dragging'] = 'true';
    const x = keyCarried.x - (object.frame.x + object.frame.width / 2);
    const y = keyCarried.y - (object.frame.y + object.frame.height / 2);
    element.style.translate = `${x}px ${y}px`;
  };
  const endKeyDrag = () => {
    if (!keyCarried) return;
    const element = dom?.objects.get(keyCarried.id);
    if (element) {
      delete element.dataset['dragging'];
      element.style.translate = '';
    }
    keyCarried = null;
  };
  /** A key for a focused draggable object: true when it was used. */
  const dragKey = (event: KeyboardEvent): boolean => {
    const element = event.target instanceof window.HTMLElement ? event.target : null;
    const id = element?.dataset['draggable'] === 'true' ? element.dataset['objectId'] : undefined;
    if (!keyCarried) {
      if (!id || (event.key !== ' ' && event.key !== 'Enter')) return false;
      const start = middleNow(id);
      if (!start) return false;
      const targets = engine.dropTargets(id);
      const stops = [{ ...start, name: '' }];
      for (const target of targets) {
        const at = middleNow(target);
        if (at) stops.push({ ...at, name: nameOf(target) });
      }
      keyCarried = { id, stops, at: 0, x: start.x, y: start.y, free: stops.length === 1 };
      event.preventDefault();
      placeKeyCarried();
      announce(say('dragPickedUp', { name: nameOf(id) }));
      return true;
    }
    const carriedNow = keyCarried;
    const move = (x: number, y: number, words: string) => {
      carriedNow.x = Math.min(size.width, Math.max(0, x));
      carriedNow.y = Math.min(size.height, Math.max(0, y));
      if (engine.carry(carriedNow.id, carriedNow.x, carriedNow.y)) draw();
      placeKeyCarried();
      if (words) announce(words);
    };
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowUp': {
        event.preventDefault();
        if (carriedNow.free) {
          const step = event.shiftKey ? 1 : 10;
          const dx = event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0;
          const dy = event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0;
          move(carriedNow.x + dx, carriedNow.y + dy, '');
        } else {
          const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
          const count = carriedNow.stops.length;
          carriedNow.at = (carriedNow.at + (forward ? 1 : count - 1)) % count;
          const stop = carriedNow.stops[carriedNow.at]!;
          move(stop.x, stop.y, stop.name ? say('dragOver', { name: stop.name }) : say('dragStart'));
        }
        return true;
      }
      case ' ':
      case 'Enter': {
        event.preventDefault();
        const { id: dropped, x, y } = carriedNow;
        endKeyDrag();
        engine.carry(null);
        engine.drop(dropped, x, y);
        draw();
        dom?.objects.get(dropped)?.focus();
        announce(say('dragDropped', { name: nameOf(dropped) }));
        return true;
      }
      case 'Escape': {
        event.preventDefault();
        const { id: back } = carriedNow;
        endKeyDrag();
        if (engine.carry(null)) draw();
        dom?.objects.get(back)?.focus();
        announce(say('dragCancelled'));
        return true;
      }
      case 'Tab':
        // Leaving puts it back, as Escape does.
        endKeyDrag();
        if (engine.carry(null)) draw();
        return false;
      default:
        return true;
    }
  };

  // The browser's own drag of a tile's words or picture would take the pointer away.
  listen<DragEvent>(stage, 'dragstart', (event) => {
    if (chainOf(event.target).some((id) => objectView(id)?.draggable)) event.preventDefault();
  });
  listen<PointerEvent>(document, 'pointerup', (event) => letGo(event, true));
  listen<PointerEvent>(document, 'pointercancel', (event) => letGo(event, false));
  listen<MouseEvent>(stage, 'dblclick', (event) => {
    const id = chainOf(event.target)[0];
    if (id) press('doubleClick', id);
  });
  listen<MouseEvent>(stage, 'contextmenu', (event) => {
    const id = chainOf(event.target)[0];
    if (!id) return;
    event.preventDefault();
    press('rightClick', id);
  });

  // What the learner types or chooses in a text entry or dropdown (P7.2).
  const typed = (event: Event) => {
    const field = event.target;
    if (!(
      field instanceof window.HTMLInputElement ||
      field instanceof window.HTMLTextAreaElement ||
      field instanceof window.HTMLSelectElement
    ))
      return;
    const id = chainOf(field)[0];
    if (sliders.input(field, id)) return;
    if (id) engine.input(id, field.value);
  };
  listen<Event>(stage, 'input', typed);
  listen<Event>(stage, 'change', typed);
  // Data-entry fields (P9.2): focus leaving writes a bound field's variable and
  // raises "control loses focus"; Enter in a one-line field takes the focus away.
  listen<FocusEvent>(stage, 'focusout', (event) => {
    const field = event.target;
    if (!(
      field instanceof window.HTMLInputElement ||
      field instanceof window.HTMLTextAreaElement ||
      field instanceof window.HTMLSelectElement
    )) {
      return;
    }
    const id = chainOf(field)[0];
    if (id && engine.blur(id)) draw();
  });
  listen<KeyboardEvent>(stage, 'keydown', (event) => {
    if (event.key === 'Enter' && event.target instanceof window.HTMLInputElement) {
      event.target.blur();
    }
  });

  listen<KeyboardEvent>(root, 'keydown', (event) => {
    // Escape closes an open marker label first (P9.1).
    if (event.key === 'Escape' && markers.close()) {
      event.preventDefault();
      return;
    }
    // Then an open tab panel (P8.2).
    if (event.key === 'Escape' && tabs.close()) {
      event.preventDefault();
      return;
    }
    // Then a lightbox (P8.4).
    if (event.key === 'Escape' && engine.closeLightbox()) {
      event.preventDefault();
      draw();
      return;
    }
    if (event.target instanceof window.HTMLButtonElement && event.key === ' ') return;
    // Space or Enter chooses a question's choice, or presses a hotspot or marker,
    // as a click does (the Phase 7 review and P9.1).
    if (event.key === ' ' || event.key === 'Enter') {
      const element = event.target instanceof window.HTMLElement ? event.target : null;
      const id =
        element?.dataset['choice'] === 'true' || element?.dataset['press'] === 'true'
          ? element.dataset['objectId']
          : undefined;
      if (id) {
        event.preventDefault();
        press('click', id);
        return;
      }
    }
    // A focused scrolling panel scrolls with these keys (P9.5), the same in every
    // browser: WebKit's own Home stopped a few pixels short of the top.
    if (
      event.target instanceof window.HTMLElement &&
      event.target.classList.contains('vo-scroll-panel')
    ) {
      const panel = event.target;
      const page = Math.max(20, panel.clientHeight - 20);
      const to = {
        ArrowUp: panel.scrollTop - 40,
        ArrowDown: panel.scrollTop + 40,
        PageUp: panel.scrollTop - page,
        PageDown: panel.scrollTop + page,
        Home: 0,
        End: panel.scrollHeight,
      }[event.key];
      if (to !== undefined) {
        event.preventDefault();
        panel.scrollTop = to;
        return;
      }
    }
    // A draggable object picked up by keyboard takes the keys while carried (P10.1).
    if (dragKey(event)) return;
    // Tab within the slide, in the author's order or the layout's (P10.1).
    if (tabKey(event)) return;
    // A focused dial takes the arrow, page, Home and End keys (P9.4).
    if (sliders.key(event)) return;
    // A focused 360° image takes the arrows and + and − (P9.10).
    if (panoramas.key(event)) return;
    // The arrow keys move between a group's radio buttons and select the one
    // moved to, as a native radio group does, not between slides (P9.3).
    if (event.key.startsWith('Arrow') && event.target instanceof window.HTMLElement) {
      const radio = event.target;
      const group = radio.dataset['group'];
      if (radio.getAttribute('role') === 'radio' && group && dom) {
        event.preventDefault();
        const members = [...dom.objects.values()].filter(
          (element) =>
            element.dataset['group'] === group &&
            element.getAttribute('role') === 'radio' &&
            element.style.display !== 'none',
        );
        const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
        const at = members.indexOf(radio);
        const next = members[(at + step + members.length) % members.length];
        const id = next?.dataset['objectId'];
        if (next && id && next !== radio) {
          press('click', id);
          dom.objects.get(id)?.focus();
        }
        return;
      }
    }
    // Typing an answer is not pressing keys for triggers or for moving between slides.
    const target = event.target;
    if (
      target instanceof window.HTMLInputElement ||
      target instanceof window.HTMLSelectElement ||
      target instanceof window.HTMLTextAreaElement
    ) {
      return;
    }
    options.onInput?.({ type: 'keyPress', key: event.key });
    // A shortcut-key question takes the press as its answer, and then it does
    // nothing else, the browser's own action included where it can be stopped (P7.4).
    const held = {
      ctrl: event.ctrlKey,
      alt: event.altKey,
      shift: event.shiftKey,
      meta: event.metaKey,
    };
    if (engine.key(event.key, held)) {
      event.preventDefault();
      draw();
      return;
    }
    // Key-press triggers first; the built-in keys still move between slides.
    const { controls } = engine.getView();
    // The keys do what the buttons do, so a hidden button's key does nothing.
    if ((event.key === 'ArrowRight' || event.key === 'PageDown') && controls.next) engine.next();
    else if ((event.key === 'ArrowLeft' || event.key === 'PageUp') && controls.previous) {
      engine.previous();
    } else {
      draw();
      return;
    }
    event.preventDefault();
    draw();
  });
  listen(unblock, 'click', () => {
    unblock.hidden = true;
    const view = engine.getView();
    for (const id of heldLayers) {
      if (view.layers.some((layer) => layer.id === id)) engine.setPaused(id, false);
    }
    heldLayers = [];
    // Inside the learner's click, so the browser now lets it play.
    sound.retry(engine.getView());
    root.focus();
    draw();
  });
  listen(captionsButton, 'click', () => {
    captionsOn = !captionsOn;
    captionsButton.setAttribute('aria-pressed', String(captionsOn));
    draw();
  });
  listen(previous, 'click', () => {
    engine.previous();
    draw();
  });
  listen(next, 'click', () => {
    engine.next();
    draw();
  });
  // The lightbox's own bar (P8.4).
  listen(lightboxPrevious, 'click', () => {
    engine.previous();
    draw();
  });
  listen(lightboxNext, 'click', () => {
    engine.next();
    draw();
  });
  // A web object shown "in a new window" (P9.6): its button opens the page in a new tab.
  listen<MouseEvent>(stage, 'click', (event) => {
    const target = event.target instanceof window.Element ? event.target : null;
    const opener = target?.closest<HTMLElement>('.vo-web-open');
    const src = opener?.dataset['webSrc'];
    if (src) window.open(src, '_blank', 'noopener,noreferrer');
  });
  listen(lightboxClose, 'click', () => {
    engine.closeLightbox();
    draw();
    root.focus();
  });

  // ------------------------------------------------------------------- loop
  const tick = (nowMs: number = clock()) => {
    // After an exit, nothing plays on.
    if (ended) return;
    // Sound first: audio that keeps a layer's time moves its playhead.
    sound.report(engine);
    engine.tick(nowMs);
    draw();
  };
  let frame = 0;
  let running = options.autoStart !== false;
  const loop = () => {
    if (!running) return;
    tick();
    frame = window.requestAnimationFrame(loop);
  };
  tick(); // sets the engine's time reference and draws the first frame
  if (running) frame = window.requestAnimationFrame(loop);
  options.onStart?.(engine);

  return {
    engine,
    element: root,
    tick,
    destroy() {
      running = false;
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      stopEngineEvents();
      for (const remove of listeners) remove();
      markers.destroy();
      sliders.destroy();
      panoramas.destroy();
      sound.destroy();
      root.remove();
    },
  };
}

/** A result as a printable page: plain HTML, the learner's words escaped (P7.7). */
export function resultsPage(
  summary: ResultSummary,
  labels: LabelSettings = { language: 'en', words: {} },
): string {
  const escape = (text: string) => text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
  // The page's words are the course's labels (P8.3), escaped like the learner's.
  const say = (key: LabelKey, values?: Record<string, string | number>) =>
    escape(labelText(labels, key, values));
  const said = {
    correct: say('resultCorrect'),
    incorrect: say('resultIncorrect'),
    answered: say('resultAnswered'),
    unanswered: say('resultUnanswered'),
  } as const;
  const rows = summary.questions
    .map(
      (question, index) =>
        `<tr><td>${index + 1}</td><td>${question.title ? escape(question.title) : say('resultsNumbered', { n: index + 1 })}</td>` +
        `<td>${said[question.result]}</td>` +
        (summary.kind === 'graded' ? `<td>${question.score}</td>` : '') +
        '</tr>',
    )
    .join('');
  const outcome =
    summary.kind === 'graded'
      ? `<p>${say('resultsScore', { score: summary.score, max: summary.max, percent: summary.percent })} ` +
        `${say('resultsPassMark', { pass: summary.passPercent })} ` +
        `${summary.passed ? say('resultsPassed') : say('resultsNotPassed')}</p>`
      : `<p>${say('resultsAnsweredCount', { score: summary.score, max: summary.max })}</p>`;
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<title>${escape(summary.course)}: ${escape(summary.result)}</title>` +
    '<style>body{font:14px/1.5 sans-serif;margin:24px}table{border-collapse:collapse}' +
    'td,th{border:1px solid #999;padding:4px 8px;text-align:left}</style></head><body>' +
    `<h1>${escape(summary.course)}</h1><h2>${escape(summary.result)}</h2>${outcome}` +
    `<table><thead><tr><th>#</th><th>${say('resultsQuestion')}</th><th>${say('resultsResult')}</th>` +
    (summary.kind === 'graded' ? `<th>${say('resultsPoints')}</th>` : '') +
    `</tr></thead><tbody>${rows}</tbody></table></body></html>`
  );
}

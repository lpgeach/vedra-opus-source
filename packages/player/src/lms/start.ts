import { interactionsOf } from './interactions';
import { reportStatus } from '@vedraopus/engine';
import type { Engine } from '@vedraopus/engine';
import { everySlide, labelText } from '@vedraopus/model';
import type { Project } from '@vedraopus/model';
import { mountPlayer } from '../player';
import type { Player, PlayerOptions } from '../player';
import type { LmsDriver } from './driver';
import { scorm12Driver } from './scorm12';
import { scorm2004Driver } from './scorm2004';
import type { Scorm2004Edition } from './scorm2004';
import { decodeSession, encodeSession } from './suspend';
import { cmi5Driver } from './cmi5';
import { xapiDriver } from './xapi';

/** The LMS standards a course can report to. */
export type LmsStandard = 'scorm12' | 'scorm2004' | 'xapi' | 'cmi5';

export interface StartOptions extends Omit<PlayerOptions, 'restore'> {
  /** Which LMS standard to report to; leave out for a course on a web page. */
  lms?: LmsStandard;
  /** For SCORM 2004: the edition published, which sets how much the LMS keeps. Default 4. */
  edition?: Scorm2004Edition;
  /** For xAPI and cmi5: the activity IRI when the launch gives none. Default `urn:vedraopus:course:<project id>`. */
  activityId?: string;
}

function driverFor(
  window: Window,
  project: Project,
  options: StartOptions,
  warn: (m: string) => void,
): LmsDriver | null {
  switch (options.lms) {
    case 'scorm12':
      return scorm12Driver(window, warn);
    case 'scorm2004':
      return scorm2004Driver(window, warn, options.edition ?? 4);
    case 'xapi':
    case 'cmi5':
      return (options.lms === 'xapi' ? xapiDriver : cmi5Driver)(window, warn, {
        activityId: options.activityId ?? `urn:vedraopus:course:${encodeURIComponent(project.id)}`,
        title: project.title,
      });
    default:
      return null;
  }
}

/** A course started by `startCourse`. */
export interface CoursePlayer extends Player {
  /**
   * The learner leaves: the LMS is told (as when the page closes), then the
   * learner goes to the LMS's return address if it gave one (cmi5). The
   * "exit course" trigger (P8.6) does the same.
   */
  exit(): void;
}

/**
 * Start a published course: connect to its LMS (if any), continue the saved
 * session according to the course's resume setting, and keep the LMS told:
 * on every slide change, when completion changes, and when the page closes.
 * With an LMS that keeps saved data on a server (xAPI), "Loading…" shows
 * until it has answered.
 */
export function startCourse(
  container: HTMLElement,
  project: Project,
  options: StartOptions = {},
): CoursePlayer {
  const document = container.ownerDocument;
  const window = document.defaultView!;
  const warn =
    options.onWarning ?? ((message: string) => window.console.warn(`[Vedra Opus] ${message}`));
  const driver = driverFor(window, project, options, warn);
  const connected = driver?.init() ?? false;
  const started = window.performance.now();
  const slides = new Map(
    everySlide(project).map(({ slide }, index) => [slide.id, { slide, index }]),
  );
  let player: Player | null = null;
  let lastDropped = '';
  let destroyed = false;
  /** The LMS has been told the learner left; nothing more is reported. */
  let finished = false;

  const save = (engine: Engine | null | undefined, commit: boolean) => {
    if (!connected || !driver || !engine) return;
    const { text, dropped } = encodeSession(project, engine.getState(), driver.suspendLimit);
    if (dropped.length > 0 && dropped.join() !== lastDropped) {
      lastDropped = dropped.join();
      warn(`To fit what the LMS will store, this left out: ${dropped.join(', ')}.`);
    }
    driver.setSuspendData(text);
    driver.setBookmark(String(engine.getView().slideIndex + 1));
    driver.setStatus(reportStatus(project.tracking.reporting, engine.getTracking()));
    if (commit) driver.commit();
  };
  const entered = (engine: Engine | null | undefined) => {
    const id = engine?.getView().slideId;
    const found = id ? slides.get(id) : undefined;
    if (connected && found) {
      driver?.slideEntered?.({ id: found.slide.id, title: found.slide.title, index: found.index });
    }
  };

  /**
   * Every finished question to the LMS as it is finished (P7.7): its
   * interactions, with the seconds since its slide was entered.
   */
  const reportInteractions = (engine: Engine) => {
    let enteredAt = window.performance.now();
    engine.on((event) => {
      if (event.type === 'slideEnter') enteredAt = window.performance.now();
      if (event.type !== 'questionSubmit' || event.result === 'tryAgain') return;
      if (!connected || !driver || finished) return;
      const question = slides.get(event.slideId)?.slide.question;
      if (!question) return;
      const record = engine.getState().q?.[event.slideId];
      const latency = Math.round((window.performance.now() - enteredAt) / 100) / 10;
      for (const interaction of interactionsOf(event.slideId, question, record, latency)) {
        driver.recordInteraction(interaction);
      }
    });
  };

  const mount = () => {
    if (destroyed) return;
    loading?.remove();
    const restore =
      connected && driver!.isResuming() ? decodeSession(project, driver!.getSuspendData()) : null;
    player = mountPlayer(container, project, {
      ...options,
      onWarning: warn,
      ...(restore ? { restore } : {}),
      // An "exit course" trigger (P8.6): the LMS is told and, with cmi5, the learner goes back to it.
      onExit: () => {
        finish();
        const url = connected ? driver?.exitUrl?.() : null;
        options.onExit?.();
        if (url) window.location.assign(url);
      },
      // Where the learner starts, once they are playing (after any resume question).
      onStart: (engine) => {
        entered(engine);
        save(engine, true);
        reportInteractions(engine);
        options.onStart?.(engine);
      },
      onSlideChange: (state) => {
        entered(player?.engine);
        save(player?.engine, true);
        options.onSlideChange?.(state);
      },
      onTrackingChange: (tracking) => {
        if (connected && driver) {
          // After the slide change that caused it, which the engine reports
          // second: the LMS hears "saw slide 2", then "completed".
          window.queueMicrotask(() => {
            if (finished) return;
            // The tracked result's score (P7.7), before the status it decides.
            if (tracking.score) driver.setScore(tracking.score.raw, 0, tracking.score.max);
            driver.setStatus(reportStatus(project.tracking.reporting, tracking));
            driver.commit();
          });
        }
        options.onTrackingChange?.(tracking);
      },
    });
  };

  let loading: HTMLElement | null = null;
  if (connected && driver?.ready) {
    loading = document.createElement('div');
    loading.className = 'vo-player vo-loading';
    loading.setAttribute('role', 'status');
    loading.textContent = labelText(project.player.labels, 'loading');
    container.append(loading);
    void driver.ready().then(mount);
  } else {
    mount();
  }

  const finish = () => {
    if (finished || !connected || !driver) return;
    finished = true;
    save(player?.engine, false);
    const complete = player?.engine?.getTracking().complete ?? false;
    driver.terminate((window.performance.now() - started) / 1000, complete);
  };
  window.addEventListener('pagehide', finish);
  window.addEventListener('beforeunload', finish);

  return {
    get engine() {
      return player?.engine ?? null;
    },
    get element() {
      return player?.element ?? loading ?? container;
    },
    tick: (nowMs) => player?.tick(nowMs),
    exit: () => {
      finish();
      const url = connected ? driver?.exitUrl?.() : null;
      if (url) window.location.assign(url);
    },
    destroy: () => {
      destroyed = true;
      finish();
      window.removeEventListener('pagehide', finish);
      window.removeEventListener('beforeunload', finish);
      loading?.remove();
      player?.destroy();
    },
  };
}

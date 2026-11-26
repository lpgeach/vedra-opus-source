/**
 * A slide's transition and animations (docs/briefs/P11.1-pptx-import.md, part C).
 * Effects that match ours come across; PowerPoint's click-by-click sequence is
 * laid on the slide's timeline in its order; anything else is reported.
 */
import { createId } from '@vedraopus/model';
import type { Effect, EffectKind, MotionPath, SceneObject, Transition } from '@vedraopus/model';
import type { ReportItem } from './shapes';
import { all, attr, elements, localName, numberAttr, one } from './xml';
import type { XmlElement } from './xml';

type Report = (item: Omit<ReportItem, 'slide'>) => void;

/** Every descendant named `name`, in document order. */
function descendants(element: XmlElement | undefined, name: string): XmlElement[] {
  const found: XmlElement[] = [];
  const visit = (node: XmlElement) => {
    for (const child of elements(node)) {
      if (localName(child.name) === name) found.push(child);
      visit(child);
    }
  };
  if (element) visit(element);
  return found;
}

// ---------------------------------------------------------------- transitions

/** Where the new slide comes from, for PowerPoint's direction of movement. */
const FROM: Record<string, 'left' | 'right' | 'top' | 'bottom'> = {
  l: 'right',
  r: 'left',
  u: 'bottom',
  d: 'top',
  lu: 'right',
  ru: 'left',
  ld: 'right',
  rd: 'left',
};

const SPEED: Record<string, number> = { slow: 1, med: 0.75, fast: 0.5 };

/**
 * The slide's transition (`p:transition`, perhaps inside newer content with a
 * fallback), as ours; null when it has none.
 */
export function readTransition(slide: XmlElement, report: Report): Transition | null {
  // Newer transitions sit in `mc:AlternateContent`: the choice first (it has the
  // exact duration), then the fallback, then a plain `p:transition`.
  const candidates = [
    ...descendants(slide, 'AlternateContent').flatMap((alt) => [
      ...all(one(alt, 'Choice'), 'transition'),
      ...all(one(alt, 'Fallback'), 'transition'),
    ]),
    ...all(slide, 'transition'),
  ];
  for (const transition of candidates) {
    const effect = elements(transition)[0];
    if (!effect) continue;
    const kind = localName(effect.name);
    const ms = Number(attr(transition, 'dur'));
    const duration = Math.min(
      5,
      Math.max(
        0.1,
        Number.isFinite(ms) && ms > 0
          ? ms / 1000
          : (SPEED[attr(transition, 'spd') ?? 'med'] ?? 0.75),
      ),
    );
    const dir = attr(effect, 'dir') ?? 'l';
    const made = (k: Transition['kind'], direction: Transition['direction']): Transition => ({
      kind: k,
      duration,
      direction,
    });
    switch (kind) {
      case 'fade':
        return made('fade', null);
      case 'push':
        return made('push', FROM[dir] ?? 'right');
      case 'cover':
        if (dir.length === 2)
          report({ outcome: 'approximated', what: 'A diagonal Cover transition runs straight' });
        return made('cover', FROM[dir] ?? 'right');
      case 'pull':
        // The old slide goes the way PowerPoint moves it.
        return made(
          'uncover',
          ({ l: 'left', r: 'right', u: 'top', d: 'bottom' } as const)[dir[0] as 'l'] ?? 'left',
        );
      case 'wipe':
        return made('wipe', FROM[dir] ?? 'right');
      case 'split':
        return made('split', attr(effect, 'orient') === 'vert' ? 'vertical' : 'horizontal');
      case 'circle':
        return made('iris', null);
      case 'zoom':
        return made('zoom', null);
      default:
        // An effect we do not have: the choice may have a fallback we can read.
        if (transition === candidates[candidates.length - 1]) {
          report({ outcome: 'approximated', what: `The slide's “${kind}” transition is a fade` });
          return made('fade', null);
        }
    }
  }
  return null;
}

// ---------------------------------------------------------------- animations

/** Fly In, Wipe and the like name their direction with these bits. */
const SIDES: Record<
  number,
  'top' | 'right' | 'bottom' | 'left' | 'topRight' | 'bottomRight' | 'bottomLeft' | 'topLeft'
> = {
  1: 'top',
  2: 'right',
  3: 'topRight',
  4: 'bottom',
  6: 'bottomRight',
  8: 'left',
  9: 'topLeft',
  12: 'bottomLeft',
};

/** Ours for a PowerPoint preset (entrance and exit share their ids), or null for Appear. */
function effectFor(
  presetId: number,
  subtype: number,
  duration: number,
): { effect: Effect | null; exact: boolean } {
  const plain = (kind: EffectKind, direction: Effect['direction'] = null): Effect => ({
    kind,
    duration,
    direction,
    byParagraph: false,
  });
  switch (presetId) {
    case 1:
      return { effect: null, exact: true };
    case 2:
      return { effect: plain('fly', SIDES[subtype] ?? 'bottom'), exact: true };
    case 10:
      return { effect: plain('fade'), exact: true };
    case 16:
      return {
        effect: plain('split', subtype === 26 || subtype === 42 ? 'vertical' : 'horizontal'),
        exact: true,
      };
    case 22: {
      const side = SIDES[subtype];
      const straight =
        side === 'top' || side === 'right' || side === 'bottom' || side === 'left' ? side : 'left';
      return { effect: plain('wipe', straight), exact: true };
    }
    case 6:
      return { effect: plain('iris'), exact: true };
    case 23:
    case 53:
      return { effect: plain('zoom'), exact: true };
    case 26:
      return { effect: plain('bounce'), exact: true };
    case 21:
      return { effect: plain('spin', 'clockwise'), exact: false };
    case 47:
    case 42:
      return { effect: plain('float', 'bottom'), exact: false };
    default:
      return { effect: plain('fade'), exact: false };
  }
}

/** PowerPoint's motion path (`M 0 0 L 0.25 0.1 E`, fractions of the slide) as our points. */
function pathPoints(
  path: string,
  stage: { width: number; height: number },
): { x: number; y: number }[] {
  const numbers = path.match(/-?\d*\.?\d+(?:e-?\d+)?/gi)?.map(Number) ?? [];
  const commands = path.match(/[MLCZE]/gi) ?? [];
  const points: { x: number; y: number }[] = [];
  let at = 0;
  for (const command of commands) {
    const take =
      command.toUpperCase() === 'C'
        ? 3
        : command.toUpperCase() === 'M' || command.toUpperCase() === 'L'
          ? 1
          : 0;
    for (let i = 0; i < take; i++) {
      const x = numbers[at++];
      const y = numbers[at++];
      // A curve's end only: its control points are not places the object goes.
      if (x === undefined || y === undefined || (take === 3 && i < 2)) continue;
      points.push({
        x: Math.round(x * stage.width * 100) / 100,
        y: Math.round(y * stage.height * 100) / 100,
      });
    }
  }
  return points;
}

/** One effect of the main sequence, as PowerPoint times it. */
interface TimedEffect {
  node: 'clickEffect' | 'withEffect' | 'afterEffect';
  presetClass: string;
  presetId: number;
  subtype: number;
  /** Seconds. */
  duration: number;
  delay: number;
  shapeId: string | undefined;
  path: string | undefined;
  accel: boolean;
  decel: boolean;
}

function readEffects(timing: XmlElement | undefined): TimedEffect[] {
  const effects: TimedEffect[] = [];
  for (const cTn of descendants(timing, 'cTn')) {
    const presetClass = attr(cTn, 'presetClass');
    if (!presetClass) continue;
    const inner = descendants(cTn, 'cTn');
    const durMs =
      inner.map((each) => Number(attr(each, 'dur'))).find((ms) => Number.isFinite(ms) && ms > 0) ??
      500;
    const delayMs = Number(attr(cTn, 'delay'));
    const node = attr(cTn, 'nodeType');
    // The group the effect sits in may delay it too (PowerPoint puts "after" waits there).
    effects.push({
      node: node === 'withEffect' || node === 'afterEffect' ? node : 'clickEffect',
      presetClass,
      presetId: numberAttr(cTn, 'presetID', 0),
      subtype: numberAttr(cTn, 'presetSubtype', 0),
      duration: durMs / 1000,
      delay: Number.isFinite(delayMs) && delayMs > 0 ? delayMs / 1000 : 0,
      shapeId: attr(descendants(cTn, 'spTgt')[0], 'spid'),
      path: attr(descendants(cTn, 'animMotion')[0], 'path'),
      accel: numberAttr(cTn, 'accel', 0) > 0,
      decel: numberAttr(cTn, 'decel', 0) > 0,
    });
  }
  return effects;
}

/**
 * The slide's main animation sequence on its objects: entrances, exits and
 * motion paths, each starting when PowerPoint would play it if every click
 * came at once. Returns when the last effect ends, in seconds (0 for none).
 */
export function applyAnimations(
  slide: XmlElement,
  objects: ReadonlyMap<string, SceneObject>,
  stage: { width: number; height: number },
  report: Report,
): number {
  const effects = readEffects(one(slide, 'timing'));
  let lastStart = 0;
  let lastEnd = 0;
  let end = 0;
  let clicks = false;
  for (const timed of effects) {
    const start =
      (timed.node === 'withEffect' ? lastStart : timed.node === 'afterEffect' ? lastEnd : end) +
      timed.delay;
    if (timed.node === 'clickEffect') clicks = true;
    const finish = start + timed.duration;
    lastStart = start;
    lastEnd = finish;
    end = Math.max(end, finish);
    const object = timed.shapeId ? objects.get(timed.shapeId) : undefined;
    if (!object) {
      report({
        outcome: 'skipped',
        what: 'An animation of something inside a group, or no longer on the slide',
      });
      continue;
    }
    const name = `“${object.name}”`;
    const duration = Math.min(30, Math.max(0.05, Math.round(timed.duration * 100) / 100));
    switch (timed.presetClass) {
      case 'entr': {
        const { effect, exact } = effectFor(timed.presetId, timed.subtype, duration);
        if (!exact)
          report({
            outcome: 'approximated',
            what: `${name}'s entrance is shown as ${effect?.kind ?? 'appearing'}`,
          });
        object.timing = { ...object.timing, start: Math.round(start * 100) / 100 };
        object.animations = { ...object.animations, entrance: effect };
        break;
      }
      case 'exit': {
        const { effect, exact } = effectFor(timed.presetId, timed.subtype, duration);
        if (!exact)
          report({
            outcome: 'approximated',
            what: `${name}'s exit is shown as ${effect?.kind ?? 'disappearing'}`,
          });
        const length = Math.round((finish - object.timing.start) * 100) / 100;
        if (length > 0) object.timing = { ...object.timing, duration: length };
        object.animations = { ...object.animations, exit: effect };
        break;
      }
      case 'path': {
        const points = timed.path ? pathPoints(timed.path, stage) : [];
        if (points.length < 2) {
          report({ outcome: 'skipped', what: `${name}'s motion path could not be read` });
          break;
        }
        const path: MotionPath = {
          id: createId('path'),
          name: `${object.name} path`,
          shape: points.length === 2 ? 'line' : 'freeform',
          points,
          duration: Math.min(60, Math.max(0.05, duration)),
          easing:
            timed.accel && timed.decel
              ? 'easeInOut'
              : timed.accel
                ? 'easeIn'
                : timed.decel
                  ? 'easeOut'
                  : 'linear',
          relativeStart: false,
        };
        object.animations = {
          ...object.animations,
          motionPaths: [...object.animations.motionPaths, path],
        };
        break;
      }
      default:
        report({ outcome: 'skipped', what: `${name}'s emphasis effect` });
    }
  }
  if (clicks) {
    report({
      outcome: 'approximated',
      what: 'Animations started by clicks play in their order on the slide’s timeline',
    });
  }
  return Math.round(end * 100) / 100;
}

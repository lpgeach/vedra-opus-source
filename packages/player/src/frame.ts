import { labelText } from '@vedraopus/model';
import type { LabelKey, PlayerSettings, Project } from '@vedraopus/model';
import type { EngineView } from '@vedraopus/engine';
import { CAPTION_SIZES, TEXT_SIZES } from './settings';
import type { CaptionSize, LearnerSettings } from './settings';

/**
 * The course player's frame (docs/briefs/P8.1-player-frame.md): the menu and
 * how far it lets the learner go, the seekbar, and the learner's own controls.
 */

/** One entry of the menu: a slide, or a draw slide standing for what it drew. */
export interface MenuItem {
  /** The scene slide it is: what a jump goes to. */
  id: string;
  title: string;
  /** The slides it stands for, in play order (a draw's drawn questions). */
  slides: string[];
}

export interface MenuScene {
  id: string;
  title: string;
  items: MenuItem[];
}

/**
 * The menu from the course's scenes and slides: the author's titles in place
 * of the slides' own, hidden entries left out, a draw as one entry for what
 * it drew, and scenes left with no entries left out.
 */
export function menuTree(
  project: Project,
  draws: Readonly<Record<string, readonly string[]>> = {},
): MenuScene[] {
  const { entries } = project.player.menu;
  return project.scenes
    .map((scene) => ({
      id: scene.id,
      title: scene.title || labelText(project.player.labels, 'untitledScene'),
      items: scene.slides.flatMap((slide): MenuItem[] => {
        const entry = entries[slide.id];
        if (entry?.hidden) return [];
        return [
          {
            id: slide.id,
            title: entry?.title || slide.title || labelText(project.player.labels, 'untitledSlide'),
            slides: slide.draw ? [...(draws[slide.id] ?? [])] : [slide.id],
          },
        ];
      }),
    }))
    .filter((scene) => scene.items.length > 0);
}

/**
 * Whether the menu lets the learner go to `item`: any (free), only what they
 * have seen and where they are (restricted), or none (locked).
 */
export function menuAllows(
  navigation: PlayerSettings['menu']['navigation'],
  item: MenuItem,
  visited: ReadonlySet<string>,
  current: string | null,
): boolean {
  if (item.slides.length === 0 || navigation === 'locked') return false;
  if (navigation === 'free') return true;
  return item.slides.some((id) => visited.has(id) || id === current);
}

/** The speeds the learner can choose. */
export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/**
 * A clock that runs at the learner's speed: each reading moves on by the real
 * time since the last, times the speed then in force.
 */
export function speedClock(real: () => number) {
  let last = real();
  let now = last;
  let rate = 1;
  return {
    now() {
      const t = real();
      now += (t - last) * rate;
      last = t;
      return now;
    },
    get rate() {
      return rate;
    },
    setRate(value: number) {
      this.now();
      rate = value;
    },
  };
}

/** What the frame tells the player the learner did. */
export interface FrameEvents {
  jump(slideId: string): void;
  seek(seconds: number): void;
  submit(): void;
  volume(level: number): void;
  speed(rate: number): void;
  /** The learner changed a setting in the accessibility panel (P10.1, part C). */
  settings(settings: LearnerSettings): void;
}

const make = <K extends keyof HTMLElementTagNameMap>(
  document: Document,
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

/**
 * The frame's own elements, for the player to place: what goes at the start
 * of the bar (menu button, logo), in the footer, and over the viewport (the
 * menu and the accessibility panel); and `update`, which follows the view.
 */
export function createFrame(
  document: Document,
  project: Project,
  root: HTMLElement,
  logoUrl: string | null,
  events: FrameEvents,
  initial: LearnerSettings,
) {
  const { player } = project;
  const { controls } = player;
  /** The frame's words, in the course's language (P8.3). */
  const say = (key: LabelKey) => labelText(player.labels, key);
  const button = (className: string, text: string, label?: string) => {
    const made = make(document, 'button', className, text);
    made.type = 'button';
    if (label) made.setAttribute('aria-label', label);
    return made;
  };

  // The bar: the menu button and the logo.
  const barStart: HTMLElement[] = [];
  const menuButton = button('vo-player-menu-button', say('menu'));
  menuButton.setAttribute('aria-expanded', 'false');
  const menu = make(document, 'nav', 'vo-player-menu');
  menu.setAttribute('aria-label', say('courseMenu'));
  menu.hidden = true;
  if (player.menu.show) barStart.push(menuButton);
  if (logoUrl) {
    const logo = make(document, 'img', 'vo-player-logo');
    logo.src = logoUrl;
    logo.alt = '';
    barStart.push(logo);
  }
  const setMenu = (open: boolean) => {
    menu.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
  };
  menuButton.addEventListener('click', () => setMenu(menu.hidden === true));

  // The footer's controls.
  const seek = make(document, 'input', 'vo-player-seek');
  seek.type = 'range';
  seek.min = '0';
  seek.step = '0.1';
  seek.setAttribute('aria-label', say('slideTime'));
  seek.disabled = controls.seekbar !== 'drag';
  seek.addEventListener('input', () => events.seek(Number(seek.value)));
  const submit = button('vo-player-submit', say('submit'));
  submit.hidden = true;
  submit.addEventListener('click', () => events.submit());
  const volume = make(document, 'input', 'vo-player-volume');
  volume.type = 'range';
  volume.min = '0';
  volume.max = '1';
  volume.step = '0.05';
  volume.value = '1';
  volume.setAttribute('aria-label', say('volume'));
  volume.addEventListener('input', () => events.volume(Number(volume.value)));
  const speed = make(document, 'select', 'vo-player-speed');
  speed.setAttribute('aria-label', say('speed'));
  for (const each of SPEEDS) {
    const option = make(document, 'option', '', `${each}×`);
    option.value = String(each);
    option.selected = each === 1;
    speed.append(option);
  }
  speed.addEventListener('change', () => events.speed(Number(speed.value)));
  const fullscreen = button('vo-player-fullscreen', say('fullscreen'));
  fullscreen.addEventListener('click', () => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void root.requestFullscreen?.();
  });
  document.addEventListener('fullscreenchange', () => {
    const on = document.fullscreenElement === root;
    fullscreen.textContent = on ? say('exitFullscreen') : say('fullscreen');
    fullscreen.setAttribute('aria-pressed', String(on));
  });

  // Accessibility: caption size, the text view and its size (remembered, P10.1),
  // and the keyboard shortcuts.
  const a11yButton = button('vo-player-a11y-button', say('accessibility'));
  a11yButton.setAttribute('aria-expanded', 'false');
  const a11y = make(document, 'div', 'vo-player-a11y');
  a11y.setAttribute('role', 'dialog');
  a11y.setAttribute('aria-label', say('accessibility'));
  a11y.hidden = true;
  const settings: LearnerSettings = { ...initial };
  const changed = () => events.settings({ ...settings });
  const sizeLabel = make(document, 'label', 'vo-player-a11y-row', `${say('captionSize')} `);
  const size = make(document, 'select', '');
  size.setAttribute('aria-label', say('captionSize'));
  const sizeWords: Record<CaptionSize, string> = {
    normal: say('sizeNormal'),
    large: say('sizeLarge'),
    larger: say('sizeLarger'),
  };
  for (const value of CAPTION_SIZES) {
    const option = make(document, 'option', '', sizeWords[value]);
    option.value = value;
    size.append(option);
  }
  size.value = settings.captionSize;
  root.dataset['captionSize'] = settings.captionSize;
  size.addEventListener('change', () => {
    settings.captionSize = size.value as CaptionSize;
    root.dataset['captionSize'] = size.value;
    changed();
  });
  sizeLabel.append(size);
  const textViewLabel = make(document, 'label', 'vo-player-a11y-row');
  const textView = make(document, 'input', '');
  textView.type = 'checkbox';
  textView.checked = settings.textView;
  textViewLabel.append(textView, ` ${say('textView')}`);
  const textSizeLabel = make(document, 'label', 'vo-player-a11y-row', `${say('textSize')} `);
  const textSize = make(document, 'select', '');
  textSize.setAttribute('aria-label', say('textSize'));
  for (const value of TEXT_SIZES) {
    const option = make(document, 'option', '', `${value}%`);
    option.value = String(value);
    textSize.append(option);
  }
  textSize.value = String(settings.textSize);
  textSize.disabled = !settings.textView;
  textSizeLabel.append(textSize);
  textView.addEventListener('change', () => {
    settings.textView = textView.checked;
    textSize.disabled = !textView.checked;
    changed();
  });
  textSize.addEventListener('change', () => {
    settings.textSize = Number(textSize.value);
    changed();
  });
  const keys = make(document, 'ul', 'vo-player-shortcuts');
  keys.setAttribute('aria-label', say('shortcuts'));
  for (const line of [
    say('shortcutNext'),
    say('shortcutPrevious'),
    say('shortcutTab'),
    say('shortcutChoose'),
  ]) {
    keys.append(make(document, 'li', '', line));
  }
  const close = button('vo-player-a11y-close', say('close'));
  a11y.append(sizeLabel, textViewLabel, textSizeLabel, keys, close);
  const setA11y = (open: boolean) => {
    a11y.hidden = !open;
    a11yButton.setAttribute('aria-expanded', String(open));
    if (open) size.focus();
  };
  a11yButton.addEventListener('click', () => setA11y(a11y.hidden === true));
  close.addEventListener('click', () => {
    setA11y(false);
    a11yButton.focus();
  });

  const footer: HTMLElement[] = [];
  if (controls.seekbar !== 'off') footer.push(seek);
  if (controls.submit) footer.push(submit);
  if (controls.volume) footer.push(volume);
  if (controls.speed) footer.push(speed);
  if (controls.accessibility) footer.push(a11yButton);
  if (controls.fullscreen) footer.push(fullscreen);

  /** The menu as the learner may use it now, rebuilt when the slide or what was seen changes. */
  let drawn = '';
  const drawMenu = (
    current: string | null,
    visited: ReadonlySet<string>,
    draws: Record<string, readonly string[]>,
  ) => {
    const tree = menuTree(project, draws);
    const key = JSON.stringify([current, [...visited], tree]);
    if (key === drawn) return;
    drawn = key;
    menu.replaceChildren(
      ...tree.map((scene) => {
        const section = make(document, 'section', 'vo-player-menu-scene');
        section.append(make(document, 'h2', 'vo-player-menu-title', scene.title));
        const list = make(document, 'ol', '');
        for (const item of scene.items) {
          const entry = button('vo-player-menu-item', item.title);
          entry.dataset['slideId'] = item.id;
          if (current !== null && item.slides.includes(current)) {
            entry.setAttribute('aria-current', 'page');
          }
          entry.disabled = !menuAllows(player.menu.navigation, item, visited, current);
          entry.addEventListener('click', () => {
            setMenu(false);
            events.jump(item.id);
          });
          const li = make(document, 'li', '');
          li.append(entry);
          list.append(li);
        }
        section.append(list);
        return section;
      }),
    );
  };

  return {
    barStart,
    footer,
    overlays: [menu, a11y],
    /** Follow the view: the menu, the seekbar, and Submit on question slides. */
    update(
      view: EngineView,
      visited: ReadonlySet<string>,
      draws: Record<string, readonly string[]>,
      question: boolean,
    ) {
      // Under a lightbox, the menu shows the slide beneath it (P8.4; the Phase 8 review).
      if (player.menu.show) drawMenu(view.lightbox?.underSlideId ?? view.slideId, visited, draws);
      const base = view.layers.find((layer) => layer.isBase);
      if (base) {
        seek.max = String(base.duration);
        // Not while the learner drags it.
        if (document.activeElement !== seek) seek.value = String(base.playhead);
      }
      submit.hidden = !question;
    },
  };
}

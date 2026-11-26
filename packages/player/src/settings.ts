/**
 * The learner's own player settings (docs/briefs/P10.1-accessibility.md, part C):
 * the accessibility panel's caption size, text view and text size. They are kept
 * in the browser's storage under the course's id, so they never leave the
 * learner's machine. Where storage is refused (a private window, some LMS
 * frames) they last for the visit only.
 */

export const CAPTION_SIZES = ['normal', 'large', 'larger'] as const;
export type CaptionSize = (typeof CAPTION_SIZES)[number];

/** The text view's sizes, in per cent. */
export const TEXT_SIZES = [100, 125, 150, 175, 200] as const;

export interface LearnerSettings {
  captionSize: CaptionSize;
  textView: boolean;
  /** One of `TEXT_SIZES`. */
  textSize: number;
}

export const DEFAULT_SETTINGS: Readonly<LearnerSettings> = {
  captionSize: 'normal',
  textView: false,
  textSize: 100,
};

/** Where settings are kept; `localStorage` in a browser. */
export interface SettingsStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const keyFor = (courseId: string) => `vedraopus-player:${courseId}`;

/** The settings saved for this course, anything missing or unknown as the default. */
export function loadSettings(store: SettingsStore | null, courseId: string): LearnerSettings {
  let saved: Partial<Record<keyof LearnerSettings, unknown>> = {};
  try {
    const text = store?.getItem(keyFor(courseId));
    const parsed: unknown = text ? JSON.parse(text) : null;
    if (parsed && typeof parsed === 'object') saved = parsed;
  } catch {
    // Refused, or not ours: the defaults.
  }
  return {
    captionSize: CAPTION_SIZES.includes(saved.captionSize as CaptionSize)
      ? (saved.captionSize as CaptionSize)
      : DEFAULT_SETTINGS.captionSize,
    textView: typeof saved.textView === 'boolean' ? saved.textView : DEFAULT_SETTINGS.textView,
    textSize: (TEXT_SIZES as readonly unknown[]).includes(saved.textSize)
      ? (saved.textSize as number)
      : DEFAULT_SETTINGS.textSize,
  };
}

export function saveSettings(
  store: SettingsStore | null,
  courseId: string,
  settings: LearnerSettings,
): void {
  try {
    store?.setItem(keyFor(courseId), JSON.stringify(settings));
  } catch {
    // Refused: they last for this visit.
  }
}

/** The browser's storage, or null where even asking for it throws. */
export function browserStore(window: Window): SettingsStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

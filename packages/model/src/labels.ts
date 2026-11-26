/**
 * Every word the course player shows of its own (docs/briefs/P8.3-player-appearance.md),
 * with the English a course uses until its author changes it. `{name}` is
 * filled in when shown.
 */
export const DEFAULT_LABELS = {
  course: 'Course',
  loading: 'Loading…',
  resumeQuestion: 'Continue where you left off?',
  resumeContinue: 'Continue',
  resumeStartOver: 'Start over',
  previous: 'Previous',
  next: 'Next',
  submit: 'Submit',
  slideOf: 'Slide {n} of {total}',
  noSlides: 'No slides',
  captions: 'Captions',
  captionsShort: 'CC',
  play: 'Play',
  playSound: 'Play the course with sound',
  timeLeft: 'Time left {time}',
  reviewCorrect: 'Review: you answered this correctly',
  reviewIncorrect: 'Review: you answered this incorrectly',
  reviewAnswered: 'Review: your answer',
  reviewUnanswered: 'Review: not answered',
  menu: 'Menu',
  courseMenu: 'Course menu',
  untitledScene: 'Untitled scene',
  untitledSlide: 'Untitled slide',
  slideTime: 'Slide time',
  volume: 'Volume',
  speed: 'Playback speed',
  fullscreen: 'Full screen',
  exitFullscreen: 'Exit full screen',
  accessibility: 'Accessibility',
  captionSize: 'Caption size',
  sizeNormal: 'Normal',
  sizeLarge: 'Large',
  sizeLarger: 'Larger',
  shortcuts: 'Keyboard shortcuts',
  shortcutNext: 'Right arrow or Page Down: the next slide',
  shortcutPrevious: 'Left arrow or Page Up: the previous slide',
  shortcutTab: 'Tab: move between choices and controls',
  shortcutChoose: 'Space or Enter: choose a choice or press a control',
  close: 'Close',
  lightbox: 'Lightbox',
  more: 'More',
  rotateHint: 'Turn your device sideways for a bigger view.',
  dismiss: 'Dismiss',
  courseEnded: 'The course has ended. You can close this page now.',
  courseTabs: 'Course tabs',
  resources: 'Resources',
  glossary: 'Glossary',
  notes: 'Notes',
  noNotes: 'This slide has no notes.',
  resultsQuestion: 'Question',
  resultsNumbered: 'Question {n}',
  resultsResult: 'Result',
  resultsPoints: 'Points',
  resultCorrect: 'Correct',
  resultIncorrect: 'Incorrect',
  resultAnswered: 'Answered',
  resultUnanswered: 'Not answered',
  resultsScore: 'Score: {score} of {max} ({percent}%).',
  resultsPassMark: 'Pass mark: {pass}%.',
  resultsPassed: 'Passed.',
  resultsNotPassed: 'Not passed.',
  resultsAnsweredCount: 'Answered: {score} of {max}.',
  // Accessibility (P10.1).
  skipToSlide: 'Skip to slide',
  courseControls: 'Course controls',
  dragHint: 'Space to pick up; then the arrow keys to move, Space to drop, Escape to cancel.',
  dragPickedUp: '{name} picked up.',
  dragOver: 'Over {name}.',
  dragStart: 'Back where it started.',
  dragDropped: '{name} dropped.',
  dragCancelled: 'Cancelled.',
  textView: 'Text view',
  textSize: 'Text size',
  slideText: 'Slide text',
  textPicture: 'Picture: {text}',
  textField: '{label}: {value}',
  textEmpty: '(empty)',
  textChosen: '{text} (chosen)',
  // 360° images (P9.10).
  panorama: '360° view',
  spotPrevious: 'Previous spot',
  spotNext: 'Next spot',
} as const;

export type LabelKey = keyof typeof DEFAULT_LABELS;
export const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as LabelKey[];

/** A BCP 47 language tag, as far as a course needs one: `en`, `fr-CA`, `zh-Hant`. */
export const LANGUAGE_TAG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/** Languages written right to left, by primary subtag (P10.3, part C). */
const RIGHT_TO_LEFT = new Set([
  'ar', // Arabic
  'arc', // Aramaic
  'ckb', // Central Kurdish
  'dv', // Divehi
  'fa', // Persian
  'he', // Hebrew
  'iw', // Hebrew, the old tag
  'khw', // Khowar
  'ks', // Kashmiri
  'ps', // Pashto
  'sd', // Sindhi
  'syr', // Syriac
  'ug', // Uyghur
  'ur', // Urdu
  'yi', // Yiddish
]);
/** Scripts written right to left, for tags that name one (`az-Arab`, `pa-Arab`). */
const RIGHT_TO_LEFT_SCRIPTS = new Set(['arab', 'hebr', 'syrc', 'thaa', 'nkoo', 'adlm', 'rohg']);
/** Scripts written left to right, which override the language (`ur-Latn`, `ug-Cyrl`). */
const LEFT_TO_RIGHT_SCRIPTS = new Set(['latn', 'cyrl']);

/** Whether a language tag is written right to left: `ar`, `he-IL`, `az-Arab`; not `en`, `ur-Latn`. */
export function isRightToLeft(tag: string): boolean {
  const [primary = '', ...rest] = tag.toLowerCase().split('-');
  const script = rest.find((part) => part.length === 4);
  if (script && RIGHT_TO_LEFT_SCRIPTS.has(script)) return true;
  if (script && LEFT_TO_RIGHT_SCRIPTS.has(script)) return false;
  return RIGHT_TO_LEFT.has(primary);
}

/** What `labelText` reads: the course's language and the words written for each. */
export interface LabelSettings {
  language: string;
  words: Readonly<Record<string, Partial<Record<LabelKey, string>>>>;
}

/**
 * A label as the course shows it: the author's word for the course's
 * language, else the English; `{name}` placeholders filled from `values`
 * (one the word leaves out is simply not shown).
 */
export function labelText(
  labels: LabelSettings,
  key: LabelKey,
  values: Readonly<Record<string, string | number>> = {},
): string {
  const word = labels.words[labels.language]?.[key] ?? DEFAULT_LABELS[key];
  return word.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

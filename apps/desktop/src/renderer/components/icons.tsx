/**
 * The editor's icons, drawn for this project on a 16×16 grid with a 1.5 px
 * stroke in the current text colour. Add new ones here in the same style;
 * do not bring in an icon library or copy another product's icons.
 */
import type { ReactNode } from 'react';

const paths = {
  save: (
    <>
      <path d="M3 2.75h8.25L13.25 4.75v8.5H2.75v-10.5z" />
      <path d="M5.25 2.75v3.5h5v-3.5M5.25 13.25v-4h5.5v4" />
    </>
  ),
  undo: <path d="M5.5 3.25 2.75 6l2.75 2.75M2.75 6h6.5a3.5 3.5 0 0 1 0 7H6.5" />,
  redo: <path d="M10.5 3.25 13.25 6 10.5 8.75M13.25 6h-6.5a3.5 3.5 0 0 0 0 7H9.5" />,
  slidePlus: (
    <>
      <path d="M13.25 7.5V3.75H2.75v8.5H8" />
      <path d="M12 10v4M10 12h4" />
    </>
  ),
  slide: <path d="M2.75 3.75h10.5v8.5H2.75z" />,
  // The application menu (B1): three lines.
  menu: <path d="M2.75 4.25h10.5M2.75 8h10.5M2.75 11.75h10.5" />,
  // Preview: a play triangle.
  play: <path d="M5 3.25v9.5L12.5 8z" />,
  // Master view: a slide with the layout's bands on it.
  master: (
    <>
      <path d="M2.75 3.75h10.5v8.5H2.75z" />
      <path d="M2.75 6h10.5M5 8.25h6M5 10.25h4" />
    </>
  ),
  overview: (
    <>
      <path d="M2.25 2.75h4.5v3.5h-4.5zM9.25 2.75h4.5v3.5h-4.5zM5.75 9.75h4.5v3.5h-4.5z" />
      <path d="M4.5 6.25v1.5h7v-1.5M8 7.75v2" />
    </>
  ),
  image: (
    <>
      <path d="M2.75 3.25h10.5v9.5H2.75z" />
      <path d="m2.75 10.5 3-3 3 3 1.75-1.75 2.75 2.75" />
      <circle cx="10.25" cy="6" r="0.9" />
    </>
  ),
  text: <path d="M3.25 4.5V3.25h9.5V4.5M8 3.25v9.5M6.25 12.75h3.5" />,
  alignLeft: <path d="M2.75 4h10.5M2.75 7h6.5M2.75 10h10.5M2.75 13h6.5" />,
  alignCenter: <path d="M2.75 4h10.5M4.75 7h6.5M2.75 10h10.5M4.75 13h6.5" />,
  alignRight: <path d="M2.75 4h10.5M6.75 7h6.5M2.75 10h10.5M6.75 13h6.5" />,
  alignJustify: <path d="M2.75 4h10.5M2.75 7h10.5M2.75 10h10.5M2.75 13h10.5" />,
  listBullet: (
    <>
      <path d="M6.25 4.5h7M6.25 8h7M6.25 11.5h7" />
      <circle cx="3.25" cy="4.5" r="0.6" />
      <circle cx="3.25" cy="8" r="0.6" />
      <circle cx="3.25" cy="11.5" r="0.6" />
    </>
  ),
  listNumber: (
    <>
      <path d="M6.75 4.5h6.5M6.75 8h6.5M6.75 11.5h6.5" />
      <path d="m2.6 3.6.9-.6v3M2.5 9.75h1.6L2.5 12.5h1.7" />
    </>
  ),
  textGrow: (
    <>
      <path d="M2.25 12.75 5.75 3.75l3.5 9M3.5 9.75H8" />
      <path d="M12.25 8V3.5M10.5 5.25l1.75-1.75L14 5.25" />
    </>
  ),
  textShrink: (
    <>
      <path d="M3.25 12.75 5.75 6.5l2.5 6.25M4.2 10.5h3.1" />
      <path d="M12.25 3.5V8M10.5 6.25 12.25 8 14 6.25" />
    </>
  ),
  audio: (
    <>
      <path d="M2.75 6.25h2.5L8.5 3.5v9L5.25 9.75h-2.5z" />
      <path d="M10.75 6a2.75 2.75 0 0 1 0 4M12.5 4.25a5.25 5.25 0 0 1 0 7.5" />
    </>
  ),
  video: (
    <>
      <path d="M2.75 4.25h7.5v7.5h-7.5z" />
      <path d="m10.25 7 3-1.75v5.5l-3-1.75" />
    </>
  ),
  microphone: (
    <>
      <path d="M6 3.75a2 2 0 0 1 4 0v3.5a2 2 0 0 1-4 0z" />
      <path d="M3.75 7.25a4.25 4.25 0 0 0 8.5 0M8 11.5v2.25M5.75 13.75h4.5" />
    </>
  ),
  player: (
    <>
      <rect x="2.25" y="3" width="11.5" height="10" rx="1.25" />
      <path d="M2.25 5.5h11.5M5.25 5.5V13" />
      <path d="m8.25 7.75 2.5 1.5-2.5 1.5z" />
    </>
  ),
  screen: (
    <>
      <rect x="2.25" y="3" width="11.5" height="8" rx="1" />
      <path d="M6 13.25h4M8 11v2.25" />
      <circle cx="8" cy="7" r="1.75" />
    </>
  ),
  panorama: (
    <>
      <ellipse cx="8" cy="8" rx="5.75" ry="5.75" />
      <ellipse cx="8" cy="8" rx="5.75" ry="2.25" />
      <path d="M8 2.25v11.5" />
    </>
  ),
  table: (
    <>
      <rect x="2.25" y="2.75" width="11.5" height="10.5" rx="1" />
      <path d="M2.25 6.25h11.5M2.25 9.75h11.5M6.25 6.25v7M10 6.25v7" />
    </>
  ),
  icons: (
    <>
      <circle cx="4.75" cy="4.75" r="2" />
      <rect x="9.25" y="2.75" width="4" height="4" rx="0.75" />
      <path d="M4.75 9.25 7 13.25H2.5z" />
      <path d="m11.25 9.25.85 1.7 1.9.3-1.4 1.3.35 1.9-1.7-.9-1.7.9.35-1.9-1.4-1.3 1.9-.3z" />
    </>
  ),
  web: (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M2.25 8h11.5M8 2.25c1.75 1.6 2.6 3.5 2.6 5.75S9.75 12.15 8 13.75C6.25 12.15 5.4 10.25 5.4 8S6.25 3.85 8 2.25z" />
    </>
  ),
  scroll: (
    <>
      <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="1.25" />
      <path d="M11 4.75v6.5" />
      <path d="M4.75 5.5h4M4.75 8h4M4.75 10.5h4" />
    </>
  ),
  field: (
    <>
      <rect x="2.25" y="4.75" width="11.5" height="6.5" rx="1.25" />
      <path d="M5 6.75v2.5" />
    </>
  ),
  tracking: (
    <>
      <circle cx="8" cy="8" r="5.25" />
      <path d="m5.5 8.1 1.75 1.75L10.75 6.4" />
    </>
  ),
  question: (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M6.25 6.25a1.85 1.85 0 1 1 2.6 1.7c-.55.25-.85.7-.85 1.3v.35" />
      <path d="M8 11.6v.15" />
    </>
  ),
  convert: (
    <>
      <rect x="2.25" y="3.25" width="7.5" height="6" rx="1" />
      <path d="M9.75 12.75h4M11.75 10.75v4M6 9.25v3.5h1.5" />
    </>
  ),
  survey: (
    <>
      <rect x="2.75" y="2.25" width="10.5" height="11.5" rx="1.25" />
      <path d="M5 5.25h1.25M5 8h1.25M5 10.75h1.25M8 5.25h3M8 8h3M8 10.75h3" />
    </>
  ),
  speech: (
    <>
      <path d="M3 3.75h10a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-.75.75H8.5l-3 2.5v-2.5H3a.75.75 0 0 1-.75-.75V4.5A.75.75 0 0 1 3 3.75Z" />
      <path d="M5.25 6.5h5.5M5.25 8.25h3.5" />
    </>
  ),
  // A globe: the course's words in another language (P10.3).
  translate: (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M2.25 8h11.5M8 2.25c1.75 1.6 2.6 3.5 2.6 5.75S9.75 12.15 8 13.75M8 2.25C6.25 3.85 5.4 5.75 5.4 8s.85 4.15 2.6 5.75" />
    </>
  ),
  zoomRegion: (
    <>
      <rect x="2.25" y="3.25" width="11.5" height="9.5" rx="1" strokeDasharray="2 1.5" />
      <circle cx="7.5" cy="7.5" r="2.25" />
      <path d="m9.25 9.25 2 2" />
    </>
  ),
  hotspot: (
    <>
      <rect x="2.25" y="3.75" width="11.5" height="8.5" rx="1" strokeDasharray="2 1.5" />
      <circle cx="8" cy="8" r="1.5" />
    </>
  ),
  marker: (
    <>
      <path d="M8 14s-4-4.4-4-7a4 4 0 0 1 8 0c0 2.6-4 7-4 7Z" />
      <circle cx="8" cy="7" r="1.4" />
    </>
  ),
  variable: (
    <>
      <path d="M5.25 2.75c-1.5 0-2 .75-2 2v1.5c0 .9-.5 1.5-1.25 1.75.75.25 1.25.85 1.25 1.75v1.5c0 1.25.5 2 2 2" />
      <path d="M10.75 2.75c1.5 0 2 .75 2 2v1.5c0 .9.5 1.5 1.25 1.75-.75.25-1.25.85-1.25 1.75v1.5c0 1.25-.5 2-2 2" />
      <path d="m6.25 6 3.5 4M9.75 6l-3.5 4" />
    </>
  ),
  link: (
    <>
      <path d="M6.9 9.1a2.4 2.4 0 0 0 3.4 0l2-2a2.4 2.4 0 0 0-3.4-3.4l-.8.8" />
      <path d="M9.1 6.9a2.4 2.4 0 0 0-3.4 0l-2 2a2.4 2.4 0 0 0 3.4 3.4l.8-.8" />
    </>
  ),
  lineSpacing: (
    <>
      <path d="M7.25 4h6M7.25 8h6M7.25 12h6" />
      <path d="M3.75 3.5v9M2.25 5l1.5-1.5L5.25 5M2.25 11l1.5 1.5 1.5-1.5" />
    </>
  ),
  fitFixed: (
    <>
      <path d="M2.75 3.75h10.5v8.5H2.75z" />
      <path d="M5 6.75h6M5 9.25h3.5" />
    </>
  ),
  fitShrink: (
    <>
      <path d="M2.75 3.75h10.5v8.5H2.75z" />
      <path d="M4.75 8h2.5M6 6.75 7.25 8 6 9.25M11.25 8h-2.5M10 6.75 8.75 8 10 9.25" />
    </>
  ),
  fitGrow: (
    <>
      <path d="M2.75 9.25v-5.5h10.5v5.5" />
      <path d="M5 6.5h6M8 9v4.25M6.25 11.5 8 13.25l1.75-1.75" />
    </>
  ),
  shape: (
    <>
      <path d="M2.75 6.75h6.5v6.5h-6.5z" />
      <circle cx="10.25" cy="5.75" r="3" />
    </>
  ),
  button: (
    <>
      <rect x="2.25" y="4.75" width="11.5" height="6.5" rx="3.25" />
      <path d="M5.75 8h4.5" />
    </>
  ),
  clipboard: (
    <>
      <path d="M5.5 3.25H3.75v10h8.5v-10H10.5" />
      <path d="M5.75 2.25h4.5v2.25h-4.5z" />
    </>
  ),
  cut: (
    <>
      <circle cx="4.5" cy="11.75" r="1.75" />
      <circle cx="11.5" cy="11.75" r="1.75" />
      <path d="m5.5 10.25 5.5-8M10.5 10.25 5 2.25" />
    </>
  ),
  copy: (
    <>
      <path d="M5.75 5.75h7.5v7.5h-7.5z" />
      <path d="M10.25 5.5V2.75h-7.5v7.5H5.5" />
    </>
  ),
  align: <path d="M2.75 2.25v11.5M5.25 4.25h8v2.5h-8zM5.25 9.25h5v2.5h-5z" />,
  group: (
    <>
      <path d="M2.75 2.75h7.5v7.5h-7.5zM5.75 5.75h7.5v7.5h-7.5z" />
    </>
  ),
  ungroup: (
    <>
      <path d="M2.25 2.25h6v6h-6zM7.75 7.75h6v6h-6z" strokeDasharray="2 1.5" />
    </>
  ),
  lock: (
    <>
      <path d="M3.75 7.25h8.5v6h-8.5z" />
      <path d="M5.5 7.25V5a2.5 2.5 0 0 1 5 0v2.25" />
    </>
  ),
  unlock: (
    <>
      <path d="M3.75 7.25h8.5v6h-8.5z" />
      <path d="M5.5 7.25V5a2.5 2.5 0 0 1 4.8-1" />
    </>
  ),
  order: (
    <>
      <path d="M2.75 2.75h7v7h-7z" />
      <path d="M12 6.25h1.25v7h-7V12" />
    </>
  ),
  rulers: (
    <>
      <path d="M2.25 4.75h11.5v6.5H2.25z" />
      <path d="M5 4.75v2.5M7.5 4.75v3.5M10 4.75v2.5M12.5 4.75v3.5" />
    </>
  ),
  grid: (
    <>
      <path d="M2.75 2.75h10.5v10.5H2.75z" />
      <path d="M6.25 2.75v10.5M9.75 2.75v10.5M2.75 6.25h10.5M2.75 9.75h10.5" />
    </>
  ),
  // The slide, and an object across its right edge: whole, its outer part faint, or cut off.
  offSlideShow: (
    <>
      <path d="M2.25 3.25h9v9.5h-9z" />
      <path d="M7 6h7v4H7z" />
    </>
  ),
  offSlideDim: (
    <>
      <path d="M2.25 3.25h9v9.5h-9z" />
      <path d="M11.25 6H7v4h4.25" />
      <path d="M11.25 6H14v4h-2.75" strokeDasharray="1.5 1.25" />
    </>
  ),
  offSlideHide: (
    <>
      <path d="M2.25 3.25h9v9.5h-9z" />
      <path d="M11.25 6H7v4h4.25" />
    </>
  ),
  guide: (
    <>
      <path d="M8 2.25v11.5" strokeDasharray="2.5 1.5" />
      <path d="M2.75 8h2.5M10.75 8h2.5M4 5.5v5M12 5.5v5" />
    </>
  ),
  snap: (
    <path d="M4.25 3v4.75a3.75 3.75 0 0 0 7.5 0V3h-2.5v4.75a1.25 1.25 0 0 1-2.5 0V3zM4.25 5.5h2.5M9.25 5.5h2.5" />
  ),
  palette: (
    <>
      <path d="M8 2.25a5.75 5.75 0 1 0 0 11.5c1 0 1.5-.6 1.5-1.4 0-1.1-.9-1.2-.9-2.1 0-.7.6-1.25 1.4-1.25h1.5a2.25 2.25 0 0 0 2.25-2.25C13.75 4.2 11.2 2.25 8 2.25z" />
      <circle cx="5.25" cy="7.5" r="0.6" />
      <circle cx="7.25" cy="4.9" r="0.6" />
      <circle cx="10.4" cy="5.4" r="0.6" />
    </>
  ),
  fonts: (
    <path d="m2.5 12.75 3.25-9.5h.5l3.25 9.5M3.6 9.75h4.8M11 12.75V7.5m0 1.2c.4-.7 1-1.2 1.75-1.2.8 0 1.25.5 1.25 1.5v3.75" />
  ),
  stageSize: (
    <>
      <path d="M2.75 3.75h10.5v8.5H2.75z" />
      <path d="M5 8h6M5 8l1.5-1.5M5 8l1.5 1.5M11 8 9.5 6.5M11 8 9.5 9.5" />
    </>
  ),
  transition: (
    <>
      <path d="M2.75 3.75h5.5v8.5h-5.5z" />
      <path d="M10.5 3.75h2.75v8.5H10.5M8.25 8h5M11.5 6.25 13.25 8l-1.75 1.75" />
    </>
  ),
  entrance: <path d="M2.25 8h7.5M7 5.25 9.75 8 7 10.75M12.75 2.75v10.5" />,
  exit: <path d="M6.25 8h7.5M11 5.25 13.75 8 11 10.75M3.25 2.75v10.5" />,
  motionPath: (
    <>
      <path d="M3.5 12c0-5.5 9-2.5 9-8" />
      <circle cx="3.5" cy="12" r="1.25" />
      <circle cx="12.5" cy="4" r="1.25" />
    </>
  ),
  panelLeft: (
    <>
      <path d="M2.75 3.25h10.5v9.5H2.75z" />
      <path d="M6.25 3.25v9.5" />
    </>
  ),
  panelRight: (
    <>
      <path d="M2.75 3.25h10.5v9.5H2.75z" />
      <path d="M9.75 3.25v9.5" />
    </>
  ),
  panelBottom: (
    <>
      <path d="M2.75 3.25h10.5v9.5H2.75z" />
      <path d="M2.75 9.25h10.5" />
    </>
  ),
  reset: <path d="M3 8a5 5 0 1 0 1.6-3.7M3.25 2.5v2.75H6" />,
  system: <path d="M2.25 3.25h11.5v7.5H2.25zM5.75 13.25h4.5M8 10.75v2.5" />,
  light: (
    <>
      <circle cx="8" cy="8" r="2.75" />
      <path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1.05 1.05M11.35 11.35l1.05 1.05M3.6 12.4l1.05-1.05M11.35 4.65l1.05-1.05" />
    </>
  ),
  dark: <path d="M13 9.6A5.5 5.5 0 0 1 6.4 3a5.5 5.5 0 1 0 6.6 6.6z" />,
  chevronLeft: <path d="M9.75 3.75 5.5 8l4.25 4.25" />,
  chevronRight: <path d="M6.25 3.75 10.5 8l-4.25 4.25" />,
  chevronDown: <path d="M3.75 6.25 8 10.5l4.25-4.25" />,
  chevronUp: <path d="M3.75 9.75 8 5.5l4.25 4.25" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof paths;

/** Decorative: the control it sits in carries the accessible name. */
export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

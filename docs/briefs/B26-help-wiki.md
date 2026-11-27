# B26: the help wiki

**Luke (2026-11-27):** "start on a help wiki as well explaining every feature", and update the downloads page's screenshots. He chose the help to live here in `help/`, published to a `help/` folder on the public `vedra-opus-releases` and linked from its README.

## What it is

- **Markdown pages in `help/`,** for people who make courses with Vedra Opus. No knowledge of other tools is assumed.
  - Written in our own words, as everything here is: nothing from another product's help.
  - One page per area of the app; `help/README.md` is the contents.
  - Each page says what a feature is for, where it is (tab, group, command, panel), and how to use it step by step. It ends with what to watch out for.
- **Screenshots taken from the app by a script,** so they can be retaken whenever the interface changes:
  - `help/shots.spec.ts`, run with `npm run help:shots` (`playwright.help.config.ts`);
  - It launches the built app the way the e2e tests do (`e2e/launch.ts`), so no window appears on the desktop. It works mostly in the demo course and saves PNGs to `help/images/`.
  - **The downloads page's two screenshots** come from the same script (`help/images/readme-editor-light.png`, `readme-editor-dark.png`).
- **Published** by copying `help/` to the downloads repository's `help/` folder, where GitHub shows the Markdown with its pictures. Its README links to `help/README.md`.

## Pages

| Page                        | What it covers                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `README.md`                 | Contents, and where to start                                                                                             |
| `getting-started.md`        | Installing, the Welcome screen, the demo course, new projects and templates, saving, recovery after a crash              |
| `the-editor.md`             | A tour of the window: title bar, ribbon, Slides panel, stage and its toolbar, the right-hand panels, timeline            |
| `slides-and-scenes.md`      | Scenes, slides, the Overview, slide properties and backgrounds, masters, layouts and themes                              |
| `objects.md`                | Text, shapes, pictures, icons and illustrations, tables, groups; arranging and formatting; Find and Replace              |
| `states-and-layers.md`      | Object states, button sets, slide layers                                                                                 |
| `triggers-and-variables.md` | Triggers, conditions, variables, references in text, JavaScript                                                          |
| `timeline-and-animation.md` | The timeline, cue points, animations, motion paths, transitions, zoom regions                                            |
| `audio-and-video.md`        | Sound, video, recording narration, captions, text-to-speech, screen recording                                            |
| `interactive-objects.md`    | Buttons, hotspots, markers, sliders, dials, text entry, checkboxes, scrolling panels, web objects, 360° images, dragging |
| `quizzes.md`                | Question types, Form View, feedback, question banks, result slides                                                       |
| `the-player.md`             | The player frame, tabs, look and words, lightboxes, phones and tablets                                                   |
| `preview-and-publish.md`    | Preview; publishing for the web, SCORM 1.2 and 2004, xAPI, cmi5; video and handouts                                      |
| `accessibility.md`          | The accessibility checker, alt text, Tab order, what learners get                                                        |
| `translation.md`            | XLIFF and Word translation, right-to-left courses, the player's words by language                                        |
| `importing.md`              | PowerPoint and Storyline import, importing slides from another project, templates                                        |
| `settings-and-updates.md`   | Updates, notices, sending feedback                                                                                       |

## How it is checked

- **Every statement is taken from the app,** its briefs and its tests, never from memory. Command names are copied from the app's string catalogue (`apps/desktop/src/shared/strings`) and checked in a screenshot where possible.
- **Links:** a unit test (`help/help.test.ts`) checks that every link between pages and every image a page uses exists, and that every page is in the contents.
- **The screenshot script** runs as a Playwright test. If a control it uses is renamed, it fails, so the pictures cannot silently go stale.

## Not in this package

- **Help inside the app**, for example a Help menu entry that opens these pages. Luke chose the published folder.
- **Translating the help.**

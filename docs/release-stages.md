# Release stages

Luke, 2026-11-23: what is built now is **our first alpha**. Icons, branding and the like come in the beta.

## Alpha 1 (now)

**What it is:** everything in `docs/PLAN.md`, Phases 0 to 11, each phase reviewed, plus the release work done since:

- **R1:** our own LGPL ffmpeg on every system;
- **R2:** Help → Third-Party Notices…, and the source offer (`npm run collect:sources`);
- **R3:** Windows and macOS read H.264 and the like through their own decoders.

**How it is checked:**

- the full suites on Windows and Linux;
- the macOS VM;
- the unpacked, unsigned app built on each system, with the key end-to-end tests run against it (`logs/2026-11-23-session-108.md`).

**What it is not:**

- signed or notarised;
- tried by anyone but us;
- given its own icon or branding.

The app's version stayed `0.1.0` for alpha 1, which was not published.

## Alpha 2 (published 2026-11-24)

**What it is:** alpha 1, plus what Luke asked for while testing it:

- one title bar (B1);
- video playing in Preview and with the editor's timeline;
- Space to play;
- objects past the slide dimmed (B2).

**Where:**

- `v0.1.0-alpha.2`, a pre-release on GitHub, holding the unsigned Windows installer alone;
- `sources-0.1.0-alpha.2`, the third-party sources, beside it.

See `logs/2026-11-24-session-111.md`. No macOS or Linux package.

## Alpha 3 (published 2026-11-24)

**What it is:** alpha 2, plus:

- the 360° view fixed in a course opened from the disk (B3);
- the demo course, _The UK Space Industry in 2026_ (B4);
- importing Articulate Storyline courses, part A (B5).

**Where:**

- `v0.1.0-alpha.3`, a pre-release on GitHub at `81986ab`, holding the unsigned Windows installer alone;
- `sources-0.1.0-alpha.3`, the third-party sources (unchanged since alpha 2), beside it;
- both also in the **public** downloads repository, https://github.com/lpgeach/vedra-opus-releases (2026-11-24, `logs/2026-11-24-session-115.md`), the one to send people.

See `logs/2026-11-24-session-114.md`. No macOS or Linux package.

## Beta (to come)

**Look and name:**

- the app's icon, on every system, and in the installers;
- branding: the name's presentation, the Welcome screen, the About and notices pages, the installer art;
- a real maintainer contact in `apps/desktop/electron-builder.yml` (the deb package needs one).

**Release machinery:**

- CI on all three systems (from December 2026), with axe-core;
- the Linux release built on the oldest distribution we support, so its ffmpeg runs there;
- Apple Silicon builds of ffmpeg and `vo-decode`;
- signing and notarisation with real certificates (`docs/releasing.md`); a real update served from GitHub releases;
- each release carrying its third-party source (`npm run collect:sources`).

**Checks with real things (Luke):**

- a real Mac:
  - Safari playing our VP9 video;
  - the 200-slide project opening in under 3 s;
- PowerPoint decks from PowerPoint, phone videos, H.265 on Windows, the handout opened in Word;
- the NVDA and VoiceOver pass;
- SCORM Cloud, a real LRS and a real cmi5 LMS.

**Before a public release:** a lawyer's look at what `docs/licences.md` lists:

- Electron's bundled H.264/AAC playback;
- the claims on VP9;
- the Visual C++ runtime beside LibreOffice.

**Decisions waiting for Luke:**

- the default text colour on fills (session 81);
- the arrow keys in right-to-left courses (session 84);
- the product licence (plan §10, #7).

## Publishing a pre-release

When Luke wants the alpha or a beta in someone's hands:

1. Set the version, for example `0.1.0-alpha.1`. A prerelease version is offered only to the Beta update channel (P11.4).
2. Run `npm run collect:sources`.
3. Publish as `docs/releasing.md` says, marked as a pre-release on GitHub.

Publishing is outward-facing, so it is Luke's step.

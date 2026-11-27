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

## Alpha 4 (published 2026-11-25)

The first macOS version, for Intel and Apple Silicon, alongside Windows, built by hand (Windows here, both Macs in the macOS VM). See `logs/2026-11-25-session-116.md`, "Alpha 4".

## Alpha 5 (published 2026-11-27)

**What it is:** alpha 4, plus:

- the brand: the logo, the app icon and Outfit as the typeface (B18);
- the ribbon in seven tabs, its new commands, the two panels on the right and the stage toolbar (B17);
- closing on Windows straight after an edit no longer hangs;
- TipTap 3 and Electron 45.5.0;
- **the first Linux version** (AppImage and `.deb`).

**Built by CI**, the first release to be: run 45999894618 on the public `vedra-opus-source`, at `eb008a8`, tagged `v0.1.0-alpha.5`. Every installer passed its smoke test on its own system, the Apple Silicon one on an Apple Silicon Mac. Both Mac apps are signed ad hoc; none is signed or notarised.

**Where** (both on the public downloads repository, https://github.com/lpgeach/vedra-opus-releases, as pre-releases):

- `v0.1.0-alpha.5`:
  - the Windows installer, its `.blockmap` and `latest.yml`;
  - both `.dmg`s;
  - the AppImage, the `.deb` and `latest-linux.yml`.
- `sources-0.1.0-alpha.5`: the ten third-party source files.

**SHA-256:**

```
49a2a8acf7b1f7e5a1a24522ff4950d0d3622c8459141a82c47c9dffb7187a3d  Vedra-Opus-0.1.0-alpha.5-x64.exe
269b30870e5d30688b68acae9d6218e2d4e01142c8234e9e9ace4bdfa22bf52e  Vedra-Opus-0.1.0-alpha.5-arm64.dmg
d2776f644e1c3f32c5a6f2d5609cdb3368c73bcc272fee6c0155ee49b24433f0  Vedra-Opus-0.1.0-alpha.5-x64.dmg
dac1b2248cf9c030da829a771962fadc6b0fe0740317fa514eedb09e2f2398bc  Vedra-Opus-0.1.0-alpha.5-x86_64.AppImage
1235bfddcb1a6519ae59ba8e868e9c4234e35b3cc1123bfac4cee3fc26f77f22  Vedra-Opus-0.1.0-alpha.5-amd64.deb
```

Saved format 41, so projects saved in alpha 5 do not open in alpha 4. The `.deb` still names the placeholder maintainer (`electron-builder.yml`). See `logs/2026-11-27-session-118.md`.

## Alpha 6 (published 2026-11-27)

**What it is:** alpha 5, plus:

- the Transitions tab as a gallery (B27);
- the Animations tab as galleries (B28);
- help for every feature (B26), published in `help/` on the downloads repository.

**Built by CI:** run 46022488234 on the public `vedra-opus-source`, at `9934cc8`, tagged `v0.1.0-alpha.6`. Every job passed, each installer's smoke test included. None is signed with a developer certificate or notarised.

**Where** (both on https://github.com/lpgeach/vedra-opus-releases, as pre-releases):

- `v0.1.0-alpha.6`: the Windows installer, its `.blockmap` and `latest.yml`; both `.dmg`s; the AppImage, the `.deb` and `latest-linux.yml`.
- `sources-0.1.0-alpha.6`: the ten third-party source files.

**SHA-256:**

```
22935c381eed2cc41fd5faa82ec54b33d451e382abbad92ca0dcfa3afba29779  Vedra-Opus-0.1.0-alpha.6-x64.exe
ee09748cd74e05b3541a9b72a996efe09652df8c9d3e6f108471641953e6871f  Vedra-Opus-0.1.0-alpha.6-arm64.dmg
6bd5dec4915676df829d0a2eef1f10e5523b7aef5055255e9862609243225f55  Vedra-Opus-0.1.0-alpha.6-x64.dmg
d790e6aa9cb4d39c853276b4195b62445c2c159764b894483a97a3310a1002c9  Vedra-Opus-0.1.0-alpha.6-x86_64.AppImage
97c1be4925e0591b096928aab9beeb5b547826e6b1f116880a519b14a6d322fe  Vedra-Opus-0.1.0-alpha.6-amd64.deb
```

Saved format 41, as alpha 5, so each opens the other's projects. The `.deb` still names the placeholder maintainer (`electron-builder.yml`). See `logs/2026-11-27-session-119.md`.

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

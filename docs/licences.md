# Third-party files we ship, and what their licences ask of us

This is a working record for the project. It is not legal advice; check anything important with a lawyer before a public release.

**Where the notices are shown:** Help → Third-Party Notices… in the app lists everything below, with its licence text, and says where the source of ffmpeg and LibreOffice is (`docs/briefs/R2-notices-and-sources.md`).

**Libraries from npm:**

- The app bundles them into its own files and ships no `node_modules`, so their notices would not otherwise reach anyone. The build lists every package built into each bundle, with the text of its licence and notice files (`scripts/third-party-notices.mjs`, writing `third-party-notices.json` beside each bundle). The page shows them.
- A package that names its licence but carries no licence file (TipTap's packages) is shown with that licence's standard text, marked as such.
- **The course player's** libraries (Immer and Zod, both MIT) are in every published course's `THIRD-PARTY-NOTICES.txt`.
- electron-builder puts Electron's and Chromium's notices (`LICENSE.electron.txt`, `LICENSES.chromium.html`) in every package; the page shows the first and opens the second.

## LibreOffice (PowerPoint import, P11.1 part D)

- **What:** LibreOffice, trimmed to what drawing part of a presentation as a picture needs: its core, Impress and Draw, the OOXML import filters, charts, and the picture exporters.
  - It runs as a separate program, headless, with a throwaway profile; nothing is linked into Vedra Opus.
  - Used only when a PowerPoint deck is imported: each chart, SmartArt diagram, embedded object, or picture in a format courses do not show (EMF, WMF and the like) is put alone on a one-slide deck and drawn as a PNG.
- **Build:** LibreOffice 26.8.3 from The Document Foundation, for Linux x64 (the deb tarball) and Windows x64 (the MSI).
  - The downloads and their SHA-256 (as The Document Foundation publishes them) are pinned in `scripts/fetch-libreoffice.mjs`, which stores them again in `SOURCE.txt` beside the build.
  - macOS (session 102): the x64 and arm64 disk images, with The Document Foundation's checksums. The trimmed app is re-signed ad hoc, since removing files breaks its seal; a release signs it with the Developer ID when the app is packaged (`docs/releasing.md`). Only the x64 build was checked, in the headless macOS VM.
- **What is kept, and its size:** the script drops Writer, Calc, Math and Base, help, templates, galleries, extensions, other languages' files, Java and Python. It checks that nothing kept loads a library it dropped, and proves the result by drawing a small deck with a chart and SmartArt.

  | Platform    | Full build | Trimmed |
  | ----------- | ---------- | ------- |
  | Windows x64 | 1,605 MB   | 402 MB  |
  | Linux x64   | 731 MB     | 365 MB  |
  | macOS x64   | 1,450 MB   | 715 MB  |

  On Windows, the Visual C++ runtime the installer would put in Windows is copied beside the programs instead. The fonts LibreOffice's Windows installer would add are left out; Windows has its own. On Linux, its fonts are kept, and it uses the system's cairo, fontconfig, freetype, X11, NSS, D-Bus, GLib and CUPS libraries, which desktop Linux has.

- **Where it goes:**
  - development: `vendor/libreoffice/<os>-<arch>/`, which git ignores and `npm run fetch:libreoffice` fills;
  - installers: `resources/libreoffice/` (electron-builder `extraResources`, Linux and Windows).
- **Licence: Mozilla Public License 2.0** (with parts under other free licences, listed in its `NOTICE`, `LICENSE.html` and `CREDITS.fodt`, which travel with it).

### What the MPL asks, and how we meet it

| Obligation                           | How                                                                                                                                                                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ship the licence and notices with it | `LICENSE.html`, `license.txt` (Windows) or `LICENSE` (Linux), `NOTICE` and `CREDITS.fodt` stay in the folder, and installers carry the folder whole.                                                                                                                                  |
| Say where its source is              | `SOURCE.txt` names the release and The Document Foundation's source download for it, and each release of Vedra Opus carries the source archive (`npm run collect:sources`, `docs/releasing.md`). Removing files is not a change to the source; we change none of LibreOffice's files. |
| Do not say it is ours, and credit it | Help → Third-Party Notices… names it, with its `NOTICE`, and opens its `LICENSE.html`.                                                                                                                                                                                                |
| The Visual C++ runtime (Windows)     | Microsoft's runtime DLLs come inside LibreOffice's MSI, which redistributes them; we ship them as they are, beside LibreOffice's programs. Check Microsoft's redistribution terms for app-local copies before a public release.                                                       |

## ffmpeg (the media pipeline, P6.3)

- **What:** `ffmpeg` and `ffprobe` with their shared libraries (`libavcodec`, `libavformat`, `libavfilter`, `libavutil`, `libswresample`, `libswscale`, `libavdevice`).
  - They run as separate programs; nothing is linked into Vedra Opus.
  - Used to convert imported and recorded media to WebM (VP9, Opus) and MP3, and to make poster frames (PNG).
- **Build: our own, on every system** (Luke, 2026-11-23; `docs/briefs/R1-own-ffmpeg-builds.md`). `npm run fetch:ffmpeg` runs `scripts/build-ffmpeg.sh`: natively on macOS and Linux, and cross-compiled with mingw-w64 in WSL for Windows.
  - Sources, each pinned by SHA-256 in the script: ffmpeg 8.1.3, libvpx 1.15.2, Opus 1.5.2, LAME 3.100 and zlib 1.3.1 (nasm and pkgconf are only tools for the build).
  - Encoders for VP9, Opus, MP3 and PNG; decoders for the royalty-free formats only.
  - **No H.264, H.265 or AAC code**, and no other patented decoders (MPEG-4 Part 2, VC-1, WMV and the like).
  - Configured with `--disable-autodetect`: none of the system's codecs (VideoToolbox, AudioToolbox, Media Foundation) or anything else the build machine happens to have.
  - `SOURCE.txt` beside the programs names each source and its checksum.
  - Until session 105 the Windows and Linux builds were BtbN's prebuilt "lgpl-shared" ones, which held far more (OpenH264, an AAC encoder, the H.264 and AAC decoders, about 80 libraries in 170 MB). They are no longer used.
- **Where it goes:**
  - development: `vendor/ffmpeg/<os>-<arch>/`, which git ignores and `npm run fetch:ffmpeg` fills;
  - installers: `resources/ffmpeg/` (electron-builder `extraResources`, on all three systems).
- **Licence: LGPL version 2.1 or later** (no `--enable-gpl`, `--enable-nonfree` or `--enable-version3`). `LICENSE.txt` in that folder holds the text. Its parts: libvpx and Opus (BSD), LAME (LGPL), zlib (zlib licence).

### What the LGPL asks, and how we meet it

| Obligation                               | How                                                                                                                                                                                                                                                       |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ship the licence text with the binaries  | `LICENSE.txt` is copied next to them, and installers carry the folder whole.                                                                                                                                                                              |
| Make the corresponding source available  | The complete source is the archives `SOURCE.txt` names, and `scripts/build-ffmpeg.sh`, which builds them. `npm run collect:sources` gathers them for each release, which carries them for at least three years (`docs/releasing.md`); the app says where. |
| Let users replace the library            | ffmpeg is a separate program with shared libraries in its own folder; a user can swap them. Nothing in Vedra Opus checks their hashes at run time.                                                                                                        |
| Do not say ffmpeg is ours, and credit it | Help → Third-Party Notices… names it, with its `SOURCE.txt` and the LGPL text.                                                                                                                                                                            |

### Reading H.264 and AAC (decided by Luke, 2026-11-17 and 2026-11-23)

Patent licences cover decoding as well as encoding. Converting a camera's H.264/AAC file into WebM means reading it first, so whatever reads it is what needs the licence. Courses never contain H.264 or AAC either way: the pipeline's output is WebM and MP3.

- **Our ffmpeg: only royalty-free formats.** It has no patented decoders, so, as the free DaVinci Resolve does on Linux, Vedra Opus refuses **anything that needs a patent licence to decode** unless the operating system reads it (below) (Luke: "anything that requires a patent on linux should be refused").
  - **How:** an allow-list (`ROYALTY_FREE` in `main/media/normalise.ts`), so a format nobody listed is refused rather than let through.
  - **Video allowed:** VP8, VP9, AV1, Theora.
  - **Sound allowed:** Opus, Vorbis, FLAC, MP3 (its patents expired in 2017), PCM (WAV).
  - **Refused, among others:** H.264, H.265/HEVC, H.266, MPEG-2, MPEG-4 Part 2, ProRes, VC-1/WMV, AAC, Dolby Digital (AC-3, E-AC-3), DTS, Apple Lossless, AMR.
  - **What the author sees:** the import names the format and the system, and asks for the file to be converted first.
  - Set in `main/index.ts`, and tested with a tiny H.264/AAC file kept in `fixtures/media/`: refused on Linux, read by the system on Windows and macOS.
  - **Caveat:** a patent pool (Sisvel) claims patents on VP9 and AV1, although Google and AOMedia publish them as royalty-free. VP9 is also our output format, so it stays allowed. Ask a lawyer about this along with the rest.
- **Windows and macOS: the operating system's own decoders** (Luke, 2026-11-23; `docs/briefs/R3-os-decoders.md`). Media Foundation and AVFoundation come with licences from Microsoft and Apple.
  - `vo-decode`, our own small program beside ffmpeg, reads the file through them: C on Windows, Swift on macOS. It hands on the decoded picture (YUV4MPEG2) and sound (WAV), and our ffmpeg only encodes them, to WebM or MP3.
  - So Windows and macOS read H.264, H.265, AAC and whatever else the system itself reads. A format the system cannot read is refused, saying so. On Windows, H.265 needs Microsoft's HEVC extension, and a Windows "N" edition needs its Media Feature Pack.
  - The helper contains no codec of its own and links only the system's libraries.
  - **Linux** has no licensed decoder of its own and keeps refusing these formats.
- **Still open:** Electron's own bundled codecs. Chromium in Electron includes H.264/AAC decoding for playback in the editor and Preview. Have a lawyer confirm how that is covered before release.

## Icons and illustrations (P9.8)

Luke chose both sets (session 71). `scripts/build-library.mjs` downloads the pinned npm tarballs, checks their SHA-512, and turns the drawings into data in `apps/desktop/src/renderer/library/`. None of the packages' code is run or shipped. The notices are in `apps/desktop/resources/licences/`, which installers carry as `resources/licences/`.

- **Lucide** icons, `lucide-static` 1.77.0 (2,098 icons), https://lucide.dev.
  - **Licence: ISC.** It asks that the copyright notice and the permission notice go with copies. `lucide.txt` holds them; the app ships it, and the Insert dialog and Format panel name Lucide.
  - **Published courses (Luke, session 76):** a course that uses Lucide icons carries Lucide's whole notice, the Feather icons' MIT notice included, in `THIRD-PARTY-NOTICES.txt` beside `index.html`. SCORM manifests list it. Main reads the notices from `resources/licences/`, and `publishWeb` refuses to publish without one a course needs.
- **Open Doodles** by Pablo Stanley (33 drawings), https://www.opendoodles.com.
  - **Licence: CC0 1.0**, public domain; no notice is required, but we credit it in the dialog, in `open-doodles.txt`, and in a course's `THIRD-PARTY-NOTICES.txt` when it uses one.
  - They come from `react-open-doodles` 1.0.5, whose own code (MIT) is not shipped; its licence is kept in the same file.

## SCORM schema files (P5.2, P5.3)

- **What:** the SCORM 1.2 and SCORM 2004 (2nd and 4th edition) XML schema files written into LMS packages.
  - They are kept in `packages/publish/src/scorm12-schemas.ts` and `scorm2004-schemas.ts`, with their sources and SHA-256 hashes.
- **Source:** Rustici Software's schema bundles (scorm.com), licensed **CC BY 3.0**; the schemas are ADL's and IMS Global's, with their copyright notices kept inside them.
- **Asks:** credit (the header of each file, and the notices inside the schemas).
- **Not shipped:** the SCORM 2004 3rd edition's sequencing schemas. Their IMS notice requires anyone distributing them to register with IMS, and Luke decided not to (2026-11-17).

## The demo course (B4)

- **What:** `apps/desktop/resources/templates/The UK Space Industry in 2026.vedraopus`, a sample course shipped as a built-in template and opened from the Welcome screen and Help → Open Demo Course (`logs/2026-11-24-session-113.md`).
- **Its media:**
  - **Music:** "Floating Cities" and "Lightless Dawn" by Kevin MacLeod (incompetech.com), **CC BY 4.0**. Excerpts with fades.
  - **Pictures and video:** NASA, **public domain** (NASA's own media are not copyrighted unless noted; NASA asks not to be shown as endorsing). Videos credited to others in NASA's library, such as Rocket Lab's, were left out.
  - **Icons:** Lucide (above).
  - **Narration:** Windows text-to-speech (Microsoft Hazel), made in Vedra Opus.
- **Asks:** credit for the music.
  - The course's own Credits slide gives it, so the credit travels with any course published from it.
  - Help → Third-Party Notices… gives it for the copy the app ships ("Demo course media").
  - NASA's material needs no credit; both places give it anyway.

## Text-to-speech engines (P6.8): used, not shipped

- **espeak-ng** (Linux): GPL-3.0-or-later. Vedra Opus does not ship it. If the system has it installed, Vedra Opus runs it as a separate program, giving it text on standard input and reading back a WAV file. Nothing of espeak-ng is linked into or distributed with Vedra Opus, so its licence asks nothing of us. The sounds it makes belong to the author.
- **macOS `say`** and **Windows SAPI** are parts of the operating systems, used through their own command-line tools (not tested until December).
- Cloud voices and bundled engines (such as Piper) are not used; adding one is Luke's decision (docs/briefs/P6.8-text-to-speech.md).

## Outfit, the brand typeface (B18)

- **What:** Outfit, © 2021 The Outfit Project Authors (github.com/Outfitio/Outfit-Fonts), **SIL Open Font License 1.1**, as the variable font from the npm package `@fontsource-variable/outfit`. The app's whole interface is set in it.
- **How it ships:** built into the renderer like the other npm packages, so the build's third-party notices list it with its licence (above).
- **The logos** in `brand/` have "Vedra Opus" in Outfit, turned into outlines. The licence covers the font software, not what is made with it, so the outlines need nothing more.
- **Asks:** keep its licence with the font, and do not sell the font on its own. Its name may not be used for a changed version of the font; we use it unchanged.

# R1 Our own ffmpeg on every system

**Not a plan package:** release work, asked for by Luke after the plan was built (2026-11-23). It comes before R2 (third-party notices and the source offer), which it makes simple.

## Decisions (Luke, 2026-11-23)

- **Our own minimal LGPL ffmpeg for Linux and Windows too,** built from the same pinned sources as the macOS one (session 103), replacing BtbN's prebuilt builds. BtbN's builds statically link about 80 libraries, several of them LGPL, so their complete source would be several GB a release; ours is a handful of archives. It also removes the H.264 and AAC code, as `docs/licences.md` recommended before a public release.
- **Windows refuses H.264, AAC and the other patented formats, as Linux and macOS do,** until a later helper reads them through Windows' own licensed decoders (Media Foundation). The message names the system and says to convert to WebM, MP3, WAV, Opus or FLAC first.

## The build

`scripts/build-ffmpeg.sh <mac|linux|win> <output folder>` replaces `build-ffmpeg-macos.sh`. One list of pinned sources, each checked against its SHA-256 before it is unpacked:

- ffmpeg 8.1.3; libvpx 1.15.2 (VP9); Opus 1.5.2; LAME 3.100 (MP3); zlib 1.3.1 (PNG, for posters);
- nasm 2.16.03 and pkgconf 2.3.0, built first as tools for the build machine.

**ffmpeg is configured** with:

- `--disable-autodetect`, so nothing on the build machine is picked up: no system codecs (VideoToolbox, Media Foundation), no X11, SDL or VA-API;
- the libraries above enabled by name;
- no AAC encoder, and the patented decoders off (H.264, H.265, AAC, MPEG-4 Part 2, VC-1, WMV);
- shared, LGPL 2.1 or later (no `--enable-gpl`, `--enable-nonfree` or `--enable-version3`).

**Per system:**

- **mac:** native (Intel or Apple Silicon), libraries found through `@rpath` beside the programs.
- **linux:** native, libraries found through `$ORIGIN/../lib`. The result needs the build machine's glibc or newer, so a release is built on the oldest Linux it supports (the CI runner, from December). Development builds in WSL are fine.
- **win:** cross-compiled on Linux (WSL here) with mingw-w64. The DLLs sit beside the programs. The win32 thread model and a static libgcc mean they load only Windows' own DLLs and each other.

**Output, the same layout as before:** `bin/` (`ffmpeg`, `ffprobe`, and the DLLs on Windows), `lib/` (Linux and macOS), `LICENSE.txt` (the LGPL 2.1), and `SOURCE.txt` (each source's URL and SHA-256).

**Self-check:** the script encodes VP9 with Opus, MP3 and PNG with the result, and lists the decoders to prove H.264 and AAC are absent. For the Windows build, the check runs the .exe through Windows from WSL when it can (WSL interop), and is skipped elsewhere.

**`npm run fetch:ffmpeg`** runs the script for this system. On Windows it runs it through WSL, which needs `build-essential` and `mingw-w64` installed there (`docs/development.md`). `VEDRAOPUS_FFMPEG_SOURCES` still points it at sources already downloaded.

## The app

- `refusePatented` is on for every system. The refusal message names Windows, macOS or Linux.
- Nothing else changes: the pipeline already makes only VP9, Opus, MP3 and PNG.

## Tests

- **The media tests** make their samples in royalty-free formats everywhere.
- **The H.264 refusal** is tested with a tiny H.264/AAC file kept in `fixtures/media/`, made once with BtbN's build before it is retired (no encoder of ours can make one). It is refused on every system.
- **The script's own checks** (above) run on Linux, Windows (cross-built) and macOS.
- **The full checks** (unit, e2e, player, video export) pass on Windows and in WSL with the new builds; macOS is checked in the VM.

## Done when

- `npm run fetch:ffmpeg` builds and self-checks our ffmpeg on Linux (WSL), Windows (through WSL) and macOS (VM).
- Neither build has an H.264, H.265 or AAC encoder or decoder, and the Windows DLLs import only Windows' DLLs and each other.
- H.264/AAC is refused on Windows with the Windows message (unit and integration tests).
- The full checks pass on Windows and Linux, and the media, video and speech tests pass on macOS.
- `docs/licences.md`, the P6.3 brief, `docs/development.md` and `docs/HANDOVER.md` describe our builds and Windows' refusal.

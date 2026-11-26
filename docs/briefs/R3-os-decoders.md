# R3 Reading H.264 and the like through Windows' and macOS's own decoders

**Not a plan package:** release work Luke asked for (2026-11-23), after R1 made our ffmpeg free of patented codecs and so made Windows refuse H.264 too.

## Decision (Luke, 2026-11-23)

Build the helpers, so Windows and macOS accept H.264, H.265, AAC and the other formats their own licensed decoders read. Linux keeps refusing, since it has no such decoder. This is what `docs/licences.md` planned on 2026-11-17: the operating system decodes, under Microsoft's and Apple's licences, and our ffmpeg only encodes WebM and MP3.

## The helper: `vo-decode`

Our own small program, one per system, built and shipped beside ffmpeg in `bin/`:

- **Windows:** C, using Media Foundation's source reader (`apps/desktop/native/decoder/windows/decoder.c`), cross-compiled with mingw-w64 in WSL like our ffmpeg.
- **macOS:** Swift, using AVFoundation's asset reader (`apps/desktop/native/decoder/macos/main.swift`), compiled with the Command Line Tools' `swiftc`.

**Three commands, the same on both:**

- **`vo-decode info <file>`** prints one line of JSON: the duration, the picture (display size cropped to even, frame rate, rotation) if the system can decode it, the sound (sample rate, channels) if it can, and which present tracks it cannot read.
- **`vo-decode audio <file> <out.wav>`** writes the sound as 16-bit PCM WAV.
- **`vo-decode video <file>`** writes the picture to standard output as YUV4MPEG2, 4:2:0, at a constant frame rate:
  - each frame time shows the latest frame decoded by then, so variable-rate phone video keeps its timing;
  - odd sizes are cropped to even.

**Built by `scripts/build-decoder.sh <mac|win> <bin folder>`:**

- `npm run fetch:ffmpeg` runs it after building ffmpeg, or on its own when ffmpeg is there and the helper is not.
- On Windows the result must import only Windows' own DLLs (Media Foundation's among them).

## In the app

`findMediaTools` finds the helper beside ffmpeg (Windows and macOS only). When a file needs a patent licence to decode and the helper is there, the pipeline goes through it:

1. `info`; if the system cannot read a track the file has, the file is refused, saying the system could not read it.
2. The sound, if any, to a WAV in the work folder.
3. Video: `vo-decode video` piped into ffmpeg (`-f yuv4mpegpipe -i pipe:0`, with the WAV as a second input), encoded as WebM (VP9, Opus) as any other video, and turned upright by the rotation. Sound alone: the WAV to MP3.
4. Progress, the poster frame (taken from the WebM), probing and storing as before.

Linux, or a system without the helper, refuses as now. The pipeline, PowerPoint's media (P11.1 part C) and recordings all use the same path.

## Tests

- **Unit:**
  - `info`'s JSON read;
  - the rotation filters;
  - the choice between ffmpeg alone, the helper, and refusing.
- **Integration (`media.test.ts`), on Windows and macOS with the helper:**
  - `fixtures/media/h264-aac.mp4` becomes a VP9/Opus WebM of 64 × 36 and about half a second, with a poster;
  - the same file marked as turned 90° (remuxed by our ffmpeg, which copies without decoding) comes out 36 × 64.
  - On Linux it is still refused.
- **e2e:** Insert → Video… with the H.264 file imports it on Windows and macOS and refuses it on Linux.
- **The helper's own check:** the build runs `info` and `video` on the fixture where it can, and checks the Windows build's imports.

## Done when

The tests pass on Windows (here) and macOS (the VM), Linux still refuses, the full checks pass on Windows and Linux, and `docs/licences.md` says Windows and macOS read these formats through their own decoders.

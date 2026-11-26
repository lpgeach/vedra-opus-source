# Media fixtures

- **`h264-aac.mp4`** (4.5 KB): half a second of ffmpeg's test pattern and a 440 Hz tone, 64 × 36, H.264 video and AAC sound in an mp4.
  - Made on 2026-11-23 with BtbN's prebuilt ffmpeg (`libopenh264`, `aac`), just before our own builds replaced it (`docs/briefs/R1-own-ffmpeg-builds.md`). Our builds have no H.264 or AAC encoder, so they cannot make another.
  - The tests use it to prove that a file in a patented format is refused, with a message saying how to bring it in, on every system.

Every other media file the tests use is made when needed (`fixtures/make-media.ts`, and ffmpeg's `lavfi` sources in the tests).

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  openSync,
  closeSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { importAsset, MediaConversionError, storeRecording } from '../project/assets';
import { findMediaTools, parseProbe, probe, progressSeconds, vendorFolder } from './ffmpeg';
import type { Probe } from './ffmpeg';
import { PatentedFormatError, planFor, posterTime } from './normalise';

describe('reading ffprobe and ffmpeg', () => {
  it('describes a file by its container, length, picture and sound', () => {
    const probe = parseProbe(
      JSON.stringify({
        format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '3.000000' },
        streams: [
          { codec_type: 'video', codec_name: 'h264', width: 320, height: 180 },
          { codec_type: 'audio', codec_name: 'aac' },
        ],
      }),
    );
    expect(probe).toEqual({
      container: 'mov,mp4,m4a,3gp,3g2,mj2',
      duration: 3,
      video: { codec: 'h264', width: 320, height: 180 },
      audio: { codec: 'aac' },
    });
  });

  it('does not take an MP3’s cover art for video, and knows when a length is missing', () => {
    const mp3 = parseProbe(
      JSON.stringify({
        format: { format_name: 'mp3' },
        streams: [
          { codec_type: 'audio', codec_name: 'mp3' },
          { codec_type: 'video', codec_name: 'png', disposition: { attached_pic: 1 } },
        ],
      }),
    );
    expect(mp3).toMatchObject({ video: null, audio: { codec: 'mp3' }, duration: null });
    expect(() => parseProbe('{}')).toThrow('not a media file');
  });

  it('reads how far a conversion is', () => {
    expect(progressSeconds('out_time_us=1500000')).toBe(1.5);
    expect(progressSeconds('frame=12')).toBeNull();
  });
});

describe('what the pipeline does with each kind of file', () => {
  const file = (container: string, video: string | null, audio: string | null): Probe => ({
    container,
    duration: 2,
    video: video ? { codec: video, width: 320, height: 180 } : null,
    audio: audio ? { codec: audio } : null,
  });

  it('keeps MP3, turns other sound into MP3, and refuses a file with neither sound nor picture', () => {
    expect(planFor(file('mp3', null, 'mp3'))).toEqual({ action: 'keep' });
    for (const [container, codec] of [
      ['wav', 'pcm_s16le'],
      ['mov,mp4,m4a,3gp,3g2,mj2', 'aac'],
      ['ogg', 'vorbis'],
      ['matroska,webm', 'opus'],
    ] as const) {
      expect(planFor(file(container, null, codec))).toMatchObject({
        action: 'convert',
        kind: 'audio',
        ext: 'mp3',
      });
    }
    expect(() => planFor(file('data', null, null))).toThrow('no sound or picture');
  });

  it('remuxes WebM that is already VP8 or VP9, and converts any other video to VP9 and Opus', () => {
    expect(planFor(file('matroska,webm', 'vp9', 'opus'))).toMatchObject({
      action: 'remux',
      ext: 'webm',
    });
    expect(planFor(file('matroska,webm', 'vp8', null))).toMatchObject({ action: 'remux' });
    const mp4 = planFor(file('mov,mp4,m4a,3gp,3g2,mj2', 'h264', 'aac'));
    expect(mp4).toMatchObject({
      action: 'convert',
      kind: 'video',
      ext: 'webm',
      mimeType: 'video/webm',
    });
    expect(mp4.action === 'convert' && mp4.args).toEqual(
      expect.arrayContaining(['libvpx-vp9', 'libopus']),
    );
    // WebM whose sound is not WebM's: converted, not copied into a file browsers cannot play.
    expect(planFor(file('matroska,webm', 'vp9', 'aac'))).toMatchObject({ action: 'convert' });
    expect(planFor(file('matroska,webm', 'h264', 'opus'))).toMatchObject({ action: 'convert' });
  });

  it('reads only royalty-free formats, as the app does everywhere, and names whatever it refuses', () => {
    const refuse = { refusePatented: true };
    const mp4 = 'mov,mp4,m4a,3gp,3g2,mj2';
    // Anything that needs a patent licence, the well-known and the unknown.
    for (const [video, audio, named] of [
      ['h264', 'opus', 'uses H.264'],
      ['hevc', null, 'uses H.265 (HEVC)'],
      ['mpeg4', null, 'uses MPEG-4 Part 2'],
      ['prores', null, 'uses ProRes'],
      [null, 'aac', 'uses AAC'],
      [null, 'ac3', 'uses Dolby Digital (AC-3)'],
      [null, 'alac', 'uses Apple Lossless'],
      ['h264', 'aac', 'uses H.264 and AAC'],
      ['somenewcodec', null, 'uses SOMENEWCODEC'],
    ] as const) {
      expect(() => planFor(file(mp4, video, audio), refuse)).toThrow(named);
      expect(() => planFor(file(mp4, video, audio), refuse)).toThrow(PatentedFormatError);
    }
    // The royalty-free ones come in, converted where they need to be.
    for (const video of ['vp8', 'vp9', 'av1', 'theora']) {
      expect(planFor(file(mp4, video, 'opus'), refuse)).toMatchObject({ ext: 'webm' });
    }
    for (const audio of ['opus', 'vorbis', 'flac', 'pcm_s16le', 'pcm_f32le']) {
      expect(planFor(file('wav', null, audio), refuse)).toMatchObject({ ext: 'mp3' });
    }
    expect(planFor(file('mp3', null, 'mp3'), refuse)).toEqual({ action: 'keep' });
    // Without the option (an ffmpeg that could read them), the others would be converted.
    expect(planFor(file(mp4, 'h264', 'aac'))).toMatchObject({ action: 'convert' });
  });

  it('takes the poster a second in, or a tenth of the way through a short video', () => {
    expect(posterTime(30)).toBe(1);
    expect(posterTime(4)).toBeCloseTo(0.4);
    expect(posterTime(null)).toBe(0);
  });
});

// ---------------------------------------------------------------- with ffmpeg

const tools = findMediaTools([
  process.env['VEDRAOPUS_FFMPEG_DIR'],
  vendorFolder(resolve(import.meta.dirname, '../../../../..')),
]);
describe('the bundled ffmpeg', () => {
  it('is there (npm run fetch:ffmpeg)', () => {
    expect(tools, 'ffmpeg missing: run npm run fetch:ffmpeg').not.toBeNull();
  });
});

describe.skipIf(!tools)('the media pipeline, with the real ffmpeg', () => {
  const temp = mkdtempSync(join(tmpdir(), 'vedraopus-media-test-'));
  afterAll(() => rmSync(temp, { recursive: true, force: true }));
  const media = () => ({ tools: tools! });

  /** Make a test file with ffmpeg's own sources; `toPipe` writes it as a stream (no seek index, no length). */
  const make = (name: string, args: string[], toPipe = false): string => {
    const path = join(temp, name);
    if (toPipe) {
      const fd = openSync(path, 'w');
      const run = spawnSync(
        tools!.ffmpeg,
        ['-hide_banner', '-loglevel', 'error', ...args, 'pipe:1'],
        { stdio: ['ignore', fd, 'inherit'] },
      );
      closeSync(fd);
      expect(run.status).toBe(0);
    } else {
      const run = spawnSync(
        tools!.ffmpeg,
        ['-hide_banner', '-loglevel', 'error', '-y', ...args, path],
        { stdio: 'inherit' },
      );
      expect(run.status).toBe(0);
    }
    return path;
  };
  const tone = ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=2'];
  const picture = ['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=2'];
  const assets = (workspace: string) => readdirSync(join(workspace, 'assets'));

  it('turns a WAV into an MP3 with its length, named after the original', async () => {
    const wav = make('narration.wav', tone);
    const workspace = join(temp, 'ws-wav');
    const imported = await importAsset(workspace, wav, media());
    expect(imported.meta).toMatchObject({
      kind: 'audio',
      fileName: 'narration.mp3',
      ext: 'mp3',
      mimeType: 'audio/mpeg',
    });
    expect(imported.meta.duration).toBeCloseTo(2, 1);
    expect(assets(workspace)).toEqual([`${imported.hash}.mp3`]);
    // Nothing left over from the work.
    expect(readdirSync(workspace).sort()).toEqual(['assets']);
  });

  it('keeps an MP3 exactly as it was', async () => {
    const mp3 = make('song.mp3', [...tone, '-c:a', 'libmp3lame']);
    const imported = await importAsset(join(temp, 'ws-mp3'), mp3, media());
    expect(imported.meta.fileName).toBe('song.mp3');
    expect(imported.hash).toBe(createHash('sha256').update(readFileSync(mp3)).digest('hex'));
  });

  it('converts an mp4 to VP9 and Opus WebM, with its picture size and a poster frame', async () => {
    // Our ffmpeg has no H.264 or AAC encoder, so the sample is an mp4 in VP9 and Opus.
    const mp4 = make('film.mp4', [...picture, ...tone, '-c:v', 'libvpx-vp9', '-c:a', 'libopus']);
    const workspace = join(temp, 'ws-mp4');
    const imported = await importAsset(workspace, mp4, media());
    expect(imported.meta).toMatchObject({
      kind: 'video',
      fileName: 'film.webm',
      ext: 'webm',
      mimeType: 'video/webm',
      width: 320,
      height: 180,
    });
    expect(imported.meta.duration).toBeCloseTo(2, 0);
    const stored = await probe(tools!, join(workspace, 'assets', `${imported.hash}.webm`));
    expect(stored).toMatchObject({ video: { codec: 'vp9' }, audio: { codec: 'opus' } });
    expect(imported.poster?.meta).toMatchObject({
      kind: 'image',
      fileName: 'film poster.png',
      ext: 'png',
      width: 320,
      height: 180,
    });
    expect(assets(workspace)).toContain(`${imported.poster!.hash}.png`);
  });

  it('gives a recorded WebM (no seek index, no length) both, without converting it', async () => {
    const recorded = make(
      'take.webm',
      [...picture, ...tone, '-c:v', 'libvpx', '-c:a', 'libopus', '-f', 'webm'],
      true,
    );
    expect((await probe(tools!, recorded)).duration).toBeNull();
    const imported = await importAsset(join(temp, 'ws-webm'), recorded, media());
    expect(imported.meta).toMatchObject({ kind: 'video', ext: 'webm', fileName: 'take.webm' });
    expect(imported.meta.duration).toBeCloseTo(2, 0);
    const stored = await probe(tools!, join(temp, 'ws-webm', 'assets', `${imported.hash}.webm`));
    expect(stored.video?.codec).toBe('vp8');
  });

  it('stores a narration recording as MP3', async () => {
    const take = make('voice.webm', [...tone, '-c:a', 'libopus', '-f', 'webm'], true);
    const recording = await storeRecording(
      join(temp, 'ws-rec'),
      readFileSync(take),
      new Date(2026, 10, 17, 9, 30, 0),
      media(),
    );
    expect(recording.meta).toMatchObject({
      kind: 'audio',
      fileName: 'Recording 09:30:00.mp3',
      ext: 'mp3',
    });
    expect(recording.meta.duration).toBeCloseTo(2, 0);
  });

  it('stores a screen recording as a WebM video with a poster, as MediaRecorder writes it (P9.11)', async () => {
    // Streamed, as MediaRecorder writes: no length, no seek index.
    const take = make('screen.webm', [...picture, '-c:v', 'libvpx', '-f', 'webm'], true);
    const recording = await storeRecording(
      join(temp, 'ws-screen'),
      readFileSync(take),
      new Date(2026, 10, 20, 18, 5, 9),
      media(),
      'video',
    );
    expect(recording.meta).toMatchObject({
      kind: 'video',
      fileName: 'Screen recording 18:05:09.webm',
      ext: 'webm',
    });
    expect(recording.meta.duration).toBeCloseTo(2, 0);
    expect(recording.poster?.meta.kind).toBe('image');
  });

  // Our ffmpeg cannot make one, so a tiny one is kept (fixtures/media/README.md).
  const h264Fixture = resolve(import.meta.dirname, '../../../../../fixtures/media/h264-aac.mp4');

  it('without the system’s decoders, refuses an H.264/AAC mp4 with what to do, naming this system, and converts an mp4 in royalty-free formats', async () => {
    const h264 = join(temp, 'camera.mp4');
    writeFileSync(h264, readFileSync(h264Fixture));
    const workspace = join(temp, 'ws-refuse');
    // As on Linux, or wherever vo-decode is missing.
    const { decoder: _decoder, ...ffmpegOnly } = tools!;
    const options = { tools: ffmpegOnly, refusePatented: true };
    const system = { win32: 'Windows', darwin: 'macOS' }[process.platform as string] ?? 'Linux';
    await expect(importAsset(workspace, h264, options)).rejects.toThrow(
      `"camera.mp4" uses H.264 and AAC, which needs a patent licence, so Vedra Opus cannot import it on ${system}. Convert it to WebM`,
    );
    const vp9 = make('clip.mp4', [...picture, ...tone, '-c:v', 'libvpx-vp9', '-c:a', 'libopus']);
    const imported = await importAsset(workspace, vp9, options);
    expect(imported.meta).toMatchObject({ kind: 'video', fileName: 'clip.webm', ext: 'webm' });
    expect(imported.poster).toBeDefined();
  });

  /** One frame as raw RGB, for comparing pictures. */
  const frame = (file: string, width: number, height: number) => {
    const run = spawnSync(tools!.ffmpeg, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      file,
      '-frames:v',
      '1',
      '-vf',
      `scale=${width}:${height}`,
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      'pipe:1',
    ]);
    expect(run.status).toBe(0);
    return run.stdout;
  };
  const difference = (a: Buffer, b: Buffer) =>
    a.reduce((sum, value, i) => sum + Math.abs(value - b[i]!), 0) / a.length;

  it.runIf(process.platform === 'win32' || process.platform === 'darwin')(
    'with the system’s decoders, an H.264/AAC mp4 comes in as VP9 and Opus WebM, turned upright (R3)',
    async () => {
      expect(tools!.decoder, 'vo-decode missing: run npm run fetch:ffmpeg').toBeDefined();
      const options = { tools: tools!, refusePatented: true };
      const h264 = join(temp, 'phone.mp4');
      writeFileSync(h264, readFileSync(h264Fixture));
      const workspace = join(temp, 'ws-system');
      const imported = await importAsset(workspace, h264, options);
      expect(imported.meta).toMatchObject({
        kind: 'video',
        fileName: 'phone.webm',
        ext: 'webm',
        mimeType: 'video/webm',
        width: 64,
        height: 36,
      });
      expect(imported.meta.duration).toBeCloseTo(0.5, 1);
      const stored = join(workspace, 'assets', `${imported.hash}.webm`);
      expect(await probe(tools!, stored)).toMatchObject({
        video: { codec: 'vp9' },
        audio: { codec: 'opus' },
      });
      expect(imported.poster?.meta.kind).toBe('image');

      // Marked as turned (a copy of the stream, which needs no decoder): it comes in upright,
      // as ffmpeg itself shows the same picture in VP9 with the same mark.
      const turned = make('turned.mp4', ['-display_rotation:v:0', '90', '-i', h264, '-c', 'copy']);
      const upright = await importAsset(join(temp, 'ws-turned'), turned, options);
      expect(upright.meta).toMatchObject({ width: 36, height: 64 });
      const plain = make('plain-vp9.mp4', [
        '-f',
        'lavfi',
        '-i',
        'testsrc=size=64x36:rate=10:duration=0.5',
        '-c:v',
        'libvpx-vp9',
      ]);
      const reference = make('turned-vp9.mp4', [
        '-display_rotation:v:0',
        '90',
        '-i',
        plain,
        '-c',
        'copy',
      ]);
      const ours = frame(join(temp, 'ws-turned', 'assets', `${upright.hash}.webm`), 36, 64);
      expect(difference(ours, frame(reference, 36, 64))).toBeLessThan(20);
      // And not turned the other way.
      const other = make('other-vp9.mp4', [
        '-display_rotation:v:0',
        '270',
        '-i',
        plain,
        '-c',
        'copy',
      ]);
      expect(difference(ours, frame(other, 36, 64))).toBeGreaterThan(40);
    },
  );

  it('refuses a file ffmpeg cannot read, saying so', async () => {
    const junk = join(temp, 'broken.mp3');
    writeFileSync(junk, 'not a sound at all');
    await expect(importAsset(join(temp, 'ws-junk'), junk, media())).rejects.toBeInstanceOf(
      MediaConversionError,
    );
    await expect(importAsset(join(temp, 'ws-junk'), junk, media())).rejects.toThrow(
      '"broken.mp3" could not be converted',
    );
  });
});

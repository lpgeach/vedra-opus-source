/**
 * Media files for tests, made when needed rather than kept in the repository.
 *
 * `makeWebm` records a few seconds of a canvas animation with a tone in
 * Chromium (VP8 video, Opus sound), the same way the browser records anything.
 * Such files carry no duration, which is also a case the editor must handle.
 */
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A mono 16-bit WAV of a quiet 440 Hz tone, `seconds` long. */
export function wav(seconds: number, rate = 8000): Buffer {
  const samples = Math.round(seconds * rate);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 6000), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'latin1');
  header.write('fmt ', 12, 'latin1');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'latin1');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/**
 * A 320×180 WebM, `seconds` long: each second a different colour with its
 * number, and a tone. Made once per test run and kept in the run's temporary
 * folder.
 */
export async function makeWebm(seconds = 4): Promise<Buffer> {
  const cached = join(tmpdir(), `vedraopus-test-video-${seconds}s.webm`);
  if (existsSync(cached)) return readFileSync(cached);
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage();
    const base64 = await page.evaluate(async (length) => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 180;
      const draw = canvas.getContext('2d')!;
      const colours = ['#c0392b', '#27ae60', '#2980b9', '#8e44ad', '#d35400', '#16a085'];
      const audio = new AudioContext();
      const tone = audio.createOscillator();
      tone.frequency.value = 440;
      const gain = audio.createGain();
      gain.gain.value = 0.2;
      const out = audio.createMediaStreamDestination();
      tone.connect(gain).connect(out);
      tone.start();
      const stream = new MediaStream([
        ...canvas.captureStream(30).getVideoTracks(),
        ...out.stream.getAudioTracks(),
      ]);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => chunks.push(event.data);
      const started = performance.now();
      const frame = () => {
        const second = Math.floor((performance.now() - started) / 1000);
        draw.fillStyle = colours[second % colours.length]!;
        draw.fillRect(0, 0, 320, 180);
        draw.fillStyle = '#fff';
        draw.font = '96px sans-serif';
        draw.fillText(String(second), 130, 125);
        if (recorder.state === 'recording') requestAnimationFrame(frame);
      };
      recorder.start(250);
      frame();
      await new Promise((done) => setTimeout(done, length * 1000));
      const stopped = new Promise((done) => (recorder.onstop = done));
      recorder.stop();
      await stopped;
      const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
      let text = '';
      for (const byte of bytes) text += String.fromCharCode(byte);
      return btoa(text);
    }, seconds);
    const bytes = Buffer.from(base64, 'base64');
    writeFileSync(cached, bytes);
    return bytes;
  } finally {
    await browser.close();
  }
}

/**
 * The vendor ffmpeg (npm run fetch:ffmpeg), for tests that need a file as the
 * media pipeline leaves it. Throws, saying what to do, when it is missing.
 */
export function vendorFfmpeg(): string {
  const os =
    { linux: 'linux', win32: 'win', darwin: 'mac' }[process.platform as string] ?? process.platform;
  const exe = process.platform === 'win32' ? '.exe' : '';
  const path = join(
    import.meta.dirname,
    '..',
    'vendor',
    'ffmpeg',
    `${os}-${process.arch}`,
    'bin',
    `ffmpeg${exe}`,
  );
  if (!existsSync(path)) throw new Error(`No ffmpeg at ${path}: run npm run fetch:ffmpeg`);
  return path;
}

/** `makeWebm`'s file as the media pipeline leaves a WebM: remuxed, with a seek index and a length. */
export async function makeSeekableWebm(seconds = 4): Promise<Buffer> {
  const cached = join(tmpdir(), `vedraopus-test-video-${seconds}s-seekable.webm`);
  if (existsSync(cached)) return readFileSync(cached);
  const raw = join(tmpdir(), `vedraopus-test-video-${seconds}s-raw.webm`);
  writeFileSync(raw, await makeWebm(seconds));
  const run = spawnSync(
    vendorFfmpeg(),
    ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-c', 'copy', cached],
    {
      stdio: 'inherit',
    },
  );
  if (run.status !== 0) throw new Error('ffmpeg could not remux the test video');
  return readFileSync(cached);
}

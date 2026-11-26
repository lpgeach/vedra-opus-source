import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { findMediaTools, vendorFolder } from '../media/ffmpeg';
import { makeSpeech, speechFileName } from './make';
import {
  espeakProvider,
  findSpeechProvider,
  onPath,
  parseEspeakVoices,
  parseSapiVoices,
  parseSayVoices,
  run,
  sapiProvider,
  sapiRate,
  sayProvider,
  wordsPerMinute,
} from './providers';
import type { Run } from './providers';

/** A stand-in for running programs: records each call and answers with `reply`. */
function recorder(reply = '') {
  const calls: { command: string; args: readonly string[]; input: string | undefined }[] = [];
  const runner: Run = (command, args, input) => {
    calls.push({ command, args, input });
    return Promise.resolve(reply);
  };
  return { calls, runner };
}

describe('voice lists', () => {
  it('reads espeak-ng’s table: the language is the id, underscores are spaces', () => {
    const output = `Pty Language       Age/Gender VoiceName          File                 Other Languages
 2  en-gb           --/M      English_(Great_Britain) gmw/en               (en 2)
 5  fr-fr           --/M      French             roa/fr               (fr 5)
`;
    expect(parseEspeakVoices(output)).toEqual([
      { id: 'espeak-ng:en-gb', name: 'English (Great Britain)', language: 'en-gb' },
      { id: 'espeak-ng:fr-fr', name: 'French', language: 'fr-fr' },
    ]);
  });

  it('reads say’s list, names with spaces included', () => {
    const output = `Alex                en_US    # Most people recognize me by my voice.
Bad News            en_US    # The light you see at the end of the tunnel.
Amélie              fr_CA    # Bonjour, je m’appelle Amélie.
`;
    expect(parseSayVoices(output).map((voice) => [voice.id, voice.language])).toEqual([
      ['say:Alex', 'en_US'],
      ['say:Bad News', 'en_US'],
      ['say:Amélie', 'fr_CA'],
    ]);
  });

  it('reads the SAPI script’s name and culture per line', () => {
    expect(
      parseSapiVoices('Microsoft Hazel Desktop\ten-GB\r\nMicrosoft Zira Desktop\ten-US\r\n'),
    ).toEqual([
      { id: 'sapi:Microsoft Hazel Desktop', name: 'Microsoft Hazel Desktop', language: 'en-GB' },
      { id: 'sapi:Microsoft Zira Desktop', name: 'Microsoft Zira Desktop', language: 'en-US' },
    ]);
  });
});

describe('speaking', () => {
  it('maps the speed: 175 words a minute at 1, and SAPI’s −10 to 10', () => {
    expect(wordsPerMinute(1)).toBe(175);
    // 175 × 1.5 = 262.5, rounded.
    expect(wordsPerMinute(1.5)).toBe(263);
    expect(sapiRate(1)).toBe(0);
    // (0.5 − 1) × 10 = −5; (2 − 1) × 10 = 10.
    expect(sapiRate(0.5)).toBe(-5);
    expect(sapiRate(2)).toBe(10);
  });

  it('gives each engine the text on standard input, never as an argument', async () => {
    const text = '-v nonsense; rm -rf /';
    const espeak = recorder();
    await espeakProvider('/usr/bin/espeak-ng', espeak.runner).speak(
      text,
      'espeak-ng:en-gb',
      1.2,
      '/t/a.wav',
    );
    expect(espeak.calls).toEqual([
      {
        command: '/usr/bin/espeak-ng',
        // 175 × 1.2 = 210 words a minute.
        args: ['--stdin', '-v', 'en-gb', '-s', '210', '-w', '/t/a.wav'],
        input: text,
      },
    ]);
    const say = recorder();
    await sayProvider(say.runner).speak(text, 'say:Bad News', 1, '/t/b.wav');
    expect(say.calls[0]!.args).toContain('Bad News');
    expect(say.calls[0]!.args.slice(-2)).toEqual(['-f', '-']);
    expect(say.calls[0]!.input).toBe(text);
    const sapi = recorder();
    await sapiProvider(sapi.runner).speak(text, "sapi:O'Brien", 1, 'C:\\t\\c.wav');
    expect(sapi.calls[0]!.command).toBe('powershell.exe');
    // The voice is quoted for PowerShell, with its quote doubled; the text is not in the command.
    expect(sapi.calls[0]!.args.join(' ')).toContain("'O''Brien'");
    expect(sapi.calls[0]!.args.join(' ')).not.toContain('rm -rf');
    expect(sapi.calls[0]!.input).toBe(text);
  });

  it('refuses a voice of another engine', async () => {
    const espeak = recorder();
    await expect(
      espeakProvider('espeak-ng', espeak.runner).speak('Hi', 'say:Alex', 1, '/t/a.wav'),
    ).rejects.toThrow('another speech engine');
  });

  it('chooses the platform’s engine, espeak-ng on Linux only when it is there', () => {
    expect(findSpeechProvider('darwin', {})?.id).toBe('say');
    expect(findSpeechProvider('win32', {})?.id).toBe('sapi');
    expect(findSpeechProvider('linux', {}, () => '/usr/bin/espeak-ng')?.id).toBe('espeak-ng');
    expect(findSpeechProvider('linux', {}, () => null)).toBeNull();
    expect(findSpeechProvider('darwin', { VEDRAOPUS_SPEECH: 'none' })).toBeNull();
  });

  it('runs a program that exits without reading its input, without an uncaught error', async () => {
    // Session 103: espeak-ng left before reading, and the write's EPIPE went unhandled.
    const input = 'x'.repeat(4 * 1024 * 1024);
    await expect(run(process.execPath, ['-e', 'process.exit(0)'], input)).resolves.toBe('');
    await expect(run(process.execPath, ['-e', 'process.exit(3)'], input)).rejects.toThrow(
      'failed (3)',
    );
  });

  it('names the sound after the text’s first words', () => {
    expect(speechFileName('Welcome to the course! Today we look at safety.')).toBe(
      'Welcome to the course Today we.wav',
    );
    expect(speechFileName('...')).toBe('Speech.wav');
  });
});

// ------------------------------------------------------------ with espeak-ng

const espeak = onPath('espeak-ng');
const tools = findMediaTools([
  process.env['VEDRAOPUS_FFMPEG_DIR'],
  vendorFolder(resolve(import.meta.dirname, '../../../../..')),
]);

describe.skipIf(!espeak || !tools)('speech with the real espeak-ng and ffmpeg (Linux)', () => {
  const temp = mkdtempSync(join(tmpdir(), 'vedraopus-speech-test-'));
  afterAll(() => rmSync(temp, { recursive: true, force: true }));

  it('lists real voices, and makes a sentence into an MP3 whose length grows with the text', async () => {
    const provider = espeakProvider(espeak!);
    const voices = await provider.voices();
    const english = voices.find((voice) => voice.language === 'en-gb');
    expect(english).toBeDefined();
    const short = await makeSpeech(
      join(temp, 'w'),
      provider,
      { text: 'Hello.', voice: english!.id, rate: 1 },
      { tools: tools! },
    );
    expect(short.meta).toMatchObject({ kind: 'audio', ext: 'mp3', fileName: 'Hello.mp3' });
    const long = await makeSpeech(
      join(temp, 'w'),
      provider,
      {
        text: 'Hello, and welcome to this course. It takes about ten minutes, and you can stop at any time.',
        voice: english!.id,
        rate: 1,
      },
      { tools: tools! },
    );
    expect(long.meta.duration!).toBeGreaterThan(short.meta.duration! + 2);
    await expect(
      makeSpeech(join(temp, 'w'), provider, { text: 'Hi', voice: 'espeak-ng:xx-none', rate: 1 }),
    ).rejects.toThrow('not available');
    await expect(
      makeSpeech(join(temp, 'w'), null, { text: 'Hi', voice: english!.id, rate: 1 }),
    ).rejects.toThrow('no speech');
  }, 60_000);
});

// ------------------------------------------------------------------ with say

describe.runIf(process.platform === 'darwin' && tools)(
  'speech with the real say and ffmpeg (macOS)',
  () => {
    const temp = mkdtempSync(join(tmpdir(), 'vedraopus-speech-test-'));
    afterAll(() => rmSync(temp, { recursive: true, force: true }));

    it('lists real voices, and makes a sentence into an MP3 whose length grows with the text', async () => {
      const provider = findSpeechProvider('darwin', {})!;
      const voices = await provider.voices();
      const english = voices.find((voice) => voice.language.startsWith('en'));
      expect(english).toBeDefined();
      const short = await makeSpeech(
        join(temp, 'w'),
        provider,
        { text: 'Hello.', voice: english!.id, rate: 1 },
        { tools: tools! },
      );
      expect(short.meta).toMatchObject({ kind: 'audio', ext: 'mp3', fileName: 'Hello.mp3' });
      const long = await makeSpeech(
        join(temp, 'w'),
        provider,
        {
          text: 'Hello, and welcome to this course. It takes about ten minutes, and you can stop at any time.',
          voice: english!.id,
          rate: 1,
        },
        { tools: tools! },
      );
      expect(long.meta.duration!).toBeGreaterThan(short.meta.duration! + 2);
      await expect(
        makeSpeech(join(temp, 'w'), provider, { text: 'Hi', voice: 'say:No Such Voice', rate: 1 }),
      ).rejects.toThrow('not available');
    }, 60_000);
  },
);

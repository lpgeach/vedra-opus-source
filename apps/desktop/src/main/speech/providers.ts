import { spawn } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';

/**
 * Text-to-speech through the system's own voices (docs/briefs/P6.8-text-to-speech.md):
 * espeak-ng on Linux when installed, `say` on macOS, SAPI on Windows. Each runs
 * as a separate program, without a shell, with the text on standard input.
 */

export interface SpeechVoice {
  /** `<provider>:<voice>`, as saved in a project. */
  id: string;
  name: string;
  language: string;
}

export interface SpeechProvider {
  id: 'espeak-ng' | 'say' | 'sapi';
  name: string;
  voices(): Promise<SpeechVoice[]>;
  /** Speak `text` with `voice` (an id from `voices`) at `rate` (1 is normal) into a WAV file. */
  speak(text: string, voice: string, rate: number, wavPath: string): Promise<void>;
}

/** The longest text one sound is made from. */
export const MAX_SPEECH_TEXT = 5000;

/** Runs a program with `input` on standard input; resolves with its standard output. */
export type Run = (command: string, args: readonly string[], input?: string) => Promise<string>;

export const run: Run = (command, args, input) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (out += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (err += chunk));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve(out)
        : reject(new Error(`${command} failed (${code}): ${err.trim().slice(0, 500)}`)),
    );
    // A program that exits without reading all its input makes the write fail (EPIPE).
    // Its exit code already says how it went; unhandled, the error would end the app.
    child.stdin.on('error', () => undefined);
    child.stdin.end(input ?? '');
  });

/** Words a minute for a rate, for the engines that count that way. */
export const wordsPerMinute = (rate: number) => Math.round(175 * rate);
/** SAPI's rate, −10 to 10, for a rate where 1 is normal. */
export const sapiRate = (rate: number) => Math.max(-10, Math.min(10, Math.round((rate - 1) * 10)));

const own = (provider: string, id: string) => {
  const prefix = `${provider}:`;
  if (!id.startsWith(prefix)) throw new Error('That voice belongs to another speech engine.');
  return id.slice(prefix.length);
};

// ------------------------------------------------------------------ espeak-ng

/**
 * `espeak-ng --voices`: a header, then `Pty Language Age/Gender VoiceName File
 * Other…`. The language code is the voice's id; underscores in names are spaces.
 */
export function parseEspeakVoices(output: string): SpeechVoice[] {
  const voices: SpeechVoice[] = [];
  for (const line of output.split(/\r?\n/).slice(1)) {
    const [, language, , name] = line.trim().split(/\s+/);
    if (!language || !name) continue;
    voices.push({ id: `espeak-ng:${language}`, name: name.replace(/_/g, ' '), language });
  }
  return voices;
}

export function espeakProvider(command: string, runner: Run = run): SpeechProvider {
  return {
    id: 'espeak-ng',
    name: 'eSpeak NG',
    voices: async () => parseEspeakVoices(await runner(command, ['--voices'])),
    async speak(text, voice, rate, wavPath) {
      await runner(
        command,
        [
          '--stdin',
          '-v',
          own('espeak-ng', voice),
          '-s',
          String(wordsPerMinute(rate)),
          '-w',
          wavPath,
        ],
        text,
      );
    },
  };
}

// ----------------------------------------------------------------------- say

/** `say -v '?'`: `Name    xx_YY    # sample sentence`, where a name may have spaces. */
export function parseSayVoices(output: string): SpeechVoice[] {
  const voices: SpeechVoice[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /^(.+?)\s{2,}([a-z]{2,3}[_-][A-Za-z0-9]+)\s+#/.exec(line);
    if (match)
      voices.push({ id: `say:${match[1]!.trim()}`, name: match[1]!.trim(), language: match[2]! });
  }
  return voices;
}

export function sayProvider(runner: Run = run): SpeechProvider {
  return {
    id: 'say',
    name: 'macOS voices',
    voices: async () => parseSayVoices(await runner('say', ['-v', '?'])),
    async speak(text, voice, rate, wavPath) {
      await runner(
        'say',
        [
          '-v',
          own('say', voice),
          '-r',
          String(wordsPerMinute(rate)),
          '--file-format=WAVE',
          '--data-format=LEI16@22050',
          '-o',
          wavPath,
          '-f',
          '-',
        ],
        text,
      );
    },
  };
}

// ---------------------------------------------------------------------- SAPI

const SAPI_VOICES = `Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
foreach ($v in $s.GetInstalledVoices()) { if ($v.Enabled) { $i = $v.VoiceInfo; "$($i.Name)\`t$($i.Culture.Name)" } }`;

/** Speaks standard input; the voice, rate and file come as arguments. */
const SAPI_SPEAK = `param([string]$voice, [int]$rate, [string]$path)
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice($voice)
$s.Rate = $rate
$s.SetOutputToWaveFile($path)
$s.Speak([Console]::In.ReadToEnd())
$s.Dispose()`;

/** The SAPI script's output: `Name<TAB>culture` per line. */
export function parseSapiVoices(output: string): SpeechVoice[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.split('\t'))
    .filter((parts): parts is [string, string] => parts.length === 2 && parts[0]!.trim() !== '')
    .map(([name, culture]) => ({
      id: `sapi:${name.trim()}`,
      name: name.trim(),
      language: culture.trim(),
    }));
}

const powershell = (script: string, extra: readonly string[] = []) => [
  '-NoProfile',
  '-NonInteractive',
  '-Command',
  extra.length === 0
    ? script
    : `& { ${script} } ${extra.map((arg) => `'${arg.replace(/'/g, "''")}'`).join(' ')}`,
];

export function sapiProvider(runner: Run = run): SpeechProvider {
  return {
    id: 'sapi',
    name: 'Windows voices',
    voices: async () => parseSapiVoices(await runner('powershell.exe', powershell(SAPI_VOICES))),
    async speak(text, voice, rate, wavPath) {
      await runner(
        'powershell.exe',
        powershell(SAPI_SPEAK, [own('sapi', voice), String(sapiRate(rate)), wavPath]),
        text,
      );
    },
  };
}

// -------------------------------------------------------------------- choice

/** Where `command` is on `PATH`, or null. */
export function onPath(command: string, path = process.env['PATH'] ?? ''): string | null {
  for (const folder of path.split(delimiter)) {
    if (!folder) continue;
    const candidate = join(folder, command);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Not here.
    }
  }
  return null;
}

/**
 * The system's speech, or null when it has none. `VEDRAOPUS_SPEECH=none` hides
 * it, so tests can show the case of a system without voices.
 */
export function findSpeechProvider(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  find: (command: string) => string | null = (command) => onPath(command, env['PATH']),
): SpeechProvider | null {
  if (env['VEDRAOPUS_SPEECH'] === 'none') return null;
  if (platform === 'darwin') return sayProvider();
  if (platform === 'win32') return sapiProvider();
  const espeak = find('espeak-ng');
  return espeak ? espeakProvider(espeak) : null;
}

/** What to tell an author whose system has no voices. */
export const NO_VOICES_HINT =
  'No voices are installed. On Linux, install espeak-ng (for example sudo apt install espeak-ng, or sudo pacman -S espeak-ng), then open this again.';

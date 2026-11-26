import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { ImportedAsset } from '../../shared/ipc';
import { importAsset } from '../project/assets';
import type { MediaOptions } from '../project/assets';
import { MAX_SPEECH_TEXT } from './providers';
import type { SpeechProvider } from './providers';

export interface SpeechRequest {
  text: string;
  voice: string;
  rate: number;
}

/** A file name from the text's first words: "Welcome to the course.wav". */
export function speechFileName(text: string): string {
  const words = text
    .replace(/[^\p{L}\p{N}' -]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join(' ')
    .slice(0, 48)
    .trim();
  return `${words || 'Speech'}.wav`;
}

/**
 * Speak `request` with `provider` and keep the sound in the workspace's asset
 * store, through the media pipeline when there is one (an MP3 with its length).
 * Refuses what the provider cannot do, saying why, for the author.
 */
export async function makeSpeech(
  workspaceDir: string,
  provider: SpeechProvider | null,
  request: SpeechRequest,
  media?: MediaOptions,
): Promise<ImportedAsset> {
  if (!provider) throw new Error('There is no speech on this computer.');
  const text = request.text.trim();
  if (text === '') throw new Error('There is nothing to say.');
  if (text.length > MAX_SPEECH_TEXT) {
    throw new Error(`The text is too long: at most ${MAX_SPEECH_TEXT} characters at a time.`);
  }
  const voices = await provider.voices();
  if (!voices.some((voice) => voice.id === request.voice)) {
    throw new Error('That voice is not available on this computer.');
  }
  await mkdir(workspaceDir, { recursive: true });
  const work = await mkdtemp(join(workspaceDir, '.speech-'));
  try {
    const wav = join(work, speechFileName(text));
    await provider.speak(text, request.voice, request.rate, wav);
    return await importAsset(workspaceDir, wav, media);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

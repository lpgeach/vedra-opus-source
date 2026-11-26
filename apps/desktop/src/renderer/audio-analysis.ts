import { useEffect, useState } from 'react';

/** Seconds per waveform point. */
export const PEAK_STEP = 0.01;

export interface AudioAnalysis {
  /** Seconds. */
  length: number;
  /** The loudest sample in each 10 ms, across channels, from 0 to 255. */
  peaks: Uint8Array;
}

/** The loudest absolute sample in each step of `step` samples, scaled to 0–255. */
export function peaksOf(channels: readonly Float32Array[], step: number): Uint8Array {
  const length = channels[0]?.length ?? 0;
  const peaks = new Uint8Array(Math.ceil(length / step));
  for (let bucket = 0; bucket < peaks.length; bucket++) {
    let loudest = 0;
    const end = Math.min(length, (bucket + 1) * step);
    for (const channel of channels) {
      for (let i = bucket * step; i < end; i++) {
        const value = Math.abs(channel[i]!);
        if (value > loudest) loudest = value;
      }
    }
    peaks[bucket] = Math.min(255, Math.round(loudest * 255));
  }
  return peaks;
}

const cache = new Map<string, Promise<AudioAnalysis>>();

/**
 * Decode a sound (Web Audio does every format the app imports) and measure
 * it: its length, and a waveform at 100 points a second. Worked out once per
 * address and kept for the session; never saved.
 */
export function analyseAudio(url: string): Promise<AudioAnalysis> {
  const known = cache.get(url);
  if (known) return known;
  const work = (async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not read the sound (${response.status}).`);
    const bytes = await response.arrayBuffer();
    // An offline context decodes without needing a sound card.
    const decoder = new OfflineAudioContext(1, 1, 44_100);
    const buffer = await decoder.decodeAudioData(bytes);
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
      buffer.getChannelData(i),
    );
    const step = Math.max(1, Math.round(buffer.sampleRate * PEAK_STEP));
    return { length: buffer.duration, peaks: peaksOf(channels, step) };
  })();
  cache.set(url, work);
  // A failure is not remembered: the next try reads the file again.
  work.catch(() => cache.delete(url));
  return work;
}

/** The analysis of a sound once it is ready; null until then, or if it cannot be decoded. */
export function useAudioAnalysis(url: string | null): AudioAnalysis | null {
  return useAudioAnalysisState(url).analysis;
}

/**
 * The analysis of a sound, and whether it failed: a file with no sound in it
 * (a silent video) cannot be decoded, which is not the same as still decoding.
 */
export function useAudioAnalysisState(url: string | null): {
  analysis: AudioAnalysis | null;
  failed: boolean;
} {
  const [state, setState] = useState<{ url: string; result: AudioAnalysis | null } | null>(null);
  useEffect(() => {
    if (!url) return;
    let live = true;
    analyseAudio(url).then(
      (result) => {
        if (live) setState({ url, result });
      },
      () => {
        if (live) setState({ url, result: null });
      },
    );
    return () => {
      live = false;
    };
  }, [url]);
  const known = state && state.url === url ? state : null;
  return { analysis: known?.result ?? null, failed: known !== null && known.result === null };
}

/**
 * An SVG path for the waveform from `from` seconds for `seconds`, in a box
 * `points` wide and 100 high, symmetrical about the middle.
 */
export function waveformPath(
  peaks: Uint8Array,
  from: number,
  seconds: number,
): { d: string; points: number } {
  const first = Math.max(0, Math.floor(from / PEAK_STEP));
  const count = Math.max(0, Math.min(peaks.length - first, Math.ceil(seconds / PEAK_STEP)));
  if (count === 0) return { d: '', points: 1 };
  const top: string[] = [];
  const bottom: string[] = [];
  for (let i = 0; i < count; i++) {
    const half = (peaks[first + i]! / 255) * 50;
    top.push(`${i} ${(50 - half).toFixed(1)}`);
    bottom.push(`${i} ${(50 + half).toFixed(1)}`);
  }
  return { d: `M${top.join('L')}L${bottom.reverse().join('L')}Z`, points: Math.max(1, count - 1) };
}

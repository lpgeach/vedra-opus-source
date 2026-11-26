import { describe, expect, it } from 'vitest';
import { createAudioObject, migrateToCurrent, speechSchema } from './index';

describe('speech on sounds', () => {
  it('keeps the text, voice and speed a sound was made from, within limits', () => {
    expect(createAudioObject('a'.repeat(64), 2).props.speech).toBeNull();
    const ok = { text: 'Welcome to the course.', voice: 'espeak-ng:en-gb', rate: 1 };
    expect(speechSchema.safeParse(ok).success).toBe(true);
    for (const bad of [
      { ...ok, text: '' },
      { ...ok, text: 'x'.repeat(5001) },
      { ...ok, voice: '' },
      { ...ok, rate: 0.4 },
      { ...ok, rate: 2.1 },
    ]) {
      expect(speechSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('gives every sound in an older project no speech, wherever it is', () => {
    const audio = (id: string) => ({ id, type: 'audio', props: { asset: 'a'.repeat(64) } });
    const v11 = {
      formatVersion: 11,
      scenes: [
        {
          slides: [
            {
              baseLayer: {
                objects: [audio('a1'), { id: 'g', type: 'group', children: [audio('a2')] }],
              },
              layers: [{ objects: [audio('a3'), { id: 'v', type: 'video', props: {} }] }],
            },
          ],
        },
      ],
      masters: [],
    };
    const migrated = migrateToCurrent(v11) as typeof v11 & { formatVersion: number };
    expect(migrated.formatVersion).toBeGreaterThanOrEqual(12);
    // The three sounds, not the video.
    expect(JSON.stringify(migrated).match(/"speech":null/g)).toHaveLength(3);
    expect(JSON.stringify(v11)).not.toContain('speech');
  });
});

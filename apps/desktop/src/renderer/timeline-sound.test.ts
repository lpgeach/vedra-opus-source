import { createAudioObject, createVideoObject } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { soundTimeAt } from './timeline-sound';

describe('sound with the editor’s timeline', () => {
  it('plays a sound from its bar’s start, for its length or its bar, whichever is shorter', () => {
    const sound = createAudioObject('a'.repeat(64), 3);
    sound.timing = { start: 1, duration: 2.5 };
    expect(soundTimeAt(sound, 0.5)).toBeNull();
    expect(soundTimeAt(sound, 1.75)).toBeCloseTo(0.75);
    // The bar ends at 3.5 s, before the 3 s sound would (at 4 s).
    expect(soundTimeAt(sound, 3.5)).toBeNull();
    sound.timing = { start: 1, duration: 'untilEnd' };
    expect(soundTimeAt(sound, 3.9)).toBeCloseTo(2.9);
    expect(soundTimeAt(sound, 4)).toBeNull();
  });

  it('plays a video’s sound from its trim start, and nothing a trigger starts', () => {
    const video = createVideoObject('b'.repeat(64), 10);
    video.props.trimStart = 2;
    video.props.trimEnd = 5;
    video.timing = { start: 0, duration: 'untilEnd' };
    // 1 s in plays 2 + 1 = 3 s into the file; the 3 s it plays end at 3 s on the timeline.
    expect(soundTimeAt(video, 1)).toBe(3);
    expect(soundTimeAt(video, 3)).toBeNull();
    video.props.startOn = 'click';
    expect(soundTimeAt(video, 1)).toBeNull();
  });
});

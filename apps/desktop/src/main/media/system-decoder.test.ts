import { describe, expect, it } from 'vitest';
import { colourArgs, parseSystemInfo, uprightFilter } from './system-decoder';

/** Reading through the system's own decoders (docs/briefs/R3-os-decoders.md). */

describe('the system decoder’s helper', () => {
  it('reads what vo-decode info says', () => {
    expect(
      parseSystemInfo(
        '{"duration":0.500000,"video":{"width":64,"height":36,"fps":"10/1","rotation":270},"audio":{"sampleRate":16000,"channels":2},"unreadable":[]}',
      ),
    ).toEqual({
      duration: 0.5,
      video: { width: 64, height: 36, fps: '10/1', rotation: 270 },
      audio: { sampleRate: 16000, channels: 2 },
      unreadable: [],
    });
    // A file whose picture the system cannot decode, and an unknown length.
    expect(
      parseSystemInfo('{"duration":0,"video":null,"audio":null,"unreadable":["video","other"]}'),
    ).toEqual({ duration: null, video: null, audio: null, unreadable: ['video'] });
    expect(() =>
      parseSystemInfo('{"video":{"width":0,"height":36,"fps":"10/1","rotation":0}}'),
    ).toThrow('oddly');
    expect(() => parseSystemInfo('not json')).toThrow();
  });

  it('tags the colour standard the decoders use: BT.709 from 720 lines, BT.601 below', () => {
    expect(colourArgs(1920, 1080)).toEqual([
      '-colorspace',
      'bt709',
      '-color_primaries',
      'bt709',
      '-color_trc',
      'bt709',
    ]);
    expect(colourArgs(1080, 1920)).toContain('bt709');
    expect(colourArgs(640, 360)).toContain('smpte170m');
  });

  it('turns a picture upright by the degrees it is marked as turned', () => {
    expect(uprightFilter(0)).toEqual([]);
    expect(uprightFilter(90)).toEqual(['-vf', 'transpose=clock']);
    expect(uprightFilter(180)).toEqual(['-vf', 'hflip,vflip']);
    expect(uprightFilter(270)).toEqual(['-vf', 'transpose=cclock']);
    expect(uprightFilter(-90)).toEqual(['-vf', 'transpose=cclock']);
    expect(uprightFilter(45)).toEqual([]);
  });
});

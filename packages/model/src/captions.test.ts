import { describe, expect, it } from 'vitest';
import {
  createAudioObject,
  createEmptyProject,
  createVideoObject,
  formatSrt,
  formatTimestamp,
  formatVtt,
  migrateToCurrent,
  parseCaptions,
  parseProject,
  parseTimestamp,
  plainCueText,
  serializeProject,
  ProjectValidationError,
} from './index';

describe('caption times', () => {
  it('reads VTT and SRT timestamps, with or without hours', () => {
    expect(parseTimestamp('00:01:02.500')).toBe(62.5);
    expect(parseTimestamp('01:02.5')).toBe(62.5);
    expect(parseTimestamp('1:00:00,040')).toBe(3600.04);
    expect(parseTimestamp(' 00:00:09.9 ')).toBe(9.9);
    expect(parseTimestamp('00:61:00.000')).toBeNull();
    expect(parseTimestamp('nonsense')).toBeNull();
  });

  it('writes them to the millisecond', () => {
    expect(formatTimestamp(62.5)).toBe('00:01:02.500');
    expect(formatTimestamp(3600.04, ',')).toBe('01:00:00,040');
    expect(formatTimestamp(0.0004)).toBe('00:00:00.000');
  });

  it('keeps the words of a cue and drops its markup', () => {
    expect(plainCueText('<v Ada><i>Hello</i> &amp; welcome</v>')).toBe('Hello & welcome');
    expect(plainCueText('a &lt;b&gt; c &#233;')).toBe('a <b> c é');
  });
});

describe('reading caption files', () => {
  it('reads WebVTT: a header, identifiers, settings, notes and styles, two-line cues', () => {
    const { cues, problems } = parseCaptions(
      '﻿WEBVTT - Narration\r\nKind: captions\r\n\r\nNOTE written by hand\r\n\r\nSTYLE\r\n::cue { color: red }\r\n\r\nintro\r\n00:00.000 --> 00:02.500 align:start position:10%\r\nWelcome to\r\nthe course\r\n\r\n00:00:02.500 --> 00:00:05.000\r\n<i>Let’s begin</i>\r\n',
    );
    expect(problems).toEqual([]);
    expect(cues.map(({ start, end, text }) => ({ start, end, text }))).toEqual([
      { start: 0, end: 2.5, text: 'Welcome to\nthe course' },
      { start: 2.5, end: 5, text: 'Let’s begin' },
    ]);
    expect(new Set(cues.map((cue) => cue.id)).size).toBe(2);
    expect(cues[0]!.id).toMatch(/^caption_/);
  });

  it('reads SubRip, in any order, and says which cues it could not read', () => {
    const { cues, problems } = parseCaptions(
      '2\n00:00:04,000 --> 00:00:06,000\nSecond\n\n1\n00:00:01,000 --> 00:00:03,000\nFirst\n\n3\n00:00:09 --> 00:00:10,000\nBad time\n\n4\n00:00:07,000 --> 00:00:06,000\nBackwards\n\n5\n00:00:11,000 --> 00:00:12,000\n\n',
    );
    expect(cues.map((cue) => cue.text)).toEqual(['First', 'Second']);
    expect(problems).toEqual([
      'Line 10: times not understood ("00:00:09 --> 00:00:10,000").',
      'Line 14: the caption ends before it starts.',
      // Lines 17–18: its number, then its times, then nothing.
      'Line 18: the caption has no text.',
    ]);
  });

  it('refuses a file with no captions in it', () => {
    expect(() => parseCaptions('WEBVTT\n\n')).toThrow('There are no captions in this file.');
    expect(() => parseCaptions('hello\nworld')).toThrow('No captions could be read. Line 1');
  });
});

describe('writing caption files', () => {
  const cues = parseCaptions(
    // Escaped in the file, so the words hold a real "&" and "<tags>".
    'WEBVTT\n\n00:00:03.000 --> 00:00:04.250\nThen this, with an &amp; and &lt;tags&gt;\n\n00:00:00.500 --> 00:00:02.000\nFirst line\nsecond line\n',
  ).cues;

  it('writes WebVTT in time order, escaping what would read as markup, and reads back the same', () => {
    const vtt = formatVtt(cues);
    expect(vtt).toBe(
      'WEBVTT\n\n00:00:00.500 --> 00:00:02.000\nFirst line\nsecond line\n\n00:00:03.000 --> 00:00:04.250\nThen this, with an &amp; and &lt;tags&gt;\n',
    );
    const again = parseCaptions(vtt).cues.map(({ start, end, text }) => ({ start, end, text }));
    expect(again).toEqual(
      [...cues]
        .sort((a, b) => a.start - b.start)
        .map(({ start, end, text }) => ({ start, end, text })),
    );
  });

  it('writes SubRip, numbered from 1, and reads back the same', () => {
    const plain = cues.filter((cue) => !cue.text.includes('<'));
    const srt = formatSrt(plain);
    expect(srt).toBe('1\n00:00:00,500 --> 00:00:02,000\nFirst line\nsecond line\n');
    expect(parseCaptions(srt).cues.map((cue) => cue.text)).toEqual(['First line\nsecond line']);
  });
});

describe('captions in a project', () => {
  const HASH = 'a'.repeat(64);
  const make = (cues: unknown) => {
    const project = createEmptyProject();
    project.assets[HASH] = {
      kind: 'audio',
      fileName: 'a.mp3',
      ext: 'mp3',
      mimeType: 'audio/mpeg',
      byteLength: 1,
    };
    const audio = createAudioObject(HASH, 10);
    (audio.props as { captions: unknown }).captions = cues;
    project.scenes[0]!.slides[0]!.baseLayer.objects.push(audio);
    return JSON.parse(serializeProject(project)) as unknown;
  };
  const issues = (raw: unknown) => {
    try {
      parseProject(raw);
      return [];
    } catch (error) {
      if (error instanceof ProjectValidationError)
        return error.issues.map((issue) => issue.message);
      throw error;
    }
  };

  it('keeps cues on sound and video, and refuses backwards ones and ones past the end', () => {
    expect(issues(make([{ id: 'caption_1', start: 1, end: 2, text: 'Hi' }]))).toEqual([]);
    expect(issues(make([{ id: 'caption_1', start: 3, end: 2, text: 'Hi' }]))).toEqual([
      'a caption must end after it starts',
    ]);
    expect(issues(make([{ id: 'caption_1', start: 9, end: 11, text: 'Hi' }]))).toEqual([
      'caption ends after the media does',
    ]);
    expect(createVideoObject(HASH, 5).props.captions).toEqual([]);
  });

  it('gives every sound and video in an older project an empty list, wherever it is', () => {
    const audio = (id: string) => ({ id, type: 'audio', props: { asset: HASH, length: 1 } });
    const v7 = {
      formatVersion: 7,
      scenes: [
        {
          slides: [
            {
              baseLayer: {
                objects: [
                  audio('a1'),
                  { id: 'g', type: 'group', children: [{ id: 'v1', type: 'video', props: {} }] },
                ],
              },
              layers: [{ objects: [audio('a2')] }],
            },
          ],
        },
      ],
      masters: [
        { layer: { objects: [audio('a3')] }, layouts: [{ layer: { objects: [audio('a4')] } }] },
      ],
    };
    const migrated = migrateToCurrent(v7) as typeof v7 & { formatVersion: number };
    const all = JSON.stringify(migrated);
    expect(migrated.formatVersion).toBeGreaterThanOrEqual(8);
    expect(all.match(/"captions":\[\]/g)).toHaveLength(5);
    // The input is left as it was.
    expect(JSON.stringify(v7)).not.toContain('captions');
  });
});

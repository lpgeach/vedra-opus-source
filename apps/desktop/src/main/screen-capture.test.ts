import { describe, expect, it } from 'vitest';
import { createScreenCapture } from './screen-capture';
import type { CaptureSource } from './screen-capture';

/** Screen recording's chosen source (docs/briefs/P9.11-screen-recording.md). */

const source = (id: string, name: string, picture = ''): CaptureSource => ({
  id,
  name,
  thumbnail: { isEmpty: () => picture === '', toDataURL: () => picture },
});

function capture() {
  const asked: unknown[] = [];
  const made = createScreenCapture(async (options) => {
    asked.push(options);
    return [
      source('screen:0:0', 'Entire screen', 'data:image/png;base64,AA'),
      source('window:7:0', 'Notes'),
    ];
  });
  const answers: unknown[] = [];
  const answer = (streams: unknown) => answers.push(streams);
  return { made, asked, answers, answer };
}

describe('screen capture in main', () => {
  it('lists screens and windows with their pictures, asking for small ones', async () => {
    const { made, asked } = capture();
    expect(await made.sources()).toEqual([
      {
        id: 'screen:0:0',
        name: 'Entire screen',
        kind: 'screen',
        thumbnail: 'data:image/png;base64,AA',
      },
      { id: 'window:7:0', name: 'Notes', kind: 'window', thumbnail: '' },
    ]);
    expect(asked).toEqual([
      {
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: false,
      },
    ]);
  });

  it('gives the editor the chosen source once, then refuses', async () => {
    const { made, answers, answer } = capture();
    await made.sources();
    expect(made.choose('window:7:0')).toBe(true);
    made.handle({ videoRequested: true }, answer, true);
    made.handle({ videoRequested: true }, answer, true);
    expect(answers).toEqual([{ video: { id: 'window:7:0', name: 'Notes' } }, null]);
  });

  it('refuses with nothing chosen, a source not listed, a page that is not the editor, or no video', async () => {
    const { made, answers, answer } = capture();
    made.handle({ videoRequested: true }, answer, true);
    await made.sources();
    expect(made.choose('screen:9:9')).toBe(false);
    made.handle({ videoRequested: true }, answer, true);
    made.choose('screen:0:0');
    made.handle({ videoRequested: true }, answer, false);
    made.choose('screen:0:0');
    made.handle({ videoRequested: false }, answer, true);
    made.choose('screen:0:0');
    expect(made.choose(null)).toBe(true);
    made.handle({ videoRequested: true }, answer, true);
    expect(answers).toEqual([null, null, null, null, null]);
  });
});

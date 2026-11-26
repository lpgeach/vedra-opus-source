import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { isBlankPng } from './png';
import { PIXEL_PNG } from './pptx/test-deck';

/** Whether LibreOffice drew anything (docs/briefs/P11.1-pptx-import.md, part D). */

function chunk(type: string, body: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  // The reader does not check the checksum, so none is worked out here.
  return Buffer.concat([length, Buffer.from(type, 'latin1'), body, Buffer.alloc(4)]);
}

/** An 8-bit PNG, `rows` of pixels already filtered (each row starts with its filter byte). */
function png(width: number, rows: number[][], colour = 6): Uint8Array {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(rows.length, 4);
  header[8] = 8;
  header[9] = colour;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from(rows.flat()))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('a blank drawing', () => {
  it('is one whose every pixel is clear, whatever its colour and filters', () => {
    // Two clear white pixels a row: no filter, then "Sub" (each byte less the one four before).
    const white = [255, 255, 255, 0, 255, 255, 255, 0];
    const sub = [255, 255, 255, 0, 0, 0, 0, 0];
    expect(
      isBlankPng(
        png(2, [
          [0, ...white],
          [1, ...sub],
        ]),
      ),
    ).toBe(true);
    // "Up", "Average" and "Paeth" rows under a clear one.
    expect(
      isBlankPng(
        png(2, [
          [0, ...white],
          [2, 0, 0, 0, 0, 0, 0, 0, 0],
        ]),
      ),
    ).toBe(true);
    expect(
      isBlankPng(
        png(2, [
          [0, ...white],
          [4, 0, 0, 0, 0, 0, 0, 0, 0],
        ]),
      ),
    ).toBe(true);
  });

  it('is not one with a pixel showing, even a faint one reached through a filter', () => {
    expect(isBlankPng(png(2, [[0, 255, 255, 255, 0, 0, 0, 0, 1]]))).toBe(false);
    // "Sub": the second pixel's alpha is 0 + 7.
    expect(isBlankPng(png(2, [[1, 0, 0, 0, 0, 0, 0, 0, 7]]))).toBe(false);
    // "Average" under a clear row: alpha (0 + 0) / 2 + 9.
    expect(
      isBlankPng(
        png(1, [
          [0, 9, 9, 9, 0],
          [3, 0, 0, 0, 9],
        ]),
      ),
    ).toBe(false);
  });

  it('is not a picture of another kind, or one that cannot be read', () => {
    expect(isBlankPng(png(1, [[0, 0, 0, 0]], 2))).toBe(false);
    expect(isBlankPng(PIXEL_PNG)).toBe(false);
    expect(isBlankPng(new Uint8Array([1, 2, 3]))).toBe(false);
  });
});

/**
 * Whether a picture LibreOffice drew has anything in it (P11.1 part D): it
 * draws content it cannot read as nothing, on a transparent background.
 */
import { inflateSync } from 'node:zlib';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/**
 * True when every pixel of an 8-bit RGBA PNG is fully transparent. Any other
 * kind of PNG, or one that cannot be read, is not blank: it is shown as it is.
 */
export function isBlankPng(bytes: Uint8Array): boolean {
  const png = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (png.length < 33 || SIGNATURE.some((byte, i) => png[i] !== byte)) return false;
  let width = 0;
  let height = 0;
  const data: Buffer[] = [];
  for (let at = 8; at + 8 <= png.length;) {
    const length = png.readUInt32BE(at);
    const type = png.toString('latin1', at + 4, at + 8);
    const body = png.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const [depth, colour, , , interlace] = body.subarray(8, 13);
      if (depth !== 8 || colour !== 6 || interlace !== 0) return false;
    } else if (type === 'IDAT') {
      data.push(body);
    } else if (type === 'IEND') {
      break;
    }
    at += 12 + length;
  }
  if (width === 0 || height === 0) return false;
  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(data));
  } catch {
    return false;
  }
  const stride = width * 4;
  if (raw.length < height * (stride + 1)) return false;
  let previous = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? row[x - 4]! : 0;
      const b = previous[x]!;
      const c = x >= 4 ? previous[x - 4]! : 0;
      const predicted =
        filter === 1
          ? a
          : filter === 2
            ? b
            : filter === 3
              ? (a + b) >> 1
              : filter === 4
                ? paeth(a, b, c)
                : 0;
      row[x] = (line[x]! + predicted) & 0xff;
      if (x % 4 === 3 && row[x] !== 0) return false;
    }
    previous = row;
  }
  return true;
}

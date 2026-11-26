import type { Page } from '@playwright/test';
import { inflateSync } from 'node:zlib';

export interface Colour {
  r: number;
  g: number;
  b: number;
}

/**
 * The colour drawn at a point of the page, from a one-pixel screenshot. The first
 * pixel of a PNG's first row is stored as itself whatever the row's filter (every
 * filter's prediction for it is zero), so reading it needs only the inflated data.
 */
export async function pixelAt(page: Page, x: number, y: number): Promise<Colour> {
  const png = await page.screenshot({
    clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 },
  });
  const colourType = png[25];
  if (png[24] !== 8 || (colourType !== 2 && colourType !== 6)) {
    throw new Error(`Unexpected PNG: depth ${png[24]}, colour type ${colourType}`);
  }
  const data: Buffer[] = [];
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at);
    const type = png.toString('latin1', at + 4, at + 8);
    if (type === 'IDAT') data.push(png.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  return { r: raw[1]!, g: raw[2]!, b: raw[3]! };
}

/** Whether two colours are the same within `tolerance` on each channel. */
export function near(a: Colour, b: Colour, tolerance = 6): boolean {
  return (
    Math.abs(a.r - b.r) <= tolerance &&
    Math.abs(a.g - b.g) <= tolerance &&
    Math.abs(a.b - b.b) <= tolerance
  );
}

/** Half of each, as a layer at 50% over another is drawn. */
export function halfway(a: Colour, b: Colour): Colour {
  return { r: (a.r + b.r) / 2, g: (a.g + b.g) / 2, b: (a.b + b.b) / 2 };
}

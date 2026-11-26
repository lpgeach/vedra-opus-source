import { expect, test } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import { createEmptyProject, createImageObject } from '@vedraopus/model';
import { createHash } from 'node:crypto';
import { createWriteStream, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { crc32, deflateSync } from 'node:zlib';
import { ZipFile } from 'yazl';
import { answerDialogs, launchApp } from './launch';

/**
 * Large media (docs/briefs/P11.5-hardening.md, part B): a huge picture is drawn
 * in the editor from a scaled copy, media answer byte ranges, and a save that
 * cannot be written says so and changes nothing.
 */

const WIDTH = 6000;
const HEIGHT = 4000;

/** A PNG of one colour, `WIDTH` × `HEIGHT`: each row "Sub"-filtered, so it packs small. */
function bigPng(): Buffer {
  const chunk = (type: string, body: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(type, 'latin1'), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([length, typed, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const row = Buffer.alloc(1 + WIDTH * 3);
  row[0] = 1; // Sub: each pixel the one before it, plus nothing
  row[1] = 0x2f;
  row[2] = 0x6f;
  row[3] = 0xed;
  const raw = Buffer.concat(Array.from({ length: HEIGHT }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function bigPictureProject(dir: string): Promise<string> {
  const png = bigPng();
  const hash = createHash('sha256').update(png).digest('hex');
  const project = createEmptyProject('Big picture');
  project.assets[hash] = {
    kind: 'image',
    fileName: 'poster.png',
    ext: 'png',
    mimeType: 'image/png',
    byteLength: png.length,
    width: WIDTH,
    height: HEIGHT,
  };
  project.scenes[0]!.slides[0]!.baseLayer.objects.push(
    createImageObject(hash, { x: 100, y: 100, width: 600, height: 400 }, 'Poster'),
  );
  const target = join(dir, 'big-picture.vedraopus');
  const zip = new ZipFile();
  zip.addBuffer(Buffer.from(JSON.stringify(project)), 'project.json');
  zip.addBuffer(png, `assets/${hash}.png`);
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(target));
  return target;
}

async function chooseMenuItem(app: ElectronApplication, id: string): Promise<void> {
  await app.evaluate(({ Menu }, menuId) => {
    Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click();
  }, id);
}

test('a huge picture is drawn from a scaled copy, media answer byte ranges, and a failed save says so', async () => {
  test.setTimeout(120_000);
  const dir = mkdtempSync(join(tmpdir(), 'vo-e2e-large-media-'));
  const file = await bigPictureProject(dir);
  const nowhere = join(dir, 'no-such-folder', 'copy.vedraopus');
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { open: [[file]], save: [nowhere], message: [1] });
    await page.getByRole('button', { name: 'Open…', exact: true }).click();

    // The stage asks for a copy twice the stage's longer side, and gets one that size.
    const picture = page.getByTestId('stage-canvas').locator('[data-object-type="image"] img');
    await expect(picture).toHaveAttribute('src', /\?fit=2560$/);
    await expect
      .poll(() =>
        picture.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]),
      )
      .toEqual([2560, Math.round((2560 * HEIGHT) / WIDTH)]);

    // The file itself, a byte range at a time.
    const src = (await picture.getAttribute('src'))!.replace(/\?.*$/, '');
    const ranged = await page.evaluate(async (url) => {
      const response = await fetch(url, { headers: { Range: 'bytes=0-15' } });
      const bytes = new Uint8Array(await response.arrayBuffer());
      return {
        status: response.status,
        range: response.headers.get('content-range'),
        accept: response.headers.get('accept-ranges'),
        length: bytes.length,
        first: Array.from(bytes.slice(0, 4)),
      };
    }, src);
    expect(ranged.status).toBe(206);
    expect(ranged.range).toMatch(/^bytes 0-15\/\d+$/);
    expect(ranged.accept).toBe('bytes');
    expect(ranged.length).toBe(16);
    expect(ranged.first).toEqual([0x89, 0x50, 0x4e, 0x47]);

    // A save into a folder that is not there fails and says so; the project stays the file
    // it was opened from.
    await chooseMenuItem(app, 'file.saveAs');
    await expect(page.getByTestId('error')).toContainText('The project could not be saved');
    await expect(page.getByTestId('project-status')).toContainText('big-picture.vedraopus');
    await expect(page.getByTestId('project-status')).not.toContainText('copy.vedraopus');
  } finally {
    await app.close();
  }
});

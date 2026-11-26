import { createWriteStream, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ZipFile } from 'yazl';

/** A fixture project as an `.vedraopus` file in `dir`, so the app can open it. */
export async function packFixture(dir: string, name: string): Promise<string> {
  const fixture = join(import.meta.dirname, '../fixtures/projects', name);
  const target = join(dir, `${name}.vedraopus`);
  const zip = new ZipFile();
  zip.addFile(join(fixture, 'project.json'), 'project.json');
  if (existsSync(join(fixture, 'assets'))) {
    for (const asset of readdirSync(join(fixture, 'assets'))) {
      zip.addFile(join(fixture, 'assets', asset), `assets/${asset}`);
    }
  }
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(target));
  return target;
}

/** The two-slides fixture as an `.vedraopus` file in `dir`. */
export const packTwoSlides = (dir: string): Promise<string> => packFixture(dir, 'two-slides');

/** A project made in the test, as an `.vedraopus` file named `name` in `dir`. */
export async function packProject(dir: string, name: string, project: unknown): Promise<string> {
  const target = join(dir, `${name}.vedraopus`);
  const zip = new ZipFile();
  zip.addBuffer(Buffer.from(JSON.stringify(project)), 'project.json');
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(target));
  return target;
}

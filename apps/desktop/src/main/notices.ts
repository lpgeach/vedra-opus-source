/**
 * The icons and illustrations library's licence notices (P9.8), which a
 * published course that uses the sets carries with it (Luke, session 76). They
 * are shipped in `resources/licences/` (electron-builder's extraResources), and
 * are in `apps/desktop/resources/licences/` in development.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GraphicLibrary } from '@vedraopus/publish';

const FILES: Record<GraphicLibrary, string> = {
  lucide: 'lucide.txt',
  openDoodles: 'open-doodles.txt',
};

/** The notices from the first of `folders` that has them; none when no folder does. */
export async function readNotices(
  folders: readonly (string | undefined)[],
): Promise<Partial<Record<GraphicLibrary, string>>> {
  for (const folder of folders) {
    if (!folder || !existsSync(join(folder, FILES.lucide))) continue;
    const found: Partial<Record<GraphicLibrary, string>> = {};
    for (const [library, file] of Object.entries(FILES) as [GraphicLibrary, string][]) {
      if (existsSync(join(folder, file)))
        found[library] = await readFile(join(folder, file), 'utf8');
    }
    return found;
  }
  return {};
}

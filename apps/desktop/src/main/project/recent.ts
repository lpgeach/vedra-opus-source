import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';

const MAX_RECENT = 10;

/** Most recent first; entries whose file has gone are dropped. */
export async function readRecent(listFile: string): Promise<string[]> {
  try {
    const raw: unknown = JSON.parse(await readFile(listFile, 'utf8'));
    if (!Array.isArray(raw)) return [];
    return raw.filter((path): path is string => typeof path === 'string' && existsSync(path));
  } catch {
    return [];
  }
}

export async function addRecent(listFile: string, filePath: string): Promise<void> {
  const others = (await readRecent(listFile)).filter((path) => path !== filePath);
  await writeFile(listFile, JSON.stringify([filePath, ...others].slice(0, MAX_RECENT)));
}

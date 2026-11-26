import { readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';

/** How many projects' folders are remembered; the least recently published go first. */
export const REMEMBERED_FOLDERS = 100;

const fileSchema = z.object({
  /** Most recent first. */
  folders: z.array(z.object({ projectId: z.string().min(1), folder: z.string().min(1) })),
});

/**
 * Where each project was last published, on this computer. Kept apart from
 * the project (a path belongs to one machine) and from settings.json (which
 * the renderer saves whole). Reads never fail: a missing or damaged file
 * remembers nothing.
 */
export class PublishFolders {
  private entries: { projectId: string; folder: string }[] = [];

  constructor(private readonly file: string) {
    try {
      const parsed = fileSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
      if (parsed.success) this.entries = parsed.data.folders.slice(0, REMEMBERED_FOLDERS);
    } catch {
      // Nothing remembered yet, or an unreadable file.
    }
  }

  get(projectId: string): string | null {
    return this.entries.find((entry) => entry.projectId === projectId)?.folder ?? null;
  }

  remember(projectId: string, folder: string): void {
    this.entries = [
      { projectId, folder },
      ...this.entries.filter((entry) => entry.projectId !== projectId),
    ].slice(0, REMEMBERED_FOLDERS);
    try {
      writeFileSync(this.file, JSON.stringify({ folders: this.entries }, null, 2));
    } catch (error) {
      // The publish itself succeeded; the folder just will not be offered next time.
      console.error('Could not remember the publish folder:', error);
    }
  }
}

import type { ImportProgress } from '../../shared/ipc';

/** A step of an import, for the cover over the window (B7, docs/briefs/B7-import-progress.md). */
export type ImportStep = Omit<ImportProgress, 'source' | 'name'>;

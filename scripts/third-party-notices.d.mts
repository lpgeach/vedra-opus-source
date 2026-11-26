import type { Plugin } from 'vite';

/** One npm package built into a bundle. */
export interface PackageNotice {
  name: string;
  version: string;
  /** As its package.json names it; `UNKNOWN` when it names none. */
  licence: string;
  /** Its licence and notice files, joined; or, when it has none, its licence's standard text. */
  text: string | null;
  /** True when `text` is the licence's standard text, the package having no licence file. */
  standard: boolean;
}

export const NOTICES_FILE: 'third-party-notices.json';
export function packageRootOf(moduleId: string): string | null;
export function licenceName(manifest: Record<string, unknown>): string;
export function describePackage(root: string): PackageNotice;
export function collectNotices(
  moduleIds: Iterable<string>,
  isOwn?: (name: string) => boolean,
): PackageNotice[];
export function thirdPartyNotices(): Plugin;

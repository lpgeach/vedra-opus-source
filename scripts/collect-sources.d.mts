export interface PinnedSource {
  file: string;
  url: string;
  sha256: string;
}

export function ffmpegSources(script: string): PinnedSource[];
export function libreOfficeVersion(script: string): string | null;
export const LIBREOFFICE_SOURCE: PinnedSource & { version: string };
export function readme(
  version: string,
  ffmpeg: readonly PinnedSource[],
  libreOffice: PinnedSource & { version: string },
): string;

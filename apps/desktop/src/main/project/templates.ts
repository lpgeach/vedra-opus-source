/**
 * Templates (docs/briefs/P11.2-templates.md, part A): ordinary project files
 * kept in a folder. The built-in ones ship with the app and are read-only; the
 * author's own are in the user data folder.
 */
import { ProjectValidationError } from '@vedraopus/model';
import { readdir } from 'node:fs/promises';
import { basename, extname, join, relative, resolve, isAbsolute } from 'node:path';
import type { TemplateInfo } from '../../shared/ipc';
import { ContainerError, readContainerProject } from './container';
import { FILE_EXTENSION, LEGACY_FILE_EXTENSION } from './paths';
import { STARTER_PREFIX, STARTER_TEMPLATES } from './starter-templates';

export interface TemplateFolders {
  /** The author's own templates: made when first needed. */
  own: string;
  /** The app's built-in templates, read-only; null where there are none. */
  builtIn: string | null;
}

const isProjectFile = (name: string) =>
  [`.${FILE_EXTENSION}`, `.${LEGACY_FILE_EXTENSION}`].includes(extname(name).toLowerCase());

/** One folder's templates, read for the list; one that cannot be read says why. */
async function readFolder(folder: string | null, builtIn: boolean): Promise<TemplateInfo[]> {
  if (!folder) return [];
  let names: string[];
  try {
    names = (await readdir(folder)).filter(isProjectFile);
  } catch {
    return [];
  }
  const found = await Promise.all(
    names.map(async (name): Promise<TemplateInfo> => {
      const path = join(folder, name);
      const base = { path, name: basename(name, extname(name)), builtIn };
      try {
        const project = await readContainerProject(path);
        return {
          ...base,
          slides: project.scenes.reduce((count, scene) => count + scene.slides.length, 0),
          stage: { ...project.stage },
          problem: null,
        };
      } catch (error) {
        const problem =
          error instanceof ContainerError
            ? error.message
            : error instanceof ProjectValidationError
              ? 'Its contents are not valid.'
              : 'It could not be read.';
        return { ...base, slides: 0, stage: null, problem };
      }
    }),
  );
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/** The starter templates (part C), as the chooser lists them. */
function starters(): TemplateInfo[] {
  return STARTER_TEMPLATES.map((template) => {
    const project = template.make();
    return {
      path: `${STARTER_PREFIX}${template.key}`,
      name: template.name,
      builtIn: true,
      slides: project.scenes.reduce((count, scene) => count + scene.slides.length, 0),
      stage: { ...project.stage },
      problem: null,
    };
  });
}

/** The starter templates, any built-in template files, then the author's own, each in name order. */
export async function listTemplates(folders: TemplateFolders): Promise<TemplateInfo[]> {
  return [
    ...starters(),
    ...(await readFolder(folders.builtIn, true)),
    ...(await readFolder(folders.own, false)),
  ];
}

/**
 * The demo course among the built-in template files (B4): a sample course built with the
 * app, opened from the Welcome screen and Help → Open Demo Course as a new, unsaved copy.
 */
export const DEMO_COURSE_FILE = `The UK Space Industry in 2026.${FILE_EXTENSION}`;

/** A template name made safe as a file name on any system, with the project extension. */
export function templateFileName(name: string): string {
  const forbidden = '<>:"/\\|?*';
  const cleaned = [...name]
    .map((char) => (forbidden.includes(char) || char.charCodeAt(0) < 32 ? ' ' : char))
    .join('')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 100)
    .trim();
  return `${cleaned || 'Template'}.${FILE_EXTENSION}`;
}

/** Whether `path` is a file directly inside the author's own templates folder. */
export function isOwnTemplate(folders: TemplateFolders, path: string): boolean {
  const inside = relative(resolve(folders.own), resolve(path));
  return (
    inside !== '' &&
    !inside.startsWith('..') &&
    !isAbsolute(inside) &&
    !inside.includes('/') &&
    !inside.includes('\\') &&
    isProjectFile(inside)
  );
}

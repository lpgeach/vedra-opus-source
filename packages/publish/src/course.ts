import type { Project, PublishSettings } from '@vedraopus/model';
import { publishCmi5 } from './cmi5';
import { publishScorm12 } from './scorm12';
import { publishScorm2004 } from './scorm2004';
import { publishWeb } from './web';
import type { WebPublishOptions } from './web';
import { defaultActivityId, isIri, publishXapi } from './xapi';
import { isXmlName, xmlId } from './xml';

/** The fields a target uses, so the Publish dialog shows only those. */
export function settingsFields(target: PublishSettings['target']) {
  const scorm = target === 'scorm12' || target === 'scorm2004';
  return {
    edition: target === 'scorm2004',
    identifier: target !== 'web',
    version: scorm,
    description: !scorm,
    reporting: target !== 'web',
  };
}

/** What an empty identifier stands for, for this target: shown to the author as a hint. */
export function defaultIdentifier(project: Project, target: PublishSettings['target']): string {
  switch (target) {
    case 'web':
      return '';
    case 'scorm12':
    case 'scorm2004':
      return xmlId(project.id);
    case 'xapi':
    case 'cmi5':
      return defaultActivityId(project);
  }
}

export type SettingsProblems = Partial<Record<'identifier' | 'version', string>>;

/** What is wrong with the settings for their target, field by field, in words for the author. */
export function checkPublishSettings(settings: PublishSettings): SettingsProblems {
  const problems: SettingsProblems = {};
  const fields = settingsFields(settings.target);
  const identifier = settings.identifier.trim();
  if (fields.identifier && identifier) {
    if (fields.version && !isXmlName(identifier)) {
      problems.identifier =
        'Start with a letter or "_", and use only letters, digits, "-", "_" and ".".';
    } else if (!fields.version && !isIri(identifier)) {
      problems.identifier =
        'Use a web address or other IRI, such as https://example.com/courses/safety.';
    }
  }
  if (fields.version && !settings.version.trim())
    problems.version = 'Enter a version, such as 1.0.';
  return problems;
}

export interface CoursePublishReport {
  files: string[];
  /** Things the author should know, such as resume detail that may not fit. */
  warnings: string[];
}

/**
 * Publish the course for the target its settings name, with those settings.
 * Settings `checkPublishSettings` finds fault with are refused before
 * anything is written.
 */
export async function publishCourse(
  project: Project,
  settings: PublishSettings,
  options: Omit<WebPublishOptions, 'lms' | 'title' | 'description'>,
): Promise<CoursePublishReport> {
  const problems = Object.values(checkPublishSettings(settings));
  if (problems.length > 0) throw new Error(problems.join(' '));
  const fields = settingsFields(settings.target);
  const title = settings.title.trim() || project.title.trim() || 'Course';
  const identifier = settings.identifier.trim();
  const common = {
    ...options,
    title,
    ...(fields.description && settings.description.trim()
      ? { description: settings.description.trim() }
      : {}),
  };
  const manifest = {
    ...(identifier ? { identifier } : {}),
    version: settings.version.trim(),
  };
  switch (settings.target) {
    case 'web':
      return { ...(await publishWeb(project, common)), warnings: [] };
    case 'scorm12': {
      const { files, warnings } = await publishScorm12(project, { ...common, ...manifest });
      return { files, warnings };
    }
    case 'scorm2004': {
      const { files, warnings } = await publishScorm2004(project, {
        ...common,
        ...manifest,
        edition: settings.scorm2004Edition,
      });
      return { files, warnings };
    }
    case 'xapi': {
      const { files } = await publishXapi(project, {
        ...common,
        ...(identifier ? { activityId: identifier } : {}),
      });
      return { files, warnings: [] };
    }
    case 'cmi5': {
      const { files } = await publishCmi5(project, {
        ...common,
        ...(identifier ? { courseId: identifier } : {}),
      });
      return { files, warnings: [] };
    }
  }
}

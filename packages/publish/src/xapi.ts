import type { Project } from '@vedraopus/model';
import { xapiActivityTypes } from '@vedraopus/player/xapi-vocabulary';
import { PublishCancelled, publishWeb } from './web';
import type { WebPublishOptions } from './web';
import { escapeXml } from './xml';

/** The course's activity id when the author gives none: stable across republishing. */
export const defaultActivityId = (project: Project) =>
  `urn:vedraopus:course:${encodeURIComponent(project.id)}`;

/** An IRI as xAPI wants an activity id: a scheme, then no spaces. */
const IRI = /^[A-Za-z][A-Za-z0-9+.-]*:[^\s<>"{}|\\^`]+$/;
export const isIri = (text: string) => IRI.test(text);

/**
 * `tincan.xml`: tells the LMS the course's activity id, name and the file to
 * launch, so it can pass the launch details (endpoint, auth, actor, …).
 */
export function tincanXml(title: string, activityId: string, description = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<tincan xmlns="http://projecttincan.com/tincan.xsd">
  <activities>
    <activity id="${escapeXml(activityId)}" type="${xapiActivityTypes.course}">
      <name lang="en-US">${escapeXml(title)}</name>
      <description lang="en-US">${escapeXml(description)}</description>
      <launch lang="en-US">index.html</launch>
    </activity>
  </activities>
</tincan>
`;
}

export interface XapiPublishOptions extends Omit<WebPublishOptions, 'lms'> {
  /** The course's activity IRI. Default `urn:vedraopus:course:<project id>`. */
  activityId?: string;
}

export interface XapiPublishReport {
  files: string[];
  activityId: string;
}

/** An xAPI package: the web course reporting to the LRS it is launched with, and `tincan.xml`. */
export async function publishXapi(
  project: Project,
  options: XapiPublishOptions,
): Promise<XapiPublishReport> {
  const activityId = options.activityId?.trim() || defaultActivityId(project);
  if (!isIri(activityId)) {
    throw new Error(
      `The activity id must be an IRI, such as https://example.com/courses/safety (got "${activityId}").`,
    );
  }
  const title = (options.title ?? project.title).trim() || 'Course';
  const report = await publishWeb(project, {
    ...options,
    title,
    lms: { standard: 'xapi', activityId },
  });
  if (options.signal?.aborted) throw new PublishCancelled();
  await options.write('tincan.xml', tincanXml(title, activityId, options.description));
  return { files: [...report.files, 'tincan.xml'], activityId };
}

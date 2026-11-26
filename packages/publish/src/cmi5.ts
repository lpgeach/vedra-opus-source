import type { Project, Tracking } from '@vedraopus/model';
import { PublishCancelled, publishWeb } from './web';
import type { WebPublishOptions } from './web';
import { defaultActivityId, isIri } from './xapi';
import { escapeXml } from './xml';

/** cmi5's names for when the LMS may count the unit done. */
export type Cmi5MoveOn =
  'Completed' | 'Passed' | 'CompletedAndPassed' | 'CompletedOrPassed' | 'NotApplicable';

/** The course's reporting pair, as cmi5's `moveOn`: completed-… waits for completion, passed-… for a pass. */
export const moveOnFor = (reporting: Tracking['reporting']): Cmi5MoveOn =>
  reporting.startsWith('passed') ? 'Passed' : 'Completed';

const langstring = (text: string) => `<langstring lang="en-US">${escapeXml(text)}</langstring>`;

/**
 * `cmi5.xml`: a course with one assignable unit (AU), the published course,
 * launched from `index.html` in whatever window the LMS chooses.
 */
export function cmi5Xml(options: {
  title: string;
  description?: string;
  courseId: string;
  auId: string;
  moveOn: Cmi5MoveOn;
}): string {
  const description = options.description ?? '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<courseStructure xmlns="https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd">
  <course id="${escapeXml(options.courseId)}">
    <title>${langstring(options.title)}</title>
    <description>${langstring(description)}</description>
  </course>
  <au id="${escapeXml(options.auId)}" moveOn="${options.moveOn}" launchMethod="AnyWindow">
    <title>${langstring(options.title)}</title>
    <description>${langstring(description)}</description>
    <url>index.html</url>
  </au>
</courseStructure>
`;
}

export interface Cmi5PublishOptions extends Omit<WebPublishOptions, 'lms'> {
  /** The course's IRI. Default `urn:vedraopus:course:<project id>`; the unit's is this plus `/au`. */
  courseId?: string;
}

export interface Cmi5PublishReport {
  files: string[];
  courseId: string;
  auId: string;
  moveOn: Cmi5MoveOn;
}

/** A cmi5 package: the web course as one assignable unit, and `cmi5.xml`. */
export async function publishCmi5(
  project: Project,
  options: Cmi5PublishOptions,
): Promise<Cmi5PublishReport> {
  const courseId = options.courseId?.trim() || defaultActivityId(project);
  if (!isIri(courseId)) {
    throw new Error(
      `The course id must be an IRI, such as https://example.com/courses/safety (got "${courseId}").`,
    );
  }
  const auId = `${courseId}/au`;
  const title = (options.title ?? project.title).trim() || 'Course';
  const moveOn = moveOnFor(project.tracking.reporting);
  const report = await publishWeb(project, {
    ...options,
    title,
    lms: { standard: 'cmi5', activityId: auId },
  });
  if (options.signal?.aborted) throw new PublishCancelled();
  await options.write(
    'cmi5.xml',
    cmi5Xml({ title, courseId, auId, moveOn, description: options.description ?? '' }),
  );
  return { files: [...report.files, 'cmi5.xml'], courseId, auId, moveOn };
}

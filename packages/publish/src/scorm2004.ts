import type { Project } from '@vedraopus/model';
import { worstCaseSuspendLength } from './scorm12';
import { SCORM2004_SCHEMAS } from './scorm2004-schemas';
import { PublishCancelled, publishWeb } from './web';
import type { Scorm2004Edition, WebPublishOptions } from './web';
import { escapeXml, manifestHeader } from './xml';
import type { ManifestOptions } from './xml';

const NS = {
  imscp: 'http://www.imsglobal.org/xsd/imscp_v1p1',
  adlcp: 'http://www.adlnet.org/xsd/adlcp_v1p3',
  adlseq: 'http://www.adlnet.org/xsd/adlseq_v1p3',
  adlnav: 'http://www.adlnet.org/xsd/adlnav_v1p3',
  imsss: 'http://www.imsglobal.org/xsd/imsss',
};

/** What each edition calls itself in the manifest's metadata. */
const SCHEMA_VERSION: Record<Scorm2004Edition, string> = {
  2: 'CAM 1.3',
  3: '2004 3rd Edition',
  4: '2004 4th Edition',
};

/** How much suspend data each edition's LMS keeps. */
export const SCORM2004_SUSPEND_LIMIT: Record<Scorm2004Edition, number> = {
  2: 4000,
  3: 64000,
  4: 64000,
};

/**
 * The schema files a package of this edition carries at its root, by name.
 * None for the 3rd edition: its sequencing schemas may only be passed on after
 * registering with IMS (docs/briefs/P5.3-scorm-2004.md).
 */
export function scorm2004SchemaFiles(edition: Scorm2004Edition): Readonly<Record<string, string>> {
  return edition === 3 ? {} : SCORM2004_SCHEMAS[edition];
}

/**
 * `imsmanifest.xml` for a single-SCO SCORM 2004 package listing every course
 * file, with the simplest sequencing: the course reports its own completion
 * and success, and the LMS's previous and continue buttons are hidden because
 * the course has its own navigation.
 */
export function scorm2004Manifest(
  project: Project,
  title: string,
  files: readonly string[],
  edition: Scorm2004Edition = 4,
  options: ManifestOptions = {},
): string {
  const { id, version } = manifestHeader(project.id, options);
  const name = escapeXml(title);
  const schemas = scorm2004SchemaFiles(edition);
  const list = files
    .filter(
      (file, index, all) =>
        all.indexOf(file) === index && file !== 'imsmanifest.xml' && !(file in schemas),
    )
    .map((file) => `      <file href="${escapeXml(file)}"/>`)
    .join('\n');
  const location =
    'imscp_v1p1.xsd' in schemas
      ? `
  xsi:schemaLocation="${NS.imscp} imscp_v1p1.xsd ${NS.adlcp} adlcp_v1p3.xsd ${NS.adlseq} adlseq_v1p3.xsd ${NS.adlnav} adlnav_v1p3.xsd ${NS.imsss} imsss_v1p0.xsd"`
      : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${id}" version="${version}"
  xmlns="${NS.imscp}"
  xmlns:adlcp="${NS.adlcp}"
  xmlns:adlseq="${NS.adlseq}"
  xmlns:adlnav="${NS.adlnav}"
  xmlns:imsss="${NS.imsss}"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"${location}>
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>${SCHEMA_VERSION[edition]}</schemaversion>
  </metadata>
  <organizations default="${id}-org">
    <organization identifier="${id}-org">
      <title>${name}</title>
      <item identifier="${id}-item" identifierref="${id}-sco" isvisible="true">
        <title>${name}</title>
        <imsss:sequencing>
          <imsss:deliveryControls completionSetByContent="true" objectiveSetByContent="true"/>
        </imsss:sequencing>
        <adlnav:presentation>
          <adlnav:navigationInterface>
            <adlnav:hideLMSUI>previous</adlnav:hideLMSUI>
            <adlnav:hideLMSUI>continue</adlnav:hideLMSUI>
          </adlnav:navigationInterface>
        </adlnav:presentation>
      </item>
      <imsss:sequencing>
        <imsss:controlMode choice="true" flow="true"/>
      </imsss:sequencing>
    </organization>
  </organizations>
  <resources>
    <resource identifier="${id}-sco" type="webcontent" adlcp:scormType="sco" href="index.html">
${list}
    </resource>
  </resources>
</manifest>
`;
}

export interface Scorm2004PublishOptions extends Omit<WebPublishOptions, 'lms'>, ManifestOptions {
  /** Default: the 4th edition. */
  edition?: Scorm2004Edition;
}

export interface Scorm2004PublishReport {
  files: string[];
  /** Things the author should know, such as resume detail that may not fit. */
  warnings: string[];
  /** The worst-case suspend data length, in characters. */
  suspendEstimate: number;
}

/**
 * A SCORM 2004 package: the web course reporting to its LMS, `imsmanifest.xml`,
 * and (2nd and 4th editions) the schema files the manifest names.
 */
export async function publishScorm2004(
  project: Project,
  options: Scorm2004PublishOptions,
): Promise<Scorm2004PublishReport> {
  const edition = options.edition ?? 4;
  const title = (options.title ?? project.title).trim() || 'Course';
  const report = await publishWeb(project, {
    ...options,
    title,
    lms: { standard: 'scorm2004', edition },
  });
  if (options.signal?.aborted) throw new PublishCancelled();
  await options.write(
    'imsmanifest.xml',
    scorm2004Manifest(project, title, report.files, edition, options),
  );
  const schemas = scorm2004SchemaFiles(edition);
  for (const [name, text] of Object.entries(schemas)) {
    if (options.signal?.aborted) throw new PublishCancelled();
    await options.write(name, text);
  }
  const files = [...report.files, 'imsmanifest.xml', ...Object.keys(schemas)];
  const suspendEstimate = worstCaseSuspendLength(project);
  const limit = SCORM2004_SUSPEND_LIMIT[edition];
  const warnings =
    suspendEstimate > limit
      ? [
          `A learner who sees everything in this course could need ${suspendEstimate} characters of saved progress; this edition of SCORM 2004 keeps ${limit.toLocaleString('en')}. If that happens, the least important resume detail (other slides' state first) is left out, and the learner still keeps their place, completion and variables.`,
        ]
      : [];
  return { files, warnings, suspendEstimate };
}

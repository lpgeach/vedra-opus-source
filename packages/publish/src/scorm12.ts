import type { SessionState } from '@vedraopus/engine';
import { everySlide, forEachObject } from '@vedraopus/model';
import type { Project, SceneObject } from '@vedraopus/model';
import { encodeSession } from '@vedraopus/player/suspend';
import { SCORM12_SCHEMAS } from './scorm12-schemas';
import { PublishCancelled, publishWeb } from './web';
import type { PublishData, WebPublishOptions } from './web';
import { escapeXml, manifestHeader } from './xml';
import type { ManifestOptions } from './xml';

/** The schema files a SCORM 1.2 package carries at its root, beside the manifest. */
export const SCORM12_SCHEMA_FILES = Object.keys(SCORM12_SCHEMAS);

/**
 * `imsmanifest.xml` for a single-SCO SCORM 1.2 package listing every course
 * file. The schema files it names in `xsi:schemaLocation` sit beside it
 * (written by `publishScorm12`); they belong to the package, not the SCO.
 */
export function scorm12Manifest(
  project: Project,
  title: string,
  files: readonly string[],
  options: ManifestOptions = {},
): string {
  const { id, version } = manifestHeader(project.id, options);
  const name = escapeXml(title);
  const list = files
    .filter(
      (file, index, all) =>
        all.indexOf(file) === index &&
        file !== 'imsmanifest.xml' &&
        !SCORM12_SCHEMA_FILES.includes(file),
    )
    .map((file) => `      <file href="${escapeXml(file)}"/>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${id}" version="${version}"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="${id}-org">
    <organization identifier="${id}-org">
      <title>${name}</title>
      <item identifier="${id}-item" identifierref="${id}-sco" isvisible="true">
        <title>${name}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="${id}-sco" type="webcontent" adlcp:scormtype="sco" href="index.html">
${list}
    </resource>
  </resources>
</manifest>
`;
}

/**
 * The longest suspend data this course could need: every slide visited and
 * resumable, every object in its last state and selected and visited, every
 * overlay shown part way through, every variable set (text to 40 characters).
 */
export function worstCaseSuspendLength(project: Project): number {
  const objectsOn = (slide: Project['scenes'][number]['slides'][number]) => {
    const all: SceneObject[] = [];
    for (const layer of [slide.baseLayer, ...slide.layers])
      forEachObject(layer.objects, (o) => all.push(o));
    return all;
  };
  const slides = everySlide(project).map(({ slide }) => slide);
  const state: SessionState = {
    v: 1,
    ...(slides[0] ? { s: slides[0].id } : {}),
    c: 1,
    e: 99_999.9,
    vis: slides.map((slide) => slide.id),
    x: Object.fromEntries(
      project.variables.map((v) => [
        v.id,
        v.type === 'text' ? 'x'.repeat(40) : v.type === 'number' ? 123456.78 : true,
      ]),
    ),
    sv: Object.fromEntries(
      slides.map((slide) => {
        const objects = objectsOn(slide);
        const o = Object.fromEntries(
          objects.filter((ob) => ob.states.length > 1).map((ob) => [ob.id, ob.states.at(-1)!.id]),
        );
        const f = Object.fromEntries(objects.map((ob) => [ob.id, 'vs']));
        const t = Object.fromEntries(
          [slide.baseLayer, ...slide.layers].map((l) => [l.id, l.timeline.duration / 2]),
        );
        // Every object moved by a motion path, as far as the stage goes (P6.5).
        const m = Object.fromEntries(
          objects
            .filter((ob) => ob.animations.motionPaths.length > 0)
            .map((ob) => [ob.id, [-project.stage.width, project.stage.height] as [number, number]]),
        );
        return [
          slide.id,
          { o, f, l: slide.layers.map((l) => l.id), t, h: objects.map((ob) => ob.id), m },
        ];
      }),
    ),
    // Every draw as large as its bank allows (P7.6).
    d: Object.fromEntries(
      slides.flatMap((slide) => {
        if (!slide.draw) return [];
        const bank = project.banks.find((each) => each.id === slide.draw!.bank);
        const ids = (bank?.slides ?? []).slice(0, slide.draw.count).map((each) => each.id);
        return [[slide.id, ids]];
      }),
    ),
  };
  return encodeSession(project, state, Number.POSITIVE_INFINITY).text.length;
}

export interface Scorm12PublishReport {
  files: string[];
  /** Things the author should know, such as resume detail that may not fit. */
  warnings: string[];
  /** The worst-case suspend data length, in characters. */
  suspendEstimate: number;
}

/**
 * A SCORM 1.2 package: the web course reporting to its LMS, `imsmanifest.xml`,
 * and the schema files the manifest names.
 */
export async function publishScorm12(
  project: Project,
  options: Omit<WebPublishOptions, 'lms'> & ManifestOptions,
): Promise<Scorm12PublishReport> {
  const title = (options.title ?? project.title).trim() || 'Course';
  // Checked before anything is written.
  manifestHeader(project.id, options);
  const report = await publishWeb(project, { ...options, title, lms: { standard: 'scorm12' } });
  const manifest: PublishData = scorm12Manifest(project, title, report.files, options);
  await options.write('imsmanifest.xml', manifest);
  for (const name of SCORM12_SCHEMA_FILES) {
    if (options.signal?.aborted) throw new PublishCancelled();
    await options.write(name, SCORM12_SCHEMAS[name]!);
  }
  const files = [...report.files, 'imsmanifest.xml', ...SCORM12_SCHEMA_FILES];
  const suspendEstimate = worstCaseSuspendLength(project);
  const warnings =
    suspendEstimate > 4096
      ? [
          `A learner who sees everything in this course could need ${suspendEstimate} characters of saved progress; SCORM 1.2 keeps 4,096. If that happens, the least important resume detail (other slides' state first) is left out, and the learner still keeps their place, completion and variables.`,
        ]
      : [];
  return { files, warnings, suspendEstimate };
}

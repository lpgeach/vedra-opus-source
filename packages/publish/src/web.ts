import { allLayers, forEachObject, serializeProject, WEB_PATH } from '@vedraopus/model';
import type { AssetMeta, GraphicObject, Project } from '@vedraopus/model';

export type PublishData = Uint8Array | string;

export interface WebPublishOptions {
  /** Shown as the page and course title. Default: the project's title. */
  title?: string;
  /**
   * The built player (packages/player/dist), and the npm packages built into it,
   * whose notices every course carries in `THIRD-PARTY-NOTICES.txt` (R2).
   */
  player: { js: string; css: string; libraries?: readonly PlayerLibraryNotice[] };
  /** The bytes of an asset the project lists. */
  readAsset(hash: string, meta: AssetMeta): Promise<Uint8Array>;
  /** Store one output file. `path` is relative, uses `/`, and never leaves the output folder. */
  write(path: string, data: PublishData): Promise<void>;
  /** Called after each file is written. */
  onProgress?(done: number, total: number): void;
  /** Stop between files when aborted. */
  signal?: { readonly aborted: boolean };
  /** The LMS standard the course reports to; leave out for a plain web course. */
  lms?: LmsTarget;
  /** What the course is about: the page's description, and the package's where it has one. */
  description?: string;
  /**
   * For the editor's Preview (P9.6): web objects from an address show a
   * placeholder instead of loading, so nothing leaves the machine.
   */
  preview?: boolean;
  /**
   * The licence notices of the icons and illustrations library (P9.8), by set.
   * A course that uses a set carries its notice in `THIRD-PARTY-NOTICES.txt`;
   * publishing one without the notice it needs fails.
   */
  notices?: Partial<Record<GraphicLibrary, string>>;
}

export type GraphicLibrary = GraphicObject['props']['library'];

/** Every library set the course's graphics come from, in a fixed order. */
export function graphicLibraries(project: Project): GraphicLibrary[] {
  const used = new Set<GraphicLibrary>();
  for (const { layer } of allLayers(project)) {
    forEachObject(layer.objects, (object) => {
      if (object.type === 'graphic') used.add(object.props.library);
    });
  }
  return (['lucide', 'openDoodles'] as const).filter((library) => used.has(library));
}

/** An npm package built into the course player (docs/briefs/R2-notices-and-sources.md). */
export interface PlayerLibraryNotice {
  name: string;
  version: string;
  licence: string;
  text: string | null;
}

/**
 * The notices file: the player's libraries, which every course carries, and the
 * picture sets the course uses; null when there are neither.
 */
export function noticesText(
  libraries: readonly GraphicLibrary[],
  notices: Partial<Record<GraphicLibrary, string>>,
  playerLibraries: readonly PlayerLibraryNotice[] = [],
): string | null {
  const rule = '\n\n========================================\n\n';
  const sections: string[] = [];
  if (playerLibraries.length > 0) {
    const entries = playerLibraries.map(
      (each) =>
        `${each.name} ${each.version} (${each.licence})\n\n${each.text?.trim() || `Licence: ${each.licence}`}`,
    );
    sections.push(
      `The course player (player/player.js) includes the following libraries. Their licences follow.\n\n${entries.join(rule)}`,
    );
  }
  if (libraries.length > 0) {
    const names: Record<GraphicLibrary, string> = {
      lucide: 'Lucide icons',
      openDoodles: 'Open Doodles',
    };
    const parts = libraries.map((library) => {
      const notice = notices[library]?.trim();
      if (!notice) {
        throw new Error(
          `The course uses ${names[library]}, but their licence notice was not found.`,
        );
      }
      return notice;
    });
    sections.push(
      `This course uses pictures from the following sets. Their licences follow.\n\n${parts.join(rule)}`,
    );
  }
  return sections.length === 0 ? null : `${sections.join(rule)}\n`;
}

/** SCORM 2004 editions: the 2nd keeps less suspend data and its manifest differs. */
export type Scorm2004Edition = 2 | 3 | 4;

/** What a published course reports to, as `startCourse` in the player takes it. */
export type LmsTarget =
  | { standard: 'scorm12' }
  | { standard: 'scorm2004'; edition: Scorm2004Edition }
  | { standard: 'xapi'; activityId: string }
  | { standard: 'cmi5'; activityId: string };

/** A string as a script literal that cannot end the script element it sits in. */
const scriptString = (text: string) =>
  JSON.stringify(text)
    .replace(/</g, '\\u003c')
    .replace(new RegExp('\\u2028', 'g'), '\\u2028')
    .replace(new RegExp('\\u2029', 'g'), '\\u2029');

/** The `startCourse` options that connect the course to its LMS. */
function connectOptions(lms: LmsTarget | undefined): string {
  switch (lms?.standard) {
    case undefined:
      return '';
    case 'scorm12':
      return `lms: 'scorm12',\n  `;
    case 'scorm2004':
      return `lms: 'scorm2004',\n  edition: ${Number(lms.edition)},\n  `;
    case 'xapi':
    case 'cmi5':
      return `lms: '${lms.standard}',\n  activityId: ${scriptString(lms.activityId)},\n  `;
  }
}

export interface WebPublishReport {
  /** Every path written, in order. */
  files: string[];
}

export class PublishCancelled extends Error {
  constructor() {
    super('Publishing was cancelled');
    this.name = 'PublishCancelled';
  }
}

/** Every web object's folder in the course (P9.6): its object id and its files by path. */
export function webFolders(project: Project): { id: string; files: Record<string, string> }[] {
  const found: { id: string; files: Record<string, string> }[] = [];
  for (const { layer } of allLayers(project)) {
    forEachObject(layer.objects, (object) => {
      if (object.type === 'web' && object.props.source.kind === 'folder') {
        found.push({ id: object.id, files: object.props.source.files });
      }
    });
  }
  return found;
}

/** A copy of the project whose web folders list no files. */
function withoutFolderFiles(project: Project): Project {
  const copy = JSON.parse(JSON.stringify(project)) as Project;
  for (const { layer } of allLayers(copy)) {
    forEachObject(layer.objects, (object) => {
      if (object.type === 'web' && object.props.source.kind === 'folder') {
        object.props.source.files = {};
      }
    });
  }
  return copy;
}

const HASH = /^[0-9a-f]{64}$/;
const EXT = /^[a-z0-9]{1,8}$/;

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The course data as a script that assigns it to a global, so the course runs
 * from `file://` and inside an LMS without fetching anything. Characters that
 * could end the script early or break older parsers are escaped.
 */
export function courseDataScript(project: Project): string {
  const json = serializeProject(project)
    .replace(/</g, '\\u003c')
    .replace(new RegExp('\\u2028', 'g'), '\\u2028')
    .replace(new RegExp('\\u2029', 'g'), '\\u2029');
  return `window.VEDRAOPUS_COURSE = ${json};\n`;
}

/** The page that loads the player and the data and starts the course. */
export function indexHtml(
  title: string,
  lms?: LmsTarget,
  description = '',
  preview = false,
): string {
  const connect = connectOptions(lms);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
${description.trim() ? `<meta name="description" content="${escapeHtml(description.trim())}">\n` : ''}<link rel="stylesheet" href="player/player.css">
<style>html,body{margin:0;height:100%;background:#1c2024}#course{width:100%;height:100%}</style>
</head>
<body>
<div id="course"></div>
<script src="content/data.js"></script>
<script src="player/player.js"></script>
<script>
window.VEDRAOPUS_PLAYER = VedraOpusPlayer.startCourse(document.getElementById('course'), window.VEDRAOPUS_COURSE, {
  ${connect}assetUrl: function (hash, ext) { return 'content/assets/' + hash + '.' + ext; },
  webUrl: function (id, path) { return 'content/web/' + id + '/' + path; }${preview ? ',\n  remoteWeb: false' : ''}
});
</script>
</body>
</html>
`;
}

/**
 * Write a self-contained web course: `index.html`, the player, `content/data.js`
 * and `content/assets/<hash>.<ext>`. Opens from `file://` or any web server.
 * Everything is written through `options.write`, so this package knows nothing
 * about disks.
 */
export async function publishWeb(
  project: Project,
  options: WebPublishOptions,
): Promise<WebPublishReport> {
  const title = (options.title ?? project.title).trim() || 'Course';
  const course: Project = { ...project, title };
  const assets = Object.entries(course.assets);
  for (const [hash, meta] of assets) {
    // Names come from the project file, which is untrusted input.
    if (!HASH.test(hash) || !EXT.test(meta.ext)) {
      throw new Error(`The project lists an asset with an unusable name (${hash.slice(0, 12)}…).`);
    }
  }

  // Web objects' folders (P9.6): each written under content/web/<id>/ with its
  // own paths; their files are not written again under content/assets/ unless
  // something else in the course uses them too.
  const folders = webFolders(course);
  for (const { files } of folders) {
    for (const path of Object.keys(files)) {
      if (!WEB_PATH.test(path)) throw new Error(`A web folder has an unusable path (${path}).`);
    }
  }
  // The course as text without the folders' file lists: a hash still in it is used elsewhere.
  const rest = JSON.stringify({ ...withoutFolderFiles(course), assets: {} });
  const folderOnly = new Set(
    folders.flatMap(({ files }) => Object.values(files)).filter((hash) => !rest.includes(hash)),
  );
  const written = assets.filter(([hash]) => !folderOnly.has(hash));
  // The player's libraries' notices (R2), and the picture sets' for those the course uses (P9.8).
  const notices = noticesText(
    graphicLibraries(course),
    options.notices ?? {},
    options.player.libraries ?? [],
  );
  const total =
    4 +
    (notices === null ? 0 : 1) +
    written.length +
    folders.reduce((n, { files }) => n + Object.keys(files).length, 0);
  const files: string[] = [];
  const put = async (path: string, data: PublishData) => {
    if (options.signal?.aborted) throw new PublishCancelled();
    await options.write(path, data);
    files.push(path);
    options.onProgress?.(files.length, total);
  };

  await put('player/player.js', options.player.js);
  await put('player/player.css', options.player.css);
  await put('content/data.js', courseDataScript(course));
  for (const [hash, meta] of written) {
    if (options.signal?.aborted) throw new PublishCancelled();
    await put(`content/assets/${hash}.${meta.ext}`, await options.readAsset(hash, meta));
  }
  for (const { id, files } of folders) {
    for (const [path, hash] of Object.entries(files)) {
      const meta = course.assets[hash];
      if (!meta) throw new Error(`A web folder lists a file the project does not have (${path}).`);
      await put(`content/web/${id}/${path}`, await options.readAsset(hash, meta));
    }
  }
  if (notices !== null) await put('THIRD-PARTY-NOTICES.txt', notices);
  await put('index.html', indexHtml(title, options.lms, options.description, options.preview));
  return { files };
}

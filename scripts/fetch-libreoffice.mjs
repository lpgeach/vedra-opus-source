#!/usr/bin/env node
/**
 * Fetch the pinned LibreOffice build for this machine, keep only what drawing
 * a PowerPoint deck's charts and SmartArt as pictures needs, and put it in
 * vendor/libreoffice/<os>-<arch>/ (docs/briefs/P11.1-pptx-import.md, part D).
 *
 * - The download is checked against The Document Foundation's SHA-256 before
 *   anything is unpacked. It is unpacked without installing anything.
 * - What is dropped: Writer, Calc, Math and Base, help, templates, galleries,
 *   extensions, other languages, Java, Python, and the like (the lists below).
 * - What is kept is checked: no program or library kept may link to one that
 *   was dropped, so a new version cannot quietly break the trim.
 * - A smoke test proves it: the trimmed build draws fixtures/libreoffice/smoke.pptx
 *   (a title, a bar chart and SmartArt), and the drawing must hold their words.
 *   If any of this fails, nothing is put in vendor/ and the script says why.
 *
 * Does nothing when the folder is already there. There is no build for macOS
 * yet; on a Mac this says so and exits cleanly.
 *
 *   node scripts/fetch-libreoffice.mjs [--force] [--archive=<the download, already on disk>]
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  closeSync,
  copyFileSync,
  cpSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

const VERSION = '26.8.3';
const RELEASE = `https://download.documentfoundation.org/libreoffice/stable/${VERSION}`;

/** Paths, relative to the LibreOffice folder, that every system drops. `*` is any part of a name. */
const DROP_ALL = [
  'help',
  'readmes',
  'share/extensions',
  'share/gallery',
  'share/template',
  'share/wizards',
  'share/autotext',
  'share/basic',
  'share/Scripts',
  'share/xpdfimport',
  'share/firebird',
  'share/config/images_*.zip',
  'program/python*',
  'program/resource',
  'program/classes',
  'program/wizards',
];

const BUILDS = {
  'win-x64': {
    file: `LibreOffice_${VERSION}_Win_x86-64.msi`,
    folder: 'win/x86_64',
    sha256: '0e6918c273eabbdbbd800ee0dacbbf130a14c13c2e4cec861b06dd59e015bf94',
    program: 'program/soffice.com',
    drop: [
      ...DROP_ALL,
      // The fonts the installer would add to Windows, and the 32-bit runtime; Windows has fonts of its own.
      'Fonts',
      'System',
      'program/shlxthdl',
      'program/*.pyd',
      ...[
        'swlo',
        'swuilo',
        'swdlo',
        'writerlo',
        'sw_writerfilterlo',
        'mswordlo',
        'vbaswobjlo',
        'sclo',
        'scuilo',
        'scdlo',
        'scnlo',
        'scfiltlo',
        'calclo',
        'vbaobjlo',
        'smlo',
        'smdlo',
        'Engine12',
        'pythonloaderlo',
        'LanguageToollo',
        'PresentationMinimizerlo',
        'deploymentgui',
        'updatecheckuilo',
        'updchklo',
        'migrationoo2lo',
        'migrationoo3lo',
        'jumplistlo',
        'spsupp_x64',
        'spsupp_x86',
        'so_activex',
        'inprocserv',
        'cli_*',
        'policy.1.0.cli_*',
        'java_uno',
        'javaloaderlo',
        'javavmlo',
        'juh',
        'juhx',
        'jpipe',
        'jpipx',
        'jdbclo',
        'hsqldb',
        'officebean',
        'postgresql-sdbc-impllo',
        'libpq',
        'dbplo',
        'abplo',
        'pdfimportlo',
      ].map((name) => `program/${name}.dll`),
      'share/registry/res/registry_*.xcd',
      'share/registry/res/fcfg_langpack_*.xcd',
    ],
    keep: ['share/registry/res/registry_en-US.xcd', 'share/registry/res/fcfg_langpack_en-US.xcd'],
  },
  'linux-x64': {
    file: `LibreOffice_${VERSION}_Linux_x86-64_deb.tar.gz`,
    folder: 'deb/x86_64',
    sha256: 'e7cd3538e85818ff9dd9bb65386769fde927011242aace5a144989f4000dcabf',
    program: 'program/soffice',
    drop: [
      ...DROP_ALL,
      'program/__pycache__',
      'program/*.pyi',
      'program/pythonloader.unorc',
      'program/libpython3*',
      'program/libpythonloaderlo.so',
      'program/libpyuno.so',
      'program/pyuno.so',
      ...[
        'swlo',
        'swuilo',
        'swdlo',
        'writerlo',
        'sw_writerfilterlo',
        'mswordlo',
        'vbaswobjlo',
        'sclo',
        'scuilo',
        'scdlo',
        'scnlo',
        'scfiltlo',
        'calclo',
        'vbaobjlo',
        'smlo',
        'smdlo',
        'Engine12',
        'firebird_sdbclo',
        'LanguageToollo',
        'PresentationMinimizerlo',
        'deploymentgui',
        'updatecheckuilo',
        'updchklo',
        'migrationoo2lo',
        'migrationoo3lo',
        'java_uno',
        'javaloaderlo',
        'javavmlo',
        'juh',
        'juhx',
        'jpipe',
        'jdbclo',
        'hsqldb',
        'officebean',
        'mysql_jdbclo',
        'postgresql-sdbc-impllo',
        'postgresql-sdbclo',
        'mysqlclo',
        'dbplo',
        'abplo',
        'pdfimportlo',
        'evoablo',
        'solverlo',
        'vclplug_gtk3lo',
        'vclplug_gtk3_kde5lo',
        'vclplug_gtk4lo',
        'vclplug_kf5lo',
        'vclplug_qt5lo',
        'vclplug_qt6lo',
        'kf5be1lo',
        'avmediagtk',
        'avmediaqt6',
        'libreofficekitgtk',
      ].map((name) => `program/lib${name}.so`),
      'program/libfbclient.so.2',
      'program/libCbc*',
      'program/libCgl*',
      'program/libClp*',
      'program/libCoin*',
      'program/libOsi*',
      'program/liblpsolve55.so',
    ],
    keep: [],
  },
  'mac-x64': mac(
    'LibreOffice_26.8.3_MacOS_x86-64.dmg',
    'mac/x86_64',
    'bb3c35d628780510915ad9e759d7ed898094d7985d01b2181bd1d4ecd94fd159',
  ),
  'mac-arm64': mac(
    'LibreOffice_26.8.3_MacOS_aarch64.dmg',
    'mac/aarch64',
    'de943203795e5057785f65515063e2db5eb60b0bb6d8e2534fec59e5cc5fb988',
  ),
};

/**
 * A macOS build (session 102): the app bundle, with the same kinds of file
 * dropped as on Windows and Linux, under the bundle's own names. Re-signed ad
 * hoc after the trim, since removing files breaks the bundle's seal.
 */
function mac(file, folder, sha256) {
  const app = 'LibreOffice.app/Contents';
  return {
    file,
    folder,
    sha256,
    program: `${app}/MacOS/soffice`,
    libraries: `${app}/Frameworks`,
    drop: [
      `${app}/PlugIns`,
      `${app}/Library/Spotlight`,
      ...[
        'help',
        'readmes',
        'extensions',
        'gallery',
        'template',
        'wizards',
        'autotext',
        'basic',
        'Scripts',
        'xpdfimport',
        'firebird',
        'java',
        'python',
        '*.py',
        '*.pyi',
        'pythonloader.unorc',
        'config/images_*.zip',
      ].map((name) => `${app}/Resources/${name}`),
      `${app}/Frameworks/LibreOfficePython.framework`,
      // Links to what is dropped: Firebird's language files and the Java bridge.
      `${app}/Frameworks/intl`,
      `${app}/Frameworks/libjava_uno.jnilib`,
      ...[
        'swlo',
        'swuilo',
        'swdlo',
        'writerlo',
        'sw_writerfilterlo',
        'mswordlo',
        'vbaswobjlo',
        'sclo',
        'scuilo',
        'scdlo',
        'scnlo',
        'scfiltlo',
        'calclo',
        'vbaobjlo',
        'smlo',
        'smdlo',
        'Engine12',
        'pythonloaderlo',
        'pyuno',
        'LanguageToollo',
        'PresentationMinimizerlo',
        'deploymentgui',
        'updatecheckuilo',
        'updchklo',
        'migrationoo2lo',
        'migrationoo3lo',
        'java_uno',
        'javaloaderlo',
        'javavmlo',
        'juh',
        'juhx',
        'jpipe',
        'jdbclo',
        'hsqldb',
        'officebean',
        'postgresql-sdbc-impllo',
        'postgresql-sdbclo',
        'mysqlclo',
        'mysql_jdbclo',
        'dbplo',
        'abplo',
        'pdfimportlo',
        'solverlo',
        'firebird_sdbclo',
      ].map((name) => `${app}/Frameworks/lib${name}.dylib`),
    ],
    keep: [],
  };
}

const os = { linux: 'linux', win32: 'win', darwin: 'mac' }[process.platform] ?? process.platform;
// On an Intel Mac, VEDRAOPUS_TARGET_ARCH=arm64 fetches the Apple Silicon build (alpha 4). It
// cannot run there, so its smoke test is left out; its libraries are still checked.
const arch = process.env['VEDRAOPUS_TARGET_ARCH'] ?? process.arch;
const cross = arch !== process.arch;
if (cross && os !== 'mac') {
  console.error(`LibreOffice for ${arch} is fetched only on a Mac.`);
  process.exit(1);
}
const target = `${os}-${arch}`;
const root = join(import.meta.dirname, '..');
const out = join(root, 'vendor', 'libreoffice', target);
const force = process.argv.includes('--force');
const archiveArg = process.argv.find((arg) => arg.startsWith('--archive='))?.slice(10);

const build = BUILDS[target];
/** Where the build's programs and libraries are, relative to its folder. */
const libraries = build?.libraries ?? 'program';
if (!build) {
  console.log(
    `No pinned LibreOffice build for ${target}: a deck's charts and SmartArt stay placeholders here.`,
  );
  process.exit(0);
}
if (existsSync(join(out, build.program)) && !force) {
  console.log(`LibreOffice is already in ${out}.`);
  process.exit(0);
}

/** A path pattern as a test: each `*` is any run of characters within one name. */
const patternTest = (pattern) =>
  new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`);
const dropped = build.drop.map(patternTest);
const kept = build.keep.map(patternTest);
const isDropped = (path) =>
  !kept.some((test) => test.test(path)) && dropped.some((test) => test.test(path));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', windowsHide: true, ...options });
  if (result.status !== 0) {
    throw new Error(
      `${command} failed (${result.error?.message ?? `exit code ${result.status}`}).`,
    );
  }
}

async function sha256Of(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

/** The members of a Debian package (an `ar` archive), by name. */
function arMembers(file) {
  const bytes = readFileSync(file);
  if (bytes.toString('latin1', 0, 8) !== '!<arch>\n') throw new Error(`${file} is not a package.`);
  const members = new Map();
  for (let at = 8; at + 60 <= bytes.length;) {
    const name = bytes
      .toString('latin1', at, at + 16)
      .trim()
      .replace(/\/$/, '');
    const size = Number(bytes.toString('latin1', at + 48, at + 58).trim());
    members.set(name, bytes.subarray(at + 60, at + 60 + size));
    at += 60 + size + (size % 2);
  }
  return members;
}

/** Unpack the download into `into`, returning the LibreOffice folder (the one holding `program/`). */
function unpack(archive, into) {
  if (os === 'mac') {
    // The disk image, mounted read-only and hidden, and the app copied out of it.
    const mount = join(into, 'mnt');
    const full = join(into, 'full');
    mkdirSync(mount);
    mkdirSync(full);
    run('hdiutil', [
      'attach',
      '-nobrowse',
      '-readonly',
      '-noautoopen',
      '-mountpoint',
      mount,
      archive,
    ]);
    try {
      run('ditto', [join(mount, 'LibreOffice.app'), join(full, 'LibreOffice.app')]);
    } finally {
      run('hdiutil', ['detach', mount]);
    }
    return full;
  }
  if (os === 'win') {
    // An administrative extract: the files, laid out, and nothing installed or registered.
    run('msiexec', ['/a', `"${archive}"`, '/qn', `TARGETDIR="${into}"`], {
      windowsVerbatimArguments: true,
    });
    return into;
  }
  const tarball = join(into, 'tarball');
  mkdirSync(tarball);
  run('tar', ['-xf', archive, '-C', tarball]);
  const debs = join(tarball, readdirSync(tarball)[0], 'DEBS');
  const tree = join(into, 'tree');
  mkdirSync(tree);
  for (const deb of readdirSync(debs).filter((name) => name.endsWith('.deb'))) {
    const members = arMembers(join(debs, deb));
    const dataName = [...members.keys()].find((name) => name.startsWith('data.tar'));
    if (!dataName) throw new Error(`${deb} has no files in it.`);
    const data = join(into, dataName);
    writeFileSync(data, members.get(dataName));
    run('tar', ['-xf', data, '-C', tree]);
    rmSync(data);
  }
  const opt = join(tree, 'opt');
  const folder = readdirSync(opt).find((name) => name.startsWith('libreoffice'));
  if (!folder) throw new Error('The packages hold no LibreOffice folder.');
  return join(opt, folder);
}

/** The libraries a Windows (PE), Linux (ELF) or macOS (Mach-O) program or library loads when it starts. */
function linkedLibraries(file) {
  const fd = openSync(file, 'r');
  const head = Buffer.alloc(4);
  readSync(fd, head, 0, 4, 0);
  closeSync(fd);
  if (head[0] === 0x4d && head[1] === 0x5a) return peImports(readFileSync(file));
  if (head.toString('latin1') === '\x7fELF') return elfNeeded(readFileSync(file));
  // Mach-O only on macOS: elsewhere, 0xCAFEBABE starts Java class files too.
  const magic = head.readUInt32BE(0);
  if (os === 'mac' && (magic === 0xcafebabe || magic === 0xcffaedfe || magic === 0xcefaedfe)) {
    try {
      return machoLoads(readFileSync(file));
    } catch {
      // Not a Mach-O file after all (a Java class file shares the universal magic).
      return [];
    }
  }
  return [];
}

/**
 * A Mach-O file's load commands that name libraries (LC_LOAD_DYLIB and its
 * weak, re-exported, lazy and upward kinds), each as its file name. A
 * universal file's slices are each read.
 */
function machoLoads(b) {
  if (b.readUInt32BE(0) === 0xcafebabe) {
    const found = [];
    const count = b.readUInt32BE(4);
    for (let i = 0; i < count && 8 + i * 20 + 20 <= b.length; i++) {
      const offset = b.readUInt32BE(8 + i * 20 + 8);
      const size = b.readUInt32BE(8 + i * 20 + 12);
      if (offset + size > b.length || size < 32) continue;
      found.push(...machoLoads(b.subarray(offset, offset + size)));
    }
    return [...new Set(found)];
  }
  const magic = b.readUInt32LE(0);
  if (magic !== 0xfeedfacf && magic !== 0xfeedface) return [];
  const commands = b.readUInt32LE(16);
  let at = magic === 0xfeedfacf ? 32 : 28;
  const names = [];
  const DYLIB = new Set([0xc, 0x80000018, 0x8000001f, 0x20, 0x80000023]);
  for (let i = 0; i < commands && at + 8 <= b.length; i++) {
    const command = b.readUInt32LE(at);
    const size = b.readUInt32LE(at + 4);
    if (DYLIB.has(command)) {
      const start = at + b.readUInt32LE(at + 8);
      const path = b.toString('latin1', start, b.indexOf(0, start));
      names.push(path.slice(path.lastIndexOf('/') + 1));
    }
    if (size === 0) break;
    at += size;
  }
  return names;
}

function peImports(b) {
  const pe = b.readUInt32LE(0x3c);
  if (pe + 24 > b.length || b.readUInt32LE(pe) !== 0x4550) return [];
  const sections = b.readUInt16LE(pe + 6);
  const optSize = b.readUInt16LE(pe + 20);
  const opt = pe + 24;
  const dirBase = opt + (b.readUInt16LE(opt) === 0x20b ? 112 : 96);
  const table = opt + optSize;
  const toOffset = (rva) => {
    for (let i = 0; i < sections; i++) {
      const s = table + i * 40;
      const va = b.readUInt32LE(s + 12);
      const size = Math.max(b.readUInt32LE(s + 8), b.readUInt32LE(s + 16));
      if (rva >= va && rva < va + size) return rva - va + b.readUInt32LE(s + 20);
    }
    return -1;
  };
  const name = (rva) => {
    const at = toOffset(rva);
    if (at < 0) return null;
    return b.toString('latin1', at, b.indexOf(0, at)).toLowerCase();
  };
  const found = [];
  const imports = b.readUInt32LE(dirBase + 8);
  if (imports) {
    for (let d = toOffset(imports); d > 0 && b.readUInt32LE(d + 12) !== 0; d += 20)
      found.push(name(b.readUInt32LE(d + 12)));
  }
  // Delay-loaded libraries load when first used; they are checked the same way.
  const delayed = b.readUInt32LE(dirBase + 13 * 8);
  if (delayed) {
    for (let d = toOffset(delayed); d > 0 && b.readUInt32LE(d + 4) !== 0; d += 32)
      found.push(name(b.readUInt32LE(d + 4)));
  }
  return found.filter(Boolean);
}

function elfNeeded(b) {
  if (b[4] !== 2 || b[5] !== 1) return []; // 64-bit, little-endian only
  const sectionsAt = Number(b.readBigUInt64LE(0x28));
  const entrySize = b.readUInt16LE(0x3a);
  const count = b.readUInt16LE(0x3c);
  const section = (i) => {
    const s = sectionsAt + i * entrySize;
    return {
      type: b.readUInt32LE(s + 4),
      offset: Number(b.readBigUInt64LE(s + 0x18)),
      size: Number(b.readBigUInt64LE(s + 0x20)),
      link: b.readUInt32LE(s + 0x28),
    };
  };
  const found = [];
  for (let i = 0; i < count; i++) {
    const dynamic = section(i);
    if (dynamic.type !== 6) continue; // SHT_DYNAMIC
    const strings = section(dynamic.link);
    for (let at = dynamic.offset; at + 16 <= dynamic.offset + dynamic.size; at += 16) {
      const tag = b.readBigInt64LE(at);
      if (tag === 0n) break;
      if (tag !== 1n) continue; // DT_NEEDED
      const start = strings.offset + Number(b.readBigUInt64LE(at + 8));
      found.push(b.toString('latin1', start, b.indexOf(0, start)));
    }
  }
  return found;
}

/** Kept programs and libraries that load one that was dropped: the trim would not start. */
function brokenLinks(fullProgram, trimmedProgram) {
  const key = (name) => (os === 'win' ? name.toLowerCase() : name);
  const before = new Set(readdirSync(fullProgram).map(key));
  const after = new Set(readdirSync(trimmedProgram).map(key));
  const broken = [];
  for (const name of readdirSync(trimmedProgram)) {
    const file = join(trimmedProgram, name);
    if (!statSync(file).isFile()) continue;
    for (const library of linkedLibraries(file)) {
      if (before.has(key(library)) && !after.has(key(library))) broken.push(`${name} → ${library}`);
    }
  }
  return broken;
}

/** The trimmed build draws the smoke deck, and the drawing holds its words. */
function smokeTest(folder, work) {
  const smoke = join(work, 'smoke');
  mkdirSync(smoke);
  copyFileSync(join(root, 'fixtures', 'libreoffice', 'smoke.pptx'), join(smoke, 'smoke.pptx'));
  const profile = `-env:UserInstallation=${pathToFileURL(join(work, 'profile')).href}`;
  for (const format of [
    'svg',
    'png:impress_png_Export:{"Translucent":{"type":"long","value":"1"}}',
  ]) {
    run(join(folder, build.program), [
      profile,
      '--headless',
      '--norestore',
      '--nolockcheck',
      '--convert-to',
      format,
      '--outdir',
      smoke,
      join(smoke, 'smoke.pptx'),
    ]);
  }
  const svg = existsSync(join(smoke, 'smoke.svg'))
    ? readFileSync(join(smoke, 'smoke.svg'), 'utf8')
    : '';
  const missing = ['Smoke test', 'March', 'Stop'].filter((words) => !svg.includes(words));
  if (missing.length > 0) {
    throw new Error(
      `The smoke test failed: the drawing lacks ${missing.map((w) => `"${w}"`).join(', ')}.`,
    );
  }
  if (!existsSync(join(smoke, 'smoke.png')) || statSync(join(smoke, 'smoke.png')).size < 1000) {
    throw new Error('The smoke test failed: no picture was drawn.');
  }
}

function sizeOf(folder) {
  let total = 0;
  for (const entry of readdirSync(folder, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) total += statSync(join(entry.parentPath, entry.name)).size;
  }
  return total;
}

const work = mkdtempSync(join(tmpdir(), 'vedraopus-libreoffice-'));
const staging = join(root, 'vendor', 'libreoffice', `.staging-${target}`);
try {
  let archive = archiveArg;
  if (!archive) {
    archive = join(work, build.file);
    const url = `${RELEASE}/${build.folder}/${build.file}`;
    console.log(`Downloading ${build.file} (a few hundred MB) …`);
    const response = await fetch(url);
    if (!response.ok || !response.body)
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(archive));
  }
  const sha256 = await sha256Of(archive);
  if (sha256 !== build.sha256) {
    throw new Error(
      `Checksum mismatch for ${build.file}: expected ${build.sha256}, got ${sha256}. Nothing was unpacked.`,
    );
  }
  console.log('Unpacking …');
  const unpacked = join(work, 'unpacked');
  mkdirSync(unpacked);
  const full = unpack(archive, unpacked);

  console.log('Keeping what drawing a deck needs …');
  rmSync(staging, { recursive: true, force: true });
  cpSync(full, staging, {
    recursive: true,
    verbatimSymlinks: true,
    filter: (source) => {
      const path = relative(full, source).split(sep).join('/');
      return path === '' || !isDropped(path);
    },
  });
  if (os === 'win') {
    // The Visual C++ runtime the installer would put in Windows, beside the programs that use it.
    const runtime = join(full, 'System64');
    for (const name of readdirSync(runtime))
      copyFileSync(join(runtime, name), join(staging, 'program', name));
    rmSync(join(staging, 'System64'), { recursive: true, force: true });
  }
  // Links left pointing at what was dropped.
  for (const entry of readdirSync(staging, { withFileTypes: true, recursive: true })) {
    const path = join(entry.parentPath, entry.name);
    if (entry.isSymbolicLink() && !existsSync(path)) rmSync(path);
  }
  const broken = brokenLinks(join(full, libraries), join(staging, libraries));
  if (broken.length > 0) {
    throw new Error(`The trim drops libraries that kept ones load:\n  ${broken.join('\n  ')}`);
  }

  if (os === 'mac') {
    // Removing files breaks the bundle's seal: sign it again, ad hoc, and check it. A
    // release signs it with the Developer ID when the app is packaged (docs/releasing.md).
    const bundle = join(staging, 'LibreOffice.app');
    run('codesign', ['--force', '--deep', '--sign', '-', bundle], { stdio: 'ignore' });
    run('codesign', ['--verify', '--deep', '--strict', bundle]);
  }

  if (cross) {
    console.log(
      `(LibreOffice for ${arch} cannot run on this Mac, so the smoke deck was not drawn.)`,
    );
  } else {
    console.log('Drawing the smoke deck …');
    smokeTest(staging, work);
  }

  const fullSize = sizeOf(full);
  const size = sizeOf(staging);
  writeFileSync(
    join(staging, 'SOURCE.txt'),
    [
      `LibreOffice ${VERSION}, ${build.file}`,
      `from ${RELEASE}/${build.folder}/${build.file}`,
      `SHA-256 ${build.sha256}`,
      `Trimmed by scripts/fetch-libreoffice.mjs to ${Math.round(size / 1e6)} MB of ${Math.round(fullSize / 1e6)} MB.`,
      'Licence: Mozilla Public License 2.0 (see LICENSE.html and NOTICE beside this file).',
      `Source: https://download.documentfoundation.org/libreoffice/src/${VERSION}/`,
      '',
    ].join('\n'),
  );
  rmSync(out, { recursive: true, force: true });
  renameSync(staging, out);
  console.log(
    `LibreOffice is in ${out}: ${Math.round(size / 1e6)} MB, trimmed from ${Math.round(fullSize / 1e6)} MB.`,
  );
} catch (error) {
  rmSync(staging, { recursive: true, force: true });
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}

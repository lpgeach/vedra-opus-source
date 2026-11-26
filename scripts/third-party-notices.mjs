/**
 * The npm packages built into a bundle, with their licences (docs/briefs/R2-notices-and-sources.md).
 *
 * A Vite plugin: after a build, it reads the bundle's module graph and writes
 * `third-party-notices.json` beside it, listing each third-party package whose
 * code or styles went in: its name, version, licence, and the text of its
 * licence and notice files. Our own workspace packages are left out.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const NOTICES_FILE = 'third-party-notices.json';

/** The folder of the npm package a module id belongs to, or null for one outside node_modules. */
export function packageRootOf(moduleId) {
  const path = moduleId.replace(/^\0/, '').split('?')[0].replace(/\\/g, '/');
  const at = path.lastIndexOf('/node_modules/');
  if (at < 0) return null;
  const rest = path.slice(at + '/node_modules/'.length).split('/');
  const segments = rest[0]?.startsWith('@') ? 2 : 1;
  if (rest.length < segments || !rest[segments - 1]) return null;
  return `${path.slice(0, at)}/node_modules/${rest.slice(0, segments).join('/')}`;
}

const LICENCE_FILE = /^(licen[cs]e|copying|notice)([-._].*)?$/i;

/** The licence named in a package.json, in any of the forms npm has used. */
export function licenceName(manifest) {
  const { license, licenses } = manifest;
  if (typeof license === 'string') return license;
  if (license && typeof license.type === 'string') return license.type;
  if (Array.isArray(licenses)) {
    const names = licenses
      .map((each) => (typeof each === 'string' ? each : each?.type))
      .filter(Boolean);
    if (names.length) return names.join(' OR ');
  }
  return 'UNKNOWN';
}

/**
 * The standard text of a licence, for a package that names it but carries no licence file
 * (TipTap's packages, for one). Only licences whose whole text is short and fixed are here.
 */
const STANDARD_TEXT = {
  MIT: `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,
};

/** Who a package.json says made the package, or null. */
function authorOf(manifest) {
  const { author } = manifest;
  if (typeof author === 'string') return author.replace(/\s*[<(].*$/, '').trim() || null;
  if (author && typeof author.name === 'string') return author.name;
  return null;
}

/** One package's entry: name, version, licence and the text of its licence and notice files. */
export function describePackage(root) {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const files = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && LICENCE_FILE.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
  const text = files
    .map((name) => readFileSync(join(root, name), 'utf8').trim())
    .filter(Boolean)
    .join('\n\n');
  const licence = licenceName(manifest);
  if (text)
    return { name: manifest.name, version: manifest.version, licence, text, standard: false };
  // No licence file: the licence's standard text, with the copyright its package.json gives.
  const standard = STANDARD_TEXT[licence];
  const author = authorOf(manifest);
  return {
    name: manifest.name,
    version: manifest.version,
    licence,
    text: standard
      ? `${licence} License\n\nCopyright (c) ${author ?? `the ${manifest.name} authors`}\n\n${standard}`
      : null,
    standard: Boolean(standard),
  };
}

/** The entries for a set of module ids, one per package and version, by name. */
export function collectNotices(moduleIds, isOwn = (name) => name.startsWith('@vedraopus/')) {
  const roots = new Set();
  for (const id of moduleIds) {
    const root = packageRootOf(id);
    if (root && existsSync(join(root, 'package.json'))) roots.add(root);
  }
  const byKey = new Map();
  for (const root of roots) {
    const entry = describePackage(root);
    if (!entry.name || isOwn(entry.name)) continue;
    byKey.set(`${entry.name}@${entry.version}`, entry);
  }
  return [...byKey.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  );
}

/** The plugin: `third-party-notices.json` beside the bundle, after each build. */
export function thirdPartyNotices() {
  return {
    name: 'vedraopus-third-party-notices',
    apply: 'build',
    generateBundle() {
      const packages = collectNotices(this.getModuleIds());
      this.emitFile({
        type: 'asset',
        fileName: NOTICES_FILE,
        source: `${JSON.stringify({ packages }, null, 2)}\n`,
      });
    },
  };
}

#!/usr/bin/env node
/**
 * Build the Insert → Icons and Illustrations library (docs/briefs/P9.8-icons-library.md)
 * from two pinned npm packages:
 *
 * - lucide-static 1.77.0: Lucide's icons (ISC licence);
 * - react-open-doodles 1.0.5: Pablo Stanley's Open Doodles (the drawings are CC0;
 *   the package that carries them is MIT).
 *
 * Each tarball is checked against the registry's SHA-512 before it is unpacked.
 * Nothing is installed and none of the packages' code is run: the drawings are turned into plain data (an element, its
 * attributes and its children, with colours named `ink` and `accent`) and
 * written to apps/desktop/src/renderer/library/, with the licences beside the
 * app's other notices in apps/desktop/resources/licences/. The output is
 * committed; run this again only to change the pinned versions.
 *
 *   node scripts/build-library.mjs
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';

const PACKAGES = {
  lucide: {
    name: 'lucide-static',
    version: '1.77.0',
    integrity:
      'sha512-v+BzpQrjlwDRWPDzzAu5IFhOkI6jVKb91fsjw1ZSS7Tsb2YvRX5olRN0DXGW99LF2wV4fycuTf5aPOMC62ZW0g==',
  },
  doodles: {
    name: 'react-open-doodles',
    version: '1.0.5',
    integrity:
      'sha512-TGYuRDL2XX2PG/9ZH2MXfYi/vbQLRnvqPxfzNRc4X3Nxmsiz93kIRmT5OWbItadvqEwZTD4IncwHMSLOTUvSZQ==',
  },
};

const root = join(import.meta.dirname, '..');
const dataDir = join(root, 'apps', 'desktop', 'src', 'renderer', 'library');
const licenceDir = join(root, 'apps', 'desktop', 'resources', 'licences');

/** "a-arrow-down" or "ReadingSide" → "A arrow down" or "Reading side". */
const titleOf = (name) => {
  const words = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
  const text = words.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};
const keyOf = (name) => titleOf(name).toLowerCase().replace(/\s+/g, '-');

/** React's prop names to SVG's attribute names. */
const attrName = (name) =>
  ({ className: 'class', xlinkHref: 'xlink:href', viewBox: 'viewBox' })[name] ??
  name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/** Paints the drawing's own colour slots use. */
const paint = (value) => (value === 'currentColor' ? 'ink' : String(value));

async function unpack(work, { name, version, integrity }) {
  const url = `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`;
  console.log(`Downloading ${name}@${version} …`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const got = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  if (got !== integrity) {
    throw new Error(`Checksum mismatch for ${name}@${version}: expected ${integrity}, got ${got}.`);
  }
  const archive = join(work, `${name}.tgz`);
  writeFileSync(archive, bytes);
  const into = join(work, name);
  mkdirSync(into);
  // Relative names: GNU tar reads "C:" in a Windows path as a remote host.
  const tar = spawnSync('tar', ['-xzf', `${name}.tgz`, '-C', name], {
    cwd: work,
    stdio: 'inherit',
  });
  if (tar.status !== 0) throw new Error(`Unpacking ${name} failed.`);
  return join(into, 'package');
}

function lucide(dir) {
  const icons = JSON.parse(readFileSync(join(dir, 'icon-nodes.json'), 'utf8'));
  const tags = JSON.parse(readFileSync(join(dir, 'tags.json'), 'utf8'));
  const items = Object.keys(icons)
    .sort()
    .map((name) => ({
      key: name,
      title: titleOf(name),
      tags: tags[name] ?? [],
      // Lucide draws every icon in its own stroke: round ends and joins, no fill.
      nodes: [
        {
          tag: 'g',
          attrs: {
            fill: 'none',
            stroke: 'ink',
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          },
          children: icons[name].map(([tag, attrs]) => ({
            tag,
            attrs: Object.fromEntries(
              Object.entries(attrs)
                .filter(([key]) => key !== 'key')
                .map(([key, value]) => [
                  key,
                  key === 'fill' || key === 'stroke' ? paint(value) : String(value),
                ]),
            ),
            children: [],
          })),
        },
      ],
    }));
  return {
    library: 'lucide',
    source: `${PACKAGES.lucide.name}@${PACKAGES.lucide.version}`,
    viewBox: { width: 24, height: 24 },
    strokeWidth: 2,
    items,
  };
}

/**
 * The package's components are `React.createElement(tag, { props }, ...children)`
 * calls. They are read as text with the TypeScript parser and never run: every
 * prop must be a string or number, or `ink` / `accent` (the two colours).
 */
function doodles(dir) {
  const code = readFileSync(join(dir, 'dist', 'index.es.js'), 'utf8');
  const file = ts.createSourceFile('index.es.js', code, ts.ScriptTarget.Latest, true);
  const isCreate = (node) =>
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.expression.getText(file) === 'React' &&
    node.expression.name.text === 'createElement';
  const valueOf = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isNumericLiteral(node)) return node.text;
    if (ts.isIdentifier(node) && (node.text === 'ink' || node.text === 'accent')) return node.text;
    throw new Error(`Unexpected value in a doodle: ${node.getText(file).slice(0, 60)}`);
  };
  const convert = (call) => {
    const [tagNode, propsNode, ...childNodes] = call.arguments;
    const attrs = {};
    if (propsNode && ts.isObjectLiteralExpression(propsNode)) {
      for (const property of propsNode.properties) {
        if (!ts.isPropertyAssignment(property)) throw new Error('Unexpected prop in a doodle.');
        const key = property.name.getText(file).replace(/^["']|["']$/g, '');
        if (key === 'xmlns') continue;
        const name = attrName(key);
        const value = valueOf(property.initializer);
        attrs[name] = name === 'fill' || name === 'stroke' ? paint(value) : value;
      }
    } else if (propsNode && propsNode.kind !== ts.SyntaxKind.NullKeyword) {
      throw new Error('Unexpected props in a doodle.');
    }
    return { tag: valueOf(tagNode), attrs, children: childNodes.filter(isCreate).map(convert) };
  };
  // Each component is `var NameDoodle = function (_a) { …; return (React.createElement("svg", …)); };`
  const found = [];
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text.endsWith('Doodle')
    ) {
      let svg = null;
      const search = (inner) => {
        if (!svg && isCreate(inner)) svg = inner;
        else if (!svg) ts.forEachChild(inner, search);
      };
      ts.forEachChild(node, search);
      if (svg) found.push([node.name.text, convert(svg)]);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  const items = found
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, svg]) => {
      const [, , width, height] = svg.attrs.viewBox.split(/\s+/).map(Number);
      const base = name.replace(/Doodle$/, '');
      return {
        key: keyOf(base),
        title: titleOf(base),
        tags: ['person', 'people', 'doodle', ...titleOf(base).toLowerCase().split(' ')],
        viewBox: { width, height },
        nodes: svg.children,
      };
    });
  return {
    library: 'openDoodles',
    source: `${PACKAGES.doodles.name}@${PACKAGES.doodles.version}`,
    viewBox: items[0].viewBox,
    strokeWidth: null,
    items,
  };
}

const work = mkdtempSync(join(tmpdir(), 'vedraopus-library-'));
try {
  const lucideDir = await unpack(work, PACKAGES.lucide);
  const doodlesDir = await unpack(work, PACKAGES.doodles);
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(licenceDir, { recursive: true });
  writeFileSync(join(dataDir, 'lucide.json'), `${JSON.stringify(lucide(lucideDir))}\n`);
  writeFileSync(join(dataDir, 'open-doodles.json'), `${JSON.stringify(doodles(doodlesDir))}\n`);
  writeFileSync(
    join(licenceDir, 'lucide.txt'),
    `Lucide icons (${PACKAGES.lucide.name}@${PACKAGES.lucide.version}), https://lucide.dev\n\n${readFileSync(join(lucideDir, 'LICENSE'), 'utf8')}`,
  );
  writeFileSync(
    join(licenceDir, 'open-doodles.txt'),
    `Open Doodles by Pablo Stanley, https://www.opendoodles.com\n\nThe drawings are dedicated to the public domain under CC0 1.0 Universal\n(https://creativecommons.org/publicdomain/zero/1.0/). They were taken from\n${PACKAGES.doodles.name}@${PACKAGES.doodles.version}, whose own code is under this licence:\n\n${readFileSync(join(doodlesDir, 'LICENSE'), 'utf8')}`,
  );
  console.log(`The library is in ${dataDir}.`);
} finally {
  rmSync(work, { recursive: true, force: true });
}

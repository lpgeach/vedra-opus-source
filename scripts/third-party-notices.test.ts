import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  collectNotices,
  describePackage,
  licenceName,
  packageRootOf,
} from './third-party-notices.mjs';

/** The build's list of npm packages and their licences (docs/briefs/R2-notices-and-sources.md). */

const modules = resolve(import.meta.dirname, '..', 'node_modules');

describe('the third-party notices plugin', () => {
  it('finds the package a module id belongs to, scoped, nested or with a query', () => {
    expect(packageRootOf('/repo/node_modules/react/cjs/react.production.js')).toBe(
      '/repo/node_modules/react',
    );
    expect(packageRootOf('C:\\repo\\node_modules\\@tiptap\\core\\dist\\index.js')).toBe(
      'C:/repo/node_modules/@tiptap/core',
    );
    expect(packageRootOf('/repo/node_modules/a/node_modules/b/index.js?v=1')).toBe(
      '/repo/node_modules/a/node_modules/b',
    );
    expect(packageRootOf('\0/repo/node_modules/@fontsource/inter/400.css')).toBe(
      '/repo/node_modules/@fontsource/inter',
    );
    expect(packageRootOf('/repo/packages/model/src/index.ts')).toBeNull();
    expect(packageRootOf('\0vite/preload-helper')).toBeNull();
  });

  it('reads a licence however package.json names it', () => {
    expect(licenceName({ license: 'MIT' })).toBe('MIT');
    expect(licenceName({ license: { type: 'ISC' } })).toBe('ISC');
    expect(licenceName({ licenses: [{ type: 'MIT' }, 'Apache-2.0'] })).toBe('MIT OR Apache-2.0');
    expect(licenceName({})).toBe('UNKNOWN');
  });

  it('keeps a package’s own licence text, or gives the standard text when it has no file', () => {
    const react = describePackage(join(modules, 'react'));
    expect(react).toMatchObject({ name: 'react', licence: 'MIT', standard: false });
    expect(react.text).toContain('Permission is hereby granted');
    expect(react.text).toContain('Copyright (c) Meta Platforms');

    // TipTap's packages name MIT but carry no licence file.
    const tiptap = describePackage(join(modules, '@tiptap', 'core'));
    expect(tiptap).toMatchObject({ name: '@tiptap/core', licence: 'MIT', standard: true });
    expect(tiptap.text).toMatch(/^MIT License\n\nCopyright \(c\) /);
    expect(tiptap.text).toContain('Permission is hereby granted');
  });

  it('lists each package once, by name, and leaves our own out', () => {
    const list = collectNotices([
      join(modules, 'react', 'index.js'),
      join(modules, 'react', 'cjs', 'react.production.js'),
      join(modules, 'zod', 'index.js'),
      join(modules, '@vedraopus', 'model', 'src', 'index.ts'),
      '/repo/packages/model/src/index.ts',
    ]);
    expect(list.map((each) => each.name)).toEqual(['react', 'zod']);
  });
});

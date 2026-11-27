import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The help pages (docs/briefs/B26-help-wiki.md) hold together: every link between pages
 * reaches a page (and a heading on it, when it names one), every picture exists, and every
 * page is in the contents.
 */

const help = import.meta.dirname;
const pages = readdirSync(help).filter((name) => name.endsWith('.md'));
const text = (page: string) => readFileSync(join(help, page), 'utf8');

/** A heading's anchor as GitHub makes it: lower case, punctuation gone, spaces to hyphens. */
function anchor(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/ /g, '-');
}

function anchorsOf(page: string): Set<string> {
  return new Set([...text(page).matchAll(/^#{1,6} (.+)$/gm)].map((match) => anchor(match[1]!)));
}

describe('the help pages', () => {
  it('include the contents page', () => {
    expect(pages).toContain('README.md');
  });

  it.each(pages)('%s: every link to a page, a heading or a picture leads somewhere', (page) => {
    const broken: string[] = [];
    for (const [, target] of text(page).matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^[a-z]+:/i.test(target!)) continue; // A web address.
      const [file, hash] = target!.split('#');
      const path = file ? join(help, file) : join(help, page);
      if (!existsSync(path)) {
        broken.push(target!);
        continue;
      }
      if (hash && path.endsWith('.md') && !anchorsOf(file || page).has(hash)) broken.push(target!);
    }
    expect(broken).toEqual([]);
  });

  it('list every page in the contents', () => {
    const contents = text('README.md');
    const missing = pages.filter((page) => page !== 'README.md' && !contents.includes(`(${page})`));
    expect(missing).toEqual([]);
  });

  it('give every picture alt text', () => {
    const bare = pages.flatMap((page) =>
      [...text(page).matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)]
        .filter((match) => match[1]!.trim() === '')
        .map((match) => `${page}: ${match[2]}`),
    );
    expect(bare).toEqual([]);
  });
});

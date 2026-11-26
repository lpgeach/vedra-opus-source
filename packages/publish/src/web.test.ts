import {
  createEmptyProject,
  createTextObject,
  createWebObject,
  parseProject,
  createGraphicObject,
  createGroupObject,
  createShapeObject,
} from '@vedraopus/model';
import type { Project } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { courseDataScript, indexHtml, publishWeb, PublishCancelled } from './index';

const HASH = 'a'.repeat(64);

function projectWithAsset(): Project {
  const project = createEmptyProject('A <b>&"course"</b>');
  project.assets[HASH] = {
    kind: 'image',
    fileName: 'x.png',
    ext: 'png',
    mimeType: 'image/png',
    byteLength: 3,
  };
  return project;
}

function collect(project: Project, extra: Partial<Parameters<typeof publishWeb>[1]> = {}) {
  const written = new Map<string, string | Uint8Array>();
  const progress: Array<[number, number]> = [];
  const run = publishWeb(project, {
    player: { js: 'PLAYER_JS', css: 'PLAYER_CSS' },
    readAsset: async () => new Uint8Array([1, 2, 3]),
    write: async (path, data) => void written.set(path, data),
    onProgress: (done, total) => progress.push([done, total]),
    ...extra,
  });
  return { run, written, progress };
}

describe('publishWeb', () => {
  it('writes the page, the player, the data and every asset', async () => {
    const { run, written, progress } = collect(projectWithAsset());
    const report = await run;
    expect(report.files.sort()).toEqual(
      [
        'content/assets/' + HASH + '.png',
        'content/data.js',
        'index.html',
        'player/player.css',
        'player/player.js',
      ].sort(),
    );
    expect(written.get('player/player.js')).toBe('PLAYER_JS');
    expect(written.get('content/assets/' + HASH + '.png')).toEqual(new Uint8Array([1, 2, 3]));
    expect(progress.at(-1)).toEqual([5, 5]);
    expect(progress.map(([d]) => d)).toEqual([1, 2, 3, 4, 5]);
  });

  it('assigns the project to a global that parses back to the same project', async () => {
    const project = projectWithAsset();
    project.scenes[0]!.slides[0]!.baseLayer.objects.push(
      createTextObject('</script><script>alert(1)</script>    '),
    );
    const script = courseDataScript(project);
    expect(script.startsWith('window.VEDRAOPUS_COURSE = ')).toBe(true);
    // Nothing inside can end the script early or break an older parser.
    expect(script).not.toContain('</');
    expect(script).not.toContain(' ');
    expect(script).not.toContain(' ');
    const evaluated = new Function('window', `${script}; return window.VEDRAOPUS_COURSE;`)({});
    expect(parseProject(evaluated)).toEqual(project);
  });

  it('uses the given title, escaped, for the page and the course', async () => {
    const { run, written } = collect(projectWithAsset(), { title: '  Safety <101>  ' });
    await run;
    expect(written.get('index.html')).toContain('<title>Safety &lt;101&gt;</title>');
    expect(written.get('content/data.js')).toContain('"title": "Safety \\u003c101>"');
    expect(indexHtml('x')).toContain('content/assets/');
  });

  it('refuses asset names that could escape the folder', async () => {
    for (const bad of ['../../etc/passwd', 'a'.repeat(63) + '/']) {
      const project = projectWithAsset();
      project.assets[bad] = project.assets[HASH]!;
      delete project.assets[HASH];
      const { run, written } = collect(project);
      await expect(run).rejects.toThrow(/unusable name/);
      expect(written.size).toBe(0);
    }
    const project = projectWithAsset();
    project.assets[HASH]!.ext = '../x';
    await expect(collect(project).run).rejects.toThrow(/unusable name/);
  });

  it('stops between files when cancelled', async () => {
    const controller = { aborted: false };
    const written: string[] = [];
    const run = publishWeb(projectWithAsset(), {
      player: { js: 'j', css: 'c' },
      readAsset: async () => new Uint8Array(),
      write: async (path) => {
        written.push(path);
        if (written.length === 2) controller.aborted = true;
      },
      signal: controller,
    });
    await expect(run).rejects.toBeInstanceOf(PublishCancelled);
    expect(written).toEqual(['player/player.js', 'player/player.css']);
  });
});

describe('publishWeb and web objects (P9.6)', () => {
  const PAGE = 'c'.repeat(64);
  const SCRIPT = 'd'.repeat(64);
  function withFolder(alsoUsed = false) {
    const project = projectWithAsset();
    project.assets[PAGE] = {
      kind: 'file',
      fileName: 'index.html',
      ext: 'html',
      mimeType: 'text/html',
      byteLength: 3,
    };
    project.assets[SCRIPT] = {
      kind: 'file',
      fileName: 'app.js',
      ext: 'js',
      mimeType: 'text/javascript',
      byteLength: 3,
    };
    const web = createWebObject({
      kind: 'folder',
      files: { 'index.html': PAGE, 'js/my app.js': SCRIPT },
      entry: 'index.html',
    });
    project.scenes[0]!.slides[0]!.baseLayer.objects.push(web);
    if (alsoUsed)
      project.player.tabs.resources.items.push({
        id: 'res_a',
        title: 'Script',
        target: { kind: 'file', asset: SCRIPT },
      });
    return { project, web };
  }

  it('writes a folder under content/web/<id>/ by its paths, and not again among the assets', async () => {
    const { project, web } = withFolder();
    const { run, written } = collect(project);
    const report = await run;
    expect(report.files).toEqual(
      expect.arrayContaining([
        `content/web/${web.id}/index.html`,
        `content/web/${web.id}/js/my app.js`,
      ]),
    );
    expect(written.has(`content/assets/${PAGE}.html`)).toBe(false);
    expect(written.has(`content/assets/${SCRIPT}.js`)).toBe(false);
    // The ordinary asset is still written.
    expect(written.has(`content/assets/${HASH}.png`)).toBe(true);
  });

  it('writes a folder file among the assets too when something else uses it', async () => {
    const { project } = withFolder(true);
    const { run, written } = collect(project);
    await run;
    expect(written.has(`content/assets/${SCRIPT}.js`)).toBe(true);
  });

  it('tells the player where folders are, and in Preview not to load addresses', () => {
    expect(indexHtml('T')).toContain(
      "webUrl: function (id, path) { return 'content/web/' + id + '/' + path; }",
    );
    expect(indexHtml('T')).not.toContain('remoteWeb');
    expect(indexHtml('T', undefined, '', true)).toContain('remoteWeb: false');
  });
});

describe('the icons and illustrations library’s notices (P9.8, Luke, session 76)', () => {
  const graphic = (library: 'lucide' | 'openDoodles') =>
    createGraphicObject({
      library,
      key: 'heart',
      title: 'Heart',
      viewBox: { width: 24, height: 24 },
      strokeWidth: library === 'lucide' ? 2 : null,
      nodes: [{ tag: 'circle', attrs: { cx: '12', cy: '12', r: '8' }, children: [] }],
    });
  const notices = { lucide: 'ISC License: Lucide', openDoodles: 'CC0: Open Doodles' };

  it('a course with Lucide icons carries their notice, and one with doodles theirs', async () => {
    const project = projectWithAsset();
    project.scenes[0]!.slides[0]!.baseLayer.objects.push(graphic('lucide'));
    const { run, written } = collect(project, { notices });
    const report = await run;
    expect(report.files).toContain('THIRD-PARTY-NOTICES.txt');
    const text = written.get('THIRD-PARTY-NOTICES.txt') as string;
    expect(text).toContain('ISC License: Lucide');
    expect(text).not.toContain('Open Doodles');
    // Inside a group too, and both sets.
    project.scenes[0]!.slides[0]!.baseLayer.objects.push(
      createGroupObject([graphic('openDoodles'), createShapeObject({ kind: 'rect' })]),
    );
    const both = collect(project, { notices });
    await both.run;
    const second = both.written.get('THIRD-PARTY-NOTICES.txt') as string;
    expect(second.indexOf('Lucide')).toBeLessThan(second.indexOf('Open Doodles'));
  });

  it('a course without the library carries no notices file', async () => {
    const { run } = collect(projectWithAsset(), { notices });
    expect((await run).files).not.toContain('THIRD-PARTY-NOTICES.txt');
  });

  it('every course carries the notices of the libraries built into its player (R2)', async () => {
    const libraries = [
      { name: 'immer', version: '11.2.10', licence: 'MIT', text: 'MIT License: Immer' },
      { name: 'zod', version: '4.6.7', licence: 'MIT', text: null },
    ];
    const player = { js: 'PLAYER_JS', css: 'PLAYER_CSS', libraries };
    const plain = collect(projectWithAsset(), { player, notices });
    expect((await plain.run).files).toContain('THIRD-PARTY-NOTICES.txt');
    const text = plain.written.get('THIRD-PARTY-NOTICES.txt') as string;
    expect(text).toContain(
      'The course player (player/player.js) includes the following libraries.',
    );
    expect(text).toContain('immer 11.2.10 (MIT)\n\nMIT License: Immer');
    // A library with no text keeps its licence's name.
    expect(text).toContain('zod 4.6.7 (MIT)\n\nLicence: MIT');
    expect(text).not.toContain('pictures');
    // With icons too: the player's libraries first, then the sets.
    const project = projectWithAsset();
    project.scenes[0]!.slides[0]!.baseLayer.objects.push(graphic('lucide'));
    const both = collect(project, { player, notices });
    await both.run;
    const combined = both.written.get('THIRD-PARTY-NOTICES.txt') as string;
    expect(combined.indexOf('Immer')).toBeLessThan(combined.indexOf('ISC License: Lucide'));
  });

  it('refuses to publish icons without their notice', async () => {
    const project = projectWithAsset();
    project.scenes[0]!.slides[0]!.baseLayer.objects.push(graphic('lucide'));
    await expect(collect(project).run).rejects.toThrow(
      'The course uses Lucide icons, but their licence notice was not found.',
    );
  });
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseProject, serializeProject } from '@vedraopus/model';
import { afterEach, describe, expect, it } from 'vitest';
import { convertStoryline, RELATIVE_FILE } from './convert';
import {
  besideStory,
  byProportions,
  importStorylineFile,
  linkedFiles,
  useAspects,
} from './import-file';
import { testStoryPackage, testStoryParts, writeTestStory } from './test-story';

/** The Sample B report's last lines that can be settled from the file (docs/briefs/B15-linked-files-and-proportions.md). */

const folders: string[] = [];
const scratch = () => {
  const dir = mkdtempSync(join(tmpdir(), 'vo-b15-'));
  folders.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** The test course with a button on slide 2 that opens `path`. */
function linking(path: string) {
  const parts = testStoryParts();
  const slide2 = parts.get('story/slides/slide2.xml')!.toString('utf8');
  const trig =
    `<trig type="user"><data enabled="true" event="OnClick" action="jumpToFileUrl" actSubType="next">` +
    `<other open="${path}" /></data><condLst /></trig>`;
  parts.set(
    'story/slides/slide2.xml',
    Buffer.from(
      slide2.replace(
        '</shapeLst>',
        `<rect g="40000000-0000-4000-8000-000000000001" name="Open it" zOrder="50"><sldSz w="960" h="540" /><loc l="0" t="0" r="100" b="40" /><trigLst>${trig}</trigLst></rect></shapeLst>`,
      ),
    ),
  );
  return parts;
}

const opener = (project: ReturnType<typeof convertStoryline>['project']) => {
  const slide = project.scenes[0]!.slides[1]!;
  const button = slide.baseLayer.objects.find((object) => object.name === 'Open it')!;
  return slide.triggers.find((trigger) => trigger.owner.id === button.id)?.action;
};

describe('files a course opens beside it (B15)', () => {
  it('takes only relative paths that stay beside the course', () => {
    for (const path of ['external_files/notes.pdf', 'notes.pdf', 'a b/c-d_e.PDF', 'x\\y.pdf'])
      expect(RELATIVE_FILE.test(path), path).toBe(true);
    for (const path of [
      '../notes.pdf',
      'a/../../b.pdf',
      '/etc/passwd',
      '\\\\server\\share\\x.pdf',
      'C:\\notes.pdf',
      'javascript:alert(1)',
      'file:///c:/x.pdf',
      'a?b.pdf',
    ])
      expect(RELATIVE_FILE.test(path), path).toBe(false);
  });

  it('opens a file it brought in, or else the same path beside the published course', () => {
    const parts = linking('external_files/notes.pdf');
    const found = convertStoryline(testStoryPackage(parts), {
      fileName: 'Test course',
      media: () => null,
      externalFile: (path) => (path === 'external_files/notes.pdf' ? 'c'.repeat(64) : null),
    });
    expect(opener(found.project)).toEqual({ type: 'openFile', asset: 'c'.repeat(64) });
    expect(found.report.filter((item) => item.slide === 2)).toEqual([]);

    const missing = convertStoryline(testStoryPackage(parts), {
      fileName: 'Test course',
      media: () => null,
    });
    expect(opener(missing.project)).toEqual({ type: 'openUrl', url: 'external_files/notes.pdf' });
    expect(missing.report.filter((item) => item.slide === 2).map((item) => item.outcome)).toEqual([
      'placeholder',
    ]);
    expect(() => parseProject(JSON.parse(serializeProject(missing.project)))).not.toThrow();
  });

  it('still leaves out a link that would reach outside the course', () => {
    const { project, report } = convertStoryline(testStoryPackage(linking('../secret.pdf')), {
      fileName: 'Test course',
      media: () => null,
    });
    expect(opener(project)).toBeUndefined();
    expect(report.filter((item) => item.slide === 2).map((item) => item.outcome)).toEqual([
      'skipped',
    ]);
  });

  it('lists the relative paths a course opens, and finds one beside the .story only', () => {
    expect(linkedFiles(testStoryPackage(linking('external_files/notes.pdf')))).toEqual([
      'external_files/notes.pdf',
    ]);
    expect(linkedFiles(testStoryPackage(linking('https://example.com/x.pdf')))).toEqual([]);
    const dir = scratch();
    const story = join(dir, 'course.story');
    mkdirSync(join(dir, 'external_files'));
    writeFileSync(join(dir, 'external_files', 'notes.pdf'), '%PDF-1.4 notes');
    writeFileSync(join(dir, 'loose.pdf'), '%PDF-1.4 loose');
    expect(besideStory(story, 'external_files/notes.pdf')).toBe(
      join(dir, 'external_files', 'notes.pdf'),
    );
    // By its name alone, beside the .story.
    expect(besideStory(story, 'external_files/loose.pdf')).toBe(join(dir, 'loose.pdf'));
    expect(besideStory(story, 'external_files/none.pdf')).toBeNull();
  });

  it('brings a linked PDF beside the .story into the course, opened by its trigger', async () => {
    const dir = scratch();
    const story = join(dir, 'course.story');
    await writeTestStory(story, linking('external_files/notes.pdf'));
    mkdirSync(join(dir, 'external_files'));
    writeFileSync(join(dir, 'external_files', 'notes.pdf'), '%PDF-1.4 our own notes');
    const { project, report } = await importStorylineFile(story, join(dir, 'workspace'), 'course');
    const action = opener(project);
    expect(action?.type).toBe('openFile');
    if (action?.type !== 'openFile') return;
    expect(project.assets[action.asset]).toMatchObject({ kind: 'file', ext: 'pdf' });
    expect(report).toEqual([]);
  });
});

describe('a picture settled by its proportions (B15)', () => {
  const candidates = [
    { part: 'story/media/thumb.jpg', size: { width: 30, height: 18 } },
    { part: 'story/media/slide.jpg', size: { width: 984, height: 602 } },
    { part: 'story/media/asset.png', size: { width: 97, height: 51 } },
    { part: 'story/media/other.jpg', size: { width: 120, height: 73 } },
  ];

  it('takes the one file the shape of its pictures fits', () => {
    // Sample B's picture: shown at 85.1 × 44.75.
    expect(byProportions(candidates, [85.1 / 44.75], 'Png')).toBe('story/media/asset.png');
  });

  it('settles a tie by the recorded type, and leaves what it cannot settle', () => {
    const twins = [
      { part: 'story/media/a.jpg', size: { width: 200, height: 100 } },
      { part: 'story/media/b.png', size: { width: 400, height: 200 } },
    ];
    expect(byProportions(twins, [2], 'Png')).toBe('story/media/b.png');
    expect(byProportions(twins, [2], 'Gif')).toBeNull();
    expect(byProportions(candidates, [], 'Png')).toBeNull();
    expect(byProportions(candidates, [5], 'Png')).toBeNull();
  });

  it('reads the proportions of the pictures that show an item whole', () => {
    const g = '50000000-0000-4000-8000-000000000001';
    const pkg = {
      xml: new Map([
        [
          'story/slides/slide.xml',
          `<sld><shapeLst><pic assetG="${g}"><loc l="10" t="10" r="210" b="110" /></pic>` +
            `<pic assetG="${g}"><loc l="0" t="0" r="50" b="50" /><sourceRect l="0.5" t="0" r="0" b="0" /></pic></shapeLst></sld>`,
        ],
      ]),
    };
    // The cropped one says nothing of the file.
    expect(useAspects(pkg, g)).toEqual([2]);
  });
});

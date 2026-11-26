import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findMediaTools, vendorFolder } from '../../media/ffmpeg';
import type { ImportStep } from '../progress';
import { importStorylineFile } from './import-file';
import { StorylineError } from './package';
import { PIXEL_PNG, testStoryParts, writeTestStory } from './test-story';

const tools = findMediaTools([
  process.env['VEDRAOPUS_FFMPEG_DIR'],
  vendorFolder(resolve(import.meta.dirname, '../../../../../..')),
]);

const folders: string[] = [];
const scratch = () => {
  const dir = mkdtempSync(join(tmpdir(), 'vo-storyline-'));
  folders.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('importing a .story file', () => {
  it('stores its pictures in the workspace and gives a valid project', async () => {
    const dir = scratch();
    const file = join(dir, 'course.story');
    await writeTestStory(file);
    const workspace = join(dir, 'workspace');
    const { project, report } = await importStorylineFile(file, workspace, 'course');
    const assets = Object.values(project.assets);
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({ kind: 'image', ext: 'png', width: 1, height: 1 });
    expect(project.scenes[0]!.slides).toHaveLength(2);
    // Its slider comes across since B5 part B, so nothing is left out.
    expect(report).toEqual([]);
  });

  it('settles a picture with no recorded size among several files by the pixel size the course recorded', async () => {
    // A pasted picture of 2 × 1 with no size in bytes, a 1 × 1 file beside it on the slide
    // (a thumbnail, say), and nothing else to tell them apart.
    const twoByOne = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR42mP8z8DAwMAAAAYIAQFyPMoyAAAAAElFTkSuQmCC',
      'base64',
    );
    const pasted = '30000000-0000-4000-8000-000000000001';
    const parts = testStoryParts();
    const story = parts.get('story/story.xml')!.toString('utf8');
    parts.set(
      'story/story.xml',
      Buffer.from(
        story.replace(
          '</mediaLst></mediaLst>',
          `<media g="${pasted}" type="Jpeg" displayName="" source="Pasted Image (2x1)" bytes="0" /></mediaLst></mediaLst>`,
        ),
      ),
    );
    const slide2 = parts.get('story/slides/slide2.xml')!.toString('utf8');
    parts.set(
      'story/slides/slide2.xml',
      Buffer.from(
        slide2.replace(
          '</shapeLst>',
          `<pic g="30000000-0000-4000-8000-000000000002" name="Pasted" zOrder="20" assetG="${pasted}"><sldSz w="960" h="540" /><loc l="0" t="0" r="200" b="100" /></pic></shapeLst>`,
        ),
      ),
    );
    // The 1 × 1 file first, so taking the first would be wrong.
    parts.set(
      'story/slides/_rels/slide2.xml.rels',
      Buffer.from(
        '<Relationships><Relationship Type="media" Target="/story/media/R9thumb.png" Id="Rt" /><Relationship Type="media" Target="/story/media/R9pasted.png" Id="Rp" /></Relationships>',
      ),
    );
    parts.set('story/media/R9thumb.png', PIXEL_PNG);
    parts.set('story/media/R9pasted.png', twoByOne);
    const dir = scratch();
    const file = join(dir, 'course.story');
    await writeTestStory(file, parts);
    const { project, report } = await importStorylineFile(file, join(dir, 'workspace'), 'course');
    const pic = project.scenes[0]!.slides[1]!.baseLayer.objects.find((o) => o.name === 'Pasted')!;
    expect(pic.type).toBe('image');
    if (pic.type !== 'image') return;
    expect(project.assets[pic.props.asset]).toMatchObject({ width: 2, height: 1 });
    expect(report.filter((item) => /identical-looking/.test(item.what))).toEqual([]);
  });

  it('reports its stages in order, and each media file as it comes in (B7)', async () => {
    const dir = scratch();
    const file = join(dir, 'course.story');
    await writeTestStory(file);
    const steps: ImportStep[] = [];
    await importStorylineFile(file, join(dir, 'workspace'), 'course', undefined, (step) =>
      steps.push(step),
    );
    // The test course has one picture.
    expect(steps).toEqual([
      { stage: 'reading', done: 0, total: 0 },
      { stage: 'media', done: 0, total: 1 },
      { stage: 'media', done: 0, total: 1, file: 'dot.png', fraction: 0 },
      { stage: 'slides', done: 0, total: 0 },
      { stage: 'checking', done: 0, total: 0 },
    ]);
  });

  it.skipIf(!tools)(
    'brings a TIFF picture in as a PNG, converted by ffmpeg (B5 part C)',
    async () => {
      // A 3 × 2 TIFF in place of the test course's dot.
      const tiff = Buffer.from(
        'SUkqAAgAAAAKAAABBAABAAAAAwAAAAEBBAABAAAAAgAAAAIBAwADAAAAhgAAAAMBAwABAAAAAQAAAAYBAwABAAAAAgAAABEBBAABAAAAjAAAABUBAwABAAAAAwAAABYBBAABAAAAAgAAABcBBAABAAAAEgAAABwBAwABAAAAAQAAAAAAAAAIAAgACAAAgP8AgP8AgP8AgP8AgP8AgP8=',
        'base64',
      );
      const parts = testStoryParts();
      const story = parts.get('story/story.xml')!.toString('utf8');
      parts.set(
        'story/story.xml',
        Buffer.from(
          story.replace(
            /type="Png" displayName="dot.png" bytes="\d+"/,
            `type="Tiff" displayName="dot.tif" bytes="${tiff.length}"`,
          ),
        ),
      );
      const rels = parts.get('story/slides/_rels/slide.xml.rels')!.toString('utf8');
      parts.set(
        'story/slides/_rels/slide.xml.rels',
        Buffer.from(rels.replace('R1picture.png', 'R1picture.tiff')),
      );
      parts.delete('story/media/R1picture.png');
      parts.set('story/media/R1picture.tiff', tiff);
      const dir = scratch();
      const file = join(dir, 'course.story');
      await writeTestStory(file, parts);
      const { project, report } = await importStorylineFile(
        file,
        join(dir, 'workspace'),
        'course',
        { tools: tools! },
      );
      expect(Object.values(project.assets)).toEqual([
        expect.objectContaining({ kind: 'image', ext: 'png', width: 3, height: 2 }),
      ]);
      expect(report).toEqual([]);
    },
  );

  it('refuses a file that is not a course, saying so', async () => {
    const dir = scratch();
    const file = join(dir, 'not-a-course.story');
    writeFileSync(file, 'hello');
    await expect(importStorylineFile(file, join(dir, 'workspace'), 'x')).rejects.toBeInstanceOf(
      StorylineError,
    );
  });
});

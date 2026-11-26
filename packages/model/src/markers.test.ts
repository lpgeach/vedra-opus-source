import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  createHotspotObject,
  createMarkerObject,
  FORMAT_VERSION,
  migrateToCurrent,
  parseProject,
  ProjectValidationError,
} from './index';
import type { MarkerObject } from './index';

const image = 'a'.repeat(64);
const video = 'b'.repeat(64);
const audio = 'c'.repeat(64);
const file = 'd'.repeat(64);
const missing = 'e'.repeat(64);

function withMarker(): { project: ReturnType<typeof createEmptyProject>; marker: MarkerObject } {
  const project = createEmptyProject();
  const marker = createMarkerObject();
  project.scenes[0]!.slides[0]!.baseLayer.objects.push(
    createHotspotObject({ x: 10, y: 20 }, 'ellipse'),
    marker,
  );
  project.assets = {
    [image]: {
      kind: 'image',
      fileName: 'picture.png',
      ext: 'png',
      mimeType: 'image/png',
      byteLength: 1,
    },
    [video]: {
      kind: 'video',
      fileName: 'clip.mp4',
      ext: 'mp4',
      mimeType: 'video/mp4',
      byteLength: 1,
    },
    [audio]: {
      kind: 'audio',
      fileName: 'sound.mp3',
      ext: 'mp3',
      mimeType: 'audio/mpeg',
      byteLength: 1,
    },
    [file]: {
      kind: 'file',
      fileName: 'notes.pdf',
      ext: 'pdf',
      mimeType: 'application/pdf',
      byteLength: 1,
    },
  };
  return { project, marker };
}

function issuesOf(project: ReturnType<typeof createEmptyProject>): string[] {
  try {
    parseProject(project);
  } catch (error) {
    if (error instanceof ProjectValidationError) return error.issues.map((issue) => issue.message);
    throw error;
  }
  return [];
}

describe('hotspots and markers in the saved model (P9.1)', () => {
  it('makes a hotspot and a marker of the right size and defaults', () => {
    const hotspot = createHotspotObject({ x: 10, y: 20 }, 'ellipse', 'Click me');
    expect(hotspot.type).toBe('hotspot');
    expect(hotspot.props.shape).toBe('ellipse');
    expect(hotspot.frame).toMatchObject({ x: 10, y: 20, width: 160, height: 120 });
    expect(hotspot.name).toBe('Click me');

    const marker = createMarkerObject({ x: 30, y: 40 }, 'Read me');
    expect(marker.type).toBe('marker');
    expect(marker.frame).toMatchObject({ x: 30, y: 40, width: 36, height: 36 });
    expect(marker.props).toMatchObject({
      icon: 'plus',
      color: { theme: 'accent1' },
      title: 'Read me',
      body: '',
      media: null,
      audio: null,
      opensOn: 'click',
      pulse: false,
    });
  });

  it('validates the kinds of a marker’s media and sound', () => {
    const { project, marker } = withMarker();
    marker.props.media = image;
    marker.props.audio = audio;
    expect(issuesOf(project)).toEqual([]);

    marker.props.media = video;
    expect(issuesOf(project)).toEqual([]);

    marker.props.media = file;
    expect(issuesOf(project)).toContain("a marker's media is a picture or a video");

    marker.props.media = image;
    marker.props.audio = image;
    expect(issuesOf(project)).toContain("a marker's sound is audio");

    marker.props.audio = missing;
    expect(issuesOf(project)).toContain(`asset ${missing.slice(0, 12)}… is not in the project`);
  });

  it('migrates from format 25 without changing a hotspot or marker', () => {
    const { project } = withMarker();
    const old = JSON.parse(JSON.stringify(project)) as Record<string, unknown>;
    old['formatVersion'] = 25;
    const migrated = parseProject(migrateToCurrent(old));
    expect(migrated.formatVersion).toBe(FORMAT_VERSION);
    expect(migrated.scenes[0]!.slides[0]!.baseLayer.objects.map((object) => object.type)).toEqual([
      'hotspot',
      'marker',
    ]);
  });
});

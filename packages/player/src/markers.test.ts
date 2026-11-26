// @vitest-environment happy-dom
import { createEmptyProject, createHotspotObject, createMarkerObject } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { bodyParagraphs, createMarkers, labelPlace } from './markers';

/** Hotspots and markers in a course, and the label a marker opens (P9.1). */

const picture = 'a'.repeat(64);
const sound = 'b'.repeat(64);

function setup() {
  const project = createEmptyProject();
  const hotspot = createHotspotObject({ x: 10, y: 20 }, 'ellipse');
  const first = createMarkerObject({ x: 100, y: 100 }, 'First');
  const second = createMarkerObject({ x: 200, y: 100 }, 'Second');
  first.props.body = 'One line\n\nAnother line';
  first.props.media = picture;
  first.props.audio = sound;
  project.assets = {
    [picture]: {
      kind: 'image',
      fileName: 'picture.png',
      ext: 'png',
      mimeType: 'image/png',
      byteLength: 1,
    },
    [sound]: {
      kind: 'audio',
      fileName: 'sound.mp3',
      ext: 'mp3',
      mimeType: 'audio/mpeg',
      byteLength: 1,
    },
  };
  project.scenes[0]!.slides[0]!.baseLayer.objects.push(hotspot, first, second);

  const stage = document.createElement('div');
  const drawn = new Map<string, HTMLElement>();
  for (const object of [hotspot, first, second]) {
    const element = document.createElement('div');
    element.dataset['objectId'] = object.id;
    element.dataset['objectType'] = object.type;
    stage.append(element);
    drawn.set(object.id, element);
  }
  document.body.append(stage);
  const markers = createMarkers(document, project, stage, {
    assetUrl: (hash, ext) => `assets/${hash}.${ext}`,
    level: () => 0.4,
    rate: () => 1.25,
  });
  markers.mark(drawn, () => true);
  return { project, hotspot, first, second, stage, drawn, markers };
}

describe('player hotspots and markers', () => {
  it('puts a label beside the marker and keeps it inside the stage', () => {
    expect(
      labelPlace(
        { x: 10, y: 10, width: 36, height: 36 },
        { width: 320, height: 100 },
        { width: 1000, height: 500 },
      ),
    ).toEqual({ x: 54, y: 10 });
    expect(
      labelPlace(
        { x: 900, y: 480, width: 36, height: 36 },
        { width: 320, height: 100 },
        { width: 1000, height: 500 },
      ),
    ).toEqual({ x: 572, y: 400 });
    expect(
      labelPlace(
        { x: 100, y: 100, width: 36, height: 36 },
        { width: 320, height: 100 },
        { width: 200, height: 500 },
      ),
    ).toEqual({ x: 0, y: 100 });
  });

  it('turns body lines into paragraphs, leaving out blank lines', () => {
    expect(bodyParagraphs('First\r\n\r\nSecond\n Third \n')).toEqual([
      'First',
      'Second',
      ' Third ',
    ]);
    expect(bodyParagraphs('  \n')).toEqual([]);
  });

  it('gives both objects button semantics, and closes on Escape or a press elsewhere', () => {
    const { hotspot, first, stage, drawn, markers } = setup();
    const hotspotElement = drawn.get(hotspot.id)!;
    const markerElement = drawn.get(first.id)!;
    expect(hotspotElement.getAttribute('role')).toBe('button');
    expect(hotspotElement.getAttribute('aria-label')).toBe(hotspot.name);
    expect(markerElement.getAttribute('aria-label')).toBe('First');
    expect(markerElement.getAttribute('aria-expanded')).toBe('false');
    expect(markers.isPressable(hotspot.id)).toBe(true);
    expect(markers.isPressable(first.id)).toBe(true);

    markers.activate(first.id);
    const label = stage.querySelector<HTMLElement>('.vo-marker-label')!;
    expect(label.getAttribute('role')).toBe('region');
    expect(label.getAttribute('aria-label')).toBe('First');
    expect(label.querySelector('h2')?.textContent).toBe('First');
    expect([...label.querySelectorAll('p')].map((p) => p.textContent)).toEqual([
      'One line',
      'Another line',
    ]);
    expect(label.querySelector('img')?.getAttribute('src')).toBe(`assets/${picture}.png`);
    expect(markerElement.getAttribute('aria-expanded')).toBe('true');

    expect(markers.close()).toBe(true);
    expect(stage.querySelector('.vo-marker-label')).toBeNull();
    expect(markerElement.getAttribute('aria-expanded')).toBe('false');
    expect(markers.close()).toBe(false);
    markers.destroy();
  });

  it('shows only one label at a time', () => {
    const { first, second, stage, markers } = setup();
    markers.activate(first.id);
    markers.activate(second.id);
    const labels = stage.querySelectorAll('.vo-marker-label');
    expect(labels).toHaveLength(1);
    expect(labels[0]?.getAttribute('data-marker-id')).toBe(second.id);
    markers.destroy();
  });

  it('opens a hover marker on focus and closes a label when its marker is no longer drawn', () => {
    const { first, drawn, markers } = setup();
    first.props.opensOn = 'hover';
    const element = drawn.get(first.id)!;
    element.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(element.getAttribute('aria-expanded')).toBe('true');
    markers.mark(new Map(), () => true);
    expect(element.getAttribute('aria-expanded')).toBe('false');
    markers.destroy();
  });
});

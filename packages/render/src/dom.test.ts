// @vitest-environment happy-dom
import { createEmptyProject, createShapeObject } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { createRenderContext, h, renderObject, toDom, toMarkup } from './index';

const SVG = 'http://www.w3.org/2000/svg';
const HTML = 'http://www.w3.org/1999/xhtml';

describe('toDom', () => {
  it('creates HTML elements outside an svg and SVG elements inside one', () => {
    const element = toDom(
      h('div', {}, [h('svg', {}, [h('defs', {}, [h('linearGradient', { attrs: { id: 'g' } })])])]),
      document,
    );
    expect(element.namespaceURI).toBe(HTML);
    const svg = element.firstElementChild!;
    expect(svg.namespaceURI).toBe(SVG);
    const gradient = svg.querySelector('#g')!;
    expect(gradient.namespaceURI).toBe(SVG);
    // SVG names are case-sensitive; a lower-cased gradient would not paint.
    expect(gradient.localName).toBe('linearGradient');
  });

  it('sets attributes, styles and text', () => {
    const element = toDom(
      h('p', { attrs: { 'data-x': '1' }, style: { color: 'red', 'font-size': '12px' } }, [
        'a <b> c',
      ]),
      document,
    ) as HTMLElement;
    expect(element.getAttribute('data-x')).toBe('1');
    expect(element.style.color).toBe('red');
    expect(element.style.fontSize).toBe('12px');
    // Text is text, never parsed as markup.
    expect(element.textContent).toBe('a <b> c');
    expect(element.children).toHaveLength(0);
  });

  it('builds the same tree that the markup describes', () => {
    const project = createEmptyProject();
    const shape = createShapeObject({ kind: 'roundRect', radius: 8 }, { rotation: 15 });
    shape.props.appearance.fill = {
      kind: 'gradient',
      angle: 45,
      stops: [
        { offset: 0, color: '#ff0000' },
        { offset: 1, color: { theme: 'accent1' } },
      ],
    };
    const node = renderObject(shape, createRenderContext(project, { assetUrl: () => undefined }));

    const built = toDom(node, document);
    const parsed = document.createElement('div');
    parsed.innerHTML = toMarkup(node);

    const outline = (element: Element): unknown => [
      element.localName,
      [...element.attributes]
        .filter((attribute) => attribute.name !== 'style')
        .map((attribute) => `${attribute.name}=${attribute.value}`)
        .sort(),
      [...element.children].map(outline),
    ];
    expect(outline(built)).toEqual(outline(parsed.firstElementChild!));
    expect(built.querySelector('path')!.getAttribute('d')).toContain('A8 8');
  });
});

/**
 * Decks for the importer's tests (docs/briefs/P11.1-pptx-import.md), made in the
 * shape PowerPoint writes them: there is no copy of PowerPoint here, and
 * nothing is taken from real decks. Not used by the app.
 */

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

export interface TestSlide {
  /** The children of `p:spTree`, after its required group properties. */
  shapes: string;
  /** Notes words, one paragraph. */
  notes?: string;
  /** More relationships: id → target (relative to `ppt/slides/`). */
  rels?: Record<string, string | { target: string; type: string }>;
  hidden?: boolean;
  /** Its own background (`p:bg`), as XML. */
  background?: string;
}

export interface TestDeck {
  slides: TestSlide[];
  /** Parts by name (`ppt/media/image1.png`) and their bytes. */
  media?: Record<string, Uint8Array>;
  title?: string;
  /** Slide size in EMU; 16:9 by default. */
  size?: { cx: number; cy: number };
  /** The layout's shapes (placeholders the slides inherit from). */
  layoutShapes?: string;
  /** The master's text styles (`p:txStyles` children). */
  masterStyles?: string;
  /** The master's own (non-placeholder) shapes, and background, as XML. */
  masterShapes?: string;
  masterBackground?: string;
  /** The layout's name, attributes (` showMasterSp="0"`) and background. */
  layoutName?: string;
  layoutAttrs?: string;
  layoutBackground?: string;
}

const rels = (entries: [string, string, string][]) =>
  `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entries
    .map(
      ([id, type, target]) =>
        `<Relationship Id="${id}" Type="${type.includes(':') ? type : `${REL}/${type}`}" Target="${target}"/>`,
    )
    .join('')}</Relationships>`;

const tree = (inner: string, background = '', name = '') =>
  `<p:cSld${name ? ` name="${name}"` : ''}>${background}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${inner}</p:spTree></p:cSld>`;

let placeholderIds = 900;

/** A placeholder shape for a layout or master: its kind, index and place (EMU). */
export function placeholderShape(
  type: string,
  idx: string | null,
  box: { x: number; y: number; cx: number; cy: number },
  name: string,
): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${(placeholderIds += 1)}" name="${name}"/><p:cNvSpPr/><p:nvPr><p:ph type="${type}"${idx ? ` idx="${idx}"` : ''}/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.cx}" cy="${box.cy}"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr/></a:p></p:txBody></p:sp>`;
}

const THEME = `${HEAD}<a:theme ${NS} name="Test"><a:themeElements><a:clrScheme name="Test">
<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
<a:dk2><a:srgbClr val="1F2A44"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
<a:accent1><a:srgbClr val="2E75B6"/></a:accent1><a:accent2><a:srgbClr val="C55A11"/></a:accent2>
<a:accent3><a:srgbClr val="7F7F7F"/></a:accent3><a:accent4><a:srgbClr val="BF9000"/></a:accent4>
<a:accent5><a:srgbClr val="2F5597"/></a:accent5><a:accent6><a:srgbClr val="538135"/></a:accent6>
<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>
<a:fontScheme name="Test"><a:majorFont><a:latin typeface="Georgia"/></a:majorFont><a:minorFont><a:latin typeface="Verdana"/></a:minorFont></a:fontScheme>
<a:fmtScheme name="Test"/></a:themeElements></a:theme>`;

const encode = (text: string) => new TextEncoder().encode(text);

/** The deck's parts, by name, as the importer reads them from the zip. */
export function buildDeck(deck: TestDeck): Map<string, Uint8Array> {
  const parts = new Map<string, Uint8Array>();
  const put = (name: string, text: string) => parts.set(name, encode(text));
  const size = deck.size ?? { cx: 12192000, cy: 6858000 };
  put(
    '[Content_Types].xml',
    `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`,
  );
  put('_rels/.rels', rels([['rId1', 'officeDocument', 'ppt/presentation.xml']]));
  if (deck.title !== undefined) {
    put(
      'docProps/core.xml',
      `${HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${deck.title}</dc:title></cp:coreProperties>`,
    );
  }
  put(
    'ppt/presentation.xml',
    `${HEAD}<p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${deck.slides
      .map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 10}"/>`)
      .join(
        '',
      )}</p:sldIdLst><p:sldSz cx="${size.cx}" cy="${size.cy}"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:defaultTextStyle></p:presentation>`,
  );
  put(
    'ppt/_rels/presentation.xml.rels',
    rels([
      ['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'],
      ['rId2', 'theme', 'theme/theme1.xml'],
      ...deck.slides.map((_, i): [string, string, string] => [
        `rId${i + 10}`,
        'slide',
        `slides/slide${i + 1}.xml`,
      ]),
    ]),
  );
  put('ppt/theme/theme1.xml', THEME);
  const masterShapes =
    placeholderShape(
      'title',
      null,
      { x: 838200, y: 365125, cx: 10515600, cy: 1325563 },
      'Title Placeholder 1',
    ) +
    placeholderShape(
      'body',
      '1',
      { x: 838200, y: 1825625, cx: 10515600, cy: 4351338 },
      'Text Placeholder 2',
    );
  put(
    'ppt/slideMasters/slideMaster1.xml',
    `${HEAD}<p:sldMaster ${NS}>${tree(masterShapes + (deck.masterShapes ?? ''), deck.masterBackground ?? '', 'Office Theme')}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles>${
      deck.masterStyles ??
      '<p:titleStyle><a:lvl1pPr><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:buChar char="•"/><a:defRPr sz="2800"/></a:lvl1pPr><a:lvl2pPr><a:buChar char="–"/><a:defRPr sz="2400"/></a:lvl2pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle>'
    }</p:txStyles></p:sldMaster>`,
  );
  put(
    'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    rels([
      ['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'],
      ['rId2', 'theme', '../theme/theme1.xml'],
    ]),
  );
  put(
    'ppt/slideLayouts/slideLayout1.xml',
    `${HEAD}<p:sldLayout ${NS}${deck.layoutAttrs ?? ''}>${tree(deck.layoutShapes ?? '', deck.layoutBackground ?? '', deck.layoutName ?? 'Title and Content')}</p:sldLayout>`,
  );
  put(
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]),
  );
  deck.slides.forEach((slide, i) => {
    const n = i + 1;
    put(
      `ppt/slides/slide${n}.xml`,
      `${HEAD}<p:sld ${NS}${slide.hidden ? ' show="0"' : ''}>${tree(slide.shapes, slide.background ?? '')}</p:sld>`,
    );
    const entries: [string, string, string][] = [
      ['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'],
    ];
    if (slide.notes !== undefined) {
      entries.push(['rId2', 'notesSlide', `../notesSlides/notesSlide${n}.xml`]);
      put(
        `ppt/notesSlides/notesSlide${n}.xml`,
        `${HEAD}<p:notes ${NS}>${tree(
          `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes Placeholder 2"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-GB"/><a:t>${slide.notes}</a:t></a:r></a:p></p:txBody></p:sp>`,
        )}</p:notes>`,
      );
    }
    for (const [id, rel] of Object.entries(slide.rels ?? {})) {
      if (typeof rel === 'string')
        entries.push([id, rel.includes('media') ? 'image' : 'chart', rel]);
      else entries.push([id, rel.type, rel.target]);
    }
    put(`ppt/slides/_rels/slide${n}.xml.rels`, rels(entries));
  });
  for (const [name, bytes] of Object.entries(deck.media ?? {})) parts.set(name, bytes);
  // Every part's content type, as PowerPoint declares them: other readers (LibreOffice) need them.
  const TYPES: [RegExp, string][] = [
    [/^ppt\/presentation\.xml$/, 'presentationml.presentation.main+xml'],
    [/^ppt\/slides\/slide\d+\.xml$/, 'presentationml.slide+xml'],
    [/^ppt\/slideLayouts\/slideLayout\d+\.xml$/, 'presentationml.slideLayout+xml'],
    [/^ppt\/slideMasters\/slideMaster\d+\.xml$/, 'presentationml.slideMaster+xml'],
    [/^ppt\/notesSlides\/notesSlide\d+\.xml$/, 'presentationml.notesSlide+xml'],
    [/^ppt\/theme\/theme\d+\.xml$/, 'theme+xml'],
    [/^ppt\/charts\/chart\d+\.xml$/, 'drawingml.chart+xml'],
  ];
  const overrides = [...parts.keys()]
    .map((name) => {
      const found = TYPES.find(([pattern]) => pattern.test(name));
      if (name === 'docProps/core.xml') {
        return `<Override PartName="/${name}" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>`;
      }
      return found
        ? `<Override PartName="/${name}" ContentType="application/vnd.openxmlformats-officedocument.${found[1]}"/>`
        : '';
    })
    .join('');
  put(
    '[Content_Types].xml',
    `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="emf" ContentType="image/x-emf"/><Default Extension="webm" ContentType="video/webm"/><Default Extension="wav" ContentType="audio/wav"/>${overrides}</Types>`,
  );
  return parts;
}

/** A shape with a preset geometry, fill and text (EMU). */
export function spShape(options: {
  id: number;
  name: string;
  box: { x: number; y: number; cx: number; cy: number };
  prst?: string;
  fill?: string;
  line?: string;
  textBox?: boolean;
  paragraphs?: string;
  xfrmAttrs?: string;
  descr?: string;
  ph?: string;
}): string {
  const fill = options.fill ?? '';
  return `<p:sp><p:nvSpPr><p:cNvPr id="${options.id}" name="${options.name}"${options.descr ? ` descr="${options.descr}"` : ''}/><p:cNvSpPr${options.textBox ? ' txBox="1"' : ''}/><p:nvPr>${options.ph ?? ''}</p:nvPr></p:nvSpPr><p:spPr><a:xfrm${options.xfrmAttrs ?? ''}><a:off x="${options.box.x}" y="${options.box.y}"/><a:ext cx="${options.box.cx}" cy="${options.box.cy}"/></a:xfrm><a:prstGeom prst="${options.prst ?? 'rect'}"><a:avLst/></a:prstGeom>${fill}${options.line ?? ''}</p:spPr>${
    options.paragraphs !== undefined
      ? `<p:txBody><a:bodyPr/><a:lstStyle/>${options.paragraphs}</p:txBody>`
      : ''
  }</p:sp>`;
}

/** A one-run paragraph. */
export const para = (words: string, rPr = '<a:rPr lang="en-GB"/>', pPr = '') =>
  `<a:p>${pPr}<a:r>${rPr}<a:t>${words}</a:t></a:r></a:p>`;

/** The smallest PNG there is: one pixel. */
export const PIXEL_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0xf0,
  0x1f, 0x00, 0x05, 0x00, 0x01, 0xff, 0x89, 0x99, 0x3d, 0x1d, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
  0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

const MS_REL = 'http://schemas.microsoft.com/office/2007/relationships';

/**
 * A bar chart as PowerPoint writes one: a graphic frame naming a chart part,
 * whose values are cached in the part itself (part D's smoke test draws it).
 */
export function chartContent(id: number, box: { x: number; y: number; cx: number; cy: number }) {
  const point = (idx: number, value: string) => `<c:pt idx="${idx}"><c:v>${value}</c:v></c:pt>`;
  const chart = `${HEAD}<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${REL}"><c:chart><c:autoTitleDeleted val="1"/><c:plotArea><c:layout/><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>Minutes</c:v></c:tx><c:spPr><a:solidFill><a:srgbClr val="C00000"/></a:solidFill></c:spPr><c:cat><c:strRef><c:f>Sheet1!$A$2:$A$4</c:f><c:strCache><c:ptCount val="3"/>${point(0, 'March')}${point(1, 'June')}${point(2, 'September')}</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>Sheet1!$B$2:$B$4</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="3"/>${point(0, '6')}${point(1, '4')}${point(2, '3')}</c:numCache></c:numRef></c:val></c:ser><c:gapWidth val="80"/><c:axId val="111"/><c:axId val="222"/></c:barChart><c:catAx><c:axId val="111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="222"/></c:catAx><c:valAx><c:axId val="222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="111"/></c:valAx></c:plotArea><c:plotVisOnly val="1"/></c:chart></c:chartSpace>`;
  return {
    shapes: `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Chart ${id}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.cx}" cy="${box.cy}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rIdChart${id}"/></a:graphicData></a:graphic></p:graphicFrame>`,
    rels: { [`rIdChart${id}`]: { target: `../charts/chart${id}.xml`, type: 'chart' } },
    parts: { [`ppt/charts/chart${id}.xml`]: new TextEncoder().encode(chart) },
  };
}

/**
 * The deck `npm run fetch:libreoffice` draws to prove its trim
 * (`fixtures/libreoffice/smoke.pptx`): a title, a bar chart and SmartArt.
 * The SVG drawn from it must hold "Smoke test", "March" and "Stop".
 */
export function smokeDeck(): Map<string, Uint8Array> {
  const chart = chartContent(7, { x: 762000, y: 2857500, cx: 4762500, cy: 3429000 });
  const smartArt = smartArtContent(8, { x: 6096000, y: 3238500, cx: 5715000, cy: 1524000 });
  return buildDeck({
    slides: [
      {
        shapes:
          spShape({
            id: 2,
            name: 'Words',
            box: { x: 762000, y: 571500, cx: 10477500, cy: 1143000 },
            textBox: true,
            paragraphs: para(
              'Smoke test: text, a chart and SmartArt',
              '<a:rPr lang="en-GB" sz="3600"/>',
            ),
          }) +
          chart.shapes +
          smartArt.shapes,
        rels: { ...chart.rels, ...smartArt.rels },
      },
    ],
    media: { ...chart.parts, ...smartArt.parts },
  });
}

/**
 * SmartArt as PowerPoint writes it: the diagram's data, and beside it the
 * drawing PowerPoint keeps of how it looked, which other readers draw from.
 */
export function smartArtContent(id: number, box: { x: number; y: number; cx: number; cy: number }) {
  const dgm = 'http://schemas.openxmlformats.org/drawingml/2006/diagram';
  const step = (n: number, words: string) =>
    `<dsp:sp modelId="{0000000${n}-0000-0000-0000-000000000000}"><dsp:nvSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvSpPr/></dsp:nvSpPr><dsp:spPr><a:xfrm><a:off x="${(n - 1) * 2000000}" y="0"/><a:ext cx="1800000" cy="1000000"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="2E75B6"/></a:solidFill></dsp:spPr><dsp:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-GB" sz="2000"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>${words}</a:t></a:r></a:p></dsp:txBody></dsp:sp>`;
  const drawing = `${HEAD}<dsp:drawing xmlns:dgm="${dgm}" xmlns:dsp="http://schemas.microsoft.com/office/drawing/2008/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><dsp:spTree><dsp:nvGrpSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvGrpSpPr/></dsp:nvGrpSpPr><dsp:grpSpPr/>${step(1, 'Stop')}${step(2, 'Leave')}${step(3, 'Gather')}</dsp:spTree></dsp:drawing>`;
  const data = `${HEAD}<dgm:dataModel xmlns:dgm="${dgm}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><dgm:ptLst><dgm:pt modelId="{00000000-0000-0000-0000-000000000000}" type="doc"><dgm:prSet/><dgm:spPr/><dgm:t><a:bodyPr/><a:lstStyle/><a:p/></dgm:t></dgm:pt></dgm:ptLst><dgm:cxnLst/><dgm:bg/><dgm:whole/><dgm:extLst><a:ext uri="http://schemas.microsoft.com/office/drawing/2008/diagram"><dsp:dataModelExt xmlns:dsp="http://schemas.microsoft.com/office/drawing/2008/diagram" relId="rIdDraw${id}" minVer="http://schemas.openxmlformats.org/drawingml/2006/diagram"/></a:ext></dgm:extLst></dgm:dataModel>`;
  return {
    shapes: `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Diagram ${id}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.cx}" cy="${box.cy}"/></p:xfrm><a:graphic><a:graphicData uri="${dgm}"><dgm:relIds xmlns:dgm="${dgm}" r:dm="rIdData${id}" r:lo="rIdData${id}" r:qs="rIdData${id}" r:cs="rIdData${id}"/></a:graphicData></a:graphic></p:graphicFrame>`,
    rels: {
      [`rIdData${id}`]: { target: `../diagrams/data${id}.xml`, type: 'diagramData' },
      [`rIdDraw${id}`]: {
        target: `../diagrams/drawing${id}.xml`,
        type: `${MS_REL}/diagramDrawing`,
      },
    },
    parts: {
      [`ppt/diagrams/data${id}.xml`]: new TextEncoder().encode(data),
      [`ppt/diagrams/drawing${id}.xml`]: new TextEncoder().encode(drawing),
    },
  };
}

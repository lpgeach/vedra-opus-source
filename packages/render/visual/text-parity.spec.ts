import { createEmptyProject, createTextObject } from '@vedraopus/model';
import type { RichText } from '@vedraopus/model';
import { createRenderContext, renderObject, toMarkup } from '../src/index';
import { expect, test } from '@playwright/test';
import { INTER_FONT_CSS } from './font-css';

const project = createEmptyProject();
project.theme.fonts.body = 'Inter';
project.theme.fonts.heading = 'Inter';
project.theme.colors.text = '#1c2024';
project.theme.colors.background = '#ffffff';
const context = createRenderContext(project, { assetUrl: () => undefined, idPrefix: 'p-' });

const richDoc: RichText = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      attrs: { textAlign: 'center', lineHeight: '1.4', spaceAfter: 8 },
      content: [
        { type: 'text', text: 'Bold ', marks: [{ type: 'bold' }] },
        { type: 'text', text: 'italic ', marks: [{ type: 'italic' }] },
        { type: 'text', text: 'underline', marks: [{ type: 'underline' }] },
      ],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Colored 24px',
          marks: [{ type: 'textStyle', attrs: { color: '#2f6fed', fontSize: '24px' } }],
        },
      ],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One' }] }],
        },
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Two' }] }],
        },
      ],
    },
    {
      type: 'orderedList',
      content: [
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }],
        },
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second' }] }],
        },
      ],
    },
  ],
};

const TEXT_CSS = `
.vo-rich-text{white-space:pre-wrap;overflow-wrap:break-word}
.vo-rich-text p{margin:0}
.vo-rich-text ul,.vo-rich-text ol{margin:0;padding-left:1.4em}
.vo-rich-text ul{list-style-type:disc}
.vo-rich-text ol{list-style-type:decimal}
.vo-rich-text li{margin:0}
.vo-rich-text a{color:#0b57d0;text-decoration:underline}
.ProseMirror{outline:none;caret-color:transparent}
`;

function staticMarkup(doc: RichText): string {
  const obj = createTextObject('', { x: 0, y: 0, width: 360, height: 260 });
  obj.props.text = doc;
  obj.props.padding = 12;
  obj.id = 'obj-parity';
  return toMarkup(renderObject(obj, context));
}

test('text parity: editor rendering and static rendering of the same document are pixel-equal within tolerance', async ({
  page,
}) => {
  const html = staticMarkup(richDoc);
  const docJson = JSON.stringify(richDoc);
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"><style>${INTER_FONT_CSS}\n${TEXT_CSS}</style></head>
    <body style="margin:0;background:#fff">
      <div id="static" style="position:relative;width:360px;height:260px">${html}</div>
      <div id="editor" style="position:relative;width:360px;height:260px;margin-top:8px"></div>
      <script type="module">
        import { Editor } from 'https://esm.sh/@tiptap/core@3.35.0';
        import { StarterKit } from 'https://esm.sh/@tiptap/starter-kit@3.35.0';
        import { Underline } from 'https://esm.sh/@tiptap/extension-underline@3.35.0';
        import { TextStyle } from 'https://esm.sh/@tiptap/extension-text-style@3.35.0';
        import { Color } from 'https://esm.sh/@tiptap/extension-color@3.35.0';
        import { TextAlign } from 'https://esm.sh/@tiptap/extension-text-align@3.35.0';
        import { Paragraph } from 'https://esm.sh/@tiptap/extension-paragraph@3.35.0';
        const TextStyleExtended = TextStyle.extend({ addAttributes(){ return { ...this.parent?.(), fontSize:{default:null,parseHTML:e=>e.style.fontSize||null,renderHTML:a=>a.fontSize?{style:'font-size: '+a.fontSize}:{}}, lineHeight:{default:null,parseHTML:e=>e.style.lineHeight||null,renderHTML:a=>a.lineHeight?{style:'line-height: '+a.lineHeight}:{}} }; }});
        const ParagraphExtended = Paragraph.extend({ addAttributes(){ return { ...this.parent?.(), textAlign:{default:null,parseHTML:e=>e.style.textAlign||null,renderHTML:a=>a.textAlign?{style:'text-align: '+a.textAlign}:{}}, lineHeight:{default:null,parseHTML:e=>e.style.lineHeight||null,renderHTML:a=>a.lineHeight?{style:'line-height: '+a.lineHeight}:{}}, spaceBefore:{default:null,parseHTML:()=>null,renderHTML:a=>typeof a.spaceBefore==='number'?{style:'margin-top: '+a.spaceBefore+'px'}:{}}, spaceAfter:{default:null,parseHTML:()=>null,renderHTML:a=>typeof a.spaceAfter==='number'?{style:'margin-bottom: '+a.spaceAfter+'px'}:{}} }; }});
        const doc = ${docJson};
        const mount = document.getElementById('editor');
        mount.innerHTML = '<div class="vo-object" data-object-id="obj-parity" data-object-type="text" style="position:absolute;left:0px;top:0px;width:360px;height:260px"><div class="vo-text" data-align="start" style="position:absolute;inset:0;box-sizing:border-box;padding:12px;display:flex;flex-direction:column;justify-content:flex-start;overflow:hidden"><div id="ed"></div></div></div>';
        const edEl = document.getElementById('ed');
        edEl.style.width='100%';
        edEl.style.fontFamily="'Inter', sans-serif";
        edEl.style.fontSize='18px';
        edEl.style.lineHeight='1.3';
        edEl.style.color='#1c2024';
        edEl.style.whiteSpace='pre-wrap';
        edEl.style.overflowWrap='break-word';
        new Editor({
          element: edEl,
          extensions: [StarterKit.configure({paragraph:false,heading:false,code:false,codeBlock:false,blockquote:false,horizontalRule:false,link:false,underline:false,trailingNode:false,listKeymap:false}), ParagraphExtended, Underline, TextStyleExtended, Color, TextAlign.configure({types:['paragraph']})],
          content: doc,
          editable: false,
          editorProps: { attributes: { class: 'vo-rich-text', style: "font-family:'Inter', sans-serif;font-size:18px;line-height:1.3;color:#1c2024;white-space:pre-wrap;overflow-wrap:break-word;width:100%" } }
        });
        window.__editorReady = true;
      </script>
    </body></html>`,
    { waitUntil: 'networkidle' },
  );
  await page.evaluate(async () => {
    if ('fonts' in document) await (document as Document & { fonts: FontFaceSet }).fonts.ready;
  });
  await page
    .waitForFunction(
      () => (window as unknown as { __editorReady?: boolean }).__editorReady === true,
      undefined,
      { timeout: 15000 },
    )
    .catch(() => {});
  await page.waitForTimeout(300);
  const a = await page.locator('#static').screenshot();
  const b = await page.locator('#editor').screenshot();
  expect(b).toEqual(a);
});

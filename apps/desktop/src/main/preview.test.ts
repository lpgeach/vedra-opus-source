import { describe, expect, it, vi } from 'vitest';

// The preview module reaches Electron at import; only its pure parts are tested here.
vi.mock('electron', () => ({ BrowserWindow: class {}, session: {}, shell: {} }));

const { previewFile } = await import('./preview');
const { PREVIEW_SCHEME } = await import('./project/protocol');

/** Course files opened from a preview (the Phase 8 review). */

const TOKEN = 'a'.repeat(32);
const HASH = 'b'.repeat(64);
const at = (path: string, token = TOKEN) => `${PREVIEW_SCHEME}://${token}/${path}`;

describe('previewFile', () => {
  it('takes this preview’s own course files of the Resources tab’s types', () => {
    expect(previewFile(at(`content/assets/${HASH}.pdf`), TOKEN)).toEqual({
      hash: HASH,
      ext: 'pdf',
    });
    expect(previewFile(at(`content/assets/${HASH}.png`), TOKEN)).toEqual({
      hash: HASH,
      ext: 'png',
    });
  });

  it('refuses anything else', () => {
    for (const url of [
      at(`content/assets/${HASH}.pdf`, 'c'.repeat(32)), // another preview
      at(`content/assets/${HASH}.svg`), // scripts would run
      at(`content/assets/${HASH}.html`),
      at(`content/assets/${HASH}.mp3`),
      at('index.html'),
      at(`content/assets/../${HASH}.pdf`),
      `https://example.com/content/assets/${HASH}.pdf`,
      `file:///content/assets/${HASH}.pdf`,
      'not a url',
    ]) {
      expect(previewFile(url, TOKEN), url).toBeNull();
    }
    expect(previewFile(at(`content/assets/${HASH}.pdf`, ''), '')).toBeNull();
  });
});

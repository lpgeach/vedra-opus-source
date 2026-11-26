import { defineConfig } from 'vite';
import { thirdPartyNotices } from '../../scripts/third-party-notices.mjs';

// One self-contained script and one stylesheet: no chunks, no external imports,
// nothing fetched at run time. The script sets `window.VedraOpusPlayer`.
// `third-party-notices.json` lists the npm packages built into it, for courses' notices.
export default defineConfig({
  plugins: [thirdPartyNotices()],
  // Library builds leave `process.env.NODE_ENV` in place, which does not exist in a browser page.
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'VedraOpusPlayer',
      formats: ['iife'],
      fileName: () => 'player.js',
      cssFileName: 'player',
    },
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    sourcemap: false,
    minify: true,
  },
});

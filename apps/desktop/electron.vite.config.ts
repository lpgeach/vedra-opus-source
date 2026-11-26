import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import { thirdPartyNotices } from '../../scripts/third-party-notices.mjs';

// Everything except Electron and Node built-ins is bundled, so the packaged
// app carries no node_modules. Keep all packages in devDependencies. Each bundle
// lists the npm packages built into it (third-party-notices.json), for
// Help → Third-Party Notices… (docs/briefs/R2-notices-and-sources.md).
export default defineConfig({
  main: {
    plugins: [thirdPartyNotices()],
    build: { externalizeDeps: false },
  },
  preload: {
    plugins: [thirdPartyNotices()],
    // Sandboxed preload scripts must be a single CommonJS file.
    build: {
      externalizeDeps: false,
      isolatedEntries: true,
      rollupOptions: {
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    plugins: [react(), thirdPartyNotices()],
  },
});

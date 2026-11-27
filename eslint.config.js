import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Package dependency direction (docs/PLAN.md §3.1). Each package may import
 * only the packages listed before it. `platformFree` packages must also stay
 * clear of React, Electron and Node so they run anywhere and test headlessly.
 */
const layers = [
  { name: 'model', platformFree: true },
  { name: 'engine', platformFree: true },
  { name: 'render' },
  { name: 'player' },
  { name: 'publish' },
];

const boundaryConfigs = layers.map(({ name, platformFree }, index) => {
  const forbiddenPackages = layers.slice(index).map((layer) => `@vedraopus/${layer.name}`);
  const patterns = [
    {
      group: [
        ...forbiddenPackages,
        ...forbiddenPackages.map((pkg) => `${pkg}/*`),
        'vedraopus-desktop',
      ],
      message: `@vedraopus/${name} may only import packages below it in the dependency order: model ← engine ← render ← player ← publish.`,
    },
    {
      group: ['electron', 'electron/*'],
      message: 'Only apps/desktop may import Electron.',
    },
  ];
  if (platformFree) {
    patterns.push({
      group: ['react', 'react/*', 'react-dom', 'react-dom/*', 'node:*'],
      message: `@vedraopus/${name} must stay free of React and Node APIs (docs/PLAN.md §3.1).`,
    });
  }
  return {
    files: [`packages/${name}/**/*.{ts,tsx}`],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns }] },
  };
});

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/out/**',
      '**/dist/**',
      '**/release/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}', 'packages/{render,player}/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // The renderer is sandboxed: it reaches the OS only through window.vedraopus.
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['electron', 'electron/*', 'node:*', '../main/*', '../preload/*'],
              message:
                'The renderer has no Node or Electron access. Go through window.vedraopus (src/shared/ipc.ts).',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'apps/desktop/src/{main,preload}/**/*.ts',
      '*.config.{js,ts}',
      '**/*.config.{js,ts}',
      'e2e/**/*.ts',
      'help/**/*.ts',
      'fixtures/**/*.ts',
      'scripts/**/*.mjs',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    // Loaded into Electron's main process with `-r`, which takes CommonJS only.
    files: ['e2e/**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  ...boundaryConfigs,
  prettier,
);

// Lint config for the mobile app.
//
// It exists for one rule in particular: react-hooks/rules-of-hooks. A hook
// placed after an early return runs on some renders and not others, and React
// rejects that at runtime with "Rendered more hooks than during the previous
// render" — a blank screen, not a warning. TypeScript cannot see it, and a
// test that never mounts the component cannot either, so it takes a linter.
//
// Deliberately narrow. eslint-config-expo pulls in eslint-plugin-react, which
// does not yet work with ESLint 10 and fails while loading its own rules. The
// hooks plugin alone has no such conflict and covers the failure that actually
// bit us.

const reactHooks = require('eslint-plugin-react-hooks');
const tsParser = require('@typescript-eslint/parser');

module.exports = [
  {
    ignores: ['dist/**', '.expo/**', 'node_modules/**', 'expo-env.d.ts', 'nativewind-env.d.ts'],
  },
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // An error, never a warning: the failure mode is a screen that will not
      // render at all.
      'react-hooks/rules-of-hooks': 'error',
      // Stale-closure bugs are real but noisier to fix, and the deliberate
      // omissions in this codebase already carry inline disables.
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];

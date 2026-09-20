import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  // CJS is emitted for Metro (Expo) and any CommonJS consumer; ESM for Next.js.
  format: ['esm', 'cjs'],
  outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.js' }),
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  treeshake: true,
});

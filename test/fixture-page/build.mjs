// Bundles test/fixture-page/fixture.ts -> test/fixture-page/dist/fixture.js (gitignored).
//   node test/fixture-page/build.mjs
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints: [resolve(here, 'fixture.ts')],
  outfile: resolve(here, 'dist/fixture.js'),
  bundle: true,
  format: 'iife',
  target: 'es2022',
  minify: false,
  define: { 'process.env.NODE_ENV': '"development"' },
  logLevel: 'warning',
  charset: 'ascii',
});
console.log('fixture built: ' + resolve(here, 'dist/fixture.js'));

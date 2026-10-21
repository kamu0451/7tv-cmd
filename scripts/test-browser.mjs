// npm run test:browser: builds the fixture page (test/fixture-page/dist, gitignored), then runs the
// Playwright suite in test/browser with the repo's playwright.config.ts. Plain node calls, no shell
// operators, so it behaves the same on Windows, macOS and Linux. The exit code is the first
// failing step's code. Extra arguments go to Playwright: npm run test:browser -- keyboard
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function step(label, script, args) {
  console.log('[test-browser] ' + label);
  const r = spawnSync(process.execPath, [script, ...args], { cwd: root, stdio: 'inherit' });
  if (r.error) {
    console.error('[test-browser] ' + label + ' could not start: ' + r.error.message);
    return 1;
  }
  if (r.status === null) {
    console.error('[test-browser] ' + label + ' was stopped by signal ' + r.signal);
    return 1;
  }
  if (r.status !== 0) console.error('[test-browser] ' + label + ' exited with code ' + r.status);
  return r.status;
}

if (!existsSync(resolve(root, 'dist/chrome/manifest.json'))) {
  console.error('[test-browser] dist/chrome is missing: run npm run build first');
  process.exit(1);
}

if (!existsSync(resolve(root, 'vendor/7tv-patched'))) {
  console.log('[test-browser] vendor/7tv-patched is absent: the 7TV test in live.spec.ts will be skipped (how to get it: docs/LEDGER.md, section "Round 0 -> 1")');
}

let code = step('build the fixture page', resolve(root, 'test/fixture-page/build.mjs'), []);
if (code === 0) {
  code = step('playwright test', resolve(root, 'node_modules/@playwright/test/cli.js'), ['test', ...process.argv.slice(2)]);
}
process.exit(code);

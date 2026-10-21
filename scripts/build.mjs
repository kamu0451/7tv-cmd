// Build: typecheck, esbuild bundles, per-browser manifests -> dist/firefox and dist/chrome.
// Usage: node scripts/build.mjs   (npm run build). Exit code 1 on any failure.
//
// Bundles (iife, ES2022, firefox121 + chrome116, no splitting, no sourcemap, ASCII-escaped output):
//   src/content/index.ts    -> content.js
//   src/background/index.ts -> background.js
//   src/action/index.ts     -> action/index.js
// src/action/index.html is copied to action/index.html.
//
// Manifest (docs/SPEC.md section 9): src/manifest.json is the base. The build adds
//   version                  from package.json
//   host_permissions         from src/providers/hosts.json (a JSON array written by part 2; each
//                            entry is either a match pattern such as "https://moo.bot/*" or a bare
//                            host such as "moo.bot", which becomes "https://moo.bot/*"; omitted when empty)
//   Firefox  background.scripts + browser_specific_settings.gecko { id, strict_min_version,
//            data_collection_permissions { required: ["none"] } }
//   Chrome   background.service_worker + minimum_chrome_version, no browser_specific_settings

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const dist = join(root, 'dist');

const GECKO_ID = '7tv-cmd@example.com';
// 140 introduced data_collection_permissions on desktop, 142 on Android (web-ext lint); docs/LEDGER.md round 1.
const GECKO_MIN = '140.0';
const GECKO_ANDROID_MIN = '142.0';
const CHROME_MIN = '116';
const EXPECTED = ['manifest.json', 'content.js', 'background.js', 'action/index.js', 'action/index.html'];

function fail(msg) {
  console.error('[build] FAIL: ' + msg);
  process.exit(1);
}

function typecheck() {
  const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
  const r = spawnSync(process.execPath, [tsc, '--noEmit', '-p', join(root, 'tsconfig.json')], {
    cwd: root,
    encoding: 'utf8',
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) fail('tsc --noEmit exited with ' + r.status);
  console.log('[build] typecheck ok');
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    return fail('cannot read ' + file + ': ' + (e instanceof Error ? e.message : String(e)));
  }
}

function readHosts() {
  const list = readJson(join(src, 'providers', 'hosts.json'));
  if (!Array.isArray(list)) fail('src/providers/hosts.json must be a JSON array');
  const out = [];
  for (const entry of list) {
    if (typeof entry !== 'string' || !entry) fail('bad hosts.json entry: ' + JSON.stringify(entry));
    const pattern = entry.includes('://') ? entry : 'https://' + entry + '/*';
    if (!/^https:\/\/[a-z0-9.*-]+\/\*$/i.test(pattern)) fail('bad hosts.json entry: ' + JSON.stringify(entry));
    if (!out.includes(pattern)) out.push(pattern);
  }
  return out.sort();
}

function manifestFor(browser, pkg, hosts) {
  const base = readJson(join(src, 'manifest.json'));
  const m = { manifest_version: base.manifest_version, name: base.name, version: pkg.version, ...base };
  m.version = pkg.version;
  if (hosts.length) m.host_permissions = hosts;
  if (browser === 'firefox') {
    m.background = { scripts: ['background.js'] };
    m.browser_specific_settings = {
      // browsingActivity: the channel login from the page URL is sent to the bot providers (PRIVACY.md).
      gecko: { id: GECKO_ID, strict_min_version: GECKO_MIN, data_collection_permissions: { required: ['browsingActivity'] } },
      gecko_android: { strict_min_version: GECKO_ANDROID_MIN },
    };
  } else {
    m.background = { service_worker: 'background.js' };
    m.minimum_chrome_version = CHROME_MIN;
  }
  return JSON.stringify(m, null, 2) + '\n';
}

async function buildBrowser(browser, pkg, hosts) {
  const out = join(dist, browser);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'action'), { recursive: true });

  await esbuild({
    entryPoints: {
      content: join(src, 'content', 'index.ts'),
      background: join(src, 'background', 'index.ts'),
      'action/index': join(src, 'action', 'index.ts'),
    },
    outdir: out,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2022', 'firefox121', 'chrome116'],
    splitting: false,
    sourcemap: false,
    minify: false,
    charset: 'ascii',
    legalComments: 'none',
    logLevel: 'warning',
  });

  cpSync(join(src, 'action', 'index.html'), join(out, 'action', 'index.html'));

  const manifest = manifestFor(browser, pkg, hosts);
  if (!/^[\x00-\x7f]*$/.test(manifest)) fail(browser + ' manifest contains non-ASCII text');
  writeFileSync(join(out, 'manifest.json'), manifest);

  const sizes = [];
  for (const rel of EXPECTED) {
    const file = join(out, rel);
    if (!existsSync(file)) fail('missing output ' + browser + '/' + rel);
    sizes.push(rel + ' ' + statSync(file).size + ' B');
  }
  console.log('[build] dist/' + browser + ': ' + sizes.join(', '));
}

async function main() {
  const pkg = readJson(join(root, 'package.json'));
  if (typeof pkg.version !== 'string') fail('package.json has no version');
  typecheck();
  const hosts = readHosts();
  for (const browser of ['firefox', 'chrome']) await buildBrowser(browser, pkg, hosts);
  console.log('[build] ok, version ' + pkg.version + ', host_permissions ' + hosts.length);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));

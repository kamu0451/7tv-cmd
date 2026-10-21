// Shared Playwright launcher for every browser check in this repo.
// Chromium only here (extensions need a persistent context). Firefox runs go through web-ext.
//
//   import { launchChromium } from './tools/pw/browser.mjs'
//   const ctx = await launchChromium({ extensions: ['C:/x/vendor/7tv'], profileDir: '.pw-profiles/ref' })
//
// Options:
//   extensions  array of UNPACKED extension directories (absolute, forward slashes)
//   profileDir  user-data dir; created if missing. Keep it under .pw-profiles/ (gitignored),
//               never the owner's own browser profile.
//   headless    default true. The 'chromium' channel is the new headless mode, which loads
//               extensions; fall back to headless:false if an extension's service worker never starts.
//   video       directory for recordVideo, or undefined
//   viewport    default 1280x800
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export async function launchChromium(opts = {}) {
  const {
    extensions = [],
    profileDir = '.pw-profiles/default',
    headless = true,
    video,
    viewport = { width: 1280, height: 800 },
  } = opts;
  const dir = resolve(profileDir);
  mkdirSync(dir, { recursive: true });
  const args = ['--no-first-run', '--no-default-browser-check'];
  if (extensions.length) {
    const list = extensions.map((e) => resolve(e)).join(',');
    args.push('--disable-extensions-except=' + list, '--load-extension=' + list);
  }
  const ctx = await chromium.launchPersistentContext(dir, {
    channel: 'chromium',
    headless,
    args,
    viewport,
    recordVideo: video ? { dir: video, size: viewport } : undefined,
    ignoreDefaultArgs: ['--disable-extensions'],
  });
  return ctx;
}

// Wait until an extension's service worker (MV3) is registered, returns it or null after timeoutMs.
export async function waitForServiceWorker(ctx, timeoutMs = 15000) {
  const existing = ctx.serviceWorkers();
  if (existing.length) return existing[0];
  try {
    return await ctx.waitForEvent('serviceworker', { timeout: timeoutMs });
  } catch {
    return null;
  }
}

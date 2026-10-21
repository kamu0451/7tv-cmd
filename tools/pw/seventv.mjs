// 7TV reference helpers: launch Chromium with the vendored 7TV build and open a Twitch popout chat.
//
//   import { launchWithSevenTv, openPopoutChat } from './tools/pw/seventv.mjs'
//   const ctx = await launchWithSevenTv({ profileDir: '.pw-profiles/ref-7tv' })
//   const page = await openPopoutChat(ctx, 'coconutb')
//
// vendor/7tv is untrusted third-party code: it is only ever loaded as an extension, never run in node.
import { launchChromium } from './browser.mjs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const SEVENTV_DIR = resolve(here, '../../vendor/7tv');

// Native Twitch Slate editor. With 7TV loaded the native editor is hidden and 7TV mounts its own
// contenteditable, so callers wait for ANY_CHAT_INPUT (first visible match wins).
export const CHAT_INPUT = 'div.chat-input.chat-wysiwyg-input__editor[contenteditable="true"]';
export const ANY_CHAT_INPUT = '.chat-input [contenteditable="true"], .seventv-chat-input [contenteditable="true"], [class*="seventv"][contenteditable="true"], ' + CHAT_INPUT;

// The vendored site.js first fetches https://extension.7tv.gg/manifest.json and, if a newer build is
// hosted there, injects THAT remote build instead of its own files ("hosted mode"; on 2026-10-21 the
// hosted build was v3.1.10). localMode:true aborts requests to extension.7tv.gg so the extension
// falls back to the bundled v3.1.6 files ("local mode"), which is what this repo vendored.
//
// patched:true (default) loads vendor/7tv-patched: the same v3.1.6 files with ONE guard added in
// assets/seventv.ChatInputControllerModule.3.1.6.js (`if(!o)return n;` ->
// `if(!o||!o.props||!Array.isArray(o.props.children))return n;`). Stock 7TV (local v3.1.6 AND hosted
// v3.1.10) throws "o.props.children.splice is not a function" in its chat-input button patch on the
// 2026-10-21 Twitch build, the ChatInputLatencyTrackingErrorBoundary catches it and the whole chat
// input disappears (logged out; logged in was not checked). The guard only skips 7TV's extra input
// buttons; the autocomplete code (ChatInputModule) is untouched.
export const SEVENTV_PATCHED_DIR = resolve(here, '../../vendor/7tv-patched');

export async function launchWithSevenTv({ profileDir = '.pw-profiles/ref-7tv', headless = true, video, extensions = [], localMode = true, patched = true } = {}) {
  const dir = patched ? SEVENTV_PATCHED_DIR : SEVENTV_DIR;
  const ctx = await launchChromium({ extensions: [dir, ...extensions], profileDir, headless, video });
  if (localMode) await ctx.route(/^https:\/\/extension\.7tv\.gg\//, (route) => route.abort());
  return ctx;
}

// Opens https://www.twitch.tv/popout/<channel>/chat, rejects the cookie banner if shown,
// waits for the chat input and returns the page.
export async function openPopoutChat(ctx, channel, { url } = {}) {
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(url || `https://www.twitch.tv/popout/${channel}/chat`, { waitUntil: 'domcontentloaded' });
  await rejectCookies(page);
  await chatInput(page).waitFor({ state: 'visible', timeout: 30000 });
  await rejectCookies(page);
  return page;
}

// Locator for the visible chat input (native or 7TV-mounted).
export function chatInput(page) {
  return page.locator(ANY_CHAT_INPUT).filter({ visible: true }).last();
}

async function rejectCookies(page) {
  const btn = page.getByRole('button', { name: /^Reject/i }).first();
  try {
    await btn.click({ timeout: 4000 });
  } catch {
    // no banner, or already dismissed
  }
}

// Resolves true when any 7TV-injected element is present.
export async function waitForSevenTv(page, timeoutMs = 20000) {
  try {
    await page.waitForSelector('[class*="seventv"]', { timeout: timeoutMs, state: 'attached' });
    return true;
  } catch {
    return false;
  }
}

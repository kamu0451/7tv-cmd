// Live check against the REAL https://www.twitch.tv/popout/coconutb/chat with dist/chrome,
// logged out, read-only: "!" -> rows, "b" -> narrowed rows, Tab -> "!name ", then the input is
// cleared with Control+A, Delete. Enter is NEVER pressed here. Zero console errors from the
// extension. Both describes share ONE persistent profile (.pw-profiles/browser-live), so the
// provider fetch cycle runs at most once per hour (SPEC 1.7); a second run within the hour is
// served from the cache.
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-ignore - plain .mjs launchers
import { launchChromium } from '../../tools/pw/browser.mjs';
// @ts-ignore
import { launchWithSevenTv, openPopoutChat, SEVENTV_PATCHED_DIR } from '../../tools/pw/seventv.mjs';
import { popupState, events, isExtensionError, DIST_CHROME, CHANNEL, ROOT } from './harness';

const PROFILE = resolve(ROOT, '.pw-profiles/browser-live');
const SLATE = 'div[data-a-target="chat-input"][data-slate-editor="true"][contenteditable="true"]';

// Errors attributed to THIS extension only: its chrome-extension://<id> origin or the "7tv-cmd"
// prefix (7TV logs its own errors from its own extension origin; those are not ours).
async function collectErrors(ctx: BrowserContext, page: Page): Promise<string[]> {
  const errs: string[] = [];
  const deadline = Date.now() + 15000;
  let ours = '';
  while (!ours && Date.now() < deadline) {
    for (const w of ctx.serviceWorkers()) {
      const name = await w.evaluate(() => (globalThis as unknown as { chrome: { runtime: { getManifest(): { name: string } } } }).chrome.runtime.getManifest().name).catch(() => '');
      if (name.startsWith('7tv-cmd')) {
        ours = new URL(w.url()).host;
        w.on('console', (m) => { if (m.type() === 'error') errs.push('sw: ' + m.text().slice(0, 200)); });
      }
    }
    if (!ours) await new Promise((r) => setTimeout(r, 250));
  }
  if (!ours) throw new Error('7tv-cmd service worker not found');
  const mine = (text: string, url: string) => url.includes('chrome-extension://' + ours) || isExtensionError(text, '') ;
  page.on('console', (m) => {
    if (m.type() === 'error' && mine(m.text(), m.location().url)) errs.push('console: ' + m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => {
    if (mine(String(e.message), String(e.stack ?? ''))) errs.push('pageerror: ' + e.message.slice(0, 200));
  });
  return errs;
}

async function textOf(page: Page): Promise<string> {
  return page.evaluate((s) => {
    const e = [...document.querySelectorAll(s)].filter((x) => (x as HTMLElement).getClientRects().length).pop();
    return e ? (e.textContent ?? '').split(String.fromCharCode(0xfeff)).join('') : '';
  }, SLATE);
}

async function bangFlow(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __tv: unknown[] };
    w.__tv = [];
    document.addEventListener('tvcmd', (e) => { try { w.__tv.push(JSON.parse((e as CustomEvent).detail)); } catch { /* ignore */ } });
  });
  const ed = page.locator(SLATE).filter({ visible: true }).last();
  await ed.click();
  await page.keyboard.type('!');
  await expect.poll(() => textOf(page)).toBe('!');
  // the first visit may wait for the live fetch (adapter deadline 2 s, background 2.5 s)
  await expect.poll(async () => (await popupState(page)).rows.length, { timeout: 15000 }).toBeGreaterThan(0);
  const all = (await popupState(page)).rows.length;
  await page.keyboard.type('b');
  await expect.poll(async () => {
    const st = await popupState(page);
    return st.open && st.rows.length <= all && st.rows.every((r) => r.toLowerCase().includes('b'));
  }).toBe(true);
  const narrowed = (await popupState(page)).rows;
  expect(narrowed.length).toBeGreaterThan(0);
  await page.keyboard.press('Tab');
  await expect.poll(async () => (await popupState(page)).open).toBe(false);
  // the insertion lands after a frame wait (afterFrame, docs/part3-notes.md); the popup closes first
  await expect.poll(() => textOf(page), { timeout: 3000 }).toMatch(/^!\S+ $/).catch(() => undefined);
  const txt = await textOf(page);
  try {
    expect(txt.startsWith('!')).toBe(true);
    expect(txt.endsWith(' ')).toBe(true);
    expect(txt.length).toBeGreaterThan(2);
  } finally {
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
  }
  await expect.poll(() => textOf(page)).toBe('');
  const evs = (await events(page)) as Array<{ event: string }>;
  expect(evs.some((e) => e.event === 'open')).toBe(true);
}

test.describe('live popout chat, dist/chrome', () => {
  test.describe.configure({ mode: 'serial' });
  let ctx: BrowserContext;
  test.afterAll(async () => { await ctx?.close(); });

  test('"!" -> rows, "b" -> narrowed, Tab -> "!name ", zero extension errors', async () => {
    ctx = await launchChromium({ extensions: [DIST_CHROME], profileDir: PROFILE });
    const page = ctx.pages()[0] || (await ctx.newPage());
    const errs = await collectErrors(ctx, page);
    await openPopoutChat(ctx, CHANNEL);
    await bangFlow(page);
    await page.waitForTimeout(1000);
    expect(errs).toEqual([]);
  });
});

test.describe('live popout chat, dist/chrome + 7TV', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!existsSync(SEVENTV_PATCHED_DIR), 'vendor/7tv-patched not present');
  let ctx: BrowserContext;
  test.afterAll(async () => { await ctx?.close(); });

  test('same flow with 7TV, and ":" opens 7TV\'s tray, not ours', async () => {
    ctx = await launchWithSevenTv({ profileDir: PROFILE, extensions: [DIST_CHROME] });
    const page = ctx.pages()[0] || (await ctx.newPage());
    const errs = await collectErrors(ctx, page);
    await openPopoutChat(ctx, CHANNEL);
    await page.waitForSelector('seventv-container.seventv-chat-input-container', { timeout: 20000 });
    await bangFlow(page);
    const ed = page.locator(SLATE).filter({ visible: true }).last();
    await ed.click();
    await page.keyboard.type(':ee', { delay: 60 });
    try {
      await expect(page.locator('div.autocomplete-match-list').first()).toBeVisible({ timeout: 10000 });
      expect((await popupState(page)).open).toBe(false);
    } finally {
      await page.keyboard.press('Escape');
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Delete');
    }
    await page.waitForTimeout(1000);
    expect(errs).toEqual([]);
  });
});

// Shared helpers for the Playwright browser specs (test/browser/*.spec.ts).
// Fixture mode: the content script runs on test/fixture-page served by context.route under the
// real popout URL (the manifest matches *.twitch.tv), every other request is aborted, and the
// command list is seeded into storage.local (key cc:coconutb, SPEC 5.4) from test/fixtures, so
// these tests make no network request at all.
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-ignore - plain .mjs launcher shared by every browser check
import { launchChromium, waitForServiceWorker } from '../../tools/pw/browser.mjs';
import { ADAPTERS } from '../../src/providers/index';
import { parseCommands as nightbotCommands } from '../../src/providers/nightbot';
import { parseCommands as seCommands } from '../../src/providers/streamelements';
import { mergeCommands } from '../../src/providers/merge';
import { filterCommands } from '../../src/match/match';
import type { Command, ProviderResult } from '../../src/shared/types';

export const ROOT = resolve(process.cwd()); // npm run test:browser runs from the repo root
export const DIST_CHROME = resolve(ROOT, 'dist/chrome');
export const CHANNEL = 'coconutb';
export const POPOUT = 'https://www.twitch.tv/popout/' + CHANNEL + '/chat';
export const EDITOR = 'div[data-a-target="chat-input"][data-slate-editor="true"][contenteditable="true"]';

const fx = (p: string) => JSON.parse(readFileSync(resolve(ROOT, 'test/fixtures', p), 'utf8'));

// Provider results built from the recorded coconutb fixtures (Nightbot + StreamElements).
export function fixtureProviders(now: number): Record<string, ProviderResult> {
  const lists: Record<string, Command[]> = {
    nightbot: nightbotCommands(fx('nightbot/coconutb.commands.json')),
    streamelements: seCommands(fx('streamelements/coconutb.commands.json')),
  };
  const out: Record<string, ProviderResult> = {};
  for (const a of ADAPTERS) {
    const cmds = lists[a.id] ?? [];
    out[a.id] = {
      provider: a.id,
      status: !a.enabled ? 'unsupported' : cmds.length ? 'ok' : 'empty',
      commands: cmds,
      fetchedAt: now,
      requests: 0,
    };
  }
  return out;
}

export function fixtureCommands(): Command[] {
  return mergeCommands(Object.values(fixtureProviders(0)));
}

// Expected row primary texts ("!" + matched) for a query, from the shipped matcher.
export function expectedRows(query: string): string[] {
  return filterCommands(fixtureCommands(), query).map((s) => '!' + s.matched);
}

export async function launchFixture(profile: string): Promise<BrowserContext> {
  const ctx: BrowserContext = await launchChromium({ extensions: [DIST_CHROME], profileDir: resolve(ROOT, '.pw-profiles', profile) });
  const html = readFileSync(resolve(ROOT, 'test/fixture-page/index.html'), 'utf8');
  const bundle = resolve(ROOT, 'test/fixture-page/dist/fixture.js');
  if (!existsSync(bundle)) throw new Error('run node test/fixture-page/build.mjs first');
  const js = readFileSync(bundle, 'utf8');
  // Later routes win: catch-all abort first, then the two fixture URLs.
  await ctx.route(() => true, (route) => route.abort());
  await ctx.route((u) => u.href === 'https://www.twitch.tv/__fixture/fixture.js', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: js }));
  await ctx.route((u) => u.href.startsWith(POPOUT), (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: html }));
  const sw: Worker | null = await waitForServiceWorker(ctx);
  if (!sw) throw new Error('extension service worker did not start');
  const entry = { v: 1, fetchedAt: Date.now(), providers: fixtureProviders(Date.now()) };
  await sw.evaluate(async (e) => {
    const g = globalThis as unknown as { chrome: { storage: { local: { set(i: object): Promise<void> } } } };
    await g.chrome.storage.local.set({ 'cc:coconutb': e });
  }, entry);
  await ctx.addInitScript(() => {
    const w = window as unknown as { __tv: Array<Record<string, unknown>> };
    w.__tv = [];
    document.addEventListener('tvcmd', (e) => {
      try { w.__tv.push(JSON.parse((e as CustomEvent).detail)); } catch { /* not ours */ }
    });
  });
  return ctx;
}

export interface PopupState { open: boolean; rows: string[]; aliases: string[]; sel: number }

export async function popupState(page: Page): Promise<PopupState> {
  return page.evaluate(() => {
    const h = document.querySelector('#tvcmd-popup-host') as HTMLElement | null;
    if (!h || !h.shadowRoot) return { open: false, rows: [], aliases: [], sel: -1 };
    const rows = [...h.shadowRoot.querySelectorAll('[role="option"]')].filter((x) => (x as HTMLElement).getClientRects().length > 0);
    const open = h.dataset.tvcmdOpen === '1' && rows.length > 0;
    return {
      open,
      rows: open ? rows.map((r) => (r.querySelector('.name')?.textContent ?? '').trim()) : [],
      aliases: open ? rows.map((r) => (r.querySelector('.alias')?.textContent ?? '').trim()) : [],
      sel: open ? rows.findIndex((r) => r.getAttribute('aria-selected') === 'true') : -1,
    };
  });
}

// The draft as the DOM shows it (U+FEFF removed, the way the content script cleans it).
export async function domText(page: Page, sel = EDITOR): Promise<string> {
  return page.evaluate((s) => {
    const e = [...document.querySelectorAll(s)].filter((x) => (x as HTMLElement).getClientRects().length).pop();
    if (!e) return '';
    return (e.textContent ?? '').split(String.fromCharCode(0xfeff)).join('');
  }, sel);
}

export async function draft(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as { __fixture: { draft(): string } }).__fixture.draft());
}

export async function events(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(() => (window as unknown as { __tv: Array<Record<string, unknown>> }).__tv.slice());
}

export async function clearInput(page: Page, sel = EDITOR): Promise<void> {
  const ed = page.locator(sel).filter({ visible: true }).last();
  await ed.click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
}

export function isExtensionError(text: string, url: string): boolean {
  return /chrome-extension:\/\//.test(url) || /7tv-cmd/.test(text);
}

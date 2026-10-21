// Integration end-to-end check in Chromium (round 1 integration agent).
//   node tools/dev/int-e2e.mjs --mode plain|7tv --channel coconutb [--full true] [--tag x]
// Loads dist/chrome (plus vendor/7tv-patched with --mode 7tv) in the profile .pw-profiles/rec-ext,
// which is shared with tools/pw/record.mjs so a cached channel is not fetched again within the hour.
// Read-only: no login, no chat message. Enter is never pressed; the input is cleared with
// Control+A, Delete before leaving. Writes docs/critics/r1/int-<tag>-*.png and prints one JSON line.
import { launchChromium, waitForServiceWorker } from '../pw/browser.mjs';
import { launchWithSevenTv, openPopoutChat, chatInput } from '../pw/seventv.mjs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i += 2) opt[argv[i].replace(/^--/, '')] = argv[i + 1];
const mode = opt.mode || 'plain';
const channel = opt.channel || 'coconutb';
const full = opt.full === 'true';
const tag = opt.tag || (mode + '-' + channel);
const ext = resolve('dist/chrome');
const shots = resolve('docs/critics/r1');
const FE = String.fromCharCode(0xfeff);
const out = { mode, channel, steps: {}, consoleErrors: [], extWarnings: [], events: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ctx = mode === '7tv'
  ? await launchWithSevenTv({ profileDir: '.pw-profiles/rec-ext', extensions: [ext] })
  : await launchChromium({ extensions: [ext], profileDir: '.pw-profiles/rec-ext' });
const sw = await waitForServiceWorker(ctx);
out.serviceWorker = !!sw;
const isOurs = (m) => /7tv-cmd|chrome-extension:\/\//.test(m.text() + ' ' + JSON.stringify(m.location()));
ctx.on('console', (m) => {
  if (m.type() === 'error' && isOurs(m)) out.consoleErrors.push(m.text().slice(0, 200));
  if (m.type() === 'warning' && /\[7tv-cmd\]/.test(m.text())) out.extWarnings.push(m.text().slice(0, 200));
});
ctx.on('weberror', (e) => { const s = String(e.error()); if (/chrome-extension|tvcmd/.test(s + (e.error().stack || ''))) out.consoleErrors.push(s.slice(0, 200)); });
await ctx.addInitScript(() => {
  window.__tv = [];
  document.addEventListener('tvcmd', (e) => { try { window.__tv.push(JSON.parse(e.detail)); } catch { /* ignore */ } });
});

const page = await openPopoutChat(ctx, channel);
const input = chatInput(page);
await sleep(3000);
// A channel's chat-rules dialog covers the input for logged-out viewers; closing it is local UI only.
try { await page.getByRole('button', { name: /^Okay, Got It/i }).first().click({ timeout: 2000 }); } catch { /* none */ }

const popup = () => page.evaluate(() => {
  const h = document.querySelector('#tvcmd-popup-host');
  if (!h || !h.shadowRoot) return { host: false, open: false, rows: [] };
  const rows = [...h.shadowRoot.querySelectorAll('[role="option"]')].filter((r) => r.offsetParent !== null || r.getClientRects().length);
  return { host: true, open: h.dataset.tvcmdOpen === '1', rows: rows.map((r) => r.textContent.replace(/\s+/g, ' ').trim()), sel: rows.findIndex((r) => r.getAttribute('aria-selected') === 'true') };
});
const text = async () => (await input.evaluate((el) => el.innerText)).split(FE).join('').replace(/\n$/, '');
const shot = (n) => page.screenshot({ path: shots + '/int-' + tag + '-' + n + '.png' });
const clear = async () => { await page.keyboard.press('Escape'); await page.keyboard.press('Control+A'); await page.keyboard.press('Delete'); await sleep(300); };
const waitOpen = async (want, ms = 4000) => { const t0 = Date.now(); for (;;) { const p = await popup(); if (p.open === want || Date.now() - t0 > ms) return p; await sleep(100); } };

await input.click();
// Logged-out viewers get a "Chat Rules" dialog on first focus; its button enables after the rules
// are scrolled to the end. Scrolling and pressing it is local UI only (nothing is sent).
await sleep(800);
if (await page.getByText('Chat Rules').first().isVisible().catch(() => false)) {
  await page.evaluate(() => { for (const el of document.querySelectorAll('div')) if (el.scrollHeight > el.clientHeight + 4 && /Chat Rules/.test(el.closest('[role="dialog"], .tw-dialog-layer, div')?.textContent || '')) el.scrollTop = el.scrollHeight; });
  await sleep(500);
  try { await page.getByRole('button', { name: /^Okay, Got It/i }).first().click({ timeout: 4000 }); out.rulesDialog = 'accepted'; } catch { out.rulesDialog = 'not dismissed'; }
  await sleep(500);
  await input.click();
}
await page.keyboard.type('!');
let p = await waitOpen(true, 6000);
out.steps.bang = { open: p.open, rows: p.rows.length, sel: p.sel, first: p.rows.slice(0, 3) };
await shot('01-bang');
await page.keyboard.type('b');
await sleep(400);
p = await popup();
out.steps.b = { open: p.open, rows: p.rows.length, first: p.rows.slice(0, 3) };
await shot('02-b');
await page.keyboard.press('ArrowDown');
await sleep(200);
p = await popup();
out.steps.down = { sel: p.sel, row: p.rows[p.sel] };
await shot('03-down');
await page.keyboard.press('Tab');
await sleep(500);
p = await popup();
out.steps.tab = { text: await text(), open: p.open };
await shot('04-tab');
await clear();

if (full) {
  await page.keyboard.type('!');
  await waitOpen(true);
  await page.keyboard.press('Escape');
  await sleep(300);
  p = await popup();
  out.steps.escape = { open: p.open, text: await text(), focused: await input.evaluate((el) => document.activeElement === el || el.contains(document.activeElement)) };
  await shot('05-escape');
  await clear();
  await page.keyboard.type('abc!');
  await sleep(800);
  p = await popup();
  out.steps.midword = { open: p.open, text: await text() };
  await shot('06-midword');
  await clear();
}

if (mode === '7tv') {
  out.sevenTvPresent = await page.evaluate(() => !!document.querySelector('seventv-container.seventv-chat-input-container'));
  await input.click();
  await page.keyboard.type(':ee');
  await sleep(1500);
  out.steps.colon = await page.evaluate(() => {
    const t = document.querySelector('div.autocomplete-match-list');
    return { tray: !!t && t.getClientRects().length > 0, rows: t ? t.children.length : 0 };
  });
  await page.keyboard.press('ArrowDown');
  await sleep(300);
  await shot('07-7tv-colon');
  p = await popup();
  out.steps.colon.oursOpen = p.open;
  await clear();
}

out.events = (await page.evaluate(() => window.__tv)).map((e) => e.event + (e.query !== undefined ? ':' + e.query : '') + (e.count !== undefined ? '#' + e.count : '') + (e.fromCache !== undefined ? (e.fromCache ? ':cache' : ':net') : ''));
console.log(JSON.stringify(out));
await ctx.close();

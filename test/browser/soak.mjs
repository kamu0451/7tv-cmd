// Soak run for SPEC 1.9 (zero errors from this extension over a session).
//   node test/browser/soak.mjs [--minutes 1] [--seventv] [--channel coconutb] [--headless false]
// Loads dist/chrome (plus vendor/7tv-patched with --seventv, tools/pw/seventv.mjs) on the popout
// chat, and every 30 s types "!", then "b", then clears the input (Escape, Control+A, Delete).
// Enter is never pressed. Collects console errors and uncaught exceptions from the page and from
// this extension's service worker; prints one summary line and exits 1 on any error from this
// extension (or when the popup never opened). Uses the shared profile .pw-profiles/browser-live,
// so the commands come from the cache the live spec filled (SPEC 1.7: one fetch cycle per hour).
import { resolve } from 'node:path';
import { launchChromium } from '../../tools/pw/browser.mjs';
import { launchWithSevenTv, openPopoutChat } from '../../tools/pw/seventv.mjs';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes('--' + n);
const val = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const minutes = Number(val('minutes', '1'));
const channel = val('channel', 'coconutb');
const seventv = flag('seventv');
const headless = val('headless', 'true') !== 'false';
const dist = resolve('dist/chrome');
const profileDir = resolve('.pw-profiles/browser-live');
const SLATE = 'div[data-a-target="chat-input"][data-slate-editor="true"][contenteditable="true"]';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const errors = [];
const otherErrors = [];
let ours = '';
const ctx = seventv
  ? await launchWithSevenTv({ profileDir, extensions: [dist], headless })
  : await launchChromium({ extensions: [dist], profileDir, headless });

function watchWorker(w) {
  w.evaluate(() => chrome.runtime.getManifest().name).then((name) => {
    if (!String(name).startsWith('7tv-cmd')) return;
    ours = new URL(w.url()).host;
    w.on('console', (m) => { if (m.type() === 'error') errors.push('sw console: ' + m.text().slice(0, 200)); });
  }).catch(() => {});
}
ctx.serviceWorkers().forEach(watchWorker);
ctx.on('serviceworker', watchWorker);

const mine = (text, url) => (ours && String(url).includes('chrome-extension://' + ours)) || /7tv-cmd/.test(String(text));
const page = ctx.pages()[0] || (await ctx.newPage());
let heartbeat = 0; // our own "[7tv-cmd]" debug lines: proves the console filter sees the content script
page.on('console', (m) => {
  if (/\[7tv-cmd\]/.test(m.text())) heartbeat++;
  if (m.type() !== 'error') return;
  const line = m.text().slice(0, 200);
  if (mine(m.text(), m.location().url)) errors.push('page console: ' + line);
  else otherErrors.push(line);
});
page.on('pageerror', (e) => {
  const line = String(e.message).slice(0, 200);
  if (mine(e.message, e.stack || '')) errors.push('pageerror: ' + line);
  else otherErrors.push('pageerror: ' + line);
});

const started = Date.now();
let cycles = 0;
let opened = 0;
let maxRows = 0;
let exitCode = 0;
try {
  await openPopoutChat(ctx, channel);
  await page.evaluate(() => {
    window.__tvOpen = 0;
    document.addEventListener('tvcmd', (e) => { try { if (JSON.parse(e.detail).event === 'open') window.__tvOpen++; } catch { /* ignore */ } });
  });
  const rowCount = () => page.evaluate(() => {
    const h = document.querySelector('#tvcmd-popup-host');
    if (!h || !h.shadowRoot || h.dataset.tvcmdOpen !== '1') return 0;
    return [...h.shadowRoot.querySelectorAll('[role="option"]')].filter((x) => x.getClientRects().length).length;
  });
  while (Date.now() - started < minutes * 60000) {
    const ed = page.locator(SLATE).filter({ visible: true }).last();
    await ed.click();
    await page.keyboard.type('!');
    await sleep(1500);
    const n = await rowCount();
    if (n > 0) opened++;
    maxRows = Math.max(maxRows, n);
    await page.keyboard.type('b');
    await sleep(800);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    cycles++;
    const left = minutes * 60000 - (Date.now() - started);
    if (left <= 0) break;
    await sleep(Math.min(30000 - 2300, left));
  }
  await sleep(1000);
} catch (e) {
  errors.push('driver: ' + String((e && e.message) || e).slice(0, 200));
} finally {
  await ctx.close();
}
if (errors.length || opened === 0) exitCode = 1;
const summary = {
  soak: exitCode ? 'errors' : 'ok', seventv, channel, minutes, cycles, opened, maxRows,
  extensionErrors: errors.length, otherPageErrors: otherErrors.length, swAttached: Boolean(ours), heartbeat,
  seconds: Math.round((Date.now() - started) / 1000),
};
console.log('SOAK ' + JSON.stringify(summary));
for (const e of errors.slice(0, 10)) console.log('  ' + e);
process.exit(exitCode);

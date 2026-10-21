// Firefox live check over tools/ff/marionette.mjs (SPEC section 10).
//   node test/browser/firefox-live.mjs [--channel coconutb] [--headless false]
// Temporary-installs dist/firefox, opens the real popout chat, rejects the cookie banner, sends
// "!" (read back before typing more: Slate attaches late), "b", ArrowDown, Tab; prints the popup
// row texts before Tab (div#tvcmd-popup-host's open shadow root) and the input text after, then
// clears the input with Control+a, Delete. Enter is never pressed. Exit 1 when no popup opened,
// the input does not start with "!" and end with a space, or the console heartbeat (the content
// script's "[7tv-cmd] loaded" debug line on Firefox stdout) is missing: then it prints
// "console capture not working" and reports extErrorLines null, never an empty list.
// Request budget (SPEC 1.7): profile .pw-profiles/ff-live with a fixed moz-extension UUID and
// extensions.webextensions.keepStorageOnUninstall, so the cache survives the temporary add-on's
// uninstall and a second run within the hour fetches nothing.
import { launchFirefox } from '../../tools/ff/marionette.mjs';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const val = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const channel = val('channel', 'coconutb');
const headless = val('headless', 'true') !== 'false';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = { channel, ok: false };

const profileDir = resolve('.pw-profiles/ff-live');
mkdirSync(profileDir, { recursive: true });
writeFileSync(profileDir + '/prefs.js', [
  'user_pref("devtools.console.stdout.content", true);',
  'user_pref("extensions.webextensions.keepStorageOnUninstall", true);',
  'user_pref("extensions.webextensions.uuids", ' + JSON.stringify(JSON.stringify({ '7tv-cmd@example.com': '5f0c2a8e-7c7d-4c4c-9a9a-0000007c0d02' })) + ');',
].join('\n') + '\n');

const SEL = 'div[data-a-target="chat-input"][data-slate-editor="true"]';
const readText = "const e = [...document.querySelectorAll(arguments[0])].filter((x) => x.getClientRects().length).pop(); return e ? e.textContent.split(String.fromCharCode(0xfeff)).join('') : null;";
const readPopup = "const h = document.querySelector('#tvcmd-popup-host'); if (!h || !h.shadowRoot) return { open: false, rows: [], sel: -1 }; const r = [...h.shadowRoot.querySelectorAll('[role=\"option\"]')].filter((x) => x.getClientRects().length); const open = h.dataset.tvcmdOpen === '1' && r.length > 0; return { open, rows: open ? r.map((x) => x.querySelector('.name').textContent + (x.querySelector('.alias').textContent ? ' ' + x.querySelector('.alias').textContent : '')) : [], sel: r.findIndex((x) => x.getAttribute('aria-selected') === 'true') };";
const reject = "const b = [...document.querySelectorAll('button')].find((x) => /^Reject/i.test(x.textContent.trim())); if (b) { b.click(); return true; } return false;";

const ff = await launchFirefox({ profileDir: '.pw-profiles/ff-live', headless });
try {
  await ff.installAddon(resolve('dist/firefox'), true);
  await ff.navigate('https://www.twitch.tv/popout/' + channel + '/chat');
  await ff.execute("window.__tv = []; document.addEventListener('tvcmd', (e) => { try { window.__tv.push(JSON.parse(e.detail)); } catch (x) {} }); return true;");
  for (let i = 0; i < 8 && !(await ff.execute(reject)); i++) await sleep(500);
  const el = await ff.find(SEL, 40000);
  await sleep(3000);
  await ff.execute(reject);
  await ff.click(el);
  let typed = '';
  for (let i = 0; i < 10 && typed !== '!'; i++) {
    if (i) { await ff.pressKey('Control+a'); await ff.pressKey('Delete'); await sleep(1000); }
    await ff.sendKeys(el, '!');
    await sleep(500);
    typed = await ff.execute(readText, [SEL]);
  }
  out.afterBang = typed;
  let p = { open: false, rows: [] };
  for (let i = 0; i < 20 && !p.open; i++) { await sleep(500); p = await ff.execute(readPopup); }
  out.bangRows = p.rows.length;
  await ff.sendKeys(el, 'b');
  await sleep(1000);
  await ff.pressKey('ArrowDown');
  await sleep(500);
  p = await ff.execute(readPopup);
  out.popupOpened = p.open;
  out.rowsBeforeTab = p.rows;
  out.selectedBeforeTab = p.sel;
  await ff.pressKey('Tab');
  await sleep(1000);
  out.textAfterTab = await ff.execute(readText, [SEL]);
  out.events = (await ff.execute('return window.__tv || [];')).map((e) => e.event + (e.query !== undefined ? ':' + e.query : '') + (e.count !== undefined ? '#' + e.count : '') + (e.fromCache !== undefined ? (e.fromCache ? ':cache' : ':net') : ''));
  out.ok = out.popupOpened && out.bangRows > 0 && typeof out.textAfterTab === 'string' && /^!\S+ $/.test(out.textAfterTab);
} catch (e) {
  out.error = String((e && e.message) || e).slice(0, 300);
} finally {
  try { await ff.pressKey('Escape'); await ff.pressKey('Control+a'); await ff.pressKey('Delete'); } catch { /* ignore */ }
  const log = ff.output.join('');
  // Heartbeat (SPEC 10, round 2): the content script's own debug line must reach stdout, else the
  // console capture is not working and no error count is claimed.
  out.consoleCaptured = log.includes('[7tv-cmd] loaded');
  if (out.consoleCaptured) {
    out.extErrorLines = log.split(/\r?\n/).filter((l) => /moz-extension|7tv-cmd/.test(l) && /error/i.test(l)).slice(0, 5);
  } else {
    console.log('console capture not working: the content script heartbeat "[7tv-cmd] loaded" is absent from Firefox stdout; error count unknown');
    out.extErrorLines = null;
  }
  out.captured = 'content console only (background console not probed by this test; see tools/dev/int-firefox.mjs)';
  await ff.quit();
}
out.ok = out.ok && out.consoleCaptured;
console.log(JSON.stringify(out, null, 1));
process.exit(out.ok ? 0 : 1);

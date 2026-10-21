// Integration check in Firefox through the Marionette driver (round 1 integration agent; round 2:
// per-channel shot names, console heartbeat, background console probe, sanitised text log).
//   node tools/dev/int-firefox.mjs [--channel coconutb] [--headless true] [--profile firefox-int]
//        [--uuid 5f0c2a8e-...01] [--out docs/critics/r2] [--prefix int-firefox] [--log <file>]
// Temporary install of dist/firefox in .pw-profiles/<profile>, popout chat, reject cookies,
// type "!" (read back before typing more) -> "b" -> ArrowDown -> Tab, read the input and the popup
// rows, screenshot each state to <out>/<prefix>-<channel>-NN-<step>.png, then open the extension's
// own action page with ?login= to read each provider's cached status (nightbot ok = api.nightbot.tv
// admitted the moz-extension:// origin; moobot empty/ok = the moo.bot POST chain succeeded under the
// host permission).
// Console (SPEC 10): devtools.console.stdout.content prints console API calls of web pages AND of
// moz-extension pages (non-system principals) to Firefox's stdout. HEARTBEAT: the content script's
// own debug line "[7tv-cmd] loaded" must appear in that output; if it does not, the run prints
// "console capture not working" and reports the error count as null, never 0. The background page is
// probed the same way: from the action page, runtime.getBackgroundPage() and a console.debug in the
// background window; the run prints which consoles were and were not captured.
// --log writes the JSON summary plus the extension's console lines with the repo path replaced by
// <repo> and the home directory / user name removed.
// Read-only: no login, Enter is never pressed, the input is cleared before leaving. Prints JSON.
import { launchFirefox } from '../ff/marionette.mjs';
import { resolve, dirname } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { userInfo, homedir } from 'node:os';

const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i += 2) opt[argv[i].replace(/^--/, '')] = argv[i + 1];
const channel = opt.channel || 'coconutb';
const shots = resolve(opt.out || 'docs/critics/r2');
const prefix = opt.prefix || 'int-firefox';
const shot = (nn, step) => shots + '/' + prefix + '-' + channel + '-' + nn + '-' + step + '.png';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = { channel, steps: {} };
mkdirSync(shots, { recursive: true });

// The console-to-stdout prefs, keepStorageOnUninstall (the cache survives the temporary add-on, so a
// second run inside the hour fetches nothing) and a fixed moz-extension UUID are seeded through
// prefs.js before launch (the driver rewrites user.js only). A profile copied from ff-live needs
// --uuid 5f0c2a8e-7c7d-4c4c-9a9a-0000007c0d02 to find its cache.
const profileRel = '.pw-profiles/' + (opt.profile || 'firefox-int');
const profileDir = resolve(profileRel);
const uuid = opt.uuid || '5f0c2a8e-7c7d-4c4c-9a9a-0000007c0d01';
mkdirSync(profileDir, { recursive: true });
writeFileSync(profileDir + '/prefs.js', [
  'user_pref("devtools.console.stdout.content", true);',
  'user_pref("devtools.console.stdout.chrome", true);',
  'user_pref("extensions.webextensions.keepStorageOnUninstall", true);',
  'user_pref("extensions.webextensions.uuids", ' + JSON.stringify(JSON.stringify({ '7tv-cmd@example.com': uuid })) + ');',
].join('\n') + '\n');
const BG_MARK = '[7tv-cmd] heartbeat background';
const ff = await launchFirefox({ profileDir: profileRel, headless: opt.headless !== 'false', extraArgs: ['-remote-allow-system-access'] });
try {
  out.addonId = await ff.installAddon('dist/firefox', true);

  await ff.navigate('https://www.twitch.tv/popout/' + channel + '/chat');
  await ff.execute("window.__tv = []; document.addEventListener('tvcmd', (e) => { try { window.__tv.push(JSON.parse(e.detail)); } catch (x) {} }); return true;");
  const reject = "const b = [...document.querySelectorAll('button')].find((x) => /^Reject/i.test(x.textContent.trim())); if (b) { b.click(); return true; } return false;";
  for (let i = 0; i < 8 && !(await ff.execute(reject)); i++) await sleep(500);
  const sel = 'div[data-a-target="chat-input"][data-slate-editor="true"]';
  const el = await ff.find(sel, 40000);
  await sleep(4000);
  await ff.execute(reject);
  const readText = () => ff.execute("const e = document.querySelector('" + sel.replace(/'/g, "\\'") + "'); return e ? e.innerText.split(String.fromCharCode(0xfeff)).join('').replace(/\\n$/, '') : null;");
  const readPopup = () => ff.execute("const h = document.querySelector('#tvcmd-popup-host'); if (!h || !h.shadowRoot) return { host: !!h, open: false, rows: [] }; const r = [...h.shadowRoot.querySelectorAll('[role=\"option\"]')].filter((x) => x.getClientRects().length); return { host: true, open: h.dataset.tvcmdOpen === '1', rows: r.map((x) => x.textContent.replace(/\\s+/g, ' ').trim()), sel: r.findIndex((x) => x.getAttribute('aria-selected') === 'true') };");

  await ff.click(el);
  // Slate attaches late: send "!" alone and read it back before typing more (driver header).
  let typed = '';
  for (let i = 0; i < 10 && typed !== '!'; i++) {
    if (i) { await ff.pressKey('Control+a'); await ff.pressKey('Delete'); await sleep(1000); }
    await ff.sendKeys(el, '!');
    await sleep(500);
    typed = await readText();
  }
  let p = { open: false, rows: [] };
  for (let i = 0; i < 20 && !p.open; i++) { await sleep(500); p = await readPopup(); }
  out.steps.bang = { text: await readText(), open: p.open, rows: p.rows.length, first: p.rows.slice(0, 2) };
  await ff.screenshot(shot('01', 'bang'));
  await ff.sendKeys(el, 'b');
  await sleep(800);
  p = await readPopup();
  out.steps.b = { text: await readText(), open: p.open, rows: p.rows.length, first: p.rows.slice(0, 3) };
  await ff.screenshot(shot('02', 'b'));
  await ff.pressKey('ArrowDown');
  await sleep(400);
  p = await readPopup();
  out.steps.down = { sel: p.sel, row: p.rows[p.sel] };
  await ff.screenshot(shot('03', 'down'));
  await ff.pressKey('Tab');
  await sleep(800);
  p = await readPopup();
  out.steps.tab = { text: await readText(), open: p.open };
  await ff.screenshot(shot('04', 'tab'));
  await ff.pressKey('Escape');
  await ff.pressKey('Control+a');
  await ff.pressKey('Delete');
  out.events = (await ff.execute('return window.__tv || [];')).map((e) => e.event + (e.query !== undefined ? ':' + e.query : '') + (e.count !== undefined ? '#' + e.count : '') + (e.fromCache !== undefined ? (e.fromCache ? ':cache' : ':net') : ''));

  const url = 'moz-extension://' + uuid + '/action/index.html?login=' + channel;
  try {
    await ff.navigate(url);
  } catch {
    // WebDriver:Navigate refuses moz-extension:// URLs; load it from the chrome context instead.
    await ff.m.send('Marionette:SetContext', { value: 'chrome' });
    await ff.execute("const w = Services.wm.getMostRecentWindow('navigator:browser'); w.gBrowser.selectedBrowser.loadURI(Services.io.newURI(arguments[0]), { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() }); return true;", [url]);
    await ff.m.send('Marionette:SetContext', { value: 'content' });
  }
  await sleep(3000);
  out.actionPage = (await ff.execute('return document.body.innerText;')).replace(/\s+/g, ' ').trim().slice(0, 600);
  await ff.screenshot(shot('05', 'action'));
  // Background heartbeat: the action page shares the extension's principal and can reach the
  // background window of a non-service-worker background (background.scripts).
  try {
    out.backgroundProbe = await ff.executeAsync("const done = arguments[arguments.length - 1]; const w = window.wrappedJSObject || window; const b = w.browser || w.chrome; if (!b || !b.runtime || !b.runtime.getBackgroundPage) { done('no runtime.getBackgroundPage in the action page'); return; } b.runtime.getBackgroundPage().then((bg) => { if (!bg) { done('getBackgroundPage returned null'); return; } bg.console.debug(arguments[0]); done('called'); }, (e) => done('getBackgroundPage failed: ' + String(e))); ", [BG_MARK]);
  } catch (e) {
    out.backgroundProbe = 'probe threw: ' + String((e && e.message) || e).slice(0, 160);
  }
  await sleep(1000);
} catch (e) {
  out.error = String(e && e.message || e).slice(0, 400);
  try { await ff.screenshot(shot('99', 'error')); } catch { /* ignore */ }
} finally {
  const log = ff.output.join('');
  const lines = log.split(/\r?\n/);
  const ext = lines.filter((l) => /7tv-cmd|moz-extension/.test(l));
  out.consoleCapture = {
    contentHeartbeat: ext.some((l) => l.includes('[7tv-cmd] loaded')),
    backgroundHeartbeat: ext.some((l) => l.includes(BG_MARK)),
    stdoutLines: lines.length,
  };
  out.extLines = ext.slice(0, 30).map((l) => l.slice(0, 200));
  const errs = ext.filter((l) => !l.includes('heartbeat') && /console\.error|console\.warn|error/i.test(l));
  if (!out.consoleCapture.contentHeartbeat) {
    console.log('console capture not working: the content script heartbeat "[7tv-cmd] loaded" is absent from Firefox stdout; error count unknown');
    out.extErrorLines = null;
  } else {
    out.extErrorLines = errs.length;
    out.extErrorSamples = errs.slice(0, 5).map((l) => l.slice(0, 200));
  }
  out.captured = 'content console: ' + (out.consoleCapture.contentHeartbeat ? 'captured (heartbeat seen)' : 'NOT captured')
    + '; background console: ' + (out.consoleCapture.backgroundHeartbeat ? 'captured (heartbeat seen)' : 'NOT captured (' + (out.backgroundProbe || 'probe not reached') + ')');
  await ff.quit();
  if (opt.log) {
    const repo = process.cwd();
    const user = userInfo().username;
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const variants = [repo, repo.replace(/\\/g, '/'), repo.replace(/\\/g, '\\\\'), repo.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (m, d) => '/' + d.toLowerCase())];
    const home = homedir();
    const homes = [home, home.replace(/\\/g, '/'), home.replace(/\\/g, '\\\\')];
    let text = JSON.stringify(out, null, 1) + '\n\n# Firefox stdout lines naming 7tv-cmd or moz-extension (' + ext.length + ' of ' + lines.length + ')\n' + ext.join('\n') + '\n';
    for (const v of variants) text = text.split(v).join('<repo>');
    for (const v of homes) text = text.split(v).join('<home>');
    if (user) text = text.replace(new RegExp('\\b' + esc(user) + '\\b', 'g'), '<user>');
    const logFile = resolve(opt.log);
    mkdirSync(dirname(logFile), { recursive: true });
    writeFileSync(logFile, text);
  }
}
console.log(JSON.stringify(out));

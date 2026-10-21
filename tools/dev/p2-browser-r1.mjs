// Part 2 critic, round 1: runtime proof of the request budget, timeouts, error caching and the
// action page, on dist/chrome in Playwright Chromium. Counting method: the service worker's
// globalThis.fetch is wrapped (sw.evaluate) before the first "!", and context 'request' events on
// the provider hosts are logged as a second, independent count.
//   Phase A  real fetch, coconutb (cached in the seeded profile): "!", reload, "!", channel page, back, "!"
//   Phase B  fetch stubbed to HTTP 404 (no network), an uncached login: same sequence plus a second tab
//   Phase C  fetch never resolves / fetch throws: commands:get timing and error caching
//   Phase D  action page: render, Refresh, throttle on the second click (stubbed fetch)
//
//   node tools/dev/p2-browser-r1.mjs   (needs npm run build; profile .pw-profiles/p2-critic-r1)

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, waitForServiceWorker } from '../pw/browser.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = join(root, 'tools', 'dev', 'out', 'p2-critic-r1');
mkdirSync(outDir, { recursive: true });
const HOSTS = ['api.nightbot.tv', 'api.streamelements.com', 'fossabot.com', 'moo.bot', 'botrix.live'];
const res = { at: new Date().toISOString(), phases: {} };
let phase = 'setup';
const net = [];

const ctx = await launchChromium({ extensions: [join(root, 'dist', 'chrome')], profileDir: join(root, '.pw-profiles', 'p2-critic-r1') });
ctx.on('request', (r) => {
  let h = '';
  try { h = new URL(r.url()).host; } catch {}
  if (HOSTS.includes(h)) net.push({ phase, m: r.method(), u: r.url(), fromSw: !!r.serviceWorker() });
});
const sw = await waitForServiceWorker(ctx);
const extId = new URL(sw.url()).host;
res.extId = extId;

async function mode(m) {
  await sw.evaluate((m) => {
    const g = globalThis;
    if (!g.__origFetch) { g.__origFetch = g.fetch; g.__log = []; g.__mark = Date.now(); }
    const orig = g.__origFetch;
    g.fetch = (u, i) => {
      g.__log.push({ mode: m, m: (i && i.method) || 'GET', u: String(u && u.url ? u.url : u), t: Date.now() });
      if (m === 'real') return orig(u, i);
      if (m === 'stub404') return Promise.resolve(new Response('{"status":404}', { status: 404, headers: { 'content-type': 'application/json' } }));
      if (m === 'hang') return new Promise(() => {});
      return Promise.reject(new TypeError('Failed to fetch (critic stub)'));
    };
  }, m);
}
const swLog = () => sw.evaluate(() => ({ mark: globalThis.__mark, log: globalThis.__log.slice() }));
const storage = (keys) => sw.evaluate((k) => chrome.storage.local.get(k), keys);

async function bang(page, label) {
  const sel = '[data-a-target="chat-input"]';
  const out = { label, input: false, events: [] };
  try {
    await page.waitForSelector(sel, { timeout: 20000 });
    out.input = true;
    await page.waitForTimeout(2500);
    await page.click(sel, { timeout: 5000 });
    await page.keyboard.type('!');
    await page.waitForTimeout(1500);
    out.typed = await page.evaluate((s) => document.querySelector(s)?.textContent ?? null, sel);
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);
    out.after = await page.evaluate((s) => document.querySelector(s)?.textContent ?? null, sel);
  } catch (e) {
    out.err = String(e.message || e).split('\n')[0];
  }
  out.events = await page.evaluate(() => (window.__tv || []).slice()).catch(() => []);
  return out;
}

async function sequence(login, page2) {
  const steps = [];
  const page = await ctx.newPage();
  await page.addInitScript(() => { document.addEventListener('tvcmd', (e) => { (window.__tv = window.__tv || []).push(e.detail); }); });
  await page.goto('https://www.twitch.tv/popout/' + login + '/chat', { waitUntil: 'domcontentloaded' });
  steps.push(await bang(page, 'popout'));
  if (page2) {
    const p2 = await ctx.newPage();
    await p2.addInitScript(() => { document.addEventListener('tvcmd', (e) => { (window.__tv = window.__tv || []).push(e.detail); }); });
    await Promise.all([p2.goto('https://www.twitch.tv/popout/' + login + '/chat', { waitUntil: 'domcontentloaded' }), page.reload({ waitUntil: 'domcontentloaded' })]);
    steps.push(await bang(p2, 'second-tab'));
    await p2.close();
  } else {
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  steps.push(await bang(page, 'reload'));
  await page.goto('https://www.twitch.tv/' + login, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  steps.push({ label: 'channel-page', events: await page.evaluate(() => (window.__tv || []).slice()).catch(() => []) });
  await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => page.goto('https://www.twitch.tv/popout/' + login + '/chat'));
  steps.push(await bang(page, 'back'));
  await page.close();
  return steps;
}

const send = (page, msg) => page.evaluate((m) => new Promise((r) => {
  const t0 = performance.now();
  chrome.runtime.sendMessage(m, (resp) => r({ ms: Math.round(performance.now() - t0), resp }));
}), msg);
const brief = (r) => r && r.resp && r.resp.ok
  ? { ms: r.ms, ok: true, refreshed: r.resp.refreshed, fromCache: r.resp.data.fromCache, n: r.resp.data.commands.length, providers: r.resp.data.providers.map((p) => p.provider + ':' + p.status + ':' + p.commands.length + ':' + p.requests + (p.error ? ':' + p.error : '')) }
  : r;

try {
  // ---------- Phase A
  phase = 'A';
  const before = await storage('cc:coconutb');
  const e = before['cc:coconutb'];
  res.phases.A = { cachedFetchedAt: e ? new Date(e.fetchedAt).toISOString() : null, cachedProviders: e ? Object.values(e.providers).map((p) => p.provider + ':' + p.status + ':' + p.commands.length) : null };
  await mode('real');
  res.phases.A.steps = await sequence('coconutb', false);
  const la = await swLog();
  res.phases.A.swFetches = la.log.filter((l) => l.mode === 'real').map((l) => l.m + ' ' + l.u);
  res.phases.A.netRequests = net.filter((n) => n.phase === 'A');
  res.phases.A.swMark = la.mark;

  // ---------- Phase B
  phase = 'B';
  const all = await storage(null);
  const cachedKeys = Object.keys(all).filter((k) => k.startsWith('cc:'));
  res.cachedKeys = cachedKeys;
  const loginB = ['lirik', 'nickmercs', 'summit1g', 'dansgaming', 'kaicenat'].find((l) => !cachedKeys.includes('cc:' + l));
  res.phases.B = { login: loginB };
  await mode('stub404');
  const n0 = (await swLog()).log.length;
  res.phases.B.steps = await sequence(loginB, true);
  const lb = await swLog();
  res.phases.B.swFetches = lb.log.slice(n0).map((l) => l.m + ' ' + l.u);
  res.phases.B.swMarkSame = lb.mark === la.mark;
  res.phases.B.netRequests = net.filter((n) => n.phase === 'B');

  // ---------- Phase C
  phase = 'C';
  const ap = await ctx.newPage();
  await ap.goto('chrome-extension://' + extId + '/action/index.html?login=coconutb');
  await ap.waitForTimeout(1500);
  res.phases.D = { coconutbText: await ap.evaluate(() => document.body.innerText) };
  await ap.screenshot({ path: join(root, 'docs', 'critics', 'r1', 'p2-critic-action.png') });
  res.phases.D.tabUrls = await ap.evaluate(() => chrome.tabs.query({}).then((t) => t.map((x) => x.url || '(no url)')));
  const status = await send(ap, { type: 'commands:status', login: 'coconutb' });
  if (status.resp && status.resp.ok) {
    const cmds = status.resp.data.commands;
    const names = cmds.map((c) => c.name);
    const nameSet = new Set(names);
    res.phases.D.merge = {
      n: cmds.length,
      unique: nameSet.size === names.length,
      sorted: names.every((n, i) => i === 0 || names[i - 1] < n),
      aliasIsOtherName: cmds.flatMap((c) => c.aliases.filter((a) => nameSet.has(a)).map((a) => c.name + '->' + a)),
      alsoOn: cmds.filter((c) => c.alsoOn.length).map((c) => c.name + ':' + c.provider + '+' + c.alsoOn.join('/')),
      providers: status.resp.data.providers.map((p) => p.provider + ':' + p.status + ':' + p.commands.length),
    };
  }

  await mode('hang');
  let k = (await swLog()).log.length;
  const h1 = await send(ap, { type: 'commands:get', login: 'zz7tvcmdhang' });
  const h1calls = (await swLog()).log.slice(k).length;
  k = (await swLog()).log.length;
  const h2 = await send(ap, { type: 'commands:get', login: 'zz7tvcmdhang' });
  res.phases.C = { hang1: brief(h1), hang1Calls: h1calls, hang2: brief(h2), hang2Calls: (await swLog()).log.slice(k).length };

  await mode('throw');
  k = (await swLog()).log.length;
  const t1 = await send(ap, { type: 'commands:get', login: 'zz7tvcmdthrow' });
  const t1calls = (await swLog()).log.slice(k).length;
  k = (await swLog()).log.length;
  const t2 = await send(ap, { type: 'commands:get', login: 'zz7tvcmdthrow' });
  Object.assign(res.phases.C, { throw1: brief(t1), throw1Calls: t1calls, throw2: brief(t2), throw2Calls: (await swLog()).log.slice(k).length });
  const stored = await storage(['cc:zz7tvcmdhang', 'cc:zz7tvcmdthrow']);
  res.phases.C.stored = Object.fromEntries(Object.entries(stored).map(([kk, v]) => [kk, Object.values(v.providers).map((p) => p.provider + ':' + p.status + ':' + (p.error || ''))]));

  await mode('stub404');
  k = (await swLog()).log.length;
  const dd = await Promise.all([1, 2, 3].map(() => send(ap, { type: 'commands:get', login: 'zz7tvcmddedupe' })));
  res.phases.C.dedupe = { answers: dd.map(brief), calls: (await swLog()).log.slice(k).length };

  // ---------- Phase D: Refresh button on the phase B login (stubbed fetch, no network)
  phase = 'D';
  const ad = await ctx.newPage();
  await ad.goto('chrome-extension://' + extId + '/action/index.html?login=' + loginB);
  await ad.waitForTimeout(1000);
  res.phases.D.loginBText = await ad.evaluate(() => document.body.innerText);
  k = (await swLog()).log.length;
  await ad.click('#refresh');
  await ad.waitForTimeout(2500);
  res.phases.D.click1 = { text: await ad.evaluate(() => document.body.innerText), calls: (await swLog()).log.slice(k).length, disabled: await ad.evaluate(() => document.getElementById('refresh').disabled) };
  k = (await swLog()).log.length;
  await ad.click('#refresh', { timeout: 5000 }).catch((e) => { res.phases.D.click2err = String(e.message).split('\n')[0]; });
  await ad.waitForTimeout(2000);
  res.phases.D.click2 = { text: await ad.evaluate(() => document.body.innerText), calls: (await swLog()).log.slice(k).length };
  const st = await storage('cc:' + loginB);
  res.phases.D.lastManualRefresh = st['cc:' + loginB]?.lastManualRefresh ?? null;
  res.phases.D.netTotal = net.filter((n) => n.phase !== 'A').length;
} catch (e) {
  res.fatal = String(e.stack || e);
} finally {
  writeFileSync(join(outDir, 'browser.json'), JSON.stringify(res, null, 1));
  await ctx.close();
}
console.log(JSON.stringify({ file: join(outDir, 'browser.json'), fatal: res.fatal || null }));

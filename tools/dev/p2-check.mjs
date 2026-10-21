// Part 2 check (providers, merge, cache, background, action page). Not a test: prints what it saw.
//
//   node tools/dev/p2-check.mjs --offline   fixtures through parseChannel/parseCommands, status
//                                           mapping, merge, cache (counting fake fetch, fake storage)
//   node tools/dev/p2-check.mjs --live      ONE real fetchCommands per recorded (provider, channel)
//                                           pair, except the coconutb pairs, which the --browser run
//                                           covers (the one-request-per-provider-per-channel-per-hour rule)
//   node tools/dev/p2-check.mjs --browser   dist/chrome in Playwright: popout chat page, the real
//                                           message path, the service worker's storage, a screenshot of
//                                           the action page (needs npm run build first)
//
// The repo's TypeScript is bundled with esbuild into .pw-profiles/p2-check/bundle.mjs (gitignored).

import { build } from 'esbuild';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = new Set(process.argv.slice(2));
const UA = 'claude-code-research/1.0';

function fx(rel) {
  return readFileSync(join(root, 'test', 'fixtures', rel), 'utf8').replace(/^[^{\[]+/, '');
}
function line(...parts) {
  console.log(parts.join(' '));
}

async function loadBundle() {
  const contents = [
    "export { ADAPTERS, fetchAll } from './src/providers/index.ts';",
    "export { mergeCommands } from './src/providers/merge.ts';",
    "export * as nightbot from './src/providers/nightbot.ts';",
    "export * as streamelements from './src/providers/streamelements.ts';",
    "export * as fossabot from './src/providers/fossabot.ts';",
    "export * as moobot from './src/providers/moobot.ts';",
    "export * as botrix from './src/providers/botrix.ts';",
    "export { getCommands, refresh, refreshThrottled, peek, clearMemoryCache } from './src/cache/cache.ts';",
  ].join('\n');
  const out = await build({
    stdin: { contents, resolveDir: root, loader: 'ts' },
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'warning',
  });
  const dir = join(root, '.pw-profiles', 'p2-check');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'bundle.mjs');
  writeFileSync(file, out.outputFiles[0].text);
  return import(pathToFileURL(file).href);
}

// ------------------------------------------------------------------ offline

async function offline(b) {
  line('== parse every fixture (raw = entries in the recorded body, parsed = after SPEC 5.1 rules)');
  const rawCount = {
    nightbot: (j) => j.commands?.length ?? 0,
    streamelements: (j) => (Array.isArray(j) ? j.length : 0),
    fossabot: (j) => j.commands?.length ?? 0,
    moobot: (j) => j.list?.length ?? 0,
    botrix: (j) => (Array.isArray(j) ? j.length : 0),
  };
  for (const id of ['nightbot', 'streamelements', 'fossabot', 'moobot', 'botrix']) {
    const dir = join(root, 'test', 'fixtures', id);
    for (const f of readdirSync(dir).sort()) {
      if (f.endsWith('.meta.json')) continue;
      const body = JSON.parse(fx(id + '/' + f));
      if (f.includes('.channel.')) {
        line(id.padEnd(15), f.padEnd(44), 'parseChannel ->', JSON.stringify(b[id].parseChannel(body)));
      } else if (f.includes('commands')) {
        const cmds = b[id].parseCommands(body);
        const names = new Set(cmds.map((c) => c.name));
        const bad = cmds.filter((c) => /\s/.test(c.name) || c.name.startsWith('!') || c.response.length > 300 || /[\r\n]/.test(c.response));
        line(id.padEnd(15), f.padEnd(44), 'raw', String(rawCount[id](body)).padStart(3), 'parsed', String(cmds.length).padStart(3), 'unique', String(names.size).padStart(3), 'violations', bad.length);
      }
    }
  }

  line('== registry');
  for (const a of b.ADAPTERS) line(a.id, a.label, 'enabled', a.enabled, 'corsOpen', a.corsOpen, 'hosts', a.hosts.join(','));
  const hostsJson = JSON.parse(readFileSync(join(root, 'src', 'providers', 'hosts.json'), 'utf8'));
  const derived = b.ADAPTERS.filter((a) => a.enabled && !a.corsOpen).flatMap((a) => a.hosts.map((h) => 'https://' + h + '/*'));
  line('hosts.json', JSON.stringify(hostsJson), 'derived', JSON.stringify(derived), 'equal', JSON.stringify(hostsJson) === JSON.stringify(derived));

  line('== sample userLevel and cooldown');
  const nb = b.nightbot.parseCommands(JSON.parse(fx('nightbot/coconutb.commands.json')));
  const se = b.streamelements.parseCommands(JSON.parse(fx('streamelements/coconutb.commands.json')));
  const fb = b.fossabot.parseCommands(JSON.parse(fx('fossabot/ipqow.commands.json')));
  const tally = (cmds) => JSON.stringify(cmds.reduce((m, c) => ((m[c.userLevel ?? '-'] = (m[c.userLevel ?? '-'] ?? 0) + 1), m), {}));
  line('nightbot coconutb userLevels', tally(nb), 'with cooldown', nb.filter((c) => c.cooldownSec !== undefined).length);
  line('streamelements coconutb userLevels', tally(se), 'with cooldown', se.filter((c) => c.cooldownSec !== undefined).length, 'with aliases', se.filter((c) => c.aliases.length).length);
  line('fossabot ipqow userLevels', tally(fb), 'with aliases', fb.filter((c) => c.aliases.length).length);

  line('== status mapping and timeout (fake fetch, no network)');
  const now = () => 1_000_000;
  const respond = (status, body) => async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  const run = async (id, fetchFn, timeoutMs = 2000) => {
    const a = b.ADAPTERS.find((x) => x.id === id);
    const r = await a.fetchCommands('somelogin', { fetch: fetchFn, now, timeoutMs });
    line(id.padEnd(15), 'status', r.status.padEnd(11), 'requests', r.requests, 'commands', r.commands.length, r.error ? 'error=' + r.error : '');
  };
  await run('nightbot', respond(404, fx('nightbot/_negative-dansgaming.channel.json')));
  await run('streamelements', respond(404, fx('streamelements/_negative-nosuchuser.channel.json')));
  await run('fossabot', respond(404, fx('fossabot/_negative-coconutb.channel.json')));
  await run('moobot', respond(200, fx('moobot/_negative-nosuchuser.channel.json')));
  await run('nightbot', respond(500, '{"message":"boom"}'));
  await run('fossabot', respond(200, 'not json'));
  await run('streamelements', async () => {
    throw new TypeError('Failed to fetch');
  });
  await run('nightbot', (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))), 60);
  await run('botrix', respond(500, 'never called'));
  // the one fixture chain that has an empty command list: StreamElements "twitch"
  await run('streamelements', async (url) => (String(url).includes('/channels/') ? new Response(fx('streamelements/_negative-twitch.channel.json')) : new Response('[]')));

  line('== merge');
  const mk = (provider, name, aliases = []) => ({ name, aliases, response: '', provider, alsoOn: [] });
  const res = (provider, commands) => ({ provider, status: 'ok', commands, fetchedAt: 1, requests: 2 });
  const merged = b.mergeCommands([
    res('nightbot', [mk('nightbot', 'zeta', ['z']), mk('nightbot', 'discord', ['dc'])]),
    res('streamelements', [mk('streamelements', 'discord', ['dc', 'zeta', 'disc']), mk('streamelements', 'alpha', ['dc'])]),
    res('fossabot', [mk('fossabot', 'discord', ['x']), mk('fossabot', 'beta')]),
  ]);
  line(JSON.stringify(merged.map((c) => ({ n: c.name, p: c.provider, also: c.alsoOn, al: c.aliases }))));
  const real = b.mergeCommands([{ provider: 'nightbot', status: 'ok', commands: nb, fetchedAt: 1, requests: 2 }, { provider: 'streamelements', status: 'ok', commands: se, fetchedAt: 1, requests: 2 }]);
  const sorted = real.every((c, i) => i === 0 || real[i - 1].name < c.name);
  line('merge nightbot(', nb.length, ') + streamelements(', se.length, ') ->', real.length, 'sorted unique', sorted, 'alsoOn nightbot+SE', real.filter((c) => c.alsoOn.length).length);

  await cacheChecks(b);
}

function fakeStorage() {
  const store = new Map();
  return {
    store,
    area: {
      get: async (k) => {
        if (k === null) return Object.fromEntries(store);
        const out = {};
        for (const key of Array.isArray(k) ? k : [k]) if (store.has(key)) out[key] = structuredClone(store.get(key));
        return out;
      },
      set: async (items) => {
        for (const [k, v] of Object.entries(items)) store.set(k, structuredClone(v));
      },
      remove: async (k) => {
        for (const key of Array.isArray(k) ? k : [k]) store.delete(key);
      },
    },
  };
}

async function cacheChecks(b) {
  line('== cache (counting fake fetch serving the coconutb fixtures, fake storage.local, injected clock)');
  const counter = { n: 0, byHost: {} };
  const reply = (text, status = 200) => new Response(text, { status });
  const fakeFetch = async (url) => {
    const u = new URL(url);
    counter.n += 1;
    counter.byHost[u.host] = (counter.byHost[u.host] ?? 0) + 1;
    if (u.host === 'api.nightbot.tv') return reply(fx(u.pathname.startsWith('/1/channels/twitch/') ? 'nightbot/coconutb.channel.json' : 'nightbot/coconutb.commands.json'));
    if (u.host === 'api.streamelements.com') return reply(fx(u.pathname.startsWith('/kappa/v2/channels/') ? 'streamelements/coconutb.channel.json' : 'streamelements/coconutb.commands.json'));
    if (u.host === 'fossabot.com') return reply(fx('fossabot/_negative-coconutb.channel.json'), 404);
    if (u.host === 'moo.bot') return reply(fx('moobot/_negative-nosuchuser.channel.json'));
    return reply('{}', 500);
  };
  let clock = 5_000_000;
  const ctx = { fetch: fakeFetch, now: () => clock, timeoutMs: 2000 };
  const fs = fakeStorage();
  globalThis.browser = { storage: { local: fs.area } };
  b.clearMemoryCache();

  const a = await b.getCommands('Coconutb', ctx);
  const first = counter.n;
  line('first getCommands: fetches', first, 'commands', a.commands.length, 'fromCache', a.fromCache, 'providers', a.providers.map((p) => p.provider + ':' + p.status + ':' + p.commands.length + ':req' + p.requests).join(' '));
  const c2 = await b.getCommands('coconutb', ctx);
  line('second getCommands (same hour): extra fetches', counter.n - first, 'fromCache', c2.fromCache, 'commands', c2.commands.length);
  b.clearMemoryCache();
  const c3 = await b.getCommands('coconutb', ctx);
  line('after memory cleared (storage.local only): extra fetches', counter.n - first, 'fromCache', c3.fromCache, 'stored key', JSON.stringify([...fs.store.keys()]), 'entry.v', fs.store.get('cc:coconutb').v);

  const before = counter.n;
  const [p, q] = await Promise.all([b.getCommands('dedupe', ctx), b.getCommands('dedupe', ctx)]);
  line('two concurrent getCommands, one login: fetches', counter.n - before, '(one cycle = 6) same data', p.fetchedAt === q.fetchedAt);

  clock += 3_599_000;
  const c4 = await b.getCommands('coconutb', ctx);
  line('59m59s later: extra fetches', counter.n - before - 6, 'fromCache', c4.fromCache);
  clock += 2_000;
  const mark = counter.n;
  const c5 = await b.getCommands('coconutb', ctx);
  line('60m01s after the fetch: extra fetches', counter.n - mark, 'fromCache', c5.fromCache);

  const m0 = counter.n;
  const r1 = await b.refreshThrottled('coconutb', ctx);
  clock += 30_000;
  const m1 = counter.n;
  const r2 = await b.refreshThrottled('coconutb', ctx);
  clock += 31_000;
  const m2 = counter.n;
  const r3 = await b.refreshThrottled('coconutb', ctx);
  line('refreshThrottled: first refreshed', r1.refreshed, 'fetches', m1 - m0, '| +30s refreshed', r2.refreshed, 'fetches', m2 - m1, '| +61s refreshed', r3.refreshed, 'fetches', counter.n - m2);
  line('lastManualRefresh persisted', typeof fs.store.get('cc:coconutb').lastManualRefresh);

  const st = await b.peek('never-seen');
  line('peek of an unknown login: providers', st.providers.length, 'fetches', counter.n - m2 - 6);

  for (let i = 0; i < 52; i++) {
    clock += 1000;
    await b.getCommands('u' + i, ctx);
  }
  const keys = [...fs.store.keys()];
  const oldest = await b.peek('u0');
  const newest = await b.peek('u51');
  line('52 more logins: stored channels', keys.length, '(cap 50) oldest evicted', oldest.providers.length === 0, 'newest kept', newest.providers.length > 0);
  delete globalThis.browser;
}

// ------------------------------------------------------------------ live

async function live(b) {
  line('== live: one fetchCommands per recorded pair (coconutb pairs come from --browser)');
  const pairs = [
    ['nightbot', 'nickmercs', 102],
    ['nightbot', 'lirik', 1],
    ['streamelements', 'kaicenat', 14],
    ['streamelements', 'ludwig', 6],
    ['fossabot', 'twitchdev', 32],
    ['fossabot', 'kaajak1', 72],
    ['fossabot', 'ipqow', 51],
    ['moobot', 'pokimane', 1],
  ];
  const realFetch = (url, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set('user-agent', UA);
    return fetch(url, { ...init, headers });
  };
  const ctx = { fetch: realFetch, now: () => Date.now(), timeoutMs: 2000 };
  for (const [id, login, expected] of pairs) {
    const adapter = b.ADAPTERS.find((a) => a.id === id);
    const t = Date.now();
    const r = await adapter.fetchCommands(login, ctx);
    line(id.padEnd(15), login.padEnd(10), 'status', r.status.padEnd(6), 'count', String(r.commands.length).padStart(3), 'docs', String(expected).padStart(3), 'requests', r.requests, 'ms', Date.now() - t, r.error ? 'error=' + r.error : '');
  }
}

// ------------------------------------------------------------------ browser

async function browser() {
  const { launchChromium, waitForServiceWorker } = await import(pathToFileURL(join(root, 'tools', 'pw', 'browser.mjs')).href);
  const hosts = new Set(['api.nightbot.tv', 'api.streamelements.com', 'fossabot.com', 'moo.bot', 'botrix.live']);
  const seen = [];
  const ctx = await launchChromium({ extensions: [join(root, 'dist', 'chrome')], profileDir: join(root, '.pw-profiles', 'p2-check') });
  try {
    ctx.on('request', (req) => {
      const u = new URL(req.url());
      if (hosts.has(u.host)) seen.push(req.method() + ' ' + u.host + u.pathname);
    });
    const sw = await waitForServiceWorker(ctx);
    if (!sw) throw new Error('no service worker');
    const extId = new URL(sw.url()).host;
    line('service worker', sw.url());

    const chat = ctx.pages()[0] ?? (await ctx.newPage());
    await chat.goto('https://www.twitch.tv/popout/coconutb/chat', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await chat.waitForTimeout(4000);
    line('popout chat loaded:', chat.url(), '| provider requests so far', seen.length);

    // chrome.runtime.sendMessage from an extension page reaches the background listener; a page
    // evaluate on twitch.tv cannot, and the service worker cannot message itself.
    const ext = await ctx.newPage();
    await ext.goto('chrome-extension://' + extId + '/action/index.html', { waitUntil: 'domcontentloaded' });
    const ask = (type) =>
      ext.evaluate(async (t) => {
        const t0 = performance.now();
        const resp = await chrome.runtime.sendMessage({ type: t, login: 'coconutb' });
        const ms = Math.round(performance.now() - t0);
        if (!resp || !resp.ok) return { ok: false, resp, ms };
        const d = resp.data;
        return { ok: true, ms, refreshed: resp.refreshed, fromCache: d.fromCache, merged: d.commands.length, providers: d.providers.map((p) => p.provider + ':' + p.status + ':' + p.commands.length + ':req' + p.requests + (p.error ? ':' + p.error : '')) };
      }, type);
    const before = seen.length;
    const got1 = await ask('commands:get');
    line('commands:get ->', JSON.stringify(got1), '| provider requests', seen.length - before);
    const mid = seen.length;
    const got2 = await ask('commands:get');
    line('commands:get again ->', JSON.stringify(got2), '| extra provider requests', seen.length - mid);
    const st = await ask('commands:status');
    line('commands:status ->', JSON.stringify(st));
    const bad = await ext.evaluate(() => chrome.runtime.sendMessage({ type: 'commands:status', login: '../x' }));
    line('invalid login ->', JSON.stringify(bad));
    line('requests seen:', JSON.stringify(seen));

    const stored = await sw.evaluate(async () => {
      const all = await chrome.storage.local.get(null);
      return Object.entries(all).filter(([k]) => k.startsWith('cc:')).map(([k, v]) => ({ k, v: v.v, providers: Object.keys(v.providers), fetchedAt: v.fetchedAt }));
    });
    line('service worker storage.local:', JSON.stringify(stored));

    await ext.setViewportSize({ width: 360, height: 420 });
    await ext.goto('chrome-extension://' + extId + '/action/index.html?login=coconutb', { waitUntil: 'domcontentloaded' });
    await ext.waitForSelector('#rows tr', { timeout: 10000 });
    await ext.screenshot({ path: join(root, 'docs', 'critics', 'r1', 'p2-action.png') });
    line('action page screenshot written to docs/critics/r1/p2-action.png; rows', await ext.locator('#rows tr').count(), '| note:', await ext.locator('#note').innerText());
  } finally {
    await ctx.close();
  }
}

const b = await loadBundle();
if (args.has('--offline')) await offline(b);
if (args.has('--live')) await live(b);
if (args.has('--browser')) await browser();
if (!args.has('--offline') && !args.has('--live') && !args.has('--browser')) line('pass --offline, --live and/or --browser');

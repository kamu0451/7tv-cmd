// Part 2 critic, round 1: ONE live replay of every enabled adapter over the channels PROVIDERS.md
// lists (three per provider plus one negative case), and parseChannel/parseCommands over every
// fixture in test/fixtures/<provider>/. No loops over retries: each (provider, channel) pair is
// fetched exactly once. Prints a JSON report to stdout.
//
//   node tools/dev/p2-replay-r1.mjs            live + fixtures
//   node tools/dev/p2-replay-r1.mjs --offline  fixtures only

import { build } from 'esbuild';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const offlineOnly = process.argv.includes('--offline');
const UA = '7tv-cmd-research/0.1';

const contents = [
  "export { ADAPTERS } from './src/providers/index.ts';",
  "export * as nightbot from './src/providers/nightbot.ts';",
  "export * as streamelements from './src/providers/streamelements.ts';",
  "export * as fossabot from './src/providers/fossabot.ts';",
  "export * as moobot from './src/providers/moobot.ts';",
  "export * as botrix from './src/providers/botrix.ts';",
].join('\n');
const out = await build({ stdin: { contents, resolveDir: root, loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'warning' });
const outDir = join(root, 'tools', 'dev', 'out', 'p2-critic-r1');
mkdirSync(outDir, { recursive: true });
const bundleFile = join(outDir, 'bundle.mjs');
writeFileSync(bundleFile, out.outputFiles[0].text);
const b = await import(pathToFileURL(bundleFile).href);

// Documented expectations (PROVIDERS.md channel tables and negative cases).
const PLAN = {
  nightbot: [['coconutb', 'ok', 75], ['nickmercs', 'ok', 102], ['lirik', 'ok', 1], ['dansgaming', 'empty', 0]],
  streamelements: [['coconutb', 'ok', 160], ['kaicenat', 'ok', 14], ['ludwig', 'ok', 6], ['twitch', 'empty', 0]],
  fossabot: [['twitchdev', 'ok', 32], ['kaajak1', 'ok', 72], ['ipqow', 'ok', 51], ['coconutb', 'empty', 0]],
  moobot: [['pokimane', 'ok', 1], ['ninja', 'empty', 0], ['northernlion', 'empty', 0], ['zz7tvcmdnosuchuser', 'empty', 0]],
};
// URL shapes the network captures in docs/providers/<id>.network.json showed (method + pattern).
const ALLOWED = {
  nightbot: [['GET', /^https:\/\/api\.nightbot\.tv\/1\/channels\/twitch\/[^/?]+$/], ['GET', /^https:\/\/api\.nightbot\.tv\/1\/commands$/]],
  streamelements: [['GET', /^https:\/\/api\.streamelements\.com\/kappa\/v2\/channels\/[^/?]+$/], ['GET', /^https:\/\/api\.streamelements\.com\/kappa\/v2\/bot\/commands\/[^/?]+$/]],
  fossabot: [['GET', /^https:\/\/fossabot\.com\/api\/v2\/cached\/channels\/by-slug\/[^/?]+$/], ['GET', /^https:\/\/fossabot\.com\/api\/v2\/cached\/channels\/[^/?]+\/commands$/]],
  moobot: [['POST', /^https:\/\/moo\.bot\/a\/1\/channel\/meta$/], ['POST', /^https:\/\/moo\.bot\/a\/1\/channel\/public\/commands\/list$/]],
};

function ruleViolations(cmds) {
  const v = [];
  for (const c of cmds) {
    if (/[!A-Z\s]/.test(c.name) || c.name === '') v.push('name:' + c.name);
    if (c.aliases.includes(c.name)) v.push('alias=name:' + c.name);
    for (const a of c.aliases) if (/[!A-Z\s]/.test(a)) v.push('alias:' + a);
    if (c.response.length > 300) v.push('resp>300:' + c.name);
    if (/[\r\n]/.test(c.response)) v.push('resp-newline:' + c.name);
  }
  return v;
}

function readFx(p) {
  return JSON.parse(readFileSync(p, 'utf8').replace(/^[^{\[]+/, ''));
}

// Expected kept names per provider rule (SPEC 5.1), from the raw body.
function expectedNames(provider, raw) {
  const norm = (s) => {
    if (typeof s !== 'string') return null;
    let t = s.trim();
    if (t.startsWith('!')) t = t.slice(1);
    return t === '' || /\s/.test(t) ? null : t.toLowerCase();
  };
  let list = [];
  if (provider === 'nightbot') list = (raw.commands || []).map((e) => e.name);
  if (provider === 'streamelements') list = (Array.isArray(raw) ? raw : []).filter((e) => e.enabled === true && e.hidden !== true).map((e) => e.command);
  if (provider === 'fossabot') list = (raw.commands || []).filter((e) => e.enabled_online === true || e.enabled_offline === true).map((e) => e.name);
  if (provider === 'moobot') list = (raw.list || []).map((e) => e.identifier);
  const names = list.map(norm).filter((n) => n !== null);
  const rawLen = provider === 'streamelements' ? (Array.isArray(raw) ? raw.length : 0) : (raw.commands || raw.list || []).length;
  return { names, rawLen, droppedByWhitespace: list.length - names.length };
}

const report = { at: new Date().toISOString(), fixtures: [], live: [] };

for (const provider of ['nightbot', 'streamelements', 'fossabot', 'moobot', 'botrix']) {
  const dir = join(root, 'test', 'fixtures', provider);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json') && !x.endsWith('.meta.json'))) {
    const raw = readFx(join(dir, f));
    const meta = readFx(join(dir, f.replace(/\.json$/, '.meta.json')));
    const row = { provider, file: f, status: meta.status, fetchedAt: meta.fetchedAt };
    if (f.includes('.channel.')) {
      row.parseChannel = b[provider].parseChannel(raw);
    } else {
      const parsed = b[provider].parseCommands(raw);
      row.parsed = parsed.length;
      if (provider !== 'botrix' && !f.includes('commands-default')) {
        const exp = expectedNames(provider, raw);
        row.raw = exp.rawLen;
        row.expected = exp.names.length;
        row.droppedByWhitespace = exp.droppedByWhitespace;
        const got = new Set(parsed.map((c) => c.name));
        row.droppedEnabled = exp.names.filter((n) => !got.has(n));
        const want = new Set(exp.names);
        row.keptDisabled = parsed.filter((c) => !want.has(c.name)).map((c) => c.name);
      }
      row.violations = ruleViolations(parsed);
    }
    report.fixtures.push(row);
  }
}

if (!offlineOnly) {
  for (const a of b.ADAPTERS) {
    const plan = PLAN[a.id];
    if (!a.enabled) {
      const log = [];
      const r = await a.fetchCommands('coconutb', { fetch: (u) => { log.push(String(u)); throw new Error('no fetch expected'); }, now: Date.now, timeoutMs: 2000 });
      report.live.push({ provider: a.id, login: 'coconutb', status: r.status, requests: r.requests, fetchLog: log });
      continue;
    }
    if (!plan) { report.live.push({ provider: a.id, error: 'enabled adapter with no documented plan' }); continue; }
    for (const [login, expStatus, expCount] of plan) {
      const log = [];
      const ctx = {
        fetch: async (url, init = {}) => {
          const headers = { ...(init.headers || {}), 'User-Agent': UA };
          const t0 = Date.now();
          const res = await fetch(url, { ...init, headers });
          log.push({ method: init.method || 'GET', url: String(url), status: res.status, ms: Date.now() - t0, body: typeof init.body === 'string' ? init.body : undefined });
          return res;
        },
        now: Date.now,
        timeoutMs: 10000, // generous, so a slow hop is measured instead of losing the one replay; elapsed is compared to 2000 below
      };
      const t0 = Date.now();
      const r = await a.fetchCommands(login, ctx);
      const elapsed = Date.now() - t0;
      const offShape = log.filter((l) => !ALLOWED[a.id].some(([m, re]) => m === l.method && re.test(l.url))).map((l) => l.method + ' ' + l.url);
      report.live.push({
        provider: a.id, login, expStatus, expCount, status: r.status, count: r.commands.length, requests: r.requests,
        error: r.error, elapsedMs: elapsed, offShape, fetchLog: log, violations: ruleViolations(r.commands),
        sample: r.commands.slice(0, 2).map((c) => c.name),
      });
    }
  }
}

const file = join(outDir, offlineOnly ? 'offline.json' : 'replay.json');
writeFileSync(file, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ file, fixtures: report.fixtures.length, live: report.live.length }));

// fetchCommands of every adapter with an injected fetch that serves the recorded fixtures, the
// registry, hosts.json, fetchAll and the disabled botrix adapter. No network, no real timers.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { botrix } from '../../src/providers/botrix';
import { fossabot } from '../../src/providers/fossabot';
import { ADAPTERS, fetchAll } from '../../src/providers/index';
import { moobot } from '../../src/providers/moobot';
import { nightbot } from '../../src/providers/nightbot';
import { streamelements } from '../../src/providers/streamelements';
import type { ProviderAdapter } from '../../src/providers/types';
import { createFetch, FIXED_NOW, flush, fx, makeCtx, routes, type Reply } from '../helpers/net';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

interface Spec {
  name: string;
  adapter: ProviderAdapter;
  login: string;
  lookupKey: string;
  commandsKey: string;
  lookupOk: Reply;
  commandsOk: Reply;
  count: number;
  notFound: Reply;       // the recorded "unknown login" reply
  noChannel: Reply;      // a 200 lookup body that names no channel
  emptyCommands: Reply;  // a commands body with zero enabled commands
  badShape: Reply;       // a 200 commands body without the list
}

const SPECS: Spec[] = [
  {
    name: 'nightbot',
    adapter: nightbot,
    login: 'coconutb',
    lookupKey: 'GET https://api.nightbot.tv/1/channels/twitch/coconutb',
    commandsKey: 'GET https://api.nightbot.tv/1/commands',
    lookupOk: fx('nightbot', 'coconutb.channel.json'),
    commandsOk: fx('nightbot', 'coconutb.commands.json'),
    count: 75,
    notFound: fx('nightbot', '_negative-dansgaming.channel.json', 404),
    noChannel: { status: 200, body: { status: 200 } },
    emptyCommands: { status: 200, body: { _total: 0, commands: [], status: 200 } },
    badShape: { status: 200, body: { status: 200 } },
  },
  {
    name: 'streamelements',
    adapter: streamelements,
    login: 'coconutb',
    lookupKey: 'GET https://api.streamelements.com/kappa/v2/channels/coconutb',
    commandsKey: 'GET https://api.streamelements.com/kappa/v2/bot/commands/5a2483d1eae4510001c047e5',
    lookupOk: fx('streamelements', 'coconutb.channel.json'),
    commandsOk: fx('streamelements', 'coconutb.commands.json'),
    count: 160,
    notFound: fx('streamelements', '_negative-nosuchuser.channel.json', 404),
    noChannel: { status: 200, body: {} },
    emptyCommands: fx('streamelements', '_negative-twitch.commands.json'),
    badShape: { status: 200, body: {} },
  },
  {
    name: 'fossabot',
    adapter: fossabot,
    login: 'twitchdev',
    lookupKey: 'GET https://fossabot.com/api/v2/cached/channels/by-slug/twitchdev',
    commandsKey: 'GET https://fossabot.com/api/v2/cached/channels/28372/commands',
    lookupOk: fx('fossabot', 'twitchdev.channel.json'),
    commandsOk: fx('fossabot', 'twitchdev.commands.json'),
    count: 32,
    notFound: fx('fossabot', '_negative-coconutb.channel.json', 404),
    noChannel: { status: 200, body: {} },
    emptyCommands: { status: 200, body: { roles: [], commands: [] } },
    badShape: { status: 200, body: { roles: [] } },
  },
  {
    name: 'moobot',
    adapter: moobot,
    login: 'pokimane',
    lookupKey: 'POST https://moo.bot/a/1/channel/meta',
    commandsKey: 'POST https://moo.bot/a/1/channel/public/commands/list',
    lookupOk: fx('moobot', 'pokimane.channel.json'),
    commandsOk: fx('moobot', 'pokimane.commands.json'),
    count: 1,
    notFound: { status: 404, body: {} },
    noChannel: fx('moobot', '_negative-nosuchuser.channel.json'),
    emptyCommands: fx('moobot', '_negative-ninja.commands.json'),
    badShape: { status: 200, body: { _total: 3 } },
  },
];

describe.each(SPECS)('$name fetchCommands', (spec) => {
  const net = (lookup: Reply, commands: Reply) => createFetch(routes({ [spec.lookupKey]: lookup, [spec.commandsKey]: commands }));
  const run = (f: { fetch: typeof fetch }, over = {}) => spec.adapter.fetchCommands(spec.login, makeCtx(f, over));

  it('ok: serves the recorded fixtures, two requests in chain order, normalised commands', async () => {
    const f = net(spec.lookupOk, spec.commandsOk);
    const r = await run(f);
    expect(r.provider).toBe(spec.name);
    expect(r.status).toBe('ok');
    expect(r.commands).toHaveLength(spec.count);
    expect(r.requests).toBe(2);
    expect(r.fetchedAt).toBe(FIXED_NOW);
    expect(r).not.toHaveProperty('error');
    expect(f.calls.map((c) => c.method + ' ' + c.url)).toEqual([spec.lookupKey, spec.commandsKey]);
    for (const c of r.commands) expect(c.provider).toBe(spec.name);
  });

  it('sends no credentials, uses one AbortSignal for the whole chain and leaves no timer behind', async () => {
    const f = net(spec.lookupOk, spec.commandsOk);
    await run(f);
    expect(f.calls).toHaveLength(2);
    const signal = f.calls[0].init.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(f.calls[1].init.signal).toBe(signal);
    for (const c of f.calls) {
      expect(c.init.credentials).toBe('omit');
      const names = Object.keys(c.headers).map((h) => h.toLowerCase());
      expect(names).not.toContain('cookie');
      expect(names).not.toContain('authorization');
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it('unknown login (recorded 404): empty after exactly one request', async () => {
    const f = net(spec.notFound, { throws: 'must not be called' });
    const r = await run(f);
    expect(r).toMatchObject({ provider: spec.name, status: 'empty', commands: [], requests: 1 });
    expect(f.calls).toHaveLength(1);
  });

  it('a 404 whose body is not JSON is still empty', async () => {
    const r = await run(net({ status: 404, text: '<html>not found</html>' }, { throws: 'must not be called' }));
    expect(r).toMatchObject({ status: 'empty', requests: 1 });
  });

  it('a 200 lookup that names no channel is empty after one request', async () => {
    const f = net(spec.noChannel, { throws: 'must not be called' });
    const r = await run(f);
    expect(r).toMatchObject({ status: 'empty', commands: [], requests: 1 });
    expect(f.calls).toHaveLength(1);
  });

  it('zero enabled commands: empty after two requests', async () => {
    const r = await run(net(spec.lookupOk, spec.emptyCommands));
    expect(r).toMatchObject({ status: 'empty', commands: [], requests: 2 });
  });

  it('HTTP 500 on the lookup: error "HTTP 500" after one request', async () => {
    const r = await run(net({ status: 500, body: {} }, { throws: 'must not be called' }));
    expect(r).toMatchObject({ status: 'error', error: 'HTTP 500', commands: [], requests: 1 });
  });

  it.each([400, 403, 429, 503])('HTTP %i on the commands call: error, no partial commands, two requests', async (status) => {
    const r = await run(net(spec.lookupOk, { status, body: {} }));
    expect(r).toMatchObject({ status: 'error', error: 'HTTP ' + status, commands: [], requests: 2 });
  });

  it('invalid JSON in a 200 body: error', async () => {
    const r = await run(net(spec.lookupOk, { status: 200, text: '<html>oops' }));
    expect(r).toMatchObject({ status: 'error', error: 'invalid JSON', commands: [], requests: 2 });
  });

  it('a 200 commands body without the list: error "unexpected response shape"', async () => {
    const r = await run(net(spec.lookupOk, spec.badShape));
    expect(r).toMatchObject({ status: 'error', error: 'unexpected response shape', commands: [] });
  });

  it('a network error: status error, one-line message, no stack', async () => {
    const r = await run(createFetch(() => ({ throws: 'connection reset\n    at somewhere (file.js:1:1)' })));
    expect(r.status).toBe('error');
    expect(r.commands).toEqual([]);
    expect(r.requests).toBe(1);
    expect(r.error).toMatch(/^network error: connection reset/);
    expect(r.error).not.toMatch(/[\r\n]/);
  });

  it('timeout: a never-resolving fetch ends as error "timeout" at the deadline and aborts the request', async () => {
    const f = createFetch(() => ({ never: true }));
    const p = run(f);
    let settled = false;
    void p.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(1999);
    await flush();
    expect(settled).toBe(false);
    const signal = f.calls[0].init.signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(settled).toBe(true);
    expect(await p).toMatchObject({ provider: spec.name, status: 'error', error: 'timeout', commands: [], requests: 1, fetchedAt: FIXED_NOW });
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('timeout: a fetch that rejects on abort still reports "timeout", not a network error', async () => {
    const f = createFetch(() => ({ never: true, honourAbort: true }));
    const p = run(f);
    await vi.advanceTimersByTimeAsync(2000);
    await flush();
    expect(await p).toMatchObject({ status: 'error', error: 'timeout', commands: [] });
  });

  it('timeout covers the WHOLE chain: a lookup taking 1500 ms leaves only 500 ms for the commands call', async () => {
    const f = net({ after: 1500, reply: spec.lookupOk }, { never: true });
    const p = run(f);
    let settled = false;
    void p.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(1500);
    await flush();
    expect(f.calls).toHaveLength(2);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(499);
    await flush();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(settled).toBe(true);
    expect(await p).toMatchObject({ status: 'error', error: 'timeout', requests: 2 });
    expect(f.calls[0].init.signal).toBe(f.calls[1].init.signal);
    expect((f.calls[1].init.signal as AbortSignal).aborted).toBe(true);
  });

  it('timeout: a result arriving after the deadline never overwrites it and sends nothing further', async () => {
    const f = net({ after: 2500, reply: spec.lookupOk }, spec.commandsOk);
    const p = run(f);
    await vi.advanceTimersByTimeAsync(2000);
    await flush();
    const r = await p;
    expect(r).toMatchObject({ status: 'error', error: 'timeout', commands: [], requests: 1 });
    await vi.advanceTimersByTimeAsync(2000);
    await flush();
    expect(f.calls).toHaveLength(1);
    expect(r).toMatchObject({ status: 'error', error: 'timeout', commands: [] });
  });

  it('the deadline is ctx.timeoutMs', async () => {
    const f = createFetch(() => ({ never: true }));
    const p = run(f, { timeoutMs: 500 });
    let settled = false;
    void p.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(499);
    await flush();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(await p).toMatchObject({ status: 'error', error: 'timeout' });
  });
});

describe('moobot paging', () => {
  const LIST = 'POST https://moo.bot/a/1/channel/public/commands/list';
  const META = 'POST https://moo.bot/a/1/channel/meta';
  const FORM = 'application/x-www-form-urlencoded; charset=UTF-8';

  // A Moobot server with `total` commands that serves up to `pageSize` per call.
  function server(total: number | null, pageSize = 100, emptyFromPage = Infinity) {
    const offsets: number[] = [];
    const limits: string[] = [];
    const f = createFetch(
      routes({
        [META]: fx('moobot', 'pokimane.channel.json'),
        [LIST]: (call) => {
          const form = new URLSearchParams(call.body);
          const offset = Number(form.get('_offset'));
          limits.push(String(form.get('_limit')));
          offsets.push(offset);
          const remaining = total === null ? pageSize : Math.max(0, total - offset);
          const n = offsets.length > emptyFromPage ? 0 : Math.min(pageSize, remaining);
          const list = Array.from({ length: n }, (_, i) => ({ type: 'custom', identifier: 'c' + (offset + i), response: 'r' }));
          return { status: 200, body: total === null ? { list } : { list, _total: total } };
        },
      }),
    );
    return { f, offsets, limits };
  }

  it('the recorded chain: POST form bodies, _limit=100, channel id from the meta call', async () => {
    const f = createFetch(routes({ [META]: fx('moobot', 'pokimane.channel.json'), [LIST]: fx('moobot', 'pokimane.commands.json') }));
    const r = await moobot.fetchCommands('pokimane', makeCtx(f));
    expect(r).toMatchObject({ status: 'ok', requests: 2 });
    expect(r.commands.map((c) => c.name)).toEqual(['topic']);
    expect(f.calls[0].method).toBe('POST');
    expect(f.calls[0].body).toBe('name=pokimane');
    expect(f.calls[0].headers['Content-Type']).toBe(FORM);
    expect(f.calls[1].method).toBe('POST');
    expect(f.calls[1].body).toBe('_limit=100&_offset=0&_order=identifier&channel=44445592');
    expect(f.calls[1].headers['Content-Type']).toBe(FORM);
    for (const c of f.calls) expect(new URL(c.url).host).toBe('moo.bot');
  });

  it('follows _offset until it reaches _total: 250 commands are 3 pages, 4 requests', async () => {
    const { f, offsets, limits } = server(250);
    const r = await moobot.fetchCommands('pokimane', makeCtx(f));
    expect(r.status).toBe('ok');
    expect(r.commands).toHaveLength(250);
    expect(new Set(r.commands.map((c) => c.name)).size).toBe(250);
    expect(offsets).toEqual([0, 100, 200]);
    expect(limits).toEqual(['100', '100', '100']);
    expect(r.requests).toBe(4);
    expect(f.calls).toHaveLength(4);
  });

  it('an exact multiple of the page size does not fetch an extra page', async () => {
    const { f, offsets } = server(200);
    const r = await moobot.fetchCommands('pokimane', makeCtx(f));
    expect(r.commands).toHaveLength(200);
    expect(offsets).toEqual([0, 100]);
    expect(r.requests).toBe(3);
  });

  it('stops at 5 pages however large _total is', async () => {
    const { f, offsets } = server(10_000);
    const r = await moobot.fetchCommands('pokimane', makeCtx(f));
    expect(r.status).toBe('ok');
    expect(offsets).toEqual([0, 100, 200, 300, 400]);
    expect(r.commands).toHaveLength(500);
    expect(r.requests).toBe(6);
    expect(f.calls).toHaveLength(6);
  });

  it('stops on an empty page even when _total promises more', async () => {
    const { f, offsets } = server(1000, 100, 1);
    const r = await moobot.fetchCommands('pokimane', makeCtx(f));
    expect(offsets).toEqual([0, 100]);
    expect(r.commands).toHaveLength(100);
    expect(r.requests).toBe(3);
  });

  it('stops after one page when the server publishes no _total', async () => {
    const { f, offsets } = server(null);
    const r = await moobot.fetchCommands('pokimane', makeCtx(f));
    expect(offsets).toEqual([0]);
    expect(r.commands).toHaveLength(100);
    expect(r.requests).toBe(2);
  });

  it('an error on a later page makes the whole result an error with no partial commands', async () => {
    let page = 0;
    const f = createFetch(
      routes({
        [META]: fx('moobot', 'pokimane.channel.json'),
        [LIST]: () => {
          page += 1;
          if (page === 2) return { status: 500, body: {} };
          return { status: 200, body: { list: Array.from({ length: 100 }, (_, i) => ({ identifier: 'c' + i, response: '' })), _total: 300 } };
        },
      }),
    );
    const r = await moobot.fetchCommands('pokimane', makeCtx(f));
    expect(r).toMatchObject({ status: 'error', error: 'HTTP 500', commands: [], requests: 3 });
  });

  it('a known channel without commands is empty after two requests', async () => {
    const f = createFetch(routes({ [META]: fx('moobot', 'pokimane.channel.json'), [LIST]: { status: 200, body: { list: [], _total: 0 } } }));
    expect(await moobot.fetchCommands('ninja', makeCtx(f))).toMatchObject({ status: 'empty', commands: [], requests: 2 });
  });
});

describe('botrix is registered but disabled', () => {
  it('resolves unsupported with zero fetch calls, even when fetch would blow up', async () => {
    const f = createFetch(() => ({ throws: 'must not be called' }));
    const r = await botrix.fetchCommands('coconutb', makeCtx(f));
    expect(r).toEqual({ provider: 'botrix', status: 'unsupported', commands: [], fetchedAt: FIXED_NOW, requests: 0 });
    expect(f.calls).toHaveLength(0);
    expect(botrix.enabled).toBe(false);
  });
});

describe('registry (SPEC 5.2)', () => {
  it('lists the adapters in priority order', () => {
    expect(ADAPTERS.map((a) => a.id)).toEqual(['nightbot', 'streamelements', 'fossabot', 'moobot', 'botrix']);
  });

  it('gives every adapter a unique 2-3 character ASCII label and bare host names', () => {
    const labels = ADAPTERS.map((a) => a.label);
    expect(labels).toEqual(['NB', 'SE', 'FB', 'MB', 'BX']);
    expect(new Set(labels).size).toBe(labels.length);
    for (const a of ADAPTERS) {
      expect(a.label).toMatch(/^[A-Z]{2,3}$/);
      expect(a.hosts.length).toBeGreaterThan(0);
      for (const h of a.hosts) expect(h).toMatch(/^[a-z0-9][a-z0-9.-]*$/);
    }
  });

  it('records corsOpen and enabled as the spec says', () => {
    const flags = Object.fromEntries(ADAPTERS.map((a) => [a.id, [a.corsOpen, a.enabled]]));
    expect(flags).toEqual({
      nightbot: [true, true],
      streamelements: [true, true],
      fossabot: [true, true],
      moobot: [false, true],
      botrix: [false, false],
    });
  });

  it('hosts.json equals the host patterns of the enabled adapters that are not CORS-open (SPEC 9)', () => {
    const hosts = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../src/providers/hosts.json', import.meta.url)), 'utf8'));
    const expected = ADAPTERS.filter((a) => a.enabled && !a.corsOpen).flatMap((a) => a.hosts.map((h) => 'https://' + h + '/*'));
    expect(hosts).toEqual(expected);
    expect(hosts).toEqual(['https://moo.bot/*']);
    for (const p of hosts) expect(p).toMatch(/^https:\/\/[a-z0-9.-]+\/\*$/);
  });
});

describe('fetchAll', () => {
  // Every login is unknown: lookups 404, Moobot answers 200 without a channel key.
  const unknownEverywhere = () =>
    createFetch((call) => (new URL(call.url).host === 'moo.bot' ? { status: 200, body: { version: 1 } } : { status: 404, body: { message: 'not found' } }));

  it('runs every adapter once, in registry order, and only fetches declared hosts', async () => {
    const f = unknownEverywhere();
    const out = await fetchAll('ghost', makeCtx(f));
    expect(out.map((r) => r.provider)).toEqual(ADAPTERS.map((a) => a.id));
    expect(out.map((r) => r.status)).toEqual(['empty', 'empty', 'empty', 'empty', 'unsupported']);
    expect(out.map((r) => r.requests)).toEqual([1, 1, 1, 1, 0]);
    expect(f.calls).toHaveLength(4);
    const declared = new Set(ADAPTERS.filter((a) => a.enabled).flatMap((a) => a.hosts));
    for (const c of f.calls) expect(declared.has(new URL(c.url).host)).toBe(true);
    expect(f.calls.some((c) => c.url.includes('botrix'))).toBe(false);
  });

  it('never throws: an adapter that rejects becomes a one-line error result', async () => {
    vi.spyOn(nightbot, 'fetchCommands').mockRejectedValue(new Error('boom\n   at stack line'));
    const out = await fetchAll('ghost', makeCtx(unknownEverywhere()));
    expect(out).toHaveLength(ADAPTERS.length);
    expect(out[0]).toMatchObject({ provider: 'nightbot', status: 'error', error: 'boom at stack line', commands: [], requests: 0 });
    expect(out.slice(1).map((r) => r.status)).toEqual(['empty', 'empty', 'empty', 'unsupported']);
  });
});

// cache/cache.ts (SPEC 5.4, 5.5) with a fake storage.local, fake timers and an injected fetch serving
// the recorded fixtures. Nothing touches the network and no real timer runs.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearMemoryCache,
  getCommands,
  MAX_CHANNELS,
  peek,
  refresh,
  refreshThrottled,
  REFRESH_THROTTLE_MS,
  TTL_MS,
} from '../../src/cache/cache';
import { ADAPTERS } from '../../src/providers/index';
import type { AdapterContext } from '../../src/providers/types';
import { createFetch, flush, fx, routes, type Reply } from '../helpers/net';

const T0 = Date.UTC(2026, 9, 21, 12, 0, 0);
const MIN = 60_000;
// One fetch cycle on the coconutb world below: Nightbot 2 + StreamElements 2 + Fossabot 1 (404) + Moobot 1 (no channel).
const CYCLE = 6;

interface FakeStorage {
  data: Map<string, any>;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

function createStorage(): FakeStorage {
  const data = new Map<string, any>();
  return {
    data,
    get: vi.fn(async (keys: string | string[] | null) => {
      if (keys === null) return Object.fromEntries([...data].map(([k, v]) => [k, structuredClone(v)]));
      const out: Record<string, unknown> = {};
      for (const k of Array.isArray(keys) ? keys : [keys]) if (data.has(k)) out[k] = structuredClone(data.get(k));
      return out;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(items)) data.set(k, structuredClone(v));
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const k of Array.isArray(keys) ? keys : [keys]) data.delete(k);
    }),
  };
}

// Recorded replies for login "coconutb": Nightbot 75 + StreamElements 160 commands, no Fossabot, no Moobot channel.
const NB_CHANNEL = fx('nightbot', 'coconutb.channel.json');
const NB_COMMANDS = fx('nightbot', 'coconutb.commands.json');
const SE_CHANNEL = fx('streamelements', 'coconutb.channel.json');
const SE_COMMANDS = fx('streamelements', 'coconutb.commands.json');
const FB_UNKNOWN = fx('fossabot', '_negative-coconutb.channel.json', 404);
const MB_UNKNOWN = fx('moobot', '_negative-nosuchuser.channel.json');

function coconutbNet(gate?: Promise<void>) {
  const g = (r: Reply): Reply => (gate ? { gated: gate, reply: r } : r);
  return createFetch(
    routes({
      'GET https://api.nightbot.tv/1/channels/twitch/coconutb': g(NB_CHANNEL),
      'GET https://api.nightbot.tv/1/commands': g(NB_COMMANDS),
      'GET https://api.streamelements.com/kappa/v2/channels/coconutb': g(SE_CHANNEL),
      'GET https://api.streamelements.com/kappa/v2/bot/commands/5a2483d1eae4510001c047e5': g(SE_COMMANDS),
      'GET https://fossabot.com/api/v2/cached/channels/by-slug/coconutb': g(FB_UNKNOWN),
      'POST https://moo.bot/a/1/channel/meta': g(MB_UNKNOWN),
    }),
  );
}

// Every login unknown to every provider: 4 requests per cycle, all statuses empty.
function unknownNet() {
  return createFetch((call) => (new URL(call.url).host === 'moo.bot' ? { status: 200, body: { version: 1 } } : { status: 404, body: { message: 'not found' } }));
}

const ctxFor = (f: { fetch: typeof fetch }): AdapterContext => ({ fetch: f.fetch, now: () => Date.now(), timeoutMs: 2000 });

// Records every adapter.fetchCommands call (the automatic fetch path) with the fake clock at call time.
function spyAdapters(): Array<{ id: string; login: string; t: number }> {
  const log: Array<{ id: string; login: string; t: number }> = [];
  for (const a of ADAPTERS) {
    const original = a.fetchCommands.bind(a);
    vi.spyOn(a, 'fetchCommands').mockImplementation((login, ctx) => {
      log.push({ id: a.id, login, t: ctx.now() });
      return original(login, ctx);
    });
  }
  return log;
}

let storage: FakeStorage;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  clearMemoryCache();
  storage = createStorage();
  vi.stubGlobal('browser', { storage: { local: storage } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TTL of one hour', () => {
  it('constants: TTL one hour, throttle 60 s, at most 50 channels', () => {
    expect(TTL_MS).toBe(3_600_000);
    expect(REFRESH_THROTTLE_MS).toBe(60_000);
    expect(MAX_CHANNELS).toBe(50);
  });

  it('the first call fetches every adapter once and stores the entry under cc:<login>', async () => {
    const net = coconutbNet();
    const r = await getCommands('coconutb', ctxFor(net));
    expect(r.login).toBe('coconutb');
    expect(r.fromCache).toBe(false);
    expect(r.commands).toHaveLength(75 + 160 - 8);
    expect(r.providers.map((p) => [p.provider, p.status, p.requests])).toEqual([
      ['nightbot', 'ok', 2],
      ['streamelements', 'ok', 2],
      ['fossabot', 'empty', 1],
      ['moobot', 'empty', 1],
      ['botrix', 'unsupported', 0],
    ]);
    expect(r.fetchedAt).toBe(T0);
    expect(net.calls).toHaveLength(CYCLE);
    const entry = storage.data.get('cc:coconutb');
    expect(entry.v).toBe(1);
    expect(entry.fetchedAt).toBe(T0);
    expect(Object.keys(entry.providers)).toEqual(ADAPTERS.map((a) => a.id));
  });

  it('a second call within 59 minutes performs zero fetches', async () => {
    const net = coconutbNet();
    const first = await getCommands('coconutb', ctxFor(net));
    vi.setSystemTime(T0 + 59 * MIN);
    const second = await getCommands('coconutb', ctxFor(net));
    expect(net.calls).toHaveLength(CYCLE);
    expect(second.fromCache).toBe(true);
    expect(second.commands).toEqual(first.commands);
    vi.setSystemTime(T0 + TTL_MS - 1);
    await getCommands('coconutb', ctxFor(net));
    expect(net.calls).toHaveLength(CYCLE);
  });

  it('a call at 61 minutes performs exactly one more fetch cycle', async () => {
    const net = coconutbNet();
    const log = spyAdapters();
    await getCommands('coconutb', ctxFor(net));
    vi.setSystemTime(T0 + 61 * MIN);
    const r = await getCommands('coconutb', ctxFor(net));
    expect(r.fromCache).toBe(false);
    expect(net.calls).toHaveLength(2 * CYCLE);
    expect(log.filter((e) => e.id === 'nightbot')).toHaveLength(2);
    expect(storage.data.get('cc:coconutb').fetchedAt).toBe(T0 + 61 * MIN);
  });

  it('the entry is stale exactly at the TTL', async () => {
    const net = coconutbNet();
    await getCommands('coconutb', ctxFor(net));
    vi.setSystemTime(T0 + TTL_MS);
    await getCommands('coconutb', ctxFor(net));
    expect(net.calls).toHaveLength(2 * CYCLE);
  });

  it('serves from storage.local when the session memory is gone (background worker unloaded)', async () => {
    const net = coconutbNet();
    await getCommands('coconutb', ctxFor(net));
    clearMemoryCache();
    vi.setSystemTime(T0 + 10 * MIN);
    const r = await getCommands('coconutb', ctxFor(net));
    expect(r.fromCache).toBe(true);
    expect(r.commands).toHaveLength(227);
    expect(net.calls).toHaveLength(CYCLE);
  });

  it('lowercases the login for the key and the result', async () => {
    const net = coconutbNet();
    const r = await getCommands('CoconutB', ctxFor(net));
    expect(r.login).toBe('coconutb');
    expect(storage.data.has('cc:coconutb')).toBe(true);
    expect((await getCommands('COCONUTB', ctxFor(net))).fromCache).toBe(true);
    expect(net.calls).toHaveLength(CYCLE);
  });

  it('works when storage.local fails: the data still arrives and a [7tv-cmd] warning is logged', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    storage.set.mockRejectedValue(new Error('quota'));
    const r = await getCommands('coconutb', ctxFor(coconutbNet()));
    expect(r.commands).toHaveLength(227);
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).toMatch(/^\[7tv-cmd\] /);
  });
});

describe('negative caching', () => {
  it('caches an all-empty result for the hour', async () => {
    const net = unknownNet();
    const r = await getCommands('ghost', ctxFor(net));
    expect(r.commands).toEqual([]);
    expect(r.providers.map((p) => p.status)).toEqual(['empty', 'empty', 'empty', 'empty', 'unsupported']);
    expect(net.calls).toHaveLength(4);
    vi.setSystemTime(T0 + 30 * MIN);
    const again = await getCommands('ghost', ctxFor(net));
    expect(again.fromCache).toBe(true);
    expect(net.calls).toHaveLength(4);
    vi.setSystemTime(T0 + 61 * MIN);
    await getCommands('ghost', ctxFor(net));
    expect(net.calls).toHaveLength(8);
  });

  it('caches network errors for the hour', async () => {
    const net = createFetch(() => ({ throws: 'offline' }));
    const r = await getCommands('flaky', ctxFor(net));
    expect(r.providers.map((p) => p.status)).toEqual(['error', 'error', 'error', 'error', 'unsupported']);
    expect(net.calls).toHaveLength(4);
    vi.setSystemTime(T0 + 30 * MIN);
    expect((await getCommands('flaky', ctxFor(net))).fromCache).toBe(true);
    expect(net.calls).toHaveLength(4);
    vi.setSystemTime(T0 + 61 * MIN);
    await getCommands('flaky', ctxFor(net));
    expect(net.calls).toHaveLength(8);
  });

  it('caches a timeout error for the hour; no later request is made', async () => {
    const net = createFetch(() => ({ never: true }));
    const p = getCommands('slow', ctxFor(net));
    await flush();
    await vi.advanceTimersByTimeAsync(2000);
    await flush();
    const r = await p;
    expect(r.providers.filter((x) => x.status === 'error').map((x) => x.error)).toEqual(['timeout', 'timeout', 'timeout', 'timeout']);
    expect(net.calls).toHaveLength(4);
    vi.setSystemTime(T0 + 2000 + 10 * MIN);
    const again = await getCommands('slow', ctxFor(net));
    expect(again.fromCache).toBe(true);
    expect(net.calls).toHaveLength(4);
  });

  it('one failing provider does not hide the others', async () => {
    const net = createFetch(
      routes({
        'GET https://api.nightbot.tv/1/channels/twitch/coconutb': NB_CHANNEL,
        'GET https://api.nightbot.tv/1/commands': NB_COMMANDS,
        'GET https://api.streamelements.com/kappa/v2/channels/coconutb': { status: 500, body: {} },
        'GET https://fossabot.com/api/v2/cached/channels/by-slug/coconutb': FB_UNKNOWN,
        'POST https://moo.bot/a/1/channel/meta': MB_UNKNOWN,
      }),
    );
    const r = await getCommands('coconutb', ctxFor(net));
    expect(r.providers.map((p) => p.status)).toEqual(['ok', 'error', 'empty', 'empty', 'unsupported']);
    expect(r.commands).toHaveLength(75);
  });
});

describe('in-flight dedupe', () => {
  it('concurrent gets for one login share one fetch cycle', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const net = coconutbNet(gate);
    const log = spyAdapters();
    const pending = [getCommands('coconutb', ctxFor(net)), getCommands('coconutb', ctxFor(net)), getCommands('coconutb', ctxFor(net))];
    await flush();
    expect(net.calls).toHaveLength(4); // the four lookups, all waiting on the gate
    release();
    const results = await Promise.all(pending);
    expect(net.calls).toHaveLength(CYCLE);
    for (const id of ADAPTERS.map((a) => a.id)) expect(log.filter((e) => e.id === id)).toHaveLength(1);
    for (const r of results) expect(r.commands).toHaveLength(227);
    const after = await getCommands('coconutb', ctxFor(net));
    expect(after.fromCache).toBe(true);
    expect(net.calls).toHaveLength(CYCLE);
  });

  it('different logins are not merged into one fetch', async () => {
    const net = unknownNet();
    const log = spyAdapters();
    await Promise.all([getCommands('aaa', ctxFor(net)), getCommands('bbb', ctxFor(net))]);
    expect(log.filter((e) => e.id === 'nightbot').map((e) => e.login).sort()).toEqual(['aaa', 'bbb']);
    expect(net.calls).toHaveLength(8);
  });
});

describe('manual refresh throttle (60 s)', () => {
  it('refreshes once, then answers from the cache with refreshed:false until 60 s have passed', async () => {
    const net = coconutbNet();
    const first = await refreshThrottled('coconutb', ctxFor(net));
    expect(first.refreshed).toBe(true);
    expect(net.calls).toHaveLength(CYCLE);
    expect(storage.data.get('cc:coconutb').lastManualRefresh).toBe(T0);

    vi.setSystemTime(T0 + REFRESH_THROTTLE_MS - 1);
    const second = await refreshThrottled('coconutb', ctxFor(net));
    expect(second.refreshed).toBe(false);
    expect(second.data.fromCache).toBe(true);
    expect(second.data.commands).toHaveLength(227);
    expect(net.calls).toHaveLength(CYCLE);

    vi.setSystemTime(T0 + REFRESH_THROTTLE_MS);
    const third = await refreshThrottled('coconutb', ctxFor(net));
    expect(third.refreshed).toBe(true);
    expect(net.calls).toHaveLength(2 * CYCLE);
  });

  it('the throttle survives the memory cache being dropped (it lives in storage.local)', async () => {
    const net = coconutbNet();
    await refreshThrottled('coconutb', ctxFor(net));
    clearMemoryCache();
    vi.setSystemTime(T0 + 30_000);
    const r = await refreshThrottled('coconutb', ctxFor(net));
    expect(r.refreshed).toBe(false);
    expect(net.calls).toHaveLength(CYCLE);
  });

  it('is per login', async () => {
    const net = unknownNet();
    await refreshThrottled('aaa', ctxFor(net));
    expect((await refreshThrottled('bbb', ctxFor(net))).refreshed).toBe(true);
    expect((await refreshThrottled('aaa', ctxFor(net))).refreshed).toBe(false);
  });

  it('refresh bypasses the hour, and an automatic fetch afterwards finds the entry fresh', async () => {
    const net = coconutbNet();
    await getCommands('coconutb', ctxFor(net));
    vi.setSystemTime(T0 + 5 * MIN);
    const r = await refresh('coconutb', ctxFor(net));
    expect(r.fromCache).toBe(false);
    expect(net.calls).toHaveLength(2 * CYCLE);
    vi.setSystemTime(T0 + 6 * MIN);
    expect((await getCommands('coconutb', ctxFor(net))).fromCache).toBe(true);
    expect(net.calls).toHaveLength(2 * CYCLE);
  });

  it('an automatic refetch keeps the stored lastManualRefresh', async () => {
    const net = coconutbNet();
    await refreshThrottled('coconutb', ctxFor(net));
    vi.setSystemTime(T0 + 61 * MIN);
    await getCommands('coconutb', ctxFor(net));
    const entry = storage.data.get('cc:coconutb');
    expect(entry.fetchedAt).toBe(T0 + 61 * MIN);
    expect(entry.lastManualRefresh).toBe(T0);
  });
});

describe('peek', () => {
  it('returns an empty value for an unknown login and never fetches', async () => {
    const net = coconutbNet();
    const r = await peek('Coconutb');
    expect(r).toEqual({ login: 'coconutb', commands: [], providers: [], fetchedAt: 0, fromCache: false });
    expect(net.calls).toHaveLength(0);
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('returns the cached value, even when stale, with fromCache true', async () => {
    const net = coconutbNet();
    await getCommands('coconutb', ctxFor(net));
    vi.setSystemTime(T0 + 3 * 60 * MIN);
    const r = await peek('coconutb');
    expect(r.fromCache).toBe(true);
    expect(r.commands).toHaveLength(227);
    expect(r.providers).toHaveLength(ADAPTERS.length);
    expect(r.fetchedAt).toBe(T0);
    expect(net.calls).toHaveLength(CYCLE);
  });
});

describe('at most 50 channels', () => {
  it('evicts the channel with the oldest fetchedAt when the 51st arrives, and leaves other keys alone', async () => {
    storage.data.set('settings', { keep: true });
    const net = unknownNet();
    const ccKeys = () => [...storage.data.keys()].filter((k) => k.startsWith('cc:'));
    for (let i = 0; i < 50; i++) {
      vi.setSystemTime(T0 + i * 1000);
      await getCommands('c' + String(i).padStart(2, '0'), ctxFor(net));
      expect(ccKeys()).toHaveLength(i + 1);
    }
    expect(ccKeys()).toContain('cc:c00');

    vi.setSystemTime(T0 + 50 * 1000);
    await getCommands('c50', ctxFor(net));
    expect(ccKeys()).toHaveLength(50);
    expect(ccKeys()).not.toContain('cc:c00');
    expect(ccKeys()).toContain('cc:c01');
    expect(ccKeys()).toContain('cc:c50');

    vi.setSystemTime(T0 + 51 * 1000);
    await getCommands('c51', ctxFor(net));
    expect(ccKeys()).toHaveLength(50);
    expect(ccKeys()).not.toContain('cc:c01');
    expect(storage.data.get('settings')).toEqual({ keep: true });

    const gone = await peek('c00');
    expect(gone.providers).toEqual([]);
    expect((await peek('c02')).providers.length).toBeGreaterThan(0);
  });

  it('still evicts when storage.set fails (quota full), so the store can heal, and logs the failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (let i = 0; i < MAX_CHANNELS; i++) {
      storage.data.set('cc:old' + String(i).padStart(2, '0'), { v: 1, fetchedAt: T0 - 10_000 + i, providers: {} });
    }
    storage.set.mockRejectedValue(new Error('QUOTA_BYTES quota exceeded'));
    await getCommands('newcomer', ctxFor(unknownNet()));
    expect(storage.remove).toHaveBeenCalledWith(['cc:old00']);
    expect(storage.data.has('cc:old00')).toBe(false);
    expect(storage.data.has('cc:old01')).toBe(true);
    expect(warn.mock.calls.some((c) => /cache write failed: QUOTA_BYTES/.test(String(c[0])))).toBe(true);
  });
});

describe('request budget (SPEC 1.7, 5.4)', () => {
  it('for one login, over any 60 minute window, each adapter fetchCommands is called at most once by the automatic path', async () => {
    const log = spyAdapters();
    const nets: Record<string, ReturnType<typeof createFetch>> = {
      coconutb: coconutbNet(),
      ghost: unknownNet(),
      flaky: createFetch(() => ({ throws: 'offline' })),
    };
    const STEP = 20_000;
    const SPAN = 3 * 60 * MIN + 5 * MIN;
    let tick = 0;
    for (let t = 0; t <= SPAN; t += STEP, tick++) {
      vi.setSystemTime(T0 + t);
      if (tick % 7 === 3) clearMemoryCache(); // the background worker unloading mid-session
      await Promise.all(
        Object.keys(nets).flatMap((login) => [1, 2, 3].map(() => getCommands(login, ctxFor(nets[login])))),
      );
    }

    for (const login of Object.keys(nets)) {
      for (const a of ADAPTERS) {
        const times = log.filter((e) => e.id === a.id && e.login === login).map((e) => e.t).sort((x, y) => x - y);
        // the sliding-window rule: no call has another call within the next 60 minutes
        for (let i = 0; i < times.length; i++) {
          const inWindow = times.filter((t) => t >= times[i] && t < times[i] + TTL_MS);
          expect(inWindow, a.id + ' ' + login + ' window at ' + (times[i] - T0)).toHaveLength(1);
        }
        // 3 h 5 min of polling every 20 s means cycles at 0, 60, 120 and 180 minutes and nothing else
        expect(times.map((t) => (t - T0) / MIN), a.id + ' ' + login).toEqual([0, 60, 120, 180]);
      }
    }
    expect(nets.coconutb.calls).toHaveLength(4 * CYCLE);
    expect(nets.ghost.calls).toHaveLength(4 * 4);
    expect(nets.flaky.calls).toHaveLength(4 * 4);
  });
});

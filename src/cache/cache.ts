// Command cache (docs/SPEC.md section 5.4).
//   storage.local key "cc:<login>" -> { v: 1, fetchedAt, lastManualRefresh?, providers: { <id>: ProviderResult } }
//   TTL one hour for EVERY status (negative caching: empty and error results are cached too),
//   one fetchAll per stale or missing entry, in-flight dedupe per login, a session memory map in
//   front of storage.local, at most 50 channels (the oldest fetchedAt is evicted).
// Firefox exposes the promise based `browser.storage`, Chrome MV3 a promise returning
// `chrome.storage`; whichever global exists is used, looked up on every call. With neither (a node
// test) the cache is memory only.

import { fetchAll, ADAPTERS } from '../providers/index';
import { mergeCommands } from '../providers/merge';
import type { AdapterContext } from '../providers/types';
import { warn } from '../shared/log';
import type { ChannelCommands, ProviderId, ProviderResult } from '../shared/types';

export const TTL_MS = 3_600_000;
export const MAX_CHANNELS = 50;
export const REFRESH_THROTTLE_MS = 60_000;
const PREFIX = 'cc:';

interface Entry {
  v: 1;
  fetchedAt: number; // when the fetch cycle finished; drives the TTL and the eviction order
  lastManualRefresh?: number;
  providers: Record<ProviderId, ProviderResult>;
}

interface StorageAreaLike {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

interface StorageGlobals {
  browser?: { storage?: { local?: StorageAreaLike } };
  chrome?: { storage?: { local?: StorageAreaLike } };
}

function area(): StorageAreaLike | null {
  const g = globalThis as unknown as StorageGlobals;
  return g.browser?.storage?.local ?? g.chrome?.storage?.local ?? null;
}

const memory = new Map<string, Entry>();
const inflight = new Map<string, Promise<{ entry: Entry; fetched: boolean }>>();

// Tests: forget the session memory (storage.local is left alone).
export function clearMemoryCache(): void {
  memory.clear();
}

function parseEntry(raw: unknown): Entry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const e = raw as Partial<Entry>;
  if (e.v !== 1 || typeof e.fetchedAt !== 'number' || typeof e.providers !== 'object' || e.providers === null) {
    return null;
  }
  return e as Entry;
}

function isFresh(entry: Entry, now: number): boolean {
  const age = now - entry.fetchedAt;
  if (age < 0 || age >= TTL_MS) return false;
  return ADAPTERS.every((a) => entry.providers[a.id] !== undefined); // a newly registered adapter makes it stale
}

function toChannel(login: string, entry: Entry, fromCache: boolean): ChannelCommands {
  const providers = ADAPTERS.map((a) => entry.providers[a.id]).filter((p): p is ProviderResult => p !== undefined);
  return {
    login,
    commands: mergeCommands(providers),
    providers,
    fetchedAt: providers.length ? Math.min(...providers.map((p) => p.fetchedAt)) : entry.fetchedAt,
    fromCache,
  };
}

function empty(login: string): ChannelCommands {
  return { login, commands: [], providers: [], fetchedAt: 0, fromCache: false };
}

async function loadEntry(login: string): Promise<Entry | null> {
  const hit = memory.get(login);
  if (hit) return hit;
  const st = area();
  if (!st) return null;
  try {
    const got = await st.get(PREFIX + login);
    const entry = parseEntry(got[PREFIX + login]);
    if (entry) memory.set(login, entry);
    return entry;
  } catch (e) {
    warn('cache read failed: ' + (e instanceof Error ? e.message : String(e)));
    return null;
  }
}

async function enforceCap(st: StorageAreaLike | null): Promise<void> {
  const ages = new Map<string, number>();
  for (const [login, e] of memory) ages.set(PREFIX + login, e.fetchedAt);
  if (st) {
    const all = await st.get(null);
    for (const [k, v] of Object.entries(all)) {
      if (k.startsWith(PREFIX)) ages.set(k, parseEntry(v)?.fetchedAt ?? 0);
    }
  }
  if (ages.size <= MAX_CHANNELS) return;
  const doomed = [...ages.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, ages.size - MAX_CHANNELS)
    .map(([k]) => k);
  for (const k of doomed) memory.delete(k.slice(PREFIX.length));
  if (st) await st.remove(doomed);
}

async function persist(login: string, entry: Entry): Promise<void> {
  const st = area();
  try {
    if (st) await st.set({ [PREFIX + login]: entry });
  } catch (e) {
    warn('cache write failed: ' + (e instanceof Error ? e.message : String(e)));
  }
  // Evict even after a failed write (storage quota full), so the store can heal.
  try {
    await enforceCap(st);
  } catch (e) {
    warn('cache eviction failed: ' + (e instanceof Error ? e.message : String(e)));
  }
}

// One shared fetch cycle per login. A non-manual start re-checks freshness after the storage read,
// so a get that raced a finished fetch does not start a second one.
function startFetch(login: string, ctx: AdapterContext, manual: boolean): Promise<{ entry: Entry; fetched: boolean }> {
  const running = inflight.get(login);
  if (running) return running;
  const p = (async () => {
    const prev = await loadEntry(login);
    if (!manual && prev && isFresh(prev, ctx.now())) return { entry: prev, fetched: false };
    const providers = await fetchAll(login, ctx);
    const rec: Record<ProviderId, ProviderResult> = {};
    for (const r of providers) rec[r.provider] = r;
    const now = ctx.now();
    const entry: Entry = { v: 1, fetchedAt: now, providers: rec };
    if (manual) entry.lastManualRefresh = now;
    else if (prev?.lastManualRefresh !== undefined) entry.lastManualRefresh = prev.lastManualRefresh;
    memory.set(login, entry);
    await persist(login, entry);
    return { entry, fetched: true };
  })().finally(() => {
    inflight.delete(login);
  });
  inflight.set(login, p);
  return p;
}

// Cache first; one fetchAll when the entry is missing or older than an hour.
export async function getCommands(login: string, ctx: AdapterContext): Promise<ChannelCommands> {
  const key = login.toLowerCase();
  const cached = await loadEntry(key);
  if (cached && isFresh(cached, ctx.now())) return toChannel(key, cached, true);
  const { entry, fetched } = await startFetch(key, ctx, false);
  return toChannel(key, entry, !fetched);
}

// Bypasses the TTL (not the in-flight dedupe). The 60 s throttle is refreshThrottled below.
export async function refresh(login: string, ctx: AdapterContext): Promise<ChannelCommands> {
  const key = login.toLowerCase();
  const { entry, fetched } = await startFetch(key, ctx, true);
  return toChannel(key, entry, !fetched);
}

// Manual refresh with the throttle of docs/SPEC.md section 4: one per login per 60 s, tracked in the
// entry's lastManualRefresh so it survives the background worker unloading. When throttled, returns
// the cached value with refreshed:false and fetches nothing.
export async function refreshThrottled(
  login: string,
  ctx: AdapterContext,
): Promise<{ data: ChannelCommands; refreshed: boolean }> {
  const key = login.toLowerCase();
  const prev = await loadEntry(key);
  if (prev?.lastManualRefresh !== undefined) {
    const since = ctx.now() - prev.lastManualRefresh;
    if (since >= 0 && since < REFRESH_THROTTLE_MS) return { data: toChannel(key, prev, true), refreshed: false };
  }
  return { data: await refresh(key, ctx), refreshed: true };
}

// Cache only, never fetches; an empty ChannelCommands (providers: []) when nothing is cached. A stale
// entry is still returned so the action page can show its age.
export async function peek(login: string): Promise<ChannelCommands> {
  const key = login.toLowerCase();
  const entry = await loadEntry(key);
  return entry ? toChannel(key, entry, true) : empty(key);
}
